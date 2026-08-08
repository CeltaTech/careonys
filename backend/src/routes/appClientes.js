import { Router } from 'express';
import { requiereRolCliente } from '../middleware/requiereRolCliente.js';
import { supabase } from '../db/connection.js';
import { resolverVitalesHabilitados } from '../utils/vitalesReferencia.js';
import { generarTokenQrCobro } from '../utils/qrCobroEfectivo.js';
import { medicacionVigenteDelPaciente } from '../utils/medicacionIndicaciones.js';

export const appClientesRouter = Router();

// pacientes.medicacion_habitual queda deprecado (pendiente #62, docs/PENDIENTES.md): la
// medicación vigente se deriva de indicaciones_medicacion (estado='aceptada'), nunca de
// este JSONB suelto.
async function pacienteDeLaCliente(pacienteId, usuarioCliente) {
  const { data } = await supabase
    .from('pacientes')
    .select('id, nombre, domicilio, lat, lng, patologias, nivel_complejidad, cliente_id, prestadora_id')
    .eq('id', pacienteId)
    .eq('cliente_id', usuarioCliente.clienteId)
    .eq('prestadora_id', usuarioCliente.prestadoraId)
    .maybeSingle();
  return data;
}

// ============================================================================
// Mi Perfil
// ============================================================================

appClientesRouter.get('/perfil', requiereRolCliente, async (req, res) => {
  // Identidad (nombre/teléfono) vive en `usuarios` — igual que el resto de los roles de
  // login propio (asistentes es la excepción: ahí la tabla de negocio y la de login son la
  // misma). `clientes` solo guarda el plan; el email lo tiene Supabase Auth, no una columna.
  const { data: usuario, error } = await supabase
    .from('usuarios')
    .select('nombre, telefono')
    .eq('id', req.usuarioCliente.id)
    .single();
  if (error || !usuario) {
    return res.status(404).json({ error: 'Perfil no encontrado' });
  }

  const { data: cliente } = await supabase
    .from('clientes')
    .select('plan')
    .eq('id', req.usuarioCliente.clienteId)
    .maybeSingle();

  res.json({
    perfil: {
      ...usuario,
      plan: cliente?.plan ?? null,
      rolPersonasAutorizadas: req.usuarioCliente.rolPersonasAutorizadas,
    },
  });
});

// ============================================================================
// Mis Pacientes — un solo Paciente: la app va directo a su pantalla (regla del PRD);
// varios: el frontend arma la lista con esta misma respuesta.
// ============================================================================

appClientesRouter.get('/pacientes', requiereRolCliente, async (req, res) => {
  const { data, error } = await supabase
    .from('pacientes')
    .select('id, nombre, domicilio')
    .eq('cliente_id', req.usuarioCliente.clienteId)
    .eq('prestadora_id', req.usuarioCliente.prestadoraId)
    .order('nombre');
  if (error) {
    return res.status(500).json({ error: error.message });
  }
  res.json({ pacientes: data });
});

// ============================================================================
// Pantalla del Paciente — guardia actual (con Asistente asignado, para que el frontend
// abra la suscripción Realtime a esa fila) o, si no hay ninguna activa, la próxima
// programada. Incluye alertas activas (nivel != verde, sin resolver) para el resumen.
// ============================================================================

appClientesRouter.get('/pacientes/:id', requiereRolCliente, async (req, res) => {
  const paciente = await pacienteDeLaCliente(req.params.id, req.usuarioCliente);
  if (!paciente) {
    return res.status(404).json({ error: 'Paciente no encontrado' });
  }

  const { data: guardiaActiva } = await supabase
    .from('guardias')
    .select('id, fecha, hora_inicio, hora_fin, estado, checkin_at, ubicacion_actual_lat, ubicacion_actual_lng, ubicacion_actual_at, asistente_id, asistentes(nombre, foto_url)')
    .eq('paciente_id', paciente.id)
    .eq('estado', 'activa')
    .order('fecha', { ascending: false })
    .limit(1)
    .maybeSingle();

  let guardiaProxima = null;
  if (!guardiaActiva) {
    const { data } = await supabase
      .from('guardias')
      // salida_checkin_at es lo que permite decirle al Cliente "en camino": el Asistente
      // ya salió de su casa pero todavía no llegó al domicilio.
      .select('id, fecha, hora_inicio, hora_fin, estado, salida_checkin_at, asistente_id, asistentes(nombre, foto_url)')
      .eq('paciente_id', paciente.id)
      .eq('estado', 'programada')
      .gte('fecha', new Date().toISOString().slice(0, 10))
      .order('fecha', { ascending: true })
      .order('hora_inicio', { ascending: true })
      .limit(1)
      .maybeSingle();
    guardiaProxima = data || null;
  }

  const { data: alertasActivas } = await supabase
    .from('alertas')
    .select('id, nivel, descripcion, created_at')
    .eq('paciente_id', paciente.id)
    .is('resuelta_at', null)
    .order('created_at', { ascending: false });

  const medicacionVigente = await medicacionVigenteDelPaciente(paciente.id);

  res.json({
    paciente: { ...paciente, medicacionVigente },
    guardiaActiva: guardiaActiva || null,
    guardiaProxima,
    alertasActivas: alertasActivas || [],
  });
});

