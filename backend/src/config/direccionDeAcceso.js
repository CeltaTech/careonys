// ---------------------------------------------------------------------------
// direccionDeAcceso.js — con qué dirección conoce el servicio de acceso a cada cuenta
//
// Coordinación, Asistentes y Clientes entran con su nombre de usuario. El servicio de acceso, en
// cambio, pide una dirección con forma de email, y que no se repita en todo el sistema. Se le da
// `<cuenta>@acceso.careonys.invalid`: el identificador de la cuenta, que no cambia nunca, sobre un
// dominio reservado que no existe. Nadie recibe nada ahí.
//
// Así el email de la persona queda como dato de contacto: se corrige sin tocar el acceso, y el
// mismo email puede estar en dos Prestadoras.
//
// ES LA MISMA FORMA QUE ARMA LA BASE en `dar_de_alta_la_cuenta`. Es de lo que se guarda para
// siempre: cambiarla es dejar a todas las cuentas sin poder entrar.
// ---------------------------------------------------------------------------

export const DOMINIO_DE_ACCESO = 'acceso.careonys.invalid';

/** La dirección con que el servicio de acceso conoce a esta cuenta. */
export function direccionDeAcceso(usuarioId) {
  const id = String(usuarioId ?? '').trim().toLowerCase();
  // Falla cerrado: sin cuenta no hay dirección, y armar una igual sería hablar por nadie.
  if (!id) throw new Error('direccionDeAcceso: falta la cuenta');
  return `${id}@${DOMINIO_DE_ACCESO}`;
}
