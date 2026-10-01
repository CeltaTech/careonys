import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { useConfirmarDestructivo } from '../../context/ConfirmacionContext';
import { supabase } from '../../lib/supabaseClient';
import { llamarApiConfiguracion } from '../../lib/apiConfiguracion';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';
import { Alert } from '../../components/ui/Alert';
import { EstadoLista } from '../../components/layout/EstadoLista';
import { esTipoGeneral, nombreTipo, nombreMatricula, viasVedadasPorMatricula } from '../../lib/tiposAsistente';
import { MODOS_DE_CONTROL_MATRICULA } from '../../lib/matricula';
import { mensajeDeError } from '../../lib/errores';
import { useModalAccesible } from '../../hooks/useModalAccesible';
import { usePrestadoraActual } from '../../hooks/usePrestadoraActual';
import { con } from '../../lib/textos';
import '../../styles/molde-paginas.css';

/* Los tipos de Asistente y sus tareas.
   Tres cosas conviven en esta pantalla y conviene no confundirlas:

     Tipo      → qué ES el Asistente (cuidador/a, enfermero/a…)
     Tareas    → qué HACE y qué NO HACE
     Matrícula → qué lo AUTORIZA a ejercer

   Los cuatro tipos de fábrica los trae CeltaTech: la Prestadora no los puede
   renombrar ni cambiarles la exigencia de matrícula, pero sí puede agregarles
   tareas propias. Los tipos que crea ella son suyos por completo. */
