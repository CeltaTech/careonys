/* El día y la hora de una entrevista, entre el campo del navegador y el backend.
   ==========================================================================

   POR QUÉ ESTÁ APARTE. Un campo de fecha y hora del navegador escribe `2026-10-07T10:00`, sin
   decir de qué zona horaria es. Se lee en el reloj de la Prestadora (lib/horarios.js), que es el
   de la entrevista, y no en el del aparato de quien mira. El backend guarda un instante en
   formato universal. La conversión de ida y la de vuelta tienen que ser la misma o la
   cita se corre: se guarda una hora, se vuelve a abrir el formulario y dice otra.

   Escrito adentro del componente esto no se podía probar sin dibujar la pantalla, que es
   justamente donde el error no se ve. Acá son dos funciones sueltas, y la prueba las hace ir y
   volver. */

import { momentoDelCampo, momentoParaElCampo } from './horarios';

/** Del instante que guarda el backend al texto que espera el campo, en el reloj de la Prestadora.
 *  Devuelve texto vacío cuando no hay nada que mostrar: un campo no puede quedar con «undefined». */
export function paraElCampo(iso) {
  return momentoParaElCampo(iso);
}

/** Del texto del campo al instante que entiende el backend. Devuelve `null` cuando no se entiende,
 *  y quien llama no manda nada: una fecha a medio escribir no es una cita. */
export function desdeElCampo(valor) {
  const fecha = momentoDelCampo(valor);
  return fecha ? fecha.toISOString() : null;
}
