import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { supabase } from '../../lib/supabaseClient';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';
import { Alert } from '../../components/ui/Alert';
import { EstadoLista } from '../../components/layout/EstadoLista';
import { CasillerosDeHorario } from '../../components/turnos_guardia/CasillerosDeHorario';
import { useConfirmarDestructivo } from '../../context/ConfirmacionContext';
import { mensajeDeError } from '../../lib/errores';
import {
  DIAS_SEMANA,
  duracionVisible,
  faltantesDeLaGuardia,
  horasDelHorario,
  momentoVisible,
  textoDelFaltante,
  tramosDeLaGuardia,
} from '../../lib/cronogramaDeGuardias';

// El orden de los casilleros, para saltar al primero que falte.
const ORDEN_DE_LOS_CASILLEROS = ['dias_semana', 'fecha', 'hora_inicio', 'dias_hasta_el_fin', 'fecha_fin', 'hora_fin'];

/**
 * El cronograma de guardias de una Prestación: qué días y en qué horario hay que cubrir a ese
 * Paciente. Se agrega y se quita; una guardia no se modifica: para cambiarla se quita y se agrega
 * otra, porque los turnos de guardia que ya nacieron de ella tienen que seguir apuntando a lo que
 * era. Al cambiar el precio de la Prestación, el cronograma lo copia la base a la nueva.
 */
