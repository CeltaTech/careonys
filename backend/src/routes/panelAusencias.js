import { Router } from 'express';
import multer from 'multer';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import { exigirOrganizacionActiva } from '../middleware/alcancePrestadora.js';
import { enLaPrestadora, clienteDelPedido } from '../db/connection.js';
import { extensionDeArchivo } from '../utils/archivosSubidos.js';
import { responderError } from '../utils/errorConMotivo.js';
import { hastaDondeCubrir } from '../utils/coberturaDeAusencia.js';
import { avisarAsignacionDeAusencia } from '../utils/avisoAsignacionDeTurno.js';
import { hoyISO } from '../utils/horarios.js';

// CON LA CREDENCIAL DE QUIEN PIDE. La base decide qué ausencias alcanza: el Administrador, todas
// las de su Prestadora; quien coordina, las de los Asistentes de su zona
// (`coordinador_gestiona_ausencias_de_su_zona`). El depósito pide una ausencia que quien pide vea
// (`certificados_los_alcanza_quien_ve_la_ausencia`). Una ausencia que la base no devuelve se
// contesta como inexistente.

export const panelAusenciasRouter = Router();

const BUCKET = 'certificados-medicos';
const TIPOS_PERMITIDOS = ['application/pdf', 'image/jpeg', 'image/png'];
const TAMANO_MAXIMO = 10 * 1024 * 1024; // 10 MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TAMANO_MAXIMO },
  fileFilter(req, file, cb) {
    cb(null, TIPOS_PERMITIDOS.includes(file.mimetype));
  },
});

function clienteR2() {
  return new S3Client({
    endpoint: process.env.R2_ENDPOINT,
    region: 'auto',
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
}

async function ausenciaVisible(db, ausenciaId) {
  const { data } = await db
    .from('ausencias')
    .select('id, prestadora_id, asistente_id, certificado_url')
    .eq('id', ausenciaId)
    .maybeSingle();
  return data;
}

function manejarErrorMulter(err, req, res, next) {
  if (err) {
    return res.status(400).json({ error: 'Archivo no permitido (solo PDF, JPG o PNG, hasta 10 MB)' });
  }
  next();
}

panelAusenciasRouter.post(
  '/:id/certificado',
  requiereRolPanel,
  exigirOrganizacionActiva,
  upload.single('archivo'),
  manejarErrorMulter,
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'Archivo faltante o de tipo no permitido (solo PDF, JPG o PNG, hasta 10 MB)' });
    }

    const db = clienteDelPedido(req);
    const ausencia = await ausenciaVisible(db, req.params.id);
    if (!ausencia) {
      return res.status(404).json({ error: 'Ausencia no encontrada' });
    }

    const extension = extensionDeArchivo(req.file.mimetype);
    const ruta = `${ausencia.prestadora_id}/${ausencia.id}/certificado.${extension}`;

    const { error: errorSubida } = await db.storage
      .from(BUCKET)
      .upload(ruta, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
    if (errorSubida) {
      return responderError(res, errorSubida);
    }

    try {
      await clienteR2().send(new PutObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: `certificados-medicos-mirror/${ruta}`,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
      }));
    } catch (errorMirror) {
      // El mirror a R2 es un resguardo adicional del certificado — no bloquea la operación
      // principal si falla, pero queda logueado sin exponer el contenido del archivo
      // («Nunca información sensible en registros», celtatech/CLAUDE.md).
      console.error('Error al espejar certificado médico a R2:', errorMirror.message);
    }

    // El archivo ya está subido: lo único que falta es que la ausencia lo apunte. Si esa fila ya
    // no está, el certificado queda arriba sin dueño y nadie lo va a encontrar nunca — así que
    // eso se dice, no se contesta que salió todo bien.
    const { data: apuntada, error: errorUpdate } = await db
      .from('ausencias')
      .update({ certificado_url: ruta })
      .eq('id', ausencia.id)
      .select('id');
    if (errorUpdate) {
      return responderError(res, errorUpdate);
    }
    if (!apuntada?.length) {
      return res.status(404).json({ error: 'No se encontró esa ausencia' });
    }

    res.json({ ok: true });
  },
);

panelAusenciasRouter.get('/:id/certificado-url', requiereRolPanel, exigirOrganizacionActiva, async (req, res) => {
  const db = clienteDelPedido(req);
  const ausencia = await ausenciaVisible(db, req.params.id);
  if (!ausencia) {
    return res.status(404).json({ error: 'Ausencia no encontrada' });
  }
  if (!ausencia.certificado_url) {
    return res.status(404).json({ error: 'Esta ausencia no tiene certificado cargado' });
  }

  const { data, error } = await db.storage
    .from(BUCKET)
    .createSignedUrl(ausencia.certificado_url, 60);
  if (error) {
    return responderError(res, error);
  }

  res.json({ url: data.signedUrl });
});

/* Cubrir la ausencia de un Asistente.
   -----------------------------------
   Quien coordina elige un sustituto y, si quiere, uno solo de los turnos fijos del ausente. Por
   cada turno fijo que tenga guardias en la ausencia queda anotada una cobertura, y otra más, sin
   turno fijo, para las guardias sueltas.

   El reemplazo se le asigna al sustituto como un turno: le llega un aviso y lo acepta o lo rechaza
   una sola vez, por todos los días. Hasta que responde, las guardias siguen del titular. Al
   aceptar se aplican las coberturas, y el trabajo programado las va corriendo si la ausencia se
   estira o se acorta (`utils/coberturaDeAusencia.js`).

   Lo que ya tiene sustituto vigente no se vuelve a cubrir: apretar dos veces no duplica nada.

   Con la credencial de quien pide, salvo la asignación al sustituto. La política
   `coordinador_gestiona_asignaciones_de_su_zona` le deja a quien coordina asignarle sólo a un
   Asistente de su zona, y el padrón entero lo ve (`coordinador_lee_el_padron_de_asistentes`):
   hoy elige sustituto entre todos. Hasta que se decida si puede elegir uno de otra zona, la
   asignación y su aviso van con la llave maestra, después de que la base le dejó ver la ausencia
   y el sustituto.

   Contesta las guardias que quedaron cubiertas, que hasta que el sustituto acepte son ninguna. */
