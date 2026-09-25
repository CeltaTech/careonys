import { enviarEmail } from './email.js';
import { mensajeDelSistema } from '../i18n/avisos.js';
import { idiomaDelDestinatario } from '../i18n/idiomas.js';
import { idiomaDeLaPrestadora } from '../i18n/idiomaDeLaPrestadora.js';
import { marcaDeLaPrestadora } from './marcaPrestadora.js';
import { IDENTIDAD } from '../config/identidadProducto.js';

// EL MENSAJE SALE SIEMPRE QUE PASA ALGO CON LA SEGURIDAD DE UNA CUENTA, y no lo configura nadie.
//
// Por qué no pasa por `configuracion_notificaciones` como los demás mensajes: ahí cada Prestadora
// enciende y apaga. Esto no se apaga. Quien recibe un mensaje que no reconoce es la única persona
// que puede darse cuenta de que alguien más está entrando a su cuenta, y apagarlo le saca
// justamente eso.
//
// VA POR CORREO Y NO POR WHATSAPP a propósito: varios de estos mensajes son sobre el teléfono, y
// mandarlos por el teléfono que acaba de cambiar sería avisarle al que se lo llevó.
//
// NUNCA LLEVA EL NÚMERO NI EL CÓDIGO. El mensaje dice que el número cambió, no a cuál.

export const MENSAJE_CLAVE_RECUPERADA = 'clave_recuperada';
export const MENSAJE_TELEFONO_CAMBIADO = 'telefono_cambiado';
export const MENSAJE_EQUIPO_NUEVO = 'entrada_desde_equipo_nuevo';
export const MENSAJE_CAMBIO_HABILITADO = 'cambio_de_clave_habilitado';

/**
 * Manda uno de los cuatro mensajes de seguridad.
 *
 * No interrumpe nada si falla: el mensaje acompaña al trabajo, no lo bloquea. Sin correo cargado no
 * hay a dónde mandarlo y se sale en silencio, que es lo mismo que hace el resto del backend.
 */
export async function avisarDeSeguridad(clave, cuenta) {
  if (!cuenta?.email) return;

  try {
    const marca = await marcaDeLaPrestadora(cuenta.prestadora_id);
    const textos = mensajeDelSistema(
      clave,
      idiomaDelDestinatario(null, await idiomaDeLaPrestadora(cuenta.prestadora_id)),
      {
        nombre: cuenta.nombre ?? '',
        prestadora: marca?.nombre || IDENTIDAD.nombre,
        producto: IDENTIDAD.nombre,
      },
    );
    await enviarEmail({
      to: cuenta.email,
      asunto: textos.asunto,
      texto: textos.texto,
      prestadoraId: cuenta.prestadora_id,
    });
  } catch (e) {
    // Se anota que no salió, nunca a quién ni con qué datos.
    console.error(`avisoDeSeguridad: no se pudo mandar «${clave}»:`, e.message);
  }
}
