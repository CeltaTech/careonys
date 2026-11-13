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
  FRECUENCIAS_DE_COBRO_POSIBLES,
  MEDICIONES_POSIBLES,
  condicionDelServicioQueSePuedeGuardar,
} from '../../lib/condicionesDelCliente';
import { ActualizacionDelServicio } from '../../components/ActualizacionDelServicio';
import '../../styles/molde-paginas.css';

/* Lo comercial de un Servicio: quién contrata, quién paga, en qué plazo, y si quien paga firmó.
   ==========================================================================

   Es del Servicio y no del Cliente: un mismo Cliente puede tener dos Servicios con distinto
   Responsable de pagos. La deuda sigue siendo del Cliente. Las personas se eligen del Directorio
   de Personas y no se teclean.

   Vive en su propia tabla, que la base le abre sólo a quien tiene el permiso de lo comercial o el
   de lo que firma el Responsable de pagos. */
function formDe(condiciones) {
  const dias = condiciones?.dias_hasta_el_vencimiento;
  return {
    dias_hasta_el_vencimiento: dias === null || dias === undefined ? '' : String(dias),
    pagador_tipo: condiciones?.pagador_tipo || '',
    pagador_persona_id: condiciones?.pagador_persona_id || null,
    contratante_persona_id: condiciones?.contratante_persona_id || null,
    // Vacío: rige la de la configuración de facturación de la Prestadora.
    frecuencia_de_cobro: condiciones?.frecuencia_de_cobro || '',
    medicion: condiciones?.medicion || '',
  };
}

export function PagosDelServicio({ servicio, puedeEditar, puedeRegistrar, esAdmin, onGuardado }) {
  const { t } = useLocale();
  const [form, setForm] = useState(() => formDe(null));
  const [estado, setEstado] = useState('cargando');
  const [errorDeCarga, setErrorDeCarga] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const [guardado, setGuardado] = useState(false);

  const cargar = useCallback(async () => {
    setEstado('cargando');
    setErrorDeCarga(null);
    const { data, error: falla } = await supabase
      .from('condiciones_comerciales_servicio')
      .select('contratante_persona_id, pagador_tipo, pagador_persona_id, dias_hasta_el_vencimiento, frecuencia_de_cobro, medicion')
      .eq('servicio_id', servicio.id)
      .maybeSingle();
    if (falla) {
      setErrorDeCarga(mensajeDeError(falla, t));
      setEstado('error');
      return;
    }
    setForm(formDe(data));
    setEstado('listo');
  }, [servicio.id, t]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  function setCampo(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }));
    setGuardado(false);
  }

  async function guardar() {
    // Vacío es «no se acordó nada distinto», y rige el plazo de la Prestadora; no es cero.
    const plazo = plazoQueSePuedeGuardar(form.dias_hasta_el_vencimiento === '' ? '' : Number(form.dias_hasta_el_vencimiento));
    if (!plazo.ok) {
      setError(t.clientes.plazo_fuera_de_borde);
      return;
    }
    const frecuencia = condicionDelServicioQueSePuedeGuardar('frecuencia_de_cobro', form.frecuencia_de_cobro);
    const medicion = condicionDelServicioQueSePuedeGuardar('medicion', form.medicion);
    if (!frecuencia.ok || !medicion.ok) {
      setError(t.configuracion.condiciones_cliente.valor_no_valido);
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
        frecuencia_de_cobro: frecuencia.valor,
        medicion: medicion.valor,
      })
      .eq('servicio_id', servicio.id);
    setGuardando(false);
    if (falla) {
      setError(mensajeDeError(falla, t));
      return;
    }
    setGuardado(true);
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
          label={t.configuracion.condiciones_cliente.frecuencia_de_cobro}
          name="frecuencia_de_cobro"
          type="select"
          value={form.frecuencia_de_cobro}
          onChange={(e) => setCampo('frecuencia_de_cobro', e.target.value)}
          disabled={!puedeEditar}
        >
          <option value="">{t.configuracion.condiciones_cliente.la_de_la_configuracion}</option>
          {FRECUENCIAS_DE_COBRO_POSIBLES.map((valor) => (
            <option key={valor} value={valor}>
              {t.configuracion.condiciones_cliente.valores.frecuencia_de_cobro[valor]}
            </option>
          ))}
        </FormField>
        <FormField
          label={t.configuracion.condiciones_cliente.medicion}
          name="medicion"
          type="select"
          value={form.medicion}
          onChange={(e) => setCampo('medicion', e.target.value)}
          disabled={!puedeEditar}
        >
          <option value="">{t.configuracion.condiciones_cliente.la_de_la_configuracion}</option>
          {MEDICIONES_POSIBLES.map((valor) => (
            <option key={valor} value={valor}>
              {t.configuracion.condiciones_cliente.valores.medicion[valor]}
            </option>
          ))}
        </FormField>
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
