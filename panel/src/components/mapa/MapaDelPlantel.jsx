import { useEffect, useMemo, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import { useLocale } from '../../i18n/LocaleContext';
import { EstadoLista } from '../layout/EstadoLista';
import { MAPA_DE_FONDO } from '../../config/mapaDeFondo';
import { SIN_ZONA, puntosDeLaZona } from '../../lib/mapaDelPlantel';

/* El mapa del plantel activo, agrupado por zona. Un solo componente para las dos pantallas que
   lo muestran: la del plantel y la de una Solicitud (`PRD_02_Panel_Admin.md` Módulo 2 y
   `PRD_03_Reclutamiento.md`, que piden expresamente que no se duplique).

   QUÉ DECIDE ESTE ARCHIVO: nada. Los números, los grupos y el encuadre llegan armados de
   `lib/mapaDelPlantel.js`; la dirección del fondo y la atribución, de `config/mapaDeFondo.js`;
   las palabras, de las traducciones. Acá sólo se dibuja.

   POR QUÉ LA LIBRERÍA DE MAPAS SE PIDE RECIÉN AL DIBUJAR. Es la pieza más pesada del Panel y la
   usa una sola pantalla de cada dos. Pedida al abrir el Panel, la pagaría también quien nunca
   abre el mapa.

   POR QUÉ LOS PUNTOS SON CÍRCULOS Y NO CHINCHETAS. La chincheta de la librería es una imagen
   suelta que hay que ir a buscar a otra dirección, y con la compilación de por medio termina
   pidiéndola donde no está: el mapa se dibuja y no aparece ni un punto. Un círculo lo dibuja el
   navegador solo, con los colores del sistema de diseño.

   EL VACÍO ACÁ ES IMPORTANTE. Si nadie del plantel tiene su ubicación cargada, no se muestra un
   mapa mudo: se dice que todavía no hay nada que ubicar. Un mapa vacío parece un mapa roto. */

// De dónde salen los colores de los puntos. Son tokens del sistema de diseño, no colores
// escritos acá: la librería de mapas necesita un color concreto y los toma de la hoja de estilos.
const COLOR_PUNTO = '--azul-medio';
const COLOR_APAGADO = '--texto-secundario';
const COLOR_ORIGEN = '--verde-exito';

function colorDelSistema(nombre) {
  if (typeof window === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
}

export function MapaDelPlantel({ datos, origen = null, estado, error, recargar }) {
  const { t } = useLocale();
  const tm = t.mapa_del_plantel;
  const contenedor = useRef(null);
  const mapa = useRef(null);
  const capaDePuntos = useRef(null);
  const [leaflet, setLeaflet] = useState(null);
  const [falloElMapa, setFalloElMapa] = useState(false);
  const [zonaElegida, setZonaElegida] = useState('');

  useEffect(() => {
    let vivo = true;
    import('leaflet')
      .then((modulo) => {
        if (vivo) setLeaflet(modulo.default ?? modulo);
      })
      .catch(() => {
        if (vivo) setFalloElMapa(true);
      });
    return () => {
      vivo = false;
    };
  }, []);

  const visibles = useMemo(
    () => puntosDeLaZona(datos?.puntos ?? [], zonaElegida),
    [datos, zonaElegida],
  );

  // Una zona que se dejó de mostrar —porque se recargó el plantel y ya no está— dejaría la
  // pantalla filtrada por algo que no existe, y sin forma de darse cuenta.
  useEffect(() => {
    const sigue = (datos?.grupos ?? []).some((grupo) => grupo.id === zonaElegida);
    if (zonaElegida && !sigue) setZonaElegida('');
  }, [datos, zonaElegida]);

  useEffect(() => {
    if (!leaflet || !contenedor.current || !datos?.encuadre) return;

    if (!mapa.current) {
      mapa.current = leaflet.map(contenedor.current, { scrollWheelZoom: false });
      leaflet
        .tileLayer(MAPA_DE_FONDO.cuadraditos, {
          maxZoom: MAPA_DE_FONDO.zoomMaximo,
          attribution: MAPA_DE_FONDO.atribucion,
        })
        .addTo(mapa.current);
      capaDePuntos.current = leaflet.layerGroup().addTo(mapa.current);
    }

    capaDePuntos.current.clearLayers();

    const color = colorDelSistema(COLOR_PUNTO);
    const apagado = colorDelSistema(COLOR_APAGADO);
    for (const punto of visibles) {
      const circulo = leaflet.circleMarker([punto.lat, punto.lng], {
        radius: 7,
        color: punto.disponible ? color : apagado,
        fillColor: punto.disponible ? color : apagado,
        fillOpacity: 0.65,
        weight: 2,
      });
      // Lo que se lee al tocar un punto: quién es, en qué zonas trabaja y, cuando hay desde dónde
      // medir, a cuántos kilómetros queda en línea recta. Ninguna dirección (CLAUDE.md §6).
      const renglones = [punto.nombre];
      if (punto.nombresDeZonas.length > 0) renglones.push(punto.nombresDeZonas.join(' · '));
      if (Number.isFinite(punto.km)) {
        renglones.push(tm.a_distancia.replace('{km}', Math.round(punto.km * 10) / 10));
      }
      circulo.bindPopup(renglones.join('<br>'));
      circulo.addTo(capaDePuntos.current);
    }

    if (origen) {
      leaflet
        .circleMarker([origen.lat, origen.lng], {
          radius: 9,
          color: colorDelSistema(COLOR_ORIGEN),
          fillColor: colorDelSistema(COLOR_ORIGEN),
          fillOpacity: 0.35,
          weight: 3,
        })
        .bindPopup(tm.punto_de_la_solicitud)
        .addTo(capaDePuntos.current);
    }

    const aEncuadrar = origen ? [...visibles, origen] : visibles;
    if (aEncuadrar.length === 1) {
      mapa.current.setView([aEncuadrar[0].lat, aEncuadrar[0].lng], MAPA_DE_FONDO.zoomDeUnPunto);
    } else if (aEncuadrar.length > 1) {
      mapa.current.fitBounds(
        aEncuadrar.map((punto) => [punto.lat, punto.lng]),
        { padding: [MAPA_DE_FONDO.margenDelEncuadre, MAPA_DE_FONDO.margenDelEncuadre] },
      );
    }
  }, [leaflet, datos, visibles, origen, tm]);

  useEffect(
    () => () => {
      if (mapa.current) {
        mapa.current.remove();
        mapa.current = null;
      }
    },
    [],
  );

  return (
    <section className="mapa-plantel">
      <h3>{tm.titulo}</h3>

      <EstadoLista
        estado={falloElMapa ? 'error' : estado}
        error={falloElMapa ? t.comun.error_generico : error}
        recargar={recargar}
        vacio={estado === 'listo' && (datos?.ubicadas ?? 0) === 0}
        mensajeVacio={(datos?.total ?? 0) === 0 ? tm.vacio_sin_plantel : tm.vacio_sin_ubicacion}
        ayudaVacio={(datos?.total ?? 0) === 0 ? tm.vacio_sin_plantel : tm.vacio_ayuda}
      >
        <>
          <p className="mapa-plantel-cuenta">
            {tm.cuantas
              .replace('{ubicadas}', datos?.ubicadas ?? 0)
              .replace('{total}', datos?.total ?? 0)}
          </p>

          {/* Las zonas, con cuántos hay en cada una. Se elige una y el mapa muestra sólo esa:
              es la forma de agrupar sin repartir colores que nadie definió. */}
          <div className="mapa-plantel-zonas">
            <button
              type="button"
              className="mapa-plantel-zona"
              onClick={() => setZonaElegida('')}
              aria-pressed={zonaElegida === ''}
            >
              {t.comun.todos} ({datos?.ubicadas ?? 0})
            </button>
            {(datos?.grupos ?? []).map((grupo) => (
              <button
                key={grupo.id}
                type="button"
                className="mapa-plantel-zona"
                onClick={() => setZonaElegida(grupo.id)}
                aria-pressed={zonaElegida === grupo.id}
              >
                {grupo.id === SIN_ZONA ? tm.sin_zona : grupo.nombre} ({grupo.ubicadas})
              </button>
            ))}
          </div>

          <div
            ref={contenedor}
            className="mapa-plantel-lienzo"
            style={{ height: MAPA_DE_FONDO.alto }}
            role="application"
            aria-label={tm.titulo}
          />

          {/* Quien no ve el mapa tiene que poder leer lo mismo que muestra. */}
          <ul className="mapa-plantel-lista">
            {visibles.map((punto) => (
              <li key={punto.id}>
                {punto.nombre}
                {punto.nombresDeZonas.length > 0 && ` — ${punto.nombresDeZonas.join(' · ')}`}
                {Number.isFinite(punto.km) &&
                  ` — ${tm.a_distancia.replace('{km}', Math.round(punto.km * 10) / 10)}`}
              </li>
            ))}
          </ul>

          {(datos?.sinUbicar ?? 0) > 0 && (
            <p className="mapa-plantel-sin-ubicar">
              {tm.sin_ubicacion.replace('{n}', datos.sinUbicar)}
            </p>
          )}
        </>
      </EstadoLista>
    </section>
  );
}
