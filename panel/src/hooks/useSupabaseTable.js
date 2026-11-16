import { useCatalogo } from './useCatalogo';

/**
 * La lista completa de una tabla, con los cuatro estados. Es `useCatalogo` con el orden por
 * fecha de creación, que es lo que pide una lista de registros en vez de un catálogo.
 *
 * `select` sirve para traer también una tabla adjunta —por ejemplo los datos que viven aparte
 * del Legajo del Asistente—. Por defecto trae las columnas de la tabla y nada más.
 *
 * `filtros` son comparaciones por igual, y `requiere` los valores sin los cuales no se consulta,
 * como en `useCatalogo`.
 */
export function useSupabaseTable(
  tabla,
  { orderBy = 'creado_en', ascending = false, select = '*', filtros = null, requiere = [] } = {},
) {
  return useCatalogo(tabla, {
    columnas: select,
    filtros,
    requiere,
    orden: { columna: orderBy, ascendente: ascending },
  });
}
