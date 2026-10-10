import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { useConfirmarDestructivo } from '../../context/ConfirmacionContext';
import { supabase } from '../../lib/supabaseClient';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';
import { Alert } from '../../components/ui/Alert';
import { Candado } from '../../components/ui/Candado';
import { EstadoLista } from '../../components/layout/EstadoLista';
import { CLASES_TAREA, esTipoGeneral, nombreTipo, nombreMatricula } from '../../lib/tiposAsistente';
import { TareaConDetalle } from '../../components/ui/TareaConDetalle';
import { mensajeDeError } from '../../lib/errores';
import { useModalAccesible } from '../../hooks/useModalAccesible';
import { usePrestadoraActual } from '../../hooks/usePrestadoraActual';
import { con } from '../../lib/textos';
import '../../styles/molde-paginas.css';

/* Las Ramas, los tipos de Asistente, sus especialidades y sus tareas.

     Rama         → cómo agrupa la Prestadora sus tipos (Cuidados, Enfermería…)
     Tipo         → qué ES el Asistente (cuidador/a, enfermero/a…)
     Especialidad → en qué se especializa adentro de su tipo
     Tareas       → qué hace, qué no le toca y qué tiene prohibido
     Matrícula    → qué lo autoriza a ejercer

   Los tipos de fábrica y sus tareas los trae el producto y llevan candado: ninguna Prestadora
   los renombra ni los borra, porque son la definición del oficio. Lo demás es de cada
   Prestadora: sus Ramas, sus tipos, las especialidades y las tareas que les agrega.

   Qué tareas del producto ve cada Prestadora —las de su país— lo decide la base, no esta
   pantalla. */
