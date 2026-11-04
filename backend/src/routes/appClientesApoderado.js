import { Router } from 'express';
import { requiereRolCliente } from '../middleware/requiereRolCliente.js';
import { enLaPrestadora } from '../db/connection.js';
import { soloElTitular } from '../utils/accesosDePersonasAutorizadas.js';
import { responderError } from '../utils/errorConMotivo.js';
import { normalizarIdioma } from '../i18n/idiomas.js';
import {
  enlaceDelPoder,
  estadoDelApoderado,
  nombrarApoderado,
  quitarApoderado,
  recibirElPoder,
  reemplazarPoder,
} from '../utils/apoderado.js';

// El Apoderado, visto desde la aplicación del Cliente. Lo ve y lo maneja sólo el titular. Todo va con
// el trabajo de la Prestadora, porque el Cliente no lee ni escribe esa tabla ni ese depósito; cada
// función de la base recibe quién pide y vuelve a comprobar que sea el titular de ese Cliente.

export const appClientesApoderadoRouter = Router();

const soloTitular = [requiereRolCliente, soloElTitular];

function enSuPrestadora(req, motivo, trabajo) {
  return enLaPrestadora(req.usuarioCliente.prestadoraId, motivo, trabajo);
}

function delPedido(req, db) {
  return {
    db,
    clienteId: req.usuarioCliente.clienteId,
    prestadoraId: req.usuarioCliente.prestadoraId,
    funcion: req.params.funcion,
  };
}

function deQuienPide(req) {
  return { pUsuario: req.usuarioCliente.id, cargadoPor: req.usuarioCliente.id };
}

appClientesApoderadoRouter.get('/:funcion', ...soloTitular, async (req, res) => {
  try {
    res.json(await enSuPrestadora(req, 'ver al Apoderado', (db) =>
      estadoDelApoderado({ ...delPedido(req, db), idioma: normalizarIdioma(req.query.idioma) })));
  } catch (err) {
    responderError(res, err);
  }
});

appClientesApoderadoRouter.post('/:funcion', ...soloTitular, ...recibirElPoder, async (req, res) => {
  try {
    await enSuPrestadora(req, 'nombrar al Apoderado', (db) =>
      nombrarApoderado({ ...delPedido(req, db), ...deQuienPide(req), datos: req.body, archivo: req.file }));
    res.json({ ok: true });
  } catch (err) {
    responderError(res, err);
  }
});

appClientesApoderadoRouter.post('/:funcion/poder', ...soloTitular, ...recibirElPoder, async (req, res) => {
  try {
    await enSuPrestadora(req, 'cargar el poder del Apoderado', (db) =>
      reemplazarPoder({ ...delPedido(req, db), ...deQuienPide(req), archivo: req.file }));
    res.json({ ok: true });
  } catch (err) {
    responderError(res, err);
  }
});

appClientesApoderadoRouter.post('/:funcion/quitar', ...soloTitular, async (req, res) => {
  try {
    await enSuPrestadora(req, 'quitar al Apoderado', (db) =>
      quitarApoderado({ ...delPedido(req, db), ...deQuienPide(req) }));
    res.json({ ok: true });
  } catch (err) {
    responderError(res, err);
  }
});

appClientesApoderadoRouter.get('/:funcion/poder', ...soloTitular, async (req, res) => {
  try {
    const url = await enSuPrestadora(req, 'ver el poder del Apoderado', (db) =>
      enlaceDelPoder(delPedido(req, db)));
    res.json({ url });
  } catch (err) {
    responderError(res, err);
  }
});