// ============================================================================
// Reportes del Paciente
// ============================================================================

appClientesRouter.get('/pacientes/:id/reportes', requiereRolCliente, async (req, res) => {
  const paciente = await pacienteDeLaCliente(req.params.id, req.usuarioCliente);
  if (!paciente) {
    return res.status(404).json({ error: 'Paciente no encontrado' });
  }

  // El reporte dice de quién habla, así que se piden directo. Antes se los buscaba por los
  // turnos que cubrieron a esta persona, y eso traía también los reportes de los otros
  // Pacientes del mismo turno: el Cliente veía en la historia de su padre lo que se escribió
  // sobre el vecino de cuarto.
  const { data, error } = await supabase
    .from('reportes')
    .select(
      'id, texto_libre, alimentacion, medicacion, signos_vitales, estado_animo, incidentes, observaciones, foto_url, created_at, guardias!inner(fecha, asistente_id, asistentes(nombre))'
    )
    .eq('paciente_id', paciente.id)
    .order('created_at', { ascending: false })
    .limit(60);
  if (error) {
    return res.status(500).json({ error: error.message });
  }

  const vitales = await resolverVitalesHabilitados(paciente.id, paciente.prestadora_id);

  res.json({ reportes: data, rangosVitales: vitales.rangos });
});

// ============================================================================
// Alertas del Paciente (activas + historial resuelto — ver AI_PROMPTS.md IA Nivel 2)
// ============================================================================

appClientesRouter.get('/pacientes/:id/alertas', requiereRolCliente, async (req, res) => {
  const paciente = await pacienteDeLaCliente(req.params.id, req.usuarioCliente);
  if (!paciente) {
    return res.status(404).json({ error: 'Paciente no encontrado' });
  }

  const { data, error } = await supabase
    .from('alertas')
    .select('id, nivel, descripcion, campos_preocupantes, reportes_relacionados, resuelta_at, created_at')
    .eq('paciente_id', paciente.id)
    .order('created_at', { ascending: false })
    .limit(60);
  if (error) {
    return res.status(500).json({ error: error.message });
  }
  res.json({ alertas: data });
});

// ============================================================================
// Asistente Asignado — datos del Asistente que tuvo o tiene alguna guardia con este
// Paciente (RLS de asistentes/certificados ya lo acota a eso, ver schema_pwa_clientes_01.sql
// §3-4), estado del Certificado de Aptitud, evaluaciones anteriores, y el id de la guardia
// activa/última (para el botón de calificar).
// ============================================================================

appClientesRouter.get('/pacientes/:id/asistente', requiereRolCliente, async (req, res) => {
  const paciente = await pacienteDeLaCliente(req.params.id, req.usuarioCliente);
  if (!paciente) {
    return res.status(404).json({ error: 'Paciente no encontrado' });
  }

  const { data: guardia } = await supabase
    .from('guardias')
    .select('id, estado, asistente_id')
    .eq('paciente_id', paciente.id)
    .not('asistente_id', 'is', null)
    .order('fecha', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!guardia?.asistente_id) {
    return res.json({ asistente: null, certificado: null, evaluaciones: [], guardiaId: null });
  }

  const { data: asistente } = await supabase
    .from('asistentes')
    .select('id, nombre, foto_url, especialidades')
    .eq('id', guardia.asistente_id)
    .maybeSingle();

  const { data: certificado } = await supabase
    .from('certificados')
    .select('activo, fecha_vencimiento')
    .eq('asistente_id', guardia.asistente_id)
    .eq('activo', true)
    .order('fecha_vencimiento', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: evaluaciones } = await supabase
    .from('calificaciones_asistente')
    .select('id, estrellas, comentario, created_at')
    .eq('asistente_id', guardia.asistente_id)
    .eq('paciente_id', paciente.id)
    .order('created_at', { ascending: false });

  res.json({
    asistente: asistente || null,
    certificado: certificado || null,
    evaluaciones: evaluaciones || [],
    guardiaId: guardia.id,
  });
});

