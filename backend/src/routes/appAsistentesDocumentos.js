import { Router } from 'express';
import { requiereRolAsistente } from '../middleware/requiereRolAsistente.js';
import { clienteDelPedido } from '../db/connection.js';
import { exigeVisible, visibilidadDelPedido } from '../utils/visibilidadPrestadora.js';
import { esRutaDeDocumentoDe } from '../utils/archivosSubidos.js';
import { ErrorConMotivo, responderError } from '../utils/errorConMotivo.js';
import { estaEnviado, estadoVisible, llegaVencido } from '../utils/estadoDelDocumento.js';
import {
  DEPOSITO_DE_DOCUMENTOS,
  errorDeLaBase,
  recibirDocumento,
  subirArchivoDelDocumento,
  validarDocumento,
} from '../utils/cargaDeDocumento.js';

// Los documentos que la Prestadora le pide al Asistente, vistos desde su teléfono.
//
// Ver cómo están sus documentos no se apaga nunca: si le falta uno que le impide trabajar, tiene
// derecho a saber cuál. Cargarlos desde el teléfono sí se apaga, con la opción
// `asistente_carga_sus_documentos`; apagada, los carga la Prestadora desde el Panel.
//
// El Asistente carga y nada más: lo que manda entra en revisión, y aprobarlo es de la Prestadora.
// El interesado no se aprueba a sí mismo, y la base lo hace cumplir con la política
// `asistente_carga_sus_documentos`, que sólo le deja insertar filas en revisión a su nombre.
//
// CON LA CREDENCIAL DE QUIEN PIDE. Todo entra con `clienteDelPedido(req)`: la base le contesta
// sólo lo suyo, y el depósito lo deja subir y abrir sólo la carpeta de su Legajo.

export const appAsistentesDocumentosRouter = Router();

appAsistentesDocumentosRouter.use(requiereRolAsistente);

const OPCION_DE_CARGA = 'asistente_carga_sus_documentos';

async function diasAvisoDe(db, prestadoraId) {
  const { data } = await db
    .from('prestadoras')
    .select('dias_aviso_vencimiento_documentos')
    .eq('id', prestadoraId)
    .maybeSingle();
  return data?.dias_aviso_vencimiento_documentos ?? null;
}

async function puedeCargar(req) {
  const visibilidad = await visibilidadDelPedido(req);
  return visibilidad[OPCION_DE_CARGA] === true;
}

