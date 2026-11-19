import { Link } from 'react-router-dom';
import { useLocale } from '../../i18n/LocaleContext';
import { enlaceDelTurnoGuardia } from '../../lib/turnosGuardiaQueTraban';

/* Por qué no se pudo desactivar una cuenta, y qué turnos hay que resolver antes.

   El backend contesta con los motivos que aplican —reasignar los turnos que todavía no empezaron,
   cerrar los que ya terminaron— y con cada turno que traba. Va un bloque por motivo, en el orden
   en que llegan, y cada turno con un enlace al lugar donde se resuelve: la lista de Guardias desde
   ese día, y para los que hay que cerrar, la sección de Guardias sin cerrar de esa misma página. */
export function TurnosGuardiaQueTraban({ motivos = [], turnos_guardia = [] }) {
  const { t, locale } = useLocale();
  const tc = t.asistentes.cuenta;
  const fecha = (valor) => new Date(`${valor}T00:00:00`).toLocaleDateString(locale);
  const horario = (turno_guardia) => `${(turno_guardia.hora_inicio ?? '').slice(0, 5)}–${(turno_guardia.hora_fin ?? '').slice(0, 5)}`;

  return (
    <div className="molde-pila">
      {motivos.map((motivo) => {
        const deEsteMotivo = turnos_guardia.filter((turno_guardia) => turno_guardia.motivo === motivo);
        return (
          <section key={motivo} role="alert">
            <h3>{t.errores.motivos[motivo]}</h3>
            {deEsteMotivo.length > 0 && (
              <table className="panel-tabla">
                <thead>
                  <tr>
                    <th>{tc.col_fecha}</th>
                    <th>{tc.col_horario}</th>
                    <th>{tc.col_cliente}</th>
                    <th><span className="solo-lectores-pantalla">{tc.ir_al_turno_guardia}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {deEsteMotivo.map((turno_guardia) => (
                    <tr key={`${turno_guardia.tipo}-${turno_guardia.id}`}>
                      <td>
                        {turno_guardia.tipo === 'serie' ? `${tc.serie} · ${fecha(turno_guardia.fecha)}` : fecha(turno_guardia.fecha)}
                      </td>
                      <td>{horario(turno_guardia)}</td>
                      <td>{turno_guardia.cliente || '—'}</td>
                      <td><Link to={enlaceDelTurnoGuardia(turno_guardia)}>{tc.ir_al_turno_guardia}</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        );
      })}
    </div>
  );
}
