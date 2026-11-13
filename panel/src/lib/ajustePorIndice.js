import {
  BORDES,
  SIN_INDICE,
  condicionDe,
  condicionDelServicioQueSePuedeGuardar,
  leerValorDeLaCondicion,
} from './condicionesDelCliente';

/* El ajuste periódico por índice de un Servicio, sin dibujar nada.
   ==========================================================================

   Tres condiciones: qué índice, cada cuántos meses y si el precio nuevo se aplica solo o queda
   propuesto para que la administración lo revise. Qué rige lo decide `condicionDe` —fábrica,
   después la Prestadora, después el Servicio—, la misma regla que usa la base al ajustar
   (`interno.condiciones_del_ajuste_por_indice`).

   La regla de la Prestadora sólo se la abre la base a la administración. Cuando no se la pudo
   leer, `regla` llega `undefined`: lo que se muestra cae a fábrica y lo que se guarda se guarda
   tal cual se eligió, porque no se sabe qué rige desde arriba y guardar null podría cambiarlo. */

export const CLAVES_DEL_AJUSTE = Object.freeze([
  'indice_de_actualizacion',
  'meses_entre_actualizaciones',
  'ajuste_por_indice',
]);

// Lo que viene de los casilleros, leído a la clase de cada clave. Lo que no se puede leer queda
// como llegó y `condicionDe` lo ignora: rige el de arriba.
function delServicioParaLeer(elegido) {
  const resultado = {};
  for (const clave of CLAVES_DEL_AJUSTE) resultado[clave] = leerValorDeLaCondicion(clave, elegido?.[clave]);
  return resultado;
}

// Lo que rige con lo que está elegido en este momento. El índice null es «ninguno».
export function ajusteQueRige(regla, elegido) {
  const delServicio = delServicioParaLeer(elegido);
  return {
    indice_de_actualizacion: condicionDe('indice_de_actualizacion', regla ?? null, delServicio),
    meses_entre_actualizaciones: condicionDe('meses_entre_actualizaciones', regla ?? null, delServicio),
    ajuste_por_indice: condicionDe('ajuste_por_indice', regla ?? null, delServicio),
  };
}

/* Lo que muestran los casilleros al abrir: lo que rige, para que se vea sin ir a buscarlo. El
   índice que no rige se muestra como SIN_INDICE, que es una opción más de la lista. Al guardar,
   lo que siga coincidiendo con lo de arriba vuelve a ser null. */
export function casillerosDelAjuste(regla, fila) {
  const rige = ajusteQueRige(regla, fila);
  return {
    indice_de_actualizacion: rige.indice_de_actualizacion ?? SIN_INDICE,
    meses_entre_actualizaciones: String(rige.meses_entre_actualizaciones),
    ajuste_por_indice: rige.ajuste_por_indice,
  };
}

/* Lo que se manda a la base. Devuelve { ok: true, valores } o { ok: false, clave } con la primera
   clave mal cargada. Lo que coincide con lo que rige desde arriba se guarda null; sin índice que
   rija, los meses y el ajuste no dicen nada y también van null. */
export function ajusteQueSePuedeGuardar(regla, elegido) {
  const valores = { meses_entre_actualizaciones: null, ajuste_por_indice: null };
  const sinIndice = ajusteQueRige(regla, elegido).indice_de_actualizacion === null;
  // Sin índice que rija, los meses y el ajuste están escondidos y no se revisan.
  const claves = sinIndice ? ['indice_de_actualizacion'] : CLAVES_DEL_AJUSTE;
  for (const clave of claves) {
    const revisado = condicionDelServicioQueSePuedeGuardar(clave, elegido?.[clave], regla);
    if (!revisado.ok) return { ok: false, clave };
    valores[clave] = revisado.valor;
  }
  return { ok: true, valores };
}

export const MESES_MINIMO = BORDES.meses_entre_actualizaciones.minimo;
export const MESES_MAXIMO = BORDES.meses_entre_actualizaciones.maximo;

// «2026-03-01» → «03/2026». La fecha de la base es un día, no un instante: se la corta como texto
// para que la zona horaria del navegador no la corra al mes anterior.
export function mesDeLaFecha(fecha) {
  const partes = /^(\d{4})-(\d{2})/.exec(String(fecha ?? ''));
  return partes ? `${partes[2]}/${partes[1]}` : '';
}
