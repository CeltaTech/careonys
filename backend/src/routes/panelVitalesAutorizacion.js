import { Router } from 'express';
import multer from 'multer';
import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import { acotarAPrestadora, exigirOrganizacionActiva } from '../middleware/alcancePrestadora.js';
import { enLaPrestadora } from '../db/connection.js';
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

// Con la credencial del trabajo de la Prestadora activa, que sólo alcanza lo de ella. No con la
// de quien pide, porque la base es más estrecha que lo que la ruta hace:
// - `pacientes` lleva la política restrictiva `oculta_pendientes_de_conformidad`; eso no cambia
//   nada acá, porque el Panel nunca muestra un Paciente que espera conformidad.
// - El depósito sólo deja subir con `autorizaciones_monitoreo_las_gestiona_quien_administra`, que
//   pide `es_admin_prestadora()` o `es_superadmin()`: el coordinador, que también sube la
//   autorización, dejaría de poder.
// Por eso también se conserva la comparación de la ruta del archivo con la del Paciente.
function conElTrabajo(req, hacer) {
  return enLaPrestadora(req.usuarioPanel.prestadoraId, 'autorización de monitoreo de vitales', hacer);
}

async function pacienteDeLaPrestadora(req) {
  const { data } = await conElTrabajo(req, (db) =>
    acotarAPrestadora(db.from('pacientes').select('id, prestadora_id').eq('id', req.params.pacienteId), req.usuarioPanel)
      .maybeSingle());
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

    const paciente = await pacienteDeLaPrestadora(req);
    if (!paciente) {
      return res.status(404).json({ error: 'Paciente no encontrado' });
    }

    const extension = extensionDeArchivo(req.file.mimetype);
    const ruta = `${paciente.prestadora_id}/${paciente.id}/autorizacion-${Date.now()}.${extension}`;

    // Cada subida es un archivo nuevo: el trabajo puede subir y leer, no reemplazar.
    const { error } = await conElTrabajo(req, (db) => db.storage
      .from(BUCKET)
      .upload(ruta, req.file.buffer, { contentType: req.file.mimetype, upsert: false }));
    if (error) {
      return responderError(res, error);
    }

    res.json({ archivoUrl: ruta });
  }
);

panelVitalesAutorizacionRouter.get('/:pacienteId/archivo-url', requiereRolPanel, exigirOrganizacionActiva, async (req, res) => {
  const paciente = await pacienteDeLaPrestadora(req);
  if (!paciente) {
    return res.status(404).json({ error: 'Paciente no encontrado' });
  }

  const ruta = req.query.ruta;
  if (!ruta || !ruta.startsWith(`${paciente.prestadora_id}/${paciente.id}/`)) {
    return res.status(400).json({ error: 'Ruta de archivo inválida' });
  }

  const { data, error } = await conElTrabajo(req, (db) => db.storage.from(BUCKET).createSignedUrl(ruta, 60));
  if (error) {
    return responderError(res, error);
  }

  res.json({ url: data.signedUrl });
});
