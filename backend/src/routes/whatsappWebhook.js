import { Router } from 'express';
import { supabase } from '../db/connection.js';
import { enviarWhatsApp } from '../utils/whatsapp.js';
import { generarRespuestaIA } from '../utils/iaWhatsapp.js';

// Punto 6 de docs/PRD_06_WhatsApp_IA.md: mensajes entrantes de WhatsApp de un Asistente.
// El Desarrollador aprobó (2026-07-13) construir esto hasta donde sea posible sin una
// cuenta real de Meta, y terminarlo en el test final con una prestadora real — lo que
// falta específicamente:
//   - la verificación del webhook contra el "verify token" real que Meta asigna por cuenta
//     (el endpoint GET de abajo ya implementa el mecanismo, falta el valor real por prestadora)
//   - la firma X-Hub-Signature-256 (falta el app secret real de cada prestadora para validarla)
//   - probar el formato real del payload que manda Meta (el parseo de abajo sigue la
//     estructura documentada por Meta, pero no fue probado contra tráfico real)
export const whatsappWebhookRouter = Router();

// Meta verifica el endpoint con un GET antes de empezar a mandar eventos.
whatsappWebhookRouter.get('/', (req, res) => {
  const modo = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (modo === 'subscribe' && token && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.status(403).send('Verificación fallida');
});

whatsappWebhookRouter.post('/', async (req, res) => {
  // Responder rápido siempre — Meta reintenta si no recibe 200 a tiempo.
  res.status(200).json({ ok: true });

  try {
    await procesarEventoEntrante(req.body);
  } catch (err) {
    console.error('Error procesando webhook de WhatsApp:', err.message);
  }
});

async function procesarEventoEntrante(payload) {
  const cambios = payload?.entry?.[0]?.changes?.[0]?.value;
  const mensaje = cambios?.messages?.[0];
  if (!mensaje || mensaje.type !== 'text') return;

  const phoneNumberId = cambios?.metadata?.phone_number_id;
  const telefono = mensaje.from;
  const texto = mensaje.text?.body;
  if (!phoneNumberId || !telefono || !texto) return;

  const { data: configPrestadora } = await supabase
    .from('configuracion_whatsapp_prestadora')
    .select('prestadora_id')
    .eq('phone_number_id', phoneNumberId)
    .single();
  if (!configPrestadora) return;

  const prestadoraId = configPrestadora.prestadora_id;

  const { data: conversacion } = await supabase
    .from('conversaciones_whatsapp')
    .upsert(
      { prestadora_id: prestadoraId, telefono, ultimo_mensaje_at: new Date().toISOString() },
      { onConflict: 'prestadora_id,telefono' },
    )
    .select('id')
    .single();
  if (!conversacion) return;

  await supabase.from('mensajes_whatsapp').insert({
    prestadora_id: prestadoraId,
    conversacion_id: conversacion.id,
    direccion: 'entrante',
    texto,
    meta_message_id: mensaje.id,
  });

  const { data: historialCrudo } = await supabase
    .from('mensajes_whatsapp')
    .select('direccion, texto')
    .eq('conversacion_id', conversacion.id)
    .order('created_at', { ascending: true })
    .limit(20);

  const respuestaIA = await generarRespuestaIA({ mensajeEntrante: texto, historial: historialCrudo ?? [] });

  const { data: mensajeSaliente } = await supabase
    .from('mensajes_whatsapp')
    .insert({
      prestadora_id: prestadoraId,
      conversacion_id: conversacion.id,
      direccion: 'saliente',
      texto: respuestaIA.respuestaSugerida ?? '(sin respuesta sugerida — requiere redacción manual del Coordinador)',
      generado_por_ia: true,
      enviado_automaticamente: false,
    })
    .select('id')
    .single();

  const enviaAutomatico = respuestaIA.confianzaAlta && !respuestaIA.requiereCoordinador && respuestaIA.respuestaSugerida;

  if (enviaAutomatico) {
    try {
      await enviarWhatsApp({ prestadoraId, telefono, texto: respuestaIA.respuestaSugerida });
      await supabase
        .from('mensajes_whatsapp')
        .update({ enviado_automaticamente: true })
        .eq('id', mensajeSaliente.id);
      return;
    } catch (err) {
      console.error('Error enviando respuesta automática de IA, se escala al Coordinador:', err.message);
    }
  }

  // Nunca queda un mensaje sin que el Coordinador se entere (decisión del Desarrollador,
  // punto 2 de docs/PRD_06_WhatsApp_IA.md).
  await supabase
    .from('conversaciones_whatsapp')
    .update({ requiere_atencion_coordinador: true })
    .eq('id', conversacion.id);
}
