import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { useAuth } from '../../context/AuthContext';
import { useAdvertenciaLegal } from '../../context/AdvertenciaLegalContext';
import { usePrestadoraActual } from '../../hooks/usePrestadoraActual';
import { esAdminOSuperior } from '../../lib/roles';
import { EstadoLista } from '../../components/layout/EstadoLista';
import { Cabecera } from '../../components/ui/Cabecera';
import { mensajeDeError } from '../../lib/errores';
import { llamarApiDeMatch } from './llamarApiDeMatch';
import '../../styles/molde-paginas.css';

// Las cinco funciones de riesgo legal conocido de la modalidad Match
// (backend/src/routes/panelIntermediacion.js). Lo que se avisó al encenderlas es un informe y vive
// aparte, en `AuditoriaLegal.jsx`, dentro de la sección Informes.
//
// AVISA, NO BLOQUEA (CLAUDE.md §7). Las cinco se pueden encender siempre. Lo único que hace la
// pantalla al encender una es mostrar antes la advertencia escrita para el país de esa
// Prestadora; si ese país no tiene documento, no se muestra nada y se enciende igual. Apagar
// no muestra ninguna: lo que el documento legal advierte es de usar la función.
export function IntermediacionFuncionesConRiesgoLegal() {
  const { t, locale } = useLocale();
  const { usuario } = useAuth();
  const prestadoraId = usePrestadoraActual();
  const { verificarAntesDeActivar } = useAdvertenciaLegal();
  const esAdmin = esAdminOSuperior(usuario?.rol);

  const [funciones, setFunciones] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [cambiando, setCambiando] = useState(null);

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    try {
      const { funciones: filas } = await llamarApiDeMatch('/funciones-riesgo');
      setFunciones(filas);
      setEstado('listo');
    } catch (err) {
      setError(mensajeDeError(err, t));
      setEstado('error');
    }
  }, [t]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  async function cambiar(funcion, activa) {
    // La advertencia va antes de pedir el cambio: sirve para decidir, y después de encendida ya no
    // hay nada que decidir. Si la persona lo cancela, no se enciende nada.
    if (activa) {
      const respuesta = await verificarAntesDeActivar(prestadoraId, funcion.clave);
      // No se pudo consultar si hay advertencia que mostrar: se lo dice y no se enciende nada.
      if (respuesta === 'error') {
        setError(t.comun.error_generico);
        return;
      }
      if (respuesta !== 'seguir') return;
    }
    setCambiando(funcion.clave);
    setError(null);
    try {
      await llamarApiDeMatch(`/funciones-riesgo/${funcion.clave}`, {
        method: 'PUT',
        body: JSON.stringify({ activa }),
      });
      await recargar();
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setCambiando(null);
    }
  }

  return (
    <div>
      <Cabecera titulo={t.intermediacion.funciones_riesgo_titulo} />

      <section className="panel-tarjeta">
        <EstadoLista estado={estado} error={error} vacio={estado === 'listo' && funciones.length === 0} recargar={recargar}>
          <table className="panel-tabla">
            <thead>
              <tr>
                <th>{t.intermediacion.funciones_riesgo_col_activa}</th>
                <th>{t.intermediacion.funciones_riesgo_col_funcion}</th>
                <th>{t.intermediacion.funciones_riesgo_col_aviso}</th>
              </tr>
            </thead>
            <tbody>
              {funciones.map((f) => (
                <tr key={f.clave}>
                  <td>
                    <input
                      id={`funcion-${f.clave}`}
                      type="checkbox"
                      checked={f.activa}
                      // Se apaga mientras el cambio está en curso, para que no salgan dos
                      // pedidos por un doble clic; y para el Coordinador queda de sólo lectura,
                      // igual que el candado del backend y el de la base.
                      disabled={!esAdmin || cambiando === f.clave}
                      onChange={(e) => cambiar(f, e.target.checked)}
                    />
                  </td>
                  <td>
                    <label htmlFor={`funcion-${f.clave}`}>
                      <b>{t.intermediacion[`funcion_${f.clave}`] || f.clave}</b>
                    </label>
                  </td>
                  <td>
                    {f.advertida_en ? (
                      <span className="panel-mini">{new Date(f.advertida_en).toLocaleString(locale)}</span>
                    ) : (
                      <span className="panel-dato-vacio">
                        {f.texto_advertencia ? '—' : t.intermediacion.funciones_riesgo_sin_documento}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </EstadoLista>
      </section>
    </div>
  );
}
