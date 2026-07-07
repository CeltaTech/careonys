import { Router } from 'express';
import { pool } from '../db/connection.js';
import { enviarEmailCoordinador } from '../utils/email.js';

export const postulacionAsistenteRouter = Router();

postulacionAsistenteRouter.post('/', async (req, res) => {
  const {
    nombre, telefono, email, especialidades, zonas, disponibilidad,
    anios_experiencia, situacion_fiscal, como_conocio, mensaje,
  } = req.body;

  if (!nombre || !telefono || !email || !especialidades || !zonas || !disponibilidad || !situacion_fiscal) {
    return res.status(400).json({ error: 'campos_obligatorios_faltantes' });
  }

  await pool.execute(
    `INSERT INTO postulaciones
      (nombre, telefono, email, especialidades, zonas, disponibilidad, anios_experiencia, situacion_fiscal, como_conocio, mensaje)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [nombre, telefono, email, especialidades, zonas, disponibilidad, anios_experiencia ?? null, situacion_fiscal, como_conocio ?? null, mensaje ?? null],
  );

  try {
    await enviarEmailCoordinador({
      asunto: `Nueva postulación de Asistente — ${nombre}`,
      texto: `Nombre: ${nombre}\nTeléfono: ${telefono}\nEmail: ${email}\nEspecialidades: ${especialidades}\nZonas: ${zonas}\nDisponibilidad: ${disponibilidad}\nSituación fiscal: ${situacion_fiscal}`,
    });
  } catch (err) {
    console.error('Error enviando email de postulación:', err.message);
  }

  res.status(201).json({ ok: true });
});
