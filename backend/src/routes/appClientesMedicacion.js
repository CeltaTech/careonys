import { Router } from 'express';
import multer from 'multer';
import { requiereRolCliente } from '../middleware/requiereRolCliente.js';
import { clienteDelPedido, supabase } from '../db/connection.js';
import { exigeVisible } from '../utils/visibilidadPrestadora.js';
import { exigeDePersonasAutorizadas } from '../utils/accesosDePersonasAutorizadas.js';
import { extensionDeArchivo } from '../utils/archivosSubidos.js';
import { anotarConsultaAHce, origenDelPedido } from '../utils/registroDeConsultas.js';
import { ErrorConMotivo, responderError } from '../utils/errorConMotivo.js';
import { documentoParaFirmar, pideLaFirma } from '../utils/consentimientoMedicacion.js';
import { tiposQuePuedenDarLaVia } from '../utils/medicacionIndicaciones.js';
import { comprobarFirma } from './llaveDelDispositivo.js';

// Cierra pendiente #62 (docs/PLAN_HASTA_PRODUCCION.md): el Cliente solicita la indicación de
// medicación desde su propia PWA — el Panel decide aceptar/rechazar (panelMedicacion.js). Sin
// esto, la indicación queda en 'pendiente' y no llega a las órdenes del Asistente.
//
// LA FIRMA. Salvo que la Prestadora la haya apagado, quien carga la indicación acepta el texto de
// la Prestadora —o el modelo del producto, si ella no escribió ninguno—, con receta o sin ella.
// Firma de dos formas: con la llave de su teléfono, que se comprueba acá antes de guardar nada, o
// en papel, y entonces la indicación entra igual con la firma pendiente y el Panel no la puede
// aceptar hasta subir el papel firmado. Lo firmado se guarda entero: texto, huella e idioma.
//
// CON LA CREDENCIAL DE QUIEN PIDE. La lectura entra a la base con `clienteDelPedido(req)`, no con
// la llave maestra: la base le contesta al Cliente sólo lo de su Prestadora y sólo si el permiso de sus personas autorizadas
// les deja ver la medicación. Por eso no lleva el filtro de la Prestadora de la sesión.
//
// EL ALTA SIGUE CON LA MAESTRA. El alta devuelve la fila recién creada, y la base sólo devuelve
// lo que quien pide puede leer: una persona autorizada a la que se le dejó pedir medicación pero
// no verla recibiría un rechazo en vez del alta (políticas `cliente_carga_indicaciones_de_sus_pacientes`
// y `cliente_lee_indicaciones_de_sus_pacientes`). Hasta que eso se resuelva, el alta, el archivo y
// lo firmado van con la maestra y con la Prestadora escrita; el Paciente, en cambio, se lee con la
// credencial de quien pide.

export const appClientesMedicacionRouter = Router();

const BUCKET = 'prescripciones-medicacion';
const TIPOS_PERMITIDOS = ['application/pdf', 'image/jpeg', 'image/png'];
const TAMANO_MAXIMO = 10 * 1024 * 1024; // 10 MB
const FORMAS_DE_FIRMAR = ['app', 'papel'];

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

async function pacienteDelCliente(db, pacienteId, usuarioCliente) {
  const { data } = await db
    .from('pacientes')
    .select('id, prestadora_id, cliente_id')
    .eq('id', pacienteId)
    .eq('cliente_id', usuarioCliente.clienteId)
    .maybeSingle();
  return data;
}

const puedePedir = [
  requiereRolCliente,
  exigeVisible('cliente_pide_medicacion'),
  exigeDePersonasAutorizadas('persona_autorizada_pide_medicacion'),
];

// Las vías para elegir. El nombre visible sale de las traducciones por la clave.
appClientesMedicacionRouter.get('/vias', puedePedir, async (req, res) => {
  const { data, error } = await clienteDelPedido(req)
    .from('vias_administracion')
    .select('id, clave')
    .order('orden');
  if (error) return responderError(res, error);
  res.json({ vias: data });
});

// Qué tipos de Asistente pueden dar una medicación por esta vía, para que el Cliente lo sepa
// apenas la elige.
appClientesMedicacionRouter.get('/vias/:viaId/tipos', puedePedir, async (req, res) => {
  const tipos = await tiposQuePuedenDarLaVia(clienteDelPedido(req), req.usuarioCliente.prestadoraId, req.params.viaId);
  res.json({ tipos: tipos.map(({ id, clave, nombre, prestadora_id }) => ({ id, clave, nombre, prestadora_id })) });
});

