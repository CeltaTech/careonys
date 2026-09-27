import { useLocale } from '../../i18n/LocaleContext';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';

/* Los cuatro estados de cualquier lista del Panel: cargando, error, vacío y listo
   (`CLAUDE.md` §7 regla 3). Este componente es el único lugar donde están escritos, para
   que las veinte pantallas que muestran listas no los resuelvan cada una a su manera
   (regla 12).

   EL VACÍO SON DOS SITUACIONES, NO UNA:

     · No hay ni un dato cargado todavía  → lo que corresponde es crear el primero.
     · Hay datos, pero el filtro los tapó → lo que corresponde es sacar el filtro.

   El mismo cartel para los dos casos hace que alguien con un filtro puesto crea que perdió
   los datos. Por eso la pantalla le pasa `filtrado` y el cartel cambia, incluida la salida
   que ofrece.

   Cómo se usa desde una pantalla:

     <EstadoLista
       estado={estado}
       error={error}
       recargar={cargar}
       vacio={filtradas.length === 0}
       filtrado={hayFiltrosPuestos}
       onLimpiarFiltros={limpiarFiltros}
       accionVacio={<Button onClick={abrirAlta}>…</Button>}
     >
       …la tabla…
     </EstadoLista>

   `filtrado` y `onLimpiarFiltros` son opcionales: una pantalla que no los pasa no habla del
   filtro.

   Y `mensajeVacio` también es opcional. Sin él, la lista vacía no muestra ningún cartel: no hay
   texto genérico de reemplazo, a propósito. Un espacio vacío no es un problema que haya que
   explicar, y el cartel que aclara lo obvio le resta claridad a la pantalla.

   El vacío llega de dos maneras y las dos valen. La pantalla que hace una cuenta propia —porque
   filtró, o porque junta varias listas— lo dice con `vacio`. La que carga su lista con
   `useCatalogo` no cuenta nada: ahí el vacío es un estado del catálogo y viene adentro de
   `estado`, igual que «cargando» y «error».

   `ayudaVacio` también es opcional, y es el segundo renglón del cartel. No tiene valor por
   defecto: sin él, el cartel es una sola frase. Como siempre, el texto sale de las
   traducciones, no de acá. */
export function EstadoLista({
  estado,
  error,
  vacio,
  recargar,
  mensajeVacio,
  ayudaVacio,
  accionVacio,
  filtrado = false,
  onLimpiarFiltros,
  children,
}) {
  const { t } = useLocale();

  if (estado === 'cargando') {
    // `role="status"` para que el cambio de estado se anuncie solo: quien no ve la pantalla
    // tiene que enterarse de que está cargando, y después de que apareció la lista.
    return <p className="estado-cargando" role="status">{t.comun.cargando}</p>;
  }

  if (estado === 'error') {
    return (
      <Alert variant="error">
        {error || t.comun.error_generico}{' '}
        <Button variant="secondary" onClick={recargar}>
          {t.comun.reintentar}
        </Button>
      </Alert>
    );
  }

  if (vacio || estado === 'vacio') {
    // Con filtros puestos: el filtro no encontró nada, y la salida es sacarlo.
    if (filtrado) {
      return (
        <div className="estado-vacio-bloque" role="status">
          <p className="estado-vacio-titulo">{t.comun.sin_resultados_titulo}</p>
          <p className="estado-vacio">{t.comun.sin_resultados_ayuda}</p>
          {onLimpiarFiltros && (
            <Button variant="secondary" onClick={onLimpiarFiltros}>
              {t.comun.limpiar_filtros}
            </Button>
          )}
        </div>
      );
    }

    // Sin filtros: no hay ni un dato todavía. Acá no hay nada que decir, y no se dice nada:
    // una lista vacía se entiende mirándola. La pantalla que sí tiene algo propio que decir
    // —o un botón que ofrecer— lo pasa; la que no pasa nada no muestra ningún cartel.
    if (!mensajeVacio && !accionVacio) return null;

    return (
      <div className="estado-vacio-bloque" role="status">
        {mensajeVacio && <p className="estado-vacio-titulo">{mensajeVacio}</p>}
        {ayudaVacio && <p className="estado-vacio">{ayudaVacio}</p>}
        {accionVacio}
      </div>
    );
  }

  return children;
}
