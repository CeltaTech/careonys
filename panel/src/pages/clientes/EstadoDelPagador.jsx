import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { llamarApiPanel } from '../../lib/apiPanel';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';
import { Alert } from '../../components/ui/Alert';
import { PieDeFirmas } from '../../components/ui/PieDeFirmas';
import { mensajeDeError } from '../../lib/errores';
import { avisar } from '../../lib/mensajeEmergente';
import { useModalAccesible } from '../../hooks/useModalAccesible';
import { ApoderadoDelCliente } from './ApoderadoDelCliente';
import '../../styles/molde-paginas.css';
import '../tarjetas.css';

/* Si cada Responsable de pagos de este Servicio firmó, ahí donde se lo elige.
   ==========================================================================

   POR QUÉ ACÁ Y NO EN OTRA PANTALLA. Apuntar a una persona como Responsable de pagos no la
   convierte en Responsable de pagos: lo que la convierte es que haya asumido la obligación de pagar
   y lo haya firmado. Quien la elige tiene que ver en ese mismo momento si la firma está y qué
   documentos faltan, sin ir a buscarlo a ningún lado. Enterarse el día que hay que cobrar es tarde.

   UNA FILA POR RESPONSABLE DE PAGOS. Un Servicio puede tener varios a la vez, y cada uno firma lo
   suyo: cada fila tiene su firma y sus botones. Llegan los que rigen hoy o van a regir; los que ya
   terminaron no tienen nada pendiente de firmar.

   NO BLOQUEA NADA. La contratación sigue, el Servicio se presta y el Cliente se da de alta igual.

   LA FIRMA SE VE POR LA FECHA. Con fecha, firmó; sin fecha, no. */
