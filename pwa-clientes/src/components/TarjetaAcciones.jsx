import { Link } from 'react-router-dom';
import { useLocale } from '../i18n/LocaleContext';
import { useOfreceMatch, useSeVe } from '../context/PerfilContext';
import { usePersonasAutorizadas } from '../context/PersonasAutorizadasContext';
import { pantallaPermitida } from '../lib/interruptorDeCadaPantalla';

/**
 * La tarjeta «Acciones» de la maqueta: la columna de botones blancos que lleva a cada pantalla.
 *
 * Con un Paciente abierto van primero las que cuelgan de él; después, siempre, las que son del
 * personas autorizadas entero y que no entraron en los cuatro botones de la barra de abajo.
 *
 * Cada botón pregunta lo mismo que pregunta la ruta que abre, con la misma función: si
 * contestaran distinto quedaría un botón que rebota, o una pantalla sin puerta de entrada.
 */
export default function TarjetaAcciones({ pacienteId }) {
  const { t } = useLocale();
  const seVe = useSeVe();
  const { puedeVer } = usePersonasAutorizadas();
  const ofreceMatch = useOfreceMatch();
  const seEntraA = (pantalla) => pantallaPermitida(pantalla, seVe, puedeVer);
  const base = pacienteId ? `/pacientes/${pacienteId}` : null;

  return (
    <section className="pwa-card" aria-labelledby="tarjeta-acciones">
      <h2 id="tarjeta-acciones">{t.paciente.acciones}</h2>
      <div className="pwa-acciones">
        {base && seEntraA('guardias') && (
          <Link to={`${base}/guardias`} className="btn">
            {t.paciente.ver_guardias_de_la_semana}
          </Link>
        )}
        {/* El chat y la vidriera cuelgan de la modalidad: donde la Prestadora no ofrece
            Match no hay con quién hablar ni a quién buscar. */}
        {ofreceMatch && (
          <Link to="/mensajes" className="btn">
            {t.nav.mensajes}
          </Link>
        )}
        {base && seEntraA('reportes') && (
          <Link to={`${base}/reportes`} className="btn">
            {t.paciente.ver_reportes}
          </Link>
        )}
        {base && seEntraA('alertas') && (
          <Link to={`${base}/alertas`} className="btn">
            {t.paciente.ver_alertas}
          </Link>
        )}
        {base && (
          <Link to={`${base}/asistente`} className="btn">
            {t.paciente.ver_asistente}
          </Link>
        )}
        {base && seEntraA('acceso') && (
          <Link to={`${base}/acceso`} className="btn">
            {t.paciente.ver_acceso}
          </Link>
        )}
        {base && seEntraA('medicacion') && (
          <Link to={`${base}/medicacion`} className="btn">
            {t.paciente.ver_medicacion}
          </Link>
        )}
        {ofreceMatch && (
          <Link to="/buscar" className="btn">
            {t.nav.buscar}
          </Link>
        )}
        {/* El código para el Asistente que llega es de las personas autorizadas entero: va en todas
            las tarjetas de acciones, con o sin Paciente abierto. */}
        <Link to="/codigo" className="btn">
          {t.nav.codigo}
        </Link>
        <Link to="/perfil" className="btn">
          {t.nav.perfil}
        </Link>
      </div>
    </section>
  );
}
