import { Router } from 'express';
import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import { exigirOrganizacionActiva } from '../middleware/alcancePrestadora.js';
import { clienteDelPedido } from '../db/connection.js';
import { requierePermiso } from '../utils/permisos.js';
import { ErrorConMotivo, responderError } from '../utils/errorConMotivo.js';
import { normalizarIdioma } from '../i18n/idiomas.js';
import { contactosDelPedido, estadoDeLosContactos, reemplazarContactos } from '../utils/contactosDeEmergencia.js';

// Los contactos de emergencia de un Cliente, vistos desde el Panel. La contraparte de la aplicación
// del Cliente está en `appClientesContactosDeEmergencia.js`. Todo va con la credencial de quien
// pide: la base decide si la ve y si la puede cambiar, y anota el cambio en el registro de actividad.

export const panelContactosDeEmergenciaRouter = Router();

const puedeVer = [requiereRolPanel, exigirOrganizacionActiva];
const puedeCambiar = [requiereRolPanel, exigirOrganizacionActiva, requierePermiso('editar_datos_cliente')];

// La fila la lee la credencial de quien pide: el Cliente de otra Prestadora no lo ve.
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

panelContactosDeEmergenciaRouter.get('/cliente/:clienteId', ...puedeVer, async (req, res) => {
  try {
    const cliente = await clienteDeLaRuta(req);
    res.json(await estadoDeLosContactos({
      db: clienteDelPedido(req),
      clienteId: cliente.id,
      prestadoraId: cliente.prestadora_id,
      idioma: normalizarIdioma(req.query.idioma),
    }));
  } catch (err) {
    responderError(res, err);
  }
});

panelContactosDeEmergenciaRouter.put('/cliente/:clienteId', ...puedeCambiar, async (req, res) => {
  try {
    const contactos = contactosDelPedido(req.body);
    const cliente = await clienteDeLaRuta(req);
    const db = clienteDelPedido(req);
    await reemplazarContactos({ db, clienteId: cliente.id, contactos });
    res.json(await estadoDeLosContactos({
      db,
      clienteId: cliente.id,
      prestadoraId: cliente.prestadora_id,
      idioma: normalizarIdioma(req.query.idioma),
    }));
  } catch (err) {
    responderError(res, err);
  }
});
