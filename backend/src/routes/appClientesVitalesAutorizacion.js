import { Router } from 'express';
import multer from 'multer';
import { requiereRolCliente } from '../middleware/requiereRolCliente.js';
import { clienteDelPedido, enLaPrestadora } from '../db/connection.js';
import { exigeDePersonasAutorizadas, soloElTitular } from '../utils/accesosDePersonasAutorizadas.js';
import { extensionDeArchivo } from '../utils/archivosSubidos.js';
import { ErrorConMotivo, responderError } from '../utils/errorConMotivo.js';
import { anotarConsultaAHce, origenDelPedido } from '../utils/registroDeConsultas.js';
import { normalizarIdioma } from '../i18n/idiomas.js';
import { comprobarFirma } from './llaveDelDispositivo.js';

// La autorización para que un Asistente le tome los signos vitales al Paciente, vista desde la
// aplicación del Cliente. La contraparte del Panel está en `panelVitalesAutorizacion.js`.
//
// La ven el titular y las personas autorizadas a ver la Ficha del Paciente. Firmar es sólo del
// titular, de dos maneras: con el acceso guardado del teléfono, que la deja aceptada en el momento,
// o subiendo el papel firmado, que queda pendiente hasta que el Panel lo acepte o lo rechace.
//
// CON QUÉ CREDENCIAL. Leer va con la de quien pide: la base le muestra la autorización sólo si el
// Paciente es de su Cliente y si a esa persona le dieron la Ficha. Firmar y subir van con el trabajo
// de la Prestadora, porque el Cliente no escribe en esa tabla ni en ese depósito; la función de la
// base (`registrar_autorizacion_signos_vitales_del_titular`) vuelve a comprobar que quien firma es
// el titular de ese Paciente. El enlace temporal al papel también sale con el trabajo, después de
// que la base le dejó ver la fila a quien pide.

export const appClientesVitalesAutorizacionRouter = Router();

const BUCKET = 'autorizaciones-monitoreo';
const TIPOS_PERMITIDOS = ['application/pdf', 'image/jpeg', 'image/png'];
const TAMANO_MAXIMO = 10 * 1024 * 1024; // 10 MB
const CATEGORIA = 'autorizaciones_monitoreo_paciente';

// Lo que levantan las funciones de la base y la aplicación sabe explicar. Lo demás sale como falla.
const MOTIVOS_DE_LA_BASE = {
  sin_permiso: 'sin_permiso',
  ya_hay_una_autorizacion: 'ya_hay_una_autorizacion',
  sin_texto: 'sin_texto',
  el_texto_cambio: 'el_texto_cambio',
  archivo_invalido: 'faltan_datos',
};

function conMotivo(error) {
  const motivo = MOTIVOS_DE_LA_BASE[error?.message];
  return motivo ? new ErrorConMotivo(motivo, error.message) : error;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TAMANO_MAXIMO },
  fileFilter(req, file, cb) {
    cb(null, TIPOS_PERMITIDOS.includes(file.mimetype));
  },
});

function manejarErrorMulter(err, req, res, next) {
  if (err) return responderError(res, new ErrorConMotivo('faltan_datos', err.message));
  next();
}

const puedeVer = [requiereRolCliente, exigeDePersonasAutorizadas('persona_autorizada_ficha_del_paciente')];
const puedeFirmar = [requiereRolCliente, soloElTitular];

