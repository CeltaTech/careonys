import webpush from 'web-push';
import { supabase } from '../db/connection.js';
import { IDENTIDAD } from '../config/identidadProducto.js';
import { marcaDeLaPrestadora } from './marcaPrestadora.js';

let configurado = false;

function asegurarConfiguracion() {
  if (configurado) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  // "Subject" VAPID: la casilla a la que el servicio de push del navegador escribe si hay
  // un problema con los envíos. Sale de la identidad del producto para que renombrarlo no
  // implique buscarla acá; VAPID_SUBJECT permite pisarla por entorno sin tocar código.
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || `mailto:${IDENTIDAD.emailSoporte}`, publicKey, privateKey);
  configurado = true;
  return true;
}

// En el celular, el encabezado es la Prestadora y el mensaje entero va abajo.
//
// POR QUÉ. Una misma aplicación sirve a todas las Prestadoras, así que la notificación es el único
// canal donde no se sabe de dónde llega: por WhatsApp llega del número de esa Prestadora y por
// correo, de su casilla. Acá hay que decirlo. Un Asistente que trabaja en dos, si no, lee
// «Finalización de servicio» y no sabe de cuál de las dos.
//
// Se hace en este único lugar y no en cada mensaje: son los mismos ocho mensajes del sistema
// saliendo por tres canales, y el nombre de la Prestadora sólo hace falta en éste.
//
// Sin nombre cargado queda el del producto, que es la misma caída que usan las pantallas cuando la
// Prestadora no se pudo resolver.
async function comoSeVeEnElCelular(prestadoraId, titulo, cuerpo) {
  const { nombre } = await marcaDeLaPrestadora(prestadoraId);
  const encabezado = nombre || IDENTIDAD.nombre;
  const sinTitulo = !titulo;
  if (sinTitulo) return { titulo: encabezado, cuerpo };
  // El título del mensaje pasa a ser la primera frase del cuerpo. Si ya viene con su propio signo
  // al final, no se le agrega otro.
  const cierre = /[.!?…]$/.test(titulo) ? '' : '.';
  return { titulo: encabezado, cuerpo: cuerpo ? `${titulo}${cierre} ${cuerpo}` : titulo };
}

// Envía un push a todas las suscripciones activas de una audiencia (Asistente o Familia,
// nunca ambas — ver CHECK push_subscriptions_una_audiencia en schema_pwa_familias_01.sql).
// Si una suscripción devuelve 404/410 (dispositivo desinstaló la app o revocó el permiso),
// se borra en el momento — mismo criterio que el resto del proyecto de no dejar basura de
// estado que ya no es válido.
//
// Devuelve true si al menos una suscripción recibió el push con éxito — lo necesita Fase 11
// (revisarRecordatoriosPush.js) para decidir si cae a WhatsApp de respaldo.
//
// `prestadoraId` es obligatorio y no tiene valor por defecto: el backend entra con la llave de
// servicio, que se saltea la protección por fila, así que lo único que impide mandarle la
// notificación de una Prestadora al aparato de otra es este filtro. Colgar del identificador del Asistente o de la
// Familia no alcanza, porque acá no se lee ninguna de esas dos tablas.
async function enviarPush(prestadoraId, columna, id, { titulo, cuerpo, url }) {
  // Sin destinatario no hay push. Pasa cuando la guardia está sin cubrir: no hay Asistente
  // a quien avisarle. Se corta acá y no en cada llamador, para no repetir la misma
  // verificación en todos lados.
  if (!id) return false;
  // Sin Prestadora no se manda nada: un filtro vacío traería las suscripciones de todas.
  if (!prestadoraId) return false;
  if (!asegurarConfiguracion()) {
    console.error('Push no configurado: falta VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY');
    return false;
  }

  const { data: suscripciones, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('prestadora_id', prestadoraId)
    .eq(columna, id);

  if (error || !suscripciones?.length) return false;

  const payload = JSON.stringify({
    ...(await comoSeVeEnElCelular(prestadoraId, titulo, cuerpo)),
    url: url || '/',
  });

  const resultados = await Promise.all(
    suscripciones.map(async (suscripcion) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: suscripcion.endpoint,
            keys: { p256dh: suscripcion.p256dh, auth: suscripcion.auth },
          },
          payload,
        );
        return true;
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await supabase
            .from('push_subscriptions')
            .delete()
            .eq('prestadora_id', prestadoraId)
            .eq('id', suscripcion.id);
        } else {
          console.error(`Error enviando push a suscripción ${suscripcion.id}:`, err.message);
        }
        return false;
      }
    }),
  );

  return resultados.some(Boolean);
}

export function enviarPushAsistente(prestadoraId, asistenteId, datos) {
  return enviarPush(prestadoraId, 'asistente_id', asistenteId, datos);
}

export function enviarPushFamilia(prestadoraId, familiaId, datos) {
  return enviarPush(prestadoraId, 'familia_id', familiaId, datos);
}
