import { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useLocale } from '../i18n/LocaleContext';
import { useSeVe } from '../context/PerfilContext';
import { usePersonasAutorizadas } from '../context/PersonasAutorizadasContext';
import { mensajeDeError } from '../lib/errores';
import { con } from '../lib/textos';
import { nombreTipo } from '../lib/tipoDeAsistente';
import {
  esteAparatoGuardaLlaves,
  firmarConLaLlaveDelAparato,
  guardarLaLlaveEnEsteAparato,
  loCancelaronAMano,
} from '../lib/llaveDelDispositivo';

const ESTADO_CLASE = {
  pendiente: 'badge-amarilla',
  aceptada: 'badge-verde',
  rechazada: 'badge-roja',
  finalizada: '',
};

// Los cinco que hay que completar sí o sí. Están acá y no repartidos por el formulario para
// que la advertencia general de arriba y la que se cuelga de cada campo digan siempre lo mismo.
const CAMPOS_OBLIGATORIOS = ['medicamento', 'dosis', 'frecuencia', 'via', 'fecha_desde'];

// Un campo del formulario, con su etiqueta atada al control (`htmlFor`/`id`) y, cuando falta
// completarlo, la advertencia colgada del propio campo (`aria-describedby` + `aria-invalid`).
function Campo({ nombre, etiqueta, tipo = 'text', valor, alCambiar, accept, error, children }) {
  const idCampo = `medicacion-${nombre}`;
  const idError = `${idCampo}-error`;
  const comunes = {
    id: idCampo,
    onChange: alCambiar,
    'aria-invalid': error ? 'true' : undefined,
    'aria-describedby': error ? idError : undefined,
  };
  return (
    <div className="form-field">
      <label htmlFor={idCampo}>{etiqueta}</label>
      {children ? (
        <select {...comunes} value={valor}>{children}</select>
      ) : (
        // El campo de archivo no lleva valor escrito: lo maneja el navegador.
        <input {...comunes} type={tipo} accept={accept} value={tipo === 'file' ? undefined : valor} />
      )}
      {error && <span className="form-error" id={idError}>{error}</span>}
    </div>
  );
}

// Quiénes pueden dar la medicación por esa vía, dicho en una frase.
function quienesPuedenDarla(t, viaClave, tipos) {
  return con(t.medicacion.quienes_pueden_dar_la_via, {
    via: (t.medicacion.vias[viaClave] || '').toLowerCase(),
    tipos: tipos.map((tipo) => nombreTipo(tipo, t)).join(', '),
  });
}

const VACIO = { medicamento: '', dosis: '', frecuencia: '', via: '', fecha_desde: '', fecha_hasta: '' };

