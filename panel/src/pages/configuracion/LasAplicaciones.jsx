import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { llamarApiConfiguracion as llamarApi } from '../../lib/apiConfiguracion';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';
import { Alert } from '../../components/ui/Alert';
import { EstadoLista } from '../../components/layout/EstadoLista';
import { mensajeDeError } from '../../lib/errores';
import '../../styles/molde-paginas.css';

/* Qué muestran las dos aplicaciones del teléfono.
   ==========================================================================

   Cada Prestadora decide qué ve el Cliente y qué ve el Asistente. Lo que se apaga acá no se
   esconde de la pantalla: deja de pedirse en la consulta, así que no sale de la base y no
   llega al teléfono de ninguna manera. Esconderlo en el maquetado sería dejarlo viajando, y
   cualquiera que sepa mirar por debajo lo vería igual (tarea 65).

   LA LISTA NO SE ESCRIBE ACÁ. Los interruptores, con su nombre y su explicación, viven
   en `backend/src/utils/catalogoVisibilidad.js`, que es el único lugar donde se agrega o se
   saca una (CLAUDE.md §7 regla 12). Esta pantalla dibuja lo que le llega: un interruptor nuevo
   aparece sola, sin tocar este archivo.

   Los textos salen de las traducciones, no de lo que manda el servidor: el catálogo está
   escrito en español y solo (regla 1). La descripción del servidor queda de respaldo por si
   alguna vez llega un interruptor que las traducciones todavía no conocen — es preferible un
   renglón en español antes que un renglón en blanco. Es el mismo camino que la lista de
   avisos de Configuración › Avisos.

   Se guarda con un solo botón y se manda un solo interruptor por vez, porque así es la ruta del
   servidor. Solo viajan las que cambiaron: tocar una casilla y arrepentirse no escribe nada. */

const APLICACIONES = ['clientes', 'asistentes'];

export function ConfiguracionAplicaciones() {
  return (
    <>
      <QueMuestranLasAplicaciones />
      <UbicacionDelAsistente />
    </>
  );
}

/* Cómo se toma la ubicación del Asistente. Hay viaje en las dos formas: desde «Salgo ahora»
   hasta el check-in se sigue continuo. La diferencia es la guardia: con «Viaje y turno» se hace
   un control cada tantos minutos, que anota sólo si estaba dentro o fuera del domicilio; con
   «Sólo viaje» no hay control, y queda la ubicación del check-in y del check-out. */
function UbicacionDelAsistente() {
  const { t } = useLocale();
  const [enElTurno, setEnElTurno] = useState(true);
  const [minutos, setMinutos] = useState('');
  const [errorMinutos, setErrorMinutos] = useState(null);
  const [dias, setDias] = useState('');
  const [errorDias, setErrorDias] = useState(null);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    try {
      const datos = await llamarApi('/ubicacion-del-asistente');
      setEnElTurno(datos.control_de_ubicacion_en_el_turno);
      setMinutos(datos.minutos_entre_controles_de_ubicacion);
      setDias(datos.dias_para_aceptar_la_ubicacion);
      setEstado('listo');
    } catch (err) {
      setError(mensajeDeError(err, t));
      setEstado('error');
    }
  }, [t]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  function minutosValidos(valor) {
    const n = Number(valor);
    return Number.isInteger(n) && n >= 1 && n <= 60;
  }

  function diasValidos(valor) {
    const n = Number(valor);
    return Number.isInteger(n) && n >= 1 && n <= 365;
  }

  async function guardar() {
    // Con «Sólo viaje» los dos campos están escondidos y guardan lo que tenían.
    const faltaMinutos = enElTurno && !minutosValidos(minutos);
    const faltaDias = enElTurno && !diasValidos(dias);
    setErrorMinutos(faltaMinutos ? t.configuracion.ubicacion_minutos_fuera_de_rango : null);
    setErrorDias(faltaDias ? t.configuracion.ubicacion_dias_fuera_de_rango : null);
    if (faltaMinutos || faltaDias) {
      const primero = faltaMinutos ? 'minutos_entre_controles_de_ubicacion' : 'dias_para_aceptar_la_ubicacion';
      document.getElementById(`field-${primero}`)?.focus();
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await llamarApi('/ubicacion-del-asistente', {
        method: 'PATCH',
        body: JSON.stringify({
          control_de_ubicacion_en_el_turno: enElTurno,
          minutos_entre_controles_de_ubicacion: Number(minutos),
          dias_para_aceptar_la_ubicacion: Number(dias),
        }),
      });
      setGuardado(true);
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="panel-tarjeta">
      <div className="panel-tarjeta-titulo">
        <h2>{t.configuracion.ubicacion_titulo}</h2>
      </div>
      <EstadoLista estado={estado} error={error} vacio={false} recargar={recargar}>
        <>
          {error && <Alert variant="error">{error}</Alert>}
          {guardado && <Alert variant="info">{t.configuracion.visibilidad_guardado}</Alert>}
          <div className="molde-formgrid">
            <FormField
              label={t.configuracion.ubicacion_forma}
              name="control_de_ubicacion_en_el_turno"
              type="select"
              value={enElTurno ? 'viaje_y_turno' : 'solo_viaje'}
              onChange={(e) => { setEnElTurno(e.target.value === 'viaje_y_turno'); setGuardado(false); }}
            >
              <option value="viaje_y_turno">{t.configuracion.ubicacion_viaje_y_turno}</option>
              <option value="solo_viaje">{t.configuracion.ubicacion_solo_viaje}</option>
            </FormField>
            {enElTurno && (
              <>
                <FormField
                  label={t.configuracion.ubicacion_minutos}
                  name="minutos_entre_controles_de_ubicacion"
                  type="number"
                  min="1"
                  max="60"
                  unidad={t.configuracion.escalada_repetir_emergencia_unidad}
                  value={minutos}
                  error={errorMinutos}
                  onChange={(e) => {
                    setMinutos(e.target.value);
                    setGuardado(false);
                    if (minutosValidos(e.target.value)) setErrorMinutos(null);
                  }}
                />
                <FormField
                  label={t.configuracion.ubicacion_dias}
                  name="dias_para_aceptar_la_ubicacion"
                  type="number"
                  min="1"
                  max="365"
                  unidad={t.configuracion.ubicacion_dias_unidad}
                  value={dias}
                  error={errorDias}
                  onChange={(e) => {
                    setDias(e.target.value);
                    setGuardado(false);
                    if (diasValidos(e.target.value)) setErrorDias(null);
                  }}
                />
              </>
            )}
          </div>
          <div className="molde-acciones">
            <Button onClick={guardar} disabled={guardando}>{guardando ? t.comun.guardando : t.comun.guardar}</Button>
          </div>
        </>
      </EstadoLista>
    </section>
  );
}

