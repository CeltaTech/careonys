import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { traducirValor } from '../../i18n/valores';
import { supabase } from '../../lib/supabaseClient';
import { mensajeDeError } from '../../lib/errores';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';
import { SelectorDePersona } from '../../components/personas/SelectorDePersona';
import { EstadoDelPagador } from '../clientes/EstadoDelPagador';
import {
  TIPOS_DE_PAGADOR,
  TIPOS_DE_PAGADOR_POSIBLES,
  PLAZO_MAXIMO_EN_DIAS,
  plazoQueSePuedeGuardar,
} from '../../lib/facturacionDeClientes';
import {
  BORDES,
  CLAVES_SI_NO,
  FRECUENCIAS_DE_COBRO_POSIBLES,
  MEDICIONES_POSIBLES,
  condicionesDe,
  condicionDelServicioQueSePuedeGuardar,
} from '../../lib/condicionesDelCliente';
import { CONDICIONES_DE_CADA_MEDICION } from '../../lib/calcularLiquidacion';
import { usePrestadoraActual } from '../../hooks/usePrestadoraActual';
import { ActualizacionDelServicio } from '../../components/ActualizacionDelServicio';
import '../../styles/molde-paginas.css';

/* Lo comercial de un Servicio: quién contrata, quién paga, en qué plazo, y si quien paga firmó.
   ==========================================================================

   Es del Servicio y no del Cliente: un mismo Cliente puede tener dos Servicios con distinto
   Responsable de pagos. La deuda sigue siendo del Cliente. Las personas se eligen del Directorio
   de Personas y no se teclean.

   Vive en su propia tabla, que la base le abre sólo a quien tiene el permiso de lo comercial o el
   de lo que firma el Responsable de pagos.

   LAS CONDICIONES DE COBRO. Cada casillero muestra el valor que rige para este Servicio: el suyo,
   o el de la configuración de facturación de la Prestadora, o el de fábrica, en ese orden, según
   `condicionesDe`. Elegir el mismo valor que rige desde arriba guarda vacío, así el Servicio sigue
   a la Prestadora si ella lo cambia después.

   La configuración de la Prestadora sólo se la abre la base a la administración. Para el resto no
   se sabe qué rige desde arriba, así que lo que se muestra puede no ser lo de la Prestadora: por
   eso un casillero que no se tocó se guarda tal como estaba, y uno que se tocó se guarda con el
   valor elegido, sin compararlo contra lo que no se pudo leer.

   EL DESCUENTO. Un solo número: el porcentaje que rige desde hoy y sin fin. Cambiarlo termina el
   anterior y carga el nuevo (`fijar_descuento_del_servicio`); cero lo quita. */
const SELECT_DE_LO_COMERCIAL = [
  'contratante_persona_id',
  'pagador_tipo',
  'pagador_persona_id',
  'dias_hasta_el_vencimiento',
  'frecuencia_de_cobro',
  'medicion',
  'cobra_cancelada_por_el_cliente',
  'descuenta_lo_no_prestado',
  'cobra_guardias_adicionales',
  'cobra_horas_adicionales',
  'recargo_del_adicional',
].join(', ');

// Las condiciones de cobro que se deciden desde acá. El índice y su aplicación los decide
// `ActualizacionDelServicio`.
const CONDICIONES_DEL_SERVICIO = Object.freeze([
  'frecuencia_de_cobro',
  'medicion',
  ...CLAVES_SI_NO,
  'recargo_del_adicional',
]);

function condicionesVisiblesDe(fila, regla) {
  const rigen = condicionesDe(regla, fila);
  const visibles = {};
  for (const clave of CONDICIONES_DEL_SERVICIO) visibles[clave] = rigen[clave];
  visibles.recargo_del_adicional = String(rigen.recargo_del_adicional ?? '');
  return visibles;
}

