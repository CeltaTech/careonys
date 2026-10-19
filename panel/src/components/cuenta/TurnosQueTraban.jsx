import { Link } from 'react-router-dom';
import { useLocale } from '../../i18n/LocaleContext';
import { enlaceDelTurno } from '../../lib/turnosQueTraban';

/* Por qué no se pudo desactivar una cuenta, y qué turnos hay que resolver antes.

   El backend contesta con los motivos que aplican —reasignar los turnos que todavía no empezaron,
   cerrar los que ya terminaron— y con cada turno que traba. Va un bloque por motivo, en el orden
   en que llegan, y cada turno con un enlace al lugar donde se resuelve: la lista de Guardias desde
   ese día, y para los que hay que cerrar, la sección de Guardias sin cerrar de esa misma página. */
export function TurnosQueTraban({ motivos = [], turnos = [] }) {
  const { t, locale } = useLocale();
  const tc = t.asistentes.cuenta;
  const fecha = (valor) => new Date(`${valor}T00:00:00`).toLocaleDateString(locale);
  const horario = (turno) => `${(turno.hora_inicio ?? '').slice(0, 5)}–${(turno.hora_fin ?? '').slice(0, 5)}`;

  return (
    <div className="molde-pila">
      {motivos.map((motivo) => {
        const deEsteMotivo = turnos.filter((turno) => turno.motivo === motivo);
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
                    <th><span className="solo-lectores-pantalla">{tc.ir_al_turno}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {deEsteMotivo.map((turno) => (
                    <tr key={`${turno.tipo}-${turno.id}`}>
                      <td>
                        {turno.tipo === 'serie' ? `${tc.serie} · ${fecha(turno.fecha)}` : fecha(turno.fecha)}
                      </td>
                      <td>{horario(turno)}</td>
                      <td>{turno.cliente || '—'}</td>
                      <td><Link to={enlaceDelTurno(turno)}>{tc.ir_al_turno}</Link></td>
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
