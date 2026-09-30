import { Router } from 'express';
import multer from 'multer';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import { acotarAPrestadora, exigirOrganizacionActiva } from '../middleware/alcancePrestadora.js';
import { supabase } from '../db/connection.js';
import { extensionDeArchivo } from '../utils/archivosSubidos.js';
import { responderError } from '../utils/errorConMotivo.js';
import { cubrirGuardiaConSustituto } from '../utils/cubrirGuardia.js';
import { estrenarCobertura, hastaDondeCubrir } from '../utils/coberturaDeAusencia.js';
import { hoyISO } from '../utils/horarios.js';

// CON LA LLAVE MAESTRA, TODAVÍA. La ausencia, el depósito y el enlace temporal van con la llave
// maestra, después de comprobar que la ausencia es de la Prestadora de quien pide. En la base, la
// política `coordinador_gestiona_ausencias_de_su_zona` le deja a quien coordina sólo las ausencias
// de los Asistentes de su zona, y la del depósito (`certificados_los_alcanza_quien_ve_la_ausencia`)
// pide una ausencia que quien pide vea; esta ruta le mostraba a quien coordina todas las de la
// Prestadora. Si eso se estrecha se decide aparte.

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

async function ausenciaDeLaPrestadora(ausenciaId, usuarioPanel) {
  // Con la llave maestra: la política `coordinador_gestiona_ausencias_de_su_zona` le deja a quien
  // coordina sólo las ausencias de su zona (`coordinador_alcanza_asistente`), y esta ruta le
  // alcanzaba todas las de la Prestadora. Se decide aparte.
  let query = supabase.from('ausencias').select('id, prestadora_id, asistente_id').eq('id', ausenciaId);
  query = acotarAPrestadora(query, usuarioPanel);
  const { data } = await query.maybeSingle();
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

    const ausencia = await ausenciaDeLaPrestadora(req.params.id, req.usuarioPanel);
    if (!ausencia) {
      return res.status(404).json({ error: 'Ausencia no encontrada' });
    }

    const extension = extensionDeArchivo(req.file.mimetype);
    const ruta = `${ausencia.prestadora_id}/${ausencia.id}/certificado.${extension}`;

    // Con la llave maestra: la política del depósito `certificados_los_alcanza_quien_ve_la_ausencia`
    // pide una ausencia que quien pide vea, y a quien coordina sólo le deja las de su zona. Se
    // decide aparte. La ruta empieza por la Prestadora de la ausencia, ya comprobada.
    const { error: errorSubida } = await supabase.storage
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
      // El mirror a R2 es un resguardo adicional (docs/PLAN_CONTINUIDAD_PROVEEDORES.md
      // punto 1) — no bloquea la operación principal si falla, pero queda logueado sin
      // exponer el contenido del archivo (Regla 7).
      console.error('Error al espejar certificado médico a R2:', errorMirror.message);
    }

    // El archivo ya está subido: lo único que falta es que la ausencia lo apunte. Si esa fila ya
    // no está, el certificado queda arriba sin dueño y nadie lo va a encontrar nunca — así que
    // eso se dice, no se contesta que salió todo bien.
    // Con la llave maestra: por `coordinador_gestiona_ausencias_de_su_zona` quien coordina sólo
    // escribe las ausencias de su zona. Se decide aparte.
    let apuntar = supabase
      .from('ausencias')
      .update({ certificado_url: ruta })
      .eq('id', ausencia.id);
    apuntar = acotarAPrestadora(apuntar, req.usuarioPanel);
    const { data: apuntada, error: errorUpdate } = await apuntar.select('id');
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
  const ausencia = await ausenciaDeLaPrestadora(req.params.id, req.usuarioPanel);
  if (!ausencia) {
    return res.status(404).json({ error: 'Ausencia no encontrada' });
  }

  // Con la llave maestra, por la misma política `coordinador_gestiona_ausencias_de_su_zona`. Se
  // decide aparte.
  let consultaCertificado = supabase.from('ausencias').select('certificado_url').eq('id', ausencia.id);
  consultaCertificado = acotarAPrestadora(consultaCertificado, req.usuarioPanel);
  const { data: fila } = await consultaCertificado.single();
  if (!fila?.certificado_url) {
    return res.status(404).json({ error: 'Esta ausencia no tiene certificado cargado' });
  }

  // Con la llave maestra, por la política del depósito
  // `certificados_los_alcanza_quien_ve_la_ausencia`. Se decide aparte.
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(fila.certificado_url, 60);
  if (error) {
    return responderError(res, error);
  }

  res.json({ url: data.signedUrl });
});

