import nodemailer from 'nodemailer';
import { supabase } from '../db/connection.js';

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  family: 4,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

// Destinatarios configurables desde el Panel (Módulo 8 > Notificaciones) en vez de
// hardcodeados. configuracion_notificaciones es por prestadora desde 2026-07-13
// (backend/src/db/schema_whatsapp_ia_01.sql sección 0) — antes era una fila global por
// evento, compartida sin darse cuenta por todas las prestadoras licenciatarias.
// Si el evento no tiene emails cargados (o está desactivado), cae al inbox operativo por
// defecto para no perder el aviso.
async function configuracionEvento(evento, prestadoraId) {
  const { data } = await supabase
    .from('configuracion_notificaciones')
    .select('emails, activo, whatsapp_activo')
    .eq('evento', evento)
    .eq('prestadora_id', prestadoraId)
    .single();

  return data;
}

async function destinatariosEvento(evento, prestadoraId) {
  const data = await configuracionEvento(evento, prestadoraId);
  if (data && data.activo === false) return [];
  if (data?.emails?.length) return data.emails;
  return [process.env.SMTP_USER];
}

export async function enviarEmailCoordinador({ evento, prestadoraId, asunto, texto }) {
  const destinatarios = await destinatariosEvento(evento, prestadoraId);
  if (destinatarios.length === 0) return;

  await transporter.sendMail({
    from: process.env.SMTP_USER,
    to: destinatarios.join(', '),
    subject: asunto,
    text: texto,
  });
}

export { configuracionEvento };

export async function enviarEmail({ to, asunto, texto }) {
  await transporter.sendMail({
    from: process.env.SMTP_USER,
    to,
    subject: asunto,
    text: texto,
  });
}
