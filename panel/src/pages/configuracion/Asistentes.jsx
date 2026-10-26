import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { llamarApiConfiguracion as llamarApi } from '../../lib/apiConfiguracion';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';
import { Alert } from '../../components/ui/Alert';
import { EstadoLista } from '../../components/layout/EstadoLista';
import { TiposAsistenteTab } from './TiposAsistenteTab';
import { AusenciasTab } from './AusenciasTab';
import { PagoAsistentesTab } from './PagoAsistentesTab';
import { mensajeDeError } from '../../lib/errores';
import { useModalAccesible } from '../../hooks/useModalAccesible';
import { useTiposAsistente } from '../../hooks/useTiposAsistente';
import { nombreTipo } from '../../lib/tiposAsistente';
import { supabase } from '../../lib/supabaseClient';
import { con } from '../../lib/textos';
import '../../styles/molde-paginas.css';

/* Cómo es el Padrón: qué tipos de Asistente existen —con sus Ramas y sus tareas—, qué documentos
   se le piden a cada uno, con cuánta anticipación una falta se considera avisada con tiempo y
   cómo se le paga el período a quien cobra un monto fijo. */
export function ConfiguracionAsistentes() {
  return (
    <div className="molde-pila">
      <TiposAsistenteTab />
      <TabDocumentos />
      <AusenciasTab />
      <PagoAsistentesTab />
    </div>
  );
}

// Las tres formas de vencer que conoce la base (`tipos_documento_asistente.vencimiento`).
const VENCIMIENTOS = ['no_vence', 'fecha_del_documento', 'plazo_desde_emision'];

