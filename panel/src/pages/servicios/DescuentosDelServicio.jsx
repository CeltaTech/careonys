import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { useConfirmarDestructivo } from '../../context/ConfirmacionContext';
import { usePrestadoraActual } from '../../hooks/usePrestadoraActual';
import { useMonedaActual } from '../../hooks/useMonedaActual';
import { supabase } from '../../lib/supabaseClient';
import { mensajeDeError } from '../../lib/errores';
import { formatearImporte } from '../../lib/dinero';
import { fechaVisible } from '../../lib/fechaVisible';
import { hoyISO } from '../../lib/horarios';
import { claseBadge } from '../../lib/tonos';
import { CLASES_DE_DESCUENTO } from '../../lib/descuentosDelPeriodo';
import {
  AVISOS,
  avisosDelDescuento,
  camposVisibles,
  filaDelDescuento,
  formularioVacio,
  sigueVigente,
} from '../../lib/formularioDelDescuento';
import { EstadoLista } from '../../components/layout/EstadoLista';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';

/* Los descuentos de un Cliente en su Servicio: cuáles tiene, el alta de uno nuevo y la
   terminación de uno que sigue corriendo.
   ==========================================================================

   Un descuento no se edita ni se borra: se termina, y la base anota quién y cuándo. Para cambiar
   uno se termina y se carga otro. Quién lo cargó, cuándo y la terminación los escribe la base
   (`descuentos_del_servicio`), y cada alta y cada terminación quedan en el registro de actividad.

   El formulario se declara en `lib/formularioDelDescuento.js` y acá se dibuja con un solo bucle.
   Cuánto resta en cada período lo calcula `lib/descuentosDelPeriodo.js` al facturar. */

const COLUMNAS = 'id, clase, valor, moneda, vigente_desde, cantidad_de_periodos, vigente_hasta, motivo, cargado_en, terminado_en';

