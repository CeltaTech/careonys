import { useFrasesDelSistema } from '../../hooks/useFrasesDelSistema';

const CLAVES = ['pie_de_firmas.fecha', 'pie_de_firmas.firma', 'pie_de_firmas.aclaracion', 'pie_de_firmas.dni'];

// El pie de todo documento que se imprime para firmar a mano. Uno solo para todos, así ninguno
// pide datos distintos que otro. Las frases salen de la base, en el idioma del documento, que es
// en el que lo lee quien firma. Mientras no llegaron, no se dibuja: un pie a medias no se firma.
export function PieDeFirmas({ idioma }) {
  const { frases, estado } = useFrasesDelSistema(CLAVES, idioma);
  if (estado === 'cargando' || estado === 'error') return null;

  return (
    <div className="documento-firmas">
      {CLAVES.map((clave) => (
        <div key={clave}>{frases[clave]}</div>
      ))}
    </div>
  );
}
