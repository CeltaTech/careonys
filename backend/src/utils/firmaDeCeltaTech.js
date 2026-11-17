// La firma con la que CeltaTech prueba que un pedido es suyo.
//
// Es la que fija el contrato entre CeltaTech y sus productos
// (`celtatech/docs/MODELO_COMERCIAL_CELTATECH.md`, §6.2): la cabecera `X-CeltaTech-Firma` trae
// `sha256=<firma en hexadecimal>`, calculada con la clave de firma sobre el cuerpo crudo, tal
// como llegó, byte por byte.
//
// Ante cualquier duda dice que no. Sin clave configurada no hay con qué comprobar, y eso no es
// «se sigue igual»: es no abrir. La comparación tarda lo mismo acierte o no, para no enseñar por
// dónde dejó de parecerse.
import { firmasIguales, hmacHex } from '../pasarelas/firmaWebhook.js';

const PREFIJO = 'sha256=';

/** La clave de firma que comparte CeltaTech con este producto. Vive en el ambiente. */
export function claveDeFirmaDeCeltaTech() {
  return process.env.CLAVE_DE_FIRMA_DE_CELTATECH || null;
}

/**
 * Comprueba la firma. Devuelve `{ valido, motivo }`; el motivo es para el registro del servidor,
 * nunca para quien llamó.
 */
export function comprobarFirmaDeCeltaTech({ secreto, cabecera, cuerpoCrudo }) {
  if (!secreto) return { valido: false, motivo: 'sin_clave_de_firma' };
  if (!Buffer.isBuffer(cuerpoCrudo)) return { valido: false, motivo: 'cuerpo_crudo_ausente' };
  if (typeof cabecera !== 'string' || !cabecera.startsWith(PREFIJO)) {
    return { valido: false, motivo: 'firma_ausente' };
  }

  const recibida = cabecera.slice(PREFIJO.length).trim();
  if (!/^[0-9a-f]+$/i.test(recibida)) return { valido: false, motivo: 'firma_ilegible' };

  const esperada = hmacHex(secreto, [cuerpoCrudo]);
  if (!firmasIguales(recibida.toLowerCase(), esperada)) return { valido: false, motivo: 'firma_distinta' };

  return { valido: true, motivo: null };
}
