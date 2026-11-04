import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { T } from '../../i18n/translations';
import { llamadorDe } from '../../lib/apiPanel';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';
import { Alert } from '../../components/ui/Alert';
import { PieDeFirmas } from '../../components/ui/PieDeFirmas';
import { EstadoLista } from '../../components/layout/EstadoLista';
import { mensajeDeError } from '../../lib/errores';
import { useModalAccesible } from '../../hooks/useModalAccesible';
import { ApoderadoDelCliente } from './ApoderadoDelCliente';
import '../../styles/molde-paginas.css';

const llamarApi = llamadorDe('/vitales-autorizacion');

/* La autorización del Cliente para que un Asistente le tome los signos vitales al Paciente. La
   casilla se marca sola cuando hay una aceptada. Sin ninguna, se imprime para firmar o se sube el
   documento firmado; si el Cliente subió uno desde la aplicación, acá se lo acepta o se lo rechaza. */
export function SignosVitalesPaciente({ paciente, clienteId, puedeRegistrar, esAdmin, onClose }) {
  const { t, locale } = useLocale();
  const modal = useModalAccesible(onClose);
  const [autorizacion, setAutorizacion] = useState(null);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [firmado, setFirmado] = useState(null);
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [paraFirmar, setParaFirmar] = useState(null);
  const elegirArchivo = useRef(null);

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    setFirmado(null);
    setRechazando(false);
    setMotivo('');
    try {
      const respuesta = await llamarApi(`/${paciente.id}`);
      setAutorizacion(respuesta.autorizacion);
      setEstado('listo');
    } catch (err) {
      setError(mensajeDeError(err, t));
      setEstado('error');
    }
  }, [paciente.id, t]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  async function ejecutar(accion) {
    setOcupado(true);
    setError(null);
    try {
      return await accion();
    } catch (err) {
      setError(mensajeDeError(err, t));
      return null;
    } finally {
      setOcupado(false);
    }
  }

  async function ver() {
    // El documento va en otra pestaña, que se abre antes de esperar la respuesta: abierta después, el
    // navegador la bloquea. Lo firmado en la aplicación se lee acá mismo.
    const pestana = autorizacion.metodo === 'aplicacion' ? null : window.open('', '_blank');
    const documento = await ejecutar(() => llamarApi(`/autorizacion/${autorizacion.id}`));
    if (documento?.url && pestana) {
      pestana.opener = null;
      pestana.location.href = documento.url;
    } else {
      pestana?.close();
    }
    if (documento) setFirmado(documento);
  }

  async function imprimir() {
    const documento = await ejecutar(() => llamarApi(`/${paciente.id}/para-firmar?idioma=${locale}`));
    if (documento) setParaFirmar(documento);
  }

  async function subir(e) {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    const cuerpo = new FormData();
    cuerpo.append('archivo', archivo);
    const hecho = await ejecutar(() => llamarApi(`/${paciente.id}/documento?idioma=${locale}`, { method: 'POST', body: cuerpo }));
    if (hecho) recargar();
  }

  async function aceptar() {
    const hecho = await ejecutar(() => llamarApi(`/autorizacion/${autorizacion.id}/aceptar`, { method: 'POST' }));
    if (hecho) recargar();
  }

  async function rechazar() {
    if (!motivo.trim()) return;
    const hecho = await ejecutar(() =>
      llamarApi(`/autorizacion/${autorizacion.id}/rechazar`, { method: 'POST', body: JSON.stringify({ motivo }) })
    );
    if (hecho) recargar();
  }

  const aceptada = autorizacion?.estado === 'aceptada';
  const pendiente = autorizacion?.estado === 'pendiente';

  return (
    <div className="panel-modal-fondo" onClick={onClose}>
      <div className="panel-modal panel-modal-ancho" onClick={(e) => e.stopPropagation()} {...modal.props}>
        <h2 id={modal.idTitulo}>{t.vitales_autorizacion.titulo} — {paciente.nombre}</h2>
        {estado === 'listo' && error && <Alert variant="error">{error}</Alert>}
        <EstadoLista estado={estado} error={error} recargar={recargar}>
          <div className="molde-acciones">
            <label className="form-field-en-linea panel-modal-acciones-aparte">
              <input type="checkbox" checked={aceptada} readOnly disabled />
              {t.vitales_autorizacion.autorizacion}
            </label>
            {autorizacion && (
              <Button variant="secondary" onClick={ver} disabled={ocupado}>
                {t.vitales_autorizacion.ver}
              </Button>
            )}
            {!autorizacion && (
              <>
                <Button variant="secondary" onClick={imprimir} disabled={ocupado}>
                  {t.vitales_autorizacion.imprimir}
                </Button>
                <Button variant="secondary" onClick={() => elegirArchivo.current?.click()} disabled={ocupado}>
                  {ocupado ? t.comun.guardando : t.vitales_autorizacion.subir_documento}
                </Button>
                <input
                  ref={elegirArchivo}
                  type="file"
                  accept="application/pdf,image/jpeg,image/png"
                  hidden
                  onChange={subir}
                />
              </>
            )}
          </div>

          {firmado?.texto && <div className="documento-instruccion">{firmado.texto}</div>}

          {firmado && pendiente && !rechazando && (
            <div className="molde-acciones">
              <Button variant="secondary" onClick={() => setRechazando(true)} disabled={ocupado}>
                {t.vitales_autorizacion.rechazar}
              </Button>
              <Button onClick={aceptar} disabled={ocupado}>
                {ocupado ? t.comun.guardando : t.vitales_autorizacion.aceptar}
              </Button>
            </div>
          )}

          {rechazando && (
            <>
              <div className="molde-formgrid">
                <div className="molde-ancho">
                  <FormField label={t.comun.motivo} name="motivo-rechazo" value={motivo} onChange={(e) => setMotivo(e.target.value)} required />
                </div>
              </div>
              <div className="molde-acciones">
                <Button variant="secondary" onClick={() => { setRechazando(false); setMotivo(''); }} disabled={ocupado}>
                  {t.comun.cancelar}
                </Button>
                <Button onClick={rechazar} disabled={ocupado || !motivo.trim()}>
                  {ocupado ? t.comun.guardando : t.vitales_autorizacion.rechazar}
                </Button>
              </div>
            </>
          )}

          <ApoderadoDelCliente clienteId={clienteId} funcion="signos_vitales" puedeRegistrar={puedeRegistrar} esAdmin={esAdmin} embebido />
        </EstadoLista>

        <div className="panel-modal-acciones">
          <Button variant="secondary" onClick={onClose}>{t.comun.cerrar}</Button>
        </div>
      </div>

      {paraFirmar && <DocumentoParaFirmar documento={paraFirmar} onCerrar={() => setParaFirmar(null)} />}
    </div>
  );
}

/* El documento que firma el Cliente: el texto con los nombres puestos y el pie de firmas, todo en el
   idioma del documento, no en el de quien imprime. */
function DocumentoParaFirmar({ documento, onCerrar }) {
  const { t } = useLocale();
  const modal = useModalAccesible(onCerrar);
  const delDocumento = (T[documento.idioma] || T['es-AR']).vitales_autorizacion;

  return (
    <div className="panel-modal-fondo" onClick={(e) => { e.stopPropagation(); onCerrar(); }}>
      <div className="panel-modal panel-modal-ancho" onClick={(e) => e.stopPropagation()} {...modal.props}>
        <div id="area-imprimible">
          <h2 id={modal.idTitulo}>{documento.titulo || delDocumento.titulo_texto}</h2>
          <div className="documento-instruccion">{documento.texto}</div>
          <PieDeFirmas textos={delDocumento} />
        </div>
        <div className="panel-modal-acciones no-imprimir">
          <Button variant="secondary" onClick={onCerrar}>{t.comun.cerrar}</Button>
          <Button onClick={() => window.print()}>{t.vitales_autorizacion.imprimir}</Button>
        </div>
      </div>
    </div>
  );
}