export function TiposAsistenteTab() {
  const { t } = useLocale();
  const prestadoraId = usePrestadoraActual();
  const confirmarDestructivo = useConfirmarDestructivo();
  const [tipos, setTipos] = useState([]);
  const [ramas, setRamas] = useState([]);
  const [ramaDeCadaTipo, setRamaDeCadaTipo] = useState({});
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [tipoEnModal, setTipoEnModal] = useState(null);
  const [ocupadoId, setOcupadoId] = useState(null);
  const [tipoAbierto, setTipoAbierto] = useState(null);

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    const [resTipos, resRamas, resAgrupados] = await Promise.all([
      supabase.from('tipos_asistente').select('*').order('orden'),
      supabase.from('agrupaciones_tipos_asistente').select('id, nombre, orden').order('orden').order('nombre'),
      supabase.from('tipos_asistente_agrupados').select('tipo_asistente_id, agrupacion_id'),
    ]);
    const fallo = resTipos.error || resRamas.error || resAgrupados.error;
    if (fallo) {
      setError(mensajeDeError(fallo, t));
      setEstado('error');
      return;
    }
    setTipos(resTipos.data ?? []);
    setRamas(resRamas.data ?? []);
    setRamaDeCadaTipo(Object.fromEntries((resAgrupados.data ?? []).map((f) => [f.tipo_asistente_id, f.agrupacion_id])));
    setEstado('listo');
  }, [t]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  async function alternarActivo(tipo) {
    setOcupadoId(tipo.id);
    setError(null);
    const { error: errorUpdate } = await supabase
      .from('tipos_asistente')
      .update({ activo: !tipo.activo, updated_at: new Date().toISOString() })
      .eq('id', tipo.id);
    setOcupadoId(null);
    if (errorUpdate) {
      setError(mensajeDeError(errorUpdate, t));
      return;
    }
    recargar();
  }

  // La Rama de un tipo es de la Prestadora, también para los tipos de fábrica: por eso no es
  // una columna del tipo sino un renglón aparte, uno por Prestadora y por tipo.
  async function cambiarRama(tipo, agrupacionId) {
    setOcupadoId(tipo.id);
    setError(null);
    const { error: errorRama } = agrupacionId
      ? await supabase
          .from('tipos_asistente_agrupados')
          .upsert(
            { prestadora_id: prestadoraId, tipo_asistente_id: tipo.id, agrupacion_id: agrupacionId },
            { onConflict: 'prestadora_id,tipo_asistente_id' },
          )
      : await supabase
          .from('tipos_asistente_agrupados')
          .delete()
          .eq('prestadora_id', prestadoraId)
          .eq('tipo_asistente_id', tipo.id);
    setOcupadoId(null);
    if (errorRama) {
      setError(mensajeDeError(errorRama, t));
      return;
    }
    setRamaDeCadaTipo((antes) => ({ ...antes, [tipo.id]: agrupacionId || undefined }));
  }

  async function borrar(tipo) {
    if (!(await confirmarDestructivo(t.configuracion.tipos_confirmar_borrar))) return;
    setOcupadoId(tipo.id);
    setError(null);
    const { error: errorDelete } = await supabase.from('tipos_asistente').delete().eq('id', tipo.id);
    setOcupadoId(null);
    if (errorDelete) {
      setError(mensajeDeError(errorDelete, t));
      return;
    }
    if (tipoAbierto === tipo.id) setTipoAbierto(null);
    recargar();
  }

  return (
    <>
      <RamasDeLaPrestadora ramas={ramas} prestadoraId={prestadoraId} estado={estado} onCambio={recargar} />

      <section className="panel-tarjeta">
        <div className="panel-tarjeta-titulo">
          <h2>{t.configuracion.tipos_titulo}</h2>
          <Button onClick={() => setTipoEnModal({})}>{t.configuracion.tipos_nuevo}</Button>
        </div>
        {estado === 'listo' && error && <Alert variant="error">{error}</Alert>}

        <EstadoLista
          estado={estado}
          error={error}
          vacio={estado === 'listo' && tipos.length === 0}
          recargar={recargar}
          mensajeVacio={t.configuracion.tipos_vacio}
        >
          <table className="panel-tabla">
            <thead>
              <tr>
                <th>{t.configuracion.tipos_col_nombre}</th>
                <th>{t.configuracion.tipos_col_rama}</th>
                <th>{t.configuracion.tipos_col_matricula}</th>
                <th>{t.configuracion.tipos_col_activo}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {tipos.map((tipo) => (
                <tr key={tipo.id}>
                  <td>
                    <b>{nombreTipo(tipo, t)}</b>
                    {esTipoGeneral(tipo) && <Candado etiqueta={t.configuracion.candado} />}
                    {tipo.descripcion && <div className="panel-mini">{tipo.descripcion}</div>}
                  </td>
                  <td>
                    <select
                      value={ramaDeCadaTipo[tipo.id] || ''}
                      onChange={(e) => cambiarRama(tipo, e.target.value)}
                      disabled={ocupadoId === tipo.id}
                      aria-label={con(t.comun.campo_de_fila, { campo: t.configuracion.tipos_col_rama, nombre: nombreTipo(tipo, t) })}
                    >
                      <option value="">{t.configuracion.tipos_sin_rama}</option>
                      {ramas.map((rama) => (
                        <option key={rama.id} value={rama.id}>
                          {rama.nombre}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {tipo.requiere_matricula
                      ? nombreMatricula(tipo.tipo_matricula, t)
                      : t.configuracion.tipos_sin_matricula}
                  </td>
                  <td>
                    {esTipoGeneral(tipo) ? (
                      '—'
                    ) : (
                      <input
                        type="checkbox"
                        checked={tipo.activo}
                        onChange={() => alternarActivo(tipo)}
                        disabled={ocupadoId === tipo.id}
                        aria-label={con(t.comun.campo_de_fila, { campo: t.configuracion.tipos_col_activo, nombre: tipo.nombre })}
                      />
                    )}
                  </td>
                  <td>
                    <Button variant="secondary" onClick={() => setTipoAbierto(tipoAbierto === tipo.id ? null : tipo.id)}>
                      {tipoAbierto === tipo.id
                        ? t.configuracion.tipos_ocultar_tareas
                        : t.configuracion.tipos_ver_tareas}
                    </Button>{' '}
                    {!esTipoGeneral(tipo) && (
                      <>
                        <Button variant="secondary" onClick={() => setTipoEnModal(tipo)} disabled={ocupadoId === tipo.id}>
                          {t.comun.editar}
                        </Button>{' '}
                        <Button variant="secondary" onClick={() => borrar(tipo)} disabled={ocupadoId === tipo.id}>
                          {t.comun.borrar}
                        </Button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </EstadoLista>
      </section>

      {tipoAbierto && (
        <>
          <EspecialidadesDelTipo
            tipo={tipos.find((x) => x.id === tipoAbierto)}
            prestadoraId={prestadoraId}
          />
          <TareasDelTipo
            tipo={tipos.find((x) => x.id === tipoAbierto)}
            prestadoraId={prestadoraId}
          />
        </>
      )}

      {tipoEnModal && (
        <TipoModal
          tipo={tipoEnModal}
          prestadoraId={prestadoraId}
          onClose={() => setTipoEnModal(null)}
          onGuardado={() => {
            setTipoEnModal(null);
            recargar();
          }}
        />
      )}
    </>
  );
}

/* Las Ramas son de cada Prestadora: las agrega, las renombra y las borra. Borrar una Rama no
   borra sus tipos: quedan sin Rama. */
function RamasDeLaPrestadora({ ramas, prestadoraId, estado, onCambio }) {
  const { t } = useLocale();
  const confirmarDestructivo = useConfirmarDestructivo();
  const [nueva, setNueva] = useState('');
  const [editandoId, setEditandoId] = useState(null);
  const [nombreEditado, setNombreEditado] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState(null);

  async function correr(operacion) {
    setOcupado(true);
    setError(null);
    const { error: fallo } = await operacion;
    setOcupado(false);
    if (fallo) {
      setError(mensajeDeError(fallo, t));
      return false;
    }
    onCambio();
    return true;
  }

  async function agregar() {
    const listo = await correr(
      supabase.from('agrupaciones_tipos_asistente').insert({
        prestadora_id: prestadoraId,
        nombre: nueva.trim(),
        orden: (ramas.length + 1) * 10,
      }),
    );
    if (listo) setNueva('');
  }

  async function guardarEdicion(rama) {
    const listo = await correr(
      supabase
        .from('agrupaciones_tipos_asistente')
        .update({ nombre: nombreEditado.trim(), updated_at: new Date().toISOString() })
        .eq('id', rama.id),
    );
    if (listo) setEditandoId(null);
  }

  async function borrar(rama) {
    if (!(await confirmarDestructivo(t.configuracion.ramas_confirmar_borrar))) return;
    await correr(supabase.from('agrupaciones_tipos_asistente').delete().eq('id', rama.id));
  }

  if (estado !== 'listo') return null;

  return (
    <section className="panel-tarjeta">
      <div className="panel-tarjeta-titulo">
        <h2>{t.configuracion.ramas_titulo}</h2>
      </div>
      {error && <Alert variant="error">{error}</Alert>}
      {ramas.length === 0 ? (
        <p className="molde-vacio">{t.configuracion.ramas_vacio}</p>
      ) : (
        ramas.map((rama) =>
          editandoId === rama.id ? (
            <div key={rama.id} className="panel-fila-alerta">
              <FormField
                label={t.configuracion.ramas_nombre}
                name={`rama_${rama.id}`}
                value={nombreEditado}
                onChange={(e) => setNombreEditado(e.target.value)}
                required
              />
              <div className="panel-fila-acciones">
                <Button variant="secondary" onClick={() => setEditandoId(null)} disabled={ocupado}>
                  {t.comun.cancelar}
                </Button>
                <Button onClick={() => guardarEdicion(rama)} disabled={ocupado || !nombreEditado.trim()}>
                  {ocupado ? t.comun.guardando : t.comun.guardar}
                </Button>
              </div>
            </div>
          ) : (
            <div key={rama.id} className="panel-fila-alerta">
              <div><b>{rama.nombre}</b></div>
              <div className="panel-fila-acciones">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setEditandoId(rama.id);
                    setNombreEditado(rama.nombre);
                  }}
                  disabled={ocupado}
                >
                  {t.comun.editar}
                </Button>
                <Button variant="secondary" onClick={() => borrar(rama)} disabled={ocupado}>
                  {t.comun.borrar}
                </Button>
              </div>
            </div>
          ),
        )
      )}
      <div className="molde-formgrid">
        <div className="molde-ancho">
          <FormField
            label={t.configuracion.ramas_nombre}
            name="rama_nueva"
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
          />
        </div>
      </div>
      <div className="molde-acciones">
        <Button onClick={agregar} disabled={ocupado || !nueva.trim()}>
          {ocupado ? t.comun.guardando : t.configuracion.ramas_agregar}
        </Button>
      </div>
    </section>
  );
}

/* Las especialidades de un tipo son de cada Prestadora, también las de los tipos de fábrica:
   ella las agrega, las renombra y las borra. Una especialidad puede pedir su propia matrícula.
   Borrarla se la quita a los Asistentes que la tenían. */
function EspecialidadesDelTipo({ tipo, prestadoraId }) {
  const { t } = useLocale();
  const confirmarDestructivo = useConfirmarDestructivo();
  const [especialidades, setEspecialidades] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [editandoId, setEditandoId] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  const recargar = useCallback(async () => {
    if (!tipo) return;
    setEstado('cargando');
    setError(null);
    const { data, error: errorConsulta } = await supabase
      .from('especialidades')
      .select('id, nombre, tipo_matricula, orden')
      .eq('tipo_asistente_id', tipo.id)
      .order('orden')
      .order('nombre');
    if (errorConsulta) {
      setError(mensajeDeError(errorConsulta, t));
      setEstado('error');
      return;
    }
    setEspecialidades(data ?? []);
    setEstado('listo');
  }, [tipo, t]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  async function correr(operacion) {
    setOcupado(true);
    setError(null);
    const { error: fallo } = await operacion;
    setOcupado(false);
    if (fallo) {
      setError(mensajeDeError(fallo, t));
      return false;
    }
    recargar();
    return true;
  }

  function agregar(datos) {
    return correr(
      supabase.from('especialidades').insert({
        ...datos,
        prestadora_id: prestadoraId,
        tipo_asistente_id: tipo.id,
        orden: (especialidades.length + 1) * 10,
      }),
    );
  }

  async function guardarEdicion(especialidad, datos) {
    const listo = await correr(
      supabase
        .from('especialidades')
        .update({ ...datos, updated_at: new Date().toISOString() })
        .eq('id', especialidad.id),
    );
    if (listo) setEditandoId(null);
    return listo;
  }

  async function borrar(especialidad) {
    if (!(await confirmarDestructivo(t.configuracion.especialidades_confirmar_borrar))) return;
    await correr(supabase.from('especialidades').delete().eq('id', especialidad.id));
  }

  if (!tipo) return null;

  return (
    <section className="panel-tarjeta">
      <div className="panel-tarjeta-titulo">
        <h2>{t.configuracion.especialidades_titulo}</h2>
        <span className="panel-mini">{nombreTipo(tipo, t)}</span>
      </div>
      {estado === 'listo' && error && <Alert variant="error">{error}</Alert>}
      <EstadoLista estado={estado} error={error} vacio={false} recargar={recargar}>
        {especialidades.length === 0 ? (
          <p className="molde-vacio">{t.configuracion.especialidades_vacio}</p>
        ) : (
          especialidades.map((especialidad) =>
            editandoId === especialidad.id ? (
              <FormularioDeEspecialidad
                key={especialidad.id}
                nombre={`especialidad_${especialidad.id}`}
                inicial={especialidad}
                ocupado={ocupado}
                etiquetaBoton={t.comun.guardar}
                onGuardar={(datos) => guardarEdicion(especialidad, datos)}
                onCancelar={() => setEditandoId(null)}
              />
            ) : (
              <div key={especialidad.id} className="panel-fila-alerta">
                <div>
                  <b>{especialidad.nombre}</b>
                  {especialidad.tipo_matricula && (
                    <div className="panel-mini">
                      {t.configuracion.tipos_col_matricula}: {nombreMatricula(especialidad.tipo_matricula, t)}
                    </div>
                  )}
                </div>
                <div className="panel-fila-acciones">
                  <Button variant="secondary" onClick={() => setEditandoId(especialidad.id)} disabled={ocupado}>
                    {t.comun.editar}
                  </Button>
                  <Button variant="secondary" onClick={() => borrar(especialidad)} disabled={ocupado}>
                    {t.comun.borrar}
                  </Button>
                </div>
              </div>
            ),
          )
        )}
        <FormularioDeEspecialidad
          nombre="especialidad_nueva"
          ocupado={ocupado}
          etiquetaBoton={t.configuracion.especialidades_agregar}
          onGuardar={agregar}
        />
      </EstadoLista>
    </section>
  );
}

function FormularioDeEspecialidad({ nombre, inicial, ocupado, etiquetaBoton, onGuardar, onCancelar }) {
  const { t } = useLocale();
  const [texto, setTexto] = useState(inicial?.nombre ?? '');
  const [matricula, setMatricula] = useState(inicial?.tipo_matricula ?? '');

  async function guardar() {
    const listo = await onGuardar({ nombre: texto.trim(), tipo_matricula: matricula.trim() || null });
    if (listo && !inicial) {
      setTexto('');
      setMatricula('');
    }
  }

  return (
    <>
      <div className="molde-formgrid">
        <FormField
          label={t.configuracion.especialidades_nombre}
          name={`${nombre}_nombre`}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          required
        />
        <FormField
          label={t.configuracion.especialidades_matricula}
          name={`${nombre}_matricula`}
          value={matricula}
          onChange={(e) => setMatricula(e.target.value)}
        />
      </div>
      <div className="molde-acciones">
        {onCancelar && (
          <Button variant="secondary" onClick={onCancelar} disabled={ocupado}>
            {t.comun.cancelar}
          </Button>
        )}
        <Button onClick={guardar} disabled={ocupado || !texto.trim()}>
          {ocupado ? t.comun.guardando : etiquetaBoton}
        </Button>
      </div>
    </>
  );
}

/* Las tres listas de tareas de un tipo: habilitadas, no incluidas y prohibidas. Van separadas
   porque son tres cosas distintas: lo que es su trabajo, lo que no le toca pero se le puede
   acordar aparte, y lo que no se le puede asignar. */
function TareasDelTipo({ tipo, prestadoraId }) {
  const { t } = useLocale();
  const [tareas, setTareas] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);

  const recargar = useCallback(async () => {
    if (!tipo) return;
    setEstado('cargando');
    setError(null);
    const { data, error: errorConsulta } = await supabase
      .from('tareas_tipo_asistente')
      .select('*')
      .eq('tipo_asistente_id', tipo.id)
      .order('orden');
    if (errorConsulta) {
      setError(mensajeDeError(errorConsulta, t));
      setEstado('error');
      return;
    }
    setTareas(data ?? []);
    setEstado('listo');
  }, [tipo, t]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  if (!tipo) return null;

  return (
    <EstadoLista estado={estado} error={error} vacio={false} recargar={recargar}>
      {CLASES_TAREA.map((clase) => (
        <ListaDeClase
          key={clase}
          clase={clase}
          tareas={tareas.filter((x) => x.clase === clase)}
          tipo={tipo}
          prestadoraId={prestadoraId}
          onCambio={recargar}
        />
      ))}
    </EstadoLista>
  );
}

function ListaDeClase({ clase, tareas, tipo, prestadoraId, onCambio }) {
  const { t } = useLocale();
  const confirmarDestructivo = useConfirmarDestructivo();
  const [editandoId, setEditandoId] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState(null);

  async function correr(operacion) {
    setOcupado(true);
    setError(null);
    const { error: fallo } = await operacion;
    setOcupado(false);
    if (fallo) {
      setError(mensajeDeError(fallo, t));
      return false;
    }
    onCambio();
    return true;
  }

  function agregar({ texto, descripcion }) {
    return correr(
      supabase.from('tareas_tipo_asistente').insert({
        tipo_asistente_id: tipo.id,
        prestadora_id: prestadoraId,
        clase,
        texto,
        descripcion,
        orden: (tareas.length + 1) * 10,
      }),
    );
  }

  async function guardarEdicion(tarea, { texto, descripcion }) {
    const listo = await correr(
      supabase
        .from('tareas_tipo_asistente')
        .update({ texto, descripcion, updated_at: new Date().toISOString() })
        .eq('id', tarea.id),
    );
    if (listo) setEditandoId(null);
    return listo;
  }

  async function borrar(tarea) {
    if (!(await confirmarDestructivo(t.configuracion.tareas_confirmar_borrar))) return;
    await correr(supabase.from('tareas_tipo_asistente').delete().eq('id', tarea.id));
  }

  return (
    <section className="panel-tarjeta">
      <div className="panel-tarjeta-titulo">
        <h2>{t.tareas_asistente[`clase_${clase}`]}</h2>
        <span className="panel-mini">{t.configuracion.tareas_titulo} · {nombreTipo(tipo, t)}</span>
      </div>
      {error && <Alert variant="error">{error}</Alert>}
      {tareas.length === 0 ? (
        <p className="molde-vacio">{t.configuracion.tareas_vacio_clase}</p>
      ) : (
        tareas.map((tarea) =>
          editandoId === tarea.id ? (
            <FormularioDeTarea
              key={tarea.id}
              nombre={`tarea_${tarea.id}`}
              inicial={tarea}
              ocupado={ocupado}
              etiquetaBoton={t.comun.guardar}
              onGuardar={(datos) => guardarEdicion(tarea, datos)}
              onCancelar={() => setEditandoId(null)}
            />
          ) : (
            <div key={tarea.id} className="panel-fila-alerta">
              <TareaConDetalle tarea={tarea} t={t} />
              {!tarea.prestadora_id ? (
                <Candado etiqueta={t.configuracion.candado} />
              ) : (
                <div className="panel-fila-acciones">
                  <Button variant="secondary" onClick={() => setEditandoId(tarea.id)} disabled={ocupado}>
                    {t.comun.editar}
                  </Button>
                  <Button variant="secondary" onClick={() => borrar(tarea)} disabled={ocupado}>
                    {t.comun.borrar}
                  </Button>
                </div>
              )}
            </div>
          ),
        )
      )}
      <FormularioDeTarea
        nombre={`nueva_tarea_${clase}`}
        ocupado={ocupado}
        etiquetaBoton={t.configuracion.tareas_agregar}
        onGuardar={agregar}
      />
    </section>
  );
}
