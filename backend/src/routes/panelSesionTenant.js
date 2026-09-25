import { Router } from 'express';
import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import { supabase } from '../db/connection.js';
import { responderError } from '../utils/errorConMotivo.js';

// Sesión de soporte técnico — pendiente #30.
// Es la única puerta por la que superadmin entra a una Prestadora real: una por vez, nunca
// varias a la vez, con banner visible, auditoría de todo y tope de tiempo. Fuera de esta
// sesión, superadmin solo ve su propia Organización (Sandbox) — CLAUDE.md §5.
// El corte por 5 min de inactividad vive en requiereRolPanel.js (se aplica en cada request,
// no solo acá).
// Etapa 2 de la separación CeltaTech / Careonys (2026-07-28): esta maquinaria era de
// admin_plataforma, el rol comercial que se fue entero a CeltaTech. No se borró — se
// re-apuntó a superadmin y pasó a llamarse sesión de soporte técnico.
export const panelSesionTenantRouter = Router();

// Ítem G del pendiente #30: login/logout/renovación son la parte de "todo login" del log
// de auditoría — se registran acá porque pasan por el backend (service role), no por RLS
// directo (tabla auditoria_soporte_tecnico). No bloquea la respuesta al
// frontend si falla: la auditoría no debe poder tumbar el flujo real de sesión.
async function registrarAuditoria({ adminId, prestadoraId, tipoEvento, detalle }) {
  const { error } = await supabase.from('auditoria_soporte_tecnico').insert({
    admin_id: adminId,
    prestadora_id: prestadoraId,
    tipo_evento: tipoEvento,
    detalle: detalle || null,
  });
  if (error) console.error('Error registrando auditoría de soporte técnico:', error.message);
}

const SESION_DURACION_MS = 60 * 60 * 1000; // tope absoluto de 60 min, extendido por /renovar
const INACTIVIDAD_LIMITE_MS = 5 * 60 * 1000; // debe coincidir con requiereRolPanel.js

function requiereSoporteTecnico(req, res, next) {
  if (req.usuarioPanel?.rol !== 'superadmin') {
    return res.status(403).json({ error: 'Solo Superadmin puede abrir una sesión de soporte técnico dentro de una Prestadora' });
  }
  next();
}

