import { Router } from 'express';
import multer from 'multer';
import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import { clienteDelPedido, supabase } from '../db/connection.js';
import { laViaBloquea, laViaFrenteALosAsignados } from '../utils/medicacionIndicaciones.js';
import { extensionDeArchivo, rutaDeMatriculaNueva, rutaDelPapelFirmado } from '../utils/archivosSubidos.js';
import { ErrorConMotivo, responderError } from '../utils/errorConMotivo.js';
import { anotarConsultaAHce, origenDelPedido } from '../utils/registroDeConsultas.js';
import { FICHA_NOMBRE, conSuFicha } from '../utils/fichaDelPaciente.js';
import { pideLaFirma } from '../utils/consentimientoMedicacion.js';

// La bandeja de las indicaciones de medicación que carga el Cliente (appClientesMedicacion.js).
//
// LA VÍA. Si el Paciente tiene Asistentes asignados y ninguno puede dar esa vía, la indicación
// sólo se puede rechazar, con el motivo fijo `ningun_asignado_puede_dar_la_via`. Sin nadie
// asignado se acepta igual. Qué vía puede dar cada tipo de Asistente sale de sus prohibiciones
// (utils/medicacionIndicaciones.js), y se vuelve a calcular al aceptar: lo que diga el navegador
// no cuenta.
//
// LA FIRMA. Si la Prestadora la pide, una indicación sin firma cerrada no se acepta. La que el
// Cliente eligió firmar en papel se imprime desde acá, y al subir el papel firmado queda cerrada.
// La base lo exige igual: el disparador que acepta la indicación se niega sin firma.
//
// matriculas_asistente no tiene rutas CRUD
// acá: el Panel la gestiona directo vía supabase-js bajo RLS (mismo criterio que
// autorizaciones_monitoreo_paciente/rangos_referencia_vitales — RLS ya lo permite a
// admin_prestadora). Esta ruta solo resuelve el archivo de evidencia de matrícula.
//
// CON LA CREDENCIAL DE QUIEN PIDE. El enlace temporal al archivo se pide a la base con
// `clienteDelPedido(req)`, no con la llave maestra: el depósito sólo da enlaces a archivos cuya
// ruta empieza por la Prestadora de quien pide, así que no hace falta comparar la ruta a mano. La bandeja
// es información de salud: antes de entregarla queda anotado, con esa misma credencial, quién la
// vio, paciente por paciente.
//
// SIGUEN CON LA LLAVE MAESTRA, con la Prestadora de la sesión escrita en cada consulta:
// - Leer la bandeja: la base se la acota más que lo que la pantalla mostraba (ver el comentario
//   de la consulta).
// - Aceptar y rechazar: la base deja modificar una indicación sólo a la administración, y acá
//   también la revisa el Coordinador (`indicaciones_medicacion`, modificar).
// - Subir el archivo de matrícula y el papel firmado: el depósito no le deja escribir al
//   Coordinador (`prescripciones-medicacion`, alta y reemplazo).

export const panelMedicacionRouter = Router();

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

