import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { traducirValor } from '../../i18n/valores';
import { supabase } from '../../lib/supabaseClient';
import { mensajeDeError } from '../../lib/errores';
import { llamarApiCobros } from '../../lib/apiCobros';
import { avisar } from '../../lib/mensajeEmergente';
import { hoyISO } from '../../lib/horarios';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';
import { SelectorDePersona } from '../../components/personas/SelectorDePersona';
import { TIPOS_DE_PAGADOR, TIPOS_DE_PAGADOR_POSIBLES } from '../../lib/facturacionDeClientes';
import {
  ALTA_VACIA,
  cuerpoDelAlta,
  faltantesDelAlta,
  hastaAntesDelDesde,
  hastaParaGuardar,
  separarPorVigencia,
} from '../../lib/responsableDePagosDelServicio';
import '../../styles/molde-paginas.css';
import '../tarjetas.css';

/* Los Responsables de pagos de un Servicio.
   ==========================================================================

   Un Servicio puede tener varios a la vez, cada uno con su desde y su hasta. Arriba van los que
   rigen o van a regir; abajo, los que ya terminaron, sólo para leer.

   La factura sale a nombre del Contratante, salvo en los días en que un Responsable de pagos lleva
   la marca de que se le facture a él. La marca la lleva uno solo por día: la base lo hace cumplir y
   el backend devuelve el motivo, que acá se muestra.

   Cada cambio lo guarda el backend en el momento. Al terminar se avisa a la pantalla que lo contiene,
   para que vuelva a leer la firma de cada Responsable de pagos. */
const SELECT_DE_RESPONSABLES = 'id, pagador_persona_id, pagador_tipo, vigente_desde, vigente_hasta, factura_al_responsable';

function fecha(dia, locale) {
  if (!dia) return null;
  const [anio, mes, diaDelMes] = dia.split('-').map(Number);
  return new Date(anio, mes - 1, diaDelMes).toLocaleDateString(locale);
}

