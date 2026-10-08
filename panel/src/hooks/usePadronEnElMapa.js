import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale } from '../i18n/LocaleContext';
import { supabase } from '../lib/supabaseClient';
import { mensajeDeError } from '../lib/errores';
import { useLugaresDelPadron } from './useLugaresDelPadron';
import { mapaDelPadron } from '../lib/mapaDelPadron';

/* El Padrón de este momento, listo para dibujar en el mapa.
   -----------------------------------------------------------------------------------------
   POR QUÉ ES UN HOOK Y NO UNA CONSULTA EN LA PANTALLA. El mapa necesita tres cosas juntas: el
   Padrón, dónde acepta trabajar cada uno y cómo están armadas las zonas. Acá se piden y se
   esperan las tres, y la pantalla recibe el mapa armado.

   SE MIRA EN VIVO Y NO SE GUARDA NADA. El mapa se arma con el Padrón del momento en que se abre
   la pantalla. No hay ninguna tabla con puntos calculados: una foto guardada quedaría vieja el
   día que alguien cargue el Legajo de un Asistente nuevo, y nadie se enteraría.

   QUÉ COLUMNAS VIAJAN Y CUÁLES NO. Las justas para dibujar el punto y agruparlo. La dirección escrita no se pide: no hace falta para dibujar un punto, y es dato
   sensible (CLAUDE.md §6). Tampoco se escribe en ningún lado ni aparece en un mensaje de error,
   ni viaja por la dirección de la pantalla. */
export function usePadronEnElMapa() {
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

  const lugaresDelPadron = useLugaresDelPadron(filas.map((fila) => fila.id));

  const datos = useMemo(
    () =>
      mapaDelPadron(filas, {
        lugaresDe: lugaresDelPadron.lugaresDe,
        zonas: lugaresDelPadron.zonas,
      }),
    [filas, lugaresDelPadron],
  );

  // Memorizado para que un objeto nuevo en cada dibujo no le haga creer al mapa que el Padrón
  // cambió cuando no cambió nada.
  return useMemo(
    () => ({
      datos,
      // Un solo estado para las dos cargas: mientras falte cualquiera, el mapa no está.
      estado:
        estado === 'error' || lugaresDelPadron.estado === 'error'
          ? 'error'
          : estado === 'listo' && lugaresDelPadron.estado === 'listo'
            ? 'listo'
            : 'cargando',
      error: error ?? lugaresDelPadron.error,
      recargar: cargar,
    }),
    [datos, lugaresDelPadron, estado, error, cargar],
  );
}
