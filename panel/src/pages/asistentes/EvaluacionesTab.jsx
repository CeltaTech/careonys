import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { supabase } from '../../lib/supabaseClient';
import { mensajeDeError } from '../../lib/errores';
import { con } from '../../lib/textos';
import { EstadoLista } from '../../components/layout/EstadoLista';
import { Estrellas } from '../../components/ui/Estrellas';
import '../tarjetas.css';

/* Lo que los Clientes dijeron de este Asistente.
   ==========================================================================

   Se ven todas, en las dos modalidades: el Administrador y el Coordinador de la prestación
   directa miran desde la persona lo que se dijo de ella, que es como se mira cuando hay que
   decidir algo sobre ella —renovarle el vínculo, ofrecerle un Paciente, atender un reclamo—.

   SE MIRA, NO SE TOCA. Cuáles calificaciones de Match ven los Clientes de Match lo elige el
   Administrador en la pantalla de Match, mirándolas todas juntas. Acá sólo se dice, en las de
   Match, si se publican. En las de prestación directa no hay nada que decir: el Cliente nunca ve
   las calificaciones que dejaron otros.

   NO SE MUESTRA NINGÚN PROMEDIO, a propósito. El promedio que existe es el del perfil público,
   y se calcula sólo sobre las publicadas. Un promedio calculado acá —sobre todas, incluidas las
   no publicadas— sería otro número, distinto del que ve el Cliente, y quedarían dos puntajes de la
   misma persona sin ninguna forma de saber cuál es cuál.

   El nombre de quien evaluó no se muestra. Quien decide sobre el Padrón necesita saber qué se
   dijo, no quién lo dijo, y una queja con nombre y apellido al lado cambia lo que pasa después.
   Es el mismo criterio con el que la evaluación le llega al Asistente en su propia aplicación. */

/* Cuántas filas como mucho. Igual que en el historial de guardias: esto es el Legajo del Asistente, y cuando
   se llega al tope se avisa, para que nadie crea que está viendo todo lo que se dijo. */
const TOPE = 50;

/* `cliente_id` no se pide: no se muestra, y lo que no se muestra no se trae. */
const COLUMNAS = 'id, estrellas, comentario, descargo_asistente, descargo_en, visible_publica, canal_modalidad, created_at';

export function EvaluacionesTab({ asistente }) {
  const { t, locale } = useLocale();
  const [datos, setDatos] = useState({ filas: [], tope: false });
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);

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
        .order('created_at', { ascending: false })
        .limit(TOPE);

      if (errorConsulta) throw errorConsulta;

      const filas = data ?? [];
      setDatos({ filas, tope: filas.length === TOPE });
      setEstado('listo');
    } catch (err) {
      setError(mensajeDeError(err, t));
      setEstado('error');
    }
  }, [asistente.id, t]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // La columna de publicada sólo dice algo en las de Match. Sin ninguna de Match, no se dibuja.
  const hayDeMatch = datos.filas.some((c) => c.canal_modalidad === 'intermediacion');

  return (
    <section className="panel-tarjeta tarjeta-desplazable">
      <div className="panel-tarjeta-titulo">
        <h2>{t.asistentes.tabs.evaluaciones}</h2>
        {datos.tope && (
          <span className="panel-mini">{con(t.asistentes.evaluaciones.tope, { n: TOPE })}</span>
        )}
      </div>
    <EstadoLista
      estado={estado}
      error={error}
      vacio={estado === 'listo' && datos.filas.length === 0}
      recargar={cargar}
    >
      <>
        <table className="panel-tabla">
          <thead>
            <tr>
              <th>{t.asistentes.evaluaciones.col_fecha}</th>
              <th>{t.asistentes.evaluaciones.col_estrellas}</th>
              <th>{t.asistentes.evaluaciones.col_comentario}</th>
              <th>{t.asistentes.evaluaciones.col_descargo}</th>
              {hayDeMatch && <th>{t.asistentes.evaluaciones.col_visible}</th>}
            </tr>
          </thead>
          <tbody>
            {datos.filas.map((c) => (
              <tr key={c.id}>
                <td>{new Date(c.created_at).toLocaleDateString(locale)}</td>
                <td>
                  <Estrellas cantidad={c.estrellas} />
                </td>
                <td>{c.comentario || t.asistentes.evaluaciones.sin_comentario}</td>
                {/* El descargo es la única respuesta que la persona evaluada puede dar, y se
                    escribe una sola vez. Se muestra al lado de lo que contesta, nunca aparte:
                    leídos en columnas distintas serían dos textos sueltos. */}
                <td>{c.descargo_asistente || t.asistentes.evaluaciones.sin_descargo}</td>
                {hayDeMatch && (
                  <td>
                    {c.canal_modalidad !== 'intermediacion'
                      ? '—'
                      : c.visible_publica
                        ? t.asistentes.evaluaciones.visible
                        : t.asistentes.evaluaciones.no_visible}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </>
    </EstadoLista>
    </section>
  );
}
