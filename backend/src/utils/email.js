import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

export async function enviarEmailCoordinador({ asunto, texto }) {
  await transporter.sendMail({
    from: process.env.SMTP_USER,
    to: process.env.SMTP_USER,
    subject: asunto,
    text: texto,
  });
}
