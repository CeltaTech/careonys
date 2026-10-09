import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale } from '../i18n/LocaleContext';
import { T } from '../i18n/translations';
import { llamadorDe } from '../lib/apiPanel';
import { useModalAccesible } from '../hooks/useModalAccesible';
import { Button } from '../components/ui/Button';
import { FormField } from '../components/ui/FormField';
import { Alert } from '../components/ui/Alert';
import { Cabecera } from '../components/ui/Cabecera';
import { EstadoLista } from '../components/layout/EstadoLista';
import { mensajeDeError } from '../lib/errores';
import '../styles/molde-paginas.css';

const llamarApi = llamadorDe('/medicacion');

// La clave fija del único rechazo que no se escribe: la vía que nadie asignado puede dar.
const MOTIVO_VIA = 'ningun_asignado_puede_dar_la_via';

export function Medicacion() {
  const { t } = useLocale();
  const [pendientes, setPendientes] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [accionEnCurso, setAccionEnCurso] = useState(null);
  const [rechazando, setRechazando] = useState(null);
  const [motivoRechazo, setMotivoRechazo] = useState('');
  const [paraFirmar, setParaFirmar] = useState(null);
  const [subiendoPara, setSubiendoPara] = useState(null);
  const elegirArchivo = useRef(null);

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    try {
      const { pendientes: filas } = await llamarApi('/pendientes');
      setPendientes(filas);
      setEstado('listo');
    } catch (err) {
      setError(mensajeDeError(err, t));
      setEstado('error');
    }
  }, [t]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  async function ejecutar(fila, operacion) {
    setAccionEnCurso(fila.id);
    setError(null);
    try {
      await operacion();
      return true;
    } catch (err) {
      setError(mensajeDeError(err, t));
      return false;
    } finally {
      setAccionEnCurso(null);
    }
  }

  async function aceptar(fila) {
    if (await ejecutar(fila, () => llamarApi(`/${fila.id}/aceptar`, { method: 'POST' }))) recargar();
  }

  async function rechazarPorLaVia(fila) {
    const cuerpo = JSON.stringify({ motivo_rechazo_clave: MOTIVO_VIA });
    if (await ejecutar(fila, () => llamarApi(`/${fila.id}/rechazar`, { method: 'POST', body: cuerpo }))) recargar();
  }

  async function confirmarRechazo(fila) {
    if (!motivoRechazo) return;
    const cuerpo = JSON.stringify({ motivo_rechazo: motivoRechazo });
    if (await ejecutar(fila, () => llamarApi(`/${fila.id}/rechazar`, { method: 'POST', body: cuerpo }))) {
      setRechazando(null);
      setMotivoRechazo('');
      recargar();
    }
  }

  async function imprimir(fila) {
    await ejecutar(fila, async () => {
      setParaFirmar(await llamarApi(`/${fila.id}/para-firmar`));
    });
  }

  function subirPapel(fila) {
    setSubiendoPara(fila);
    elegirArchivo.current?.click();
  }

  async function papelElegido(evento) {
    const archivo = evento.target.files?.[0];
    evento.target.value = '';
    const fila = subiendoPara;
    setSubiendoPara(null);
    if (!archivo || !fila) return;
    const cuerpo = new FormData();
    cuerpo.append('archivo', archivo);
    if (await ejecutar(fila, () => llamarApi(`/${fila.id}/papel-firmado`, { method: 'POST', body: cuerpo }))) recargar();
  }

  async function abrir(fila, path) {
    await ejecutar(fila, async () => {
      const { url } = await llamarApi(path);
      window.open(url, '_blank', 'noreferrer');
    });
  }

  return (
    <div>
      <Cabecera titulo={t.medicacion.titulo} />
      {estado === 'listo' && error && <Alert variant="error">{error}</Alert>}
      <input ref={elegirArchivo} type="file" accept="application/pdf,image/*" hidden onChange={papelElegido} />

      <EstadoLista estado={estado} error={error} vacio={estado === 'listo' && pendientes.length === 0} recargar={recargar}>
        <div className="molde-pila">
          {pendientes.map((fila) => {
            const ocupada = accionEnCurso === fila.id;
            const faltaLaFirma = fila.firma?.estado === 'pendiente_firma';
            return (
              <section key={fila.id} className="panel-tarjeta">
                <div className="panel-tarjeta-titulo">
                  <h2>{fila.pacientes?.nombre}</h2>
                  {fila.prescripcion_archivo_url && (
                    <button
                      type="button"
                      className="panel-enlace"
                      onClick={() => abrir(fila, `/archivo-url?ruta=${encodeURIComponent(fila.prescripcion_archivo_url)}`)}
                    >
                      {t.medicacion.ver_prescripcion}
                    </button>
                  )}
                  {fila.firma?.cerradoComo === 'papel_firmado' && (
                    <button type="button" className="panel-enlace" onClick={() => abrir(fila, `/${fila.id}/papel-firmado`)}>
                      {t.medicacion.ver_papel_firmado}
                    </button>
                  )}
                </div>
                <div className="panel-fila-alerta">
                  <div>
                    <b>{fila.medicamento}</b>
                    <span className="panel-mini">
                      {fila.dosis} · {fila.frecuencia} ({t.medicacion.vias[fila.via_clave]})
                    </span>
                  </div>
                  <span className="panel-mini">
                    {t.medicacion.desde}: {fila.fecha_desde} {fila.fecha_hasta ? `— ${t.medicacion.hasta}: ${fila.fecha_hasta}` : ''}
                  </span>
                </div>
                {fila.bloqueada && <Alert variant="warning">{t.medicacion.ningun_asignado_puede_dar_la_via}</Alert>}
                {!fila.bloqueada && faltaLaFirma && <Alert variant="warning">{t.medicacion.falta_la_firma}</Alert>}

                {rechazando === fila.id ? (
                  <>
                    <div className="molde-formgrid">
                      <div className="molde-ancho">
                        <FormField
                          label={t.medicacion.motivo_rechazo}
                          name={`motivo-${fila.id}`}
                          value={motivoRechazo}
                          onChange={(e) => setMotivoRechazo(e.target.value)}
                          required
                        />
                      </div>
                    </div>
                    <div className="molde-acciones">
                      <Button variant="secondary" onClick={() => { setRechazando(null); setMotivoRechazo(''); }} disabled={ocupada}>
                        {t.comun.cancelar}
                      </Button>
                      <Button onClick={() => confirmarRechazo(fila)} disabled={ocupada || !motivoRechazo}>
                        {ocupada ? t.comun.guardando : t.medicacion.confirmar_rechazo}
                      </Button>
                    </div>
                  </>
                ) : fila.bloqueada ? (
                  <div className="molde-acciones">
                    <Button variant="secondary" onClick={() => rechazarPorLaVia(fila)} disabled={ocupada}>
                      {ocupada ? t.comun.guardando : t.medicacion.rechazar}
                    </Button>
                  </div>
                ) : (
                  <div className="molde-acciones">
                    {faltaLaFirma && (
                      <>
                        <Button variant="secondary" onClick={() => imprimir(fila)} disabled={ocupada}>
                          {t.medicacion.imprimir_para_firmar}
                        </Button>
                        <Button variant="secondary" onClick={() => subirPapel(fila)} disabled={ocupada}>
                          {t.medicacion.subir_papel_firmado}
                        </Button>
                      </>
                    )}
                    <Button variant="secondary" onClick={() => setRechazando(fila.id)} disabled={ocupada}>
                      {t.medicacion.rechazar}
                    </Button>
                    <Button onClick={() => aceptar(fila)} disabled={ocupada || faltaLaFirma}>
                      {ocupada ? t.comun.guardando : t.medicacion.aceptar}
                    </Button>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </EstadoLista>

      {paraFirmar && <HojaParaFirmar documento={paraFirmar} onCerrar={() => setParaFirmar(null)} />}
    </div>
  );
}

/* La hoja que firma el Cliente. El texto es el que quedó guardado al cargar la indicación, y todo
   lo demás va en el idioma en que él lo leyó, no en el de quien imprime. */
function HojaParaFirmar({ documento, onCerrar }) {
  const { t } = useLocale();
  const modal = useModalAccesible(onCerrar);
  const delDocumento = (T[documento.idioma] || T['es-AR']).medicacion;
  const { indicacion } = documento;

  return (
    <div className="panel-modal-fondo" onClick={onCerrar}>
      <div className="panel-modal panel-modal-ancho" onClick={(e) => e.stopPropagation()} {...modal.props}>
        <h2 id={modal.idTitulo} className="no-imprimir">{t.medicacion.imprimir_para_firmar}</h2>

        <div id="area-imprimible">
          <div className="documento-instruccion">{documento.texto}</div>
          <dl className="documento-datos">
            <dt>{delDocumento.campo_paciente}</dt>
            <dd>{indicacion.paciente?.nombre}</dd>
            <dt>{delDocumento.campo_medicamento}</dt>
            <dd>{indicacion.medicamento}</dd>
            <dt>{delDocumento.campo_dosis}</dt>
            <dd>{indicacion.dosis}</dd>
            <dt>{delDocumento.campo_frecuencia}</dt>
            <dd>{indicacion.frecuencia}</dd>
            <dt>{delDocumento.campo_via}</dt>
            <dd>{delDocumento.vias[indicacion.via_clave]}</dd>
            <dt>{delDocumento.desde}</dt>
            <dd>{indicacion.fecha_desde}</dd>
            {indicacion.fecha_hasta && (
              <>
                <dt>{delDocumento.hasta}</dt>
                <dd>{indicacion.fecha_hasta}</dd>
              </>
            )}
          </dl>
          <div className="documento-firmas">
            <div>{delDocumento.pie_firma}</div>
            <div>{delDocumento.pie_aclaracion}</div>
            <div>{delDocumento.pie_fecha}</div>
          </div>
        </div>

        <div className="panel-modal-acciones no-imprimir">
          <Button variant="secondary" onClick={onCerrar}>
            {t.comun.cerrar}
          </Button>
          <Button onClick={() => window.print()}>{t.medicacion.imprimir_para_firmar}</Button>
        </div>
      </div>
    </div>
  );
}