// El texto que se acepta, en el idioma de quien lo lee, y si la Prestadora lo pide.
appClientesMedicacionRouter.get('/consentimiento', puedePedir, async (req, res) => {
  try {
    const prestadoraId = req.usuarioCliente.prestadoraId;
    if (!(await pideLaFirma({ prestadoraId }))) return res.json({ pideFirma: false });
    const documento = await documentoParaFirmar({ prestadoraId, idioma: req.query.idioma });
    res.json({ pideFirma: true, ...documento });
  } catch (err) {
    responderError(res, err);
  }
});

// Ver la medicación y pedir una son dos decisiones distintas de la Prestadora: hay quien
// muestra la lista pero no deja que el Cliente cargue nada. Y adentro de cada una hay una segunda
// decisión, la del titular sobre cada una de sus personas autorizadas. Van en este orden: primero si la
// función existe en esta aplicación, después si a esta persona se la dieron.
appClientesMedicacionRouter.get('/:pacienteId', requiereRolCliente, exigeVisible('cliente_medicacion_del_paciente'), exigeDePersonasAutorizadas('persona_autorizada_medicacion'), async (req, res) => {
  const db = clienteDelPedido(req);
  const paciente = await pacienteDelCliente(db, req.params.pacienteId, req.usuarioCliente);
  if (!paciente) {
    return res.status(404).json({ error: 'Paciente no encontrado' });
  }

  const { data, error } = await db
    .from('indicaciones_medicacion')
    .select('id, medicamento, dosis, frecuencia, via_administracion_id, via:vias_administracion(clave), fecha_desde, fecha_hasta, estado, motivo_rechazo, motivo_rechazo_clave, created_at')
    .eq('paciente_id', paciente.id)
    .order('created_at', { ascending: false });
  if (error) return responderError(res, error);

  const ids = (data || []).map((i) => i.id);
  const { data: firmas, error: errorFirmas } = ids.length
    ? await db.from('consentimientos_medicacion').select('indicacion_id, estado, cerrado_como').in('indicacion_id', ids)
    : { data: [] };
  if (errorFirmas) return responderError(res, errorFirmas);
  const firmaDe = new Map((firmas || []).filter((f) => f.estado !== 'anulado').map((f) => [f.indicacion_id, f]));

  // Quién puede dar cada vía, al lado de cada indicación que sigue viva. Una consulta por vía, no
  // por indicación: varias indicaciones suelen compartir la misma.
  const vivas = (data || []).filter((i) => ['pendiente', 'aceptada'].includes(i.estado) && i.via_administracion_id);
  const tiposDe = new Map();
  for (const viaId of new Set(vivas.map((i) => i.via_administracion_id))) {
    const tipos = await tiposQuePuedenDarLaVia(db, req.usuarioCliente.prestadoraId, viaId);
    tiposDe.set(viaId, tipos.map(({ id, clave, nombre, prestadora_id }) => ({ id, clave, nombre, prestadora_id })));
  }

  // Antes de entregar la medicación queda anotado quién la vio. Si no se puede anotar, no se
  // entrega (docs/PLAN_HASTA_PRODUCCION.md, paso 9).
  try {
    await anotarConsultaAHce(req.usuarioCliente, {
      pacienteId: paciente.id,
      categorias: ['indicaciones_medicacion'],
      origen: origenDelPedido(req),
    }, { cliente: db });
  } catch (errorAnotacion) {
    return responderError(res, errorAnotacion);
  }

  res.json({
    indicaciones: (data || []).map(({ via, ...i }) => ({
      ...i,
      via_clave: via?.clave ?? null,
      firma: firmaDe.get(i.id)?.estado ?? null,
      papel_firmado: firmaDe.get(i.id)?.cerrado_como === 'papel_firmado',
      tipos: ['pendiente', 'aceptada'].includes(i.estado) ? tiposDe.get(i.via_administracion_id) ?? [] : null,
    })),
  });
});

// El papel firmado, para quien firmó. Que lo pueda ver lo decide la base al dejarle leer el
// consentimiento con su credencial; el enlace sale con la maestra porque el papel vive afuera de
// la carpeta del Paciente, que es la única que el depósito le abre al Cliente.
appClientesMedicacionRouter.get('/indicacion/:indicacionId/papel-firmado', requiereRolCliente, exigeVisible('cliente_medicacion_del_paciente'), exigeDePersonasAutorizadas('persona_autorizada_medicacion'), async (req, res) => {
  const { data: consentimiento, error } = await clienteDelPedido(req)
    .from('consentimientos_medicacion')
    .select('archivo_firmado_url, prestadora_id')
    .eq('indicacion_id', req.params.indicacionId)
    .eq('cerrado_como', 'papel_firmado')
    .not('archivo_firmado_url', 'is', null)
    .maybeSingle();
  if (error) return responderError(res, error);
  if (!consentimiento || consentimiento.prestadora_id !== req.usuarioCliente.prestadoraId) {
    return responderError(res, new ErrorConMotivo('no_encontrado'));
  }

  const { data, error: errorEnlace } = await supabase.storage.from(BUCKET).createSignedUrl(consentimiento.archivo_firmado_url, 60);
  if (errorEnlace) return responderError(res, errorEnlace);
  res.json({ url: data.signedUrl });
});

