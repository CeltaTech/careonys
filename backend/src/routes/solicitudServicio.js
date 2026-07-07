import { Router } from 'express';
import { pool } from '../db/connection.js';
import { enviarEmailCoordinador } from '../utils/email.js';

export const solicitudServicioRouter = Router();

solicitudServicioRouter.post('/', async (req, res) => {
  const {
    nombre, telefono, email, nombre_paciente, localidad,
    tipo_servicio, modalidad, dias_horario, descripcion,
  } = req.body;

  if (!nombre || !telefono || !email || !localidad || !tipo_servicio || !modalidad || !dias_horario) {
    return res.status(400).json({ error: 'campos_obligatorios_faltantes' });
  }

  await pool.execute(
    `INSERT INTO solicitudes
      (nombre, telefono, email, nombre_paciente, localidad, tipo_servicio, modalidad, dias_horario, descripcion)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [nombre, telefono, email, nombre_paciente ?? null, localidad, tipo_servicio, modalidad, dias_horario, descripcion ?? null],
  );

  try {
    await enviarEmailCoordinador({
      asunto: `Nueva solicitud de servicio — ${nombre}`,
      texto: `Nombre: ${nombre}\nTeléfono: ${telefono}\nEmail: ${email}\nLocalidad: ${localidad}\nServicio: ${tipo_servicio} (${modalidad})\nDías y horario: ${dias_horario}\nDescripción: ${descripcion ?? '—'}`,
    });
  } catch (err) {
    console.error('Error enviando email de solicitud de servicio:', err.message);
  }

  res.status(201).json({ ok: true });
});
