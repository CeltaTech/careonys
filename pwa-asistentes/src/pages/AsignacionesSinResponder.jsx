import { Fragment, useEffect, useRef, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { api } from '../lib/api';
import { useLocale } from '../i18n/LocaleContext';
import { mensajeDeError } from '../lib/errores';
import { nombreDelMotivo } from '../lib/nombreDelMotivo';
import DomicilioTemporal, { domiciliosDeLaGuardia } from '../components/DomicilioTemporal';
import EnlaceAlMapa from '../components/EnlaceAlMapa';

// Los turnos que se le asignaron y todavía no respondió.
//
// Cada turno se le asigna a un Asistente por vez, y mientras no responde el Coordinador no puede
// buscar a otro. Por eso no hay plazo ni carrera: hay una persona que tiene que decir sí o no.
//
// Para decir que no hay que elegir un motivo de la lista de la Prestadora, y cuando el motivo lo
// pide, escribirlo. Es lo que el Coordinador necesita para saber a quién asignarlo después.

function TarjetaDeAsignacion({ asignacion, motivos, onResponder, enCurso, t, locale }) {
  const [rechazando, setRechazando] = useState(false);
  const [motivoId, setMotivoId] = useState('');
  const [detalle, setDetalle] = useState('');
  const [faltas, setFaltas] = useState({});
  const refMotivo = useRef(null);
  const refDetalle = useRef(null);

  const guardia = asignacion.guardia;
  const nombres = (guardia.pacientes ?? []).map((p) => p.nombre).filter(Boolean);
  // Antes de decidir si se toma el turno hay que saber adónde hay que ir de verdad: las
  // direcciones distintas del turno, cada una sabiendo si es la de siempre o una temporal.
  const domicilios = domiciliosDeLaGuardia(guardia.pacientes);
  const ocupado = enCurso !== null;
  const motivoElegido = motivos.find((m) => m.id === motivoId);
  const pideDetalle = Boolean(motivoElegido?.pide_detalle);

  function confirmarRechazo() {
    // Los dos faltantes se marcan a la vez, y la pantalla salta al primero.
    const nuevas = {};
    if (!motivoElegido) nuevas.motivo = t.asignaciones.falta_motivo;
    if (pideDetalle && !detalle.trim()) nuevas.detalle = t.asignaciones.falta_detalle;
    setFaltas(nuevas);
    if (nuevas.motivo) return refMotivo.current?.focus();
    if (nuevas.detalle) return refDetalle.current?.focus();
    onResponder(asignacion, 'rechaza', { motivoId, detalle: pideDetalle ? detalle.trim() : undefined });
  }

  function cancelar() {
    setRechazando(false);
    setMotivoId('');
    setDetalle('');
    setFaltas({});
  }

  return (
    <div className="guardia-card">
      <div className="guardia-card-paciente">
        {nombres.length > 0 ? nombres.join(' · ') : t.guardias.sin_paciente}
      </div>
      <div className="guardia-card-detalle">
        {guardia.fecha} · {guardia.hora_inicio?.slice(0, 5)} - {guardia.hora_fin?.slice(0, 5)}
      </div>
      {domicilios.map((domicilio) => (
        <Fragment key={domicilio.domicilio}>
          <div className="guardia-card-detalle">
            <EnlaceAlMapa lugar={domicilio} t={t} />
          </div>
          <DomicilioTemporal paciente={domicilio} t={t} />
        </Fragment>
      ))}

      {!rechazando && (
        <div className="botones-en-fila">
          <button
            type="button"
            className="btn btn-primary"
            disabled={ocupado}
            onClick={() => onResponder(asignacion, 'acepta')}
          >
            {enCurso === `acepta:${asignacion.id}` ? t.asignaciones.aceptando : t.asignaciones.aceptar}
          </button>
          <button type="button" className="btn btn-secondary" disabled={ocupado} onClick={() => setRechazando(true)}>
            {t.asignaciones.rechazar}
          </button>
        </div>
      )}

      {rechazando && (
        <div className="pwa-card-pie">
          <div className="form-field">
            <label htmlFor={`motivo-${asignacion.id}`}>{t.asignaciones.motivo}</label>
            <select
              id={`motivo-${asignacion.id}`}
              ref={refMotivo}
              value={motivoId}
              onChange={(e) => {
                setMotivoId(e.target.value);
                setFaltas((antes) => ({ ...antes, motivo: undefined, detalle: undefined }));
              }}
              aria-invalid={faltas.motivo ? true : undefined}
              aria-describedby={faltas.motivo ? `motivo-${asignacion.id}-error` : undefined}
            >
              <option value="">{t.asignaciones.elegir_motivo}</option>
              {motivos.map((m) => (
                <option key={m.id} value={m.id}>
                  {nombreDelMotivo(m, locale)}
                </option>
              ))}
            </select>
            {faltas.motivo && (
              <span className="form-error" id={`motivo-${asignacion.id}-error`} role="alert">
                {faltas.motivo}
              </span>
            )}
          </div>

          {pideDetalle && (
            <div className="form-field">
              <label htmlFor={`detalle-${asignacion.id}`}>{t.asignaciones.detalle}</label>
              <textarea
                id={`detalle-${asignacion.id}`}
                ref={refDetalle}
                value={detalle}
                onChange={(e) => {
                  setDetalle(e.target.value);
                  if (e.target.value.trim()) setFaltas((antes) => ({ ...antes, detalle: undefined }));
                }}
                maxLength={500}
                aria-invalid={faltas.detalle ? true : undefined}
                aria-describedby={faltas.detalle ? `detalle-${asignacion.id}-error` : undefined}
              />
              {faltas.detalle && (
                <span className="form-error" id={`detalle-${asignacion.id}-error`} role="alert">
                  {faltas.detalle}
                </span>
              )}
            </div>
          )}

          <div className="botones-en-fila">
            <button type="button" className="btn btn-primary" disabled={ocupado} onClick={confirmarRechazo}>
              {enCurso === `rechaza:${asignacion.id}` ? t.asignaciones.enviando : t.asignaciones.confirmar_rechazo}
            </button>
            <button type="button" className="btn btn-secondary" disabled={ocupado} onClick={cancelar}>
              {t.comun.cancelar}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AsignacionesSinResponder() {
  const { t, locale } = useLocale();
  // El número que lleva la pestaña de abajo lo dibuja el Layout, así que cada vez que esta
  // pantalla se entera de cuántas asignaciones esperan respuesta, se lo avisa. Sin esto, quien
  // acaba de responder sigue viendo el número viejo hasta que cierra la aplicación.
  const { avisarSinResponder } = useOutletContext() ?? {};
  const [asignaciones, setAsignaciones] = useState(null);
  const [motivos, setMotivos] = useState([]);
  const [error, setError] = useState('');
  const [pidiendo, setPidiendo] = useState(false);
  const [enCurso, setEnCurso] = useState(null);
  const [aceptada, setAceptada] = useState(null);

  function cargar() {
    setPidiendo(true);
    return api
      .asignaciones()
      .then(({ asignaciones: data, motivos: lista }) => {
        setAsignaciones(data ?? []);
        setMotivos(lista ?? []);
        avisarSinResponder?.((data ?? []).length);
      })
      .catch((e) => setError(mensajeDeError(e, t, 'asignaciones')))
      .finally(() => setPidiendo(false));
  }

  useEffect(() => {
    cargar();
  }, []);

  async function responder(asignacion, respuesta, { motivoId, detalle } = {}) {
    setEnCurso(`${respuesta}:${asignacion.id}`);
    setError('');
    // El aviso del turno anterior se apaga antes de responder el siguiente, para que no queden
    // dos avisos de cosas distintas uno debajo del otro.
    setAceptada(null);
    try {
      const resultado = await api.responderAsignacion(asignacion.id, respuesta, { motivoId, detalle });
      if (resultado.respuesta === 'acepta') setAceptada(resultado.guardiaId);
    } catch (e) {
      // Casi siempre es que el turno ya no está disponible. Se explica y se vuelve a cargar la
      // lista, que es lo que lo deja al día.
      setError(mensajeDeError(e, t, 'responder asignacion'));
    }
    setEnCurso(null);
    await cargar();
  }

  return (
    <div>
      <h1>{t.asignaciones.titulo}</h1>

      {error && (
        <div className="alert alert-error" role="alert">
          {error}
          {asignaciones === null && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setError('');
                cargar();
              }}
              disabled={pidiendo}
            >
              {t.comun.reintentar}
            </button>
          )}
        </div>
      )}

      {aceptada && (
        <div className="alert alert-info" role="status">
          {t.asignaciones.aceptada} <Link to={`/guardias/${aceptada}`}>{t.asignaciones.ver_el_turno}</Link>
        </div>
      )}

      {asignaciones === null && !error && (
        <div className="estado-cargando" role="status">{t.comun.cargando}</div>
      )}

      {asignaciones !== null && asignaciones.length === 0 && (
        <div className="estado-vacio" role="status">{t.asignaciones.sin_asignaciones}</div>
      )}

      {(asignaciones ?? []).map((asignacion) => (
        <TarjetaDeAsignacion
          key={asignacion.id}
          asignacion={asignacion}
          motivos={motivos}
          onResponder={responder}
          enCurso={enCurso}
          t={t}
          locale={locale}
        />
      ))}
    </div>
  );
}