appClientesMedicacionRouter.post(
  '/:pacienteId',
  // Mismo criterio que calificar una guardia (appClientes.js): cargar una indicación de
  // medicación viene negada de fábrica para las personas autorizadas, y sólo la habilita una instrucción
  // firmada por el titular. El corte va antes de recibir el archivo: no tiene sentido subir una
  // prescripción para después contestar que no.
  puedePedir,
  upload.single('prescripcion'),
  manejarErrorMulter,
  async (req, res) => {
    let indicacionCreada = null;
    try {
      // El Paciente se lee con la credencial de quien pide: la Prestadora con la que se arma la
      // ruta y se da el alta es la de la fila que la base ya le dejó ver.
      const db = clienteDelPedido(req);
      const paciente = await pacienteDelCliente(db, req.params.pacienteId, req.usuarioCliente);
      if (!paciente) throw new ErrorConMotivo('paciente_no_encontrado');

      const {
        medicamento, dosis, frecuencia,
        via_administracion_id: viaId,
        fecha_desde: fechaDesde, fecha_hasta: fechaHasta,
        firma, respuesta, idioma,
      } = req.body || {};
      if (!medicamento || !dosis || !frecuencia || !viaId || !fechaDesde) throw new ErrorConMotivo('faltan_datos');

      const { data: via } = await db.from('vias_administracion').select('id, clave').eq('id', viaId).maybeSingle();
      if (!via) throw new ErrorConMotivo('faltan_datos');

      // La firma se resuelve antes de guardar nada: una firma que no cierra no deja rastro.
      const firmar = await pideLaFirma({ prestadoraId: paciente.prestadora_id });
      let documento = null;
      if (firmar) {
        if (!FORMAS_DE_FIRMAR.includes(firma)) throw new ErrorConMotivo('falta_la_firma');
        if (firma === 'app') {
          let respuestaFirmada;
          try {
            respuestaFirmada = typeof respuesta === 'string' ? JSON.parse(respuesta) : respuesta;
          } catch {
            throw new ErrorConMotivo('firma_no_sirve');
          }
          await comprobarFirma({
            db,
            rol: 'cliente',
            persona: { id: req.usuarioCliente.id, prestadoraId: paciente.prestadora_id },
            respuesta: respuestaFirmada,
          });
        }
        documento = await documentoParaFirmar({ prestadoraId: paciente.prestadora_id, idioma });
      }

      let prescripcionArchivoUrl = null;
      if (req.file) {
        const extension = extensionDeArchivo(req.file.mimetype);
        const ruta = `${paciente.prestadora_id}/${paciente.id}/prescripcion-${Date.now()}.${extension}`;
        const { error: errorUpload } = await supabase.storage
          .from(BUCKET)
          .upload(ruta, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
        if (errorUpload) throw errorUpload;
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
          via_administracion_id: via.id,
          prescripcion_archivo_url: prescripcionArchivoUrl,
          fecha_desde: fechaDesde,
          fecha_hasta: fechaHasta || null,
          solicitado_por: req.usuarioCliente.id,
        })
        .select('id, estado')
        .single();
      if (error) throw error;
      indicacionCreada = data;

      if (documento) {
        const ahora = new Date().toISOString();
        const enLaApp = firma === 'app';
        const { error: errorFirma } = await supabase.from('consentimientos_medicacion').insert({
          prestadora_id: paciente.prestadora_id,
          indicacion_id: data.id,
          documento_texto: documento.texto,
          documento_huella: documento.huella,
          documento_idioma: documento.idioma,
          estado: enLaApp ? 'cerrado' : 'pendiente_firma',
          cerrado_como: enLaApp ? 'confirmado_en_la_app' : null,
          cerrado_en: enLaApp ? ahora : null,
          cerrado_desde: enLaApp ? 'app_clientes' : null,
          cargado_por: req.usuarioCliente.id,
        });
        if (errorFirma) throw errorFirma;
      }

      res.json({ indicacion: { ...data, firma: documento ? (firma === 'app' ? 'cerrado' : 'pendiente_firma') : null } });
    } catch (err) {
      // Una indicación sin la firma que se pidió no queda: o entran las dos, o ninguna.
      if (indicacionCreada) {
        await supabase
          .from('indicaciones_medicacion')
          .delete()
          .eq('id', indicacionCreada.id)
          .eq('prestadora_id', req.usuarioCliente.prestadoraId);
      }
      responderError(res, err);
    }
  }
);
