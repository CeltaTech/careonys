import { Router } from 'express';
import multer from 'multer';
import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import { exigirOrganizacionActiva } from '../middleware/alcancePrestadora.js';
import { clienteDelPedido } from '../db/connection.js';
import { extensionDeArchivo } from '../utils/archivosSubidos.js';
import { ErrorConMotivo, responderError } from '../utils/errorConMotivo.js';
import { anotarConsultaAHce, origenDelPedido } from '../utils/registroDeConsultas.js';
import { normalizarIdioma } from '../i18n/idiomas.js';

// La autorización del Cliente para que un Asistente le tome los signos vitales al Paciente, vista
// desde la Ficha del Cliente.
//
// Se firma de tres maneras: en la aplicación del Cliente con el acceso guardado del teléfono, en
// papel impreso desde acá, o en papel que el Cliente sube desde la aplicación. Las dos primeras
// quedan aceptadas en el momento; la tercera espera que alguien de acá la acepte o la rechace con
// un motivo. El texto es el que la Prestadora escribió en Configuración, o el de fábrica de su país
// si no escribió ninguno, y lo arma la base con los nombres puestos.
//
// CON LA CREDENCIAL DE QUIEN PIDE, toda la ruta. La tabla sólo se lee: cerrar en papel y revisar
// pasan por funciones de la base (`cerrar_autorizacion_signos_vitales_en_papel`,
// `revisar_autorizacion_signos_vitales`) que comprueban que quien pide es personal de la Prestadora
// y alcanza la información de salud del Paciente, y sacan de la sesión quién lo hizo. El depósito
// deja subir en la carpeta de la Prestadora de quien pide, y reemplazar o borrar sólo el archivo que
// todavía no quedó en ninguna autorización. Ver el documento queda anotado como lectura de salud.

export const panelVitalesAutorizacionRouter = Router();

const BUCKET = 'autorizaciones-monitoreo';
const TIPOS_PERMITIDOS = ['application/pdf', 'image/jpeg', 'image/png'];
const TAMANO_MAXIMO = 10 * 1024 * 1024; // 10 MB
const CATEGORIA = 'autorizaciones_monitoreo_paciente';

