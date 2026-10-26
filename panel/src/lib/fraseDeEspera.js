// La frase de quien tiene que esperar antes de volver a probar: el tope de intentos y el de
// pedidos se dicen igual en todo el producto, y los dos dicen cuántos minutos faltan.
export function fraseDeEspera(t, minutos) {
  if (!Number.isInteger(minutos) || minutos < 1) return t.auth.clave_nueva_demasiados_intentos;
  if (minutos === 1) return t.auth.clave_nueva_demasiados_intentos_minutos_uno;
  return t.auth.clave_nueva_demasiados_intentos_minutos.replace('{minutos}', minutos);
}
