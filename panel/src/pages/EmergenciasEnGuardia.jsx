import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '../i18n/LocaleContext';
import { Cabecera } from '../components/ui/Cabecera';
import { llamarApiEmergencias } from '../lib/apiEmergencias';
import { horaDelMomento } from '../lib/horarios';
import { claseBadge } from '../lib/tonos';
import { EstadoLista } from '../components/layout/EstadoLista';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import { FormField } from '../components/ui/FormField';
import { mensajeDeError } from '../lib/errores';
import { useModalAccesible } from '../hooks/useModalAccesible';
import { useAlarmasTomadas } from '../hooks/useAlarmasTomadas';
import { LaTomoYo } from '../components/continuidad/LaTomoYo';
import { TIPOS_DE_ALARMA } from '../lib/alarmasTomadas';
import './hojaDeTarjetas.css';
import './seguimientoDeGuardias.css';

/* Las emergencias avisadas desde una guardia.
   ==========================================================================

   DE DÓNDE VIENEN. Las aprieta un Asistente desde la aplicación mientras está trabajando
   (`pwa-asistentes/src/components/EmergenciaEnGuardia.jsx`). Cuando entra una, el Coordinador
   recibe el mensaje por WhatsApp o por correo en el momento; ese mensaje dice de qué guardia se trata
   y nada más, porque sale por un canal público. **El texto que escribió el Asistente se lee acá**,
   que es donde el permiso se comprueba.

   QUÉ SE HACE CON ELLAS. Se leen y se marcan atendidas, con una nota de qué se hizo. Marcarla no
   es cerrar la guardia ni corregir nada: es dejar constancia de que alguien la tomó, para que
   después se pueda distinguir la que se atendió de la que quedó sin leer.

   POR QUÉ NO ESTÁ ADENTRO DE ALERTAS. Aquélla muestra lo que dedujo la revisión automática de
   reportes. Esto lo apretó una persona que estaba adentro de una casa, y mezclarlos haría que se
   lean con el mismo peso. */
