import { useId, useState } from 'react';

// ORIGINAL. La copia de `pwa-asistentes/` se regenera con `scripts/sincronizar_copias.mjs` y nunca
// se edita a mano.
//
// La «i» al lado de la etiqueta de un casillero: muestra un texto breve al pasar el puntero, al
// llegar con el teclado o al tocarla. Es la excepción a «ningún casillero lleva una explicación
// debajo», y cada uso se justifica: hoy, sólo qué caracteres admite el nombre de usuario.
//
// El texto queda atado a la «i» con `aria-describedby`, así que quien no ve la pantalla lo escucha
// al llegar a ella aunque no esté a la vista.
export default function InfoDelCampo({ texto, etiqueta }) {
  const id = useId();
  const [abierta, setAbierta] = useState(false);

  return (
    <span
      className="info-del-campo"
      onMouseEnter={() => setAbierta(true)}
      onMouseLeave={() => setAbierta(false)}
    >
      <button
        type="button"
        className="info-del-campo-boton"
        aria-label={etiqueta}
        aria-describedby={id}
        aria-expanded={abierta}
        onClick={() => setAbierta((antes) => !antes)}
        onFocus={() => setAbierta(true)}
        onBlur={() => setAbierta(false)}
      >
        i
      </button>
      <span id={id} role="tooltip" className="info-del-campo-texto" hidden={!abierta}>
        {texto}
      </span>
    </span>
  );
}
