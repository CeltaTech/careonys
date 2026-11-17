import { emailDeContactoDePrestadora, enviarEmail, hayMedioDeEnvio } from './email.js';
import { idiomaDeLaPrestadora } from '../i18n/idiomaDeLaPrestadora.js';
import { avisoDeDerechoPorVencer } from '../i18n/derechosDeLaPersona.js';
import { enLaPrestadora } from '../db/connection.js';

// EL CORREO QUE AVISA QUE VENCE EL PLAZO PARA RESPONDER LO QUE UNA PERSONA PIDIÓ SOBRE SUS DATOS.
// Corre una vez por día, de a una Prestadora. Qué solicitudes avisar lo decide la base: las
// pendientes que entraron en los días de aviso del plazo de su país y que todavía no se avisaron.
//
// NO SE APAGA. Responder a tiempo es una obligación legal de la Prestadora, y el aviso no pasa por
// la configuración de notificaciones, donde cada Prestadora enciende y apaga.
//
// PRIMERO SALE EL CORREO Y DESPUÉS SE ANOTA. La constancia es la que impide mandar dos veces el
// mismo aviso. Si el correo no salió, no se anota nada y se vuelve a intentar al día siguiente.
//
// Va al email de contacto de la Prestadora, un correo por solicitud, sin el nombre de la persona.
// En el registro del servidor nunca queda a quién ni qué.

/** Avisa las solicitudes por vencer de esa Prestadora. Devuelve cuántos avisos salieron. */
export async function avisarLosDerechosPorVencer(prestadoraId) {
  if (!prestadoraId || !hayMedioDeEnvio()) return 0;
  const trabajo = (motivo, consulta) => enLaPrestadora(prestadoraId, motivo, consulta);

  let enviados = 0;
  try {
    const { data, error } = await trabajo('solicitudes de derechos por vencer', (db) =>
      db.rpc('derechos_por_vencer'));
    if (error) throw new Error(error.message);
    const porAvisar = data ?? [];
    if (porAvisar.length === 0) return 0;

    const destino = await emailDeContactoDePrestadora(prestadoraId);
    if (!destino) return 0;

    const idioma = await trabajo('leer el idioma de la Prestadora', (db) => idiomaDeLaPrestadora(db, prestadoraId));

    for (const solicitud of porAvisar) {
      const textos = avisoDeDerechoPorVencer(idioma, {
        tipo: solicitud.tipo,
        recibidaEl: solicitud.recibida_el,
        venceEl: solicitud.vence_el,
      }, prestadoraId);
      await enviarEmail({ to: destino, asunto: textos.asunto, texto: textos.texto, prestadoraId });

      const anotado = await trabajo('constancia del aviso de una solicitud de derechos por vencer', (db) =>
        db.rpc('anotar_aviso_de_derecho_por_vencer', { p_solicitud: solicitud.solicitud_id }));
      if (anotado.error) throw new Error(anotado.error.message);
      enviados += 1;
    }
    return enviados;
  } catch (e) {
    console.error('avisoDeVencimientoDeDerechos: no se pudo avisar:', e.message);
    return enviados;
  }
}
