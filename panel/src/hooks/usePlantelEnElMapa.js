import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale } from '../i18n/LocaleContext';
import { supabase } from '../lib/supabaseClient';
import { mensajeDeError } from '../lib/errores';
import { useLugaresDelPlantel } from './useLugaresDelPlantel';
import { mapaDelPlantel, puntoDeLaSolicitud } from '../lib/mapaDelPlantel';

/* El plantel de este momento, listo para dibujar en el mapa.
   -----------------------------------------------------------------------------------------
   POR QUÉ ES UN HOOK Y NO UNA CONSULTA EN CADA PANTALLA. Las dos pantallas que muestran el mapa
   necesitan lo mismo: el plantel, dónde acepta trabajar cada uno y cómo están armadas las zonas.
   Escrito dos veces, una traería a los cesados y la otra no.

   SE MIRA EN VIVO Y NO SE GUARDA NADA. El mapa se arma con el plantel del momento en que se abre
   la pantalla. No hay ninguna tabla con puntos calculados: una foto guardada quedaría vieja el
   día que alguien cargue una ficha nueva, y nadie se enteraría.

   QUÉ COLUMNAS VIAJAN Y CUÁLES NO. Las justas para dibujar el punto y para ordenar la lista de
   sugeridos. La dirección escrita no se pide: no hace falta para dibujar un punto, y es dato
   sensible (CLAUDE.md §6). Tampoco se escribe en ningún lado ni aparece en un mensaje de error,
   ni viaja por la dirección de la pantalla. */
export function usePlantelEnElMapa({ solicitud = null } = {}) {
  const { t } = useLocale();
  const [filas, setFilas] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);

  const cargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    const { data, error: fallo } = await supabase
      .from('asistentes')
      .select('id, nombre, estado, especialidades, disponible_para_ofertas, lat, lng')
      .is('deleted_at', null);

    if (fallo) {
      setError(mensajeDeError(fallo, t));
      setEstado('error');
      return;
    }

    setFilas(data ?? []);
    setEstado('listo');
  }, [t]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const lugaresDelPlantel = useLugaresDelPlantel(filas.map((fila) => fila.id));

  // Desde dónde se mide la cercanía cuando el mapa se abre adentro de una Solicitud. Sale del
  // mismo catálogo que ya se trajo, y queda en nulo mientras esa Solicitud no tenga lugar: ahí el
  // mapa se muestra igual, sin decir nada de distancias.
  const origen = useMemo(
    () => (solicitud ? puntoDeLaSolicitud(solicitud, lugaresDelPlantel.catalogo) : null),
    [solicitud, lugaresDelPlantel.catalogo],
  );

  const datos = useMemo(
    () =>
      mapaDelPlantel(filas, {
        lugaresDe: lugaresDelPlantel.lugaresDe,
        zonas: lugaresDelPlantel.zonas,
        origen,
      }),
    [filas, lugaresDelPlantel, origen],
  );

  // Memorizado porque quien lo llama lo usa adentro de otros cálculos: un objeto nuevo en cada
  // dibujo volvería a ordenar el plantel entero sin que haya cambiado nada.
  return useMemo(
    () => ({
      datos,
      origen,
      // El plantel en crudo y dónde trabaja cada uno, para la pantalla que además arma con eso la
      // lista de sugeridos: pedirlo de nuevo por su cuenta sería la misma consulta dos veces.
      plantel: filas,
      nombresDeZonasDe: lugaresDelPlantel.nombresDe,
      lugares: lugaresDelPlantel.catalogo,
      // Un solo estado para las dos cargas: mientras falte cualquiera, el mapa no está.
      estado:
        estado === 'error' || lugaresDelPlantel.estado === 'error'
          ? 'error'
          : estado === 'listo' && lugaresDelPlantel.estado === 'listo'
            ? 'listo'
            : 'cargando',
      error: error ?? lugaresDelPlantel.error,
      recargar: cargar,
    }),
    [datos, origen, filas, lugaresDelPlantel, estado, error, cargar],
  );
}
