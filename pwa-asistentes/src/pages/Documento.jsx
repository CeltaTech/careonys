import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useLocale } from '../i18n/LocaleContext';
import { con } from '../lib/textos';
import { mensajeDeError, situacionDelError } from '../lib/errores';
import { avisar } from '../lib/mensajeEmergente';
import { useSeVe } from '../context/PerfilContext';
import { campoDeFecha, estadoVisible, fechaYaNoValida } from '../lib/documentos';
import { EstadoDelDocumento } from './Documentos';

// ============================================================================
// Un documento, abierto: lo que la Prestadora dijo de él y, si ella lo permite,
// el envío desde el teléfono.
//
// LO QUE SE VE SIEMPRE: el estado, el motivo si lo observaron, los requisitos y
// el enlace para obtenerlo. Eso no depende de quién lo carga: si un documento lo
// frena para trabajar, tiene derecho a saber qué le falta.
//
// LO QUE DEPENDE DE LA PRESTADORA: el formulario. Con la opción «Cargar sus
// documentos desde el teléfono» apagada, no se dibuja. El backend dice lo mismo
// en `puede_cargar` y es el que manda: rechaza el envío si está apagada.
//
// EL FORMULARIO NO REGAÑA ANTES DE TIEMPO. Los textos al pie de cada campo
// aparecen al apretar «Enviar», todos a la vez, y la pantalla salta al primero.
// Desaparecen en cuanto el dato se completa.
// ============================================================================