export function DescuentosDelServicio({ servicio, puedeEditar = false }) {
  const { t, locale } = useLocale();
  const td = t.descuentos_del_servicio;
  const prestadoraId = usePrestadoraActual();
  const moneda = useMonedaActual();
  const confirmarDestructivo = useConfirmarDestructivo();
  const servicioId = servicio?.id ?? null;

  const [estado, setEstado] = useState('cargando');
  const [errorDeCarga, setErrorDeCarga] = useState(null);
  const [descuentos, setDescuentos] = useState([]);

  const [abierto, setAbierto] = useState(false);
  const [form, setForm] = useState(() => formularioVacio(hoyISO()));
  const [avisos, setAvisos] = useState({});
  const [intentoGuardar, setIntentoGuardar] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [terminando, setTerminando] = useState(null);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const formRef = useRef(null);

  const cargar = useCallback(async () => {
    if (!servicioId) return;
    setEstado('cargando');
    setErrorDeCarga(null);
    const { data, error: falla } = await supabase
      .from('descuentos_del_servicio')
      .select(COLUMNAS)
      .eq('servicio_id', servicioId)
      .order('vigente_desde', { ascending: false })
      .order('cargado_en', { ascending: false });
    if (falla) {
      setErrorDeCarga(mensajeDeError(falla, t, 'descuentos del Servicio'));
      setEstado('error');
      return;
    }
    setDescuentos(data ?? []);
    setEstado((data ?? []).length === 0 ? 'vacio' : 'listo');
  }, [servicioId, t]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  function cambiar(clave, valor) {
    const siguiente = { ...form, [clave]: valor };
    setForm(siguiente);
    // Antes de apretar guardar no se avisa nada; después, el aviso se va en cuanto el dato se completa.
    if (intentoGuardar) setAvisos(avisosDelDescuento(siguiente));
  }

  function abrir() {
    setForm(formularioVacio(hoyISO()));
    setAvisos({});
    setIntentoGuardar(false);
    setError(null);
    setAviso(null);
    setAbierto(true);
  }

  function cerrar() {
    setAbierto(false);
    setError(null);
  }

  function textoDelAviso(codigo) {
    switch (codigo) {
      case AVISOS.FALTA:
        return t.formularios.falta_un_dato_obligatorio;
      case AVISOS.VALOR_NO_POSITIVO:
        return td.error_valor_positivo;
      case AVISOS.PORCENTAJE_MAYOR_A_CIEN:
        return td.error_porcentaje_hasta_cien;
      case AVISOS.PERIODOS_FUERA_DE_RANGO:
        return td.error_periodos_enteros;
      case AVISOS.FECHAS_AL_REVES:
        return td.error_fechas_al_reves;
      case AVISOS.TEXTO_LARGO:
        return td.error_motivo_largo;
      default:
        return undefined;
    }
  }

  async function guardar() {
    const encontrados = avisosDelDescuento(form);
    setIntentoGuardar(true);
    setAvisos(encontrados);
    const primero = Object.keys(encontrados)[0];
    if (primero) {
      formRef.current?.querySelector(`#field-${primero}`)?.focus();
      return;
    }
    if (form.clase === CLASES_DE_DESCUENTO.MONTO && !moneda) {
      setError(t.errores.dato_invalido);
      return;
    }

    setGuardando(true);
    setError(null);
    const { error: falla } = await supabase
      .from('descuentos_del_servicio')
      .insert(filaDelDescuento(form, { prestadoraId, servicioId, moneda }));
    setGuardando(false);
    if (falla) {
      setError(mensajeDeError(falla, t, 'alta de descuento'));
      return;
    }
    setAbierto(false);
    setAviso(td.guardado);
    cargar();
  }

  async function terminar(descuento) {
    if (!(await confirmarDestructivo({ texto: td.confirmar_terminar, confirmar: td.terminar }))) return;
    setTerminando(descuento.id);
    setError(null);
    setAviso(null);
    const { data, error: falla } = await supabase
      .from('descuentos_del_servicio')
      .update({ terminado_en: new Date().toISOString() })
      .eq('id', descuento.id)
      .select('id');
    setTerminando(null);
    if (falla) {
      setError(mensajeDeError(falla, t, 'terminación de descuento'));
      return;
    }
    if (!data || data.length === 0) {
      setError(t.errores.sin_permiso);
      return;
    }
    setAviso(td.terminado);
    cargar();
  }

  function etiquetaDe(campo) {
    if (campo.clave === 'valor') {
      const unidad = form.clase === CLASES_DE_DESCUENTO.MONTO ? moneda ?? '' : '%';
      return unidad ? `${td.campo_valor} (${unidad})` : td.campo_valor;
    }
    return td[`campo_${campo.clave}`];
  }

  function opcionesDe(campo) {
    const prefijo = campo.clave === 'clase' ? 'clase_' : 'duracion_';
    return campo.opciones.map((valor) => (
      <option key={valor} value={valor}>{td[`${prefijo}${valor}`]}</option>
    ));
  }

  function casillero(campo) {
    const comun = {
      key: campo.clave,
      label: etiquetaDe(campo),
      name: campo.clave,
      required: campo.obligatorio,
      value: form[campo.clave] ?? '',
      onChange: (e) => cambiar(campo.clave, e.target.value),
      disabled: guardando,
      error: textoDelAviso(avisos[campo.clave]),
    };
    switch (campo.tipo) {
      case 'lista':
        return <FormField {...comun} type="select">{opcionesDe(campo)}</FormField>;
      case 'numero':
        return <FormField {...comun} type="number" min="0" step="0.01" inputMode="decimal" />;
      case 'entero':
        return <FormField {...comun} type="number" min="1" step="1" inputMode="numeric" />;
      case 'fecha':
        return <FormField {...comun} type="date" />;
      case 'texto_largo':
        return <FormField {...comun} type="textarea" rows={2} />;
      default:
        return <FormField {...comun} />;
    }
  }

  function valorVisible(d) {
    return d.clase === CLASES_DE_DESCUENTO.MONTO ? formatearImporte(d.valor, d.moneda, locale) : `${Number(d.valor)} %`;
  }

  function finVisible(d) {
    if (d.vigente_hasta) return fechaVisible(d.vigente_hasta, locale);
    return td.periodos.replace('{{cantidad}}', String(d.cantidad_de_periodos));
  }

  if (!servicioId) return null;
  const hoy = hoyISO();

  return (
    <section className="molde-ancho">
      <h3>{td.titulo}</h3>
      {error && <Alert variant="error">{error}</Alert>}
      {aviso && <Alert variant="info">{aviso}</Alert>}

      {abierto && (
        <div ref={formRef}>
          <div className="molde-formgrid">{camposVisibles(form).map(casillero)}</div>
          <div className="molde-acciones">
            <Button variant="secondary" onClick={cerrar} disabled={guardando}>
              {t.comun.cancelar}
            </Button>
            <Button onClick={guardar} disabled={guardando}>
              {guardando ? t.comun.guardando : t.comun.guardar}
            </Button>
          </div>
        </div>
      )}

      {puedeEditar && !abierto && (
        <div className="molde-acciones">
          <Button onClick={abrir}>{td.nuevo}</Button>
        </div>
      )}

      <EstadoLista estado={estado} error={errorDeCarga} recargar={cargar}>
        <div className="servicios-tabla-envoltura">
          <table className="panel-tabla">
            <thead>
              <tr>
                <th>{td.col_valor}</th>
                <th>{td.col_desde}</th>
                <th>{td.col_hasta}</th>
                <th>{td.col_motivo}</th>
                <th>{td.col_estado}</th>
                {puedeEditar && <th aria-label={td.terminar} />}
              </tr>
            </thead>
            <tbody>
              {descuentos.map((d) => {
                const vigente = sigueVigente(d, hoy);
                return (
                  <tr key={d.id}>
                    <td>{valorVisible(d)}</td>
                    <td>{fechaVisible(d.vigente_desde, locale)}</td>
                    <td>{finVisible(d)}</td>
                    <td>{d.motivo || '—'}</td>
                    <td>
                      <span className={claseBadge(vigente ? 'vigente' : 'terminada')}>
                        {vigente ? td.estado_vigente : td.estado_terminado}
                      </span>
                    </td>
                    {puedeEditar && (
                      <td>
                        {vigente && (
                          <Button
                            variant="secondary"
                            onClick={() => terminar(d)}
                            disabled={terminando !== null}
                          >
                            {terminando === d.id ? t.comun.guardando : td.terminar}
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </EstadoLista>
    </section>
  );
}
