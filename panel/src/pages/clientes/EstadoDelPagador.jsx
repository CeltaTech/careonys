import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { llamarApiPanel } from '../../lib/apiPanel';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';
import { Alert } from '../../components/ui/Alert';
import { mensajeDeError } from '../../lib/errores';
import { useModalAccesible } from '../../hooks/useModalAccesible';
import '../../styles/molde-paginas.css';
import '../hojaDeTarjetas.css';

/* Si el Pagador está definido, ahí donde se lo elige.
   ==========================================================================

   POR QUÉ ACÁ Y NO EN OTRA PANTALLA. Apuntar una Ficha de Persona como Pagador no la convierte
   en Pagador: lo que la convierte es que haya asumido la obligación de pagar y lo haya firmado.
   Quien la elige tiene que ver en ese mismo momento si la firma está y qué papeles faltan, sin ir a
   buscarlo a ningún lado. Enterarse el día que hay que cobrar es tarde.

   NO BLOQUEA NADA. La contratación sigue, el Servicio se presta y el Cliente se da de alta igual.
   Esto avisa; decidir es de quien tiene la responsabilidad.

   QUÉ CUENTA COMO DEFINIDO NO SE DECIDE ACÁ. Lo contesta el backend, en un solo lugar, y esta
   pantalla lo muestra. Repartida entre pantallas, la misma pregunta terminaría contestándose
   distinto según dónde se mire. */
