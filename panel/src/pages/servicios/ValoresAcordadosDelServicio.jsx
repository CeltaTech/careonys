import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { supabase } from '../../lib/supabaseClient';
import { formatearImporte } from '../../lib/dinero';
import { fechaVisible } from '../../lib/fechaVisible';
import { hoyISO } from '../../lib/horarios';
import { con } from '../../lib/textos';
import { mensajeDeError } from '../../lib/errores';
import { llamarApiConfiguracion } from '../../lib/apiConfiguracion';
import { nombreDeLaMoneda } from '../../lib/nombreDeLaMoneda';
import { leerEquipoDelServicio } from '../../lib/leerEquipoDelServicio';
import {
  CAMPOS_DEL_VALOR_ACORDADO,
  UNIDADES_ACORDADAS,
  esFechaRepetida,
  filaDelValorAcordado,
  primerCasilleroConAviso,
  revisarValorAcordado,
  valorAcordadoNuevo,
  valoresDelEquipo,
} from '../../lib/valoresAcordadosDelServicio';
import { useMonedaActual } from '../../hooks/useMonedaActual';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';
import { EstadoLista } from '../../components/layout/EstadoLista';
import '../../styles/molde-paginas.css';

/* El valor acordado con cada Asistente del equipo para este Servicio. Lo muestra ServicioDetalle
   sólo a la administración con el permiso `ver_pagos_asistente`; la base aplica el mismo corte. */