// ============================================================================
// Escanear Asistente: verifica que el qr_token escaneado corresponda al Asistente
// asignado a la guardia de HOY de ese Paciente (Etapa 6, rediseñada 2026-07-22,
// ver docs/claude_history.md).
// ============================================================================

appClientesRouter.get('/pacientes/:id/verificar-asistente/:qrToken', requiereRolCliente, async (req, res) => {
  const paciente = await pacienteDeLaCliente(req.params.id, req.usuarioCliente);
  if (!paciente) {
    return res.status(404).json({ error: 'Paciente no encontrado' });
  }

  const { data: asistenteEscaneado } = await supabase
    .from('asistentes')
    .select('id, nombre, foto_url, especialidades')
    .eq('qr_token', req.params.qrToken)
    .eq('prestadora_id', paciente.prestadora_id)
    .maybeSingle();

  if (!asistenteEscaneado) {
    return res.status(404).json({ error: 'qr_no_reconocido' });
  }

  const hoyISO = new Date().toISOString().slice(0, 10);

  const { data: guardiaHoy } = await supabase
    .from('guardias')
    .select('id, estado, hora_inicio, hora_fin, asistente_id')
    .eq('paciente_id', paciente.id)
    .eq('fecha', hoyISO)
    .order('hora_inicio', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!guardiaHoy) {
    return res.json({
      coincide: false,
      motivo: 'sin_guardia_hoy',
      asistenteEscaneado,
      guardia: null,
      certificado: null,
    });
  }

  // La guardia de hoy existe pero está sin cubrir. No es lo mismo que "no hay guardia":
  // hay servicio previsto y nadie asignado, y el Cliente tiene que poder distinguirlo —
  // si no, escanea el QR de alguien que se presentó y el sistema le contesta que hoy no
  // había nada previsto.
  if (!guardiaHoy.asistente_id) {
    return res.json({
      coincide: false,
      motivo: 'guardia_sin_cubrir',
      asistenteEscaneado,
      guardia: {
        id: guardiaHoy.id,
        estado: guardiaHoy.estado,
        horaInicio: guardiaHoy.hora_inicio,
        horaFin: guardiaHoy.hora_fin,
      },
      certificado: null,
    });
  }

  const coincide = guardiaHoy.asistente_id === asistenteEscaneado.id;

  const { data: certificado } = await supabase
    .from('certificados')
    .select('activo, fecha_vencimiento')
    .eq('asistente_id', asistenteEscaneado.id)
    .eq('activo', true)
    .order('fecha_vencimiento', { ascending: false })
    .limit(1)
    .maybeSingle();

  res.json({
    coincide,
    motivo: coincide ? 'asignado' : 'no_asignado',
    asistenteEscaneado,
    guardia: {
      id: guardiaHoy.id,
      estado: guardiaHoy.estado,
      horaInicio: guardiaHoy.hora_inicio,
      horaFin: guardiaHoy.hora_fin,
    },
    certificado: certificado || null,
  });
});

// ============================================================================
// Calificación del Asistente al cierre de una guardia (tabla calificaciones_asistente,
// ya existente desde el pendiente #13(b)).
// ============================================================================

appClientesRouter.post('/guardias/:guardiaId/calificar', requiereRolCliente, async (req, res) => {
  // Un miembro invitado con acceso de solo lectura ve todo lo mismo que el titular, pero no
  // puede calificar guardias — es la única acción de escritura real hoy expuesta a la
  // Cliente en la PWA (ver docs/claude_history.md, Fase 5).
  if (req.usuarioCliente.rolPersonasAutorizadas === 'solo_lectura') {
    return res.status(403).json({ error: 'Tu acceso es de solo lectura' });
  }

  const { estrellas, comentario } = req.body || {};
  if (!Number.isInteger(estrellas) || estrellas < 1 || estrellas > 5) {
    return res.status(400).json({ error: 'La calificación debe ser un número entero de 1 a 5' });
  }

  // El turno se busca por la lista de Pacientes, no por la columna vieja. Un turno puede cubrir
  // a más de una persona de la misma casa, y la calificación es del Asistente por ese turno: se
  // guarda contra el Paciente del Cliente que califica, tomando el primero por orden de
  // nombre cuando son varios, para que dos calificaciones del mismo turno no queden colgadas de
  // Pacientes distintos según el orden en que la base devuelva las filas.
  const { data: filas } = await supabase
    .from('guardia_pacientes')
    .select('paciente_id, pacientes!inner(nombre, cliente_id), guardias!inner(id, asistente_id, prestadora_id)')
    .eq('guardia_id', req.params.guardiaId)
    .eq('pacientes.cliente_id', req.usuarioCliente.clienteId);
  const fila = (filas ?? [])
    .slice()
    .sort((a, b) => (a.pacientes?.nombre ?? '').localeCompare(b.pacientes?.nombre ?? ''))[0];
  if (!fila) {
    return res.status(404).json({ error: 'Guardia no encontrada' });
  }
  const guardia = { ...fila.guardias, paciente_id: fila.paciente_id };
  // Una guardia que quedó sin cubrir no tiene a quién calificar. Sin este corte, el INSERT
  // manda asistente_id en NULL contra una columna obligatoria y devuelve un 500 sin
  // explicación.
  if (!guardia.asistente_id) {
    return res.status(400).json({ error: 'guardia_sin_asistente' });
  }

  const { error } = await supabase.from('calificaciones_asistente').insert({
    asistente_id: guardia.asistente_id,
    paciente_id: guardia.paciente_id,
    cliente_id: req.usuarioCliente.clienteId,
    guardia_id: guardia.id,
    prestadora_id: guardia.prestadora_id,
    estrellas,
    comentario: comentario || null,
  });
  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ ok: true });
});

