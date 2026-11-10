import { llamadorDe } from './apiPanel';

/* La información de salud del Panel.
   ==================================

   La base no entrega información de salud a quien va directo: sólo por las funciones que anotan,
   en la misma operación, a qué Pacientes alcanzó. El Panel la pide al backend, que repite la
   consulta sobre la conexión de la sesión y la manda por esas funciones.

   Se escribe igual que una consulta de Supabase —`informacionDeSalud.from('reportes').select(…)
   .eq(…)`— y devuelve lo mismo, `{ data, error, count }`, sin levantar excepciones. La pantalla
   no cambia nada más que el `from`. Lo que viaja es la lista de pasos; la Prestadora la decide la
   sesión, nunca el pedido. */

const llamar = llamadorDe('/informacion-de-salud');

const PASOS = [
  'select', 'insert', 'update',
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'is', 'not', 'or',
  'order', 'limit', 'maybeSingle', 'single',
];

class Pedido {
  constructor(tabla) {
    this.tabla = tabla;
    this.pasos = [];
  }

  async ejecutar() {
    try {
      const { data = null, count = null } = await llamar(`/${this.tabla}`, {
        method: 'POST',
        body: JSON.stringify({ pasos: this.pasos }),
      });
      return { data, count, error: null };
    } catch (error) {
      return { data: null, count: null, error };
    }
  }

  then(ok, mal) {
    return this.ejecutar().then(ok, mal);
  }
}

for (const m of PASOS) {
  Pedido.prototype[m] = function paso(...a) {
    // Los argumentos sin valor del final no viajan: `select()` es lo mismo que `select(undefined)`.
    while (a.length && a[a.length - 1] === undefined) a.pop();
    this.pasos.push(a.length ? { m, a } : { m });
    return this;
  };
}

export const informacionDeSalud = {
  from: (tabla) => new Pedido(tabla),
};
