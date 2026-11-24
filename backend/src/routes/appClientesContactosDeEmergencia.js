import { Router } from 'express';
import { requiereRolCliente } from '../middleware/requiereRolCliente.js';
import { enLaPrestadora } from '../db/connection.js';
import { soloElTitular } from '../utils/accesosDePersonasAutorizadas.js';
import { responderError } from '../utils/errorConMotivo.js';
import { normalizarIdioma } from '../i18n/idiomas.js';
import {
  contactosDelPedido,
  estadoDeLosContactos,
  personasParaElegir,
  reemplazarContactos,
} from '../utils/contactosDeEmergencia.js';

// Los contactos de emergencia, vistos desde la aplicación del Cliente. Los ve y los cambia sólo el
// titular. Todo va con el trabajo de la Prestadora, porque el Cliente no lee Contactos; la función de la base recibe quién pide y vuelve a comprobar que sea el titular.

export const appClientesContactosDeEmergenciaRouter = Router();

const soloTitular = [requiereRolCliente, soloElTitular];

function enSuPrestadora(req, motivo, trabajo) {
  return enLaPrestadora(req.usuarioCliente.prestadoraId, motivo, trabajo);
}

async function estadoParaElTitular(req, db) {
  const { clienteId, prestadoraId } = req.usuarioCliente;
  const estado = await estadoDeLosContactos({ db, clienteId, prestadoraId, idioma: normalizarIdioma(req.query.idioma) });
  return { ...estado, personas: await personasParaElegir({ db, clienteId }) };
}

appClientesContactosDeEmergenciaRouter.get('/', ...soloTitular, async (req, res) => {
  try {
    res.json(await enSuPrestadora(req, 'ver los contactos de emergencia', (db) => estadoParaElTitular(req, db)));
  } catch (err) {
    responderError(res, err);
  }
});

appClientesContactosDeEmergenciaRouter.put('/', ...soloTitular, async (req, res) => {
  try {
    const contactos = contactosDelPedido(req.body);
    res.json(await enSuPrestadora(req, 'cambiar los contactos de emergencia', async (db) => {
      await reemplazarContactos({
        db,
        clienteId: req.usuarioCliente.clienteId,
        contactos,
        pUsuario: req.usuarioCliente.id,
      });
      return estadoParaElTitular(req, db);
    }));
  } catch (err) {
    responderError(res, err);
  }
});
