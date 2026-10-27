// El botón que le avisa al titular que la Prestadora armó una autorización de acceso para firmar.
// Cuando la arma él mismo, la firma ahí mismo y este botón no llega a aparecer.
//
// NO BLOQUEA NI INTERRUMPE, A PROPÓSITO. Hasta la firma sigue rigiendo lo anterior: no hay nada
// trabado, así que un cartel que tape la pantalla estaría mintiendo. Llama la atención latiendo.
//
// SÓLO LO VE EL TITULAR, y sólo cuando hay algo pendiente. Para las personas autorizadas no existe: la
// autorización no es suya y no hay nada que puedan hacer con ella.
//
// Se dibuja en la pantalla principal y en Mi Perfil. La lista de Pacientes se saltea sola cuando
// hay uno solo, así que las dos son «la pantalla principal» según el Cliente, y la advertencia tiene que
// aparecer igual en las dos.

import { Link, useLocation } from 'react-router-dom';
import { useLocale } from '../i18n/LocaleContext';
import { usePersonasAutorizadas } from '../context/PersonasAutorizadasContext';

export default function AvisoInstruccionPendiente() {
  const { t } = useLocale();
  const { esTitular, instruccionPendiente } = usePersonasAutorizadas();
  const location = useLocation();

  if (!esTitular || !instruccionPendiente) return null;

  return (
    // De qué pantalla se salió, para volver a esa después de firmar y no a un lugar fijo.
    <Link to="/instruccion" state={{ desde: location.pathname }} className="btn boton-que-llama">
      {t.instruccion.documentacion_pendiente}
    </Link>
  );
}