panelMedicacionRouter.get('/pendientes', requiereRolPanel, async (req, res) => {
  const db = clienteDelPedido(req);
  // Con la llave maestra: la política RESTRICTIVE `la_informacion_de_salud_la_ve_quien_atiende`
  // exige interno.alcanza_la_informacion_de_salud(paciente_id), y con la restricción de la
  // historia clínica activa (el valor de fábrica) el Superadministrador que no atiende al paciente
  // deja de ver la indicación —el Administrador sí la ve—; además `oculta_pendientes_de_conformidad`
  // (RESTRICTIVE, NOT pendiente_conformidad) deja en null el paciente y el cliente embebidos si
  // están pendientes. Hasta ahora cada rol veía toda la bandeja de su Prestadora. Si se acota o no
  // se decide aparte.
  const { data, error } = await supabase
    .from('indicaciones_medicacion')
    .select(`id, medicamento, dosis, frecuencia, via_administracion_id, via:vias_administracion(clave), prescripcion_archivo_url, fecha_desde, fecha_hasta, created_at, pacientes(id, ${FICHA_NOMBRE}), clientes(id)`)
    .eq('prestadora_id', req.usuarioPanel.prestadoraId)
    .eq('estado', 'pendiente')
    .order('created_at', { ascending: true });
  if (error) return responderError(res, error);

  let firmaDe;
  try {
    firmaDe = await firmasDe(req.usuarioPanel.prestadoraId, (data || []).map((i) => i.id));
  } catch (errorFirmas) {
    return responderError(res, errorFirmas);
  }

  // Antes de entregar la medicación queda anotado quién la vio. Si no se puede anotar, no se
  // entrega (docs/PLAN_HASTA_PRODUCCION.md, paso 9).
  const pacienteIds = [...new Set((data || []).map((indicacion) => indicacion.pacientes?.id).filter(Boolean))];
  try {
    for (const pacienteId of pacienteIds) {
      await anotarConsultaAHce(
        req.usuarioPanel,
        { pacienteId, categorias: ['indicaciones_medicacion'], origen: origenDelPedido(req) },
        { cliente: db },
      );
    }
  } catch (errorAnotacion) {
    return responderError(res, errorAnotacion);
  }

  // Quién tiene guardia con el Paciente, con la llave maestra: quien coordina sólo ve las guardias
  // de su zona, y el bloqueo tiene que mirar todas.
  const pendientes = await Promise.all(
    (data || []).map(async ({ via, ...indicacion }) => {
      const bloqueada = laViaBloquea(await laViaFrenteALosAsignados(
        supabase,
        req.usuarioPanel.prestadoraId,
        indicacion.pacientes.id,
        indicacion.via_administracion_id
      ));
      return {
        ...indicacion,
        via_clave: via?.clave ?? null,
        pacientes: conSuFicha(indicacion.pacientes),
        firma: firmaDe.get(indicacion.id) ?? null,
        bloqueada,
      };
    })
  );

  res.json({ pendientes });
});

// La firma de cada indicación: su estado y de qué consentimiento, salvo los anulados.
async function firmasDe(prestadoraId, indicacionIds) {
  if (!indicacionIds.length) return new Map();
  const { data, error } = await supabase
    .from('consentimientos_medicacion')
    .select('id, indicacion_id, estado, cerrado_como')
    .eq('prestadora_id', prestadoraId)
    .in('indicacion_id', indicacionIds)
    .neq('estado', 'anulado');
  if (error) throw error;
  return new Map((data || []).map((f) => [f.indicacion_id, { id: f.id, estado: f.estado, cerradoComo: f.cerrado_como }]));
}

async function indicacionPendiente(prestadoraId, id) {
  const { data } = await supabase
    .from('indicaciones_medicacion')
    .select('id, estado, paciente_id, via_administracion_id')
    .eq('id', id)
    .eq('prestadora_id', prestadoraId)
    .eq('estado', 'pendiente')
    .maybeSingle();
  return data;
}

// Va con la llave maestra: ver el encabezado.
panelMedicacionRouter.post('/:id/aceptar', requiereRolPanel, async (req, res) => {
  const prestadoraId = req.usuarioPanel.prestadoraId;
  try {
    const indicacion = await indicacionPendiente(prestadoraId, req.params.id);
    if (!indicacion) throw new ErrorConMotivo('no_encontrado');

    // Las dos condiciones se vuelven a calcular acá y no se reciben del navegador.
    const frente = await laViaFrenteALosAsignados(supabase, prestadoraId, indicacion.paciente_id, indicacion.via_administracion_id);
    if (laViaBloquea(frente)) throw new ErrorConMotivo('ningun_asignado_puede_dar_la_via');

    if (await pideLaFirma({ prestadoraId })) {
      const firma = (await firmasDe(prestadoraId, [indicacion.id])).get(indicacion.id);
      if (firma?.estado !== 'cerrado') throw new ErrorConMotivo('falta_la_firma');
    }

    // La condición de la lectura se repite en la escritura, y se comprueba que haya escrito. Dos
    // Coordinadores mirando la misma bandeja pueden aceptar y rechazar la misma indicación al
    // mismo tiempo: sin esto, los dos ven que salió bien y solo una de las dos decisiones quedó.
    // En medicación eso no es un detalle de pantalla.
    const { data: aceptada, error } = await supabase
      .from('indicaciones_medicacion')
      .update({ estado: 'aceptada', revisado_por: req.usuarioPanel.id, revisado_en: new Date().toISOString() })
      .eq('id', indicacion.id)
      .eq('prestadora_id', prestadoraId)
      .eq('estado', 'pendiente')
      .select('id');
    // El disparador de la base dice lo mismo si la firma se anuló entre la lectura y la escritura.
    if (error?.message?.includes('Falta la firma')) throw new ErrorConMotivo('falta_la_firma');
    if (error) throw error;
    if (!aceptada?.length) throw new ErrorConMotivo('no_encontrado');

    res.json({ ok: true });
  } catch (err) {
    responderError(res, err);
  }
});

