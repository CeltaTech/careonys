import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { useModalidades } from '../../context/ModalidadesContext';
import { MODALIDAD } from '../../lib/modalidades';
import { supabase } from '../../lib/supabaseClient';
import { mensajeDeError } from '../../lib/errores';
import { EstadoLista } from '../../components/layout/EstadoLista';
import { Estrellas } from '../../components/ui/Estrellas';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import '../tarjetas.css';

/* Lo que los Clientes dijeron de este Asistente.
   ==========================================================================

   Cada Asistente tiene un solo Legajo, y sus calificaciones son una sola lista, común a las dos
   modalidades. El Administrador y el Coordinador las ven todas acá.

   Si la Prestadora tiene Match habilitado, el Administrador elige al lado de cada calificación si
   la ven los Clientes de Match en la página del Asistente. Sólo él ve esa elección. Nadie cambia
   las estrellas ni el comentario: la base sólo deja tocar la marca de visible y el descargo.

   NO SE MUESTRA NINGÚN PROMEDIO, a propósito. El promedio que ve el Cliente de Match se calcula
   sólo sobre las visibles. Un promedio calculado acá sobre todas sería otro número, y quedarían
   dos puntajes de la misma persona sin forma de saber cuál es cuál.

   El nombre de quien evaluó no se muestra. Quien decide sobre el Padrón necesita saber qué se
   dijo, no quién lo dijo. Es el mismo criterio con el que la calificación le llega al Asistente
   en su propia aplicación. */

/* `cliente_id` no se pide: no se muestra, y lo que no se muestra no se trae. */
const COLUMNAS = 'id, estrellas, comentario, descargo_asistente, descargo_en, visible_publica, created_at';

export function EvaluacionesTab({ asistente, esAdmin = false }) {
  const { t, locale } = useLocale();
  const { tieneModalidad } = useModalidades();
  const [filas, setFilas] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [errorAlCambiar, setErrorAlCambiar] = useState(null);
  const [cambiandoId, setCambiandoId] = useState(null);

  const eligeLasVisibles = esAdmin && tieneModalidad(MODALIDAD.INTERMEDIACION);

  const cargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    try {
      // Sin filtro de Prestadora escrito: el Panel consulta con el pase de la persona y la
      // protección por fila de `calificaciones_asistente` ya deja ver únicamente las de la
      // Prestadora propia.
      const { data, error: errorConsulta } = await supabase
        .from('calificaciones_asistente')
        .select(COLUMNAS)
        .eq('asistente_id', asistente.id)
        .order('created_at', { ascending: false });

      if (errorConsulta) throw errorConsulta;

      setFilas(data ?? []);
      setEstado('listo');
    } catch (err) {
      setError(mensajeDeError(err, t));
      setEstado('error');
    }
  }, [asistente.id, t]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function alternarVisible(calificacion) {
    setCambiandoId(calificacion.id);
    setErrorAlCambiar(null);
    try {
      // Se pide la fila de vuelta: si la protección por fila no deja cambiarla, la base no da
      // error, devuelve cero filas, y eso también es una falla.
      const { data, error: errorCambio } = await supabase
        .from('calificaciones_asistente')
        .update({ visible_publica: !calificacion.visible_publica })
        .eq('id', calificacion.id)
        .select('id');

      if (errorCambio) throw errorCambio;
      if (!data || data.length === 0) throw { code: '42501' };

      await cargar();
    } catch (err) {
      setErrorAlCambiar(mensajeDeError(err, t));
    } finally {
      setCambiandoId(null);
    }
  }

  return (
    <section className="panel-tarjeta tarjeta-desplazable">
      <div className="panel-tarjeta-titulo">
        <h2>{t.asistentes.tabs.evaluaciones}</h2>
      </div>
      {errorAlCambiar && <Alert variant="error">{errorAlCambiar}</Alert>}
      <EstadoLista
        estado={estado}
        error={error}
        vacio={estado === 'listo' && filas.length === 0}
        recargar={cargar}
      >
        <table className="panel-tabla">
          <thead>
            <tr>
              <th>{t.asistentes.evaluaciones.col_fecha}</th>
              <th>{t.asistentes.evaluaciones.col_estrellas}</th>
              <th>{t.asistentes.evaluaciones.col_comentario}</th>
              <th>{t.asistentes.evaluaciones.col_descargo}</th>
              {eligeLasVisibles && <th>{t.asistentes.evaluaciones.col_visible}</th>}
              {eligeLasVisibles && <th />}
            </tr>
          </thead>
          <tbody>
            {filas.map((c) => (
              <tr key={c.id}>
                <td>{new Date(c.created_at).toLocaleDateString(locale)}</td>
                <td>
                  <Estrellas cantidad={c.estrellas} />
                </td>
                <td>{c.comentario || t.asistentes.evaluaciones.sin_comentario}</td>
                {/* El descargo es la única respuesta que la persona evaluada puede dar. Se
                    muestra al lado de lo que contesta, nunca aparte. */}
                <td>{c.descargo_asistente || t.asistentes.evaluaciones.sin_descargo}</td>
                {eligeLasVisibles && (
                  <td>{c.visible_publica ? t.asistentes.evaluaciones.visible : t.asistentes.evaluaciones.no_visible}</td>
                )}
                {eligeLasVisibles && (
                  <td>
                    <Button
                      variant="secondary"
                      onClick={() => alternarVisible(c)}
                      disabled={cambiandoId !== null}
                    >
                      {c.visible_publica ? t.asistentes.evaluaciones.ocultar : t.asistentes.evaluaciones.mostrar}
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </EstadoLista>
    </section>
  );
}