// Este endpoint es el que el frontend hace polling cada 30s (TenantSessionContext) — por eso
// es el que efectivamente cierra (salida_at) una sesión vencida por tope absoluto o por
// inactividad, así el banner desaparece solo sin que el usuario tenga que hacer nada.
async function buscarSesionVigenteYCerrarSiVencio(adminId) {
  // SIN PRESTADORA A PROPÓSITO
  // Lo que se busca es en qué Prestadora quien da soporte tiene una sesión abierta, sin saber de
  // antemano en cuál: el dato que se quiere es justamente el que haría falta para filtrar. Y quien
  // da soporte no pertenece a ninguna —su Organización propia es la de pruebas—, así que acotarla
  // a la suya no encontraría nunca la sesión abierta en otra, y el cartel nunca se apagaría. El
  // cierre por vencimiento que viene abajo sí la nombra, y sale de esta misma fila.
  const { data: sesion, error } = await supabase
    .from('sesiones_soporte_tecnico')
    // La moneda viaja con la sesión porque los importes que se muestran y se guardan durante
    // el soporte son de la Prestadora visitada, no de la de quien mira (regla 14, §7).
    .select('id, prestadora_id, entrada_at, expira_at, ultima_actividad_at, prestadoras(nombre_fantasia, moneda)')
    .eq('admin_id', adminId)
    .is('salida_at', null)
    .order('entrada_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!sesion) return null;

  const ahora = new Date();
  const vencioPorTope = new Date(sesion.expira_at) <= ahora;
  const vencioPorInactividad = ahora.getTime() - new Date(sesion.ultima_actividad_at).getTime() > INACTIVIDAD_LIMITE_MS;

  if (vencioPorTope || vencioPorInactividad) {
    // La Prestadora sale de la sesión que se está cerrando, y no de quien pide: quien da soporte
    // no pertenece a ninguna. Nombrarla es lo que hace que este cierre no pueda tocar la sesión
    // abierta en otra Organización.
    await supabase
      .from('sesiones_soporte_tecnico')
      .update({ salida_at: ahora.toISOString() })
      .eq('id', sesion.id)
      .eq('prestadora_id', sesion.prestadora_id);
    await registrarAuditoria({
      adminId,
      prestadoraId: sesion.prestadora_id,
      tipoEvento: 'logout',
      detalle: { motivo: vencioPorTope ? 'tope_60min' : 'inactividad_5min' },
    });
    return null;
  }
  return sesion;
}

panelSesionTenantRouter.get('/', requiereRolPanel, requiereSoporteTecnico, async (req, res) => {
  try {
    const sesion = await buscarSesionVigenteYCerrarSiVencio(req.usuarioPanel.id);
    res.json({ sesion });
  } catch (err) {
    responderError(res, err);
  }
});

panelSesionTenantRouter.post('/actividad', requiereRolPanel, requiereSoporteTecnico, async (req, res) => {
  try {
    const sesion = await buscarSesionVigenteYCerrarSiVencio(req.usuarioPanel.id);
    if (!sesion) return res.json({ ok: true, sesion: null });

    const { error } = await supabase
      .from('sesiones_soporte_tecnico')
      .update({ ultima_actividad_at: new Date().toISOString() })
      .eq('id', sesion.id)
      .eq('prestadora_id', sesion.prestadora_id);

    if (error) return responderError(res, error);
    res.json({ ok: true, sesion });
  } catch (err) {
    responderError(res, err);
  }
});

panelSesionTenantRouter.post('/', requiereRolPanel, requiereSoporteTecnico, async (req, res) => {
  const { prestadora_id } = req.body;
  if (!prestadora_id) {
    return res.status(400).json({ error: 'Falta prestadora_id' });
  }

  // SIN PRESTADORA A PROPÓSITO
  // ÉSTA ES LA ÚNICA CONSULTA QUE MIRA A PROPÓSITO TODAS LAS ORGANIZACIONES, y no se le puede
  // poner el filtro: lo que pregunta es si esta persona ya tiene una sesión abierta en alguna
  // Prestadora, que es lo que hace cumplir «una por vez». Acotarla a la que se está por abrir
  // contestaría que no hay ninguna y dejaría dos abiertas a la vez, que es justo lo que la regla
  // impide. No devuelve ningún dato de la Organización encontrada: sólo que existe.
  const { data: sesionVigente } = await supabase
    .from('sesiones_soporte_tecnico')
    .select('id')
    .eq('admin_id', req.usuarioPanel.id)
    .is('salida_at', null)
    .maybeSingle();

  if (sesionVigente) {
    return res.status(409).json({ error: 'Ya hay una sesión de prestadora activa — hace falta salir de ella antes de entrar a otra' });
  }

  const { data: prestadora } = await supabase.from('prestadoras').select('id').eq('id', prestadora_id).maybeSingle();
  if (!prestadora) {
    return res.status(404).json({ error: 'Prestadora inexistente' });
  }

  const ahora = new Date();
  const { data: sesion, error } = await supabase
    .from('sesiones_soporte_tecnico')
    .insert({
      admin_id: req.usuarioPanel.id,
      prestadora_id,
      entrada_at: ahora.toISOString(),
      ultima_actividad_at: ahora.toISOString(),
      expira_at: new Date(ahora.getTime() + SESION_DURACION_MS).toISOString(),
    })
    .select('prestadora_id, entrada_at, expira_at')
    .single();

  if (error) return responderError(res, error);
  await registrarAuditoria({ adminId: req.usuarioPanel.id, prestadoraId: prestadora_id, tipoEvento: 'login' });
  res.json({ ok: true, sesion });
});

panelSesionTenantRouter.post('/renovar', requiereRolPanel, requiereSoporteTecnico, async (req, res) => {
  try {
    const sesion = await buscarSesionVigenteYCerrarSiVencio(req.usuarioPanel.id);
    if (!sesion) {
      return res.status(409).json({ error: 'No hay sesión de prestadora activa para renovar' });
    }

    const ahora = new Date();
    const { error } = await supabase
      .from('sesiones_soporte_tecnico')
      .update({
        ultima_actividad_at: ahora.toISOString(),
        expira_at: new Date(ahora.getTime() + SESION_DURACION_MS).toISOString(),
      })
      .eq('id', sesion.id)
      .eq('prestadora_id', sesion.prestadora_id);

    if (error) return responderError(res, error);
    await registrarAuditoria({ adminId: req.usuarioPanel.id, prestadoraId: sesion.prestadora_id, tipoEvento: 'renovacion' });
    res.json({ ok: true });
  } catch (err) {
    responderError(res, err);
  }
});

panelSesionTenantRouter.post('/salir', requiereRolPanel, requiereSoporteTecnico, async (req, res) => {
  // SIN PRESTADORA A PROPÓSITO
  // Se busca sin nombrar Organización por el mismo motivo que al entrar: quien da soporte no
  // pertenece a ninguna, y lo que se busca es la única que pueda tener abierta, esté donde esté.
  // El identificador de esa Prestadora es lo que esta lectura viene a averiguar —sale en el
  // `select`—, así que exigirlo antes sería pedir el dato que todavía no se tiene. La escritura
  // que cierra la sesión, tres renglones más abajo, sí lo nombra y lo toma de esta fila.
  const { data: sesionSaliente } = await supabase
    .from('sesiones_soporte_tecnico')
    .select('id, prestadora_id')
    .eq('admin_id', req.usuarioPanel.id)
    .is('salida_at', null)
    .maybeSingle();

  // Salir sin ninguna sesión abierta no es un error: no hay nada que cerrar.
  if (!sesionSaliente) return res.json({ ok: true });

  // La escritura sí la nombra, y sale de la fila encontrada: cierra esa sesión y ninguna otra.
  const { error } = await supabase
    .from('sesiones_soporte_tecnico')
    .update({ salida_at: new Date().toISOString() })
    .eq('id', sesionSaliente.id)
    .eq('prestadora_id', sesionSaliente.prestadora_id)
    .is('salida_at', null);

  if (error) return responderError(res, error);
  await registrarAuditoria({ adminId: req.usuarioPanel.id, prestadoraId: sesionSaliente.prestadora_id, tipoEvento: 'logout', detalle: { motivo: 'manual' } });
  res.json({ ok: true });
});
