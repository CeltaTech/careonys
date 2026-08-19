import { Router } from 'express';
import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import { acotarAPrestadora, exigirOrganizacionActiva } from '../middleware/alcancePrestadora.js';
import { supabase } from '../db/connection.js';
import {
  crearCuentaConPerfil,
  crearAsistenteDirecto,
  crearClienteDirecta,
  invitarMiembroPersonasAutorizadas,
  revocarMiembroPersonasAutorizadas,
  validarTipoAsistente,
  deshacerAlta,
  FILAS_DE_UN_ASISTENTE,
  FILAS_DE_UNA_CLIENTE,
} from '../utils/cuentasPanel.js';
import { ErrorConMotivo, responderError } from '../utils/errorConMotivo.js';
import { reenviarActivacionCuenta } from '../utils/activacionCuenta.js';
import { tienePermiso, permisosEfectivos } from '../utils/permisos.js';

export const panelCuentasRouter = Router();

// Crear una cuenta real (Auth + perfil) es una acción sensible y difícil de revertir —
// se restringe a Admin/Superadmin, a diferencia del resto del panel que también admite Coordinador.
function requiereAdmin(req, res, next) {
  if (!['admin_prestadora', 'superadmin'].includes(req.usuarioPanel?.rol)) {
    return res.status(403).json({ error: 'Solo Admin puede crear cuentas' });
  }
  next();
}

// Alta desde Postulación/Solicitud (rutas /cliente y /asistente, más abajo) se queda
// admin-only sin cambios — el motor de permisos de la Fase 2 (docs/PENDIENTES.md, plan
// aprobado) solo cubre el alta manual (/cliente-directa y /asistente-directo), que es lo
// que el plan pidió hacer configurable para Coordinador.
function requierePermiso(accion) {
  return async (req, res, next) => {
    const permitido = await tienePermiso({ accion, usuarioId: req.usuarioPanel?.id });
    if (!permitido) {
      return res.status(403).json({ error: 'La Prestadora no habilitó esta acción' });
    }
    next();
  };
}

