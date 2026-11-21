import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLocale } from '../i18n/LocaleContext';
import { useVetosSinVer } from '../context/VetosSinVerContext';
import { nombreDeLaClase } from '../lib/decisionesDeCoordinacion';
import { mensajeDeError } from '../lib/errores';
import { fechaVisible } from '../lib/fechaVisible';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Cabecera } from '../components/ui/Cabecera';
import { EstadoLista } from '../components/layout/EstadoLista';

/* Las decisiones del Coordinador que la administración vetó, con el motivo.
   ==========================================================================

   Es el aviso en el Panel del veto; el correo y el WhatsApp salen del backend en el momento del
   veto. Quien la vio la marca, y deja de aparecer acá y en la campanita. */
export function DecisionesVetadas() {
  const { t, locale } = useLocale();
  const { vetadas, estado, error, recargar, marcarVista } = useVetosSinVer();
  const [marcandoId, setMarcandoId] = useState(null);
  const [errorAlMarcar, setErrorAlMarcar] = useState(null);
  const d = t.decisiones;

  async function marcar(decision) {
    setMarcandoId(decision.id);
    setErrorAlMarcar(null);
    try {
      await marcarVista(decision.id);
    } catch (e) {
      setErrorAlMarcar(mensajeDeError(e, t));
    } finally {
      setMarcandoId(null);
    }
  }

  return (
    <div>
      <Cabecera titulo={d.vetadas_titulo} />
      {errorAlMarcar && <Alert variant="error">{errorAlMarcar}</Alert>}
      <section className="panel-tarjeta">
        <EstadoLista estado={estado} error={error} recargar={recargar} vacio={vetadas.length === 0} mensajeVacio={d.sin_vetadas}>
          <div className="tarjeta-desplazable"><table className="panel-tabla">
            <thead>
              <tr>
                <th>{d.col_servicio}</th>
                <th>{d.col_decision}</th>
                <th>{d.col_fecha}</th>
                <th>{d.col_vetada}</th>
                <th>{d.col_motivo}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {vetadas.map((v) => (
                <tr key={v.id}>
                  <td>
                    <Link to={`/servicios/${v.servicio_id}`}>{v.servicio_etiqueta || '—'}</Link>
                  </td>
                  <td>{nombreDeLaClase(v.clase, t)}</td>
                  <td>{fechaVisible(v.decidida_at, locale)}</td>
                  <td>{fechaVisible(v.vetada_at, locale)}</td>
                  <td>{v.motivo_del_veto || '—'}</td>
                  <td>
                    <Button variant="secondary" onClick={() => marcar(v)} disabled={marcandoId === v.id}>
                      {d.marcar_visto}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </EstadoLista>
      </section>
    </div>
  );
}
