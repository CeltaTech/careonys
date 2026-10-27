import { con } from '../lib/textos';
import { horaDelMomento } from '../lib/horarios';

/**
 * Lo que ve la que se quedó de más porque el relevo no llegó.
 *
 * QUÉ RESUELVE. Hasta acá, cuando el relevo no aparecía, la pantalla seguía mostrando un turno
 * terminado y nada más. La persona estaba adentro de una casa, sin saber si alguien estaba
 * buscando a quien la reemplace, y sin ningún botón que sirviera para su propia situación. Del
 * lado del producto ese rato no existía.
 *
 * DOS COSAS, Y NINGUNA MÁS. Le dice desde cuándo está de más y en qué anda la búsqueda. Si tiene
 * que irse, eso es el Relevo de emergencia (`RelevoDeEmergencia.jsx`), que es otro caso y vive
 * aparte: no cuelga de este recuadro.
 *
 * NO LE PREGUNTA SI ACEPTA QUEDARSE, Y NO ES UN DESCUIDO. Quedarse hasta el relevo es un deber del
 * oficio: irse deja al Paciente solo y eso la expone a ella. Un botón para soltar el turno sería
 * ofrecerle meterse en un problema. Por eso el texto le pide, no le ordena, y por eso tampoco hay
 * nada acá que trabe el cierre de su turno: si decide irse, puede.
 *
 * LA BÚSQUEDA SE CUENTA SIN NOMBRES. Quién faltó, quién viene, a quién se le ofreció: nada de eso.
 * No le sirve —no puede llamar a nadie desde adentro de un turno— y decirle que faltó una
 * compañera es hablar de una persona a sus espaldas. Se le cuentan los pasos ya dados, que es lo
 * único que le contesta la pregunta real: ¿me están dejando sola?
 */
export default function ExtensionDeTurno({ t, locale, extension }) {
  const tr = t.extension;

  if (!extension) return null;

  return (
    <div className="alert alert-info pwa-card-pie" role="status">
      <h2>{tr.titulo}</h2>
      <p>{con(tr.desde, { hora: horaDelMomento(extension.desdeAt, locale) })}</p>
      <p>{tr.sigue_a_cargo}</p>

      <p>{tr.busqueda}</p>
      <ul>
        {/* El camino entero y no `tr.pasos[…]`: el verificador de textos huérfanos reconoce
            así que estas cinco claves se usan, aunque la clave la elija el backend. */}
        {(extension.pasos ?? []).map((paso) => (
          <li key={paso}>{t.extension.pasos[paso] ?? paso}</li>
        ))}
      </ul>
    </div>
  );
}