// ============================================================================
// Notificaciones push (Web Push API + VAPID) — mismo contrato que appAsistentes.js,
// generalizado del lado de push.js a cliente_id.
// ============================================================================

appClientesRouter.post('/push/suscribir', requiereRolCliente, async (req, res) => {
  const { endpoint, keys } = req.body || {};
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: 'Suscripción push incompleta' });
  }

  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      {
        prestadora_id: req.usuarioCliente.prestadoraId,
        cliente_id: req.usuarioCliente.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        user_agent: req.headers['user-agent'] || null,
      },
      { onConflict: 'endpoint' }
    );
  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ ok: true });
});

appClientesRouter.delete('/push/suscribir', requiereRolCliente, async (req, res) => {
  const { endpoint } = req.body || {};
  if (!endpoint) {
    return res.status(400).json({ error: 'Falta el endpoint de la suscripción' });
  }

  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint)
    .eq('cliente_id', req.usuarioCliente.id);
  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ ok: true });
});

// ============================================================================
// Suscripción match + cobro en efectivo por QR (pendiente #85). El QR es la
// alternativa a la carga manual del cobrador: el Cliente lo genera desde su propio
// dispositivo, de un solo uso y con vencimiento corto (10 min) — el canje ocurre siempre en
// el Panel vía service_role, nunca como UPDATE directo desde acá.
// ============================================================================

appClientesRouter.get('/suscripcion/:pacienteId', requiereRolCliente, async (req, res) => {
  const { data, error } = await supabase
    .from('suscripciones_match')
    .select('id, estado, monto_mensual, trial_fin, proximo_cobro, cancelada_en')
    .eq('cliente_id', req.usuarioCliente.clienteId)
    .eq('paciente_id', req.params.pacienteId)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ suscripcion: data });
});

appClientesRouter.post('/qr-cobro', requiereRolCliente, async (req, res) => {
  const { suscripcion_id: suscripcionId } = req.body || {};
  if (!suscripcionId) {
    return res.status(400).json({ error: 'Falta suscripcion_id' });
  }

  const { data: suscripcion } = await supabase
    .from('suscripciones_match')
    .select('id, cliente_id, monto_mensual, proximo_cobro')
    .eq('id', suscripcionId)
    .eq('cliente_id', req.usuarioCliente.clienteId)
    .maybeSingle();
  if (!suscripcion) {
    return res.status(404).json({ error: 'Suscripción no encontrada' });
  }

  const { token, expiraEn } = generarTokenQrCobro();
  const { data, error } = await supabase
    .from('qr_cobro_efectivo')
    .insert({
      suscripcion_id: suscripcion.id,
      cliente_id: req.usuarioCliente.clienteId,
      periodo: suscripcion.proximo_cobro || new Date().toISOString().slice(0, 10),
      monto: suscripcion.monto_mensual,
      token,
      expira_en: expiraEn.toISOString(),
    })
    .select('id, token, expira_en, usado_en')
    .single();
  if (error) return res.status(500).json({ error: error.message });

  res.json({ qr: data });
});

appClientesRouter.get('/qr-cobro/:id', requiereRolCliente, async (req, res) => {
  const { data, error } = await supabase
    .from('qr_cobro_efectivo')
    .select('id, expira_en, usado_en, cobro_id')
    .eq('id', req.params.id)
    .eq('cliente_id', req.usuarioCliente.clienteId)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'QR no encontrado' });
  res.json({ qr: data });
});
