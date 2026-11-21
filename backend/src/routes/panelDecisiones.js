// Las decisiones del Coordinador y el veto de la administración (paso 27, punto 4,
// docs/PLAN_HASTA_PRODUCCION.md).
//
// Cada decisión que toma un Coordinador en un Servicio la anota la base sola, con el estado de
// antes de cada cosa que cambió (`decisiones_de_coordinacion` y `cambios_de_la_decision`). Acá:
//
//   - la administración lee las decisiones de un Servicio y veta una, con motivo;
//   - el Coordinador lee las decisiones suyas que le vetaron y todavía no vio, y las marca vistas.
//
// CON LA CREDENCIAL DE QUIEN PIDE. Qué decisiones ve cada uno lo decide la RLS por la membresía de
// esa persona, y quién puede vetar lo decide `vetar_decision` adentro: sólo la administración de
// la misma Prestadora. El candado de acá adelante es el mismo, y no lo reemplaza.

import { Router } from 'express';
import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import { clienteDelPedido, enLaPrestadora } from '../db/connection.js';
import { exigirOrganizacionActiva } from '../middleware/alcancePrestadora.js';
import { exigirAdministracion } from '../middleware/exigirAdministracion.js';
import { ErrorConMotivo, responderError } from '../utils/errorConMotivo.js';
import { avisarElVeto } from '../utils/avisoVetoDeDecision.js';

export const panelDecisionesRouter = Router();

panelDecisionesRouter.use(requiereRolPanel);
panelDecisionesRouter.use(exigirOrganizacionActiva);

const soloAdministracion = exigirAdministracion('sin_permiso');

const MOTIVOS_DEL_VETO = ['sin_permiso', 'dato_invalido', 'decision_inexistente', 'decision_ya_vetada', 'decision_cambiada_despues'];

