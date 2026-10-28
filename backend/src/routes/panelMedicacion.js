import { Router } from 'express';
import multer from 'multer';
import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import { clienteDelPedido } from '../db/connection.js';
import { laViaBloquea, laViaFrenteALosAsignados } from '../utils/medicacionIndicaciones.js';
import { extensionDeArchivo, rutaDelPapelFirmado } from '../utils/archivosSubidos.js';
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
// Cliente eligió firmar en papel se imprime desde acá, y al subir el documento firmado queda cerrada.
// La base lo exige igual: el disparador que acepta la indicación se niega sin firma.
//
// CON LA CREDENCIAL DE QUIEN PIDE, toda la ruta. La base acota la bandeja: con la restricción de la
// historia clínica activa, cada persona ve las indicaciones de los Pacientes que atiende, y la
// administración las ve todas. Antes de entregarla queda anotado quién la vio, paciente por paciente.
// Aceptar, rechazar y cerrar la firma en papel pasan por funciones de la base que tocan sólo lo
// suyo (`revisar_indicacion_medicacion`, `cerrar_firma_medicacion_en_papel`): quien coordina
// revisa la indicación sin poder cambiarle el medicamento, la dosis ni la vía, y quién revisó sale
// de la sesión. Quiénes tienen guardia con el Paciente lo contesta la base mirando todas las zonas.
// El depósito sólo da enlaces y deja subir en la carpeta de la Prestadora de quien pide.

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
  const { data: leidas, error } = await db
    .from('indicaciones_medicacion')
    .select(`id, medicamento, dosis, frecuencia, via_administracion_id, via:vias_administracion(clave), prescripcion_archivo_url, fecha_desde, fecha_hasta, created_at, pacientes(id, ${FICHA_NOMBRE}), clientes(id)`)
    .eq('estado', 'pendiente')
    .order('created_at', { ascending: true });
  if (error) return responderError(res, error);
  // El Paciente pendiente de conformidad llega sin sus datos: no es todavía de la Prestadora.
  const data = (leidas || []).filter((indicacion) => indicacion.pacientes?.id);

  let firmaDe;
  try {
    firmaDe = await firmasDe(db, data.map((i) => i.id));
  } catch (errorFirmas) {
    return responderError(res, errorFirmas);
  }

  // Antes de entregar la medicación queda anotado quién la vio. Si no se puede anotar, no se
  // entrega (docs/PLAN_HASTA_PRODUCCION.md, paso 9).
  const pacienteIds = [...new Set(data.map((indicacion) => indicacion.pacientes.id))];
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

  try {
    const pendientes = await Promise.all(
      data.map(async ({ via, ...indicacion }) => {
        const bloqueada = laViaBloquea(await laViaFrenteALosAsignados(
          db,
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
  } catch (errorVia) {
    responderError(res, errorVia);
  }
});

// La firma de cada indicación: su estado y de qué consentimiento, salvo los anulados.
async function firmasDe(db, indicacionIds) {
  if (!indicacionIds.length) return new Map();
  const { data, error } = await db
    .from('consentimientos_medicacion')
    .select('id, indicacion_id, estado, cerrado_como')
    .in('indicacion_id', indicacionIds)
    .neq('estado', 'anulado');
  if (error) throw error;
  return new Map((data || []).map((f) => [f.indicacion_id, { id: f.id, estado: f.estado, cerradoComo: f.cerrado_como }]));
}

async function indicacionPendiente(db, id) {
  const { data, error } = await db
    .from('indicaciones_medicacion')
    .select('id, estado, paciente_id, via_administracion_id')
    .eq('id', id)
    .eq('estado', 'pendiente')
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Aceptar o rechazar, por la función de la base. Devuelve falso si la indicación ya no estaba
// pendiente: dos Coordinadores mirando la misma bandeja pueden revisar la misma indicación al
// mismo tiempo, y sin esto los dos verían que salió bien y sólo una de las dos decisiones quedaría.
async function revisar(db, id, estado, motivo = null, motivoClave = null) {
  const { data, error } = await db.rpc('revisar_indicacion_medicacion', {
    p_indicacion: id,
    p_estado: estado,
    p_motivo: motivo,
    p_motivo_clave: motivoClave,
  });
  // El disparador de la base exige la firma si se anuló entre la lectura y la escritura.
  if (error?.message?.includes('Falta la firma')) throw new ErrorConMotivo('falta_la_firma');
  if (error) throw error;
  return data === true;
}

panelMedicacionRouter.post('/:id/aceptar', requiereRolPanel, async (req, res) => {
  const prestadoraId = req.usuarioPanel.prestadoraId;
  const db = clienteDelPedido(req);
  try {
    const indicacion = await indicacionPendiente(db, req.params.id);
    if (!indicacion) throw new ErrorConMotivo('no_encontrado');

    // Las dos condiciones se vuelven a calcular acá y no se reciben del navegador.
    const frente = await laViaFrenteALosAsignados(db, prestadoraId, indicacion.paciente_id, indicacion.via_administracion_id);
    if (laViaBloquea(frente)) throw new ErrorConMotivo('ningun_asignado_puede_dar_la_via');

    if (await pideLaFirma({ prestadoraId, db })) {
      const firma = (await firmasDe(db, [indicacion.id])).get(indicacion.id);
      if (firma?.estado !== 'cerrado') throw new ErrorConMotivo('falta_la_firma');
    }

    if (!(await revisar(db, indicacion.id, 'aceptada'))) throw new ErrorConMotivo('no_encontrado');
    res.json({ ok: true });
  } catch (err) {
    responderError(res, err);
  }
});

// El motivo es texto libre o una clave fija. La fija es la de la vía que nadie asignado puede dar,
// y la pantalla de quien la cargó la muestra traducida.
panelMedicacionRouter.post('/:id/rechazar', requiereRolPanel, async (req, res) => {
  const { motivo_rechazo: motivoLibre, motivo_rechazo_clave: motivoClave } = req.body || {};
  const motivoRechazo = typeof motivoLibre === 'string' ? motivoLibre.trim() : '';
  if (motivoClave && motivoClave !== 'ningun_asignado_puede_dar_la_via') {
    return res.status(400).json({ error: 'Falta el motivo del rechazo' });
  }
  if (!motivoRechazo && !motivoClave) return res.status(400).json({ error: 'Falta el motivo del rechazo' });

  try {
    const rechazada = await revisar(
      clienteDelPedido(req),
      req.params.id,
      'rechazada',
      motivoClave ? null : motivoRechazo,
      motivoClave || null,
    );
    if (!rechazada) return res.status(404).json({ error: 'Indicación no encontrada o ya revisada' });
    res.json({ ok: true });
  } catch (err) {
    responderError(res, err);
  }
});

// Lo que se imprime para firmar en papel: el texto tal como quedó guardado al cargarla —no el
// vigente hoy—, en el idioma en que lo leyó el Cliente, y los datos de la indicación.
panelMedicacionRouter.get('/:id/para-firmar', requiereRolPanel, async (req, res) => {
  const db = clienteDelPedido(req);
  const { data: indicacion, error } = await db
    .from('indicaciones_medicacion')
    .select(`id, medicamento, dosis, frecuencia, via:vias_administracion(clave), fecha_desde, fecha_hasta, created_at, pacientes(id, ${FICHA_NOMBRE})`)
    .eq('id', req.params.id)
    .maybeSingle();
  if (error) return responderError(res, error);
  if (!indicacion?.pacientes) return responderError(res, new ErrorConMotivo('no_encontrado'));

  try {
    await anotarConsultaAHce(
      req.usuarioPanel,
      { pacienteId: indicacion.pacientes.id, categorias: ['indicaciones_medicacion'], origen: origenDelPedido(req) },
      { cliente: db },
    );
  } catch (errorAnotacion) {
    return responderError(res, errorAnotacion);
  }

  const { data: consentimiento, error: errorConsentimiento } = await db
    .from('consentimientos_medicacion')
    .select('id, documento_texto, documento_idioma, estado')
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

// El documento firmado. Cierra la firma pendiente y queda en la historia clínica del Paciente. Lo ven
// la Prestadora y el Cliente, el Asistente no: por eso no va en la carpeta del Paciente, que es la
// que el depósito le abre al Asistente para leer la receta.
panelMedicacionRouter.post(
  '/:id/papel-firmado',
  requiereRolPanel,
  upload.single('archivo'),
  manejarErrorMulter,
  async (req, res) => {
    const prestadoraId = req.usuarioPanel.prestadoraId;
    const db = clienteDelPedido(req);
    try {
      if (!req.file) throw new ErrorConMotivo('faltan_datos');
      const indicacion = await indicacionPendiente(db, req.params.id);
      if (!indicacion) throw new ErrorConMotivo('no_encontrado');

      const firma = (await firmasDe(db, [indicacion.id])).get(indicacion.id);
      // Si otra persona ya la cerró o la anuló, no queda nada por hacer: se contesta bien sin subir
      // nada, y la pantalla vuelve a leer y muestra cómo quedó.
      if (!firma) throw new ErrorConMotivo('no_encontrado');
      if (firma.estado !== 'pendiente_firma') return res.json({ ok: true });

      const ruta = rutaDelPapelFirmado(prestadoraId, indicacion.paciente_id, firma.id, extensionDeArchivo(req.file.mimetype));
      const { error: errorSubida } = await db.storage
        .from(BUCKET)
        .upload(ruta, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
      if (errorSubida) throw errorSubida;

      const { data: cerrado, error } = await db.rpc('cerrar_firma_medicacion_en_papel', { p_firma: firma.id, p_archivo: ruta });
      if (error) throw error;
      // Otra persona la cerró mientras se subía el archivo. El archivo subido no quedó en ninguna
      // firma y se borra, salvo que esté en la misma ruta que el que sí quedó guardado: ése el
      // depósito no lo deja borrar.
      if (cerrado !== true) {
        const { data: actual } = await db
          .from('consentimientos_medicacion')
          .select('archivo_firmado_url')
          .eq('id', firma.id)
          .maybeSingle();
        if (actual?.archivo_firmado_url !== ruta) {
          const { error: errorBorrado } = await db.storage.from(BUCKET).remove([ruta]);
          if (errorBorrado) console.error('[medicacion] no se pudo borrar el archivo que quedó sin firma:', errorBorrado.message);
        }
      }

      res.json({ ok: true });
    } catch (err) {
      responderError(res, err);
    }
  }
);

// Volver a ver el documento firmado, con un enlace temporal y la credencial de quien pide: la base
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
