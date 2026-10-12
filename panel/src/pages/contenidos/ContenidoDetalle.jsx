import { useRef, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { llamarApiContenidos } from '../../lib/apiContenidos';
import { DESTINATARIOS_DE_CONTENIDOS } from '../../lib/destinatariosDeContenidos';
import { ENLACE_DE_CONTENIDO_ACEPTADO } from '../../lib/enlaceDeContenidos';
import {
  TAMANO_MAXIMO_DE_ARCHIVO_DE_CONTENIDO,
  TIPOS_DE_ARCHIVO_DE_CONTENIDO,
  esArchivoDeContenidoAceptado,
} from '../../lib/archivosDeContenidos';
import { con } from '../../lib/textos';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';
import { Alert } from '../../components/ui/Alert';
import { mensajeDeError } from '../../lib/errores';
import { useModalAccesible } from '../../hooks/useModalAccesible';
import '../../styles/molde-paginas.css';

/* Una pieza de la biblioteca, para escribirla o cambiarla.
   ==========================================================================

   El texto se guarda tal como lo escribe la Prestadora y no se traduce: lo escribió una persona,
   en su idioma, para la gente que ella atiende. Lo traducido es el marco de esta pantalla.

   El enlace es opcional y tiene que empezar con `https://`.

   Los archivos se suben de a uno y quedan guardados en el momento, sin esperar a «Guardar»: por
   eso aparecen recién cuando la pieza ya existe. Qué tipo y qué tamaño se aceptan lo dice
   `lib/archivosDeContenidos.js`, y el backend lo vuelve a comprobar. «Abrir» pide un enlace
   temporal y lo lleva a otra pestaña: la imagen y el PDF se ven, Word y Excel se descargan.

   Lo que se escribe no se publica solo: el interruptor de abajo es lo que decide si los
   destinatarios lo ven, y una pieza nueva nace sin publicar. Publicada sin destinatarios no se
   guarda. */
export function ContenidoDetalle({ contenido, soloLectura, onClose, onGuardado }) {
  // Un archivo subido o borrado ya quedó guardado: al cerrar, la lista se vuelve a pedir aunque
  // no se haya tocado «Guardar».
  const cambiaronArchivos = useRef(false);
  const cerrar = () => (cambiaronArchivos.current ? onGuardado() : onClose());
  const modal = useModalAccesible(cerrar);
  const { t } = useLocale();
  const esNuevo = !contenido;

  const [titulo, setTitulo] = useState(contenido?.titulo || '');
  const [cuerpo, setCuerpo] = useState(contenido?.cuerpo || '');
  const [enlace, setEnlace] = useState(contenido?.enlace_url || '');
  const [orden, setOrden] = useState(contenido?.orden ?? 0);
  const [destinatarios, setDestinatarios] = useState(contenido?.destinatarios ?? []);
  const [publicado, setPublicado] = useState(contenido?.publicado ?? false);
  const [guardando, setGuardando] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false);
  const [error, setError] = useState(null);
  const [archivos, setArchivos] = useState(contenido?.archivos ?? []);
  const [subiendo, setSubiendo] = useState(false);
  const [abriendo, setAbriendo] = useState(null);
  const [archivoABorrar, setArchivoABorrar] = useState(null);
  const [borrandoArchivo, setBorrandoArchivo] = useState(false);
  const elegirArchivo = useRef(null);

  async function subir(e) {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    setError(null);
    if (!esArchivoDeContenidoAceptado(archivo.type) || archivo.size > TAMANO_MAXIMO_DE_ARCHIVO_DE_CONTENIDO) {
      setError(t.errores.motivos.archivo_de_contenido_invalido);
      return;
    }
    setSubiendo(true);
    try {
      const datos = new FormData();
      datos.append('archivo', archivo);
      const { archivo: subido } = await llamarApiContenidos(`/${contenido.id}/archivos`, { method: 'POST', body: datos });
      setArchivos((actuales) => [...actuales, subido]);
      cambiaronArchivos.current = true;
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setSubiendo(false);
    }
  }

  // La pestaña se abre antes de pedir el enlace: abierta después de esperar la respuesta, el
  // navegador la toma por una ventana que nadie pidió y la bloquea.
  async function abrir(archivo) {
    const pestana = window.open('about:blank', '_blank');
    if (pestana) pestana.opener = null;
    setAbriendo(archivo.id);
    setError(null);
    try {
      const { url } = await llamarApiContenidos(`/archivos/${encodeURIComponent(archivo.id)}/enlace`);
      if (pestana) pestana.location.href = url;
      else window.location.assign(url);
    } catch (err) {
      pestana?.close();
      setError(mensajeDeError(err, t));
    } finally {
      setAbriendo(null);
    }
  }

  async function borrarArchivo() {
    setBorrandoArchivo(true);
    setError(null);
    try {
      await llamarApiContenidos(`/archivos/${encodeURIComponent(archivoABorrar.id)}`, { method: 'DELETE' });
      setArchivos((actuales) => actuales.filter((a) => a.id !== archivoABorrar.id));
      setArchivoABorrar(null);
      cambiaronArchivos.current = true;
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setBorrandoArchivo(false);
    }
  }

  function marcarDestinatario(destinatario, marcado) {
    setDestinatarios((actuales) =>
      marcado ? [...actuales, destinatario] : actuales.filter((d) => d !== destinatario),
    );
  }

  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      await llamarApiContenidos(esNuevo ? '/' : `/${contenido.id}`, {
        method: esNuevo ? 'POST' : 'PATCH',
        body: JSON.stringify({
          titulo,
          cuerpo,
          enlace_url: enlace,
          orden,
          destinatarios,
          publicado,
        }),
      });
      onGuardado();
    } catch (err) {
      setError(mensajeDeError(err, t));
      setGuardando(false);
    }
  }

  async function borrar() {
    setBorrando(true);
    setError(null);
    try {
      await llamarApiContenidos(`/${contenido.id}`, { method: 'DELETE' });
      onGuardado();
    } catch (err) {
      setError(mensajeDeError(err, t));
      setBorrando(false);
    }
  }

  const ocupado = guardando || borrando || subiendo || borrandoArchivo;

  return (
    <div className="panel-modal-fondo" onClick={cerrar}>
      <div className="panel-modal" onClick={(e) => e.stopPropagation()} {...modal.props}>
        <h2 id={modal.idTitulo}>{esNuevo ? t.contenidos.nuevo : contenido.titulo}</h2>

        {error && <Alert variant="error">{error}</Alert>}

        <div className="molde-formgrid">
          <div className="molde-ancho">
            <FormField
              label={t.contenidos.campo_titulo}
              name="titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              disabled={soloLectura}
              required
            />
          </div>

          <div className="molde-ancho">
            <FormField
              label={t.contenidos.campo_cuerpo}
              name="cuerpo"
              type="textarea"
              rows={10}
              value={cuerpo}
              onChange={(e) => setCuerpo(e.target.value)}
              disabled={soloLectura}
              required
            />
          </div>

          {/* «Abrir» lleva lo que se pegó a otra pestaña, para ver que lleva a donde se quería. Se
              apaga mientras lo escrito no sea una dirección que el backend aceptaría. */}
          <div className="molde-ancho">
            <FormField
              label={t.contenidos.campo_enlace}
              name="enlace_url"
              value={enlace}
              onChange={(e) => setEnlace(e.target.value)}
              disabled={soloLectura}
            />
            {!soloLectura && (
              <div className="molde-acciones">
                <Button
                  variant="secondary"
                  onClick={() => window.open(enlace.trim(), '_blank', 'noopener,noreferrer')}
                  disabled={!ENLACE_DE_CONTENIDO_ACEPTADO.test(enlace.trim())}
                >
                  {t.contenidos.abrir_enlace}
                </Button>
              </div>
            )}
          </div>

          {!esNuevo && (
            <fieldset className="molde-ancho">
              <legend>{t.contenidos.archivos}</legend>
              {archivos.map((archivo) => (
                <div key={archivo.id} className="molde-acciones">
                  <span>{archivo.nombre}</span>{' '}
                  <Button variant="secondary" onClick={() => abrir(archivo)} disabled={abriendo === archivo.id}>
                    {t.contenidos.abrir_enlace}
                  </Button>{' '}
                  {!soloLectura && (
                    <Button variant="secondary" onClick={() => setArchivoABorrar(archivo)} disabled={ocupado}>
                      {t.contenidos.borrar}
                    </Button>
                  )}
                </div>
              ))}
              {archivoABorrar && (
                <Alert variant="warning">
                  <p>{con(t.contenidos.archivo_borrar_confirmar, { nombre: archivoABorrar.nombre })}</p>
                  <Button variant="secondary" onClick={() => setArchivoABorrar(null)} disabled={borrandoArchivo}>
                    {t.comun.cancelar}
                  </Button>{' '}
                  <Button onClick={borrarArchivo} disabled={borrandoArchivo}>
                    {borrandoArchivo ? t.comun.guardando : t.contenidos.borrar_si}
                  </Button>
                </Alert>
              )}
              {!soloLectura && (
                <div className="molde-acciones">
                  <input
                    ref={elegirArchivo}
                    type="file"
                    hidden
                    accept={Object.keys(TIPOS_DE_ARCHIVO_DE_CONTENIDO).join(',')}
                    onChange={subir}
                  />
                  <Button variant="secondary" onClick={() => elegirArchivo.current?.click()} disabled={ocupado}>
                    {subiendo ? t.comun.guardando : t.contenidos.subir_archivo}
                  </Button>
                </div>
              )}
            </fieldset>
          )}

          <FormField
            label={t.contenidos.campo_orden}
            name="orden"
            type="number"
            value={orden}
            onChange={(e) => setOrden(e.target.value)}
            disabled={soloLectura}
          />

          <fieldset className="molde-ancho">
            <legend>{t.contenidos.campo_destinatarios}</legend>
            {DESTINATARIOS_DE_CONTENIDOS.map((destinatario) => (
              <FormField
                key={destinatario}
                label={t.contenidos[`destinatario_${destinatario}`]}
                name={`destinatario_${destinatario}`}
                type="checkbox"
                checked={destinatarios.includes(destinatario)}
                onChange={(e) => marcarDestinatario(destinatario, e.target.checked)}
                disabled={soloLectura}
              />
            ))}
          </fieldset>

          <div className="molde-ancho">
            <FormField
              label={t.contenidos.campo_publicado}
              name="publicado"
              type="checkbox"
              checked={publicado}
              onChange={(e) => setPublicado(e.target.checked)}
              disabled={soloLectura}
            />
          </div>
        </div>

        {/* Borrar es definitivo y por eso se pregunta antes, diciendo qué se va a hacer y cómo
            cancelar. No lo apunta nadie: acá no queda ningún vínculo colgando. */}
        {confirmandoBorrado && (
          <Alert variant="warning">
            <p>{t.contenidos.borrar_confirmar}</p>
            <Button variant="secondary" onClick={() => setConfirmandoBorrado(false)} disabled={ocupado}>
              {t.comun.cancelar}
            </Button>{' '}
            <Button onClick={borrar} disabled={ocupado}>
              {borrando ? t.comun.guardando : t.contenidos.borrar_si}
            </Button>
          </Alert>
        )}

        <div className="panel-modal-acciones">
          <Button variant="secondary" onClick={cerrar} disabled={ocupado}>
            {soloLectura ? t.comun.cerrar : t.comun.cancelar}
          </Button>
          {!soloLectura && !esNuevo && !confirmandoBorrado && (
            <Button variant="secondary" onClick={() => setConfirmandoBorrado(true)} disabled={ocupado}>
              {t.contenidos.borrar}
            </Button>
          )}
          {!soloLectura && (
            <Button onClick={guardar} disabled={ocupado}>
              {guardando ? t.comun.guardando : t.comun.guardar}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