export function EmergenciasEnGuardia() {
  const { t, locale } = useLocale();
  const [emergencias, setEmergencias] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [soloSinAtender, setSoloSinAtender] = useState(true);
  const [seleccionada, setSeleccionada] = useState(null);
  const tomas = useAlarmasTomadas();

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    try {
      const { emergencias: filas } = await llamarApiEmergencias(
        soloSinAtender ? '/?estado=sin_atender' : '/',
      );
      setEmergencias(filas || []);
      setEstado('listo');
    } catch (err) {
      setError(mensajeDeError(err, t));
      setEstado('error');
    }
  }, [t, soloSinAtender]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  return (
    <div>
      <Cabecera titulo={t.emergencias.titulo}>
        <Button
          variant={soloSinAtender ? 'primary' : 'secondary'}
          onClick={() => setSoloSinAtender(true)}
        >
          {t.emergencias.filtro_sin_atender}
        </Button>
        <Button
          variant={soloSinAtender ? 'secondary' : 'primary'}
          onClick={() => setSoloSinAtender(false)}
        >
          {t.emergencias.filtro_todas}
        </Button>
      </Cabecera>
      {estado === 'error' && error && <Alert variant="error">{error}</Alert>}

      <section className="panel-tarjeta hoja-desplazable">
        <div className="panel-tarjeta-titulo">
          <h2>{soloSinAtender ? t.emergencias.filtro_sin_atender : t.emergencias.filtro_todas}</h2>
        </div>
      <EstadoLista
        estado={estado}
        error={error}
        vacio={estado === 'listo' && emergencias.length === 0}
        recargar={recargar}
      >
        <table className="panel-tabla">
          <thead>
            <tr>
              <th>{t.emergencias.col_momento}</th>
              <th>{t.emergencias.col_guardia}</th>
              <th>{t.emergencias.col_asistente}</th>
              <th>{t.emergencias.col_estado}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {emergencias.map((emergencia) => (
              <tr key={emergencia.id}>
                <td>
                  <b>{emergencia.reportado_at?.slice(0, 10)}</b>
                  <div className="panel-mini">{horaDelMomento(emergencia.reportado_at, locale)}</div>
                </td>
                <td>
                  {emergencia.guardia
                    ? `${emergencia.guardia.fecha} ${emergencia.guardia.hora_inicio}`
                    : '—'}
                </td>
                <td>{emergencia.guardia?.asistente || '—'}</td>
                <td>
                  <span className={claseBadge(emergencia.atendida_at ? 'atendida' : 'sin_atender')}>
                    {emergencia.atendida_at
                      ? t.emergencias.estado_atendida
                      : t.emergencias.estado_sin_atender}
                  </span>
                </td>
                <td>
                  <div className="seguimiento-celda-acciones">
                    <Button variant="secondary" onClick={() => setSeleccionada(emergencia)}>
                      {t.comun.ver_detalle}
                    </Button>
                    {!emergencia.atendida_at && (
                      <LaTomoYo tipo={TIPOS_DE_ALARMA.EMERGENCIA} referenciaId={emergencia.id} {...tomas} />
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </EstadoLista>
      </section>

      {seleccionada && (
        <DetalleDeEmergencia
          emergencia={seleccionada}
          laTieneOtraPersona={tomas.laTieneOtraPersona(TIPOS_DE_ALARMA.EMERGENCIA, seleccionada.id)}
          onClose={() => setSeleccionada(null)}
          onAtendida={() => {
            setSeleccionada(null);
            recargar();
            tomas.recargar();
          }}
        />
      )}
    </div>
  );
}

/* El detalle, que es lo único que no viajó por ningún mensaje, y la forma de marcarla atendida.
   La nota es opcional: obligarla haría que quien está resolviendo algo urgente tenga que
   escribir antes de poder seguir. */
function DetalleDeEmergencia({ emergencia, laTieneOtraPersona, onClose, onAtendida }) {
  const modal = useModalAccesible(onClose);
  const { t, locale } = useLocale();
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  async function marcarAtendida() {
    setGuardando(true);
    setError(null);
    try {
      await llamarApiEmergencias(`/${emergencia.id}/atencion`, {
        method: 'POST',
        body: JSON.stringify({ nota }),
      });
      onAtendida();
    } catch (err) {
      setError(mensajeDeError(err, t));
      setGuardando(false);
    }
  }

  return (
    <div className="panel-modal-fondo" onClick={onClose}>
      <div className="panel-modal" onClick={(e) => e.stopPropagation()} {...modal.props}>
        <h2 id={modal.idTitulo}>{t.emergencias.detalle_titulo}</h2>

        {error && <Alert variant="error">{error}</Alert>}

        <p className="panel-explicacion">
          {emergencia.reportado_at?.slice(0, 10)}{' '}
          {horaDelMomento(emergencia.reportado_at, locale)}
          {emergencia.guardia?.asistente ? ` — ${emergencia.guardia.asistente}` : ''}
          {emergencia.guardia?.paciente ? ` — ${emergencia.guardia.paciente}` : ''}
        </p>

        <p style={{ whiteSpace: 'pre-wrap' }}>{emergencia.detalle}</p>

        {emergencia.atendida_at ? (
          <Alert variant="info">
            <p>
              {t.emergencias.atendida_el} {emergencia.atendida_at.slice(0, 10)}{' '}
              {horaDelMomento(emergencia.atendida_at, locale)}
            </p>
            {emergencia.atendida_nota && <p>{emergencia.atendida_nota}</p>}
          </Alert>
        ) : (
          <FormField
            label={t.emergencias.campo_nota}
            name="nota"
            type="textarea"
            rows={4}
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            disabled={guardando}
          />
        )}

        <div className="panel-modal-acciones">
          <Button variant="secondary" onClick={onClose} disabled={guardando}>
            {t.comun.cerrar}
          </Button>
          {!emergencia.atendida_at && !laTieneOtraPersona && (
            <Button onClick={marcarAtendida} disabled={guardando}>
              {guardando ? t.comun.guardando : t.emergencias.marcar_atendida}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
