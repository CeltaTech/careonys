import { Router } from 'express';
import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import { exigirOrganizacionActiva } from '../middleware/alcancePrestadora.js';
import { clienteDelPedido } from '../db/connection.js';
import { responderError } from '../utils/errorConMotivo.js';
import { logoParaDocumentos } from '../utils/logoParaImpresion.js';

/* El membrete de los documentos que arma el Panel.
   ================================================

   Todo documento imprimible de la Prestadora lleva arriba su membrete: el logo y el nombre. El
   Panel lo dibuja (`panel/src/lib/membrete.js`) y le pide acá el logo, que es lo único que no
   tiene a mano. Lo pide quien genera el documento, que puede ser la Administración o quien
   coordina; por eso no vive en Configuración, que es sólo de la Administración.

   Con la sesión de quien pide: el depósito del logo para impresión le deja leer sólo al personal
   de la Prestadora, y sólo en su carpeta. */

export const panelMembreteRouter = Router();

panelMembreteRouter.use(requiereRolPanel, exigirOrganizacionActiva);

panelMembreteRouter.get('/logo', async (req, res) => {
  try {
    res.json({ logo: await logoParaDocumentos(clienteDelPedido(req)) });
  } catch (error) {
    responderError(res, error);
  }
});