// Va con la llave maestra: ver el encabezado.
//
// El motivo es texto libre o una clave fija. La fija es la de la vía que nadie asignado puede dar,
// y la pantalla de quien la cargó la muestra traducida.
panelMedicacionRouter.post('/:id/rechazar', requiereRolPanel, async (req, res) => {
  const { motivo_rechazo: motivoLibre, motivo_rechazo_clave: motivoClave } = req.body || {};
  const motivoRechazo = typeof motivoLibre === 'string' ? motivoLibre.trim() : '';
  if (motivoClave && motivoClave !== 'ningun_asignado_puede_dar_la_via') {
    return res.status(400).json({ error: 'Falta el motivo del rechazo' });
  }
  if (!motivoRechazo && !motivoClave) return res.status(400).json({ error: 'Falta el motivo del rechazo' });

  const { data: indicacion } = await supabase
    .from('indicaciones_medicacion')
    .select('id, estado')
    .eq('id', req.params.id)
    .eq('prestadora_id', req.usuarioPanel.prestadoraId)
    .eq('estado', 'pendiente')
    .maybeSingle();
  if (!indicacion) return res.status(404).json({ error: 'Indicación no encontrada o ya revisada' });

  // Mismo criterio que en /aceptar de más arriba.
  const { data: rechazada, error } = await supabase
    .from('indicaciones_medicacion')
    .update({
      estado: 'rechazada',
      motivo_rechazo: motivoClave ? null : motivoRechazo,
      motivo_rechazo_clave: motivoClave || null,
      revisado_por: req.usuarioPanel.id,
      revisado_en: new Date().toISOString(),
    })
    .eq('id', indicacion.id)
    .eq('prestadora_id', req.usuarioPanel.prestadoraId)
    .eq('estado', 'pendiente')
    .select('id');
  if (error) return responderError(res, error);
  if (!rechazada?.length) return res.status(404).json({ error: 'Indicación no encontrada o ya revisada' });

  res.json({ ok: true });
});

// Lo que se imprime para firmar en papel: el texto tal como quedó guardado al cargarla —no el
// vigente hoy—, en el idioma en que lo leyó el Cliente, y los datos de la indicación.
panelMedicacionRouter.get('/:id/para-firmar', requiereRolPanel, async (req, res) => {
  const prestadoraId = req.usuarioPanel.prestadoraId;
  const { data: indicacion, error } = await supabase
    .from('indicaciones_medicacion')
    .select(`id, medicamento, dosis, frecuencia, via:vias_administracion(clave), fecha_desde, fecha_hasta, created_at, pacientes(id, ${FICHA_NOMBRE})`)
    .eq('id', req.params.id)
    .eq('prestadora_id', prestadoraId)
    .maybeSingle();
  if (error) return responderError(res, error);
  if (!indicacion) return responderError(res, new ErrorConMotivo('no_encontrado'));

  const { data: consentimiento, error: errorConsentimiento } = await supabase
    .from('consentimientos_medicacion')
    .select('id, documento_texto, documento_idioma, estado')
    .eq('prestadora_id', prestadoraId)
    .eq('indicacion_id', indicacion.id)
    .eq('estado', 'pendiente_firma')
    .maybeSingle();
  if (errorConsentimiento) return responderError(res, errorConsentimiento);
  if (!consentimiento) return responderError(res, new ErrorConMotivo('no_encontrado'));

  const { via, pacientes, ...datos } = indicacion;
  res.json({
    texto: consentimiento.documento_texto,
    idioma: consentimiento.documento_idioma,
    indicacion: { ...datos, via_clave: via?.clave ?? null, paciente: conSuFicha(pacientes) },
  });
});