export default function Documento() {
  const { tipoId } = useParams();
  const { t, locale } = useLocale();
  const td = t.documentos;
  const seVe = useSeVe();

  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [noEncontrado, setNoEncontrado] = useState(false);
  const [cargando, setCargando] = useState(true);

  const [organismoId, setOrganismoId] = useState('');
  const [fecha, setFecha] = useState('');
  const [numero, setNumero] = useState('');
  const [archivo, setArchivo] = useState(null);
  const [intentado, setIntentado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState('');
  // La fecha después de la cual tiene que estar emitido, cuando el backend contestó que el
  // documento ya no es válido. Se va en cuanto la persona cambia la fecha.
  const [vencidoSegunServidor, setVencidoSegunServidor] = useState(null);
  const refs = { organismo: useRef(null), fecha: useRef(null), numero: useRef(null), archivo: useRef(null) };

  function cargar() {
    setCargando(true);
    setError('');
    setNoEncontrado(false);
    return api
      .tipoDeDocumento(tipoId)
      .then(setDatos)
      .catch((e) => {
        if (situacionDelError(e) === 'no_encontrado') setNoEncontrado(true);
        else setError(mensajeDeError(e, t, 'documento'));
      })
      .finally(() => setCargando(false));
  }

  useEffect(() => {
    cargar();
  }, [tipoId]);

  const volver = (
    <Link to="/documentos" className="btn btn-volver">
      <span aria-hidden="true">←</span> {t.comun.volver}
    </Link>
  );

  if (cargando && !datos) {
    return (
      <div>
        {volver}
        <div className="estado-cargando" role="status">{t.comun.cargando}</div>
      </div>
    );
  }

  if (error && !datos) {
    return (
      <div>
        {volver}
        <div className="alert alert-error" role="alert">
          {error}
          <button type="button" className="btn" onClick={cargar}>{t.comun.reintentar}</button>
        </div>
      </div>
    );
  }

  const documento = datos;
  if (noEncontrado || !documento) {
    return (
      <div>
        {volver}
        <div className="estado-vacio" role="status">{td.no_encontrado}</div>
      </div>
    );
  }

  const estado = estadoVisible(documento);
  const puedeCargar = seVe('asistente_carga_sus_documentos') && documento.puede_cargar === true;
  const organismos = documento.organismos ?? [];
  const unSoloOrganismo = organismos.length === 1 ? organismos[0] : null;
  const pideFecha = campoDeFecha(documento);
  const organismoElegido = unSoloOrganismo ? unSoloOrganismo.id : organismoId;

  function aDia(dia) {
    return new Date(`${dia}T00:00:00`).toLocaleDateString(locale);
  }

  // Lo que está mal, campo por campo. Se calcula siempre y se muestra sólo después del primer
  // intento: así el texto se va solo en cuanto el dato se completa.
  const vencidaEl = fecha ? fechaYaNoValida(documento, fecha) ?? vencidoSegunServidor : null;
  const errores = {
    organismo: organismos.length > 1 && !organismoElegido ? td.campo_obligatorio : '',
    fecha: pideFecha.obligatoria && !fecha ? td.campo_obligatorio : vencidaEl ? con(td.ya_no_valido, { fecha: aDia(vencidaEl) }) : '',
    numero: documento.lleva_numero && !numero.trim() ? td.campo_obligatorio : '',
    archivo: !archivo ? td.campo_obligatorio : '',
  };
  const visibles = intentado ? errores : {};

  async function enviar(evento) {
    evento.preventDefault();
    setIntentado(true);
    setErrorEnvio('');
    const primero = ['organismo', 'fecha', 'numero', 'archivo'].find((campo) => errores[campo]);
    if (primero) {
      refs[primero].current?.focus();
      return;
    }
    setEnviando(true);
    try {
      await api.enviarDocumento(documento.tipo_documento_id, {
        organismoId: organismoElegido || undefined,
        [pideFecha.campo === 'fecha_vencimiento' ? 'fechaVencimiento' : 'fechaEmision']: fecha || undefined,
        numero: documento.lleva_numero ? numero.trim() : undefined,
        archivo,
      });
      avisar(td.enviado);
      setOrganismoId('');
      setFecha('');
      setNumero('');
      setArchivo(null);
      setIntentado(false);
      setVencidoSegunServidor(null);
      if (refs.archivo.current) refs.archivo.current.value = '';
      await cargar();
    } catch (err) {
      if (err?.motivo === 'documento_ya_vencido' && err.fecha) {
        setVencidoSegunServidor(String(err.fecha).slice(0, 10));
        refs.fecha.current?.focus();
        return;
      }
      // Lo que el Asistente puede arreglar —la sesión, la conexión, un motivo con nombre— se le
      // dice con su frase. Lo demás, con la frase aprobada para este envío.
      const situacion = situacionDelError(err);
      const motivo = err?.motivo && t.errores?.motivos && err.motivo in t.errores.motivos;
      setErrorEnvio(
        motivo || ['sin_conexion', 'sesion_vencida', 'sin_permiso'].includes(situacion)
          ? mensajeDeError(err, t, 'enviar documento')
          : td.no_se_pudo_enviar
      );
    } finally {
      setEnviando(false);
    }
  }

  function pie(campo) {
    return visibles[campo] ? (
      <div id={`documento-${campo}-error`} className="form-error">{visibles[campo]}</div>
    ) : null;
  }

  function atributos(campo) {
    return visibles[campo]
      ? { 'aria-invalid': true, 'aria-describedby': `documento-${campo}-error` }
      : {};
  }

  return (
    <div>
      {volver}
      <h1>{documento.nombre}</h1>

      <section className="pwa-card">
        <EstadoDelDocumento estado={estado} t={t} />

        {estado === 'observado' && documento.motivo_observacion && (
          <div className="pwa-card-dato">
            <strong>{td.motivo}</strong>
            <p className="texto-con-renglones">{documento.motivo_observacion}</p>
          </div>
        )}

        {documento.requisitos && (
          <div className="pwa-card-dato">
            <strong>{td.requisitos}</strong>
            <p className="texto-con-renglones">{documento.requisitos}</p>
          </div>
        )}

        {documento.enlace_para_obtenerlo && (
          <div className="pwa-card-dato">
            <a href={documento.enlace_para_obtenerlo} target="_blank" rel="noopener noreferrer">
              {td.enlace_para_obtenerlo}
            </a>
          </div>
        )}
      </section>

      {puedeCargar && (
        <form className="tarjeta-consentimiento" onSubmit={enviar} noValidate>
          {organismos.length > 0 && (
            <div className="form-field">
              <label htmlFor="documento-organismo">{td.otorgado_por}</label>
              {unSoloOrganismo ? (
                <input id="documento-organismo" type="text" value={unSoloOrganismo.nombre} readOnly />
              ) : (
                <select
                  id="documento-organismo"
                  ref={refs.organismo}
                  value={organismoId}
                  onChange={(e) => setOrganismoId(e.target.value)}
                  disabled={enviando}
                  {...atributos('organismo')}
                >
                  <option value="">{td.seleccionar}</option>
                  {organismos.map((o) => (
                    <option key={o.id} value={o.id}>{o.nombre}</option>
                  ))}
                </select>
              )}
              {pie('organismo')}
            </div>
          )}

          <div className="form-field">
            <label htmlFor="documento-fecha">
              {pideFecha.campo === 'fecha_vencimiento' ? td.fecha_vencimiento : td.fecha_emision}
              {!pideFecha.obligatoria && ` ${td.opcional}`}
            </label>
            <input
              id="documento-fecha"
              ref={refs.fecha}
              type="date"
              value={fecha}
              onChange={(e) => {
                setFecha(e.target.value);
                setVencidoSegunServidor(null);
              }}
              disabled={enviando}
              {...atributos('fecha')}
            />
            {pie('fecha')}
          </div>

          {documento.lleva_numero && (
            <div className="form-field">
              <label htmlFor="documento-numero">{td.numero}</label>
              <input
                id="documento-numero"
                ref={refs.numero}
                type="text"
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
                maxLength={64}
                disabled={enviando}
                {...atributos('numero')}
              />
              {pie('numero')}
            </div>
          )}

          <div className="form-field">
            <label htmlFor="documento-archivo">{td.archivo}</label>
            <input
              id="documento-archivo"
              ref={refs.archivo}
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
              disabled={enviando}
              {...atributos('archivo')}
            />
            {pie('archivo')}
          </div>

          {errorEnvio && <div className="alert alert-error" role="alert">{errorEnvio}</div>}

          <button type="submit" className="btn btn-primary btn-full" disabled={enviando}>
            {enviando ? td.enviando : td.enviar}
          </button>
        </form>
      )}
    </div>
  );
}
