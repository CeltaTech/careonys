import { hayViaDeTelefono } from './codigoAlTelefono.js';

// CUÁNDO UN NÚMERO SIRVE DE LLAVE.
//
// Cuando está verificado. Es la solución corriente de la industria, y nadie de la oficina tiene
// que llamar ni habilitar nada: el número se verifica con el código de verificación que le llega a
// ese mismo número, y desde ahí sirve.
//
// EL CASO DE LA CUENTA ABIERTA LO CUBRE EL CAMBIO DE NÚMERO, NO UNA PERSONA. Quien se sienta frente
// a una cuenta abierta no puede poner su número: cambiarlo pide la contraseña actual, el número
// nuevo nace sin verificar, el código de verificación va al número nuevo, y al correo le llega un
// aviso por si el cambio no lo hizo su dueño.
//
// EL NÚMERO VIAJA CON EL CHIP. Con el mismo número en un aparato nuevo no hay nada que habilitar,
// porque lo verificado es el número.
//
// A NADIE SE LE SACA NADA. Entrar sigue siendo con el nombre de usuario y la contraseña, y
// restablecer la contraseña por correo sigue andando igual. Un número sin verificar sólo no sirve
// para pedir un código de verificación.

/**
 * ¿A esta cuenta se le puede pedir el código de verificación del teléfono?
 *
 * Son tres condiciones y todas tienen que darse: que haya número, que esté verificado y que la
 * Prestadora tenga por dónde mandarlo.
 *
 * `cuenta` necesita `prestadora_id`, `telefono` y `telefono_verificado_en`.
 */
export async function elTelefonoSirveDeSegundoFactor(cuenta) {
  if (!cuenta?.telefono || !cuenta?.telefono_verificado_en) return false;
  return hayViaDeTelefono(cuenta.prestadora_id);
}