async function pacienteDelCliente(db, pacienteId, usuarioCliente) {
  const { data, error } = await db
    .from('pacientes')
    .select('id, prestadora_id')
    .eq('id', pacienteId)
    .eq('cliente_id', usuarioCliente.clienteId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ErrorConMotivo('paciente_no_encontrado');
  return data;
}

// La que rige o la que espera revisión, y si quien pregunta es el que puede firmar.
appClientesVitalesAutorizacionRouter.get('/:pacienteId', ...puedeVer, async (req, res) => {
  const db = clienteDelPedido(req);
  try {
    const paciente = await pacienteDelCliente(db, req.params.pacienteId, req.usuarioCliente);
    const { data, error } = await db
      .from('autorizaciones_monitoreo_paciente')
      .select('id, metodo, estado, created_at')
      .eq('paciente_id', paciente.id)
      .in('estado', ['aceptada', 'pendiente'])
      .order('estado', { ascending: true })
      .limit(1);
    if (error) throw error;
    res.json({ autorizacion: data?.[0] ?? null, puedeFirmar: req.usuarioCliente.esTitular === true });
  } catch (err) {
    responderError(res, err);
  }
});

// El texto para firmar en la aplicación, en el idioma de quien lo lee. El identificador de
// verificación vuelve con la firma, para que la base compruebe que se firmó el texto que se mostró.
appClientesVitalesAutorizacionRouter.get('/:pacienteId/documento', ...puedeFirmar, async (req, res) => {
  const db = clienteDelPedido(req);
  try {
    const paciente = await pacienteDelCliente(db, req.params.pacienteId, req.usuarioCliente);
    const { data, error } = await db.rpc('documento_autorizacion_signos_vitales', {
      p_paciente: paciente.id,
      p_idioma: normalizarIdioma(req.query.idioma),
    });
    if (error) throw conMotivo(error);
    const documento = data?.[0];
    if (!documento?.texto) throw new ErrorConMotivo('sin_texto');

    await anotarConsultaAHce(req.usuarioCliente, {
      pacienteId: paciente.id,
      categorias: [CATEGORIA],
      origen: origenDelPedido(req),
    }, { cliente: db });
    res.json({ titulo: documento.titulo, texto: documento.texto, verificador: documento.verificador, idioma: documento.idioma });
  } catch (err) {
    responderError(res, err);
  }
});

// Firmar con el acceso guardado del teléfono. La firma se comprueba antes de anotar nada.
appClientesVitalesAutorizacionRouter.post('/:pacienteId/firmar', ...puedeFirmar, async (req, res) => {
  const db = clienteDelPedido(req);
  try {
    const paciente = await pacienteDelCliente(db, req.params.pacienteId, req.usuarioCliente);
    const { respuesta, verificador, idioma } = req.body || {};
    if (!verificador || !respuesta) throw new ErrorConMotivo('faltan_datos');

    await comprobarFirma({
      db,
      rol: 'cliente',
      persona: { id: req.usuarioCliente.id, prestadoraId: paciente.prestadora_id },
      respuesta,
    });

    await enLaPrestadora(paciente.prestadora_id, 'firmar la autorización de signos vitales', async (trabajo) => {
      const { error } = await trabajo.rpc('registrar_autorizacion_signos_vitales_del_titular', {
        p_usuario: req.usuarioCliente.id,
        p_paciente: paciente.id,
        p_idioma: normalizarIdioma(idioma),
        p_verificador: verificador,
        p_archivo: null,
      });
      if (error) throw conMotivo(error);
    });
    res.json({ ok: true });
  } catch (err) {
    responderError(res, err);
  }
});

// El papel firmado que sube el titular. Queda pendiente hasta que el Panel lo revise. Si la base no
// lo anota, el archivo no quedó en ninguna autorización y se borra.
appClientesVitalesAutorizacionRouter.post(
  '/:pacienteId/papel',
  ...puedeFirmar,
  upload.single('archivo'),
  manejarErrorMulter,
  async (req, res) => {
    const db = clienteDelPedido(req);
    try {
      if (!req.file) throw new ErrorConMotivo('faltan_datos');
      const paciente = await pacienteDelCliente(db, req.params.pacienteId, req.usuarioCliente);

      await enLaPrestadora(paciente.prestadora_id, 'subir la autorización de signos vitales', async (trabajo) => {
        // Cada subida es un archivo nuevo, nunca el reemplazo de uno anterior.
        const ruta = `${paciente.prestadora_id}/${paciente.id}/autorizacion-${Date.now()}.${extensionDeArchivo(req.file.mimetype)}`;
        const { error: errorSubida } = await trabajo.storage
          .from(BUCKET)
          .upload(ruta, req.file.buffer, { contentType: req.file.mimetype, upsert: false });
        if (errorSubida) throw errorSubida;

        const { error } = await trabajo.rpc('registrar_autorizacion_signos_vitales_del_titular', {
          p_usuario: req.usuarioCliente.id,
          p_paciente: paciente.id,
          p_idioma: normalizarIdioma(req.query.idioma),
          p_verificador: null,
          p_archivo: ruta,
        });
        if (error) {
          const { error: errorBorrado } = await trabajo.storage.from(BUCKET).remove([ruta]);
          if (errorBorrado) console.error('[vitales] no se pudo borrar el archivo que quedó sin autorización:', errorBorrado.message);
          throw conMotivo(error);
        }
      });
      res.json({ ok: true });
    } catch (err) {
      responderError(res, err);
    }
  }
);

// Lo firmado: el enlace temporal al papel, o el texto si se firmó en la aplicación.
appClientesVitalesAutorizacionRouter.get('/autorizacion/:id', ...puedeVer, async (req, res) => {
  const db = clienteDelPedido(req);
  try {
    const { data: autorizacion, error } = await db
      .from('autorizaciones_monitoreo_paciente')
      .select('id, prestadora_id, paciente_id, metodo, estado, documento_texto, documento_idioma, archivo_url')
      .eq('id', req.params.id)
      .in('estado', ['aceptada', 'pendiente'])
      .maybeSingle();
    if (error) throw error;
    if (!autorizacion) throw new ErrorConMotivo('no_encontrado');

    await anotarConsultaAHce(req.usuarioCliente, {
      pacienteId: autorizacion.paciente_id,
      categorias: [CATEGORIA],
      origen: origenDelPedido(req),
    }, { cliente: db });

    const base = { id: autorizacion.id, metodo: autorizacion.metodo, estado: autorizacion.estado };
    if (!autorizacion.archivo_url) {
      return res.json({ ...base, texto: autorizacion.documento_texto, idioma: autorizacion.documento_idioma });
    }
    const url = await enLaPrestadora(autorizacion.prestadora_id, 'ver la autorización de signos vitales', async (trabajo) => {
      const { data, error: errorEnlace } = await trabajo.storage.from(BUCKET).createSignedUrl(autorizacion.archivo_url, 60);
      if (errorEnlace) throw errorEnlace;
      return data.signedUrl;
    });
    res.json({ ...base, url });
  } catch (err) {
    responderError(res, err);
  }
});
