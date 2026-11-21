import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { useConfirmarDestructivo } from '../../context/ConfirmacionContext';
import { decisionesDelServicio, nombreDeLaClase, vetarDecision } from '../../lib/decisionesDeCoordinacion';
import { mensajeDeError } from '../../lib/errores';
import { fechaVisible } from '../../lib/fechaVisible';
import { avisar } from '../../lib/mensajeEmergente';
import { con } from '../../lib/textos';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { EstadoLista } from '../../components/layout/EstadoLista';

const horario = (inicio, fin) => [inicio, fin].filter(Boolean).map((h) => String(h).slice(0, 5)).join('–');

/** Un renglón de lo que cambió: la operación, el día, el horario y el Asistente de antes y de después. */
export function textoDelCambio(cambio, d, locale) {
  const partes = [d[`operacion_${cambio.operacion}`] ?? cambio.operacion];
  if (cambio.fecha) partes.push(fechaVisible(cambio.fecha, locale));
  const horas = horario(cambio.hora_inicio, cambio.hora_fin);
  if (horas) partes.push(horas);
  if (cambio.asistente_antes || cambio.asistente_despues) {
    const nombre = (id, n) => (id ? n || '—' : d.sin_asistente);
    partes.push(`${nombre(cambio.asistente_antes, cambio.asistente_antes_nombre)} → ${nombre(cambio.asistente_despues, cambio.asistente_despues_nombre)}`);
  }
  return partes.join(' · ');
}

/* Las decisiones del Coordinador en este Servicio, y el veto de la administración.
   ==========================================================================

   La lista la anota la base sola. Vetar deshace la decisión de ahora en adelante: los turnos de
   guardia que ya empezaron quedan como están. Si alguien cambió lo mismo después, la base rechaza
   el veto. Quién puede vetar lo decide la base; esta pestaña sólo se le muestra a la
   administración. */
export function DecisionesDelServicio({ servicio }) {
  const { t, locale } = useLocale();
  const confirmarDestructivo = useConfirmarDestructivo();
  const d = t.decisiones;
  const [decisiones, setDecisiones] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [vetandoId, setVetandoId] = useState(null);
  const [errorDelVeto, setErrorDelVeto] = useState(null);

  const recargar = useCallback(async () => {
    setEstado('cargando');
    try {
      setDecisiones(await decisionesDelServicio(servicio.id));
      setError(null);
      setEstado('listo');
    } catch (e) {
      setError(mensajeDeError(e, t));
      setEstado('error');
    }
  }, [servicio.id, t]);

  useEffect(() => { recargar(); }, [recargar]);

  async function vetar(decision) {
    const motivo = await confirmarDestructivo({
      texto: con(d.confirmar_veto, {
        decision: nombreDeLaClase(decision.clase, t),
        fecha: fechaVisible(decision.decidida_at, locale),
        coordinador: decision.decidida_por_nombre || '—',
      }),
      confirmar: d.vetar,
      motivo: true,
    });
    if (!motivo) return;
    setVetandoId(decision.id);
    setErrorDelVeto(null);
    try {
      const { salteados } = await vetarDecision(decision.id, motivo);
      avisar(salteados > 0 ? con(d.vetada_ok_con_salteados, { n: salteados }) : d.vetada_ok);
      await recargar();
    } catch (e) {
      setErrorDelVeto(mensajeDeError(e, t));
    } finally {
      setVetandoId(null);
    }
  }

  return (
    <div>
      {errorDelVeto && <Alert variant="error">{errorDelVeto}</Alert>}
      <EstadoLista estado={estado} error={error} recargar={recargar} vacio={decisiones.length === 0} mensajeVacio={d.sin_decisiones}>
        <div className="tarjeta-desplazable"><table className="panel-tabla">
          <thead>
            <tr>
              <th>{d.col_fecha}</th>
              <th>{d.col_decision}</th>
              <th>{d.col_coordinador}</th>
              <th>{d.col_que_cambio}</th>
              <th>{d.col_estado}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {decisiones.map((decision) => (
              <tr key={decision.id}>
                <td>{fechaVisible(decision.decidida_at, locale)}</td>
                <td>{nombreDeLaClase(decision.clase, t)}</td>
                <td>{decision.decidida_por_nombre || '—'}</td>
                <td>
                  {(decision.cambios ?? []).map((cambio, i) => (
                    <div key={i}>{textoDelCambio(cambio, d, locale)}</div>
                  ))}
                </td>
                <td>
                  {decision.vetada_at
                    ? con(d.vetada_por, {
                      nombre: decision.vetada_por_nombre || '—',
                      fecha: fechaVisible(decision.vetada_at, locale),
                      motivo: decision.motivo_del_veto || '—',
                    })
                    : d.vigente}
                </td>
                <td>
                  {!decision.vetada_at && (
                    <Button variant="secondary" onClick={() => vetar(decision)} disabled={vetandoId !== null}>
                      {d.vetar}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </EstadoLista>
    </div>
  );
}