export function EstadoDelPagador({ clienteId, puedeRegistrar }) {
  const { t, locale } = useLocale();
  const [estado, setEstado] = useState('cargando');
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [trabajando, setTrabajando] = useState(false);
  const [documentoAVer, setDocumentoAVer] = useState(null);
  const [firmaARegistrar, setFirmaARegistrar] = useState(null);
  const [papelACargar, setPapelACargar] = useState(null);

  const textos = t.clientes.pagador;

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    try {
      setDatos(await llamarApiPanel(`/cuentas/cliente/${clienteId}/pagador`));
      setEstado('listo');
    } catch (err) {
      setError(mensajeDeError(err, t));
      setEstado('error');
    }
  }, [clienteId, t]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  async function generarConsentimiento() {
    setTrabajando(true);
    setError(null);
    try {
      const { consentimiento } = await llamarApiPanel(
        `/cuentas/cliente/${clienteId}/pagador/consentimiento`,
        { method: 'POST' },
      );
      setDocumentoAVer({ texto: consentimiento.documento_texto, recienGuardado: true });
      await recargar();
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setTrabajando(false);
    }
  }

  async function anular(consentimientoId) {
    setTrabajando(true);
    setError(null);
    try {
      await llamarApiPanel(
        `/cuentas/cliente/${clienteId}/pagador/consentimiento/${consentimientoId}/anular`,
        { method: 'POST' },
      );
      await recargar();
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setTrabajando(false);
    }
  }

  async function verArchivo(camino) {
    setError(null);
    try {
      const { url } = await llamarApiPanel(camino);
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      setError(mensajeDeError(err, t));
    }
  }

  if (estado === 'cargando' || estado === 'error') {
    return (
      <section className="panel-tarjeta">
        <div className="panel-tarjeta-titulo">
          <h2>{textos.titulo}</h2>
        </div>
        {estado === 'cargando' ? <p className="molde-vacio">{t.comun.cargando}</p> : <Alert variant="error">{error}</Alert>}
      </section>
    );
  }

  const {
    pagador,
    apoderado,
    faltaApoderado,
    definido,
    firmadoPorOtro,
    consentimientoPendiente,
    consentimientoCerrado,
    papeles,
    papelesFaltantes,
    papelesVencidos,
  } = datos;

  return (
    <>
      <section className="panel-tarjeta">
        <div className="panel-tarjeta-titulo">
          <h2>{textos.titulo}</h2>
        </div>
        {error && <Alert variant="error">{error}</Alert>}

        {/* Sin Ficha de Persona elegida no hay a quién hacerle firmar nada. */}
        {!pagador ? (
          <Alert variant="info">{textos.sin_pagador}</Alert>
        ) : (
          <>
            <Alert variant={definido ? 'success' : 'warning'}>
              {definido ? textos.definido : textos.sin_firma}
            </Alert>

            {firmadoPorOtro && <Alert variant="warning">{textos.firmado_por_otro}</Alert>}

            {/* Una entidad firma por su Apoderado; sin él, el documento saldría sin firmante. */}
            {faltaApoderado && <Alert variant="warning">{textos.falta_apoderado}</Alert>}

            <div className="panel-grilla panel-columnas-3">
              <div className="hoja-dato"><div className="panel-mini">{textos.quien_paga}</div><b>{pagador.nombre}</b></div>
              {apoderado && (
                <div className="hoja-dato"><div className="panel-mini">{textos.quien_firma}</div><b>{apoderado.nombre}</b></div>
              )}
              {consentimientoCerrado && (
                <div className="hoja-dato">
                  <div className="panel-mini">{textos.firmado_el}</div>
                  <b>{new Date(consentimientoCerrado.cerrado_en).toLocaleDateString(locale)}</b>
                </div>
              )}
            </div>

            {consentimientoPendiente && <Alert variant="info">{textos.pendiente_de_firma}</Alert>}
            <div className="molde-acciones">
              {consentimientoPendiente ? (
                <>
                  <Button
                    variant="secondary"
                    onClick={() => setDocumentoAVer({ texto: consentimientoPendiente.documento_texto })}
                  >
                    {textos.ver_documento}
                  </Button>
                  {puedeRegistrar && (
                    <>
                      <Button variant="secondary" onClick={() => anular(consentimientoPendiente.id)} disabled={trabajando}>
                        {textos.anular}
                      </Button>
                      <Button onClick={() => setFirmaARegistrar(consentimientoPendiente.id)} disabled={trabajando}>
                        {textos.registrar_firma}
                      </Button>
                    </>
                  )}
                </>
              ) : (
                <>
                  {consentimientoCerrado && (
                    <Button
                      variant="secondary"
                      onClick={() => setDocumentoAVer({ texto: consentimientoCerrado.documento_texto })}
                    >
                      {textos.ver_documento}
                    </Button>
                  )}
                  {consentimientoCerrado?.archivo_firmado_url && (
                    <Button
                      variant="secondary"
                      onClick={() =>
                        verArchivo(
                          `/cuentas/cliente/${clienteId}/pagador/consentimiento/${consentimientoCerrado.id}/papel`,
                        )
                      }
                    >
                      {textos.ver_papel}
                    </Button>
                  )}
                  {puedeRegistrar && (
                    <Button onClick={generarConsentimiento} disabled={trabajando}>
                      {trabajando ? t.comun.guardando : textos.generar}
                    </Button>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </section>

      {/* Los papeles son aparte de la firma: se cuentan y se muestran por separado. */}
      {pagador && (
        <section className="panel-tarjeta hoja-desplazable">
          <div className="panel-tarjeta-titulo">
            <h2>{textos.papeles_titulo}</h2>
          </div>
          {papeles.length === 0 ? (
            <p className="molde-vacio">{textos.papeles_sin_catalogo}</p>
          ) : (
            <>
              {(papelesFaltantes > 0 || papelesVencidos > 0) && (
                <Alert variant="warning">
                  {papelesFaltantes > 0 && textos.papeles_faltan.replace('{n}', papelesFaltantes)}
                  {papelesFaltantes > 0 && papelesVencidos > 0 && ' '}
                  {papelesVencidos > 0 && textos.papeles_vencidos.replace('{n}', papelesVencidos)}
                </Alert>
              )}
              <table className="panel-tabla">
                <thead>
                  <tr>
                    <th>{textos.papel_nombre}</th>
                    <th>{textos.papel_estado}</th>
                    <th>{textos.papel_vencimiento}</th>
                    <th>{textos.papel_acciones}</th>
                  </tr>
                </thead>
                <tbody>
                  {papeles.map((papel) => (
                    <tr key={papel.tipoId}>
                      <td><b>{papel.nombre}</b></td>
                      <td>
                        {!papel.cargado ? (
                          <span className="badge badge-critico">{textos.papel_falta}</span>
                        ) : papel.vencido ? (
                          <span className="badge badge-atencion">{textos.papel_vencido}</span>
                        ) : (
                          <span className="badge badge-exito">{textos.papel_cargado}</span>
                        )}
                      </td>
                      <td>
                        {papel.fechaVencimiento
                          ? new Date(papel.fechaVencimiento).toLocaleDateString(locale)
                          : '—'}
                      </td>
                      <td>
                        {papel.cargado && (
                          <>
                            <Button
                              variant="secondary"
                              onClick={() =>
                                verArchivo(
                                  `/cuentas/cliente/${clienteId}/pagador/papel/${papel.documentoId}/archivo`,
                                )
                              }
                            >
                              {textos.papel_ver}
                            </Button>{' '}
                          </>
                        )}
                        {puedeRegistrar && (
                          <Button variant="secondary" onClick={() => setPapelACargar(papel)}>
                            {papel.cargado ? textos.papel_reemplazar : textos.papel_cargar}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>
      )}

      {documentoAVer && (
        <DocumentoDelConsentimiento
          texto={documentoAVer.texto}
          recienGuardado={documentoAVer.recienGuardado}
          onCerrar={() => setDocumentoAVer(null)}
        />
      )}

      {firmaARegistrar && (
        <RegistrarFirmaDelPagadorModal
          clienteId={clienteId}
          consentimientoId={firmaARegistrar}
          onClose={() => setFirmaARegistrar(null)}
          onRegistrado={() => {
            setFirmaARegistrar(null);
            recargar();
          }}
        />
      )}

      {papelACargar && (
        <CargarPapelDelPagadorModal
          clienteId={clienteId}
          papel={papelACargar}
          onClose={() => setPapelACargar(null)}
          onCargado={() => {
            setPapelACargar(null);
            recargar();
          }}
        />
      )}
    </>
  );
}

/* El documento tal como quedó guardado.

   El Panel no lo arma ni lo retoca: lo muestra. Se imprime con el mismo mecanismo que el resto
   —`#area-imprimible` es lo único que la hoja conserva—, y los botones llevan `no-imprimir` para
   no salir en el papel que alguien va a firmar. */
function DocumentoDelConsentimiento({ texto, recienGuardado = false, onCerrar }) {
  const { t } = useLocale();
  const modal = useModalAccesible(onCerrar);
  const textos = t.clientes.pagador;

  return (
    <div className="panel-modal-fondo" onClick={onCerrar}>
      <div className="panel-modal panel-modal-ancho" onClick={(e) => e.stopPropagation()} {...modal.props}>
        <div className="no-imprimir">
          <h2 id={modal.idTitulo}>{textos.documento_titulo}</h2>
          {recienGuardado && <Alert variant="success">{textos.documento_guardado}</Alert>}
        </div>

        <div id="area-imprimible">
          <div className="documento-instruccion">{texto}</div>
        </div>

        <div className="panel-modal-acciones no-imprimir">
          <Button variant="secondary" onClick={onCerrar}>
            {t.comun.cerrar}
          </Button>
          <Button onClick={() => window.print()}>{textos.documento_imprimir}</Button>
        </div>
      </div>
    </div>
  );
}

/* Registrar que llegó la hoja firmada.

   El archivo es opcional a propósito, igual que en la instrucción de Personas autorizadas: lo que cierra esto
   es que la Prestadora declare que se firmó, y hay Prestadoras que archivan el papel afuera del
   sistema. */
function RegistrarFirmaDelPagadorModal({ clienteId, consentimientoId, onClose, onRegistrado }) {
  const { t } = useLocale();
  const modal = useModalAccesible(onClose);
  const [archivo, setArchivo] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const textos = t.clientes.pagador;

  async function registrar() {
    setGuardando(true);
    setError(null);
    try {
      const cuerpo = new FormData();
      if (archivo) cuerpo.append('archivo', archivo);
      await llamarApiPanel(
        `/cuentas/cliente/${clienteId}/pagador/consentimiento/${consentimientoId}/papel`,
        { method: 'POST', body: cuerpo },
      );
      onRegistrado();
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="panel-modal-fondo" onClick={onClose}>
      <div className="panel-modal" onClick={(e) => e.stopPropagation()} {...modal.props}>
        <h2 id={modal.idTitulo}>{textos.registrar_titulo}</h2>
        {error && <Alert variant="error">{error}</Alert>}

        <FormField
          label={textos.papel_archivo}
          name="papel_firmado_pagador"
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          onChange={(e) => setArchivo(e.target.files?.[0] || null)}
        />

        <div className="panel-modal-acciones">
          <Button variant="secondary" onClick={onClose} disabled={guardando}>
            {t.comun.cancelar}
          </Button>
          <Button onClick={registrar} disabled={guardando}>
            {guardando ? textos.registrando : textos.registrar_confirmar}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* Cargar uno de los papeles que exige el financiador. Acá el archivo sí es obligatorio: el papel
   es justamente el archivo, y anotar que existe sin tenerlo no documenta nada. */
function CargarPapelDelPagadorModal({ clienteId, papel, onClose, onCargado }) {
  const { t } = useLocale();
  const modal = useModalAccesible(onClose);
  const [archivo, setArchivo] = useState(null);
  const [vencimiento, setVencimiento] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const textos = t.clientes.pagador;

  async function cargar() {
    setGuardando(true);
    setError(null);
    try {
      const cuerpo = new FormData();
      cuerpo.append('archivo', archivo);
      if (vencimiento) cuerpo.append('fechaVencimiento', vencimiento);
      await llamarApiPanel(`/cuentas/cliente/${clienteId}/pagador/papel/${papel.tipoId}`, {
        method: 'POST',
        body: cuerpo,
      });
      onCargado();
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="panel-modal-fondo" onClick={onClose}>
      <div className="panel-modal" onClick={(e) => e.stopPropagation()} {...modal.props}>
        <h2 id={modal.idTitulo}>{papel.nombre}</h2>

        {error && <Alert variant="error">{error}</Alert>}

        <div className="molde-formgrid">
          <FormField
            label={textos.papel_archivo}
            name="papel_del_financiador"
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            onChange={(e) => setArchivo(e.target.files?.[0] || null)}
          />

          {papel.requiereVencimiento && (
            <FormField
              label={textos.papel_vencimiento}
              name="vencimiento_del_papel"
              type="date"
              value={vencimiento}
              onChange={(e) => setVencimiento(e.target.value)}
            />
          )}
        </div>

        <div className="panel-modal-acciones">
          <Button variant="secondary" onClick={onClose} disabled={guardando}>
            {t.comun.cancelar}
          </Button>
          <Button onClick={cargar} disabled={guardando || !archivo}>
            {guardando ? t.comun.guardando : t.comun.guardar}
          </Button>
        </div>
      </div>
    </div>
  );
}