panelAusenciasRouter.post('/:id/cobertura', requiereRolPanel, exigirOrganizacionActiva, async (req, res) => {
  const {
    asistente_sustituto_id: asistenteSustitutoId,
    serie_id: serieElegida = null,
    motivo = null,
    motivo_detalle: motivoDetalle = null,
    costo_adicional: costoAdicional = null,
  } = req.body ?? {};
  if (!asistenteSustitutoId) return res.status(400).json({ error: 'Falta el Asistente que cubre' });

  const db = clienteDelPedido(req);
  const { data: ausencia, error } = await db
    .from('ausencias')
    .select('id, prestadora_id, asistente_id, fecha_inicio, fecha_fin, fecha_vuelta_real')
    .eq('id', req.params.id)
    .maybeSingle();
  if (error) return responderError(res, error);
  if (!ausencia?.asistente_id) return res.status(404).json({ error: 'Ausencia no encontrada' });
  if (ausencia.asistente_id === asistenteSustitutoId) {
    return res.status(400).json({ error: 'El sustituto no puede ser el mismo Asistente ausente' });
  }

  const { data: sustituto } = await db
    .from('asistentes')
    .select('id')
    .eq('id', asistenteSustitutoId)
    .eq('prestadora_id', ausencia.prestadora_id)
    // Uno con la cuenta desactivada se contesta como inexistente.
    .eq('cuenta_desactivada', false)
    .maybeSingle();
  if (!sustituto) return res.status(404).json({ error: 'No se encontró ese Asistente' });

  const hoy = hoyISO();
  const desde = ausencia.fecha_inicio > hoy ? ausencia.fecha_inicio : hoy;
  const hasta = hastaDondeCubrir(ausencia, hoy);
  if (desde > hasta) return res.json({ guardia_ids: [] });

  let consultaGuardias = db
    .from('guardias')
    .select('id, serie_id')
    .eq('prestadora_id', ausencia.prestadora_id)
    .eq('asistente_id', ausencia.asistente_id)
    .eq('estado', 'programada')
    .gte('fecha', desde)
    .lte('fecha', hasta);
  if (serieElegida) consultaGuardias = consultaGuardias.eq('serie_id', serieElegida);
  const { data: guardias, error: errorGuardias } = await consultaGuardias;
  if (errorGuardias) return responderError(res, errorGuardias);

  const { data: vigentes, error: errorVigentes } = await db
    .from('coberturas_de_ausencia')
    .select('serie_id')
    .eq('prestadora_id', ausencia.prestadora_id)
    .eq('ausencia_id', ausencia.id)
    .is('objetada_at', null);
  if (errorVigentes) return responderError(res, errorVigentes);
  const yaCubiertas = new Set((vigentes ?? []).map((c) => c.serie_id));

  // Una cobertura por turno fijo, y la de las sueltas con la serie vacía.
  const aCubrir = [...new Set((guardias ?? []).map((g) => g.serie_id ?? null))].filter((s) => !yaCubiertas.has(s));
  if (!aCubrir.length) return res.json({ guardia_ids: [] });

  const { error: errorAlta } = await db.from('coberturas_de_ausencia').insert(
    aCubrir.map((serieId) => ({
      prestadora_id: ausencia.prestadora_id,
      ausencia_id: ausencia.id,
      serie_id: serieId,
      asistente_sustituto_id: asistenteSustitutoId,
      motivo,
      motivo_detalle: motivoDetalle,
      costo_adicional: costoAdicional,
      asignada_por: req.usuarioPanel.id,
    })),
  );
  if (errorAlta) return responderError(res, errorAlta);

  // Una sola asignación por sustituto y ausencia: si ya tenía una esperando respuesta, las
  // coberturas nuevas entran en esa y no se le vuelve a avisar. Con el trabajo de la Prestadora,
  // porque la base no le da a quien coordina permiso de alta en `asignaciones_de_turno`; la
  // ausencia ya la dejó ver la credencial de quien pide, y la Prestadora es la de esa ausencia.
  try {
    const error = await enLaPrestadora(ausencia.prestadora_id, 'asignación del sustituto', async (dbTrabajo) => {
      const { data: pendiente, error: errorPendiente } = await dbTrabajo
        .from('asignaciones_de_turno')
        .select('id')
        .eq('prestadora_id', ausencia.prestadora_id)
        .eq('ausencia_id', ausencia.id)
        .eq('asistente_id', asistenteSustitutoId)
        .eq('estado', 'sin_responder')
        .maybeSingle();
      if (errorPendiente) return errorPendiente;
      if (pendiente) return null;

      const { error: errorAsignacion } = await dbTrabajo.from('asignaciones_de_turno').insert({
        prestadora_id: ausencia.prestadora_id,
        ausencia_id: ausencia.id,
        asistente_id: asistenteSustitutoId,
        asignado_por: req.usuarioPanel.id,
      });
      if (errorAsignacion) return errorAsignacion;

      await avisarAsignacionDeAusencia(dbTrabajo, {
        prestadoraId: ausencia.prestadora_id,
        asistenteId: asistenteSustitutoId,
        desde,
        hasta: ausencia.fecha_fin,
      });
      return null;
    });
    if (error) return responderError(res, error);
  } catch (e) {
    return responderError(res, e);
  }

  res.json({ guardia_ids: [] });
});
