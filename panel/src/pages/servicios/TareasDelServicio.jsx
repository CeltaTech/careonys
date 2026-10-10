import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { useConfirmarDestructivo } from '../../context/ConfirmacionContext';
import { supabase } from '../../lib/supabaseClient';
import { mensajeDeError } from '../../lib/errores';
import { nombreTipo, nombreTarea } from '../../lib/tiposAsistente';
import { useTiposAsistente } from '../../hooks/useTiposAsistente';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';
import { TareaConDetalle } from '../../components/ui/TareaConDetalle';
import { EstadoLista } from '../../components/layout/EstadoLista';
import { tareasQueSePuedenAcordar } from './tareasQueSePuedenAcordar';
import '../../styles/molde-paginas.css';

/* Las tareas acordadas en un Servicio, y qué tipo de Asistente hace cada una.
 *
 * Una tarea se puede tomar de cualquier tipo: el cuidador puede quedar a cargo de algo que en
 * el catálogo es del enfermero. Lo que no se ofrece es lo que la base rechazaría al guardar
 * —ver `tareasQueSePuedenAcordar`—, y si igual llega a rechazarlo, se muestra su motivo. */
export function TareasDelServicio({ servicioId, prestadoraId, editable }) {
  const { t } = useLocale();
  const d = t.servicios.detalle;
  const confirmarDestructivo = useConfirmarDestructivo();
  const { paraElegir: tipos, porId: tipoPorId, estado: estadoTipos, error: errorTipos } = useTiposAsistente();

  const [acordadas, setAcordadas] = useState([]);
  const [catalogo, setCatalogo] = useState([]);
  const [alcances, setAlcances] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);

  const [tipoId, setTipoId] = useState('');
  const [tareaId, setTareaId] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [errorAccion, setErrorAccion] = useState(null);

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    const [ac, ca, al] = await Promise.all([
      supabase
        .from('tareas_del_servicio')
        .select('id, tarea_id, tipo_asistente_id')
        .eq('servicio_id', servicioId)
        .order('created_at'),
      supabase
        .from('tareas_tipo_asistente')
        .select('id, prestadora_id, tipo_asistente_id, clase, clave, texto, descripcion, orden')
        .order('orden'),
      supabase.from('tareas_que_alcanza_la_prohibicion').select('prohibicion_id, tarea_id'),
    ]);
    const falla = ac.error ?? ca.error ?? al.error;
    if (falla) {
      setError(mensajeDeError(falla, t));
      setEstado('error');
      return;
    }
    setAcordadas(ac.data ?? []);
    setCatalogo(ca.data ?? []);
    setAlcances(al.data ?? []);
    setEstado('listo');
  }, [servicioId, t]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  const tareaPorId = useMemo(() => new Map(catalogo.map((tarea) => [tarea.id, tarea])), [catalogo]);

  // Lo que se ofrece para el tipo elegido, sin lo que ese tipo ya tiene acordado, agrupado por
  // el tipo de cuyo catálogo sale cada tarea.
  const grupos = useMemo(() => {
    const tipo = tipoPorId.get(tipoId);
    const yaAcordadas = new Set(acordadas.filter((a) => a.tipo_asistente_id === tipoId).map((a) => a.tarea_id));
    const ofrecidas = tareasQueSePuedenAcordar(tipo, catalogo, alcances).filter((tarea) => !yaAcordadas.has(tarea.id));
    const porTipo = new Map();
    for (const tarea of ofrecidas) {
      if (!porTipo.has(tarea.tipo_asistente_id)) porTipo.set(tarea.tipo_asistente_id, []);
      porTipo.get(tarea.tipo_asistente_id).push(tarea);
    }
    // Primero las del propio tipo; después las de los demás.
    return [...porTipo.entries()].sort(([a], [b]) => (a === tipoId ? -1 : b === tipoId ? 1 : 0));
  }, [tipoId, tipoPorId, acordadas, catalogo, alcances]);

  async function agregar() {
    setOcupado(true);
    setErrorAccion(null);
    const { error: fallo } = await supabase.from('tareas_del_servicio').insert({
      prestadora_id: prestadoraId,
      servicio_id: servicioId,
      tarea_id: tareaId,
      tipo_asistente_id: tipoId,
    });
    setOcupado(false);
    if (fallo) {
      setErrorAccion(mensajeDeError(fallo, t));
      return;
    }
    setTareaId('');
    recargar();
  }

  async function borrar(acordada) {
    if (!(await confirmarDestructivo(d.tareas_confirmar_borrar))) return;
    setOcupado(true);
    setErrorAccion(null);
    const { error: fallo } = await supabase.from('tareas_del_servicio').delete().eq('id', acordada.id);
    setOcupado(false);
    if (fallo) {
      setErrorAccion(mensajeDeError(fallo, t));
      return;
    }
    recargar();
  }

  const estadoGeneral = estadoTipos === 'error' ? 'error' : estadoTipos === 'cargando' ? 'cargando' : estado;

  return (
    <EstadoLista
      estado={estadoGeneral}
      error={error ?? errorTipos}
      recargar={recargar}
      vacio={false}
    >
      {errorAccion && <Alert variant="error">{errorAccion}</Alert>}

      {acordadas.length === 0 ? (
        <p className="estado-vacio">{d.sin_tareas}</p>
      ) : (
        <div className="servicios-tabla-envoltura">
          <table className="panel-tabla">
            <thead>
              <tr>
                <th>{d.col_tipo_asistente}</th>
                <th>{d.col_tarea}</th>
                {editable && <th aria-label={t.comun.borrar} />}
              </tr>
            </thead>
            <tbody>
              {acordadas.map((acordada) => {
                const tarea = tareaPorId.get(acordada.tarea_id);
                return (
                  <tr key={acordada.id}>
                    <td>{nombreTipo(tipoPorId.get(acordada.tipo_asistente_id), t)}</td>
                    <td>{tarea ? <TareaConDetalle tarea={tarea} t={t} /> : '—'}</td>
                    {editable && (
                      <td>
                        <Button variant="secondary" onClick={() => borrar(acordada)} disabled={ocupado}>
                          {t.comun.borrar}
                        </Button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editable && (
        <div className="molde-formgrid servicios-tareas-alta">
          <FormField
            label={d.col_tipo_asistente}
            name="tarea_servicio_tipo"
            type="select"
            value={tipoId}
            onChange={(e) => {
              setTipoId(e.target.value);
              setTareaId('');
            }}
            disabled={ocupado}
          >
            <option value="" />
            {tipos.map((tipo) => (
              <option key={tipo.id} value={tipo.id}>{nombreTipo(tipo, t)}</option>
            ))}
          </FormField>
          <FormField
            label={d.col_tarea}
            name="tarea_servicio_tarea"
            type="select"
            value={tareaId}
            onChange={(e) => setTareaId(e.target.value)}
            disabled={ocupado || !tipoId}
          >
            <option value="" />
            {grupos.map(([idDelTipo, tareas]) => (
              <optgroup key={idDelTipo} label={nombreTipo(tipoPorId.get(idDelTipo), t)}>
                {tareas.map((tarea) => (
                  <option key={tarea.id} value={tarea.id}>{nombreTarea(tarea, t)}</option>
                ))}
              </optgroup>
            ))}
          </FormField>
          <div>
            <Button onClick={agregar} disabled={ocupado || !tipoId || !tareaId}>
              {ocupado ? t.comun.guardando : d.tareas_agregar}
            </Button>
          </div>
        </div>
      )}
    </EstadoLista>
  );
}