export function CronogramaDeGuardias({ prestacion, prestadoraId, onCerrar }) {
  const { t, locale } = useLocale();
  const textos = t.prestaciones.cronograma;
  const textosHorario = t.turnos_guardia.nuevo_turno_guardia;
  const confirmarDestructivo = useConfirmarDestructivo();

  const [guardias, setGuardias] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [errorCarga, setErrorCarga] = useState(null);
  const [errorAccion, setErrorAccion] = useState(null);

  const [repite, setRepite] = useState(true);
  const [diasSemana, setDiasSemana] = useState([]);
  const [fecha, setFecha] = useState('');
  const [horaInicio, setHoraInicio] = useState('');
  const [horaFin, setHoraFin] = useState('');
  const [diasHastaElFin, setDiasHastaElFin] = useState('0');
  const [intentoGuardar, setIntentoGuardar] = useState(false);
  const [agregando, setAgregando] = useState(false);
  const [quitandoId, setQuitandoId] = useState(null);

  const cargar = useCallback(async () => {
    setEstado('cargando');
    setErrorCarga(null);
    const { data, error } = await supabase
      .from('cronograma_de_guardias')
      .select('id, dias_semana, fecha, hora_inicio, hora_fin, dias_hasta_el_fin')
      .eq('prestacion_id', prestacion.id)
      .order('created_at');
    if (error) {
      setErrorCarga(mensajeDeError(error, t));
      setEstado('error');
      return;
    }
    setGuardias(data ?? []);
    setEstado('listo');
  }, [prestacion.id, t]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const faltantes = faltantesDeLaGuardia({
    repite,
    dias_semana: diasSemana,
    fecha,
    hora_inicio: horaInicio,
    hora_fin: horaFin,
    dias_hasta_el_fin: diasHastaElFin,
  });
  const avisos = {};
  if (intentoGuardar) {
    for (const [campo, motivo] of Object.entries(faltantes)) avisos[campo] = textoDelFaltante(motivo, t);
  }

  function alternarDia(dia) {
    setDiasSemana((prev) => (prev.includes(dia) ? prev.filter((d) => d !== dia) : [...prev, dia]));
  }

  function limpiar() {
    setDiasSemana([]);
    setFecha('');
    setHoraInicio('');
    setHoraFin('');
    setDiasHastaElFin('0');
    setIntentoGuardar(false);
  }

  async function agregar() {
    setIntentoGuardar(true);
    setErrorAccion(null);
    const primero = ORDEN_DE_LOS_CASILLEROS.find((campo) => faltantes[campo]);
    if (primero) {
      document.getElementById(`field-cronograma_${primero}`)?.focus();
      return;
    }
    setAgregando(true);
    const { error } = await supabase.from('cronograma_de_guardias').insert({
      prestadora_id: prestadoraId,
      prestacion_id: prestacion.id,
      dias_semana: repite ? DIAS_SEMANA.filter((d) => diasSemana.includes(d)) : null,
      fecha: repite ? null : fecha,
      hora_inicio: horaInicio,
      hora_fin: horaFin,
      dias_hasta_el_fin: Number(diasHastaElFin),
    });
    setAgregando(false);
    if (error) {
      setErrorAccion(mensajeDeError(error, t));
      return;
    }
    limpiar();
    cargar();
  }

  async function quitar(guardia) {
    if (!(await confirmarDestructivo({ texto: textos.confirmar_quitar, confirmar: textos.quitar }))) return;
    setErrorAccion(null);
    setQuitandoId(guardia.id);
    const { error } = await supabase.from('cronograma_de_guardias').delete().eq('id', guardia.id);
    setQuitandoId(null);
    if (error) {
      setErrorAccion(mensajeDeError(error, t));
      return;
    }
    cargar();
  }

  // Cada guardia con su comienzo y su fin, de a un renglón por día marcado.
  const unRenglonPorTramo = (g, punta) =>
    tramosDeLaGuardia(g).map((tr) => <div key={tr.comienzo.dia ?? tr.comienzo.fecha}>{momentoVisible(tr[punta], t, locale)}</div>);

  const ocupado = agregando || quitandoId !== null;

  return (
    <section className="panel-tarjeta tarjeta-desplazable">
      <div className="panel-tarjeta-titulo">
        <h2>{textos.titulo} — {prestacion.tipo_servicio}</h2>
        <div className="molde-acciones">
          <Button variant="secondary" onClick={onCerrar} disabled={ocupado}>
            {t.comun.cerrar}
          </Button>
        </div>
      </div>

      {errorAccion && <Alert variant="error">{errorAccion}</Alert>}

      <EstadoLista
        estado={estado}
        error={errorCarga}
        recargar={cargar}
        vacio={guardias.length === 0}
        mensajeVacio={textos.vacio}
      >
        <table className="panel-tabla">
          <thead>
            <tr>
              <th>{textos.col_comienzo}</th>
              <th>{textos.col_fin}</th>
              <th>{textos.col_duracion}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {guardias.map((g) => (
              <tr key={g.id}>
                <td>{unRenglonPorTramo(g, 'comienzo')}</td>
                <td>{unRenglonPorTramo(g, 'fin')}</td>
                <td>{duracionVisible(horasDelHorario(g), t)}</td>
                <td>
                  <Button variant="secondary" onClick={() => quitar(g)} disabled={ocupado}>
                    {quitandoId === g.id ? textos.quitando : textos.quitar}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </EstadoLista>

      <div className="panel-tarjeta-titulo">
        <h3>{textos.nueva}</h3>
      </div>
      <div className="molde-formgrid">
        <FormField
          label={textos.repeticion}
          name="cronograma_repeticion"
          type="select"
          value={repite ? 'semanal' : 'fecha'}
          onChange={(e) => setRepite(e.target.value === 'semanal')}
          disabled={agregando}
        >
          <option value="semanal">{textos.repeticion_semanal}</option>
          <option value="fecha">{textos.repeticion_fecha}</option>
        </FormField>

        {!repite && (
          <FormField
            label={textosHorario.fecha_inicio}
            name="cronograma_fecha"
            type="date"
            required
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            error={avisos.fecha}
            disabled={agregando}
          />
        )}

        <div className="molde-ancho">
          <CasillerosDeHorario
            prefijo="cronograma_"
            diasSemana={repite ? diasSemana : undefined}
            onAlternarDia={repite ? alternarDia : undefined}
            fecha={repite ? undefined : fecha}
            horaInicio={horaInicio}
            onHoraInicio={setHoraInicio}
            horaFin={horaFin}
            onHoraFin={setHoraFin}
            diasHastaElFin={diasHastaElFin}
            onDiasHastaElFin={setDiasHastaElFin}
            errores={avisos}
            disabled={agregando}
          />
        </div>
      </div>
      <div className="molde-acciones">
        <Button onClick={agregar} disabled={ocupado}>
          {agregando ? textos.agregando : textos.agregar}
        </Button>
      </div>
    </section>
  );
}