export function ResponsablesDePagosDelServicio({ servicioId, puedeEditar, alCambiar }) {
  const { t, locale } = useLocale();
  const textos = t.clientes.responsables_de_pagos;
  const [estado, setEstado] = useState('cargando');
  const [errorDeCarga, setErrorDeCarga] = useState(null);
  const [responsables, setResponsables] = useState([]);
  const [nombres, setNombres] = useState({});
  const [error, setError] = useState(null);
  const [trabajando, setTrabajando] = useState(false);
  const [alta, setAlta] = useState(null);
  const [faltan, setFaltan] = useState([]);
  const [editandoHasta, setEditandoHasta] = useState(null);
  const [hastaMal, setHastaMal] = useState(false);

  const cargar = useCallback(async () => {
    setEstado('cargando');
    setErrorDeCarga(null);
    const { data, error: falla } = await supabase
      .from('pagadores_del_servicio')
      .select(SELECT_DE_RESPONSABLES)
      .eq('servicio_id', servicioId);
    if (falla) {
      setErrorDeCarga(mensajeDeError(falla, t));
      setEstado('error');
      return;
    }
    const filas = data ?? [];
    const ids = [...new Set(filas.map((fila) => fila.pagador_persona_id).filter(Boolean))];
    let porId = {};
    if (ids.length > 0) {
      const { data: personas, error: fallaPersonas } = await supabase
        .from('personas')
        .select('id, nombre_visible')
        .in('id', ids);
      if (fallaPersonas) {
        setErrorDeCarga(mensajeDeError(fallaPersonas, t));
        setEstado('error');
        return;
      }
      porId = Object.fromEntries((personas ?? []).map((persona) => [persona.id, persona.nombre_visible]));
    }
    setResponsables(filas);
    setNombres(porId);
    setEstado('listo');
  }, [servicioId, t]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Toda operación pasa por acá: apaga los botones mientras corre, muestra el motivo si falla y
  // vuelve a leer si salió bien.
  async function operar(metodo, camino, cuerpo) {
    setTrabajando(true);
    setError(null);
    try {
      await llamarApiCobros(camino, { method: metodo, body: JSON.stringify(cuerpo) });
    } catch (falla) {
      setError(mensajeDeError(falla, t));
      setTrabajando(false);
      return false;
    }
    setTrabajando(false);
    avisar(textos.guardado);
    await cargar();
    alCambiar?.();
    return true;
  }

  function cambiarAlta(campo, valor) {
    setAlta((antes) => ({ ...antes, [campo]: valor }));
    setFaltan((antes) => (valor ? antes.filter((f) => f !== campo) : antes));
  }

  async function agregar() {
    const faltantes = faltantesDelAlta(alta);
    setFaltan(faltantes);
    if (faltantes.length > 0) {
      document.getElementsByName(`alta_${faltantes[0]}`)[0]?.focus();
      return;
    }
    const ok = await operar('POST', `/servicios/${servicioId}/responsables-de-pagos`, cuerpoDelAlta(alta));
    if (ok) {
      setAlta(null);
      setFaltan([]);
    }
  }

  async function guardarHasta(responsable) {
    if (hastaAntesDelDesde(responsable.vigente_desde, editandoHasta.valor)) {
      setHastaMal(true);
      document.getElementsByName('hasta_del_responsable')[0]?.focus();
      return;
    }
    const ok = await operar(
      'PUT',
      `/servicios/${servicioId}/responsables-de-pagos/${responsable.id}/hasta`,
      { hasta: hastaParaGuardar(editandoHasta.valor) },
    );
    if (ok) setEditandoHasta(null);
  }

  function cambiarMarca(responsable) {
    operar(
      'PUT',
      `/servicios/${servicioId}/responsables-de-pagos/${responsable.id}/factura`,
      { encendida: !responsable.factura_al_responsable },
    );
  }

  function tipoDe(tipo) {
    return tipo ? traducirValor(t.clientes, `pagador_tipo_${tipo}`) : t.clientes.pagador_tipo_cliente;
  }

  if (estado === 'cargando' || estado === 'error') {
    return (
      <section className="panel-tarjeta">
        <div className="panel-tarjeta-titulo">
          <h2>{textos.titulo}</h2>
        </div>
        {estado === 'cargando' ? <p className="molde-vacio">{t.comun.cargando}</p> : <Alert variant="error">{errorDeCarga}</Alert>}
      </section>
    );
  }

  const { vigentes, anteriores } = separarPorVigencia(responsables, hoyISO());

  function filaDe(responsable, editable) {
    const editaEste = editable && editandoHasta?.id === responsable.id;
    return (
      <tr key={responsable.id}>
        <td><b>{nombres[responsable.pagador_persona_id] ?? '—'}</b></td>
        <td>{tipoDe(responsable.pagador_tipo)}</td>
        <td>{fecha(responsable.vigente_desde, locale)}</td>
        <td>
          {editaEste ? (
            <FormField
              label={textos.col_hasta}
              name="hasta_del_responsable"
              type="date"
              value={editandoHasta.valor}
              error={hastaMal ? t.errores.motivos.responsable_de_pagos_hasta_antes_del_desde : undefined}
              onChange={(e) => {
                setEditandoHasta({ id: responsable.id, valor: e.target.value });
                setHastaMal(false);
              }}
              disabled={trabajando}
            />
          ) : (
            fecha(responsable.vigente_hasta, locale) ?? textos.sin_fin
          )}
        </td>
        <td>
          {responsable.factura_al_responsable
            ? <span className="badge badge-exito">{t.comun.si}</span>
            : t.comun.no}
        </td>
        {editable && (
          <td>
            {editaEste ? (
              <>
                <Button onClick={() => guardarHasta(responsable)} disabled={trabajando}>
                  {trabajando ? t.comun.guardando : t.comun.guardar}
                </Button>{' '}
                <Button variant="secondary" onClick={() => setEditandoHasta(null)} disabled={trabajando}>
                  {t.comun.cancelar}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setEditandoHasta({ id: responsable.id, valor: responsable.vigente_hasta ?? '' });
                    setHastaMal(false);
                  }}
                  disabled={trabajando}
                >
                  {textos.cambiar_hasta}
                </Button>{' '}
                <Button variant="secondary" onClick={() => cambiarMarca(responsable)} disabled={trabajando}>
                  {responsable.factura_al_responsable ? textos.dejar_de_facturarle : textos.facturarle}
                </Button>
              </>
            )}
          </td>
        )}
      </tr>
    );
  }

  function tabla(filas, editable) {
    return (
      <div className="tarjeta-desplazable">
        <table className="panel-tabla">
          <thead>
            <tr>
              <th>{textos.col_responsable}</th>
              <th>{textos.col_tipo}</th>
              <th>{textos.col_desde}</th>
              <th>{textos.col_hasta}</th>
              <th>{textos.col_factura}</th>
              {editable && <th>{textos.col_acciones}</th>}
            </tr>
          </thead>
          <tbody>{filas.map((responsable) => filaDe(responsable, editable))}</tbody>
        </table>
      </div>
    );
  }

  const faltaDato = (campo) => (faltan.includes(campo) ? t.formularios.falta_un_dato_obligatorio : undefined);

  return (
    <section className="panel-tarjeta">
      <div className="panel-tarjeta-titulo">
        <h2>{textos.titulo}</h2>
      </div>
      {error && <Alert variant="error">{error}</Alert>}

      {vigentes.length > 0 ? tabla(vigentes, puedeEditar) : <p className="molde-vacio">{textos.sin_responsables}</p>}

      {puedeEditar && !alta && (
        <div className="molde-acciones">
          <Button variant="secondary" onClick={() => setAlta({ ...ALTA_VACIA })} disabled={trabajando}>
            {textos.agregar}
          </Button>
        </div>
      )}

      {puedeEditar && alta && (
        <>
          <h3>{textos.agregar}</h3>
          <div className="molde-formgrid">
            <div className="molde-ancho">
              <SelectorDePersona
                name="alta_persona_id"
                label={textos.col_responsable}
                valor={alta.persona_id}
                alElegir={(personaId) => cambiarAlta('persona_id', personaId)}
                required
                error={faltaDato('persona_id')}
                deshabilitado={trabajando}
              />
            </div>
            <FormField
              label={textos.col_tipo}
              name="alta_tipo"
              type="select"
              value={alta.tipo}
              onChange={(e) => cambiarAlta('tipo', e.target.value)}
              disabled={trabajando}
            >
              <option value="">{t.clientes.pagador_tipo_cliente}</option>
              {TIPOS_DE_PAGADOR_POSIBLES.filter((f) => f !== TIPOS_DE_PAGADOR.CLIENTE).map((f) => (
                <option key={f} value={f}>{traducirValor(t.clientes, `pagador_tipo_${f}`)}</option>
              ))}
            </FormField>
            <FormField
              label={textos.col_desde}
              name="alta_desde"
              type="date"
              required
              value={alta.desde}
              error={faltaDato('desde')}
              onChange={(e) => cambiarAlta('desde', e.target.value)}
              disabled={trabajando}
            />
            <div className="molde-ancho">
              <FormField
                label={t.clientes.factura_al_responsable}
                name="alta_factura_al_responsable"
                type="checkbox"
                checked={alta.factura_al_responsable === true}
                onChange={(e) => cambiarAlta('factura_al_responsable', e.target.checked)}
                disabled={trabajando}
              />
            </div>
          </div>
          <div className="molde-acciones">
            <Button variant="secondary" onClick={() => { setAlta(null); setFaltan([]); }} disabled={trabajando}>
              {t.comun.cancelar}
            </Button>
            <Button onClick={agregar} disabled={trabajando}>
              {trabajando ? t.comun.guardando : textos.agregar_confirmar}
            </Button>
          </div>
        </>
      )}

      {anteriores.length > 0 && (
        <>
          <h3>{textos.anteriores}</h3>
          {tabla(anteriores, false)}
        </>
      )}
    </section>
  );
}
