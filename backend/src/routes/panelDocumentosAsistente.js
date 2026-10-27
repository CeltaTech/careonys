import { Router } from 'express';
import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import { exigirOrganizacionActiva } from '../middleware/alcancePrestadora.js';
import { exigirAdministracion } from '../middleware/exigirAdministracion.js';
import { clienteDelPedido } from '../db/connection.js';
import { ErrorConMotivo, responderError } from '../utils/errorConMotivo.js';
import { errorDeDocumentos } from '../utils/erroresDeDocumentos.js';
import { estadoVisible } from '../utils/estadoDelDocumento.js';
import { avisarDocumentoAlAsistente } from '../utils/avisoDeDocumento.js';
import {
  DEPOSITO_DE_DOCUMENTOS,
  errorDeLaBase,
  recibirDocumento,
  subirArchivoDelDocumento,
  validarDocumento,
} from '../utils/cargaDeDocumento.js';
import { ACCION_MODIFICACION_CRITICA, registrarActividad } from '../utils/registroDeActividad.js';

// Los documentos del Legajo de un Asistente, vistos desde el Panel.
//
// Leer lo puede cualquiera del Panel que alcance a ese Asistente: la base acota al Coordinador a
// los de su zona. Aprobar, observar, cargar y prorrogar es de la administración.
//
// CON LA CREDENCIAL DE QUIEN PIDE. Todo entra con `clienteDelPedido(req)`. La Prestadora que se
// escribe en una fila nueva es la del Legajo que la base dejó ver, nunca un dato del pedido.
//
// Lo que se le avisa al Asistente —aprobado, observado— sale después de guardar, y si el aviso no
// sale el documento queda igual: el aviso acompaña, no decide.

export const panelDocumentosAsistenteRouter = Router();

panelDocumentosAsistenteRouter.use(requiereRolPanel, exigirOrganizacionActiva);

const soloAdministracion = exigirAdministracion('Solo Admin o Superadmin puede revisar los documentos del Asistente');

const COLUMNAS_DEL_DOCUMENTO =
  'id, prestadora_id, asistente_id, tipo_documento_id, estado, fecha_emision, fecha_vencimiento, numero, organismo_id, motivo_observacion, revisado_por, revisado_at, cargado_por, created_at';

const TABLA = 'documentos_asistente';

function textoLimpio(valor) {
  return typeof valor === 'string' && valor.trim() ? valor.trim() : null;
}

// Si la base no lo deja ver, para quien pregunta no existe.
async function asistenteVisible(db, asistenteId) {
  if (!asistenteId) return null;
  const { data } = await db.from('asistentes').select('id, prestadora_id').eq('id', asistenteId).maybeSingle();
  return data ?? null;
}

async function diasAvisoDe(db, prestadoraId) {
  const { data } = await db
    .from('prestadoras')
    .select('dias_aviso_vencimiento_documentos')
    .eq('id', prestadoraId)
    .maybeSingle();
  return data?.dias_aviso_vencimiento_documentos ?? null;
}

