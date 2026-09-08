import { Router } from 'express';
import multer from 'multer';
import { requiereRolCliente } from '../middleware/requiereRolCliente.js';
import { supabase } from '../db/connection.js';
import { exigeVisible } from '../utils/visibilidadPrestadora.js';
import { exigeDePersonasAutorizadas } from '../utils/accesosDePersonasAutorizadas.js';
import { extensionDeArchivo } from '../utils/archivosSubidos.js';

// Cierra pendiente #62 (docs/PENDIENTES.md): el Cliente solicita la indicación de
// medicación desde su propia PWA (consentimiento implícito por venir de su sesión
// autenticada + timestamp) — el Panel decide aceptar/rechazar (panelMedicacion.js). Sin
// esto, la indicación queda en 'pendiente' y no llega a las órdenes del Asistente.

export const appClientesMedicacionRouter = Router();

const BUCKET = 'prescripciones-medicacion';
const TIPOS_PERMITIDOS = ['application/pdf', 'image/jpeg', 'image/png'];
const TAMANO_MAXIMO = 10 * 1024 * 1024; // 10 MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TAMANO_MAXIMO },
  fileFilter(req, file, cb) {
    cb(null, TIPOS_PERMITIDOS.includes(file.mimetype));
  },
});

function manejarErrorMulter(err, req, res, next) {
  if (err) {
    return res.status(400).json({ error: 'Archivo no permitido (solo PDF, JPG o PNG, hasta 10 MB)' });
  }
  next();
}

async function pacienteDeLaCliente(pacienteId, usuarioCliente) {
  const { data } = await supabase
    .from('pacientes')
    .select('id, prestadora_id, cliente_id')
    .eq('id', pacienteId)
    .eq('cliente_id', usuarioCliente.clienteId)
    .eq('prestadora_id', usuarioCliente.prestadoraId)
    .maybeSingle();
  return data;
}

// Ver la medicación y pedir una son dos decisiones distintas de la Prestadora: hay quien
// muestra la lista pero no deja que el Cliente cargue nada. Y adentro de cada una hay una segunda
// decisión, la del titular sobre cada persona de su personas autorizadas. Van en este orden: primero si la
// función existe en esta aplicación, después si a esta persona se la dieron.
appClientesMedicacionRouter.get('/:pacienteId', requiereRolCliente, exigeVisible('cliente_medicacion_del_paciente'), exigeDePersonasAutorizadas('persona_autorizada_medicacion'), async (req, res) => {
  const paciente = await pacienteDeLaCliente(req.params.pacienteId, req.usuarioCliente);
  if (!paciente) {
    return res.status(404).json({ error: 'Paciente no encontrado' });
  }

  const { data, error } = await supabase
    .from('indicaciones_medicacion')
    .select('id, medicamento, dosis, frecuencia, via_administracion, fecha_desde, fecha_hasta, estado, motivo_rechazo, created_at')
    .eq('paciente_id', paciente.id)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });

  res.json({ indicaciones: data });
});

appClientesMedicacionRouter.post(
  '/:pacienteId',
  requiereRolCliente,
  exigeVisible('cliente_pide_medicacion'),
  // Mismo criterio que calificar una guardia (appClientes.js): cargar una indicación de
  // medicación viene negada de fábrica para las personas autorizadas, y sólo la habilita una instrucción
  // firmada por el titular. El corte va antes de recibir el archivo: no tiene sentido subir una
  // prescripción para después contestar que no.
  exigeDePersonasAutorizadas('persona_autorizada_pide_medicacion'),
  upload.single('prescripcion'),
  manejarErrorMulter,
  async (req, res) => {
    const paciente = await pacienteDeLaCliente(req.params.pacienteId, req.usuarioCliente);
    if (!paciente) {
      return res.status(404).json({ error: 'Paciente no encontrado' });
    }

    const { medicamento, dosis, frecuencia, via_administracion: via, fecha_desde: fechaDesde, fecha_hasta: fechaHasta } = req.body || {};
    if (!medicamento || !dosis || !frecuencia || !via || !fechaDesde) {
      return res.status(400).json({ error: 'Faltan datos obligatorios de la indicación' });
    }

    let prescripcionArchivoUrl = null;
    if (req.file) {
      const extension = extensionDeArchivo(req.file.mimetype);
      const ruta = `${paciente.prestadora_id}/${paciente.id}/prescripcion-${Date.now()}.${extension}`;
      const { error: errorUpload } = await supabase.storage
        .from(BUCKET)
        .upload(ruta, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
      if (errorUpload) return res.status(500).json({ error: errorUpload.message });
      prescripcionArchivoUrl = ruta;
    }

    const { data, error } = await supabase
      .from('indicaciones_medicacion')
      .insert({
        prestadora_id: paciente.prestadora_id,
        paciente_id: paciente.id,
        cliente_id: paciente.cliente_id,
        medicamento,
        dosis,
        frecuencia,
        via_administracion: via,
        prescripcion_archivo_url: prescripcionArchivoUrl,
        fecha_desde: fechaDesde,
        fecha_hasta: fechaHasta || null,
        solicitado_por: req.usuarioCliente.id,
      })
      .select('id, estado')
      .single();
    if (error) return res.status(500).json({ error: error.message });

    res.json({ indicacion: data });
  }
);
