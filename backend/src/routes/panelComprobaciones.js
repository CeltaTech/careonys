import { Router } from 'express';
import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import { exigirOrganizacionActiva } from '../middleware/alcancePrestadora.js';
import { topeDePedidos } from '../middleware/topeDePedidos.js';
import { responderError } from '../utils/errorConMotivo.js';
import {
  pedidosEsperandoAutorizacion,
  autorizarIngreso,
  llegadasSinComprobar,
  cerrarSinComprobar,
} from '../utils/comprobacionDePresencia.js';

export const panelComprobacionesRouter = Router();

/* El pase de guardia visto desde la Prestadora (pendiente #113).
 *
 * DOS LISTAS Y NADA MÁS. Una es urgente y la otra no:
 *
 *   `/pedidos` — el Asistente está parado en la puerta, no puede leer el código QR y pidió
 *   autorización. Espera. Quien coordina hace las verificaciones que acostumbre y autoriza el
 *   ingreso, que vale lo mismo que el código QR.
 *
 *   `/sin-comprobar` — la llegada ya ocurrió y el Asistente entró igual, porque la guardia nunca
 *   se traba. Queda anotada para que el Coordinador la mire después y la cierre.
 *
 * LA PRESTADORA LA PONE EL BACKEND, NUNCA EL PEDIDO. Las cuatro rutas resuelven la Organización con
 * `req.usuarioPanel.prestadoraId`, que ya trae la del permiso de acceso si hay uno abierto. Un
 * identificador de otra Prestadora no se distingue de uno que no existe: las dos cosas contestan
 * `no_encontrado`.
 *
 * POR QUÉ ALCANZA `requiereRolPanel`. Autorizar un ingreso y cerrar una llegada sin comprobar son
 * trabajo operativo del turno, igual que marcar una ausencia (`panelGuardias.js`), y el
 * Coordinador es quien está mirando la pantalla cuando entra el pedido. Si alguna Prestadora
 * quisiera reservárselo a su administración, se agrega la acción al catálogo de permisos y se
 * cuelga `requierePermiso(...)` acá; hoy ninguna lo pidió y el catálogo no se infla por las
 * dudas.
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

/** Las llegadas y salidas que quedaron sin comprobar y todavía nadie cerró. */
panelComprobacionesRouter.get('/sin-comprobar', requiereRolPanel, exigirOrganizacionActiva, async (req, res) => {
  try {
    res.json(await llegadasSinComprobar(req.usuarioPanel.prestadoraId));
  } catch (e) {
    responderError(res, e);
  }
});

/* Cerrar no es aprobar ni rechazar: es decir que alguien la miró. Lo que se averiguó va en la
 * nota, y la fila queda con quién la cerró y cuándo. */
panelComprobacionesRouter.post('/:id/cerrar', requiereRolPanel, exigirOrganizacionActiva, async (req, res) => {
  try {
    await cerrarSinComprobar({
      comprobacionId: req.params.id,
      prestadoraId: req.usuarioPanel.prestadoraId,
      cerradaPor: req.usuarioPanel.id,
      nota: req.body?.nota,
    });
    res.json({ ok: true });
  } catch (e) {
    responderError(res, e);
  }
});
