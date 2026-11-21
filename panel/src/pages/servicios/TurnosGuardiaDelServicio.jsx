import { useState } from 'react';
import { Link } from 'react-router-dom';
import { traducirValor } from '../../i18n/valores';
import { claseBadge } from '../../lib/tonos';
import { con } from '../../lib/textos';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { AsignarTurnoGuardiaModal } from '../../components/turnos_guardia/AsignarTurnoGuardiaModal';
import { NuevoTurnoGuardiaModal } from '../turnos_guardia/NuevoTurnoGuardiaModal';
import { AsignarConDocumentosModal } from '../turnos_guardia/AsignarConDocumentosModal';
import { useAuth } from '../../context/AuthContext';
import { usePermisos } from '../../context/PermisosContext';
import { esAdminOSuperior } from '../../lib/roles';
import { nombreDeModalidad } from './modalidadesDelServicio';

/* LA PESTAÑA DE TURNOS DE GUARDIA DEL SERVICIO

   Lista los turnos de guardia del Servicio y deja hacer, sin salir de la ficha, las dos cosas que
   más se hacen con ellos: crear uno nuevo para este Servicio y asignar a quien lo haga cuando no
   tiene a nadie. Para todo lo demás está la agenda, que se abre ya mirando este Servicio.

   QUÉ ES UN TURNO SIN CUBRIR. Es el que espera Asistente: programado y sin nadie. Uno pausado o
   suspendido tampoco tiene a nadie, pero no espera a nadie mientras dure la interrupción, y la base
   no deja asignarlo. Por eso no se dice «Sin cubrir» ni se ofrece asignar. */

const ESTADO_ACTIVO = 'vigente';

/** ¿Este turno de guardia espera que alguien lo tome? Es el único que se puede asignar. */
function esperaAsistente(turno_guardia) {
  return !turno_guardia.asistente_id && turno_guardia.estado === 'programada';
}

export function TurnosGuardiaDelServicio({
  servicio,
  turnos_guardia,
  cuantosMostrar,
  nombresPaciente,
  nombresAsistente,
  onCambio,
  t,
}) {
  const d = t.servicios.detalle;
  const { usuario } = useAuth();
  const { puede } = usePermisos();
  const puedeAsignarIgual = esAdminOSuperior(usuario?.rol) || puede('asignar_con_documentos_pendientes');
  const [creando, setCreando] = useState(false);
  const [asignando, setAsignando] = useState(null);
  // Lo que dejó la creación: el turno se creó, pero la asignación no salió. Si la frenaron los
  // documentos, trae cómo repetirla con el motivo de la excepción.
  const [aviso, setAviso] = useState(null);
  const [excepcion, setExcepcion] = useState(null);
  const [asignandoIgual, setAsignandoIgual] = useState(false);

  const vigente = servicio.estado === ESTADO_ACTIVO;
  // La ventana de crear sólo ofrece Servicios vigentes con Coordinador: la base rechaza los demás.
  const sePuedeCrear = vigente && Boolean(servicio.coordinador_id);
  const visibles = turnos_guardia.slice(0, cuantosMostrar);

  function alCrear(errorAsignar = null, pendiente = null) {
    setCreando(false);
    setAviso(errorAsignar);
    setExcepcion(errorAsignar && pendiente ? pendiente : null);
    onCambio();
  }

  return (
    <>
      <div className="molde-acciones">
        {sePuedeCrear && <Button onClick={() => setCreando(true)}>{t.turnos_guardia.listado.nueva}</Button>}
        <Link className="panel-enlace" to={`/turnos-guardia?servicio=${encodeURIComponent(servicio.id)}`}>
          {d.abrir_en_turnos_guardia}
        </Link>
      </div>

      {aviso && (
        <Alert variant="error">
          {aviso}
          {excepcion && puedeAsignarIgual && (
            <>
              {' '}
              <Button variant="secondary" onClick={() => setAsignandoIgual(true)}>
                {t.documentos_asistente.asignar_igual}
              </Button>
            </>
          )}
        </Alert>
      )}

      {turnos_guardia.length === 0 ? (
        <p className="estado-vacio">{d.sin_turnos_guardia}</p>
      ) : (
        <>
          {turnos_guardia.length > cuantosMostrar && (
            <span className="panel-mini">{con(d.turnos_guardia_mostrados, { n: cuantosMostrar })}</span>
          )}
          <div className="servicios-tabla-envoltura">
            <table className="panel-tabla">
              <thead>
                <tr>
                  <th>{d.col_fecha}</th>
                  <th>{d.col_horario}</th>
                  <th>{d.col_para_quien}</th>
                  <th>{d.col_asistente}</th>
                  <th>{t.servicios.col_modalidades}</th>
                  <th>{d.col_estado}</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((g) => (
                  <tr key={g.id}>
                    <td>{g.fecha}</td>
                    <td>{g.hora_inicio?.slice(0, 5)} – {g.hora_fin?.slice(0, 5)}</td>
                    <td>{nombresPaciente[g.paciente_id] || '—'}</td>
                    <td>
                      {g.asistente_id ? (
                        nombresAsistente[g.asistente_id] || '—'
                      ) : esperaAsistente(g) ? (
                        <>
                          {d.sin_cubrir}{' '}
                          {vigente && (
                            <Button variant="secondary" onClick={() => setAsignando(g)}>
                              {t.documentos_asistente.asignar}
                            </Button>
                          )}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{g.canal_modalidad ? nombreDeModalidad(g.canal_modalidad, t) : '—'}</td>
                    {/* El estado del turno de guardia se traduce con los textos de Guardias: es el
                        mismo estado, y no se nombra de dos maneras. */}
                    <td>
                      <span className={claseBadge(g.estado)}>{traducirValor(t.turnos_guardia, `estado_${g.estado}`)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {creando && (
        <NuevoTurnoGuardiaModal servicioId={servicio.id} onClose={() => setCreando(false)} onCreada={alCrear} />
      )}

      {asignando && (
        <AsignarTurnoGuardiaModal
          turnoGuardia={asignando}
          pacientes={asignando.paciente_id ? [{ id: asignando.paciente_id, nombre: nombresPaciente[asignando.paciente_id] ?? null }] : []}
          onClose={() => setAsignando(null)}
          onAsignado={() => { setAsignando(null); onCambio(); }}
        />
      )}

      {asignandoIgual && excepcion && (
        <AsignarConDocumentosModal
          documentos={excepcion.documentos}
          reintentar={excepcion.reintentar}
          onClose={() => setAsignandoIgual(false)}
          onAsignado={() => {
            setAsignandoIgual(false);
            setAviso(null);
            setExcepcion(null);
            onCambio();
          }}
        />
      )}
    </>
  );
}