async function documentoVisible(db, documentoId) {
  const { data, error } = await db
    .from(TABLA)
    .select(`${COLUMNAS_DEL_DOCUMENTO}, ruta_archivo`)
    .eq('id', documentoId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

async function nombreDelTipo(db, tipoDocumentoId) {
  const { data } = await db.from('tipos_documento_asistente').select('nombre').eq('id', tipoDocumentoId).maybeSingle();
  return data?.nombre ?? '';
}

// ---------------------------------------------------------------------------
// Los documentos que se le piden a un Asistente, con el último cargado de cada uno
// ---------------------------------------------------------------------------

panelDocumentosAsistenteRouter.get('/asistente/:asistenteId', async (req, res) => {
  try {
    const db = clienteDelPedido(req);
    const asistente = await asistenteVisible(db, req.params.asistenteId);
    if (!asistente) throw new ErrorConMotivo('asistente_no_encontrado');

    const { data: pedidos, error } = await db
      .from('documentos_pedidos_al_asistente')
      .select('tipo_documento_id, nombre, impide_trabajar, documento_id, estado, fecha_vencimiento, motivo_observacion, gracia_hasta')
      .eq('asistente_id', asistente.id)
      .order('nombre');
    if (error) throw error;

    const idsDeDocumentos = (pedidos ?? []).map((p) => p.documento_id).filter(Boolean);
    let cargados = [];
    if (idsDeDocumentos.length) {
      const { data, error: errorCargados } = await db
        .from(TABLA)
        .select('id, fecha_emision, numero, organismo_id, ruta_archivo')
        .in('id', idsDeDocumentos);
      if (errorCargados) throw errorCargados;
      cargados = data ?? [];
    }
    const porId = new Map(cargados.map((d) => [d.id, d]));

    const idsDeOrganismos = [...new Set(cargados.map((d) => d.organismo_id).filter(Boolean))];
    let organismos = [];
    if (idsDeOrganismos.length) {
      const { data, error: errorOrganismos } = await db
        .from('organismos_otorgantes')
        .select('id, nombre, enlace_comprobacion')
        .in('id', idsDeOrganismos);
      if (errorOrganismos) throw errorOrganismos;
      organismos = data ?? [];
    }
    const organismoPorId = new Map(organismos.map((o) => [o.id, o]));

    const diasAviso = await diasAvisoDe(db, asistente.prestadora_id);
    const hoy = new Date();

    const documentos = (pedidos ?? []).map((p) => {
      const cargado = p.documento_id ? porId.get(p.documento_id) : null;
      const organismo = cargado?.organismo_id ? organismoPorId.get(cargado.organismo_id) ?? null : null;
      return {
        tipo_documento_id: p.tipo_documento_id,
        nombre: p.nombre,
        impide_trabajar: p.impide_trabajar,
        documento_id: p.documento_id,
        estado: p.estado,
        estado_visible: estadoVisible(p, diasAviso, hoy),
        fecha_emision: cargado?.fecha_emision ?? null,
        fecha_vencimiento: p.fecha_vencimiento,
        motivo_observacion: p.motivo_observacion,
        gracia_hasta: p.gracia_hasta,
        numero: cargado?.numero ?? null,
        organismo: organismo
          ? { id: organismo.id, nombre: organismo.nombre, enlace_comprobacion: organismo.enlace_comprobacion }
          : null,
        tiene_archivo: Boolean(cargado?.ruta_archivo),
      };
    });

    res.json({ documentos, dias_aviso: diasAviso });
  } catch (error) {
    return responderError(res, error);
  }
});

// ---------------------------------------------------------------------------
// El archivo de un documento: enlace temporal de un minuto
// ---------------------------------------------------------------------------

panelDocumentosAsistenteRouter.get('/:documentoId/archivo-url', async (req, res) => {
  try {
    const db = clienteDelPedido(req);
    const documento = await documentoVisible(db, req.params.documentoId);
    if (!documento?.ruta_archivo) throw new ErrorConMotivo('documento_no_encontrado');
    // El depósito sólo da el enlace de un archivo de un Legajo que quien pide alcanza.
    const { data, error } = await db.storage.from(DEPOSITO_DE_DOCUMENTOS).createSignedUrl(documento.ruta_archivo, 60);
    if (error) throw new ErrorConMotivo('documento_no_encontrado', error.message);
    res.json({ url: data.signedUrl });
  } catch (error) {
    return responderError(res, error);
  }
});

// ---------------------------------------------------------------------------
// Aprobar y observar
// ---------------------------------------------------------------------------

async function revisar(req, res, { estado, motivo, clave }) {
  const db = clienteDelPedido(req);
  const existente = await documentoVisible(db, req.params.documentoId);
  if (!existente) throw new ErrorConMotivo('documento_no_encontrado');

  const { data: documento, error } = await db
    .from(TABLA)
    .update({
      estado,
      motivo_observacion: motivo,
      revisado_por: req.usuarioPanel.id,
      revisado_at: new Date().toISOString(),
    })
    .eq('id', existente.id)
    .select(COLUMNAS_DEL_DOCUMENTO)
    .maybeSingle();
  if (error) throw errorDeLaBase(error);
  // La base lo dejó ver pero no cambiar: para quien pide, no hay nada que revisar.
  if (!documento) throw new ErrorConMotivo('documento_no_encontrado');

  await registrarActividad(req.usuarioPanel, ACCION_MODIFICACION_CRITICA, {
    tablaAfectada: TABLA,
    registroId: documento.id,
    camposCambiados: ['estado', 'motivo_observacion', 'revisado_por', 'revisado_at'],
  });

  await avisarDocumentoAlAsistente(db, {
    prestadoraId: documento.prestadora_id,
    asistenteId: documento.asistente_id,
    clave,
    documento: await nombreDelTipo(db, documento.tipo_documento_id),
    motivo: motivo ?? undefined,
  });

  res.json({ ok: true, documento });
}

panelDocumentosAsistenteRouter.post('/:documentoId/aprobar', soloAdministracion, async (req, res) => {
  try {
    await revisar(req, res, { estado: 'aprobado', motivo: null, clave: 'documento_aprobado' });
  } catch (error) {
    return responderError(res, error);
  }
});

panelDocumentosAsistenteRouter.post('/:documentoId/observar', soloAdministracion, async (req, res) => {
  try {
    const motivo = textoLimpio(req.body?.motivo);
    if (!motivo) throw new ErrorConMotivo('motivo_observacion_requerido');
    await revisar(req, res, { estado: 'observado', motivo, clave: 'documento_observado' });
  } catch (error) {
    return responderError(res, error);
  }
});

// ---------------------------------------------------------------------------
// Prorrogar la gracia de un documento que dejó de valer
// ---------------------------------------------------------------------------

panelDocumentosAsistenteRouter.post('/prorrogar', soloAdministracion, async (req, res) => {
  try {
    const { asistente_id: asistenteId, tipo_documento_id: tipoDocumentoId } = req.body ?? {};
    const dias = Number(req.body?.dias);
    if (!Number.isInteger(dias) || dias <= 0) throw new ErrorConMotivo('dias_invalidos');
    if (!tipoDocumentoId) throw new ErrorConMotivo('faltan_datos');

    const db = clienteDelPedido(req);
    const asistente = await asistenteVisible(db, asistenteId);
    if (!asistente) throw new ErrorConMotivo('asistente_no_encontrado');

    const { data, error } = await db
      .from('prorrogas_de_gracia_documento')
      .insert({
        prestadora_id: asistente.prestadora_id,
        asistente_id: asistente.id,
        tipo_documento_id: tipoDocumentoId,
        dias,
        prorrogado_por: req.usuarioPanel.id,
      })
      .select('id, hasta')
      .single();
    if (error) {
      if (error.code === '23503') throw new ErrorConMotivo('tipo_de_documento_invalido', error.message);
      throw errorDeDocumentos(error) ?? error;
    }

    await registrarActividad(req.usuarioPanel, ACCION_MODIFICACION_CRITICA, {
      tablaAfectada: 'prorrogas_de_gracia_documento',
      registroId: data.id,
      camposCambiados: ['dias', 'hasta'],
    });

    res.json({ ok: true, hasta: data.hasta });
  } catch (error) {
    return responderError(res, error);
  }
});

// ---------------------------------------------------------------------------
// Cargar un documento desde el Panel: queda aprobado por quien lo carga
// ---------------------------------------------------------------------------

panelDocumentosAsistenteRouter.post('/', soloAdministracion, recibirDocumento, async (req, res) => {
  const db = clienteDelPedido(req);
  let ruta = null;
  try {
    const cuerpo = req.body ?? {};
    const asistente = await asistenteVisible(db, cuerpo.asistente_id);
    if (!asistente) throw new ErrorConMotivo('asistente_no_encontrado');
    if (!cuerpo.tipo_documento_id) throw new ErrorConMotivo('faltan_datos');

    const { datos } = await validarDocumento(db, {
      prestadoraId: asistente.prestadora_id,
      tipoDocumentoId: cuerpo.tipo_documento_id,
      cuerpo,
    });

    if (req.file) {
      ruta = await subirArchivoDelDocumento(db, {
        prestadoraId: asistente.prestadora_id,
        asistenteId: asistente.id,
        archivo: req.file,
      });
    }

    const ahora = new Date().toISOString();
    const { data: documento, error } = await db
      .from(TABLA)
      .insert({
        ...datos,
        prestadora_id: asistente.prestadora_id,
        asistente_id: asistente.id,
        ruta_archivo: ruta,
        estado: 'aprobado',
        cargado_por: req.usuarioPanel.id,
        revisado_por: req.usuarioPanel.id,
        revisado_at: ahora,
      })
      .select(COLUMNAS_DEL_DOCUMENTO)
      .single();
    if (error) throw errorDeLaBase(error);
    // Desde acá el archivo tiene su fila: si algo falla después, no se borra.
    ruta = null;

    await registrarActividad(req.usuarioPanel, ACCION_MODIFICACION_CRITICA, {
      tablaAfectada: TABLA,
      registroId: documento.id,
      camposCambiados: ['estado', 'fecha_emision', 'fecha_vencimiento', 'numero', 'organismo_id', 'ruta_archivo'],
    });

    res.status(201).json({ ok: true, documento });
  } catch (error) {
    // Un archivo subido sin su fila queda suelto en el depósito y nadie lo va a mirar: se intenta
    // borrar.
    if (ruta) {
      try {
        await db.storage.from(DEPOSITO_DE_DOCUMENTOS).remove([ruta]);
      } catch (e) {
        console.error('No se pudo sacar el archivo de un documento que no se guardó:', e?.message ?? e);
      }
    }
    return responderError(res, error);
  }
});