// El renglón de la vista para un documento que se le pide a este Asistente, o null si no se le pide.
async function pedidoDelTipo(db, asistenteId, tipoDocumentoId) {
  const { data, error } = await db
    .from('documentos_pedidos_al_asistente')
    .select('tipo_documento_id, nombre, impide_trabajar, documento_id, estado, fecha_vencimiento, motivo_observacion')
    .eq('asistente_id', asistenteId)
    .eq('tipo_documento_id', tipoDocumentoId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

// ---------------------------------------------------------------------------
// Sus documentos, con cuántos lleva enviados
// ---------------------------------------------------------------------------

appAsistentesDocumentosRouter.get('/', async (req, res) => {
  try {
    const db = clienteDelPedido(req);
    const { asistenteId, prestadoraId } = req.usuarioAsistente;

    const { data: pedidos, error } = await db
      .from('documentos_pedidos_al_asistente')
      .select('tipo_documento_id, nombre, impide_trabajar, documento_id, estado, fecha_vencimiento, motivo_observacion')
      .eq('asistente_id', asistenteId)
      .order('nombre');
    if (error) throw error;

    const diasAviso = await diasAvisoDe(db, prestadoraId);
    const hoy = new Date();
    const documentos = (pedidos ?? []).map((p) => ({
      tipo_documento_id: p.tipo_documento_id,
      nombre: p.nombre,
      impide_trabajar: p.impide_trabajar,
      documento_id: p.documento_id,
      estado: p.estado,
      estado_visible: estadoVisible(p, diasAviso, hoy),
      fecha_vencimiento: p.fecha_vencimiento,
      motivo_observacion: p.motivo_observacion,
    }));

    res.json({
      documentos,
      enviados: documentos.filter(estaEnviado).length,
      total: documentos.length,
      puede_cargar: await puedeCargar(req),
    });
  } catch (error) {
    return responderError(res, error);
  }
});

// ---------------------------------------------------------------------------
// Un documento: qué se pide y cómo está el último que mandó
// ---------------------------------------------------------------------------

appAsistentesDocumentosRouter.get('/tipo/:tipoDocumentoId', async (req, res) => {
  try {
    const db = clienteDelPedido(req);
    const { asistenteId, prestadoraId } = req.usuarioAsistente;

    const pedido = await pedidoDelTipo(db, asistenteId, req.params.tipoDocumentoId);
    if (!pedido) throw new ErrorConMotivo('documento_no_encontrado');

    const { data: tipo, error: errorTipo } = await db
      .from('tipos_documento_asistente')
      .select('id, nombre, vencimiento, periodo_cantidad, periodo_unidad, lleva_numero, requisitos, enlace_para_obtenerlo')
      .eq('id', pedido.tipo_documento_id)
      .maybeSingle();
    if (errorTipo) throw errorTipo;
    if (!tipo) throw new ErrorConMotivo('documento_no_encontrado');

    const { data: otorgantes, error: errorOtorgantes } = await db
      .from('organismos_por_tipo_documento')
      .select('organismo_id')
      .eq('tipo_documento_id', tipo.id);
    if (errorOtorgantes) throw errorOtorgantes;
    const idsDeOrganismos = (otorgantes ?? []).map((o) => o.organismo_id);

    let organismos = [];
    if (idsDeOrganismos.length) {
      const { data, error } = await db
        .from('organismos_otorgantes')
        .select('id, nombre, orden')
        .in('id', idsDeOrganismos)
        .order('orden');
      if (error) throw error;
      organismos = (data ?? []).map((o) => ({ id: o.id, nombre: o.nombre }));
    }

    let ultimo = null;
    if (pedido.documento_id) {
      const { data, error } = await db
        .from('documentos_asistente')
        .select('numero, organismo_id')
        .eq('id', pedido.documento_id)
        .maybeSingle();
      if (error) throw error;
      ultimo = data ?? null;
    }

    const diasAviso = await diasAvisoDe(db, prestadoraId);

    res.json({
      tipo_documento_id: tipo.id,
      nombre: tipo.nombre,
      vencimiento: tipo.vencimiento,
      periodo_cantidad: tipo.periodo_cantidad,
      periodo_unidad: tipo.periodo_unidad,
      lleva_numero: tipo.lleva_numero,
      requisitos: tipo.requisitos,
      enlace_para_obtenerlo: tipo.enlace_para_obtenerlo,
      organismos,
      documento_id: pedido.documento_id,
      estado: pedido.estado,
      estado_visible: estadoVisible(pedido, diasAviso),
      motivo_observacion: pedido.motivo_observacion,
      fecha_vencimiento: pedido.fecha_vencimiento,
      numero: ultimo?.numero ?? null,
      organismo_id: ultimo?.organismo_id ?? null,
      puede_cargar: await puedeCargar(req),
    });
  } catch (error) {
    return responderError(res, error);
  }
});

// ---------------------------------------------------------------------------
// Mandar un documento: entra en revisión
//
// Llega en un solo envío —los datos y el archivo juntos— para que no quede a mitad de camino.
// ---------------------------------------------------------------------------

appAsistentesDocumentosRouter.post('/', exigeVisible(OPCION_DE_CARGA), recibirDocumento, async (req, res) => {
  const db = clienteDelPedido(req);
  let ruta = null;
  try {
    const cuerpo = req.body ?? {};
    if (!cuerpo.tipo_documento_id || !req.file) throw new ErrorConMotivo('faltan_datos');

    // La Prestadora y el Legajo con los que se guarda son los que la base ya dejó ver, no un dato
    // del pedido.
    const { data: asistente } = await db
      .from('asistentes')
      .select('id, prestadora_id')
      .eq('id', req.usuarioAsistente.asistenteId)
      .maybeSingle();
    if (!asistente) throw new ErrorConMotivo('asistente_no_encontrado');

    // Sólo los documentos que se le piden a él.
    const pedido = await pedidoDelTipo(db, asistente.id, cuerpo.tipo_documento_id);
    if (!pedido) throw new ErrorConMotivo('tipo_de_documento_invalido');

    const { tipo, fechas, datos } = await validarDocumento(db, {
      prestadoraId: asistente.prestadora_id,
      tipoDocumentoId: cuerpo.tipo_documento_id,
      cuerpo,
    });

    const vencido = llegaVencido(tipo, fechas);
    if (vencido) {
      const error = new ErrorConMotivo('documento_ya_vencido');
      error.fecha = vencido.fecha;
      throw error;
    }

    ruta = await subirArchivoDelDocumento(db, {
      prestadoraId: asistente.prestadora_id,
      asistenteId: asistente.id,
      archivo: req.file,
    });

    const { data: documento, error } = await db
      .from('documentos_asistente')
      .insert({
        ...datos,
        prestadora_id: asistente.prestadora_id,
        asistente_id: asistente.id,
        ruta_archivo: ruta,
        estado: 'en_revision',
        cargado_por: req.usuarioAsistente.id,
      })
      .select('id, tipo_documento_id, estado, fecha_emision, fecha_vencimiento, numero, organismo_id, created_at')
      .single();
    if (error) throw errorDeLaBase(error);

    res.status(201).json({ ok: true, documento });
  } catch (error) {
    // Un archivo subido sin su fila queda suelto en el depósito y nadie lo va a mirar: se intenta
    // borrar. El Asistente puede borrar de su carpeta sólo el archivo que ninguna fila nombra.
    if (ruta) {
      try {
        const { error: errorAlBorrar } = await db.storage.from(DEPOSITO_DE_DOCUMENTOS).remove([ruta]);
        if (errorAlBorrar) throw errorAlBorrar;
      } catch (e) {
        console.error('No se pudo sacar el archivo de un documento que no se guardó:', e?.message ?? e);
      }
    }
    return responderError(res, error);
  }
});

// ---------------------------------------------------------------------------
// Ver el archivo que mandó: enlace temporal de un minuto
// ---------------------------------------------------------------------------

appAsistentesDocumentosRouter.get('/:documentoId/archivo-url', async (req, res) => {
  try {
    const db = clienteDelPedido(req);
    const { asistenteId, prestadoraId } = req.usuarioAsistente;
    const { data: documento, error } = await db
      .from('documentos_asistente')
      .select('id, ruta_archivo')
      .eq('id', req.params.documentoId)
      .eq('asistente_id', asistenteId)
      .maybeSingle();
    if (error) throw error;
    if (!documento || !esRutaDeDocumentoDe(documento.ruta_archivo, prestadoraId, asistenteId)) {
      throw new ErrorConMotivo('documento_no_encontrado');
    }
    const { data, error: errorEnlace } = await db.storage
      .from(DEPOSITO_DE_DOCUMENTOS)
      .createSignedUrl(documento.ruta_archivo, 60);
    if (errorEnlace) throw errorEnlace;
    res.json({ url: data.signedUrl });
  } catch (error) {
    return responderError(res, error);
  }
});
