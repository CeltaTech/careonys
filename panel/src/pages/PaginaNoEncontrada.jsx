import { useNavigate } from 'react-router-dom';
import { useLocale } from '../i18n/LocaleContext';
import { Button } from '../components/ui/Button';
import './PaginaNoEncontrada.css';

/* Lo que se ve al entrar a una dirección del Panel que no existe. Sin esto la pantalla quedaba
   en blanco. Va adentro del marco del Panel, con el menú a la vista, para que se siga con un clic.

   La imagen es un archivo aparte para poder cambiarla sin tocar código: se reemplaza
   `public/ilustraciones/pagina-no-encontrada.svg`, o se apunta a otro archivo en ILUSTRACION. */
const ILUSTRACION = '/ilustraciones/pagina-no-encontrada.svg';

export function PaginaNoEncontrada() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const tx = t.pagina_no_encontrada;

  return (
    <div className="pagina-no-encontrada">
      <img className="pagina-no-encontrada-imagen" src={ILUSTRACION} alt="" />
      <h1>{tx.titulo}</h1>
      <p>{tx.frase}</p>
      <Button onClick={() => navigate('/', { replace: true })}>{tx.ir_a_la_portada}</Button>
    </div>
  );
}