// Usado por el frontend (botones "Nuevo Asistente"/"Nueva Cliente", campos de edición de
// Fase 1) para saber qué mostrar sin duplicar la lógica de permisos en el cliente — la
// única fuente de verdad sigue siendo este chequeo del lado del servidor.
panelCuentasRouter.get('/permisos-efectivos', requiereRolPanel, async (req, res) => {
  try {
    res.json({ permisos: await permisosEfectivos(req.usuarioPanel.id) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PRD_08 (docs/PRD_08_Dashboard_Modalidades.md, aprobado 2026-07-24): qué modalidades de
// negocio (directa/match/subcontratacion) tiene activas la Prestadora, para que el menú
// del Panel muestre solo los grupos que correspondan. Lectura disponible para cualquier rol
// logueado (igual que permisos-efectivos) — activar/desactivar sigue siendo exclusivo de
// admin_prestadora vía PATCH /api/panel/configuracion/modalidades (panelConfiguracion.js).
panelCuentasRouter.get('/modalidades-activas', requiereRolPanel, async (req, res) => {
  if (!req.usuarioPanel.prestadoraId) {
    return res.json({ modalidades: [] });
  }
  const { data, error } = await supabase
    .from('prestadora_modalidades')
    .select('modalidad')
    .eq('prestadora_id', req.usuarioPanel.prestadoraId)
    .eq('activa', true);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ modalidades: (data || []).map((f) => f.modalidad) });
});

panelCuentasRouter.post('/cliente', requiereRolPanel, exigirOrganizacionActiva, requiereAdmin, async (req, res) => {
  const { solicitudId } = req.body;
  if (!solicitudId) {
    return res.status(400).json({ error: 'Falta solicitudId' });
  }

  let querySolicitud = supabase.from('solicitudes').select('*').eq('id', solicitudId);
  querySolicitud = acotarAPrestadora(querySolicitud, req.usuarioPanel);
  const { data: solicitud, error: errorSolicitud } = await querySolicitud.single();

  if (errorSolicitud || !solicitud) {
    return res.status(404).json({ error: 'Solicitud no encontrada' });
  }
  if (solicitud.cliente_id) {
    return res.status(409).json({ error: 'Esta solicitud ya tiene un Cliente asociada' });
  }

  const prestadoraId = req.usuarioPanel.prestadoraId;

  let clienteId;
  try {
    ({ userId: clienteId } = await crearCuentaConPerfil({
      email: solicitud.email,
      nombre: solicitud.nombre,
      telefono: solicitud.telefono,
      rol: 'cliente',
      prestadoraId,
      enviarActivacion: true,
    }));

    const { error: errorCliente } = await supabase
      .from('clientes')
      .insert({ id: clienteId, solicitud_id: solicitudId, prestadora_id: prestadoraId });
    if (errorCliente) throw new Error(errorCliente.message);

    const { data: paciente, error: errorPaciente } = await supabase
      .from('pacientes')
      .insert({
        cliente_id: clienteId,
        nombre: solicitud.nombre_paciente || solicitud.nombre,
        domicilio: solicitud.localidad,
        prestadora_id: prestadoraId,
      })
      .select()
      .single();
    if (errorPaciente) throw new Error(errorPaciente.message);

    // SEGURIDAD: depende de que el SELECT de arriba (línea ~23) ya haya validado que
    // `solicitudId` pertenece al tenant del solicitante — no llamar este UPDATE con un
    // id que no haya pasado por ese filtro.
    const { error: errorUpdate } = await supabase
      .from('solicitudes')
      .update({ cliente_id: clienteId })
      .eq('id', solicitudId);
    if (errorUpdate) throw new Error(errorUpdate.message);

    res.json({ ok: true, clienteId, pacienteId: paciente.id });
  } catch (error) {
    await deshacerAlta(clienteId, { prestadoraId, filas: FILAS_DE_UNA_CLIENTE });
    responderError(res, error);
  }
});

// Alta manual de Cliente+Paciente (sin Solicitud previa) — cubre el caso de una
// Prestadora que llega a Careonys con una cartera de clientes ya en atención.
// Se crea igual una fila de `solicitudes` (canal 'alta_manual') para que el contacto
// del Cliente siga viviendo en un único lugar (evita reproducir el bug de contacto
// en blanco que tenían los Clientes sembradas sin solicitud vinculada).
panelCuentasRouter.post('/cliente-directa', requiereRolPanel, exigirOrganizacionActiva, requierePermiso('alta_manual_cliente'), async (req, res) => {
  const { nombreContacto, telefono, email, localidad, nombrePaciente, domicilioPaciente } = req.body;
  try {
    const { clienteId, pacienteId } = await crearClienteDirecta({
      nombreContacto, telefono, email, localidad, nombrePaciente, domicilioPaciente,
      prestadoraId: req.usuarioPanel.prestadoraId,
    });
    res.json({ ok: true, clienteId, pacienteId });
  } catch (error) {
    responderError(res, error);
  }
});

// Inicia el Proceso de Incorporación de Asistentes (uso interno del Panel, ver glosario
// de CLAUDE.md): crea la cuenta real de Asistente a partir de una postulación aprobada,
// y registra las etapas de verificacion_asistente configuradas por esa Prestadora
// (pendiente #18 candidato 7, docs/PENDIENTES.md — cada Prestadora define su propio plan
// de incorporación en etapas_incorporacion_asistente, ya no hay 5 etapas fijas para todas).
// La primera etapa (menor "orden") queda aprobada de entrada porque ya se cumplió: es la
// postulación misma, que ya pasó.
panelCuentasRouter.post('/asistente', requiereRolPanel, exigirOrganizacionActiva, requiereAdmin, async (req, res) => {
  // `tipo_asistente_id` es obligatorio: el tipo decide si a esta persona se le va a exigir
  // Matrícula vigente para poder atender. Lo elige quien aprueba, mirando la postulación —
  // no se adivina a partir del texto que la persona escribió en el formulario público.
  const { postulacionId, tipo_asistente_id } = req.body;
  if (!postulacionId) {
    return res.status(400).json({ error: 'Falta postulacionId' });
  }
  if (!tipo_asistente_id) {
    return res.status(400).json({ error: 'Falta indicar el tipo de Asistente' });
  }

  let queryPostulacion = supabase.from('postulaciones').select('*').eq('id', postulacionId);
  queryPostulacion = acotarAPrestadora(queryPostulacion, req.usuarioPanel);
  const { data: postulacion, error: errorPostulacion } = await queryPostulacion.single();

  if (errorPostulacion || !postulacion) {
    return res.status(404).json({ error: 'Postulación no encontrada' });
  }
  if (postulacion.asistente_id) {
    return res.status(409).json({ error: 'Esta postulación ya tiene un Asistente asociado' });
  }

  const prestadoraId = req.usuarioPanel.prestadoraId;

  let asistenteId;
  try {
    const tipoAsistenteId = await validarTipoAsistente(tipo_asistente_id, prestadoraId);

    ({ userId: asistenteId } = await crearCuentaConPerfil({
      email: postulacion.email,
      nombre: postulacion.nombre,
      telefono: postulacion.telefono,
      rol: 'asistente',
      zonas: postulacion.zonas.split(',').map((z) => z.trim()).filter(Boolean),
      prestadoraId,
      enviarActivacion: true,
    }));

    const { error: errorAsistente } = await supabase.from('asistentes').insert({
      id: asistenteId,
      nombre: postulacion.nombre,
      dni: postulacion.dni,
      telefono: postulacion.telefono,
      email: postulacion.email,
      tipo_asistente_id: tipoAsistenteId,
      zonas: postulacion.zonas.split(',').map((z) => z.trim()).filter(Boolean),
      estado: 'inactivo',
      prestadora_id: prestadoraId,
    });
    if (errorAsistente) throw new Error(errorAsistente.message);

    const { data: etapas, error: errorEtapas } = await supabase
      .from('etapas_incorporacion_asistente')
      .select('clave')
      .eq('prestadora_id', prestadoraId)
      .eq('activa', true)
      .order('orden');
    if (errorEtapas) throw new Error(errorEtapas.message);
    if (!etapas || etapas.length === 0) {
      throw new ErrorConMotivo('sin_etapas_incorporacion', 'La Prestadora no tiene etapas de incorporación activas');
    }

    const filasVerificacion = etapas.map(({ clave }, indice) => ({
      asistente_id: asistenteId,
      etapa: clave,
      estado: indice === 0 ? 'aprobada' : 'pendiente',
      revisado_por: indice === 0 ? req.usuarioPanel.id : null,
      completado_en: indice === 0 ? new Date().toISOString() : null,
    }));
    const { error: errorVerificaciones } = await supabase.from('verificaciones_asistente').insert(filasVerificacion);
    if (errorVerificaciones) throw new Error(errorVerificaciones.message);

    // SEGURIDAD: depende de que el SELECT de arriba (línea ~100) ya haya validado que
    // `postulacionId` pertenece al tenant del solicitante — no llamar este UPDATE con un
    // id que no haya pasado por ese filtro.
    const { error: errorUpdate } = await supabase
      .from('postulaciones')
      .update({ asistente_id: asistenteId })
      .eq('id', postulacionId);
    if (errorUpdate) throw new Error(errorUpdate.message);

    res.json({ ok: true, asistenteId });
  } catch (error) {
    // `deshacerAlta` nunca falla: si tropieza lo anota en el registro del servidor y sigue.
    // Así el error que llega a la pantalla es siempre el problema de verdad, y la respuesta
    // se manda siempre — antes, un tropiezo del deshacer dejaba a la pantalla esperando.
    await deshacerAlta(asistenteId, { prestadoraId, filas: FILAS_DE_UN_ASISTENTE });
    responderError(res, error);
  }
});

// Alta manual de Asistente (sin Postulación previa) — cubre el caso de una Prestadora
// que llega a Careonys con un equipo que ya venía trabajando desde antes. Entra activo
// por defecto y, a diferencia de /asistente, no genera filas en `verificaciones_asistente`
// (equivalente al default 'omitir' del pendiente #18 — política de verificación por
// prestadora; la Fase 2 de este trabajo suma la configuración para cambiar este comportamiento).
panelCuentasRouter.post('/asistente-directo', requiereRolPanel, exigirOrganizacionActiva, requierePermiso('alta_manual_asistente'), async (req, res) => {
  const { nombre, telefono, email, dni, tipo_asistente_id, zonas, estado, tipo_vinculo, categoria_cct, valor_hora, sueldo_basico, horas_semanales } = req.body;
  try {
    const { asistenteId } = await crearAsistenteDirecto({
      nombre, telefono, email, dni, tipo_asistente_id, zonas, estado,
      tipo_vinculo, categoria_cct, valor_hora, sueldo_basico, horas_semanales,
      prestadoraId: req.usuarioPanel.prestadoraId,
      usuarioPanelId: req.usuarioPanel.id,
    });
    res.json({ ok: true, asistenteId });
  } catch (error) {
    responderError(res, error);
  }
});

// ============================================================================
// Personas autorizadas (Fase 5) — reutiliza el permiso 'editar_datos_cliente' ya existente:
// gestionar quién más tiene acceso al Cliente es parte de administrar sus datos, no una
// acción nueva (ver docs/claude_history.md).
// ============================================================================

panelCuentasRouter.get('/cliente/:clienteId/personas autorizadas', requiereRolPanel, exigirOrganizacionActiva, requierePermiso('editar_datos_cliente'), async (req, res) => {
  let queryCliente = supabase.from('clientes').select('id').eq('id', req.params.clienteId);
  queryCliente = acotarAPrestadora(queryCliente, req.usuarioPanel);
  const { data: cliente } = await queryCliente.maybeSingle();
  if (!cliente) {
    return res.status(404).json({ error: 'Cliente no encontrada' });
  }

  const { data: miembros, error } = await supabase
    .from('miembros_cliente')
    .select('usuario_id, email, rol, created_at, usuarios!miembros_cliente_usuario_id_fkey(nombre)')
    .eq('cliente_id', req.params.clienteId)
    .order('created_at', { ascending: true });
  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ miembros: miembros || [] });
});

panelCuentasRouter.post('/cliente/:clienteId/personas autorizadas', requiereRolPanel, exigirOrganizacionActiva, requierePermiso('editar_datos_cliente'), async (req, res) => {
  const { nombre, email, telefono } = req.body || {};
  const prestadoraId = req.usuarioPanel.prestadoraId;

  let queryCliente = supabase.from('clientes').select('id').eq('id', req.params.clienteId);
  queryCliente = acotarAPrestadora(queryCliente, req.usuarioPanel);
  const { data: cliente } = await queryCliente.maybeSingle();
  if (!cliente) {
    return res.status(404).json({ error: 'Cliente no encontrada' });
  }

  try {
    const { miembroId } = await invitarMiembroPersonasAutorizadas({
      email,
      nombre,
      telefono,
      clienteId: req.params.clienteId,
      prestadoraId,
      invitadoPor: req.usuarioPanel.id,
    });
    res.json({ ok: true, usuarioId: miembroId });
  } catch (error) {
    responderError(res, error);
  }
});

panelCuentasRouter.delete('/cliente/:clienteId/personas autorizadas/:usuarioId', requiereRolPanel, requierePermiso('editar_datos_cliente'), async (req, res) => {
  const prestadoraId = req.usuarioPanel.prestadoraId;

  let queryCliente = supabase.from('clientes').select('id').eq('id', req.params.clienteId);
  queryCliente = acotarAPrestadora(queryCliente, req.usuarioPanel);
  const { data: cliente } = await queryCliente.maybeSingle();
  if (!cliente) {
    return res.status(404).json({ error: 'Cliente no encontrada' });
  }

  try {
    await revocarMiembroPersonasAutorizadas(req.params.usuarioId, { prestadoraId, clienteId: req.params.clienteId });
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Reenviar el email de activación (pendiente #75) — cubre el token vencido (7 días) o
// simplemente extraviado. Solo para Cliente/Asistente/Personas autorizadas (mismo alcance que el envío
// automático de crearCuentaConPerfil); Coordinador/Admin/Superadmin siguen con el flujo
// manual de panelUsuarios.js y no tienen esta ruta disponible.
panelCuentasRouter.post('/:usuarioId/reenviar-activacion', requiereRolPanel, exigirOrganizacionActiva, requiereAdmin, async (req, res) => {
  const prestadoraId = req.usuarioPanel.prestadoraId;

  let queryUsuario = supabase.from('usuarios').select('id, rol, prestadora_id').eq('id', req.params.usuarioId);
  queryUsuario = acotarAPrestadora(queryUsuario, req.usuarioPanel);
  const { data: usuario } = await queryUsuario.maybeSingle();

  if (!usuario) {
    return res.status(404).json({ error: 'Cuenta no encontrada' });
  }
  if (!['cliente', 'asistente'].includes(usuario.rol)) {
    return res.status(400).json({ error: 'Esta cuenta no usa el flujo de activación por email' });
  }

  try {
    await reenviarActivacionCuenta(usuario.id);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
