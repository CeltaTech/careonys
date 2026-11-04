import { Router } from 'express';
import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import { exigirOrganizacionActiva } from '../middleware/alcancePrestadora.js';
import { clienteDelPedido } from '../db/connection.js';
import { requierePermiso } from '../utils/permisos.js';
import { ErrorConMotivo, responderError } from '../utils/errorConMotivo.js';
import { ACCION_MODIFICACION_CRITICA, registrarActividad } from '../utils/registroDeActividad.js';
import { normalizarIdioma } from '../i18n/idiomas.js';
import {
  enlaceDelPoder,
  estadoDelApoderado,
  nombrarApoderado,
  quitarApoderado,
  recibirElPoder,
  reemplazarPoder,
  revisarApoderado,
} from '../utils/apoderado.js';

// El Apoderado de un Cliente, visto desde el Panel. La contraparte de la aplicación está en
// `appClientesApoderado.js`. Todo va con la credencial de quien pide; aprobar y observar los deja
// sólo a la administración la función de la base.

export const panelApoderadoRouter = Router();

const puedeVer = [requiereRolPanel, exigirOrganizacionActiva, requierePermiso('editar_datos_cliente')];
const puedeGestionar = [requiereRolPanel, exigirOrganizacionActiva, requierePermiso('registrar_consentimiento_pagador')];
const puedeRevisar = [requiereRolPanel, exigirOrganizacionActiva];

async function clienteDeLaRuta(req) {
  const { data, error } = await clienteDelPedido(req)
    .from('clientes')
    .select('id, prestadora_id')
    .eq('id', req.params.clienteId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new ErrorConMotivo('no_encontrado');
  return data;
}

// La fila la lee la credencial de quien pide: la de otra Prestadora no la ve.
async function apoderadoDeLaRuta(req) {
  const { data, error } = await clienteDelPedido(req)
    .from('apoderados')
    .select('id, cliente_id, prestadora_id, funcion')
    .eq('id', req.params.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new ErrorConMotivo('no_encontrado');
  return data;
}

function auditar(req, registroId, detalle) {
  return registrarActividad(req.usuarioPanel, ACCION_MODIFICACION_CRITICA, {
    tablaAfectada: 'apoderados',
    registroId,
    detalle,
  });
}

panelApoderadoRouter.get('/cliente/:clienteId/:funcion', ...puedeVer, async (req, res) => {
  try {
    const cliente = await clienteDeLaRuta(req);
    res.json(await estadoDelApoderado({
      db: clienteDelPedido(req),
      clienteId: cliente.id,
      prestadoraId: cliente.prestadora_id,
      funcion: req.params.funcion,
      idioma: normalizarIdioma(req.query.idioma),
    }));
  } catch (err) {
    responderError(res, err);
  }
});

panelApoderadoRouter.post('/cliente/:clienteId/:funcion', ...puedeGestionar, ...recibirElPoder, async (req, res) => {
  try {
    const cliente = await clienteDeLaRuta(req);
    const id = await nombrarApoderado({
      db: clienteDelPedido(req),
      clienteId: cliente.id,
      prestadoraId: cliente.prestadora_id,
      funcion: req.params.funcion,
      datos: req.body,
      archivo: req.file,
      cargadoPor: req.usuarioPanel.id,
    });
    await auditar(req, id, `Nombró Apoderado para ${req.params.funcion}`);
    res.json({ ok: true });
  } catch (err) {
    responderError(res, err);
  }
});

panelApoderadoRouter.post('/cliente/:clienteId/:funcion/poder', ...puedeGestionar, ...recibirElPoder, async (req, res) => {
  try {
    const cliente = await clienteDeLaRuta(req);
    const id = await reemplazarPoder({
      db: clienteDelPedido(req),
      clienteId: cliente.id,
      prestadoraId: cliente.prestadora_id,
      funcion: req.params.funcion,
      archivo: req.file,
      cargadoPor: req.usuarioPanel.id,
    });
    await auditar(req, id, `Cargó el poder del Apoderado para ${req.params.funcion}`);
    res.json({ ok: true });
  } catch (err) {
    responderError(res, err);
  }
});

panelApoderadoRouter.post('/cliente/:clienteId/:funcion/quitar', ...puedeGestionar, async (req, res) => {
  try {
    const cliente = await clienteDeLaRuta(req);
    await quitarApoderado({
      db: clienteDelPedido(req),
      clienteId: cliente.id,
      prestadoraId: cliente.prestadora_id,
      funcion: req.params.funcion,
      cargadoPor: req.usuarioPanel.id,
    });
    await auditar(req, cliente.id, `Quitó al Apoderado para ${req.params.funcion}`);
    res.json({ ok: true });
  } catch (err) {
    responderError(res, err);
  }
});

panelApoderadoRouter.get('/cliente/:clienteId/:funcion/poder', ...puedeVer, async (req, res) => {
  try {
    const cliente = await clienteDeLaRuta(req);
    res.json({
      url: await enlaceDelPoder({
        db: clienteDelPedido(req),
        clienteId: cliente.id,
        prestadoraId: cliente.prestadora_id,
        funcion: req.params.funcion,
      }),
    });
  } catch (err) {
    responderError(res, err);
  }
});

panelApoderadoRouter.post('/:id/aprobar', ...puedeRevisar, async (req, res) => {
  try {
    await revisarApoderado({
      db: clienteDelPedido(req),
      fila: await apoderadoDeLaRuta(req),
      aprobar: true,
      cargadoPor: req.usuarioPanel.id,
    });
    await auditar(req, req.params.id, 'Aprobó el poder del Apoderado');
    res.json({ ok: true });
  } catch (err) {
    responderError(res, err);
  }
});

panelApoderadoRouter.post('/:id/observar', ...puedeRevisar, async (req, res) => {
  try {
    await revisarApoderado({
      db: clienteDelPedido(req),
      fila: await apoderadoDeLaRuta(req),
      aprobar: false,
      motivo: typeof req.body?.motivo === 'string' ? req.body.motivo : null,
      cargadoPor: req.usuarioPanel.id,
    });
    await auditar(req, req.params.id, 'Observó el poder del Apoderado');
    res.json({ ok: true });
  } catch (err) {
    responderError(res, err);
  }
});
