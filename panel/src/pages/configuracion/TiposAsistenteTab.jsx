import { useCallback, useEffect, useRef, useState } from 'react';
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

/* Los tipos de Asistente, sus especialidades y sus tareas.

     Tipo         → qué ES el Asistente (cuidador/a, enfermero/a…)
     Especialidad → en qué se especializa adentro de su tipo
     Tareas       → qué hace, qué no le toca y qué tiene prohibido
     Matrícula    → qué lo autoriza a ejercer

   Los tipos de fábrica y sus tareas los trae el producto y llevan candado: ninguna Prestadora
   los renombra ni los borra, porque son la definición del oficio. Lo demás es de cada
   Prestadora: sus tipos, las especialidades y las tareas que les agrega.

   Qué tareas del producto ve cada Prestadora —las de su país— lo decide la base, no esta
   pantalla. */
export function TiposAsistenteTab() {
  const { t } = useLocale();
  const prestadoraId = usePrestadoraActual();
  const confirmarDestructivo = useConfirmarDestructivo();
  const [tipos, setTipos] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [tipoEnModal, setTipoEnModal] = useState(null);
  const [ocupadoId, setOcupadoId] = useState(null);
  const [tipoAbierto, setTipoAbierto] = useState(null);
  const abierto = useRef(null);

  // Lo que se abre queda debajo de toda la tabla: se baja hasta ahí.
  useEffect(() => {
    if (tipoAbierto) abierto.current?.scrollIntoView({ block: 'start' });
  }, [tipoAbierto]);

  const recargar = useCallback(async () => {
    if (!prestadoraId) return;
    setEstado('cargando');
    setError(null);
    const { data, error: fallo } = await supabase.from('tipos_asistente').select('*').order('orden');
    if (fallo) {
      setError(mensajeDeError(fallo, t));
      setEstado('error');
      return;
    }
    setTipos(data ?? []);
    setEstado('listo');
  }, [prestadoraId, t]);

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
        <div ref={abierto} className="molde-pila">
          <EspecialidadesDelTipo
            tipo={tipos.find((x) => x.id === tipoAbierto)}
            prestadoraId={prestadoraId}
          />
          <TareasDelTipo
            tipo={tipos.find((x) => x.id === tipoAbierto)}
            prestadoraId={prestadoraId}
          />
        </div>
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

/* Alta y edición de un tipo propio de la Prestadora. Los tipos de fábrica no llegan acá. */
function TipoModal({ tipo, prestadoraId, onClose, onGuardado }) {
  const modal = useModalAccesible(onClose);
  const { t } = useLocale();
  const esNuevo = !tipo?.id;
  const [nombre, setNombre] = useState(tipo?.nombre ?? '');
  const [descripcion, setDescripcion] = useState(tipo?.descripcion ?? '');
  const [intentado, setIntentado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  const faltaNombre = !nombre.trim();

  async function guardar() {
    setIntentado(true);
    if (faltaNombre) {
      setTimeout(() => document.querySelector('.panel-modal [aria-invalid="true"]')?.focus(), 0);
      return;
    }
    if (!prestadoraId) return;
    setGuardando(true);
    setError(null);
    const datos = { nombre: nombre.trim(), descripcion: descripcion.trim() || null };
    const { error: fallo } = esNuevo
      ? await supabase.from('tipos_asistente').insert({ ...datos, prestadora_id: prestadoraId })
      : await supabase
          .from('tipos_asistente')
          .update({ ...datos, updated_at: new Date().toISOString() })
          .eq('id', tipo.id)
          .eq('prestadora_id', prestadoraId);
    if (fallo) {
      setError(mensajeDeError(fallo, t));
      setGuardando(false);
      return;
    }
    onGuardado();
  }

  return (
    <div className="panel-modal-fondo" onClick={onClose}>
      <div className="panel-modal" onClick={(e) => e.stopPropagation()} {...modal.props}>
        <h2 id={modal.idTitulo}>{esNuevo ? t.configuracion.tipos_nuevo : t.configuracion.tipos_editar}</h2>
        {error && <Alert variant="error">{error}</Alert>}
        <FormField
          label={t.configuracion.tipos_col_nombre}
          name="tipo_nombre"
          required
          value={nombre}
          error={intentado && faltaNombre ? t.formularios.falta_un_dato_obligatorio : null}
          onChange={(e) => setNombre(e.target.value)}
        />
        <FormField
          label={t.configuracion.tipos_descripcion}
          name="tipo_descripcion"
          type="textarea"
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
        />
        <div className="panel-modal-acciones">
          <Button variant="secondary" onClick={onClose} disabled={guardando}>
            {t.comun.cancelar}
          </Button>
          <Button onClick={guardar} disabled={guardando}>
            {guardando ? t.comun.guardando : t.comun.guardar}
          </Button>
        </div>
      </div>
    </div>
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

function FormularioDeTarea({ nombre, inicial, ocupado, etiquetaBoton, onGuardar, onCancelar }) {
  const { t } = useLocale();
  const [texto, setTexto] = useState(inicial?.texto ?? '');
  const [descripcion, setDescripcion] = useState(inicial?.descripcion ?? '');

  async function guardar() {
    const listo = await onGuardar({ texto: texto.trim(), descripcion: descripcion.trim() || null });
    if (listo && !inicial) {
      setTexto('');
      setDescripcion('');
    }
  }

  return (
    <>
      <div className="molde-formgrid">
        <FormField
          label={t.configuracion.tareas_texto}
          name={`${nombre}_texto`}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          required
        />
        <FormField
          label={t.configuracion.tareas_descripcion}
          name={`${nombre}_descripcion`}
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
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