function QueMuestranLasAplicaciones() {
  const { t } = useLocale();
  const [interruptores, setInterruptores] = useState([]);
  const [elegido, setElegido] = useState({});
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    try {
      const { visibilidad } = await llamarApi('/visibilidad-app');
      setInterruptores(visibilidad);
      setElegido(Object.fromEntries(visibilidad.map((p) => [p.clave, p.visible])));
      setEstado('listo');
    } catch (err) {
      setError(mensajeDeError(err, t));
      setEstado('error');
    }
  }, [t]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  function cambiar(clave, valor) {
    setElegido((anterior) => ({ ...anterior, [clave]: valor }));
    setGuardado(false);
  }

  const cambiadas = interruptores.filter((p) => elegido[p.clave] !== p.visible);

  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      // De a una y en orden: si una falla, la recarga de abajo muestra exactamente cuáles
      // quedaron guardadas, en vez de dejar la pantalla diciendo algo que no pasó.
      for (const interruptor of cambiadas) {
        await llamarApi(`/visibilidad-app/${interruptor.clave}`, {
          method: 'PATCH',
          body: JSON.stringify({ visible: elegido[interruptor.clave] }),
        });
      }
      setGuardado(true);
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setGuardando(false);
      recargar();
    }
  }

  return (
    <section className="panel-tarjeta">
      <div className="panel-tarjeta-titulo">
        <h2>{t.configuracion.visibilidad_titulo}</h2>
      </div>
      <EstadoLista
        estado={estado}
        error={error}
        vacio={estado === 'listo' && interruptores.length === 0}
        recargar={recargar}
      >
        <>
          {error && <Alert variant="error">{error}</Alert>}
          {guardado && <Alert variant="info">{t.configuracion.visibilidad_guardado}</Alert>}

          <div className="panel-grilla panel-columnas-2">
            {APLICACIONES.map((app) => (
              <div key={app}>
                <h3>{t.configuracion[`visibilidad_grupo_${app}`]}</h3>
                <div className="molde-formgrid">
                  {interruptores
                    .filter((interruptor) => interruptor.app === app)
                    .map((interruptor) => (
                      <div key={interruptor.clave} className="molde-ancho">
                        <FormField
                          label={t.configuracion[`visibilidad_${interruptor.clave}`] || interruptor.descripcion}
                          name={interruptor.clave}
                          type="checkbox"
                          checked={elegido[interruptor.clave] ?? interruptor.de_fabrica}
                          onChange={(e) => cambiar(interruptor.clave, e.target.checked)}
                        />
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>

          <div className="molde-acciones">
            <Button onClick={guardar} disabled={guardando || cambiadas.length === 0}>
              {guardando ? t.comun.guardando : t.comun.guardar}
            </Button>
          </div>
        </>
      </EstadoLista>
    </section>
  );
}
