/* Las dos etapas de la puesta en marcha de una Prestadora nueva, sin pantalla y sin base.
   ==========================================================================

   ETAPA 1, CONFIGURACIÓN INICIAL: datos, zonas y precios. Qué está hecho no se decide acá: lo
   contesta el backend (`GET /api/panel/cuentas/configuracion-inicial`), que es el mismo criterio
   con el que rechaza el alta de Asistentes y de Clientes mientras falte algo. El Panel no lo
   copia, así que la guía y el candado no pueden discrepar.

   ETAPA 2, LA GENTE: Asistentes, sus tipos, Clientes y equipo. Aparece recién con la etapa 1
   completa: antes no se puede cargar a nadie, y mostrarla sería pedir algo imposible.

   `clave` nombra los textos de cada paso (`t.guia_primeros_pasos.paso_<clave>_*`). */

/** A dónde lleva el botón de cada paso. */
export const RUTA_DE_CADA_PASO = {
  datos: '/configuracion/prestadora',
  zonas: '/configuracion/prestadora',
  precios: '/lista-precios',
  gente: '/asistentes',
  tipos: '/asistentes',
  cliente: '/clientes',
  equipo: '/usuarios-panel',
};

/**
 * Los pasos de la etapa 2, derivados de lo que ya está cargado.
 *
 * «Sus tipos de Asistente» está hecho mientras no haya ningún Asistente sin clasificar —el mismo
 * criterio que usa `pages/Asistentes.jsx` (`sinTipo`)—. Con cero Asistentes también: los tipos
 * de fábrica ya sirven sin que la Prestadora toque nada.
 */
export function pasosDeLaSegundaEtapa({ gente = [], clientes = [], hayCoordinador = false }) {
  return [
    { clave: 'gente', hecho: gente.length > 0 },
    { clave: 'tipos', hecho: gente.every((a) => Boolean(a.tipo_asistente_id)) },
    { clave: 'cliente', hecho: clientes.some((c) => !c.deleted_at) },
    { clave: 'equipo', hecho: hayCoordinador === true },
  ];
}

/**
 * Los pasos que muestra la guía, en orden y con su ruta: siempre los de la configuración inicial,
 * y los de la etapa 2 sólo cuando la configuración inicial está completa.
 *
 * @param {{ pasos: {clave: string, hecho: boolean}[], completa: boolean } | null} configuracion
 * @param {{clave: string, hecho: boolean}[]} segundaEtapa
 */
export function pasosVisibles(configuracion, segundaEtapa = []) {
  if (!configuracion) return [];
  const primera = configuracion.pasos ?? [];
  const todos = configuracion.completa === true ? [...primera, ...segundaEtapa] : primera;
  return todos.map((p) => ({ ...p, ruta: RUTA_DE_CADA_PASO[p.clave] }));
}

/**
 * Si los botones que cargan Asistentes o Clientes van apagados. Falla cerrado: sólo se encienden
 * cuando se sabe que la configuración inicial está completa. Mientras carga, si la consulta
 * falló o si no hay Organización, quedan apagados — el backend rechazaría igual.
 */
export function cargaDeGenteBloqueada(configuracion) {
  return configuracion?.completa !== true;
}