function errorDelVeto(error) {
  const texto = String(error?.message ?? '');
  const motivo = MOTIVOS_DEL_VETO.find((m) => texto === m || texto.startsWith(`${m}:`));
  return motivo ? new ErrorConMotivo(motivo, texto) : new Error(texto);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lo que se muestra de cada cosa que cambió: qué fue, y el día, el horario y quién, si los tiene. */
export function renglonDelCambio(cambio) {
  const fila = cambio.despues ?? cambio.antes ?? {};
  const antes = cambio.antes ?? {};
  const despues = cambio.despues ?? {};
  return {
    tabla: cambio.tabla,
    operacion: cambio.operacion,
    fecha: fila.fecha ?? null,
    hora_inicio: fila.hora_inicio ?? null,
    hora_fin: fila.hora_fin ?? null,
    asistente_antes: antes.asistente_id ?? antes.asistente_sustituto_id ?? null,
    asistente_despues: despues.asistente_id ?? despues.asistente_sustituto_id ?? null,
  };
}

async function nombresDe(prestadoraId, tabla, ids, trabajo) {
  const unicos = [...new Set(ids.filter(Boolean))];
  if (!unicos.length) return new Map();
  const { data } = await enLaPrestadora(prestadoraId, trabajo, (db) => db
    .from(tabla)
    .select(tabla === 'servicios' ? 'id, etiqueta' : 'id, nombre')
    .eq('prestadora_id', prestadoraId)
    .in('id', unicos));
  return new Map((data ?? []).map((f) => [f.id, f.nombre ?? f.etiqueta ?? null]));
}

// Las decisiones de un Servicio, de la más nueva a la más vieja, con lo que cambió cada una.
panelDecisionesRouter.get('/servicio/:servicioId', soloAdministracion, async (req, res) => {
  if (!UUID.test(req.params.servicioId)) return responderError(res, new ErrorConMotivo('dato_invalido'));
  const db = clienteDelPedido(req);
  const { data: decisiones, error } = await db
    .from('decisiones_de_coordinacion')
    .select('id, clase, decidida_por, decidida_at, vetada_at, vetada_por, motivo_del_veto')
    .eq('servicio_id', req.params.servicioId)
    .order('decidida_at', { ascending: false })
    .limit(200);
  if (error) return responderError(res, error);

  const ids = decisiones.map((d) => d.id);
  const { data: cambios, error: errorCambios } = ids.length
    ? await db
      .from('cambios_de_la_decision')
      .select('decision_id, orden, tabla, operacion, antes, despues')
      .in('decision_id', ids)
      .order('orden', { ascending: true })
    : { data: [], error: null };
  if (errorCambios) return responderError(res, errorCambios);

  const renglones = (cambios ?? []).map((c) => ({ decision_id: c.decision_id, ...renglonDelCambio(c) }));
  const prestadoraId = req.usuarioPanel.prestadoraId;
  // Los nombres, con el trabajo de esta Prestadora: quien decidió o quien vetó puede ser una cuenta
  // que hoy ya no alcanza la sesión, y la decisión quedaría sin nombre.
  const [personas, asistentes] = await Promise.all([
    nombresDe(prestadoraId, 'usuarios', decisiones.flatMap((d) => [d.decidida_por, d.vetada_por]), 'nombres de las decisiones'),
    nombresDe(prestadoraId, 'asistentes', renglones.flatMap((r) => [r.asistente_antes, r.asistente_despues]), 'nombres de las decisiones'),
  ]);

  res.json({
    decisiones: decisiones.map((d) => ({
      ...d,
      decidida_por_nombre: personas.get(d.decidida_por) ?? null,
      vetada_por_nombre: personas.get(d.vetada_por) ?? null,
      cambios: renglones
        .filter((r) => r.decision_id === d.id)
        .map(({ decision_id: _id, ...r }) => ({
          ...r,
          asistente_antes_nombre: asistentes.get(r.asistente_antes) ?? null,
          asistente_despues_nombre: asistentes.get(r.asistente_despues) ?? null,
        })),
    })),
  });
});

// El veto. La base deshace la decisión de ahora en adelante, en una sola operación, y deja la
// constancia en el registro de actividad. Los avisos salen después de contestar.
panelDecisionesRouter.post('/:id/vetar', soloAdministracion, async (req, res) => {
  try {
    if (!UUID.test(req.params.id)) throw new ErrorConMotivo('dato_invalido');
    const motivo = String(req.body?.motivo ?? '').trim();
    if (!motivo) throw new ErrorConMotivo('falta_el_motivo');
    if (motivo.length > 2000) throw new ErrorConMotivo('dato_invalido');

    const { data: resultado, error } = await clienteDelPedido(req).rpc('vetar_decision', {
      p_decision: req.params.id,
      p_motivo: motivo,
    });
    if (error) throw errorDelVeto(error);

    res.json({
      ok: true,
      deshechos: resultado?.deshechos ?? 0,
      salteados: resultado?.salteados ?? 0,
    });
    avisarElVeto(req.usuarioPanel.prestadoraId, resultado, motivo);
  } catch (error) {
    responderError(res, error);
  }
});

// Las decisiones de quien pide que le vetaron y todavía no vio. La RLS le deja ver sólo las suyas.
panelDecisionesRouter.get('/vetadas-sin-ver', async (req, res) => {
  const { data, error } = await clienteDelPedido(req)
    .from('decisiones_de_coordinacion')
    .select('id, clase, servicio_id, decidida_at, vetada_at, motivo_del_veto')
    .eq('decidida_por', req.usuarioPanel.id)
    .not('vetada_at', 'is', null)
    .is('vista_por_el_coordinador_at', null)
    .order('vetada_at', { ascending: false });
  if (error) return responderError(res, error);

  const servicios = await nombresDe(req.usuarioPanel.prestadoraId, 'servicios', data.map((d) => d.servicio_id), 'Servicios de las decisiones vetadas');
  res.json({
    vetadas: data.map((d) => ({ ...d, servicio_etiqueta: servicios.get(d.servicio_id) ?? null })),
  });
});

panelDecisionesRouter.patch('/:id/visto', async (req, res) => {
  try {
    if (!UUID.test(req.params.id)) throw new ErrorConMotivo('dato_invalido');
    const { data, error } = await clienteDelPedido(req).rpc('marcar_veto_visto', { p_decision: req.params.id });
    if (error) throw errorDelVeto(error);
    res.json({ ok: true, primeraVez: data === true });
  } catch (error) {
    responderError(res, error);
  }
});
