// El pie de todo documento que se imprime para firmar en papel. Uno solo para todos, así ninguno
// pide datos distintos que otro. Recibe las frases del documento, que van en el idioma en que lo
// lee quien firma.
export function PieDeFirmas({ textos }) {
  return (
    <div className="documento-firmas">
      <div>{textos.pie_fecha}</div>
      <div>{textos.pie_firma}</div>
      <div>{textos.pie_aclaracion}</div>
      <div>{textos.pie_dni}</div>
    </div>
  );
}
