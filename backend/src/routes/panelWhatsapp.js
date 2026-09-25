import { Router } from 'express';
import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import { enviarWhatsApp } from '../utils/whatsapp.js';
import { supabase } from '../db/connection.js';
import { responderError } from '../utils/errorConMotivo.js';

export const panelWhatsappRouter = Router();

// Por qué esta ruta existe:
// Cuando entra un WhatsApp, la respuesta automática elige entre los textos que la Prestadora
// aprobó y no escribe ninguno nuevo (`utils/respuestaAutomaticaWhatsapp.js`). Si no hay ninguno
// que sirva, si el tema toca la salud o si el envío falla, la conversación queda marcada con
// `requiere_atencion_coordinador` y la contesta una persona desde la bandeja del Panel. Ese es
// el camino que abre esta ruta.
//
// La bandeja lee las conversaciones directo de Supabase con RLS, pero el envío tiene que pasar
// por acá: el token de Meta de cada Prestadora vive en Supabase Vault y solo lo puede leer este
// backend, nunca el navegador.
//
// Un mensaje saliente con `enviado_automaticamente = false` y `revisado_por_coordinador_at`
// vacío es un texto que quedó anotado y nunca salió —el caso del envío fallido—. Cuando el
// Coordinador responde o descarta, se le pone la fecha de revisión y deja de estar pendiente.

async function conversacionDeLaPrestadora(conversacionId, prestadoraId) {
  const { data } = await supabase
    .from('conversaciones_whatsapp')
    .select('id, telefono, prestadora_id')
    .eq('id', conversacionId)
    .eq('prestadora_id', prestadoraId)
    .maybeSingle();
  return data ?? null;
}

/** El último saliente que quedó anotado sin salir. Se reusa para no dejar huérfana la fila del
 *  envío que falló, en vez de sumar una segunda al hilo por el mismo mensaje.
 *
 *  Se nombra la Prestadora aunque la conversación ya venga comprobada: colgar de la fila padre
 *  no alcanza. */
async function borradorPendiente(conversacionId, prestadoraId) {
  const { data } = await supabase
    .from('mensajes_whatsapp')
    .select('id')
    .eq('prestadora_id', prestadoraId)
    .eq('conversacion_id', conversacionId)
    .eq('direccion', 'saliente')
    .eq('enviado_automaticamente', false)
    .is('revisado_por_coordinador_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

// Envía la respuesta y la deja registrada en el hilo. El texto es el que el Coordinador
// tiene en pantalla, escrito por él.
panelWhatsappRouter.post('/conversaciones/:id/responder', requiereRolPanel, async (req, res) => {
  const { texto } = req.body;
  const { prestadoraId } = req.usuarioPanel;

  if (!texto || !texto.trim()) {
    return res.status(400).json({ error: 'Falta el texto de la respuesta' });
  }

  const conversacion = await conversacionDeLaPrestadora(req.params.id, prestadoraId);
  if (!conversacion) {
    return res.status(404).json({ error: 'Conversación inexistente' });
  }

  try {
    await enviarWhatsApp({ prestadoraId, telefono: conversacion.telefono, texto });
  } catch (error) {
    // whatsapp_no_configurado es un problema de configuración de la Prestadora, no un fallo
    // del envío — se distingue para que la pantalla pueda decir qué hacer.
    const codigo = error.message.startsWith('whatsapp_no_configurado') ? 'whatsapp_no_configurado' : 'envio_fallido';
    return res.status(502).json({ error: 'No se pudo enviar el mensaje por WhatsApp', codigo });
  }

  const ahora = new Date().toISOString();
  const borrador = await borradorPendiente(conversacion.id, prestadoraId);

  // De acá para abajo el mensaje **ya salió** por WhatsApp y no hay forma de traerlo de vuelta.
  // Por eso lo que falle se anota en el registro del servidor y no se convierte en un error de
  // pantalla: contestarle "no se pudo" a quien acaba de mandar un mensaje que sí se mandó lo
  // lleva a mandarlo de nuevo, y quien está del otro lado recibe dos. Lo que se pierde si esto
  // falla es el hilo, no el mensaje. Se anotan identificadores, nunca el texto (CLAUDE.md §6).
  let fallo = null;

  if (borrador) {
    // La fila que había quedado anotada pasa a ser el mensaje realmente enviado, con su texto.
    const { error } = await supabase
      .from('mensajes_whatsapp')
      .update({ texto, revisado_por_coordinador_at: ahora })
      .eq('prestadora_id', prestadoraId)
      .eq('id', borrador.id);
    if (error) fallo = error;
  } else {
    const { error } = await supabase.from('mensajes_whatsapp').insert({
      prestadora_id: prestadoraId,
      conversacion_id: conversacion.id,
      direccion: 'saliente',
      texto,
      generado_por_ia: false,
      enviado_automaticamente: false,
      revisado_por_coordinador_at: ahora,
    });
    if (error) fallo = error;
  }

  const { error: errorConversacion } = await supabase
    .from('conversaciones_whatsapp')
    .update({ requiere_atencion_coordinador: false, ultimo_mensaje_at: ahora })
    .eq('prestadora_id', prestadoraId)
    .eq('id', conversacion.id);
  if (errorConversacion) fallo = errorConversacion;

  if (fallo) {
    console.error(
      'El mensaje de WhatsApp salió pero no quedó registrado en el hilo. Conversación:',
      conversacion.id,
      fallo.message,
    );
  }

  res.json({ ok: true });
});

// El Coordinador decide que no hace falta responder (ya lo resolvió por teléfono, era spam,
// etc.). No se envía nada: solo se da por revisado lo pendiente y la conversación deja de pedir
// atención. El mensaje entrante queda en el hilo, no se borra nada.
panelWhatsappRouter.post('/conversaciones/:id/descartar', requiereRolPanel, async (req, res) => {
  const { prestadoraId } = req.usuarioPanel;

  const conversacion = await conversacionDeLaPrestadora(req.params.id, prestadoraId);
  if (!conversacion) {
    return res.status(404).json({ error: 'Conversación inexistente' });
  }

  const ahora = new Date().toISOString();
  const borrador = await borradorPendiente(conversacion.id, prestadoraId);

  // Acá no salió nada hacia afuera, así que lo que falle sí se contesta: si la conversación
  // sigue pidiendo atención, el Coordinador tiene que saberlo ahora y no descubrirlo mañana con
  // el mismo aviso todavía prendido.
  if (borrador) {
    const { error } = await supabase
      .from('mensajes_whatsapp')
      .update({ revisado_por_coordinador_at: ahora })
      .eq('prestadora_id', prestadoraId)
      .eq('id', borrador.id);
    if (error) return responderError(res, error);
  }

  const { data: descartada, error } = await supabase
    .from('conversaciones_whatsapp')
    .update({ requiere_atencion_coordinador: false })
    .eq('prestadora_id', prestadoraId)
    .eq('id', conversacion.id)
    .select('id');
  if (error) return responderError(res, error);
  if (!descartada?.length) return res.status(404).json({ error: 'Conversación inexistente' });

  res.json({ ok: true });
});
