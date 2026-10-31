// El punto del mapa de un domicilio que el Panel guarda por su cuenta, como el domicilio temporal
// del Paciente.
//
// Quien carga el domicilio escribe la dirección y nada más: las coordenadas las saca el sistema,
// igual que en el alta del Paciente y de la Asistente. Las calcula `coordenadasDeDomicilio`, que es
// el único lugar que habla con el servicio de direcciones; esta ruta sólo le arma el pedido.
//
// **Va por POST y no por GET** porque la dirección es dato sensible, y en un GET viajaría escrita
// en la dirección web, que queda en los registros de cualquier intermediario (CLAUDE.md §6).
//
// **Nunca contesta un error por no poder ubicarla.** Si el servicio se cayó o no encontró la
// puerta, vuelven las dos coordenadas en nulo y el domicilio se guarda igual: el texto es el dato.

import { Router } from 'express';
import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import { exigirOrganizacionActiva } from '../middleware/alcancePrestadora.js';
import { enLaPrestadora } from '../db/connection.js';
import { coordenadasDeDomicilio } from '../geocodificacion/index.js';
import { nombreDelLugar } from '../utils/catalogoDeLugares.js';
import { domicilioEscrito, partesDelDomicilio } from '../utils/domicilioEscrito.js';
import { responderError } from '../utils/errorConMotivo.js';

export const panelCoordenadasRouter = Router();

panelCoordenadasRouter.use(requiereRolPanel, exigirOrganizacionActiva);

panelCoordenadasRouter.post('/', async (req, res) => {
  const prestadoraId = req.usuarioPanel.prestadoraId;
  const partes = partesDelDomicilio(req.body);
  try {
    // El nombre del lugar se busca en la Organización de quien llama: un lugar de otra no aporta
    // nombre, y la dirección se busca sin él.
    const lugar = await enLaPrestadora(prestadoraId, 'nombre del lugar de un domicilio', (db) =>
      nombreDelLugar(db, partes.lugar_id, prestadoraId),
    );
    res.json(
      await coordenadasDeDomicilio({
        prestadoraId,
        direccion: domicilioEscrito({ ...partes, lugar }) || null,
        localidad: lugar || undefined,
      }),
    );
  } catch (error) {
    responderError(res, error);
  }
});
