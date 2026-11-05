import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { llamarApiPanel } from '../../lib/apiPanel';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';
import { Alert } from '../../components/ui/Alert';
import { mensajeDeError } from '../../lib/errores';
import { avisar } from '../../lib/mensajeEmergente';
import { useModalAccesible } from '../../hooks/useModalAccesible';
import { ApoderadoDelCliente } from './ApoderadoDelCliente';
import '../../styles/molde-paginas.css';
import '../tarjetas.css';

/* Si el Pagador está definido, ahí donde se lo elige.
   ==========================================================================

   POR QUÉ ACÁ Y NO EN OTRA PANTALLA. Apuntar una Ficha de Persona como Pagador no la convierte
   en Pagador: lo que la convierte es que haya asumido la obligación de pagar y lo haya firmado.
   Quien la elige tiene que ver en ese mismo momento si la firma está y qué documentos faltan, sin ir a
   buscarlo a ningún lado. Enterarse el día que hay que cobrar es tarde.

   NO BLOQUEA NADA. La contratación sigue, el Servicio se presta y el Cliente se da de alta igual.

   LA FIRMA SE VE POR LA FECHA. Con fecha, firmó; sin fecha, no. Si después cambió el Pagador, junto
   a la fecha aparece quién firmó: sola, se leería como la firma del nombre que tiene al lado. */