// El papel firmado. Cierra la firma pendiente y queda en la historia clínica del Paciente. Lo ven
// la Prestadora y el Cliente, el Asistente no: por eso no va en la carpeta del Paciente, que es la
// que el depósito le abre al Asistente para leer la receta.
panelMedicacionRouter.post(
  '/:id/papel-firmado',
  requiereRolPanel,
  upload.single('archivo'),
  manejarErrorMulter,
  async (req, res) => {
    const prestadoraId = req.usuarioPanel.prestadoraId;
    try {
      if (!req.file) throw new ErrorConMotivo('faltan_datos');
      const indicacion = await indicacionPendiente(prestadoraId, req.params.id);
      if (!indicacion) throw new ErrorConMotivo('no_encontrado');

      const firma = (await firmasDe(prestadoraId, [indicacion.id])).get(indicacion.id);
      if (firma?.estado !== 'pendiente_firma') throw new ErrorConMotivo('ya_cerrado');

      const ruta = rutaDelPapelFirmado(prestadoraId, indicacion.paciente_id, firma.id, extensionDeArchivo(req.file.mimetype));
      const { error: errorSubida } = await supabase.storage
        .from(BUCKET)
        .upload(ruta, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
      if (errorSubida) throw errorSubida;

      const { data: cerrado, error } = await supabase
        .from('consentimientos_medicacion')
        .update({
          estado: 'cerrado',
          cerrado_como: 'papel_firmado',
          cerrado_en: new Date().toISOString(),
          cerrado_desde: 'panel',
          archivo_firmado_url: ruta,
        })
        .eq('id', firma.id)
        .eq('prestadora_id', prestadoraId)
        .eq('estado', 'pendiente_firma')
        .select('id');
      if (error) throw error;
      if (!cerrado?.length) throw new ErrorConMotivo('ya_cerrado');

      res.json({ ok: true });
    } catch (err) {
      responderError(res, err);
    }
  }
);

// Volver a ver el papel firmado, con un enlace temporal y la credencial de quien pide: la base
// tiene que dejarle leer el consentimiento y el depósito, el archivo.
panelMedicacionRouter.get('/:id/papel-firmado', requiereRolPanel, async (req, res) => {
  const db = clienteDelPedido(req);
  const { data: consentimiento, error } = await db
    .from('consentimientos_medicacion')
    .select('archivo_firmado_url')
    .eq('indicacion_id', req.params.id)
    .eq('cerrado_como', 'papel_firmado')
    .not('archivo_firmado_url', 'is', null)
    .maybeSingle();
  if (error) return responderError(res, error);
  if (!consentimiento) return responderError(res, new ErrorConMotivo('no_encontrado'));

  const { data, error: errorEnlace } = await db.storage.from(BUCKET).createSignedUrl(consentimiento.archivo_firmado_url, 60);
  if (errorEnlace) return responderError(res, errorEnlace);
  res.json({ url: data.signedUrl });
});

// Va con la llave maestra: ver el encabezado.
panelMedicacionRouter.post(
  '/matriculas/:asistenteId/archivo',
  requiereRolPanel,
  upload.single('archivo'),
  manejarErrorMulter,
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'Archivo faltante o de tipo no permitido (solo PDF, JPG o PNG, hasta 10 MB)' });
    }

    const { data: asistente } = await supabase
      .from('asistentes')
      .select('id, prestadora_id')
      .eq('id', req.params.asistenteId)
      .eq('prestadora_id', req.usuarioPanel.prestadoraId)
      .maybeSingle();
    if (!asistente) return res.status(404).json({ error: 'Asistente no encontrado' });

    const ruta = rutaDeMatriculaNueva(asistente.prestadora_id, asistente.id, extensionDeArchivo(req.file.mimetype));

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(ruta, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
    if (error) return responderError(res, error);

    res.json({ archivoUrl: ruta });
  }
);

panelMedicacionRouter.get('/archivo-url', requiereRolPanel, async (req, res) => {
  const ruta = req.query.ruta;
  if (!ruta) {
    return res.status(400).json({ error: 'Ruta de archivo inválida' });
  }

  // La política del depósito exige que la ruta empiece por la Prestadora de quien pide: un archivo
  // de otra no recibe enlace.
  const { data, error } = await clienteDelPedido(req).storage.from(BUCKET).createSignedUrl(ruta, 60);
  if (error) return responderError(res, error);

  res.json({ url: data.signedUrl });
});
