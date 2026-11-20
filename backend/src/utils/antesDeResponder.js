// LO QUE SE ANOTA ANTES DE QUE SALGA LA RESPUESTA.
//
// Algunos renglones del registro dependen de cómo terminó el pedido: un borrado se anota sólo si
// salió bien, y una descarga sólo si se entregó. Escucharlo cuando la respuesta ya salió deja la
// escritura suelta: si falla o el proceso se corta, la acción queda hecha y sin constancia, y
// quien pidió nunca se entera.
//
// Por eso se engancha en el último paso de la respuesta. La ruta ya decidió cómo termina, pero lo
// que contesta todavía no salió: primero se espera a que `tarea` termine y recién después se
// entrega la respuesta tal como la ruta la armó. Una falla de `tarea` queda en el registro del
// servidor y no cambia la respuesta; quien necesite fallar cerrado lo resuelve antes de la ruta.
//
// Se puede enganchar más de una tarea sobre la misma respuesta: corren de la última a la primera,
// y cada una espera a la anterior.

/**
 * Corre `tarea` cuando la ruta termina la respuesta, y entrega la respuesta después de que
 * `tarea` terminó. `tarea` puede leer `res.statusCode` para saber cómo salió el pedido.
 */
export function antesDeResponder(res, tarea) {
  const terminar = res.end;
  res.end = function terminarDespuesDeAnotar(...argumentos) {
    res.end = terminar;
    Promise.resolve()
      .then(() => tarea())
      .catch((error) => console.error('Error en lo que se anota antes de responder:', error?.message ?? error))
      .finally(() => terminar.apply(res, argumentos));
    return res;
  };
}
