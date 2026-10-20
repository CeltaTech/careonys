import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { llamarApiConfiguracion as llamarApi } from '../../lib/apiConfiguracion';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { EstadoLista } from '../../components/layout/EstadoLista';
import { con } from '../../lib/textos';
import { mensajeDeError } from '../../lib/errores';
import { avisar } from '../../lib/mensajeEmergente';
import {
  NIVELES,
  NOMBRES_DE_PERFIL,
  PERFILES,
  SITUACIONES_PONDERABLES,
  TOPES_QUE_SE_PUEDEN_TOCAR,
  PESOS,
  TOPES,
  nivelMasCercano,
  pesoDeNivel,
} from '../../lib/perfilesDeCandidatos';
import '../../styles/molde-paginas.css';

/**
 * Cómo ordena esta Prestadora la lista de quiénes pueden cubrir un hueco.
 *
 * QUÉ SE DECIDE ACÁ. Cuando hay una guardia sin Asistente, el sistema propone a quiénes conviene
 * llamar primero. Ese orden sale de cuánto pesa cada cosa: haber atendido antes a ese Paciente,
 * vivir cerca, llegar descansado, tener la semana casi llena. Hasta ahora esos números eran
 * iguales para toda Prestadora.
 *
 * SE ELIGE UNA DE TRES FORMAS ARMADAS, y quien quiera puede además personalizar cada situación
 * con un nivel —No importa, Poco, Bastante, Mucho—, sin ver ningún número. El detalle está
 * plegado a propósito: la mayoría elige una forma y no entra nunca más.
 *
 * EL ORDEN NO DECIDE. Esto cambia en qué orden aparece la lista y nada más. Quien elige sigue
 * siendo la Coordinadora, que sabe cosas que el sistema no sabe. Y estirar el turno de alguien
 * que ya está adentro tampoco se configura acá: eso es una decisión de un caso puntual.
 */
export function ElCalculoDeCandidatos() {
  const { t } = useLocale();
  const tc = t.configuracion;
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [perfil, setPerfil] = useState('continuidad');
  const [pesos, setPesos] = useState({});
  const [topes, setTopes] = useState({});
  const [detalleAbierto, setDetalleAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    try {
      const { configuracion } = await llamarApi('/calculo-candidatos');
      setPerfil(configuracion.perfil);
      setPesos(configuracion.pesos);
      setTopes(configuracion.topes);
      setEstado('listo');
    } catch (err) {
      setError(mensajeDeError(err, t));
      setEstado('error');
    }
  }, [t]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  /* Cambiar de forma armada vuelve a dejar todos los números como los trae esa forma. Es lo que
     espera quien la elige: si quedaran encima los cambios de la forma anterior, el nombre elegido
     diría una cosa y los números harían otra. Lo que se corrió a mano se vuelve a correr. */
  function elegirPerfil(nombre) {
    const armado = PERFILES[nombre] ?? PERFILES.continuidad;
    setPerfil(nombre);
    setPesos({ ...PESOS, ...armado.pesos });
    setTopes({ ...TOPES, ...armado.topes });
  }

  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      await llamarApi('/calculo-candidatos', {
        method: 'PUT',
        body: JSON.stringify({ perfil, pesos, topes }),
      });
      avisar(tc.calculo_guardado);
      await recargar();
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setGuardando(false);
    }
  }

  const botonGuardar = (
    <div className="molde-acciones">
      <Button onClick={guardar} disabled={guardando}>
        {guardando ? t.comun.guardando : t.comun.guardar}
      </Button>
    </div>
  );

  return (
    <>
      <section className="panel-tarjeta">
        <div className="panel-tarjeta-titulo">
          <h2>{tc.calculo_titulo}</h2>
          {estado === 'listo' && (
            <button type="button" className="panel-enlace" onClick={() => setDetalleAbierto((abierto) => !abierto)}>
              {detalleAbierto ? tc.calculo_cerrar_detalle : tc.calculo_abrir_detalle}
            </button>
          )}
        </div>
        <EstadoLista estado={estado} error={error} recargar={recargar}>
          {estado === 'listo' && error && <Alert variant="error">{error}</Alert>}

          <fieldset>
            <legend>{tc.calculo_forma}</legend>
            <div className="molde-formgrid">
              {NOMBRES_DE_PERFIL.map((nombre) => (
                <label key={nombre}>
                  <input
                    type="radio"
                    name="perfil_calculo_candidatos"
                    value={nombre}
                    checked={perfil === nombre}
                    onChange={() => elegirPerfil(nombre)}
                  />{' '}
                  {tc[`calculo_perfil_${nombre}`]}
                </label>
              ))}
            </div>
          </fieldset>

          {!detalleAbierto && botonGuardar}
        </EstadoLista>
      </section>

        {estado === 'listo' && detalleAbierto && (
          <>
            <TablaDeNiveles
              valores={pesos}
              alCambiar={(clave, nivel) => {
                setPesos((previos) => ({ ...previos, [clave]: pesoDeNivel(clave, nivel) }));
              }}
              t={t}
            />
            <TablaDeNumeros
              titulo={tc.calculo_topes_titulo}
              bordes={TOPES_QUE_SE_PUEDEN_TOCAR}
              valores={topes}
              nombreDe={(clave) => tc[`calculo_tope_${clave}`]}
              alCambiar={(clave, valor) => {
                setTopes((previos) => ({ ...previos, [clave]: valor }));
              }}
              t={t}
            >
              {botonGuardar}
            </TablaDeNumeros>
          </>
        )}
    </>
  );
}

