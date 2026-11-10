import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { useConfirmarDestructivo } from '../../context/ConfirmacionContext';
import { supabase } from '../../lib/supabaseClient';
import { ORIGEN, equipoDelServicio, reglaDeEquipoDe } from '../../lib/equipoDelServicio';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { mensajeDeError } from '../../lib/errores';
import { useModalAccesible } from '../../hooks/useModalAccesible';
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
  const e = t.equipo_servicio;
  const confirmarDestructivo = useConfirmarDestructivo();

  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [errorFila, setErrorFila] = useState(null);
  const [enCurso, setEnCurso] = useState(null);

  const [datos, setDatos] = useState(null);
  const [candidatas, setCandidatas] = useState([]);
  const [aSumar, setASumar] = useState('');

  const explicar = useCallback((falla) => mensajeDeError(falla, t, 'equipo_servicio'), [t]);

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    setErrorFila(null);

    try {
      const [guardias, series, configuracion, decisiones] = await Promise.all([
        supabase
          .from('guardias')
          .select('id, servicio_id, asistente_id, fecha, hora_inicio, hora_fin, dias_hasta_el_fin, estado')
          .eq('servicio_id', servicio.id),
        supabase
          .from('series_guardias')
          .select('id, servicio_id, asistente_id, estado, vigente_hasta')
          .eq('servicio_id', servicio.id),
        supabase
          .from('configuracion_equipo_paciente')
          .select('regla')
          .eq('prestadora_id', servicio.prestadora_id)
          .maybeSingle(),
        supabase.from('equipo_servicio').select('*').eq('servicio_id', servicio.id),
      ]);
      for (const respuesta of [guardias, series, configuracion, decisiones]) {
        if (respuesta.error) throw respuesta.error;
      }

      const equipo = equipoDelServicio({
        servicioId: servicio.id,
        guardias: guardias.data ?? [],
        series: series.data ?? [],
        decisiones: decisiones.data ?? [],
        coordinadorDelServicio: servicio.coordinador_id ?? null,
        regla: reglaDeEquipoDe(configuracion.data?.regla),
      });

      const idsAsistentes = [...new Set([...equipo.asistentes, ...equipo.afuera].map((a) => a.asistente_id))];
      const idsUsuarios = [...new Set(equipo.coordinadores.map((c) => c.usuario_id))];
      const [delEquipo, todas, usuarios] = await Promise.all([
        idsAsistentes.length
          ? supabase.from('asistentes').select('id, nombre, apellido').in('id', idsAsistentes)
          : Promise.resolve({ data: [], error: null }),
        // Para el desplegable de «sumar a alguien». La vista recorta lo que un Coordinador puede
        // ver de una Asistente; acá alcanza con el nombre.
        supabase.from('asistentes').select('id, nombre, apellido').eq('cuenta_desactivada', false).order('apellido'),
        idsUsuarios.length
          ? supabase.from('usuarios').select('id, nombre, apellido').in('id', idsUsuarios)
          : Promise.resolve({ data: [], error: null }),
      ]);
      for (const respuesta of [delEquipo, todas, usuarios]) {
        if (respuesta.error) throw respuesta.error;
      }

      const nombre = (p) => `${p.apellido ?? ''} ${p.nombre ?? ''}`.trim();
      const porId = new Map([...(todas.data ?? []), ...(delEquipo.data ?? [])].map((a) => [a.id, a]));
      const nombresDeUsuario = new Map((usuarios.data ?? []).map((u) => [u.id, nombre(u)]));

      setDatos({
        ...equipo,
        nombreDeAsistente: (id) => (porId.has(id) ? nombre(porId.get(id)) : '—'),
        nombreDeUsuario: (id) => nombresDeUsuario.get(id) || '—',
      });

      const yaEstan = new Set([...equipo.asistentes, ...equipo.afuera].map((a) => a.asistente_id));
      setCandidatas((todas.data ?? []).filter((a) => !yaEstan.has(a.id)));
      setEstado('listo');
    } catch (falla) {
      setError(explicar(falla));
      setEstado('error');
    }
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
        prestadora_id: servicio.prestadora_id,
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
      [ORIGEN.POR_SUS_TURNOS]: e.origen_por_sus_turnos,
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
                      <th>{e.col_turnos}</th>
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
                        <td>{a.turnos}</td>
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

              {puedeEditar && candidatas.length > 0 && (
                <>
                  <div className="molde-campo">
                    <label htmlFor="equipo-sumar">{e.sumar}</label>
                    <select id="equipo-sumar" value={aSumar} onChange={(ev) => setASumar(ev.target.value)}>
                      <option value="">—</option>
                      {candidatas.map((a) => (
                        <option key={a.id} value={a.id}>
                          {`${a.apellido ?? ''} ${a.nombre ?? ''}`.trim()}
                        </option>
                      ))}
                    </select>
                  </div>
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
