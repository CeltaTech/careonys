import { Router } from 'express';
import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import { exigirOrganizacionActiva } from '../middleware/alcancePrestadora.js';
import { topeDePedidos } from '../middleware/topeDePedidos.js';
import { responderError } from '../utils/errorConMotivo.js';
import {
  pedidosEsperandoAutorizacion,
  autorizarIngreso,
} from '../utils/comprobacionDePresencia.js';

export const panelComprobacionesRouter = Router();

/* El pase de guardia visto desde la Prestadora (pendiente #113).
 *
 * El Asistente está parado en la puerta, no puede leer el código QR, pidió autorización y llamó a
 * quien coordina. Quien coordina encuentra su guardia en Guardias, hace las verificaciones que
 * acostumbre y autoriza el ingreso, que vale lo mismo que el código QR. Si nadie atiende, rigen
 * los protocolos que la Prestadora ya tenga para eso: el sistema no abre ninguna revisión
 * posterior.
 *
 * LA PRESTADORA LA PONE EL BACKEND, NUNCA EL PEDIDO. Las dos rutas resuelven la Organización con
 * `req.usuarioPanel.prestadoraId`, que ya trae la del permiso de acceso si hay uno abierto. Un
 * identificador de otra Prestadora no se distingue de uno que no existe: las dos cosas contestan
 * `no_encontrado`.
 *
 * POR QUÉ ALCANZA `requiereRolPanel`. Autorizar un ingreso es trabajo operativo del turno, igual
 * que marcar una ausencia (`panelGuardias.js`), y el Coordinador es quien atiende la llamada. Si
 * alguna Prestadora quisiera reservárselo a su administración, se agrega la acción al catálogo de
 * permisos y se cuelga `requierePermiso(...)` acá; hoy ninguna lo pidió y el catálogo no se infla
 * por las dudas.
 */

/** Los pedidos de autorización que están esperando a quien coordina. */
panelComprobacionesRouter.get('/pedidos', requiereRolPanel, exigirOrganizacionActiva, async (req, res) => {
  try {
    res.json(await pedidosEsperandoAutorizacion(req.usuarioPanel.prestadoraId));
  } catch (e) {
    responderError(res, e);
  }
});

/* Autoriza el ingreso de ese pedido. La llegada queda comprobada, con quién la autorizó y a qué
 * hora, y si hay un Asistente que se va, su salida queda autorizada en el mismo acto.
 *
 * LLEVA TOPE DE PEDIDOS POR MINUTO, como toda ruta que cambia el estado de una guardia desde
 * afuera del domicilio. */
panelComprobacionesRouter.post('/:id/autorizar', requiereRolPanel, exigirOrganizacionActiva, topeDePedidos({ nombre: 'comprobacion_autorizar_ingreso' }), async (req, res) => {
  try {
    res.json(
      await autorizarIngreso({
        comprobacionId: req.params.id,
        prestadoraId: req.usuarioPanel.prestadoraId,
        autorizadaPor: req.usuarioPanel.id,
      }),
    );
  } catch (e) {
    responderError(res, e);
  }
});
