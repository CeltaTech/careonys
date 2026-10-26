import { useEffect, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { useModalAccesible } from '../../hooks/useModalAccesible';
import { llamarApiDocumentos } from '../../hooks/useDocumentosDelAsistente';
import { llamarApiConfiguracion } from '../../lib/apiConfiguracion';
import { TONO_DEL_ESTADO, TIPOS_ACEPTADOS, TAMANO_MAXIMO } from '../../lib/documentos';
import { claseBadgeTono } from '../../lib/tonos';
import { hoyISO } from '../../lib/horarios';
import { avisar } from '../../lib/mensajeEmergente';
import { mensajeDeError } from '../../lib/errores';
import { con } from '../../lib/textos';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';
import { Alert } from '../../components/ui/Alert';
import { EstadoLista } from '../../components/layout/EstadoLista';

/* Los documentos que se le piden al Asistente, en su Legajo.

   La lista la lee una sola vez el Legajo (`useDocumentosDelAsistente`) y llega acá ya cargada, así
   la franja de arriba y esta sección dicen lo mismo. Cada renglón abre el documento: ahí se mira el
   archivo, se aprueba, se observa, se carga uno nuevo o se prorroga la gracia. Todo eso es de la
   administración, y el backend lo vuelve a exigir. */

function fechaLegible(fecha, locale) {
  return fecha ? new Date(`${fecha}T00:00:00`).toLocaleDateString(locale) : '—';
}

/** La gracia que todavía corre para este documento, o `null`. */
function graciaDelDocumento(documento, hoy) {
  return documento.gracia_hasta && documento.gracia_hasta >= hoy ? documento.gracia_hasta : null;
}

function EtiquetaDeEstado({ documento }) {
  const { t } = useLocale();
  return (
    <span className={claseBadgeTono(TONO_DEL_ESTADO[documento.estado_visible])}>
      {t.documentos_asistente[`estado_${documento.estado_visible}`]}
    </span>
  );
}

export function DocumentosDelAsistente({ asistenteId, documentos, estado, error, recargar }) {
  const { t, locale } = useLocale();
  const td = t.documentos_asistente;
  const [abierto, setAbierto] = useState(null);
  const hoy = hoyISO();

  return (
    <section className="panel-tarjeta hoja-desplazable">
      <div className="panel-tarjeta-titulo">
        <h2>{td.titulo}</h2>
      </div>
      <EstadoLista
        estado={estado}
        error={error}
        vacio={estado === 'listo' && documentos.length === 0}
        recargar={recargar}
        mensajeVacio={td.sin_documentos}
      >
        <table className="panel-tabla">
          <thead>
            <tr>
              <th>{td.col_documento}</th>
              <th>{td.col_estado}</th>
              <th>{td.col_vencimiento}</th>
            </tr>
          </thead>
          <tbody>
            {documentos.map((documento) => {
              const gracia = graciaDelDocumento(documento, hoy);
              return (
                <tr key={documento.tipo_documento_id}>
                  <td>
                    <button type="button" className="panel-enlace" onClick={() => setAbierto(documento)}>
                      {documento.nombre}
                    </button>
                  </td>
                  <td>
                    <EtiquetaDeEstado documento={documento} />
                    {gracia && (
                      <div className="panel-mini">{con(td.en_gracia_hasta, { fecha: fechaLegible(gracia, locale) })}</div>
                    )}
                  </td>
                  <td>{fechaLegible(documento.fecha_vencimiento, locale)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </EstadoLista>

      {abierto && (
        <DocumentoModal
          asistenteId={asistenteId}
          documento={abierto}
          onClose={() => setAbierto(null)}
          onCambiado={(aviso) => {
            setAbierto(null);
            avisar(aviso);
            recargar();
          }}
        />
      )}
    </section>
  );
}

/* Un solo modal con cuatro momentos: mirar el documento, observarlo, cargar uno nuevo y prorrogar
   la gracia. Pasar de uno a otro no abre una segunda ventana encima de la primera. */
function DocumentoModal({ asistenteId, documento, onClose, onCambiado }) {
  const modal = useModalAccesible(onClose);
  const [modo, setModo] = useState('ver');

  return (
    <div className="panel-modal-fondo" onClick={onClose}>
      <div className="panel-modal panel-modal-ancho" onClick={(e) => e.stopPropagation()} {...modal.props}>
        <h2 id={modal.idTitulo}>{documento.nombre}</h2>
        {modo === 'ver' && <VerDocumento documento={documento} onModo={setModo} onClose={onClose} onCambiado={onCambiado} />}
        {modo === 'observar' && (
          <ObservarDocumento documento={documento} onVolver={() => setModo('ver')} onCambiado={onCambiado} />
        )}
        {modo === 'cargar' && (
          <CargarDocumento
            asistenteId={asistenteId}
            documento={documento}
            onVolver={() => setModo('ver')}
            onCambiado={onCambiado}
          />
        )}
        {modo === 'prorrogar' && (
          <ProrrogarGracia
            asistenteId={asistenteId}
            documento={documento}
            onVolver={() => setModo('ver')}
            onCambiado={onCambiado}
          />
        )}
      </div>
    </div>
  );
}

function VerDocumento({ documento, onModo, onClose, onCambiado }) {
  const { t, locale } = useLocale();
  const td = t.documentos_asistente;
  const [ocupado, setOcupado] = useState(null);
  const [error, setError] = useState(null);
  const hoy = hoyISO();
  const gracia = graciaDelDocumento(documento, hoy);
  const organismo = documento.organismo;

  const puedeAprobar = documento.documento_id && documento.estado === 'en_revision';
  const puedeObservar = documento.documento_id && ['en_revision', 'aprobado'].includes(documento.estado);
  // La gracia sólo existe donde el documento frena el trabajo y no está en regla.
  const puedeProrrogar =
    documento.impide_trabajar && !['aprobado', 'por_vencer'].includes(documento.estado_visible);

  async function verArchivo() {
    setOcupado('archivo');
    setError(null);
    try {
      const { url } = await llamarApiDocumentos(`/${documento.documento_id}/archivo-url`);
      window.open(url, '_blank', 'noopener');
    } catch (e) {
      setError(mensajeDeError(e, t, 'archivo del documento'));
    } finally {
      setOcupado(null);
    }
  }

  async function aprobar() {
    setOcupado('aprobar');
    setError(null);
    try {
      await llamarApiDocumentos(`/${documento.documento_id}/aprobar`, { method: 'POST' });
      onCambiado(td.documento_aprobado);
    } catch (e) {
      setError(mensajeDeError(e, t, 'aprobar documento'));
      setOcupado(null);
    }
  }

  return (
    <>
      {error && <Alert variant="error">{error}</Alert>}
      <p>
        <EtiquetaDeEstado documento={documento} />
        {gracia && <> {con(td.en_gracia_hasta, { fecha: fechaLegible(gracia, locale) })}</>}
      </p>
      {documento.estado === 'observado' && documento.motivo_observacion && (
        <Alert variant="warning">{documento.motivo_observacion}</Alert>
      )}

      <dl className="panel-detalle-lista">
        {documento.numero && (
          <>
            <dt>{td.numero}</dt>
            <dd>{documento.numero}</dd>
          </>
        )}
        {organismo && (
          <>
            <dt>{td.otorgado_por}</dt>
            <dd>
              {organismo.nombre}
              {organismo.enlace_comprobacion && (
                <>
                  {' · '}
                  <a className="panel-enlace" href={organismo.enlace_comprobacion} target="_blank" rel="noopener noreferrer">
                    {td.consultar_registro}
                  </a>
                </>
              )}
            </dd>
          </>
        )}
        {documento.fecha_vencimiento && (
          <>
            <dt>{td.fecha_vencimiento}</dt>
            <dd>{fechaLegible(documento.fecha_vencimiento, locale)}</dd>
          </>
        )}
      </dl>

      <div className="panel-modal-acciones">
        <Button variant="secondary" onClick={onClose} disabled={ocupado !== null}>
          {t.comun.cerrar}
        </Button>
        {documento.documento_id && documento.tiene_archivo && (
          <Button variant="secondary" onClick={verArchivo} disabled={ocupado !== null}>
            {td.ver_archivo}
          </Button>
        )}
        {puedeProrrogar && (
          <Button variant="secondary" onClick={() => onModo('prorrogar')} disabled={ocupado !== null}>
            {td.prorrogar}
          </Button>
        )}
        <Button variant="secondary" onClick={() => onModo('cargar')} disabled={ocupado !== null}>
          {td.cargar}
        </Button>
        {puedeObservar && (
          <Button variant="secondary" onClick={() => onModo('observar')} disabled={ocupado !== null}>
            {td.observar}
          </Button>
        )}
        {puedeAprobar && (
          <Button onClick={aprobar} disabled={ocupado !== null}>
            {td.aprobar}
          </Button>
        )}
      </div>
    </>
  );
}

function ObservarDocumento({ documento, onVolver, onCambiado }) {
  const { t } = useLocale();
  const td = t.documentos_asistente;
  const [motivo, setMotivo] = useState('');
  const [faltaMotivo, setFaltaMotivo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  async function enviar() {
    if (!motivo.trim()) {
      setFaltaMotivo(true);
      setTimeout(() => document.querySelector('.panel-modal [aria-invalid="true"]')?.focus(), 0);
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      await llamarApiDocumentos(`/${documento.documento_id}/observar`, {
        method: 'POST',
        body: JSON.stringify({ motivo: motivo.trim() }),
      });
      onCambiado(td.observacion_enviada);
    } catch (e) {
      setError(mensajeDeError(e, t, 'observar documento'));
      setEnviando(false);
    }
  }

  return (
    <>
      {error && <Alert variant="error">{error}</Alert>}
      <FormField
        label={t.comun.motivo}
        name="motivo_observacion"
        type="textarea"
        required
        value={motivo}
        error={faltaMotivo && !motivo.trim() ? t.formularios.falta_un_dato_obligatorio : null}
        onChange={(e) => setMotivo(e.target.value)}
      />
      <div className="panel-modal-acciones">
        <Button variant="secondary" onClick={onVolver} disabled={enviando}>
          {t.comun.cancelar}
        </Button>
        <Button onClick={enviar} disabled={enviando}>
          {td.enviar_observacion}
        </Button>
      </div>
    </>
  );
}

/* Cargar el documento desde el Panel. Lo que pide sale de cómo está configurado el tipo: la fecha
   que corresponde a su vencimiento, el número si lo lleva y quién lo otorga si tiene organismos. */
function CargarDocumento({ asistenteId, documento, onVolver, onCambiado }) {
  const { t } = useLocale();
  const td = t.documentos_asistente;
  const [tipo, setTipo] = useState(null);
  const [organismos, setOrganismos] = useState([]);
  const [estadoTipo, setEstadoTipo] = useState('cargando');
  const [errorTipo, setErrorTipo] = useState(null);
  const [form, setForm] = useState({
    archivo: null,
    fecha: '',
    numero: documento.numero ?? '',
    organismo_id: documento.organismo?.id ?? '',
  });
  const [intentado, setIntentado] = useState(false);
  const [archivoRechazado, setArchivoRechazado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  async function cargarConfiguracion() {
    setEstadoTipo('cargando');
    setErrorTipo(null);
    try {
      const [{ tipos }, { organismos: todos }] = await Promise.all([
        llamarApiConfiguracion('/documentos-tipo'),
        llamarApiConfiguracion('/organismos-otorgantes'),
      ]);
      const encontrado = (tipos ?? []).find((x) => x.id === documento.tipo_documento_id) ?? null;
      setTipo(encontrado);
      const permitidos = new Set(encontrado?.organismo_ids ?? []);
      const propios = (todos ?? []).filter((o) => permitidos.has(o.id));
      setOrganismos(propios);
      if (propios.length === 1) setForm((f) => ({ ...f, organismo_id: f.organismo_id || propios[0].id }));
      setEstadoTipo(encontrado ? 'listo' : 'error');
      if (!encontrado) setErrorTipo(t.errores.motivos.tipo_de_documento_invalido);
    } catch (e) {
      setErrorTipo(mensajeDeError(e, t, 'tipo de documento'));
      setEstadoTipo('error');
    }
  }

  useEffect(() => {
    cargarConfiguracion();
    // Se pide una sola vez, al entrar a cargar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const campoDeFecha =
    tipo?.vencimiento === 'fecha_del_documento'
      ? 'fecha_vencimiento'
      : tipo?.vencimiento === 'plazo_desde_emision'
        ? 'fecha_emision'
        : null;

  const faltas = {
    fecha: campoDeFecha && !form.fecha,
    numero: tipo?.lleva_numero && !form.numero.trim(),
    organismo_id: organismos.length > 0 && !form.organismo_id,
  };
  const errorDe = (campo) => (intentado && faltas[campo] ? t.formularios.falta_un_dato_obligatorio : null);

  function elegirArchivo(archivo) {
    if (archivo && (archivo.size > TAMANO_MAXIMO || !TIPOS_ACEPTADOS.includes(archivo.type))) {
      setArchivoRechazado(true);
      setForm((f) => ({ ...f, archivo: null }));
      return;
    }
    setArchivoRechazado(false);
    setForm((f) => ({ ...f, archivo: archivo ?? null }));
  }

  async function guardar() {
    setIntentado(true);
    if (Object.values(faltas).some(Boolean) || archivoRechazado) {
      // Espera a que React pinte los avisos para saltar al primero.
      setTimeout(() => document.querySelector('.panel-modal [aria-invalid="true"]')?.focus(), 0);
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const cuerpo = new FormData();
      cuerpo.append('asistente_id', asistenteId);
      cuerpo.append('tipo_documento_id', documento.tipo_documento_id);
      if (form.archivo) cuerpo.append('archivo', form.archivo);
      if (campoDeFecha) cuerpo.append(campoDeFecha, form.fecha);
      if (tipo.lleva_numero) cuerpo.append('numero', form.numero.trim());
      if (form.organismo_id) cuerpo.append('organismo_id', form.organismo_id);
      await llamarApiDocumentos('/', { method: 'POST', body: cuerpo });
      onCambiado(td.documento_cargado);
    } catch (e) {
      setError(mensajeDeError(e, t, 'cargar documento'));
      setGuardando(false);
    }
  }

  return (
    <EstadoLista estado={estadoTipo} error={errorTipo} vacio={false} recargar={cargarConfiguracion}>
      {error && <Alert variant="error">{error}</Alert>}
      <div className="molde-formgrid">
        <FormField
          label={td.archivo}
          name="archivo_del_documento"
          type="file"
          accept={TIPOS_ACEPTADOS.join(',')}
          error={archivoRechazado ? t.asistentes.documentos.archivo_rechazado : null}
          onChange={(e) => elegirArchivo(e.target.files?.[0])}
        />
        {campoDeFecha && (
          <FormField
            label={campoDeFecha === 'fecha_emision' ? td.fecha_emision : td.fecha_vencimiento}
            name="fecha_del_documento"
            type="date"
            required
            value={form.fecha}
            error={errorDe('fecha')}
            onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))}
          />
        )}
        {tipo?.lleva_numero && (
          <FormField
            label={td.numero}
            name="numero_del_documento"
            required
            value={form.numero}
            error={errorDe('numero')}
            onChange={(e) => setForm((f) => ({ ...f, numero: e.target.value }))}
          />
        )}
        {organismos.length > 0 && (
          <FormField
            label={td.otorgado_por}
            name="organismo_del_documento"
            type="select"
            required
            value={form.organismo_id}
            error={errorDe('organismo_id')}
            onChange={(e) => setForm((f) => ({ ...f, organismo_id: e.target.value }))}
          >
            <option value="" />
            {organismos.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nombre}
              </option>
            ))}
          </FormField>
        )}
      </div>
      <div className="panel-modal-acciones">
        <Button variant="secondary" onClick={onVolver} disabled={guardando}>
          {t.comun.cancelar}
        </Button>
        <Button onClick={guardar} disabled={guardando}>
          {guardando ? t.comun.guardando : td.cargar}
        </Button>
      </div>
    </EstadoLista>
  );
}

function ProrrogarGracia({ asistenteId, documento, onVolver, onCambiado }) {
  const { t } = useLocale();
  const td = t.documentos_asistente;
  const [dias, setDias] = useState('');
  const [intentado, setIntentado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const valido = Number.isInteger(Number(dias)) && Number(dias) > 0;

  async function prorrogar() {
    setIntentado(true);
    if (!valido) {
      setTimeout(() => document.querySelector('.panel-modal [aria-invalid="true"]')?.focus(), 0);
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await llamarApiDocumentos('/prorrogar', {
        method: 'POST',
        body: JSON.stringify({
          asistente_id: asistenteId,
          tipo_documento_id: documento.tipo_documento_id,
          dias: Number(dias),
        }),
      });
      onCambiado(td.gracia_prorrogada);
    } catch (e) {
      setError(mensajeDeError(e, t, 'prorrogar gracia'));
      setGuardando(false);
    }
  }

  return (
    <>
      {error && <Alert variant="error">{error}</Alert>}
      <FormField
        label={td.dias}
        name="dias_de_prorroga"
        type="number"
        min="1"
        step="1"
        required
        value={dias}
        error={intentado && !valido ? t.formularios.falta_un_dato_obligatorio : null}
        onChange={(e) => setDias(e.target.value)}
      />
      <div className="panel-modal-acciones">
        <Button variant="secondary" onClick={onVolver} disabled={guardando}>
          {t.comun.cancelar}
        </Button>
        <Button onClick={prorrogar} disabled={guardando}>
          {td.prorrogar}
        </Button>
      </div>
    </>
  );
}
