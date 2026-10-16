import { useEffect, useRef, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { api } from '../lib/api';
import { useLocale } from '../i18n/LocaleContext';
import { mensajeDeError } from '../lib/errores';
import { nombreDelMotivo } from '../lib/nombreDelMotivo';
import { con } from '../lib/textos';

// Los turnos que se le asignaron y todavía no respondió.
//
// Cada turno se le asigna a un Asistente por vez, y mientras no responde el Coordinador no puede
// buscar a otro. Por eso no hay plazo ni carrera: hay una persona que tiene que decir sí o no.
//
// Para decir que no hay que elegir un motivo de la lista de la Prestadora, y cuando el motivo lo
// pide, escribirlo. Es lo que el Coordinador necesita para saber a quién asignarlo después.

// La hora sin los ceros que no dicen nada: 08:00 es «8» y 08:30 es «8:30».
function horaCorta(hora) {
  if (!hora) return '';
  const [h, m] = hora.slice(0, 5).split(':');
  return m === '00' ? String(Number(h)) : `${Number(h)}:${m}`;
}

// Lo que se le asignó, en una línea. Un turno de un día dice el día y el horario; un turno fijo,
// los días de la semana y el horario; un reemplazo, desde cuándo, hasta cuándo y cuántos turnos.
function lineaDeArriba(asignacion, t, locale) {
  const guardia = asignacion.guardia;
  if (asignacion.tipo === 'serie') {
    const nombres = (asignacion.dias_semana ?? []).map((d) => t.asignaciones.dias[d] ?? d);
    const dias = new Intl.ListFormat(locale, { type: 'conjunction' }).format(nombres);
    return con(t.asignaciones.turno_fijo, {
      dias: dias.charAt(0).toLocaleUpperCase(locale) + dias.slice(1),
      inicio: horaCorta(guardia.hora_inicio),
      fin: horaCorta(guardia.hora_fin),
    });
  }
  if (asignacion.tipo === 'ausencia') {
    const fecha = (valor) =>
      new Date(`${valor}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'numeric' });
    const uno = asignacion.cantidad === 1;
    const plantilla = asignacion.hasta
      ? uno ? t.asignaciones.reemplazo_un_turno : t.asignaciones.reemplazo
      : uno ? t.asignaciones.reemplazo_sin_fin_un_turno : t.asignaciones.reemplazo_sin_fin;
    return con(plantilla, {
      desde: fecha(asignacion.desde),
      hasta: asignacion.hasta ? fecha(asignacion.hasta) : '',
      n: asignacion.cantidad ?? 0,
    });
  }
  return `${guardia.fecha} · ${guardia.hora_inicio?.slice(0, 5)} - ${guardia.hora_fin?.slice(0, 5)}`;
}

function TarjetaDeAsignacion({ asignacion, motivos, onResponder, enCurso, t, locale }) {
  const [rechazando, setRechazando] = useState(false);
  const [motivoId, setMotivoId] = useState('');
  const [detalle, setDetalle] = useState('');
  const [faltas, setFaltas] = useState({});
  const refMotivo = useRef(null);
  const refDetalle = useRef(null);

  // Antes de responder se ve lo necesario para decidir: día, horario, barrio y nivel de
  // complejidad. El nombre del Paciente y el domicilio exacto aparecen en el turno, al aceptarlo.
  const guardia = asignacion.guardia;
  const barrios = guardia.barrios ?? [];
  const niveles = guardia.niveles_de_complejidad ?? [];
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
        {lineaDeArriba(asignacion, t, locale)}
      </div>
      {barrios.length > 0 && <div className="guardia-card-detalle">{barrios.join(' · ')}</div>}
      {niveles.length > 0 && (
        <div className="guardia-card-detalle">
          {t.asignaciones.nivel_complejidad}: {niveles.join(' · ')}
        </div>
      )}

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
  // Lo aceptado recién: `{ guardiaId }`. Un turno fijo o un reemplazo no tienen un único turno
  // al que llevarlo, así que ahí el aviso va sin enlace.
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
      if (resultado.respuesta === 'acepta') setAceptada({ guardiaId: resultado.guardiaId ?? null });
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
          {t.asignaciones.aceptada}
          {aceptada.guardiaId && (
            <>
              {' '}
              <Link to={`/guardias/${aceptada.guardiaId}`}>{t.asignaciones.ver_el_turno}</Link>
            </>
          )}
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
