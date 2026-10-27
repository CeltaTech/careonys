import { Router } from 'express';
import multer from 'multer';
import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import { exigirOrganizacionActiva } from '../middleware/alcancePrestadora.js';
import { clienteDelPedido } from '../db/connection.js';
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

// Con la credencial de quien pide: la base y el depósito deciden. Subir el archivo lo deja
// `autorizaciones_monitoreo_las_gestiona_quien_administra`, la misma administración que después
// guarda la fila de la autorización; leerlo, el personal de la Prestadora. El Paciente que espera
// conformidad no se encuentra.
async function pacienteVisible(db, pacienteId) {
  const { data } = await db.from('pacientes').select('id, prestadora_id').eq('id', pacienteId).maybeSingle();
  return data;
}

// Solo sube el archivo y devuelve la ruta de storage — el registro en
// autorizaciones_monitoreo_paciente (nombre de quien avala, rol, tipo de firma, fecha) lo
// inserta el Panel directamente vía supabase-js (RLS ya lo permite a admin_prestadora,
// mismo criterio que el resto de la historia clínica del Paciente). Acá solo se resuelve el archivo.
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

    const db = clienteDelPedido(req);
    const paciente = await pacienteVisible(db, req.params.pacienteId);
    if (!paciente) {
      return res.status(404).json({ error: 'Paciente no encontrado' });
    }

    const extension = extensionDeArchivo(req.file.mimetype);
    const ruta = `${paciente.prestadora_id}/${paciente.id}/autorizacion-${Date.now()}.${extension}`;

    // Cada subida es un archivo nuevo, nunca el reemplazo de uno anterior.
    const { error } = await db.storage
      .from(BUCKET)
      .upload(ruta, req.file.buffer, { contentType: req.file.mimetype, upsert: false });
    if (error) {
      return responderError(res, error, String(error.statusCode) === '403' ? 403 : 500);
    }

    res.json({ archivoUrl: ruta });
  }
);

panelVitalesAutorizacionRouter.get('/:pacienteId/archivo-url', requiereRolPanel, exigirOrganizacionActiva, async (req, res) => {
  const ruta = req.query.ruta;
  if (!ruta) {
    return res.status(400).json({ error: 'Ruta de archivo inválida' });
  }

  // El depósito sólo da el enlace de un archivo de la Prestadora de quien pide.
  const { data, error } = await clienteDelPedido(req).storage.from(BUCKET).createSignedUrl(ruta, 60);
  if (error) {
    return responderError(res, error, 404);
  }

  res.json({ url: data.signedUrl });
});
