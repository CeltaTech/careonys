import { Router } from 'express';
import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import { enviarEmail } from '../utils/email.js';

export const panelNotificacionesRouter = Router();

// El Postulante recibe este email en el idioma en el que completó el formulario público
// (columna `postulaciones.idioma`, ver schema_etapa2o.sql) — no siempre en español.
const MENSAJES_ESTADO_POSTULACION = {
  'es-AR': {
    asunto: 'prestadora-original Salud — Actualización de tu postulación',
    saludo: (nombre) => `Hola ${nombre || ''},`,
    en_revision: 'Tu postulación como Asistente Integral está en revisión.',
    aprobado: 'Tu postulación como Asistente Integral fue aprobada. Pronto nos pondremos en contacto para los próximos pasos.',
    rechazado: 'Gracias por tu interés en prestadora-original Salud. En esta oportunidad no vamos a avanzar con tu postulación.',
    firma: 'Equipo prestadora-original Salud',
  },
  en: {
    asunto: 'prestadora-original Salud — Update on your application',
    saludo: (nombre) => `Hi ${nombre || ''},`,
    en_revision: 'Your application as an Asistente Integral is under review.',
    aprobado: 'Your application as an Asistente Integral was approved. We will contact you soon about next steps.',
    rechazado: 'Thank you for your interest in prestadora-original Salud. We will not be moving forward with your application at this time.',
    firma: 'prestadora-original Salud Team',
  },
  'pt-BR': {
    asunto: 'prestadora-original Salud — Atualização da sua candidatura',
    saludo: (nombre) => `Olá ${nombre || ''},`,
    en_revision: 'Sua candidatura como Asistente Integral está em análise.',
    aprobado: 'Sua candidatura como Asistente Integral foi aprovada. Em breve entraremos em contato para os próximos passos.',
    rechazado: 'Obrigado pelo seu interesse na prestadora-original Salud. Desta vez não vamos avançar com sua candidatura.',
    firma: 'Equipe prestadora-original Salud',
  },
};

panelNotificacionesRouter.post('/postulante', requiereRolPanel, async (req, res) => {
  const { email, nombre, nuevoEstado, idioma } = req.body;
  const textos = MENSAJES_ESTADO_POSTULACION[idioma] ?? MENSAJES_ESTADO_POSTULACION['es-AR'];

  if (!email || !nuevoEstado || !textos[nuevoEstado]) {
    return res.status(400).json({ error: 'Datos inválidos' });
  }

  try {
    await enviarEmail({
      to: email,
      asunto: textos.asunto,
      texto: `${textos.saludo(nombre)}\n\n${textos[nuevoEstado]}\n\n${textos.firma}`,
    });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'No se pudo enviar el email' });
  }
});
