import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { useAuth } from '../../context/AuthContext';
import { useConfirmarDestructivo } from '../../context/ConfirmacionContext';
import { supabase } from '../../lib/supabaseClient';
import { ORIGEN } from '../../lib/equipoDelServicio';
import { leerEquipoCompletoDelServicio } from '../../lib/leerEquipoDelServicio';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { mensajeDeError } from '../../lib/errores';
import { useModalAccesible } from '../../hooks/useModalAccesible';
import { ElegirAsistente } from '../../components/turnos_guardia/ElegirAsistente';
import { hoyISO } from '../../lib/horarios';
import '../../styles/molde-paginas.css';
import '../tarjetas.css';

// Quiénes atienden este Servicio.
//
// El equipo es del Servicio, no de cada Paciente: un Servicio con dos Pacientes —un matrimonio, una
// residencia— tiene un solo equipo. La lista se arma sola —quienes tienen turnos habituales en el
// Servicio, más quien lo coordina— y la coordinación la corrige: puede sumar, sacar y marcar quién
// cubre francos. Lo único que se guarda son esas correcciones; la lista entera se vuelve a deducir
// cada vez que se abre, así que quien empezó a venir aparece sola y quien dejó de venir desaparece
// sola.
//
// Quién entra sin que nadie la ponga no se decide acá: la regla vive en
// `src/lib/equipoDelServicio.js`, que se copia al backend, y los dos números que la gobiernan los
// configura cada Prestadora.
export function EquipoDelServicio({ servicio, puedeEditar, onClose }) {
  const modal = useModalAccesible(onClose);
  const { t } = useLocale();
  const { usuario } = useAuth();
  const e = t.equipo_servicio;
  const confirmarDestructivo = useConfirmarDestructivo();

  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [errorFila, setErrorFila] = useState(null);
  const [enCurso, setEnCurso] = useState(null);

  const [datos, setDatos] = useState(null);
  const [yaEstan, setYaEstan] = useState([]);
  // Los turnos de guardia que vienen y todavía no tienen Asistente. Contra ellos se ordenan las
  // sugerencias de a quién sumar: lugar, horario, carga, antecedentes. Un Servicio recién armado no
  // tiene ninguno, y entonces la lista ofrece a todo el Padrón sin orden de preferencia.
  const [idsVacantes, setIdsVacantes] = useState([]);
  const [aSumar, setASumar] = useState('');

  const explicar = useCallback((falla) => mensajeDeError(falla, t, 'equipo_servicio'), [t]);

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    setErrorFila(null);

    try {
      const { equipo, turnos_guardia, idsAsistentes, nombreDeAsistente, nombreDeUsuario } =
        await leerEquipoCompletoDelServicio(supabase, servicio);

      setDatos({ ...equipo, nombreDeAsistente, nombreDeUsuario });

      setYaEstan(idsAsistentes);
      const hoy = hoyISO();
      setIdsVacantes(
        turnos_guardia
          .filter((tg) => !tg.asistente_id && tg.estado === 'programada' && tg.fecha >= hoy)
          .map((tg) => tg.id)
      );
      setEstado('listo');
    } catch (falla) {
      setError(explicar(falla));
      setEstado('error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- se relee cuando cambia alguno de estos tres datos del Servicio, no cuando llega otro objeto igual
  }, [servicio.id, servicio.prestadora_id, servicio.coordinador_id, explicar]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  /** Deja escrita una decisión sobre una persona. Reemplaza la anterior, no se apila. */
  async function decidir(fila, cambios) {
    setEnCurso(fila.asistente_id ?? fila.usuario_id);
    setErrorFila(null);
    const { error: errorUpsert } = await supabase.from('equipo_servicio').upsert(
      {
        prestadora_id: usuario?.prestadora_id,
        servicio_id: servicio.id,
        asistente_id: fila.asistente_id ?? null,
        usuario_id: fila.usuario_id ?? null,
        situacion: 'sumada',
        ...cambios,
      },
      { onConflict: fila.asistente_id ? 'servicio_id,asistente_id' : 'servicio_id,usuario_id' }
    );
    setEnCurso(null);
    if (errorUpsert) {
      setErrorFila(explicar(errorUpsert));
      return;
    }
    recargar();
  }

  /** Saca la corrección y deja que el sistema vuelva a deducir sola a esa persona. */
  async function volverADeducir(fila) {
    setEnCurso(fila.asistente_id ?? fila.usuario_id);
    setErrorFila(null);
    let consulta = supabase.from('equipo_servicio').delete().eq('servicio_id', servicio.id);
    consulta = fila.asistente_id
      ? consulta.eq('asistente_id', fila.asistente_id)
      : consulta.eq('usuario_id', fila.usuario_id);
    const { error: errorDelete } = await consulta;
    setEnCurso(null);
    if (errorDelete) {
      setErrorFila(explicar(errorDelete));
      return;
    }
    recargar();
  }

  async function sacar(fila) {
    if (!(await confirmarDestructivo(e.confirmar_retirar))) return;
    decidir(fila, { situacion: 'sacada', cubre_francos: false });
  }

  const explicacionDeOrigen = useMemo(
    () => ({
      [ORIGEN.POR_SUS_TURNOS_GUARDIA]: e.origen_por_sus_turnos_guardia,
      [ORIGEN.POR_SU_SERIE]: e.origen_por_su_serie,
      [ORIGEN.A_MANO]: e.origen_a_mano,
      [ORIGEN.POR_SU_SERVICIO]: e.origen_por_su_servicio,
    }),
    [e]
  );

  return (
    <div className="panel-modal-fondo" onClick={onClose}>
      <div className="panel-modal" onClick={(ev) => ev.stopPropagation()} {...modal.props}>
        <h2 id={modal.idTitulo}>
          {e.titulo} — {servicio.etiqueta || '—'}
        </h2>

        {estado === 'cargando' && <p className="estado-cargando">{t.comun.cargando}</p>}
        {estado === 'error' && <Alert variant="error">{error || t.comun.error_generico}</Alert>}

        {estado === 'listo' && datos && (
          <div className="molde-pila">
            {errorFila && <Alert variant="error">{errorFila}</Alert>}

            <section className="panel-tarjeta tarjeta-desplazable">
              <div className="panel-tarjeta-titulo">
                <h2>{e.asistentes_titulo}</h2>
              </div>
              {datos.asistentes.length === 0 ? (
                <p className="molde-vacio">{e.sin_asistentes}</p>
              ) : (
                <table className="panel-tabla">
                  <thead>
                    <tr>
                      <th>{e.col_persona}</th>
                      <th>{e.col_por_que}</th>
                      <th>{e.col_turnos_guardia}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.asistentes.map((a) => (
                      <tr key={a.asistente_id}>
                        <td>
                          <b>{datos.nombreDeAsistente(a.asistente_id)}</b>
                          {a.cubre_francos && <div className="panel-mini">{e.cubre_francos}</div>}
                        </td>
                        <td>{explicacionDeOrigen[a.origen]}</td>
                        <td>{a.turnos_guardia}</td>
                        <td>
                          {puedeEditar && (
                            <>
                              <Button
                                variant="secondary"
                                disabled={enCurso === a.asistente_id}
                                onClick={() => decidir(a, { cubre_francos: !a.cubre_francos })}
                              >
                                {a.cubre_francos ? e.no_cubre_francos : e.marcar_cubre_francos}
                              </Button>{' '}
                              <Button
                                variant="secondary"
                                disabled={enCurso === a.asistente_id}
                                onClick={() => sacar(a)}
                              >
                                {e.retirar}
                              </Button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* Sumar a alguien, con la lista de sugerencias: primero quienes mejor cubren los
                  turnos de guardia vacantes del Servicio, con sus advertencias al lado del nombre.
                  Quien ya está en el equipo, o quedó afuera a mano, no se ofrece. */}
              {puedeEditar && (
                <>
                  <ElegirAsistente
                    idsHuecos={idsVacantes}
                    servicioId={servicio.id}
                    excluir={yaEstan}
                    name="equipo-sumar"
                    label={e.sumar}
                    value={aSumar}
                    onChange={(id) => setASumar(id)}
                    disabled={enCurso !== null}
                  />
                  <div className="molde-acciones">
                    <Button
                      variant="secondary"
                      disabled={!aSumar || enCurso === aSumar}
                      onClick={() => {
                        const id = aSumar;
                        setASumar('');
                        decidir({ asistente_id: id }, { situacion: 'sumada' });
                      }}
                    >
                      {e.agregar}
                    </Button>
                  </div>
                </>
              )}
            </section>

            {/* Sin coordinador no hay Servicio habilitado: la sección vacía no se muestra. */}
            {datos.coordinadores.length > 0 && (
              <section className="panel-tarjeta">
                <div className="panel-tarjeta-titulo">
                  <h2>{e.coordinacion_titulo}</h2>
                </div>
                {datos.coordinadores.map((c) => (
                  <div className="panel-fila-alerta" key={c.usuario_id}>
                    <div>
                      <b>{datos.nombreDeUsuario(c.usuario_id)}</b>{' '}
                      <span className="panel-mini">{explicacionDeOrigen[c.origen]}</span>
                    </div>
                    {puedeEditar && c.decidido && (
                      <Button
                        variant="secondary"
                        disabled={enCurso === c.usuario_id}
                        onClick={() => volverADeducir(c)}
                      >
                        {e.volver_a_deducir}
                      </Button>
                    )}
                  </div>
                ))}
              </section>
            )}

            {datos.afuera.length > 0 && (
              <section className="panel-tarjeta">
                <div className="panel-tarjeta-titulo">
                  <h2>{e.afuera_titulo}</h2>
                </div>
                {datos.afuera.map((a) => (
                  <div className="panel-fila-alerta" key={a.asistente_id}>
                    <div>
                      <b>{datos.nombreDeAsistente(a.asistente_id)}</b>
                    </div>
                    {puedeEditar && (
                      <Button
                        variant="secondary"
                        disabled={enCurso === a.asistente_id}
                        onClick={() => volverADeducir(a)}
                      >
                        {e.volver_a_deducir}
                      </Button>
                    )}
                  </div>
                ))}
              </section>
            )}
          </div>
        )}

        <div className="panel-modal-acciones">
          <Button variant="secondary" onClick={onClose}>
            {t.comun.cerrar}
          </Button>
        </div>
      </div>
    </div>
  );
}
