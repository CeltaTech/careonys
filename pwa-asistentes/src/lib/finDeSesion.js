/* El aviso de fin de sesión, para el registro de actividad.
   ==========================================================================

   Lo usan el Panel y las dos aplicaciones. Original en el Panel; las copias de las aplicaciones
   las mantiene `scripts/sincronizar_copias.mjs`. Quién manda el aviso lo pone cada una, porque
   cada una habla con el backend por su propio camino: acá llega como `enviar(causa)`.

   Se manda justo antes de cerrar, con la sesión que todavía vale: después ya no hay con qué
   escribirlo. La causa es una de `CAUSAS_DE_FIN_DE_SESION`.

   NUNCA FRENA EL CIERRE. Si el backend no contesta, o contesta mal, la sesión se cierra igual: se
   espera como mucho `ESPERA_MAXIMA_MS` y se sigue. Quien quiere salir sale. */

export const CAUSAS_DE_FIN_DE_SESION = { A_MANO: 'a_mano', POR_INACTIVIDAD: 'por_inactividad' };

export const ESPERA_MAXIMA_MS = 3000;

export async function anotarFinDeSesion(enviar, causa, esperaMaximaMs = ESPERA_MAXIMA_MS) {
  let reloj;
  const plazo = new Promise((resolver) => {
    reloj = setTimeout(resolver, esperaMaximaMs);
  });
  try {
    await Promise.race([Promise.resolve().then(() => enviar(causa)), plazo]);
  } catch {
    // Sin constancia la sesión se cierra igual.
  } finally {
    clearTimeout(reloj);
  }
}
