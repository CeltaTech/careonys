import { useLocale } from '../../i18n/LocaleContext';

// La entrada del diseño «Careonys v2»: a la izquierda la marca de la Prestadora sobre el fondo
// oscuro, con el crédito del producto debajo, y a la derecha lo que se pida en cada caso.
//
// Sin Prestadora reconocida no hay marca que mostrar y el lado izquierdo queda vacío: no se
// adivina ninguna. El crédito va igual, siempre.
export function PantallaDeIngreso({ marca, children }) {
  const { t } = useLocale();
  return (
    <div className="ingreso">
      <div className="ingreso-marca">
        {marca?.logoUrl && <img className="ingreso-logo" src={marca.logoUrl} alt={marca.nombre ?? ''} />}
        {marca?.nombre && <div className="ingreso-nombre">{marca.nombre}</div>}
        <div className="ingreso-credito">{t.auth.con_tecnologia_de}</div>
      </div>
      <div className="ingreso-lado">
        <div className="ingreso-contenido">{children}</div>
      </div>
    </div>
  );
}
