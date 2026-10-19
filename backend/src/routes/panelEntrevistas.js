import { Router } from 'express';
import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import { exigirOrganizacionActiva } from '../middleware/alcancePrestadora.js';
import { enLaPrestadora } from '../db/connection.js';
import { responderError } from '../utils/errorConMotivo.js';
import {
  ESTADO_ENTREVISTA,
  agendarEntrevista,
  cambiarEntrevistador,
  cancelarEntrevista,
  cargarInforme,
  entrevistasDeLaPostulacion,
  enlaceDeLaEntrevista,
  reprogramarEntrevista,
} from '../utils/entrevistaDePostulacion.js';
import {
  esLaMismaCuenta,
  personasDelPanel,
  responsableDelReclutamiento,
} from '../utils/responsableDelReclutamiento.js';

/* La entrevista de una postulación, desde el Panel.
   ================================================

   QUÉ HACE. Es la etapa de entrevista del Proceso de Incorporación de Asistentes
   (`docs/PRD_03_Reclutamiento.md`). El Responsable del reclutamiento la agenda y elige al
   Entrevistador, y mientras está agendada puede cambiarlo. El Entrevistador la mueve, la cancela o
   le carga el informe, que la deja realizada. Quién puede qué lo decide
   `utils/entrevistaDePostulacion.js`; esta ruta sólo le pasa quién pide.

   QUÉ NO HACE. No cambia la situación de la postulación: haber entrevistado a alguien no es
   haberlo aprobado, y esa decisión se toma en la pantalla de Postulantes.

   LA PRESTADORA SALE DE LA SESIÓN, nunca del pedido. Es `req.usuarioPanel.prestadoraId`, que ya
   resolvió el middleware: quien manda el pedido no elige a qué Prestadora le agenda una
   entrevista. Lo mismo hace que una postulación de otra Prestadora no exista para esta sesión, y
   por eso el motivo que sale es «no encontrado» y no «sin permiso»: desde afuera las dos tienen
   que verse iguales. */

export const panelEntrevistasRouter = Router();

const deLaSesion = (req) => ({
  prestadoraId: req.usuarioPanel.prestadoraId,
  postulacionId: req.params.postulacionId,
  usuarioId: req.usuarioPanel.id,
});

/** Los nombres de las cuentas que entrevistaron, por su identificador. */
async function nombresDeLosEntrevistadores(prestadoraId, ids) {
  const unicos = [...new Set(ids.filter(Boolean))];
  if (unicos.length === 0) return new Map();
  const { data, error } = await enLaPrestadora(prestadoraId, 'Nombres de los Entrevistadores', (db) => db
    .from('usuarios')
    .select('id, nombre')
    .eq('prestadora_id', prestadoraId)
    .in('id', unicos));
  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((fila) => [fila.id, fila.nombre]));
}

// Toda la historia de entrevistas de una postulación, la última primero, con lo que quien mira
// puede hacer. La lista de personas para elegir Entrevistador va sólo al Responsable, que es el
// único que elige.
panelEntrevistasRouter.get(
  '/:postulacionId',
  requiereRolPanel,
  exigirOrganizacionActiva,
  async (req, res) => {
    try {
      const { prestadoraId, postulacionId, usuarioId } = deLaSesion(req);
      const [filas, personas] = await Promise.all([
        entrevistasDeLaPostulacion({ prestadoraId, postulacionId }),
        personasDelPanel(prestadoraId),
      ]);
      const responsable = await responsableDelReclutamiento(prestadoraId, personas);
      const esResponsable = esLaMismaCuenta(responsable, usuarioId);
      const nombres = await nombresDeLosEntrevistadores(prestadoraId, filas.map((fila) => fila.entrevistador_id));

      // El enlace que copia el Panel es el mismo que le llega al postulante por correo.
      const entrevistas = await Promise.all(
        filas.map(async (fila) => ({
          ...fila,
          entrevistador_nombre: nombres.get(fila.entrevistador_id) ?? null,
          enlace: await enlaceDeLaEntrevista({ prestadoraId, llave: fila.llave_publica }),
        })),
      );
      const viva = filas.find((fila) => fila.estado === ESTADO_ENTREVISTA.AGENDADA);

      res.json({
        entrevistas,
        puede_agendar: esResponsable && !viva,
        puede_actuar: Boolean(viva) && esLaMismaCuenta(viva.entrevistador_id, usuarioId),
        puede_reasignar: Boolean(viva) && esResponsable,
        personas: esResponsable ? personas.map(({ id, nombre }) => ({ id, nombre })) : [],
      });
    } catch (error) {
      responderError(res, error);
    }
  },
);

panelEntrevistasRouter.post(
  '/:postulacionId',
  requiereRolPanel,
  exigirOrganizacionActiva,
  async (req, res) => {
    try {
      const entrevista = await agendarEntrevista({
        ...deLaSesion(req),
        agendadaPara: req.body?.agendada_para,
        entrevistadorId: req.body?.entrevistador_id || null,
      });
      res.status(201).json({ entrevista });
    } catch (error) {
      responderError(res, error);
    }
  },
);

// Mover la cita es `PATCH` y no otro `POST`: es la misma entrevista en otro momento, con la misma
// llave y la misma sala. Un `POST` crearía una segunda, y el postulante tendría dos citas.
panelEntrevistasRouter.patch(
  '/:postulacionId',
  requiereRolPanel,
  exigirOrganizacionActiva,
  async (req, res) => {
    try {
      const entrevista = await reprogramarEntrevista({
        ...deLaSesion(req),
        agendadaPara: req.body?.agendada_para,
      });
      res.json({ entrevista });
    } catch (error) {
      responderError(res, error);
    }
  },
);

panelEntrevistasRouter.patch(
  '/:postulacionId/entrevistador',
  requiereRolPanel,
  exigirOrganizacionActiva,
  async (req, res) => {
    try {
      const entrevista = await cambiarEntrevistador({
        ...deLaSesion(req),
        entrevistadorId: req.body?.entrevistador_id || null,
      });
      res.json({ entrevista });
    } catch (error) {
      responderError(res, error);
    }
  },
);

// El informe deja la entrevista realizada. Cancelarla es otra cosa y tiene su propia dirección,
// porque cancelar es que no va a pasar y esto es que ya pasó.
panelEntrevistasRouter.post(
  '/:postulacionId/informe',
  requiereRolPanel,
  exigirOrganizacionActiva,
  async (req, res) => {
    try {
      const entrevista = await cargarInforme({
        ...deLaSesion(req),
        informe: req.body?.informe,
      });
      res.json({ entrevista });
    } catch (error) {
      responderError(res, error);
    }
  },
);

panelEntrevistasRouter.post(
  '/:postulacionId/cancelacion',
  requiereRolPanel,
  exigirOrganizacionActiva,
  async (req, res) => {
    try {
      const entrevista = await cancelarEntrevista({
        ...deLaSesion(req),
        observaciones: req.body?.observaciones ?? null,
      });
      res.json({ entrevista });
    } catch (error) {
      responderError(res, error);
    }
  },
);