// Lo que levantan las funciones de la base y la pantalla sabe explicar. Lo demás sale como falla.
const MOTIVOS_DE_LA_BASE = {
  sin_permiso: 'sin_permiso',
  ya_hay_una_autorizacion: 'ya_hay_una_autorizacion',
  sin_texto: 'sin_texto',
  falta_el_motivo: 'falta_el_motivo',
  archivo_invalido: 'faltan_datos',
  estado_invalido: 'faltan_datos',
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

const soloPanel = [requiereRolPanel, exigirOrganizacionActiva];

async function pacienteVisible(db, pacienteId) {
  const { data, error } = await db.from('pacientes').select('id, prestadora_id').eq('id', pacienteId).maybeSingle();
  if (error) throw error;
  if (!data) throw new ErrorConMotivo('paciente_no_encontrado');
  return data;
}

// La que rige o la que espera revisión. Puede haber una de cada a la vez sólo si el Cliente subió un
// papel después de que otra quedara aceptada, cosa que la base no deja: se muestra la aceptada.
panelVitalesAutorizacionRouter.get('/:pacienteId', ...soloPanel, async (req, res) => {
  const db = clienteDelPedido(req);
  try {
    await pacienteVisible(db, req.params.pacienteId);
    const { data, error } = await db
      .from('autorizaciones_monitoreo_paciente')
      .select('id, metodo, estado, created_at')
      .eq('paciente_id', req.params.pacienteId)
      .in('estado', ['aceptada', 'pendiente'])
      .order('estado', { ascending: true })
      .limit(1);
    if (error) throw error;
    res.json({ autorizacion: data?.[0] ?? null });
  } catch (err) {
    responderError(res, err);
  }
});

// La hoja para imprimir y firmar, en el idioma de quien la imprime.
panelVitalesAutorizacionRouter.get('/:pacienteId/para-firmar', ...soloPanel, async (req, res) => {
  const db = clienteDelPedido(req);
  try {
    const paciente = await pacienteVisible(db, req.params.pacienteId);
    const { data, error } = await db.rpc('documento_autorizacion_signos_vitales', {
      p_paciente: paciente.id,
      p_idioma: normalizarIdioma(req.query.idioma),
    });
    if (error) throw conMotivo(error);
    const documento = data?.[0];
    if (!documento?.texto) throw new ErrorConMotivo('sin_texto');

    await anotarConsultaAHce(
      req.usuarioPanel,
      { pacienteId: paciente.id, categorias: [CATEGORIA], origen: origenDelPedido(req) },
      { cliente: db },
    );
    res.json({ titulo: documento.titulo, texto: documento.texto, idioma: documento.idioma });
  } catch (err) {
    responderError(res, err);
  }
});

// El papel firmado que sube la Prestadora. Queda aceptado en el momento. Si la base no lo cierra,
// el archivo no quedó en ninguna autorización y se borra.
panelVitalesAutorizacionRouter.post(
  '/:pacienteId/papel',
  ...soloPanel,
  upload.single('archivo'),
  manejarErrorMulter,
  async (req, res) => {
    const db = clienteDelPedido(req);
    try {
      if (!req.file) throw new ErrorConMotivo('faltan_datos');
      const paciente = await pacienteVisible(db, req.params.pacienteId);

      // Cada subida es un archivo nuevo, nunca el reemplazo de uno anterior.
      const ruta = `${paciente.prestadora_id}/${paciente.id}/autorizacion-${Date.now()}.${extensionDeArchivo(req.file.mimetype)}`;
      const { error: errorSubida } = await db.storage
        .from(BUCKET)
        .upload(ruta, req.file.buffer, { contentType: req.file.mimetype, upsert: false });
      if (errorSubida) throw errorSubida;

      const { error } = await db.rpc('cerrar_autorizacion_signos_vitales_en_papel', {
        p_paciente: paciente.id,
        p_archivo: ruta,
        p_idioma: normalizarIdioma(req.query.idioma),
      });
      if (error) {
        const { error: errorBorrado } = await db.storage.from(BUCKET).remove([ruta]);
        if (errorBorrado) console.error('[vitales] no se pudo borrar el archivo que quedó sin autorización:', errorBorrado.message);
        throw conMotivo(error);
      }
      res.json({ ok: true });
    } catch (err) {
      responderError(res, err);
    }
  }
);

// Lo firmado: el enlace temporal al papel, o el texto si se firmó en la aplicación.
panelVitalesAutorizacionRouter.get('/autorizacion/:id', ...soloPanel, async (req, res) => {
  const db = clienteDelPedido(req);
  try {
    const { data: autorizacion, error } = await db
      .from('autorizaciones_monitoreo_paciente')
      .select('id, paciente_id, metodo, estado, documento_texto, documento_idioma, archivo_url')
      .eq('id', req.params.id)
      .in('estado', ['aceptada', 'pendiente'])
      .maybeSingle();
    if (error) throw error;
    if (!autorizacion) throw new ErrorConMotivo('no_encontrado');

    await anotarConsultaAHce(
      req.usuarioPanel,
      { pacienteId: autorizacion.paciente_id, categorias: [CATEGORIA], origen: origenDelPedido(req) },
      { cliente: db },
    );

    const base = { id: autorizacion.id, metodo: autorizacion.metodo, estado: autorizacion.estado };
    if (!autorizacion.archivo_url) {
      return res.json({ ...base, texto: autorizacion.documento_texto, idioma: autorizacion.documento_idioma });
    }
    const { data, error: errorEnlace } = await db.storage.from(BUCKET).createSignedUrl(autorizacion.archivo_url, 60);
    if (errorEnlace) throw errorEnlace;
    res.json({ ...base, url: data.signedUrl });
  } catch (err) {
    responderError(res, err);
  }
});

// El papel que subió el Cliente: se acepta, o se rechaza con un motivo. Si otra persona ya lo
// revisó, se contesta que ya estaba resuelto.
async function revisar(req, res, estado, motivo) {
  const db = clienteDelPedido(req);
  try {
    const { data, error } = await db.rpc('revisar_autorizacion_signos_vitales', {
      p_autorizacion: req.params.id,
      p_estado: estado,
      p_motivo: motivo ?? null,
    });
    if (error) throw conMotivo(error);
    if (data !== true) throw new ErrorConMotivo('ya_resuelta');
    res.json({ ok: true });
  } catch (err) {
    responderError(res, err);
  }
}

panelVitalesAutorizacionRouter.post('/autorizacion/:id/aceptar', ...soloPanel, (req, res) => revisar(req, res, 'aceptada'));

panelVitalesAutorizacionRouter.post('/autorizacion/:id/rechazar', ...soloPanel, (req, res) =>
  revisar(req, res, 'rechazada', typeof req.body?.motivo === 'string' ? req.body.motivo : null)
);
