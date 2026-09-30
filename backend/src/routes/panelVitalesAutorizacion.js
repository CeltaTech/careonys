import { Router } from 'express';
import multer from 'multer';
import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import { acotarAPrestadora, exigirOrganizacionActiva } from '../middleware/alcancePrestadora.js';
import { supabase } from '../db/connection.js';
import { extensionDeArchivo } from '../utils/archivosSubidos.js';
import { responderError } from '../utils/errorConMotivo.js';

export const panelVitalesAutorizacionRouter = Router();

const BUCKET = 'autorizaciones-monitoreo';
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

// CON LA LLAVE MAESTRA, Y FILTRADO A MANO POR LA PRESTADORA. Esta ruta no pasa todavía a la
// credencial de quien pide porque la base es más estrecha que lo que la ruta hace hoy, y cambiar
// qué puede hacer cada rol se decide aparte:
// - `pacientes` lleva la política restrictiva `oculta_pendientes_de_conformidad`, que esconde a
//   todos los roles el Paciente importado que espera conformidad; con la credencial de la persona
//   ese Paciente daría «no encontrado».
// - El depósito sólo deja subir con `autorizaciones_monitoreo_las_gestiona_quien_administra`, que
//   pide `es_admin_prestadora()` o `es_superadmin()`: el coordinador, que hoy sube la
//   autorización, dejaría de poder.
// Por eso también se conserva la comparación de la ruta del archivo con la del Paciente.
async function pacienteDeLaPrestadora(pacienteId, usuarioPanel) {
  let query = supabase.from('pacientes').select('id, prestadora_id').eq('id', pacienteId);
  query = acotarAPrestadora(query, usuarioPanel);
  const { data } = await query.maybeSingle();
  return data;
}

// Solo sube el archivo y devuelve la ruta de storage — el registro en
// autorizaciones_monitoreo_paciente (nombre de quien avala, rol, tipo de firma, fecha) lo
// inserta el Panel directamente vía supabase-js (RLS ya lo permite a admin_prestadora,
// mismo criterio que el resto de la ficha del Paciente). Acá solo se resuelve el archivo.
panelVitalesAutorizacionRouter.post(
  '/:pacienteId/archivo',
  requiereRolPanel,
  exigirOrganizacionActiva,
  upload.single('archivo'),
  manejarErrorMulter,
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'Archivo faltante o de tipo no permitido (solo PDF, JPG o PNG, hasta 10 MB)' });
    }

    const paciente = await pacienteDeLaPrestadora(req.params.pacienteId, req.usuarioPanel);
    if (!paciente) {
      return res.status(404).json({ error: 'Paciente no encontrado' });
    }

    const extension = extensionDeArchivo(req.file.mimetype);
    const ruta = `${paciente.prestadora_id}/${paciente.id}/autorizacion-${Date.now()}.${extension}`;

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(ruta, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
    if (error) {
      return responderError(res, error);
    }

    res.json({ archivoUrl: ruta });
  }
);

panelVitalesAutorizacionRouter.get('/:pacienteId/archivo-url', requiereRolPanel, exigirOrganizacionActiva, async (req, res) => {
  const paciente = await pacienteDeLaPrestadora(req.params.pacienteId, req.usuarioPanel);
  if (!paciente) {
    return res.status(404).json({ error: 'Paciente no encontrado' });
  }

  const ruta = req.query.ruta;
  if (!ruta || !ruta.startsWith(`${paciente.prestadora_id}/${paciente.id}/`)) {
    return res.status(400).json({ error: 'Ruta de archivo inválida' });
  }

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(ruta, 60);
  if (error) {
    return responderError(res, error);
  }

  res.json({ url: data.signedUrl });
});