export function EstadoDelPagador({ clienteId, puedeRegistrar, esAdmin }) {
  const { t, locale } = useLocale();
  const [estado, setEstado] = useState('cargando');
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [trabajando, setTrabajando] = useState(false);
  const [documentoAVer, setDocumentoAVer] = useState(null);
  const [firmaARegistrar, setFirmaARegistrar] = useState(null);
  const [documentoACargar, setDocumentoACargar] = useState(null);

  const textos = t.clientes.pagador;

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    try {
      setDatos(await llamarApiPanel(`/cuentas/cliente/${clienteId}/pagador?idioma=${encodeURIComponent(locale)}`));
      setEstado('listo');
    } catch (err) {
      setError(mensajeDeError(err, t));
      setEstado('error');
    }
  }, [clienteId, t, locale]);

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
      setDocumentoAVer({ texto: consentimiento.documento_texto });
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

  async function enviar(consentimientoId) {
    setTrabajando(true);
    setError(null);
    try {
      await llamarApiPanel(
        `/cuentas/cliente/${clienteId}/pagador/consentimiento/${consentimientoId}/enviar`,
        { method: 'POST' },
      );
      avisar(datos.textos.enviado);
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
    firmadoPorOtro,
    consentimientoPendiente,
    consentimientoCerrado,
    documentos,
    documentosFaltantes,
    documentosVencidos,
    pendienteConEmail,
    cerradoConEmail,
    textos: textosDeLaBase,
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
            <div className="panel-grilla panel-columnas-3">
              <div className="tarjeta-dato"><b>{pagador.nombre}</b></div>
              {consentimientoCerrado && (
                <div className="tarjeta-dato">
                  {firmadoPorOtro && (
                    <div><b>{consentimientoCerrado.firmante_nombre ?? consentimientoCerrado.pagador_nombre}</b></div>
                  )}
                  <b>{new Date(consentimientoCerrado.cerrado_en).toLocaleDateString(locale)}</b>
                  {/* Con un documento pendiente, los botones de abajo son de ése: éste va junto a la fecha. */}
                  {consentimientoPendiente && puedeRegistrar && cerradoConEmail && (
                    <div>
                      <Button variant="secondary" onClick={() => enviar(consentimientoCerrado.id)} disabled={trabajando}>
                        {textosDeLaBase.enviar}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>

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
                      {pendienteConEmail && (
                        <Button variant="secondary" onClick={() => enviar(consentimientoPendiente.id)} disabled={trabajando}>
                          {textosDeLaBase.enviar}
                        </Button>
                      )}
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
                          `/cuentas/cliente/${clienteId}/pagador/consentimiento/${consentimientoCerrado.id}/documento`,
                        )
                      }
                    >
                      {textos.ver_documento_firmado}
                    </Button>
                  )}
                  {puedeRegistrar && cerradoConEmail && (
                    <Button variant="secondary" onClick={() => enviar(consentimientoCerrado.id)} disabled={trabajando}>
                      {textosDeLaBase.enviar}
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

      <ApoderadoDelCliente clienteId={clienteId} funcion="pagos" puedeRegistrar={puedeRegistrar} esAdmin={esAdmin} onCambio={recargar} />

      {/* Los documentos son aparte de la firma: se cuentan y se muestran por separado. */}
      {pagador && documentos.length > 0 && (
        <section className="panel-tarjeta tarjeta-desplazable">
          <div className="panel-tarjeta-titulo">
            <h2>{textos.documentos_titulo}</h2>
          </div>
          {(documentosFaltantes > 0 || documentosVencidos > 0) && (
            <Alert variant="warning">
              {documentosFaltantes > 0 && (documentosFaltantes === 1 ? textos.documentos_faltan_uno : textos.documentos_faltan.replace('{n}', documentosFaltantes))}
              {documentosFaltantes > 0 && documentosVencidos > 0 && ' '}
              {documentosVencidos > 0 && (documentosVencidos === 1 ? textos.documentos_vencidos_uno : textos.documentos_vencidos.replace('{n}', documentosVencidos))}
            </Alert>
          )}
          <table className="panel-tabla">
            <thead>
              <tr>
                <th>{textos.documento_nombre}</th>
                <th>{textos.documento_estado}</th>
                <th>{textos.documento_vencimiento}</th>
                <th>{textos.documento_acciones}</th>
              </tr>
            </thead>
            <tbody>
              {documentos.map((documento) => (
                <tr key={documento.tipoId}>
                  <td><b>{documento.nombre}</b></td>
                  <td>
                    {!documento.cargado ? (
                      <span className="badge badge-critico">{textos.documento_falta}</span>
                    ) : documento.vencido ? (
                      <span className="badge badge-atencion">{textos.documento_vencido}</span>
                    ) : (
                      <span className="badge badge-exito">{textos.documento_cargado}</span>
                    )}
                  </td>
                  <td>
                    {documento.fechaVencimiento
                      ? new Date(documento.fechaVencimiento).toLocaleDateString(locale)
                      : '—'}
                  </td>
                  <td>
                    {documento.cargado && (
                      <>
                        <Button
                          variant="secondary"
                          onClick={() =>
                            verArchivo(
                              `/cuentas/cliente/${clienteId}/pagador/documento/${documento.documentoId}/archivo`,
                            )
                          }
                        >
                          {textos.documento_ver}
                        </Button>{' '}
                      </>
                    )}
                    {puedeRegistrar && (
                      <Button variant="secondary" onClick={() => setDocumentoACargar(documento)}>
                        {documento.cargado ? textos.documento_reemplazar : textos.documento_cargar}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {documentoAVer && (
        <DocumentoDelConsentimiento
          texto={documentoAVer.texto}
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

      {documentoACargar && (
        <CargarDocumentoDelPagadorModal
          clienteId={clienteId}
          documento={documentoACargar}
          onClose={() => setDocumentoACargar(null)}
          onCargado={() => {
            setDocumentoACargar(null);
            recargar();
          }}
        />
      )}
    </>
  );
}

/* El documento tal como quedó guardado.

   El Panel no lo arma ni lo retoca: lo muestra. Se imprime con el mismo mecanismo que el resto
   —`#area-imprimible` es lo único que la impresión conserva—, y los botones llevan `no-imprimir` para
   no salir en el documento que alguien va a firmar. */
function DocumentoDelConsentimiento({ texto, onCerrar }) {
  const { t } = useLocale();
  const modal = useModalAccesible(onCerrar);
  const textos = t.clientes.pagador;

  return (
    <div className="panel-modal-fondo" onClick={onCerrar}>
      <div className="panel-modal panel-modal-ancho" onClick={(e) => e.stopPropagation()} {...modal.props}>
        <div className="no-imprimir">
          <h2 id={modal.idTitulo}>{textos.documento_titulo}</h2>
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

/* Registrar que llegó el documento firmado.

   El archivo es opcional a propósito, igual que en la instrucción de Personas autorizadas: lo que cierra esto
   es que la Prestadora declare que se firmó, y hay Prestadoras que archivan el documento afuera del
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
        `/cuentas/cliente/${clienteId}/pagador/consentimiento/${consentimientoId}/documento`,
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
          label={textos.documento_archivo}
          name="documento_firmado_pagador"
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

/* Cargar uno de los documentos que exige el Pagador. Acá el archivo sí es obligatorio: el documento
   es justamente el archivo, y anotar que existe sin tenerlo no documenta nada. */
function CargarDocumentoDelPagadorModal({ clienteId, documento, onClose, onCargado }) {
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
      await llamarApiPanel(`/cuentas/cliente/${clienteId}/pagador/documento/${documento.tipoId}`, {
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
        <h2 id={modal.idTitulo}>{documento.nombre}</h2>

        {error && <Alert variant="error">{error}</Alert>}

        <div className="molde-formgrid">
          <FormField
            label={textos.documento_archivo}
            name="documento_del_pagador"
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            onChange={(e) => setArchivo(e.target.files?.[0] || null)}
          />

          {documento.requiereVencimiento && (
            <FormField
              label={textos.documento_vencimiento}
              name="vencimiento_del_documento"
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