export function EstadoDelPagador({ servicioId, clienteId, puedeRegistrar, esAdmin }) {
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
      setDatos(await llamarApiPanel(`/cuentas/servicio/${servicioId}/pagador?idioma=${encodeURIComponent(locale)}&zona=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)}`));
      setEstado('listo');
    } catch (err) {
      setError(mensajeDeError(err, t));
      setEstado('error');
    }
  }, [servicioId, t, locale]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  async function generarConsentimiento(personaId) {
    setTrabajando(true);
    setError(null);
    try {
      const { consentimiento } = await llamarApiPanel(
        `/cuentas/servicio/${servicioId}/pagador/consentimiento`,
        { method: 'POST', body: JSON.stringify({ persona_id: personaId }) },
      );
      setDocumentoAVer({ texto: consentimiento.documento_texto, idioma: consentimiento.documento_idioma });
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
        `/cuentas/servicio/${servicioId}/pagador/consentimiento/${consentimientoId}/anular`,
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
        `/cuentas/servicio/${servicioId}/pagador/consentimiento/${consentimientoId}/enviar`,
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
    responsables,
    documentos,
    documentosFaltantes,
    documentosVencidos,
    textos: textosDeLaBase,
  } = datos;
  const hayResponsables = (responsables ?? []).length > 0;

  // Los botones de una fila. Con un documento pendiente, son de ése; si no, del firmado.
  function accionesDe(responsable) {
    const { persona, consentimientoPendiente, consentimientoCerrado, pendienteConEmail, cerradoConEmail } = responsable;
    if (consentimientoPendiente) {
      return (
        <>
          <Button
            variant="secondary"
            onClick={() => setDocumentoAVer({ texto: consentimientoPendiente.documento_texto, idioma: consentimientoPendiente.documento_idioma })}
          >
            {textos.ver_documento}
          </Button>{' '}
          {puedeRegistrar && (
            <>
              <Button variant="secondary" onClick={() => anular(consentimientoPendiente.id)} disabled={trabajando}>
                {textos.anular}
              </Button>{' '}
              {pendienteConEmail && (
                <>
                  <Button variant="secondary" onClick={() => enviar(consentimientoPendiente.id)} disabled={trabajando}>
                    {textosDeLaBase.enviar}
                  </Button>{' '}
                </>
              )}
              <Button onClick={() => setFirmaARegistrar(consentimientoPendiente.id)} disabled={trabajando}>
                {textos.registrar_firma}
              </Button>
            </>
          )}
        </>
      );
    }
    return (
      <>
        {consentimientoCerrado && (
          <>
            <Button
              variant="secondary"
              onClick={() => setDocumentoAVer({ texto: consentimientoCerrado.documento_texto, idioma: consentimientoCerrado.documento_idioma, firmadoCon: consentimientoCerrado.firmadoCon })}
            >
              {textos.ver_documento}
            </Button>{' '}
          </>
        )}
        {consentimientoCerrado?.archivo_firmado_url && (
          <>
            <Button
              variant="secondary"
              onClick={() =>
                verArchivo(
                  `/cuentas/servicio/${servicioId}/pagador/consentimiento/${consentimientoCerrado.id}/documento`,
                )
              }
            >
              {textos.ver_documento_firmado}
            </Button>{' '}
          </>
        )}
        {puedeRegistrar && consentimientoCerrado && cerradoConEmail && (
          <>
            <Button variant="secondary" onClick={() => enviar(consentimientoCerrado.id)} disabled={trabajando}>
              {textosDeLaBase.enviar}
            </Button>{' '}
          </>
        )}
        {puedeRegistrar && (
          <Button onClick={() => generarConsentimiento(persona.id)} disabled={trabajando}>
            {trabajando ? t.comun.guardando : textos.generar}
          </Button>
        )}
      </>
    );
  }

  return (
    <>
      <section className="panel-tarjeta">
        <div className="panel-tarjeta-titulo">
          <h2>{textos.titulo}</h2>
        </div>
        {error && <Alert variant="error">{error}</Alert>}

        {/* Sin Responsable de pagos no hay a quién hacerle firmar nada. */}
        {!hayResponsables ? (
          <Alert variant="info">{textos.sin_pagador}</Alert>
        ) : (
          <div className="tarjeta-desplazable">
            <table className="panel-tabla">
              <thead>
                <tr>
                  <th>{textos.col_responsable}</th>
                  <th>{textos.col_firmado_el}</th>
                  <th>{textos.documento_acciones}</th>
                </tr>
              </thead>
              <tbody>
                {responsables.map((responsable) => (
                  <tr key={responsable.id}>
                    <td><b>{responsable.persona?.nombre ?? '—'}</b></td>
                    <td>
                      {responsable.consentimientoCerrado
                        ? new Date(responsable.consentimientoCerrado.cerrado_en).toLocaleDateString(locale)
                        : '—'}
                      {/* Con un documento pendiente, los botones de la fila son de ése: éste va junto a la fecha. */}
                      {responsable.consentimientoPendiente && responsable.consentimientoCerrado
                        && puedeRegistrar && responsable.cerradoConEmail && (
                        <div>
                          <Button variant="secondary" onClick={() => enviar(responsable.consentimientoCerrado.id)} disabled={trabajando}>
                            {textosDeLaBase.enviar}
                          </Button>
                        </div>
                      )}
                    </td>
                    <td>{accionesDe(responsable)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ApoderadoDelCliente clienteId={clienteId} funcion="pagos" puedeRegistrar={puedeRegistrar} esAdmin={esAdmin} onCambio={recargar} />

      {/* Los documentos son aparte de la firma: se cuentan y se muestran por separado. */}
      {hayResponsables && documentos.length > 0 && (
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
                              `/cuentas/servicio/${servicioId}/pagador/documento/${documento.documentoId}/archivo`,
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
          idioma={documentoAVer.idioma}
          firmadoCon={documentoAVer.firmadoCon}
          onCerrar={() => setDocumentoAVer(null)}
        />
      )}

      {firmaARegistrar && (
        <RegistrarFirmaDelPagadorModal
          servicioId={servicioId}
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
          servicioId={servicioId}
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
function DocumentoDelConsentimiento({ texto, idioma, firmadoCon, onCerrar }) {
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
          {/* Firmado con el enlace, lo dice la frase de la firma; si no, va el pie para firmar a mano. */}
          {firmadoCon ? <p>{firmadoCon}</p> : <PieDeFirmas idioma={idioma || 'es-AR'} />}
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
function RegistrarFirmaDelPagadorModal({ servicioId, consentimientoId, onClose, onRegistrado }) {
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
        `/cuentas/servicio/${servicioId}/pagador/consentimiento/${consentimientoId}/documento`,
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
function CargarDocumentoDelPagadorModal({ servicioId, documento, onClose, onCargado }) {
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
      await llamarApiPanel(`/cuentas/servicio/${servicioId}/pagador/documento/${documento.tipoId}`, {
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
