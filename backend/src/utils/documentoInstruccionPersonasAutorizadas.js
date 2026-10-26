import crypto from 'node:crypto';
import { CATALOGO_PERSONAS_AUTORIZADAS } from './catalogoPersonasAutorizadas.js';

// Arma la autorización de acceso que firma el titular, y su identificador de verificación.
//
// POR QUÉ EL DOCUMENTO SE GUARDA Y NO SE VUELVE A ARMAR. Si mañana se cambia una descripción del
// catálogo, o se agrega un acceso, esta función devolvería otro texto. Lo que el titular firmó fue
// el texto de aquel día: se guarda entero, tal cual, y lo que se muestra después es lo guardado.
// Volver a armarlo sería mostrarle a alguien un documento que nunca vio.
//
// POR QUÉ EL IDENTIFICADOR DE VERIFICACIÓN. Sin él, el registro dice que el titular confirmó y no dice QUÉ confirmó:
// cualquiera puede sostener después que el texto era otro. Con él, si alguien le mueve una coma
// al texto guardado, deja de coincidir y se nota. No es firma digital —eso se evaluó y se
// descartó—: es la constancia de que el texto no cambió desde que se firmó.
//
// EL DOCUMENTO VA EN CASTELLANO, y así queda anotado en `documento_idioma`. Las descripciones
// salen del catálogo, que hoy está escrito en castellano, igual que el de los interruptores de la
// Prestadora. El día que el catálogo tenga las tres versiones, este texto sale en el idioma de la
// cuenta y el campo ya está puesto para distinguirlos.
//
// SIN RENGLONES PARA FIRMAR. En la aplicación firma con el código, y en el Panel el pie de firma
// lo agrega la hoja impresa: no son parte de lo que se firma.
export const IDIOMA_DEL_DOCUMENTO = 'es-AR';

// Va en la lista de cada persona y no en el catálogo: no es un acceso que se dé o se niegue, es
// algo que cualquiera que esté en la casa puede hacer, y quien firma tiene que saberlo.
const RENGLON_DEL_QR = 'Mostrar el QR de entrada y salida del Asistente';

function fechaLegible(fecha) {
  return new Intl.DateTimeFormat(IDIOMA_DEL_DOCUMENTO, {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(fecha);
}

function dniLegible(dni) {
  const numero = Number(String(dni ?? '').replace(/\D/g, ''));
  return numero ? new Intl.NumberFormat(IDIOMA_DEL_DOCUMENTO).format(numero) : '—';
}

// `personas` es una lista de `{ nombre, dni, accesos }`, donde `accesos` es el objeto plano
// clave → permitido que ya pasó por el tope de la Prestadora. El orden de los accesos es el del
// catálogo, siempre igual, para que dos documentos del mismo Cliente se puedan comparar renglón
// por renglón.
export function textoDeLaInstruccion({ prestadora, titular, personas, fecha }) {
  const cuando = fecha ?? new Date();
  const quien = titular?.nombre ?? '—';
  const renglones = [];

  renglones.push('AUTORIZACIÓN DE ACCESO Y ASIGNACIÓN DE PERMISOS');
  renglones.push('');
  renglones.push(`Fecha: ${fechaLegible(cuando)}`);
  renglones.push('');
  renglones.push(`${quien}, titular de la cuenta, autoriza a ${prestadora?.nombre ?? '—'} a dar acceso a la aplicación a las personas que figuran abajo, con los permisos que se detallan para cada una.`);
  renglones.push('');

  if (personas.length === 0) {
    renglones.push('No hay ninguna persona autorizada.');
    renglones.push('');
  }

  for (const persona of personas) {
    renglones.push(`${persona.nombre ?? '—'} — DNI ${dniLegible(persona.dni)}`);
    for (const cosa of CATALOGO_PERSONAS_AUTORIZADAS) {
      if (persona.accesos?.[cosa.clave]) renglones.push(`- ${cosa.descripcion}`);
    }
    renglones.push(`- ${RENGLON_DEL_QR}`);
    renglones.push('');
  }

  renglones.push('Condiciones');
  renglones.push('1. Cada persona puede ver y hacer sólo lo que figura en su lista.');
  renglones.push(`2. ${quien}, como titular, conserva el acceso a toda la información de la cuenta.`);
  renglones.push(`3. Esta autorización rige desde su firma. Para cambiarla o retirarla, ${quien} firma una autorización nueva, que reemplaza a esta por completo.`);

  return renglones.join('\n');
}

export function verificadorDelDocumento(texto) {
  return crypto.createHash('sha256').update(texto, 'utf8').digest('hex');
}