export function ValoresAcordadosDelServicio({ servicio }) {
  const { t, locale } = useLocale();
  const v = t.servicios.valores_acordados;
  const monedaDeLaSesion = useMonedaActual();

  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [equipo, setEquipo] = useState([]);
  const [filas, setFilas] = useState([]);
  const [monedas, setMonedas] = useState([]);
  const [monedaDeLaPrestadora, setMonedaDeLaPrestadora] = useState(null);

  // El Asistente al que se le está cargando un valor nuevo, y lo escrito.
  const [cargandoPara, setCargandoPara] = useState(null);
  const [escrito, setEscrito] = useState(null);
  const [intentado, setIntentado] = useState(false);
  const [avisoDeLaBase, setAvisoDeLaBase] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [errorAlGuardar, setErrorAlGuardar] = useState(null);
  const [guardado, setGuardado] = useState(false);

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    try {
      const [delEquipo, valores, moneda] = await Promise.all([
        leerEquipoDelServicio(supabase, servicio),
        supabase.from('valores_acordados_del_servicio').select(CAMPOS_DEL_VALOR_ACORDADO).eq('servicio_id', servicio.id),
        llamarApiConfiguracion('/moneda'),
      ]);
      if (valores.error) throw valores.error;
      setEquipo(delEquipo);
      setFilas(valores.data ?? []);
      setMonedas(moneda?.monedas ?? []);
      setMonedaDeLaPrestadora(moneda?.moneda ?? null);
      setEstado('listo');
    } catch (err) {
      setError(mensajeDeError(err, t));
      setEstado('error');
    }
  }, [servicio, t]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  const avisos = intentado && escrito ? revisarValorAcordado(escrito) : {};
  if (avisoDeLaBase && !avisos.rige_desde) avisos.rige_desde = avisoDeLaBase;
  const TEXTO_DEL_AVISO = {
    falta_el_dato: t.formularios.falta_un_dato_obligatorio,
    valor_no_valido: v.valor_no_valido,
    fecha_repetida: v.fecha_repetida,
  };
  const avisoDe = (casillero) => (avisos[casillero] ? TEXTO_DEL_AVISO[avisos[casillero]] : undefined);

  function abrir(asistenteId) {
    setCargandoPara(asistenteId);
    setEscrito(valorAcordadoNuevo({ hoy: hoyISO(), moneda: monedaDeLaPrestadora ?? monedaDeLaSesion }));
    setIntentado(false);
    setAvisoDeLaBase(null);
    setErrorAlGuardar(null);
    setGuardado(false);
  }

  function cerrar() {
    setCargandoPara(null);
    setEscrito(null);
    setIntentado(false);
    setAvisoDeLaBase(null);
    setErrorAlGuardar(null);
  }

  function set(campo, valor) {
    setEscrito((anterior) => ({ ...anterior, [campo]: valor }));
    if (campo === 'rige_desde') setAvisoDeLaBase(null);
  }

  async function guardar() {
    setIntentado(true);
    setAvisoDeLaBase(null);
    setErrorAlGuardar(null);
    const enPantalla = revisarValorAcordado(escrito);
    const primero = primerCasilleroConAviso(enPantalla);
    if (primero) {
      document.getElementById(`field-acordado_${primero}`)?.focus();
      return;
    }
    setGuardando(true);
    const { error: errorInsert } = await supabase.from('valores_acordados_del_servicio').insert(
      filaDelValorAcordado({
        prestadoraId: servicio.prestadora_id,
        servicioId: servicio.id,
        asistenteId: cargandoPara,
        escrito,
      }),
    );
    setGuardando(false);
    if (errorInsert) {
      if (esFechaRepetida(errorInsert)) {
        setAvisoDeLaBase('fecha_repetida');
        document.getElementById('field-acordado_rige_desde')?.focus();
        return;
      }
      setErrorAlGuardar(mensajeDeError(errorInsert, t));
      return;
    }
    cerrar();
    setGuardado(true);
    recargar();
  }

  const hoy = hoyISO();
  const renglones = valoresDelEquipo(equipo, filas, hoy);
  const nombreDelElegido = renglones.find((r) => r.asistente_id === cargandoPara)?.nombre ?? '';
  // La moneda elegida va en la lista aunque el catálogo no la traiga, para que el casillero no
  // quede en blanco.
  const monedasParaElegir =
    escrito?.moneda && !monedas.includes(escrito.moneda) ? [...monedas, escrito.moneda] : monedas;

  return (
    <section className="panel-tarjeta">
      <div className="panel-tarjeta-titulo">
        <h2>{v.titulo}</h2>
      </div>
      {guardado && <Alert variant="info">{t.comun.guardar} <span aria-hidden="true">✓</span></Alert>}
      <EstadoLista
        estado={estado}
        error={error}
        recargar={recargar}
        vacio={estado === 'listo' && renglones.length === 0}
        mensajeVacio={v.sin_equipo}
      >
        <div className="servicios-tabla-envoltura">
          <table className="panel-tabla">
            <thead>
              <tr>
                <th>{v.col_asistente}</th>
                <th>{v.col_valor}</th>
                <th>{v.col_unidad}</th>
                <th>{v.col_moneda}</th>
                <th>{v.col_rige_desde}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {renglones.map((r) => (
                <tr key={r.asistente_id}>
                  <td>{r.nombre}</td>
                  <td>{r.vigente ? formatearImporte(r.vigente.valor, r.vigente.moneda, locale) : v.sin_valor}</td>
                  <td>{r.vigente ? t.asistentes[`unidad_${r.vigente.unidad_medicion}`] ?? r.vigente.unidad_medicion : '—'}</td>
                  <td>{r.vigente?.moneda ?? '—'}</td>
                  <td>{r.vigente ? fechaVisible(r.vigente.rige_desde, locale) : '—'}</td>
                  <td>
                    <Button variant="secondary" onClick={() => abrir(r.asistente_id)} disabled={guardando}>
                      {v.nuevo_valor}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {cargandoPara && escrito && (
          <div className="molde-pila">
            <h3>{con(v.nuevo_valor_de, { nombre: nombreDelElegido })}</h3>
            {errorAlGuardar && <Alert variant="error">{errorAlGuardar}</Alert>}
            <div className="molde-formgrid">
              <FormField
                label={v.campo_rige_desde}
                name="acordado_rige_desde"
                type="date"
                required
                value={escrito.rige_desde}
                onChange={(e) => set('rige_desde', e.target.value)}
                error={avisoDe('rige_desde')}
              />
              <FormField
                label={v.campo_unidad}
                name="acordado_unidad_medicion"
                type="select"
                required
                value={escrito.unidad_medicion}
                onChange={(e) => set('unidad_medicion', e.target.value)}
                error={avisoDe('unidad_medicion')}
              >
                {UNIDADES_ACORDADAS.map((unidad) => (
                  <option key={unidad} value={unidad}>{t.asistentes[`unidad_${unidad}`] ?? unidad}</option>
                ))}
              </FormField>
              <FormField
                label={v.campo_valor}
                name="acordado_valor"
                type="number"
                min="0"
                step="any"
                required
                value={escrito.valor}
                onChange={(e) => set('valor', e.target.value)}
                error={avisoDe('valor')}
              />
              <FormField
                label={v.campo_moneda}
                name="acordado_moneda"
                type="select"
                required
                value={escrito.moneda}
                onChange={(e) => set('moneda', e.target.value)}
                error={avisoDe('moneda')}
              >
                {!escrito.moneda && <option value="" disabled>—</option>}
                {monedasParaElegir.map((codigo) => (
                  <option key={codigo} value={codigo}>{nombreDeLaMoneda(codigo, locale)}</option>
                ))}
              </FormField>
            </div>
            <div className="molde-acciones">
              <Button variant="secondary" onClick={cerrar} disabled={guardando}>{t.comun.cancelar}</Button>
              <Button onClick={guardar} disabled={guardando}>{guardando ? t.comun.guardando : t.comun.guardar}</Button>
            </div>
          </div>
        )}
      </EstadoLista>
    </section>
  );
}
