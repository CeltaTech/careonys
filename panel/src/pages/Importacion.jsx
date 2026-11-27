import { useEffect, useState } from 'react';
import { useLocale } from '../i18n/LocaleContext';
import { usePermisos } from '../context/PermisosContext';
import { useAuth } from '../context/AuthContext';
import { usePuestaEnMarchaAlDia } from '../context/PuestaEnMarchaContext';
import { supabase } from '../lib/supabaseClient';
import { Button } from '../components/ui/Button';
import { FormField } from '../components/ui/FormField';
import { Alert } from '../components/ui/Alert';
import { Cabecera } from '../components/ui/Cabecera';
import { mensajeDeError, errorDeLaRespuesta } from '../lib/errores';
import { con } from '../lib/textos';
import { numeroConGuiones } from '../lib/documentoDeIdentidad';
import { tomarPlanillaAnalizada } from '../lib/planillaAnalizada';
import { esAdminOSuperior } from '../lib/roles';
import { useModalAccesible } from '../hooks/useModalAccesible';
import { NuevoAsistenteModal } from './asistentes/NuevoAsistenteModal';
import { NuevoServicioModal } from './servicios/NuevoServicioModal';
import { PedidosDeDatos } from './importacion/PedidosDeDatos';
import '../styles/molde-paginas.css';
import './importacion.css';

const API_URL = import.meta.env.VITE_API_URL;

async function llamarApi(path, opciones = {}) {
  const { data } = await supabase.auth.getSession();
  const respuesta = await fetch(`${API_URL}/api/panel/importacion${path}`, {
    ...opciones,
    headers: {
      Authorization: `Bearer ${data.session?.access_token}`,
      ...opciones.headers,
    },
  });
  const resultado = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) throw errorDeLaRespuesta(respuesta, resultado);
  return resultado;
}

// Qué se puede importar. Cada clase tiene su resumen y su lista de renglones no cargados.
const TIPOS = ['asistente', 'cliente', 'servicio'];

// Qué dice una fila del archivo en el campo que se le pide, con el mapeo ya revisado. Es la misma
// lectura que hace el backend (`valorDesdeFila`), para nombrar a la persona que no se cargó.
function valorDeLaFila(fila, mapeo, campo) {
  const columna = Object.keys(mapeo).find((col) => mapeo[col] === campo);
  const valor = columna ? fila?.[columna] : undefined;
  return valor === '' || valor == null ? '' : String(valor).trim();
}

function nombreDeLaFila(fila, mapeo, tipo) {
  if (tipo === 'asistente') return valorDeLaFila(fila, mapeo, 'nombre');
  const contacto = [valorDeLaFila(fila, mapeo, 'nombreContacto'), valorDeLaFila(fila, mapeo, 'apellidoContacto')]
    .filter(Boolean)
    .join(' ');
  return contacto || valorDeLaFila(fila, mapeo, 'nombrePaciente');
}

