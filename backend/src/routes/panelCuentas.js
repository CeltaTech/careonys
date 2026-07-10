import { Router } from 'express';
import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import { supabase } from '../db/connection.js';
import { crearCuentaConPerfil, borrarCuenta } from '../utils/cuentasPanel.js';

export const panelCuentasRouter = Router();

// Crear una cuenta real (Auth + perfil) es una acción sensible y difícil de revertir —
// se restringe a Admin/Superadmin, a diferencia del resto del panel que también admite Coordinador.
function requiereAdmin(req, res, next) {
  if (!['admin_prestadora', 'superadmin'].includes(req.usuarioPanel?.rol)) {
    return res.status(403).json({ error: 'Solo Admin puede crear cuentas' });
  }
  next();
}

panelCuentasRouter.post('/cliente', requiereRolPanel, requiereAdmin, async (req, res) => {
  const { solicitudId } = req.body;
  if (!solicitudId) {
    return res.status(400).json({ error: 'Falta solicitudId' });
  }

  let querySolicitud = supabase.from('solicitudes').select('*').eq('id', solicitudId);
  if (req.usuarioPanel.rol !== 'superadmin') {
    querySolicitud = querySolicitud.eq('prestadora_id', req.usuarioPanel.prestadoraId);
  }
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
    if (clienteId) {
      await supabase.from('pacientes').delete().eq('cliente_id', clienteId);
      await supabase.from('clientes').delete().eq('id', clienteId);
      await borrarCuenta(clienteId, { prestadoraId });
    }
    res.status(500).json({ error: error.message });
  }
});

const ETAPAS_INCORPORACION = [
  'postulacion',
  'verificacion_identidad',
  'antecedentes_penales',
  'entrevista',
  'capacitacion',
];

// Inicia el Proceso de Incorporación de Asistentes (uso interno del Panel, ver glosario
// de CLAUDE.md): crea la cuenta real de Asistente a partir de una postulación aprobada,
// y registra las 5 etapas de verificacion_asistente.
// La primera etapa ("postulacion") queda aprobada de entrada porque ya se cumplió.
panelCuentasRouter.post('/asistente', requiereRolPanel, requiereAdmin, async (req, res) => {
  const { postulacionId } = req.body;
  if (!postulacionId) {
    return res.status(400).json({ error: 'Falta postulacionId' });
  }

  let queryPostulacion = supabase.from('postulaciones').select('*').eq('id', postulacionId);
  if (req.usuarioPanel.rol !== 'superadmin') {
    queryPostulacion = queryPostulacion.eq('prestadora_id', req.usuarioPanel.prestadoraId);
  }
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
    ({ userId: asistenteId } = await crearCuentaConPerfil({
      email: postulacion.email,
      nombre: postulacion.nombre,
      telefono: postulacion.telefono,
      rol: 'asistente',
      zonas: postulacion.zonas.split(',').map((z) => z.trim()).filter(Boolean),
      prestadoraId,
    }));

    const { error: errorAsistente } = await supabase.from('asistentes').insert({
      id: asistenteId,
      nombre: postulacion.nombre,
      dni: postulacion.dni,
      telefono: postulacion.telefono,
      email: postulacion.email,
      especialidades: postulacion.especialidades.split(',').map((e) => e.trim()).filter(Boolean),
      zonas: postulacion.zonas.split(',').map((z) => z.trim()).filter(Boolean),
      estado: 'inactivo',
      prestadora_id: prestadoraId,
    });
    if (errorAsistente) throw new Error(errorAsistente.message);

    const filasVerificacion = ETAPAS_INCORPORACION.map((etapa) => ({
      asistente_id: asistenteId,
      etapa,
      estado: etapa === 'postulacion' ? 'aprobada' : 'pendiente',
      revisado_por: etapa === 'postulacion' ? req.usuarioPanel.id : null,
      completado_en: etapa === 'postulacion' ? new Date().toISOString() : null,
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
    if (asistenteId) {
      await supabase.from('verificaciones_asistente').delete().eq('asistente_id', asistenteId);
      await supabase.from('asistentes').delete().eq('id', asistenteId);
      await borrarCuenta(asistenteId, { prestadoraId });
    }
    res.status(500).json({ error: error.message });
  }
});