function TabDocumentos() {
  const { t } = useLocale();
  const tc = t.configuracion;
  const [tipos, setTipos] = useState([]);
  const [diasDePreaviso, setDiasDePreaviso] = useState('');
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [errorDeAccion, setErrorDeAccion] = useState(null);
  // `null`: ningún modal. `{}`: uno nuevo. Una fila: editarla.
  const [editando, setEditando] = useState(null);
  const [actualizandoId, setActualizandoId] = useState(null);
  const [guardandoPlazo, setGuardandoPlazo] = useState(false);
  const [plazoGuardado, setPlazoGuardado] = useState(false);

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    try {
      const respuesta = await llamarApi('/documentos-tipo');
      setTipos(respuesta?.tipos ?? []);
      const dias = respuesta?.dias_aviso_vencimiento_documentos;
      setDiasDePreaviso(dias == null ? '' : String(dias));
      setEstado('listo');
    } catch (err) {
      setError(mensajeDeError(err, t));
      setEstado('error');
    }
  }, [t]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  async function toggleActivo(fila) {
    setActualizandoId(fila.id);
    setErrorDeAccion(null);
    try {
      await llamarApi(`/documentos-tipo/${fila.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ activo: !fila.activo }),
      });
      recargar();
    } catch (err) {
      setErrorDeAccion(mensajeDeError(err, t));
    } finally {
      setActualizandoId(null);
    }
  }

  async function guardarPlazo() {
    setGuardandoPlazo(true);
    setErrorDeAccion(null);
    setPlazoGuardado(false);
    try {
      await llamarApi('/documentos-tipo/plazo-aviso', {
        method: 'PATCH',
        body: JSON.stringify({ dias: Number(diasDePreaviso) }),
      });
      setPlazoGuardado(true);
    } catch (err) {
      setErrorDeAccion(mensajeDeError(err, t));
    } finally {
      setGuardandoPlazo(false);
    }
  }

  return (
    <>
      <section className="panel-tarjeta">
        <div className="panel-tarjeta-titulo">
          <h2>{tc.documentos_plazo_titulo}</h2>
        </div>
        {plazoGuardado && <Alert variant="info">{t.comun.guardar} <span aria-hidden="true">✓</span></Alert>}
        <div className="molde-formgrid">
          <FormField
            label={tc.documentos_plazo_dias}
            name="dias_aviso"
            type="number"
            min="1"
            value={diasDePreaviso}
            onChange={(e) => { setDiasDePreaviso(e.target.value); setPlazoGuardado(false); }}
          />
        </div>
        <div className="molde-acciones">
          <Button onClick={guardarPlazo} disabled={guardandoPlazo || !diasDePreaviso}>
            {guardandoPlazo ? t.comun.guardando : t.comun.guardar}
          </Button>
        </div>
      </section>

      <section className="panel-tarjeta">
        <div className="panel-tarjeta-titulo">
          <h2>{tc.documentos_tipos_titulo}</h2>
          <Button onClick={() => setEditando({})}>{tc.documentos_tipos_nuevo}</Button>
        </div>
        {errorDeAccion && <Alert variant="error">{errorDeAccion}</Alert>}
        <EstadoLista
          estado={estado}
          error={error}
          vacio={estado === 'listo' && tipos.length === 0}
          recargar={recargar}
          mensajeVacio={tc.documentos_tipos_vacio}
        >
          <table className="panel-tabla">
            <thead>
              <tr>
                <th>{tc.documentos_tipos_col_nombre}</th>
                <th>{tc.documentos_tipos_col_vencimiento}</th>
                <th>{tc.documentos_tipos_col_activo}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {tipos.map((tipo) => (
                <tr key={tipo.id}>
                  <td><b>{tipo.nombre}</b></td>
                  <td>{tc[`documentos_tipos_vencimiento_${tipo.vencimiento}`] ?? '—'}</td>
                  <td>
                    <input
                      type="checkbox"
                      checked={tipo.activo}
                      onChange={() => toggleActivo(tipo)}
                      disabled={actualizandoId === tipo.id}
                      aria-label={con(t.comun.campo_de_fila, { campo: tc.documentos_tipos_col_activo, nombre: tipo.nombre })}
                    />
                  </td>
                  <td>
                    <button type="button" className="panel-enlace" onClick={() => setEditando(tipo)}>
                      {t.comun.editar}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </EstadoLista>
      </section>

      {editando && (
        <TipoDocumentoModal
          tipo={editando.id ? editando : null}
          onClose={() => setEditando(null)}
          onGuardado={() => { setEditando(null); recargar(); }}
        />
      )}
    </>
  );
}

/* Alta y edición de un tipo de documento, con el mismo formulario. Al crear, «Se pide a» nace con
   todos los tipos de Asistente marcados. */
function TipoDocumentoModal({ tipo, onClose, onGuardado }) {
  const modal = useModalAccesible(onClose);
  const { t } = useLocale();
  const tc = t.configuracion;
  const { paraElegir: tiposAsistente } = useTiposAsistente();
  const [unidades, setUnidades] = useState([]);
  const [organismos, setOrganismos] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [errorCarga, setErrorCarga] = useState(null);
  const [form, setForm] = useState(() => ({
    nombre: tipo?.nombre ?? '',
    activo: tipo?.activo ?? true,
    vencimiento: tipo?.vencimiento ?? 'no_vence',
    periodo_cantidad: tipo?.periodo_cantidad != null ? String(tipo.periodo_cantidad) : '',
    periodo_unidad: tipo?.periodo_unidad ?? '',
    lleva_numero: tipo?.lleva_numero ?? false,
    requisitos: tipo?.requisitos ?? '',
    enlace_para_obtenerlo: tipo?.enlace_para_obtenerlo ?? '',
    // `null` al crear: quedan marcados todos los tipos de Asistente, apenas se conocen.
    tipo_asistente_ids: tipo?.tipo_asistente_ids ?? null,
    impide_trabajar: tipo?.impide_trabajar ?? false,
    dias_de_gracia: tipo?.dias_de_gracia != null ? String(tipo.dias_de_gracia) : '0',
    organismo_ids: tipo?.organismo_ids ?? [],
  }));
  const [intentado, setIntentado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  const cargar = useCallback(async () => {
    setEstado('cargando');
    setErrorCarga(null);
    try {
      // Las unidades de tiempo salen del mismo catálogo que las formas de cobro.
      const [{ data, error: errorUnidades }, respuesta] = await Promise.all([
        supabase.from('catalogo_periodos_cobro').select('clave, orden').order('orden'),
        llamarApi('/organismos-otorgantes'),
      ]);
      if (errorUnidades) throw errorUnidades;
      setUnidades((data ?? []).map((fila) => fila.clave));
      setOrganismos(respuesta?.organismos ?? []);
      setEstado('listo');
    } catch (err) {
      setErrorCarga(mensajeDeError(err, t));
      setEstado('error');
    }
  }, [t]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const marcados = form.tipo_asistente_ids ?? tiposAsistente.map((x) => x.id);
  const conPlazo = form.vencimiento === 'plazo_desde_emision';
  const cantidad = Number(form.periodo_cantidad);
  const gracia = Number(form.dias_de_gracia);
  const faltas = {
    nombre: !form.nombre.trim(),
    periodo_cantidad: conPlazo && !(Number.isInteger(cantidad) && cantidad > 0),
    periodo_unidad: conPlazo && !form.periodo_unidad,
    dias_de_gracia: form.dias_de_gracia !== '' && !(Number.isInteger(gracia) && gracia >= 0),
  };
  const errorDe = (campo) => (intentado && faltas[campo] ? t.formularios.falta_un_dato_obligatorio : null);
  const poner = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));

  function alternar(campo, id, lista) {
    poner(campo, lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id]);
  }

  async function guardar() {
    setIntentado(true);
    if (Object.values(faltas).some(Boolean)) {
      // Espera a que se pinten los avisos para saltar al primero.
      setTimeout(() => document.querySelector('.panel-modal [aria-invalid="true"]')?.focus(), 0);
      return;
    }
    setGuardando(true);
    setError(null);
    const cuerpo = {
      nombre: form.nombre.trim(),
      activo: form.activo,
      vencimiento: form.vencimiento,
      periodo_cantidad: conPlazo ? cantidad : null,
      periodo_unidad: conPlazo ? form.periodo_unidad : null,
      lleva_numero: form.lleva_numero,
      requisitos: form.requisitos.trim() || null,
      enlace_para_obtenerlo: form.enlace_para_obtenerlo.trim() || null,
      tipo_asistente_ids: marcados,
      impide_trabajar: form.impide_trabajar,
      dias_de_gracia: form.dias_de_gracia === '' ? 0 : gracia,
      organismo_ids: form.organismo_ids,
    };
    try {
      await llamarApi(tipo ? `/documentos-tipo/${tipo.id}` : '/documentos-tipo', {
        method: tipo ? 'PATCH' : 'POST',
        body: JSON.stringify(cuerpo),
      });
      onGuardado();
    } catch (err) {
      setError(mensajeDeError(err, t));
      setGuardando(false);
    }
  }

  return (
    <div className="panel-modal-fondo" onClick={onClose}>
      <div className="panel-modal panel-modal-ancho" onClick={(e) => e.stopPropagation()} {...modal.props}>
        <h2 id={modal.idTitulo}>{tipo ? tc.documentos_tipos_editar : tc.documentos_tipos_nuevo}</h2>
        {error && <Alert variant="error">{error}</Alert>}
        <EstadoLista estado={estado} error={errorCarga} vacio={false} recargar={cargar}>
          <div className="molde-formgrid">
            <div className="molde-ancho">
              <FormField
                label={tc.documentos_tipos_col_nombre}
                name="nombre_tipo_documento"
                required
                value={form.nombre}
                error={errorDe('nombre')}
                onChange={(e) => poner('nombre', e.target.value)}
              />
            </div>
            <div className="molde-ancho">
              <FormField
                label={tc.documentos_tipos_col_activo}
                name="activo_tipo_documento"
                type="checkbox"
                checked={form.activo}
                onChange={(e) => poner('activo', e.target.checked)}
              />
            </div>
            <div className="molde-ancho">
              <FormField
                label={tc.documentos_tipos_col_vencimiento}
                name="vencimiento_tipo_documento"
                type="select"
                required
                value={form.vencimiento}
                onChange={(e) => poner('vencimiento', e.target.value)}
              >
                {VENCIMIENTOS.map((v) => (
                  <option key={v} value={v}>{tc[`documentos_tipos_vencimiento_${v}`]}</option>
                ))}
              </FormField>
            </div>
            {conPlazo && (
              <>
                <FormField
                  label={tc.documentos_tipos_plazo}
                  name="plazo_tipo_documento"
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={form.periodo_cantidad}
                  error={errorDe('periodo_cantidad')}
                  onChange={(e) => poner('periodo_cantidad', e.target.value)}
                />
                <FormField
                  label={tc.documentos_tipos_unidad}
                  name="unidad_tipo_documento"
                  type="select"
                  required
                  value={form.periodo_unidad}
                  error={errorDe('periodo_unidad')}
                  onChange={(e) => poner('periodo_unidad', e.target.value)}
                >
                  <option value="" />
                  {unidades.map((u) => (
                    <option key={u} value={u}>{t.intermediacion[`periodo_${u}_plural`] || u}</option>
                  ))}
                </FormField>
              </>
            )}
            <div className="molde-ancho">
              <FormField
                label={tc.documentos_tipos_lleva_numero}
                name="lleva_numero_tipo_documento"
                type="checkbox"
                checked={form.lleva_numero}
                onChange={(e) => poner('lleva_numero', e.target.checked)}
              />
            </div>
            <div className="molde-ancho">
              <FormField
                label={tc.documentos_tipos_requisitos}
                name="requisitos_tipo_documento"
                type="textarea"
                value={form.requisitos}
                onChange={(e) => poner('requisitos', e.target.value)}
              />
            </div>
            <div className="molde-ancho">
              <FormField
                label={tc.documentos_tipos_enlace}
                name="enlace_tipo_documento"
                type="url"
                value={form.enlace_para_obtenerlo}
                onChange={(e) => poner('enlace_para_obtenerlo', e.target.value)}
              />
            </div>
            <fieldset className="molde-ancho">
              <legend>{tc.documentos_tipos_se_pide_a}</legend>
              {tiposAsistente.map((x) => (
                <FormField
                  key={x.id}
                  label={nombreTipo(x, t)}
                  name={`se_pide_a_${x.id}`}
                  type="checkbox"
                  checked={marcados.includes(x.id)}
                  onChange={() => alternar('tipo_asistente_ids', x.id, marcados)}
                />
              ))}
            </fieldset>
            <FormField
              label={tc.documentos_tipos_impide_trabajar}
              name="impide_trabajar_tipo_documento"
              type="checkbox"
              checked={form.impide_trabajar}
              onChange={(e) => poner('impide_trabajar', e.target.checked)}
            />
            <FormField
              label={tc.documentos_tipos_dias_de_gracia}
              name="dias_de_gracia_tipo_documento"
              type="number"
              min="0"
              step="1"
              value={form.dias_de_gracia}
              error={errorDe('dias_de_gracia')}
              onChange={(e) => poner('dias_de_gracia', e.target.value)}
            />
            {organismos.length > 0 && (
              <fieldset className="molde-ancho">
                <legend>{tc.documentos_tipos_otorgado_por}</legend>
                {organismos.map((o) => (
                  <FormField
                    key={o.id}
                    label={o.nombre}
                    name={`otorgado_por_${o.id}`}
                    type="checkbox"
                    checked={form.organismo_ids.includes(o.id)}
                    onChange={() => alternar('organismo_ids', o.id, form.organismo_ids)}
                  />
                ))}
              </fieldset>
            )}
          </div>
        </EstadoLista>
        <div className="panel-modal-acciones">
          <Button variant="secondary" onClick={onClose} disabled={guardando}>{t.comun.cancelar}</Button>
          <Button onClick={guardar} disabled={guardando || estado !== 'listo'}>
            {guardando ? t.comun.guardando : t.comun.guardar}
          </Button>
        </div>
      </div>
    </div>
  );
}