export function Importacion() {
  const modal = useModalAccesible(() => setConfirmandoRechazo(false));
  const modalCarga = useModalAccesible(() => setEligiendoCarga(false));
  const { t, locale } = useLocale();
  const { usuario } = useAuth();
  const { puede, cargado } = usePermisos();
  // Sin la configuración inicial completa no se importa gente: los botones se ven, apagados.
  const { cargaDeGenteBloqueada } = usePuestaEnMarchaAlDia();
  // La carga uno por uno usa los formularios de alta, con el mismo permiso que en sus pantallas.
  const esAdmin = esAdminOSuperior(usuario?.rol);
  const tiposUnoPorUno = [
    ...(esAdmin || puede('gestionar_asistentes') ? ['asistente'] : []),
    ...(esAdmin || puede('gestionar_servicios') ? ['cliente'] : []),
  ];

  const [tipo, setTipo] = useState('asistente');
  const [archivo, setArchivo] = useState(null);
  const [paso, setPaso] = useState(1);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);

  const [analisis, setAnalisis] = useState(null);
  const [mapeo, setMapeo] = useState({});
  const [resultado, setResultado] = useState(null);
  const [revision, setRevision] = useState(null);
  const [revisionFinal, setRevisionFinal] = useState(null);
  const [confirmandoRechazo, setConfirmandoRechazo] = useState(false);
  // La carga uno por uno: la ventana de elegir qué se carga, el lote abierto y su formulario.
  const [eligiendoCarga, setEligiendoCarga] = useState(false);
  const [abriendoLote, setAbriendoLote] = useState(false);
  const [loteManual, setLoteManual] = useState(null);
  const [formularioManual, setFormularioManual] = useState(false);

  // Si se llegó desde la guía de primeros pasos, la planilla ya fue leída allá: se arranca en
  // el paso de revisar el mapeo, sin volver a pedir el archivo ni a preguntarle a la IA por el
  // mismo contenido. Al entrar por el menú no hay nada guardado y la pantalla empieza de cero.
  useEffect(() => {
    const previa = tomarPlanillaAnalizada();
    if (!previa) return;
    setTipo(previa.tipo);
    setAnalisis(previa.analisis);
    setMapeo(previa.analisis.mapeoPropuesto);
    setPaso(2);
  }, []);

  if (cargado && !puede('importar_datos_masivos')) {
    return (
      <div>
        <Cabecera titulo={t.importacion.titulo} />
        <Alert variant="error">{t.comun.sin_permiso || t.comun.error_generico}</Alert>
      </div>
    );
  }

  async function handleAnalizar(e) {
    e.preventDefault();
    if (!archivo) {
      setError(t.importacion.falta_archivo);
      return;
    }
    setCargando(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('archivo', archivo);
      formData.append('tipo', tipo);
      const { data } = await supabase.auth.getSession();
      const respuesta = await fetch(`${API_URL}/api/panel/importacion/analizar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${data.session?.access_token}` },
        body: formData,
      });
      const resultadoJson = await respuesta.json().catch(() => ({}));
      if (!respuesta.ok) throw errorDeLaRespuesta(respuesta, resultadoJson);
      setAnalisis(resultadoJson);
      setMapeo(resultadoJson.mapeoPropuesto);
      setPaso(2);
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setCargando(false);
    }
  }

  async function handleConfirmar() {
    setCargando(true);
    setError(null);
    try {
      const resultadoJson = await llamarApi('/confirmar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo,
          filas: analisis.filas,
          mapeo,
          archivoNombre: analisis.archivoNombre,
        }),
      });
      setResultado(resultadoJson);
      setPaso(3);
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setCargando(false);
    }
  }

  // Cada fila que no se cargó llega con un motivo, que es un código, y no con el texto del error:
  // ese texto lo escribe la base y nombra tablas y columnas (`celtatech/CLAUDE.md` §6). La frase
  // la arma `mensajeDeError`, el mismo punto único que usa el resto del Panel, y cae en la frase
  // genérica si el motivo no tuviera traducción; el estado 500 es lo que hace de respaldo esa
  // caída. Una localidad ambigua trae además sus opciones, que se enumeran en el idioma de quien
  // mira, con «…» si había más de las que se mandaron.
  function motivoDe(e) {
    const frase = mensajeDeError({ motivo: e.motivo, status: 500 }, t, 'importación');
    if (!e.opciones?.length) return frase;
    const opciones = new Intl.ListFormat(locale, { type: 'disjunction' }).format(e.opciones);
    return con(frase, { opciones: e.hayMas ? `${opciones}…` : opciones });
  }

  const noCargados = TIPOS.includes(tipo) ? tipo : 'cliente';

  async function verRevision(importacionId) {
    setCargando(true);
    setError(null);
    try {
      const resultadoJson = await llamarApi(`/revision/${importacionId}`);
      setRevision(resultadoJson);
      setRevisionFinal(null);
      setPaso(4);
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setCargando(false);
    }
  }

  // Abre el lote de carga uno por uno del día, o recibe el que ya está abierto, y abre el
  // formulario de alta de lo elegido. Lo cargado pasa por la misma revisión que una planilla.
  async function abrirCargaManual(tipoDeCarga) {
    setAbriendoLote(true);
    setError(null);
    try {
      const { importacionId } = await llamarApi('/lote-manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: tipoDeCarga }),
      });
      setLoteManual({ tipo: tipoDeCarga, importacionId });
      setFormularioManual(true);
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setEligiendoCarga(false);
      setAbriendoLote(false);
    }
  }

  function alCrearManual() {
    setFormularioManual(false);
    setTipo(loteManual.tipo);
    setResultado({ importacionId: loteManual.importacionId, manual: true });
    verRevision(loteManual.importacionId);
  }

  async function handleConformar() {
    setCargando(true);
    setError(null);
    try {
      await llamarApi(`/conformar/${resultado.importacionId}`, { method: 'POST' });
      setRevisionFinal('conformada');
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setCargando(false);
    }
  }

  async function handleRechazar() {
    setConfirmandoRechazo(false);
    setCargando(true);
    setError(null);
    try {
      await llamarApi(`/rechazar/${resultado.importacionId}`, { method: 'POST' });
      setRevisionFinal('rechazada');
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setCargando(false);
    }
  }

  function handleReiniciar() {
    setPaso(1);
    setArchivo(null);
    setAnalisis(null);
    setMapeo({});
    setResultado(null);
    setRevision(null);
    setRevisionFinal(null);
    setLoteManual(null);
    setError(null);
  }

  // El lote de Servicios en curso nace confirmado: se mira, y no se conforma ni se rechaza.
  const loteDeServicios = revision?.lote?.tipo === 'servicio';

  return (
    <div>
      <Cabecera titulo={t.importacion.titulo}>
        {tiposUnoPorUno.length > 0 && (
          <Button
            variant="secondary"
            onClick={() => setEligiendoCarga(true)}
            disabled={cargando || abriendoLote || cargaDeGenteBloqueada}
          >
            {t.importacion.uno_por_uno.boton}
          </Button>
        )}
      </Cabecera>

      {error && <Alert variant="error">{error}</Alert>}

      {paso === 1 && (
        <div className="molde-pila">
          <section className="panel-tarjeta">
            <div className="panel-tarjeta-titulo">
              <h2>{t.importacion.paso1_titulo}</h2>
            </div>
            <form onSubmit={handleAnalizar}>
              <div className="molde-formgrid">
                <FormField label={t.importacion.paso1_tipo} name="tipo" type="select" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                  <option value="asistente">{t.importacion.tipo_asistente}</option>
                  <option value="cliente">{t.importacion.tipo_cliente}</option>
                  <option value="servicio">{t.importacion.tipo_servicio}</option>
                </FormField>
                <FormField
                  label={t.importacion.paso1_archivo}
                  name="archivo"
                  type="file"
                  onChange={(e) => setArchivo(e.target.files?.[0] || null)}
                />
              </div>
              <div className="molde-acciones">
                <Button type="submit" disabled={cargando || cargaDeGenteBloqueada}>
                  {cargando ? t.importacion.analizando : t.importacion.analizar}
                </Button>
              </div>
            </form>
          </section>
          <PedidosDeDatos soloSiHay />
        </div>
      )}

      {paso === 2 && analisis && (
        <div className="molde-pila">
          <section className="panel-tarjeta">
            <div className="panel-tarjeta-titulo">
              <h2>{t.importacion.paso2_titulo}</h2>
              <span className="panel-mini">{analisis.headers.length}</span>
            </div>

            {analisis.advertencias.length > 0 && (
              <Alert variant="info">
                <strong>{t.importacion.advertencias_titulo}</strong>
                <ul>
                  {analisis.advertencias.map((adv, i) => (
                    <li key={i}>{adv}</li>
                  ))}
                </ul>
              </Alert>
            )}

            <table className="panel-tabla">
              <thead>
                <tr>
                  <th>{t.importacion.col_archivo}</th>
                  <th>{t.importacion.col_campo}</th>
                </tr>
              </thead>
              <tbody>
                {analisis.headers.map((columna) => (
                  <tr key={columna}>
                    <td><b>{columna}</b></td>
                    <td>
                      <div className="molde-campo">
                        <select
                          value={mapeo[columna] || ''}
                          onChange={(e) => setMapeo({ ...mapeo, [columna]: e.target.value || null })}
                          aria-label={con(t.importacion.campo_de_columna, { columna })}
                        >
                          <option value="">{t.importacion.campo_ninguno}</option>
                          {analisis.camposDisponibles.map((campo) => (
                            <option key={campo} value={campo}>
                              {t.importacion[`campo_${campo}`] || campo}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="panel-tarjeta">
            <div className="panel-tarjeta-titulo">
              <h2>{t.importacion.vista_previa_titulo}</h2>
            </div>
            <div className="importacion-desplazable">
              <table className="panel-tabla">
                <thead>
                  <tr>
                    {analisis.headers.map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {analisis.filas.slice(0, 5).map((fila, i) => (
                    <tr key={i}>
                      {analisis.headers.map((h) => (
                        <td key={h}>{String(fila[h])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="molde-acciones">
              <Button variant="secondary" onClick={handleReiniciar} disabled={cargando}>
                {t.importacion.volver}
              </Button>
              <Button onClick={handleConfirmar} disabled={cargando || cargaDeGenteBloqueada}>
                {cargando ? t.importacion.confirmando : t.importacion.confirmar}
              </Button>
            </div>
          </section>
        </div>
      )}

      {paso === 3 && resultado && (
        <div className="molde-pila">
          <section className="panel-tarjeta">
            <div className="panel-tarjeta-titulo">
              <h2>{t.importacion.paso3_titulo}</h2>
            </div>
            <Alert variant={resultado.filasError > 0 ? 'info' : 'success'}>
              {con(t.importacion[`resumen_${noCargados}`], {
                creadas: resultado.filasCreadas,
                total: resultado.filasTotales,
              })}
            </Alert>

            {resultado.vinculadas?.length > 0 && (
              <Alert variant="info">
                <ul>
                  {resultado.vinculadas.map((v) => (
                    <li key={v.fila}>
                      {t.importacion.vinculada
                        .replace('{documento}', numeroConGuiones(v.documento))
                        .replace('{numero}', v.numeroCliente)}
                    </li>
                  ))}
                </ul>
              </Alert>
            )}

            {resultado.yaEstaban?.length > 0 && (
              <Alert variant="info">
                {con(t.importacion.ya_estaban, { n: resultado.yaEstaban.length })}
              </Alert>
            )}

            {resultado.errores?.length > 0 && (
              <Alert variant="error">
                <strong>{t.importacion[`no_cargados_${noCargados}`]}</strong>
                <ul>
                  {resultado.errores.map((e) => {
                    const nombre = nombreDeLaFila(analisis.filas[e.fila - 1], mapeo, tipo);
                    return (
                      <li key={e.fila}>
                        {nombre ? con(t.importacion.no_cargado, { nombre, error: motivoDe(e) }) : motivoDe(e)}
                      </li>
                    );
                  })}
                </ul>
              </Alert>
            )}

            <div className="molde-acciones">
              <Button variant="secondary" onClick={handleReiniciar} disabled={cargando}>
                {t.importacion.nueva_importacion}
              </Button>
              {resultado.filasCreadas > 0 && (
                <Button onClick={() => verRevision(resultado.importacionId)} disabled={cargando}>
                  {cargando
                    ? t.importacion.cargando_revision
                    : tipo === 'servicio' ? t.importacion.ver_resultado : t.importacion.revisar_resultado}
                </Button>
              )}
            </div>
          </section>
          {resultado.pedidosAbiertos > 0 && <PedidosDeDatos importacionId={resultado.importacionId} />}
        </div>
      )}

      {paso === 4 && revision && (
        <section className="panel-tarjeta">
          <div className="panel-tarjeta-titulo">
            <h2>{loteDeServicios ? t.importacion.paso4_titulo_servicio : t.importacion.paso4_titulo}</h2>
          </div>

          {revisionFinal === 'conformada' && <Alert variant="success">{t.importacion.conformidad_exito}</Alert>}
          {revisionFinal === 'rechazada' && <Alert variant="info">{t.importacion.rechazo_exito}</Alert>}

          {!revisionFinal && (
            <div className="importacion-desplazable">
              <table className="panel-tabla">
                <thead>
                  <tr>
                    {revision.lote.tipo === 'asistente' ? (
                      <>
                        <th>{t.importacion.campo_nombre}</th>
                        <th>{t.importacion.campo_dni}</th>
                        <th>{t.importacion.campo_email}</th>
                        <th>{t.importacion.campo_telefono}</th>
                      </>
                    ) : (
                      <>
                        <th>{t.importacion.campo_nombrePaciente}</th>
                        <th>{t.importacion.campo_domicilioPaciente}</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {revision.filas.map((fila) => (
                    revision.lote.tipo === 'asistente' ? (
                      <tr key={fila.id}>
                        <td><b>{fila.nombre}</b></td>
                        <td>{fila.dni}</td>
                        <td>{fila.email}</td>
                        <td>{fila.telefono}</td>
                      </tr>
                    ) : (
                      (fila.pacientes || []).map((paciente) => (
                        <tr key={paciente.id}>
                          <td><b>{paciente.nombre}</b></td>
                          <td>{paciente.domicilio}</td>
                        </tr>
                      ))
                    )
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="molde-acciones">
            {resultado?.manual && !revisionFinal && (
              <Button variant="secondary" onClick={() => setFormularioManual(true)} disabled={cargando}>
                {t.importacion.uno_por_uno.otro}
              </Button>
            )}
            {loteDeServicios && (
              <Button onClick={handleReiniciar}>{t.importacion.nueva_importacion}</Button>
            )}
            {!revisionFinal && !loteDeServicios && (
              <>
                <Button variant="secondary" onClick={() => setConfirmandoRechazo(true)} disabled={cargando}>
                  {cargando ? t.importacion.rechazando : t.importacion.rechazar}
                </Button>
                <Button onClick={handleConformar} disabled={cargando}>
                  {cargando ? t.importacion.conformando : t.importacion.conformar}
                </Button>
              </>
            )}
            {revisionFinal && (
              <Button onClick={handleReiniciar}>{t.importacion.nueva_importacion}</Button>
            )}
          </div>

          {confirmandoRechazo && (
            <div className="panel-modal-fondo" onClick={() => setConfirmandoRechazo(false)}>
              <div className="panel-modal" onClick={(e) => e.stopPropagation()} {...modal.props}>
                <h2 id={modal.idTitulo}>{t.importacion.rechazar}</h2>
                <p>{t.importacion.confirmar_rechazo}</p>
                <div className="panel-modal-acciones">
                  <Button variant="secondary" onClick={() => setConfirmandoRechazo(false)} disabled={cargando}>
                    {t.comun.cancelar}
                  </Button>
                  <Button onClick={handleRechazar} disabled={cargando}>
                    {cargando ? t.importacion.rechazando : t.importacion.rechazar}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {eligiendoCarga && (
        <div className="panel-modal-fondo" onClick={() => setEligiendoCarga(false)}>
          <div className="panel-modal" onClick={(e) => e.stopPropagation()} {...modalCarga.props}>
            <h2 id={modalCarga.idTitulo}>{t.importacion.uno_por_uno.boton}</h2>
            <div className="panel-modal-acciones">
              <Button variant="secondary" onClick={() => setEligiendoCarga(false)} disabled={abriendoLote}>
                {t.comun.cancelar}
              </Button>
              {tiposUnoPorUno.map((tipoDeCarga) => (
                <Button key={tipoDeCarga} onClick={() => abrirCargaManual(tipoDeCarga)} disabled={abriendoLote}>
                  {t.importacion.uno_por_uno[tipoDeCarga]}
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}

      {formularioManual && loteManual?.tipo === 'asistente' && (
        <NuevoAsistenteModal
          importacionId={loteManual.importacionId}
          onClose={() => setFormularioManual(false)}
          onCreado={alCrearManual}
        />
      )}
      {formularioManual && loteManual?.tipo === 'cliente' && (
        <NuevoServicioModal
          importacionId={loteManual.importacionId}
          onClose={() => setFormularioManual(false)}
          onCreado={alCrearManual}
        />
      )}
    </div>
  );
}