export default function Medicacion() {
  const { id } = useParams();
  const { t, locale } = useLocale();
  const seVe = useSeVe();
  const { puedeVer } = usePersonasAutorizadas();
  // Ver la medicación y pedir una son dos decisiones distintas de la Prestadora, y del lado del
  // titular otras dos para cada persona autorizada. Que se vea la lista ya lo decidió la ruta.
  const puedePedir = seVe('cliente_pide_medicacion') && puedeVer('persona_autorizada_pide_medicacion');
  const puedePedirMedicacion = seVe('cliente_pide_medicacion');

  const [indicaciones, setIndicaciones] = useState(undefined);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [exito, setExito] = useState(false);
  const [valores, setValores] = useState(VACIO);
  const [archivo, setArchivo] = useState(null);
  const [faltantes, setFaltantes] = useState([]);
  const [abriendo, setAbriendo] = useState(null);

  // Lo que el formulario necesita antes de poder usarse: las vías y el texto a aceptar.
  const [vias, setVias] = useState(undefined);
  const [consentimiento, setConsentimiento] = useState(undefined);
  const [errorFormulario, setErrorFormulario] = useState('');
  const [tiposDeLaVia, setTiposDeLaVia] = useState([]);

  // La firma: la del teléfono, o la decisión de firmar en papel.
  const [guardaLlaves, setGuardaLlaves] = useState(false);
  const [firmaApp, setFirmaApp] = useState(null);
  const [firmando, setFirmando] = useState(false);
  const [enPapel, setEnPapel] = useState(false);

  const cargar = useCallback(() => {
    api
      .indicacionesMedicacion(id)
      .then((data) => setIndicaciones(data.indicaciones))
      .catch((e) => setError(mensajeDeError(e, t, 'indicaciones de medicación')));
  }, [id]);

  useEffect(() => {
    setIndicaciones(undefined);
    cargar();
  }, [cargar]);

  useEffect(() => {
    if (!puedePedir) return;
    esteAparatoGuardaLlaves().then(setGuardaLlaves);
    Promise.all([api.viasDeMedicacion(), api.consentimientoDeMedicacion(locale)])
      .then(([v, c]) => {
        setVias(v.vias);
        setConsentimiento(c);
      })
      .catch((e) => setErrorFormulario(mensajeDeError(e, t, 'formulario de medicación')));
  }, [puedePedir, locale]);

  // Elegida la vía, se dice enseguida quién la puede dar.
  useEffect(() => {
    setTiposDeLaVia([]);
    if (!valores.via) return;
    let vigente = true;
    api
      .tiposQuePuedenDarLaVia(valores.via)
      .then((data) => vigente && setTiposDeLaVia(data.tipos))
      .catch(() => {});
    return () => {
      vigente = false;
    };
  }, [valores.via]);

  const pideFirma = consentimiento?.pideFirma === true;
  const viaElegida = vias?.find((v) => v.id === valores.via);

  // Lo que se firmó fue esto que está escrito: si algo cambia, la firma ya no vale.
  function cambiar(campo, valor) {
    setValores((antes) => ({ ...antes, [campo]: valor }));
    setFirmaApp(null);
    if (faltantes.includes(campo) && valor) setFaltantes((f) => f.filter((x) => x !== campo));
  }

  const faltaEn = (campo) => (faltantes.includes(campo) ? t.comun.campo_obligatorio : undefined);

  function revisarCompletos() {
    const sinCompletar = CAMPOS_OBLIGATORIOS.filter((campo) => !valores[campo]);
    setFaltantes(sinCompletar);
    if (sinCompletar.length > 0) {
      setError(t.medicacion.error_campos_obligatorios);
      document.getElementById(`medicacion-${sinCompletar[0]}`)?.focus();
      return false;
    }
    return true;
  }

  async function alMarcar(e) {
    setError('');
    if (!e.target.checked) {
      setFirmaApp(null);
      return;
    }
    setEnPapel(false);
    setFirmando(true);
    try {
      let firma;
      try {
        firma = await firmarConLaLlaveDelAparato(api.desafioDeFirma);
      } catch (sinLlave) {
        // Sin llave en este teléfono, el propio teléfono ofrece guardarla y después se firma.
        if (sinLlave?.motivo !== 'sin_llave') throw sinLlave;
        await guardarLaLlaveEnEsteAparato({ desafio: api.desafioDeLlave, guardar: api.guardarLlave });
        firma = await firmarConLaLlaveDelAparato(api.desafioDeFirma);
      }
      setFirmaApp(firma);
    } catch (fallo) {
      setFirmaApp(null);
      if (!loCancelaronAMano(fallo)) setError(mensajeDeError(fallo, t, 'firmar la indicación'));
    } finally {
      setFirmando(false);
    }
  }

  function elegirPapel() {
    setError('');
    setFirmaApp(null);
    setEnPapel(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setExito(false);
    if (!revisarCompletos()) return;
    if (pideFirma && !firmaApp && !enPapel) return;
    setEnviando(true);
    try {
      const formData = new FormData();
      formData.append('medicamento', valores.medicamento);
      formData.append('dosis', valores.dosis);
      formData.append('frecuencia', valores.frecuencia);
      formData.append('via_administracion_id', valores.via);
      formData.append('fecha_desde', valores.fecha_desde);
      if (valores.fecha_hasta) formData.append('fecha_hasta', valores.fecha_hasta);
      if (archivo) formData.append('prescripcion', archivo);
      if (pideFirma) {
        formData.append('idioma', consentimiento.idioma || locale);
        if (firmaApp) {
          formData.append('firma', 'app');
          formData.append('respuesta', JSON.stringify(firmaApp));
        } else {
          formData.append('firma', 'papel');
        }
      }
      await api.crearIndicacionMedicacion(id, formData);
      setValores(VACIO);
      setArchivo(null);
      setFaltantes([]);
      setFirmaApp(null);
      setEnPapel(false);
      setExito(true);
      cargar();
    } catch (fallo) {
      setFirmaApp(null);
      setError(mensajeDeError(fallo, t, 'pedir medicación'));
    } finally {
      setEnviando(false);
    }
  }

  async function verPapelFirmado(indicacionId) {
    setAbriendo(indicacionId);
    try {
      const { url } = await api.papelFirmadoDeMedicacion(indicacionId);
      window.open(url, '_blank', 'noopener');
    } catch (fallo) {
      setError(mensajeDeError(fallo, t, 'papel firmado'));
    } finally {
      setAbriendo(null);
    }
  }

  const listoParaEnviar = !pideFirma || firmaApp || enPapel;

  return (
    <>
      <Link to={`/pacientes/${id}`} className="btn btn-volver">
        {t.comun.volver}
      </Link>

      <h1>{t.medicacion.titulo}</h1>

      {error && <div className="alert alert-error" role="alert">{error}</div>}

      {indicaciones === undefined && <div className="estado-cargando" role="status">{t.comun.cargando}</div>}

      {indicaciones !== undefined && (
        <>
          {indicaciones.length === 0 && <div className="pwa-card estado-vacio" role="status">{t.medicacion.sin_indicaciones}</div>}
          {indicaciones.map((ind) => (
            <section key={ind.id} className="pwa-card">
              <h2>{ind.medicamento}</h2>
              <div className="pwa-card-dato">
                {ind.dosis} — {ind.frecuencia}
                {ind.via_clave ? ` (${t.medicacion.vias[ind.via_clave]})` : ''}
              </div>
              <div className="mini mini-abajo">
                {t.medicacion.desde}: {ind.fecha_desde} {ind.fecha_hasta ? `— ${t.medicacion.hasta}: ${ind.fecha_hasta}` : ''}
              </div>
              {ind.tipos?.length > 0 && (
                <div className="mini mini-abajo">{quienesPuedenDarla(t, ind.via_clave, ind.tipos)}</div>
              )}
              {ind.estado === 'rechazada' && (ind.motivo_rechazo_clave || ind.motivo_rechazo) && (
                <div className="pwa-card-dato">
                  {t.medicacion.motivo_rechazo}:{' '}
                  {ind.motivo_rechazo_clave ? t.medicacion[`motivo_${ind.motivo_rechazo_clave}`] : ind.motivo_rechazo}
                </div>
              )}
              <div className="pwa-card-pie">
                <span className={`badge ${ESTADO_CLASE[ind.estado] || ''}`}>{t.medicacion[`estado_${ind.estado}`]}</span>
                {ind.firma === 'pendiente_firma' && <span className="badge badge-amarilla">{t.medicacion.falta_la_firma}</span>}
                {ind.papel_firmado && (
                  <button type="button" className="btn" onClick={() => verPapelFirmado(ind.id)} disabled={abriendo === ind.id}>
                    {t.medicacion.ver_papel_firmado}
                  </button>
                )}
              </div>
            </section>
          ))}
        </>
      )}

      {puedePedirMedicacion && (
        <section className="pwa-card">
          <h2>{t.medicacion.nueva_titulo}</h2>

          {!puedePedir && <div className="alert" role="status">{t.medicacion.sin_acceso_pedir}</div>}

          {puedePedir && errorFormulario && <div className="alert alert-error" role="alert">{errorFormulario}</div>}

          {puedePedir && !errorFormulario && (vias === undefined || consentimiento === undefined) && (
            <div className="estado-cargando" role="status">{t.comun.cargando}</div>
          )}

          {puedePedir && vias !== undefined && consentimiento !== undefined && (
            <form onSubmit={handleSubmit} noValidate>
              <Campo
                nombre="medicamento"
                etiqueta={t.medicacion.campo_medicamento}
                valor={valores.medicamento}
                alCambiar={(e) => cambiar('medicamento', e.target.value)}
                error={faltaEn('medicamento')}
              />
              <Campo
                nombre="dosis"
                etiqueta={t.medicacion.campo_dosis}
                valor={valores.dosis}
                alCambiar={(e) => cambiar('dosis', e.target.value)}
                error={faltaEn('dosis')}
              />
              <Campo
                nombre="frecuencia"
                etiqueta={t.medicacion.campo_frecuencia}
                valor={valores.frecuencia}
                alCambiar={(e) => cambiar('frecuencia', e.target.value)}
                error={faltaEn('frecuencia')}
              />
              <Campo
                nombre="via"
                etiqueta={t.medicacion.campo_via}
                valor={valores.via}
                alCambiar={(e) => cambiar('via', e.target.value)}
                error={faltaEn('via')}
              >
                <option value="" />
                {vias.map((v) => (
                  <option key={v.id} value={v.id}>{t.medicacion.vias[v.clave]}</option>
                ))}
              </Campo>
              {viaElegida && tiposDeLaVia.length > 0 && (
                <div className="alert alert-info" role="status">{quienesPuedenDarla(t, viaElegida.clave, tiposDeLaVia)}</div>
              )}
              <Campo
                nombre="fecha_desde"
                etiqueta={t.medicacion.campo_fecha_desde}
                tipo="date"
                valor={valores.fecha_desde}
                alCambiar={(e) => cambiar('fecha_desde', e.target.value)}
                error={faltaEn('fecha_desde')}
              />
              <Campo
                nombre="fecha_hasta"
                etiqueta={t.medicacion.campo_fecha_hasta}
                tipo="date"
                valor={valores.fecha_hasta}
                alCambiar={(e) => cambiar('fecha_hasta', e.target.value)}
              />
              <Campo
                nombre="prescripcion"
                etiqueta={t.medicacion.campo_prescripcion}
                tipo="file"
                accept="application/pdf,image/jpeg,image/png"
                alCambiar={(e) => {
                  setArchivo(e.target.files?.[0] || null);
                  setFirmaApp(null);
                }}
              />

              {pideFirma && (
                <>
                  <div className="texto-a-aceptar">{consentimiento.texto}</div>
                  {guardaLlaves && (
                    <label className="casilla">
                      <input type="checkbox" checked={!!firmaApp} onChange={alMarcar} disabled={firmando || enviando} />
                      <span>{t.medicacion.acepto_terminos}</span>
                    </label>
                  )}
                  <button type="button" className="btn btn-full" onClick={elegirPapel} disabled={enviando || enPapel}>
                    {t.medicacion.aceptar_con_firma_holografa}
                  </button>
                  {enPapel && <div className="alert alert-info" role="status">{t.medicacion.aviso_firma_holografa}</div>}
                </>
              )}

              {exito && <div className="alert alert-success" role="status">{t.medicacion.enviada_exito}</div>}

              <button type="submit" className="btn btn-primary btn-full btn-abajo" disabled={enviando || firmando || !listoParaEnviar}>
                {enviando ? t.medicacion.enviando : t.medicacion.enviar}
              </button>
            </form>
          )}
        </section>
      )}
    </>
  );
}