export function TiposAsistenteTab() {
  const { t } = useLocale();
  const prestadoraId = usePrestadoraActual();
  const confirmarDestructivo = useConfirmarDestructivo();
  const [tipos, setTipos] = useState([]);
  const [vias, setVias] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [creando, setCreando] = useState(false);
  const [ocupadoId, setOcupadoId] = useState(null);
  const [tipoAbierto, setTipoAbierto] = useState(null);
  const [modoControl, setModoControl] = useState(null);
  const [estadoModo, setEstadoModo] = useState('cargando');
  const [errorModo, setErrorModo] = useState(null);
  const [guardandoModo, setGuardandoModo] = useState(false);

  /* Qué tan estricta es la Prestadora se lee aparte del resto de la pantalla, y tiene sus propios
     cuatro estados, porque es lo único de acá que se puede contestar mal sin que se note.

     Antes, si esta lectura fallaba, la pantalla mostraba "flexible" —el primer valor de la
     lista— como si eso fuera lo configurado. Una Prestadora estricta veía la política equivocada,
     y con sólo tocar cualquier otra cosa del selector se guardaba esa mentira encima de la
     verdadera. El backend, con el mismo dato ausente, supone lo contrario
     (`lib/matricula.js`, MODO_CONTROL_MATRICULA_SUPUESTO): ante la duda exige más, que es lo que
     manda la regla de que todo control de acceso falla cerrado.

     Acá no hace falta suponer nada, y por eso no se supone: esta pantalla puede volver a
     preguntar. Si no se pudo leer, no se muestra ninguna política, no se deja guardar ninguna, se
     dice qué pasó y se ofrece reintentar. Mostrar la estricta sin haberla leído sería igual de
     falso que mostrar la flexible; lo único honesto es no mostrar ninguna. */
  const cargarModo = useCallback(async () => {
    setEstadoModo('cargando');
    setErrorModo(null);
    try {
      const respuesta = await llamarApiConfiguracion('/modo-control-matricula');
      // Una respuesta que llegó pero no trae un modo conocido es una lectura fallida igual que
      // una caída: sin este control, un cuerpo vacío volvería a dejar el selector en cualquier
      // valor sin que nadie se entere.
      if (!MODOS_DE_CONTROL_MATRICULA.includes(respuesta?.modo)) {
        throw new Error('modo_control_matricula_desconocido');
      }
      setModoControl(respuesta.modo);
      setEstadoModo('listo');
    } catch (fallo) {
      setModoControl(null);
      setErrorModo(mensajeDeError(fallo, t));
      setEstadoModo('error');
    }
  }, [t]);

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    // El modo va en el mismo viaje que las dos consultas, pero no en el mismo resultado: se
    // resuelve solo y no arrastra a la lista si falla, ni la lista lo arrastra a él.
    const [resTipos, resVias] = await Promise.all([
      supabase.from('tipos_asistente').select('*').order('orden'),
      supabase
        .from('configuracion_matricula_via_medicacion')
        .select('via_administracion, tipo_matricula_requerida')
        .eq('prestadora_id', prestadoraId),
      cargarModo(),
    ]);
    if (resTipos.error || resVias.error) {
      setError(mensajeDeError(resTipos.error || resVias.error, t));
      setEstado('error');
      return;
    }
    setTipos(resTipos.data ?? []);
    setVias(resVias.data ?? []);
    setEstado('listo');
  }, [prestadoraId, t, cargarModo]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  /* El interruptor vive acá y no en otra solapa porque la exigencia de matrícula la declara cada
     tipo de Asistente, y esto es lo que decide qué tan estricta es esa exigencia. Separarlas
     obligaría a ir y volver entre dos pantallas para entender una sola regla. */
  async function cambiarModo(nuevo) {
    // Sin haber leído la política actual no se guarda ninguna. El selector ni siquiera se dibuja
    // fuera del estado "listo", así que esto no debería alcanzarse nunca; está igual porque el
    // día que alguien mueva el dibujo, la regla tiene que seguir puesta.
    if (estadoModo !== 'listo') return;
    setGuardandoModo(true);
    setError(null);
    try {
      await llamarApiConfiguracion('/modo-control-matricula', {
        method: 'PATCH',
        body: JSON.stringify({ modo: nuevo }),
      });
      setModoControl(nuevo);
    } catch {
      setError(t.comun.error_generico);
    } finally {
      setGuardandoModo(false);
    }
  }

  async function alternarActivo(tipo) {
    setOcupadoId(tipo.id);
    setError(null);
    const { error: errorUpdate } = await supabase
      .from('tipos_asistente')
      .update({ activo: !tipo.activo, updated_at: new Date().toISOString() })
      .eq('id', tipo.id);
    setOcupadoId(null);
    if (errorUpdate) {
      setError(t.comun.error_generico);
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
      setError(t.comun.error_generico);
      return;
    }
    if (tipoAbierto === tipo.id) setTipoAbierto(null);
    recargar();
  }

  return (
    <>
      <section className="panel-tarjeta">
        <div className="panel-tarjeta-titulo">
          <h2>{t.matricula.modo_titulo}</h2>
        </div>
        {estadoModo === 'cargando' && (
          <p className="estado-cargando" role="status">
            {t.comun.cargando}
          </p>
        )}

        {estadoModo === 'error' && (
          <Alert variant="error">
            {t.matricula.modo_no_se_pudo_leer} {errorModo}{' '}
            <Button variant="secondary" onClick={cargarModo} disabled={guardandoModo}>
              {t.comun.reintentar}
            </Button>
          </Alert>
        )}

        {estadoModo === 'listo' && (
          <div className="molde-formgrid">
            <div className="molde-campo">
              <select
                id="modo_control_matricula"
                aria-label={t.matricula.modo_titulo}
                value={modoControl}
                disabled={guardandoModo}
                onChange={(e) => cambiarModo(e.target.value)}
              >
                {MODOS_DE_CONTROL_MATRICULA.map((opcion) => (
                  <option key={opcion} value={opcion}>
                    {t.matricula[`modo_${opcion}`]}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </section>

      <section className="panel-tarjeta">
        <div className="panel-tarjeta-titulo">
          <h2>{t.configuracion.tipos_titulo}</h2>
          <Button onClick={() => setCreando(true)}>{t.configuracion.tipos_nuevo}</Button>
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
                <th>{t.configuracion.tipos_col_origen}</th>
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
                    {tipo.descripcion && <div className="panel-mini">{tipo.descripcion}</div>}
                  </td>
                  <td>
                    {esTipoGeneral(tipo)
                      ? t.configuracion.tipos_origen_celtatech
                      : t.configuracion.tipos_origen_propia}
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
                      <Button variant="secondary" onClick={() => borrar(tipo)} disabled={ocupadoId === tipo.id}>
                        {t.comun.borrar}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </EstadoLista>
      </section>

      {tipoAbierto && (
        <TareasDelTipo
          tipo={tipos.find((x) => x.id === tipoAbierto)}
          vias={vias}
          prestadoraId={prestadoraId}
        />
      )}

      {creando && (
        <NuevoTipoModal
          prestadoraId={prestadoraId}
          onClose={() => setCreando(false)}
          onCreado={() => {
            setCreando(false);
            recargar();
          }}
        />
      )}
    </>
  );
}

/* Las dos listas de tareas de un tipo. Son dos y no una a propósito: la de "no
   corresponde" es la que evita que la Familia le pida al Asistente cosas que no
   son suyas, y si va mezclada con la otra se lee y no se entiende cuál era cuál. */
function TareasDelTipo({ tipo, vias, prestadoraId }) {
  const { t } = useLocale();
  const confirmarDestructivo = useConfirmarDestructivo();
  const [tareas, setTareas] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [ocupadoId, setOcupadoId] = useState(null);

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

  async function borrar(tarea) {
    if (!(await confirmarDestructivo(t.configuracion.tareas_confirmar_borrar))) return;
    setOcupadoId(tarea.id);
    setError(null);
    const { error: errorDelete } = await supabase.from('tareas_tipo_asistente').delete().eq('id', tarea.id);
    setOcupadoId(null);
    if (errorDelete) {
      setError(t.comun.error_generico);
      return;
    }
    recargar();
  }

  if (!tipo) return null;

  const vedadas = viasVedadasPorMatricula(tipo, vias);

  return (
    <>
      {estado === 'listo' && error && <Alert variant="error">{error}</Alert>}

      <EstadoLista estado={estado} error={error} vacio={false} recargar={recargar}>
        <div className="panel-grilla panel-columnas-2">
          <ListaDeClase
            clase="corresponde"
            titulo={t.configuracion.tareas_corresponde}
            vacio={t.configuracion.tareas_vacio_corresponde}
            tareas={tareas.filter((x) => x.clase === 'corresponde')}
            tipo={tipo}
            prestadoraId={prestadoraId}
            ocupadoId={ocupadoId}
            onBorrar={borrar}
            onCambio={recargar}
          />
          <ListaDeClase
            clase="no_corresponde"
            titulo={t.configuracion.tareas_no_corresponde}
            vacio={t.configuracion.tareas_vacio_no_corresponde}
            tareas={tareas.filter((x) => x.clase === 'no_corresponde')}
            tipo={tipo}
            prestadoraId={prestadoraId}
            ocupadoId={ocupadoId}
            onBorrar={borrar}
            onCambio={recargar}
          />
        </div>
      </EstadoLista>

      {vedadas.length > 0 && (
        <section className="panel-tarjeta">
          <div className="panel-tarjeta-titulo">
            <h2>{t.configuracion.tareas_vedadas_titulo}</h2>
            <span className="panel-mini">{nombreTipo(tipo, t)}</span>
          </div>
          {vedadas.map((via) => (
            <div key={via} className="panel-fila-alerta">
              <div><b>{via}</b></div>
            </div>
          ))}
        </section>
      )}
    </>
  );
}

function ListaDeClase({ clase, titulo, vacio, tareas, tipo, prestadoraId, ocupadoId, onBorrar, onCambio }) {
  const { t } = useLocale();
  const [texto, setTexto] = useState('');
  const [agregando, setAgregando] = useState(false);
  const [error, setError] = useState(null);

  async function agregar() {
    setAgregando(true);
    setError(null);
    const { error: errorInsert } = await supabase.from('tareas_tipo_asistente').insert({
      tipo_asistente_id: tipo.id,
      prestadora_id: prestadoraId,
      clase,
      texto: texto.trim(),
      orden: (tareas.length + 1) * 10,
    });
    setAgregando(false);
    if (errorInsert) {
      setError(t.comun.error_generico);
      return;
    }
    setTexto('');
    onCambio();
  }

  return (
    <section className="panel-tarjeta">
      <div className="panel-tarjeta-titulo">
        <h2>{titulo}</h2>
        <span className="panel-mini">{t.configuracion.tareas_titulo} · {nombreTipo(tipo, t)}</span>
      </div>
      {error && <Alert variant="error">{error}</Alert>}
      {tareas.length === 0 ? (
        <p className="molde-vacio">{vacio}</p>
      ) : (
        tareas.map((tarea) => (
          <div key={tarea.id} className="panel-fila-alerta">
            <div><b>{tarea.texto || tarea.clave}</b></div>
            {!tarea.prestadora_id ? (
              <span className="badge badge-neutro">{t.configuracion.tipos_origen_celtatech}</span>
            ) : (
              <Button variant="secondary" onClick={() => onBorrar(tarea)} disabled={ocupadoId === tarea.id}>
                {t.comun.borrar}
              </Button>
            )}
          </div>
        ))
      )}
      <div className="molde-formgrid">
        <div className="molde-ancho">
          <FormField
            label={t.configuracion.tareas_agregar}
            name={`nueva_tarea_${clase}`}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={t.configuracion.tareas_nueva_placeholder}
          />
        </div>
      </div>
      <div className="molde-acciones">
        <Button onClick={agregar} disabled={agregando || !texto.trim()}>
          {agregando ? t.comun.guardando : t.configuracion.tareas_agregar}
        </Button>
      </div>
    </section>
  );
}

function NuevoTipoModal({ prestadoraId, onClose, onCreado }) {
  const modal = useModalAccesible(onClose);
  const { t } = useLocale();
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [requiereMatricula, setRequiereMatricula] = useState(false);
  const [tipoMatricula, setTipoMatricula] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  // La base no acepta "pide matrícula pero no sabemos de cuál": sin ese dato no
  // hay contra qué comparar y el Asistente quedaría bloqueado sin salida.
  const faltaAlgo = !nombre.trim() || (requiereMatricula && !tipoMatricula.trim());

  async function guardar() {
    setGuardando(true);
    setError(null);
    const { error: errorInsert } = await supabase.from('tipos_asistente').insert({
      prestadora_id: prestadoraId,
      nombre: nombre.trim(),
      descripcion: descripcion.trim() || null,
      requiere_matricula: requiereMatricula,
      tipo_matricula: requiereMatricula ? tipoMatricula.trim() : null,
    });
    setGuardando(false);
    if (errorInsert) {
      setError(t.comun.error_generico);
      return;
    }
    onCreado();
  }

  return (
    <div className="panel-modal-fondo" onClick={onClose}>
      <div className="panel-modal" onClick={(e) => e.stopPropagation()} {...modal.props}>
        <h2 id={modal.idTitulo}>{t.configuracion.tipos_nuevo}</h2>
        {error && <Alert variant="error">{error}</Alert>}
        <div className="molde-formgrid">
          <div className="molde-ancho">
            <FormField
              label={t.configuracion.tipos_nombre_label}
              name="tipo_nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
            />
          </div>
          <div className="molde-ancho">
            <FormField
              label={t.configuracion.tipos_descripcion_label}
              name="tipo_descripcion"
              type="textarea"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
            />
          </div>
          <FormField
            label={t.configuracion.tipos_requiere_matricula_label}
            name="tipo_requiere_matricula"
            type="checkbox"
            checked={requiereMatricula}
            onChange={(e) => setRequiereMatricula(e.target.checked)}
          />
          {requiereMatricula && (
            <FormField
              label={t.configuracion.tipos_tipo_matricula_label}
              name="tipo_tipo_matricula"
              value={tipoMatricula}
              onChange={(e) => setTipoMatricula(e.target.value)}
              required
            />
          )}
        </div>
        <div className="panel-modal-acciones">
          <Button variant="secondary" onClick={onClose} disabled={guardando}>
            {t.comun.cancelar}
          </Button>
          <Button onClick={guardar} disabled={guardando || faltaAlgo}>
            {guardando ? t.comun.guardando : t.comun.guardar}
          </Button>
        </div>
      </div>
    </div>
  );
}