/* Cubrir la ausencia de un Asistente por turno fijo.
   --------------------------------------------------
   Quien coordina elige un sustituto y, si quiere, uno solo de los turnos fijos del ausente. Por
   cada turno fijo que tenga guardias en la ausencia queda anotada una cobertura, que se aplica
   ahora y que el trabajo programado va corriendo si la ausencia se estira o se acorta
   (`utils/coberturaDeAusencia.js`). Las guardias sueltas, que no son de ningún turno fijo, se
   cubren una por una como siempre.

   Un turno fijo que ya tiene sustituto vigente no se vuelve a cubrir: apretar dos veces no duplica
   nada.

   Con la llave maestra, igual que el resto de esta ruta y que `POST /guardias/:id/cubrir`: la
   ausencia se busca acotada a la Prestadora de quien pide, y el sustituto se comprueba contra esa
   misma Prestadora antes de escribir nada.

   Contesta las guardias que quedaron cubiertas, para que el Panel avise el cambio a quien
   corresponda. */
panelAusenciasRouter.post('/:id/cobertura', requiereRolPanel, exigirOrganizacionActiva, async (req, res) => {
  const {
    asistente_sustituto_id: asistenteSustitutoId,
    serie_id: serieElegida = null,
    motivo = null,
    motivo_detalle: motivoDetalle = null,
    costo_adicional: costoAdicional = null,
  } = req.body ?? {};
  if (!asistenteSustitutoId) return res.status(400).json({ error: 'Falta el Asistente que cubre' });

  let consulta = supabase
    .from('ausencias')
    .select('id, prestadora_id, asistente_id, fecha_inicio, fecha_fin, fecha_vuelta_real')
    .eq('id', req.params.id);
  consulta = acotarAPrestadora(consulta, req.usuarioPanel);
  const { data: ausencia, error } = await consulta.maybeSingle();
  if (error) return responderError(res, error);
  if (!ausencia?.asistente_id) return res.status(404).json({ error: 'Ausencia no encontrada' });
  if (ausencia.asistente_id === asistenteSustitutoId) {
    return res.status(400).json({ error: 'El sustituto no puede ser el mismo Asistente ausente' });
  }

  const { data: sustituto } = await supabase
    .from('asistentes')
    .select('id')
    .eq('id', asistenteSustitutoId)
    .eq('prestadora_id', ausencia.prestadora_id)
    .maybeSingle();
  if (!sustituto) return res.status(404).json({ error: 'No se encontró ese Asistente' });

  const hoy = hoyISO();
  const desde = ausencia.fecha_inicio > hoy ? ausencia.fecha_inicio : hoy;
  const hasta = hastaDondeCubrir(ausencia, hoy);
  if (desde > hasta) return res.json({ guardia_ids: [] });

  let consultaGuardias = supabase
    .from('guardias')
    .select('id, prestadora_id, asistente_id, serie_id')
    .eq('prestadora_id', ausencia.prestadora_id)
    .eq('asistente_id', ausencia.asistente_id)
    .eq('estado', 'programada')
    .gte('fecha', desde)
    .lte('fecha', hasta);
  if (serieElegida) consultaGuardias = consultaGuardias.eq('serie_id', serieElegida);
  const { data: guardias, error: errorGuardias } = await consultaGuardias;
  if (errorGuardias) return responderError(res, errorGuardias);

  const { data: vigentes, error: errorVigentes } = await supabase
    .from('coberturas_de_ausencia')
    .select('serie_id')
    .eq('prestadora_id', ausencia.prestadora_id)
    .eq('ausencia_id', ausencia.id)
    .is('objetada_at', null);
  if (errorVigentes) return responderError(res, errorVigentes);
  const yaCubiertas = new Set((vigentes ?? []).map((c) => c.serie_id));

  const series = [...new Set((guardias ?? []).map((g) => g.serie_id).filter((s) => s && !yaCubiertas.has(s)))];
  const sueltas = (guardias ?? []).filter((g) => !g.serie_id);
  const cubiertas = [];

  for (const serieId of series) {
    const { data: cobertura, error: errorAlta } = await supabase
      .from('coberturas_de_ausencia')
      .insert({
        prestadora_id: ausencia.prestadora_id,
        ausencia_id: ausencia.id,
        serie_id: serieId,
        asistente_sustituto_id: asistenteSustitutoId,
        motivo,
        motivo_detalle: motivoDetalle,
        costo_adicional: costoAdicional,
        asignada_por: req.usuarioPanel.id,
      })
      .select('id, prestadora_id, serie_id, asistente_sustituto_id, motivo, motivo_detalle, costo_adicional')
      .single();
    if (errorAlta) return responderError(res, errorAlta);
    const resultado = await estrenarCobertura({ db: supabase, cobertura, ausencia });
    cubiertas.push(...resultado.cubiertas);
  }

  for (const guardia of sueltas) {
    const resultado = await cubrirGuardiaConSustituto({
      db: supabase,
      guardia,
      asistenteSustitutoId,
      ausenciaId: ausencia.id,
      motivo,
      motivoDetalle,
      costoAdicional,
    });
    if (!resultado.ok) return res.status(500).json({ error: resultado.motivo });
    cubiertas.push(guardia.id);
  }

  res.json({ guardia_ids: cubiertas });
});