/** Un nivel por situación. El número que se guarda no se muestra: lo arma `pesoDeNivel`. */
function TablaDeNiveles({ valores, alCambiar, t }) {
  const tc = t.configuracion;
  return (
    <section className="panel-tarjeta">
      <div className="panel-tarjeta-titulo">
        <h2>{tc.calculo_pesos_titulo}</h2>
      </div>
      <table className="panel-tabla">
        <thead>
          <tr>
            <th>{tc.calculo_col_criterio}</th>
            <th>{tc.calculo_col_valor}</th>
          </tr>
        </thead>
        <tbody>
          {SITUACIONES_PONDERABLES.map((clave) => {
            const nombre = tc[`calculo_peso_${clave}`];
            return (
              <tr key={clave}>
                <td><b>{nombre}</b></td>
                <td>
                  <select
                    value={nivelMasCercano(clave, valores[clave])}
                    onChange={(e) => alCambiar(clave, e.target.value)}
                    aria-label={con(t.comun.campo_de_fila, { campo: tc.calculo_col_valor, nombre })}
                  >
                    {NIVELES.map((nivel) => (
                      <option key={nivel} value={nivel}>
                        {tc[`calculo_nivel_${nivel}`]}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

/** Un número por renglón, con su borde a la vista para que nadie escriba algo que va a rebotar. */
function TablaDeNumeros({ titulo, bordes, valores, nombreDe, alCambiar, t, children }) {
  return (
    <section className="panel-tarjeta">
      <div className="panel-tarjeta-titulo">
        <h2>{titulo}</h2>
      </div>
      <table className="panel-tabla">
        <thead>
          <tr>
            <th>{t.configuracion.calculo_col_criterio}</th>
            <th>{t.configuracion.calculo_col_valor}</th>
            <th>{t.configuracion.calculo_col_entre}</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(bordes).map(([clave, borde]) => {
            const nombre = nombreDe(clave);
            return (
              <tr key={clave}>
                <td><b>{nombre}</b></td>
                <td>
                  <input
                    type="number"
                    step="any"
                    min={borde.minimo}
                    max={borde.maximo}
                    value={valores[clave] ?? ''}
                    onChange={(e) => alCambiar(clave, e.target.value === '' ? '' : Number(e.target.value))}
                    aria-label={con(t.comun.campo_de_fila, { campo: t.configuracion.calculo_col_valor, nombre })}
                  />
                </td>
                <td>
                  {borde.minimo} … {borde.maximo}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {children}
    </section>
  );
}