function formDe(fila, regla) {
  const dias = fila?.dias_hasta_el_vencimiento;
  return {
    dias_hasta_el_vencimiento: dias === null || dias === undefined ? '' : String(dias),
    pagador_tipo: fila?.pagador_tipo || '',
    pagador_persona_id: fila?.pagador_persona_id || null,
    contratante_persona_id: fila?.contratante_persona_id || null,
    ...condicionesVisiblesDe(fila, regla),
  };
}

export function PagosDelServicio({ servicio, puedeEditar, puedeRegistrar, esAdmin, onGuardado }) {
  const { t } = useLocale();
  const tc = t.configuracion.condiciones_cliente;
  const prestadoraId = usePrestadoraActual();
  const [form, setForm] = useState(() => formDe(null, null));
  const [fila, setFila] = useState(null);
  const [regla, setRegla] = useState(null);
  const [reglaConocida, setReglaConocida] = useState(false);
  const [tocadas, setTocadas] = useState(() => new Set());
  const [recargoMal, setRecargoMal] = useState(false);
  const [estado, setEstado] = useState('cargando');
  const [errorDeCarga, setErrorDeCarga] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const [guardado, setGuardado] = useState(false);
  const [descuento, setDescuento] = useState('');
  const [descuentoGuardado, setDescuentoGuardado] = useState('');
  const [descuentoMal, setDescuentoMal] = useState(false);

  const cargar = useCallback(async () => {
    setEstado('cargando');
    setErrorDeCarga(null);
    const leeLaRegla = !!esAdmin && !!prestadoraId;
    const [comercial, configuracion, descuentos] = await Promise.all([
      supabase
        .from('condiciones_comerciales_servicio')
        .select(SELECT_DE_LO_COMERCIAL)
        .eq('servicio_id', servicio.id)
        .maybeSingle(),
      // Sólo la administración la puede leer. Si no se pudo, se sigue sin ella.
      leeLaRegla
        ? supabase
          .from('configuracion_facturacion_clientes')
          .select('regla')
          .eq('prestadora_id', prestadoraId)
          .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabase
        .from('descuentos_del_servicio')
        .select('clase, valor, cantidad_de_periodos, vigente_hasta')
        .eq('servicio_id', servicio.id)
        .is('terminado_en', null),
    ]);
    const falla = comercial.error || descuentos.error;
    if (falla) {
      setErrorDeCarga(mensajeDeError(falla, t));
      setEstado('error');
      return;
    }
    const conocida = leeLaRegla && !configuracion.error;
    const deLaPrestadora = conocida ? configuracion.data?.regla ?? null : null;
    setFila(comercial.data);
    setRegla(deLaPrestadora);
    setReglaConocida(conocida);
    setTocadas(new Set());
    setRecargoMal(false);
    setForm(formDe(comercial.data, deLaPrestadora));
    const abiertos = descuentos.data ?? [];
    const unico = abiertos.length === 1 && abiertos[0].clase === 'porcentaje'
      && abiertos[0].cantidad_de_periodos === null && abiertos[0].vigente_hasta === null;
    const vigente = unico ? String(Number(abiertos[0].valor)) : '';
    setDescuento(vigente);
    setDescuentoGuardado(vigente);
    setDescuentoMal(false);
    setEstado('listo');
  }, [servicio.id, t, esAdmin, prestadoraId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  function setCampo(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }));
    if (CONDICIONES_DEL_SERVICIO.includes(campo)) setTocadas((antes) => new Set(antes).add(campo));
    if (campo === 'recargo_del_adicional') setRecargoMal(false);
    setGuardado(false);
  }

  // La condición que no se tocó queda como estaba; la que se tocó pasa por la misma revisión que
  // usa el backend.
  function condicionesParaGuardar() {
    const valores = {};
    for (const clave of CONDICIONES_DEL_SERVICIO) {
      if (!tocadas.has(clave)) {
        valores[clave] = fila?.[clave] ?? null;
        continue;
      }
      const revisada = condicionDelServicioQueSePuedeGuardar(clave, form[clave], reglaConocida ? regla : undefined);
      if (!revisada.ok) return { ok: false, clave };
      valores[clave] = revisada.valor;
    }
    return { ok: true, valores };
  }

  async function guardar() {
    const textoDescuento = String(descuento).trim().replace(',', '.');
    const porcentaje = textoDescuento === '' ? 0 : Number(textoDescuento);
    if (!Number.isFinite(porcentaje) || porcentaje < 0 || porcentaje > 100) {
      setDescuentoMal(true);
      document.getElementsByName('descuento')[0]?.focus();
      return;
    }
    // Vacío es «no se acordó nada distinto», y rige el plazo de la Prestadora; no es cero.
    const plazo = plazoQueSePuedeGuardar(form.dias_hasta_el_vencimiento === '' ? '' : Number(form.dias_hasta_el_vencimiento));
    if (!plazo.ok) {
      setError(t.clientes.plazo_fuera_de_borde);
      return;
    }
    const condiciones = condicionesParaGuardar();
    if (!condiciones.ok) {
      // Las demás son listas cerradas o casillas: lo único que se puede cargar mal es el recargo.
      setRecargoMal(true);
      document.getElementsByName('recargo_del_adicional')[0]?.focus();
      return;
    }
    setGuardando(true);
    setError(null);
    const { error: falla } = await supabase
      .from('condiciones_comerciales_servicio')
      .update({
        dias_hasta_el_vencimiento: plazo.valor,
        pagador_tipo: form.pagador_tipo || null,
        pagador_persona_id: form.pagador_persona_id || null,
        contratante_persona_id: form.contratante_persona_id || null,
        ...condiciones.valores,
      })
      .eq('servicio_id', servicio.id);
    if (falla) {
      setGuardando(false);
      setError(mensajeDeError(falla, t));
      return;
    }
    if (textoDescuento !== String(descuentoGuardado).replace(',', '.')) {
      const { error: fallaDescuento } = await supabase.rpc('fijar_descuento_del_servicio', {
        p_servicio: servicio.id,
        p_porcentaje: porcentaje,
      });
      if (fallaDescuento) {
        setGuardando(false);
        setError(mensajeDeError(fallaDescuento, t));
        return;
      }
      const nuevo = porcentaje > 0 ? String(porcentaje) : '';
      setDescuento(nuevo);
      setDescuentoGuardado(nuevo);
    }
    setGuardando(false);
    setGuardado(true);
    // Lo guardado pasa a ser lo que está, y lo que se ve vuelve a salir de ahí.
    const nuevaFila = { ...fila, ...condiciones.valores };
    setFila(nuevaFila);
    setTocadas(new Set());
    setForm((f) => ({ ...f, ...condicionesVisiblesDe(nuevaFila, regla) }));
    onGuardado?.();
  }

  if (estado === 'cargando') return <p className="molde-vacio">{t.comun.cargando}</p>;
  if (estado === 'error') return <Alert variant="error">{errorDeCarga}</Alert>;

  return (
    <>
      {error && <Alert variant="error">{error}</Alert>}
      {guardado && <Alert variant="info">{t.comun.guardar} <span aria-hidden="true">✓</span></Alert>}
      <div className="molde-formgrid">
        <div className="molde-ancho">
          <SelectorDePersona
            name="contratante_persona_id"
            label={t.servicios.detalle.contratante}
            valor={form.contratante_persona_id}
            alElegir={(personaId) => setCampo('contratante_persona_id', personaId)}
            deshabilitado={!puedeEditar}
          />
        </div>
        <FormField
          label={t.clientes.pagador_tipo}
          name="pagador_tipo"
          type="select"
          value={form.pagador_tipo}
          onChange={(e) => setCampo('pagador_tipo', e.target.value)}
          disabled={!puedeEditar}
        >
          <option value="">{t.clientes.pagador_tipo_cliente}</option>
          {TIPOS_DE_PAGADOR_POSIBLES.filter((f) => f !== TIPOS_DE_PAGADOR.CLIENTE).map((f) => (
            <option key={f} value={f}>{traducirValor(t.clientes, `pagador_tipo_${f}`)}</option>
          ))}
        </FormField>
        <FormField
          label={t.clientes.plazo_de_pago}
          name="dias_hasta_el_vencimiento"
          type="number"
          min="0"
          max={PLAZO_MAXIMO_EN_DIAS}
          value={form.dias_hasta_el_vencimiento}
          onChange={(e) => setCampo('dias_hasta_el_vencimiento', e.target.value)}
          disabled={!puedeEditar}
        />
        <div className="molde-ancho">
          <SelectorDePersona
            name="pagador_persona_id"
            label={t.clientes.pagador_legajo}
            valor={form.pagador_persona_id}
            alElegir={(personaId) => setCampo('pagador_persona_id', personaId)}
            deshabilitado={!puedeEditar}
          />
        </div>
        <FormField
          label={tc.frecuencia_de_cobro}
          name="frecuencia_de_cobro"
          type="select"
          value={form.frecuencia_de_cobro}
          onChange={(e) => setCampo('frecuencia_de_cobro', e.target.value)}
          disabled={!puedeEditar}
        >
          {FRECUENCIAS_DE_COBRO_POSIBLES.map((valor) => (
            <option key={valor} value={valor}>
              {tc.valores.frecuencia_de_cobro[valor]}
            </option>
          ))}
        </FormField>
        <FormField
          label={tc.medicion}
          name="medicion"
          type="select"
          value={form.medicion}
          onChange={(e) => setCampo('medicion', e.target.value)}
          disabled={!puedeEditar}
        >
          {MEDICIONES_POSIBLES.map((valor) => (
            <option key={valor} value={valor}>
              {tc.valores.medicion[valor]}
            </option>
          ))}
        </FormField>
        {/* Sólo las condiciones que cambian algo con la medición elegida. */}
        {(CONDICIONES_DE_CADA_MEDICION[form.medicion] ?? []).map((clave) =>
          clave === 'recargo_del_adicional' ? (
            <FormField
              key={clave}
              label={tc.recargo_del_adicional}
              name={clave}
              type="number"
              min={BORDES.recargo_del_adicional.minimo}
              max={BORDES.recargo_del_adicional.maximo}
              step="1"
              value={form.recargo_del_adicional}
              error={recargoMal ? tc.recargo_fuera_de_borde : undefined}
              onChange={(e) => setCampo(clave, e.target.value)}
              disabled={!puedeEditar}
            />
          ) : (
            <div className="molde-ancho" key={clave}>
              <FormField
                label={tc[clave]}
                name={clave}
                type="checkbox"
                checked={form[clave] === true}
                onChange={(e) => setCampo(clave, e.target.checked)}
                disabled={!puedeEditar}
              />
            </div>
          )
        )}
        <FormField
          label={t.descuentos_del_servicio.campo}
          name="descuento"
          type="number"
          min="0"
          max="100"
          step="0.01"
          value={descuento}
          error={descuentoMal ? t.descuentos_del_servicio.error_porcentaje : undefined}
          onChange={(e) => {
            setDescuento(e.target.value);
            setDescuentoMal(false);
            setGuardado(false);
          }}
          disabled={!puedeEditar}
        />
      </div>
      {puedeEditar && (
        <div className="molde-acciones">
          <Button onClick={guardar} disabled={guardando}>
            {guardando ? t.comun.guardando : t.comun.guardar}
          </Button>
        </div>
      )}
      {/* Cómo se actualiza el precio de este Servicio. Lo construye otro trabajo, en su propio archivo. */}
      <ActualizacionDelServicio servicioId={servicio.id} />
      {/* Si el Responsable de pagos firmó y qué documentos faltan. Avisa, no bloquea. */}
      <EstadoDelPagador
        servicioId={servicio.id}
        clienteId={servicio.cliente_id}
        puedeRegistrar={puedeRegistrar}
        esAdmin={esAdmin}
      />
    </>
  );
}
