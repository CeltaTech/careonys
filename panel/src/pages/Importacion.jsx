import { useEffect, useState } from 'react';
import { useLocale } from '../i18n/LocaleContext';
import { usePermisos } from '../context/PermisosContext';
import { useAuth } from '../context/AuthContext';
import { usePuestaEnMarchaAlDia } from '../context/PuestaEnMarchaContext';
import { Button } from '../components/ui/Button';
import { FormField } from '../components/ui/FormField';
import { Alert } from '../components/ui/Alert';
import { Cabecera } from '../components/ui/Cabecera';
import { mensajeDeError } from '../lib/errores';
import { con } from '../lib/textos';
import { numeroConGuiones } from '../lib/documentoDeIdentidad';
import { tomarPlanillaAnalizada } from '../lib/planillaAnalizada';
import { esAdminDePrestadora, esAdminOSuperior } from '../lib/roles';
import {
  TIPOS_CON_REVISION,
  TIPOS_DE_IMPORTACION,
  asignacionesPropuestas,
  clasesPropuestas,
  formularioDeAnalisis,
  formularioDeConfirmacion,
  hayOrigen,
  hojasDelAnalisis,
  llamarApiImportacion as llamarApi,
  nombreDeLaFila,
  renglonDelError,
} from '../lib/importacion';
import { usePersonasParaElegir } from '../hooks/usePersonasParaElegir';
import { useModalAccesible } from '../hooks/useModalAccesible';
import { NuevoAsistenteModal } from './asistentes/NuevoAsistenteModal';
import { NuevoServicioModal } from './servicios/NuevoServicioModal';
import { PedidosDeDatos } from './importacion/PedidosDeDatos';
import { HojaDeImportacion } from './importacion/HojaDeImportacion';
import { LotesImportados } from './importacion/LotesImportados';
import { ListaDeAdvertencias } from './importacion/ListaDeAdvertencias';
import '../styles/molde-paginas.css';
import './importacion.css';

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
  // Lo que se manda a analizar: un archivo de cualquier formato, o un texto pegado.
  const [archivo, setArchivo] = useState(null);
  const [texto, setTexto] = useState('');
  const [origen, setOrigen] = useState(null);
  const [intentado, setIntentado] = useState(false);
  const [paso, setPaso] = useState(1);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);

  const [analisis, setAnalisis] = useState(null);
  // Una asignación de columnas por hoja, y en la Historia anterior la clase de cada hoja.
  const [asignaciones, setAsignaciones] = useState({});
  const [clases, setClases] = useState({});
  // El documento suelto se carga en la Historia anterior del Paciente que se elige.
  const [pacienteId, setPacienteId] = useState('');
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
  // El original viaja con la planilla, porque la confirmación lo vuelve a mandar; sin él se
  // arranca en el primer paso con la clase ya elegida.
  useEffect(() => {
    const previa = tomarPlanillaAnalizada();
    if (!previa) return;
    setTipo(previa.tipo);
    if (!previa.origen || !previa.analisis) return;
    tomarAnalisis(previa.analisis, previa.origen);
  }, []);

  const esAdministrador = esAdminDePrestadora(usuario?.rol);
  const { estado: estadoPacientes, listas } = usePersonasParaElegir(tipo === 'documento' ? ['paciente'] : []);

  if (cargado && !puede('importar_datos_masivos')) {
    return (
      <div>
        <Cabecera titulo={t.importacion.titulo} />
        <Alert variant="error">{t.comun.sin_permiso || t.comun.error_generico}</Alert>
      </div>
    );
  }

  function tomarAnalisis(leido, origenLeido) {
    setAnalisis(leido);
    setOrigen(origenLeido);
    setAsignaciones(asignacionesPropuestas(leido));
    setClases(clasesPropuestas(leido));
    setPacienteId('');
    setIntentado(false);
    setPaso(2);
  }

  const origenElegido = archivo ? { archivo } : { texto };
  const faltaOrigen = intentado && !hayOrigen(origenElegido);

  async function handleAnalizar(e) {
    e.preventDefault();
    setIntentado(true);
    if (!hayOrigen(origenElegido)) return;
    setCargando(true);
    setError(null);
    try {
      const leido = await llamarApi('/analizar', {
        method: 'POST',
        body: formularioDeAnalisis({ tipo, origen: origenElegido }),
      });
      tomarAnalisis(leido, origenElegido);
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setCargando(false);
    }
  }

  const faltaPaciente = intentado && analisis?.esDocumento && !pacienteId;

  async function handleConfirmar() {
    setIntentado(true);
    if (analisis?.esDocumento && !pacienteId) return;
    setCargando(true);
    setError(null);
    try {
      const resultadoJson = await llamarApi('/confirmar', {
        method: 'POST',
        body: formularioDeConfirmacion({ tipo, origen, analisis, asignaciones, clases, pacienteId }),
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

  const noCargados = TIPOS_DE_IMPORTACION.includes(tipo) ? tipo : 'cliente';
  const hojas = hojasDelAnalisis(analisis);
  const variasHojas = hojas.length > 1;

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
    setTexto('');
    setOrigen(null);
    setIntentado(false);
    setAnalisis(null);
    setAsignaciones({});
    setClases({});
    setPacienteId('');
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
            <form onSubmit={handleAnalizar} noValidate>
              <div className="molde-formgrid">
                <FormField label={t.importacion.paso1_tipo} name="tipo" type="select" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                  {TIPOS_DE_IMPORTACION.map((una) => (
                    <option key={una} value={una}>{t.importacion[`tipo_${una}`]}</option>
                  ))}
                </FormField>
                <FormField
                  label={t.importacion.paso1_archivo}
                  name="archivo"
                  type="file"
                  onChange={(e) => setArchivo(e.target.files?.[0] || null)}
                  error={faltaOrigen ? t.importacion.falta_archivo : null}
                />
              </div>
              {!archivo && (
                <FormField
                  label={t.importacion.paso1_texto}
                  name="texto"
                  type="textarea"
                  rows={6}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                />
              )}
              <div className="molde-acciones">
                <Button type="submit" disabled={cargando || cargaDeGenteBloqueada}>
                  {cargando ? t.importacion.analizando : t.importacion.analizar}
                </Button>
              </div>
            </form>
          </section>
          <PedidosDeDatos soloSiHay />
          {esAdministrador && <LotesImportados />}
        </div>
      )}

      {paso === 2 && analisis && (
        <div className="molde-pila">
          {analisis.esDocumento ? (
            <section className="panel-tarjeta">
              <div className="panel-tarjeta-titulo">
                <h2>{analisis.archivoNombre || t.importacion.tipo_documento}</h2>
              </div>
              <ListaDeAdvertencias advertencias={analisis.advertencias} />
              {estadoPacientes === 'error' && <Alert variant="error">{t.comun.error_generico}</Alert>}
              <div className="molde-formgrid">
                <FormField
                  label={t.importacion.paciente_del_documento}
                  name="pacienteId"
                  type="select"
                  required
                  value={pacienteId}
                  onChange={(e) => setPacienteId(e.target.value)}
                  disabled={estadoPacientes !== 'listo'}
                  error={faltaPaciente ? t.formularios.falta_un_dato_obligatorio : null}
                >
                  <option value="">{estadoPacientes === 'cargando' ? t.comun.cargando : t.importacion.pedidos.sin_elegir}</option>
                  {(listas.paciente ?? []).map((p) => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </FormField>
              </div>
            </section>
          ) : (
            hojas.map((hoja) => (
              <HojaDeImportacion
                key={hoja.indice}
                hoja={hoja}
                camposDisponibles={analisis.camposDisponibles}
                camposObligatorios={analisis.camposObligatorios}
                clasesDeHoja={analisis.clasesDeHoja}
                asignacion={asignaciones[hoja.indice]}
                onAsignacion={(nueva) => setAsignaciones((previas) => ({ ...previas, [hoja.indice]: nueva }))}
                clase={clases[hoja.indice]}
                onClase={(nueva) => setClases((previas) => ({ ...previas, [hoja.indice]: nueva }))}
              />
            ))
          )}

          <div className="molde-acciones">
            <Button variant="secondary" onClick={handleReiniciar} disabled={cargando}>
              {t.importacion.volver}
            </Button>
            <Button onClick={handleConfirmar} disabled={cargando || cargaDeGenteBloqueada}>
              {cargando ? t.importacion.confirmando : t.importacion.confirmar}
            </Button>
          </div>
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

            <ListaDeAdvertencias advertencias={resultado.advertencias} />

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
                  {resultado.errores.map((e, i) => {
                    const { hoja, fila, mapeo } = renglonDelError(e, analisis, asignaciones);
                    const nombre = nombreDeLaFila(fila, mapeo, tipo);
                    const frase = nombre ? con(t.importacion.no_cargado, { nombre, error: motivoDe(e) }) : motivoDe(e);
                    return (
                      <li key={`${e.hoja ?? 0}-${e.fila}-${i}`}>
                        {variasHojas && hoja?.nombre ? con(t.importacion.hoja_de_fila, { hoja: hoja.nombre, texto: frase }) : frase}
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
              {resultado.filasCreadas > 0 && TIPOS_CON_REVISION.has(tipo) && (
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
