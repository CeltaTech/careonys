import { Router } from 'express';
import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import { exigirOrganizacionActiva } from '../middleware/alcancePrestadora.js';
import { exigirAdministracion } from '../middleware/exigirAdministracion.js';
import { clienteDelPedido } from '../db/connection.js';
import { ErrorConMotivo, responderError } from '../utils/errorConMotivo.js';
import { ACCION_EXPORTACION, registrarActividadSinFalta } from '../utils/registroDeActividad.js';
import { DERECHOS_DE_LA_PERSONA } from '../i18n/derechosDeLaPersona.js';
import { datosDeLaPersona } from '../utils/datosDeLaPersona.js';

// LO QUE UNA PERSONA PIDE SOBRE SUS DATOS, visto desde el Panel. Lo maneja sólo la administración
// de la Prestadora: cargar la solicitud, verla con su vencimiento, marcarla respondida y bajar los
// datos de la persona para entregárselos.
//
// El vencimiento no lo calcula esta ruta: lo calcula la base al cargar la solicitud, con el plazo
// del país de la Prestadora. Todo va con la credencial de quien pide; la base vuelve a comprobar que
// sea la administración de su Prestadora.

export const panelDerechosDeLaPersonaRouter = Router();

const soloAdministracion = exigirAdministracion('Solo Admin o Superadmin puede gestionar los derechos de la persona');
const deLaAdministracion = [requiereRolPanel, exigirOrganizacionActiva, soloAdministracion];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** El error de la base, dicho con un motivo que la pantalla traduce. */
function motivoDeLaBase(error) {
  if (error?.code === '23503') return new ErrorConMotivo('no_encontrado', error.message);
  if (error?.code === '42501') return new ErrorConMotivo('sin_permiso', error.message);
  if (error?.message === 'fecha_invalida') return new ErrorConMotivo('fecha_invalida', error.message);
  if (error?.message === 'ya_resuelta') return new ErrorConMotivo('ya_resuelta', error.message);
  return new Error(error?.message ?? 'error de la base');
}

const COLUMNAS = 'id, persona_id, tipo, recibida_en, vence_en, estado, respondida_en, cargada_en, '
  + 'persona:personas(nombre, apellido)';

// Cargar una solicitud. La fecha en que se recibió es opcional: sin ella, ahora.
panelDerechosDeLaPersonaRouter.post('/', ...deLaAdministracion, async (req, res) => {
  try {
    const { persona_id: personaId, tipo, recibida_en: recibidaEn } = req.body ?? {};
    if (!UUID.test(String(personaId ?? '')) || !DERECHOS_DE_LA_PERSONA.includes(tipo)) {
      throw new ErrorConMotivo('faltan_datos');
    }
    if (recibidaEn !== undefined && recibidaEn !== null && Number.isNaN(Date.parse(recibidaEn))) {
      throw new ErrorConMotivo('fecha_invalida');
    }

    const fila = { prestadora_id: req.usuarioPanel.prestadoraId, persona_id: personaId, tipo };
    if (recibidaEn) fila.recibida_en = new Date(recibidaEn).toISOString();

    const { data, error } = await clienteDelPedido(req)
      .from('solicitudes_de_derechos')
      .insert(fila)
      .select(COLUMNAS)
      .single();
    if (error) throw motivoDeLaBase(error);
    res.status(201).json(data);
  } catch (err) {
    responderError(res, err);
  }
});

// Las solicitudes de la Prestadora, la que vence primero arriba; las que no tienen plazo, al final.
panelDerechosDeLaPersonaRouter.get('/', ...deLaAdministracion, async (req, res) => {
  try {
    const { data, error } = await clienteDelPedido(req)
      .from('solicitudes_de_derechos')
      .select(COLUMNAS)
      .eq('prestadora_id', req.usuarioPanel.prestadoraId)
      .order('vence_en', { ascending: true, nullsFirst: false })
      .order('recibida_en', { ascending: true });
    if (error) throw motivoDeLaBase(error);
    res.json(data ?? []);
  } catch (err) {
    responderError(res, err);
  }
});

// Marcarla respondida. Quién y cuándo los anota la base.
panelDerechosDeLaPersonaRouter.post('/:id/respondida', ...deLaAdministracion, async (req, res) => {
  try {
    if (!UUID.test(req.params.id)) throw new ErrorConMotivo('no_encontrado');
    const { data, error } = await clienteDelPedido(req)
      .from('solicitudes_de_derechos')
      .update({ estado: 'respondida' })
      .eq('id', req.params.id)
      .eq('prestadora_id', req.usuarioPanel.prestadoraId)
      .select(COLUMNAS)
      .maybeSingle();
    if (error) throw motivoDeLaBase(error);
    if (!data) throw new ErrorConMotivo('no_encontrado');
    res.json(data);
  } catch (err) {
    responderError(res, err);
  }
});

// Los datos de una persona, en un archivo para entregárselos. La lectura de la información de salud
// queda anotada en el registro de accesos, y la exportación en el registro de actividad. Si la
// exportación no se pudo anotar, no se entrega nada.
panelDerechosDeLaPersonaRouter.get('/personas/:personaId/exportacion', ...deLaAdministracion, async (req, res) => {
  try {
    if (!UUID.test(req.params.personaId)) throw new ErrorConMotivo('no_encontrado');
    const datos = await datosDeLaPersona(clienteDelPedido(req), req.params.personaId, req.usuarioPanel.prestadoraId);
    if (!datos) throw new ErrorConMotivo('no_encontrado');

    await registrarActividadSinFalta(req.usuarioPanel, ACCION_EXPORTACION, {
      tablaAfectada: 'personas',
      registroId: req.params.personaId,
      detalle: { metodo: req.method, ruta: String(req.originalUrl ?? '').split('?')[0] },
    });

    res.setHeader('Content-Disposition', `attachment; filename="datos-${req.params.personaId}.json"`);
    res.json(datos);
  } catch (err) {
    responderError(res, err);
  }
});
