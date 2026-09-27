import { useAuth } from '../context/AuthContext';

/**
 * En qué moneda están los importes de esta pantalla.
 *
 * Es la misma pregunta que contesta `usePrestadoraActual`, aplicada al dinero: la moneda de la
 * Prestadora de la cuenta con la que se entró. El orden tiene que ser el mismo, porque si no un
 * importe se muestra —o peor, se guarda— con una moneda que no es la de la Prestadora a la que
 * pertenece la fila.
 *
 * Devuelve `null` mientras el usuario todavía no terminó de cargar.
 */
export function useMonedaActual() {
  const { usuario } = useAuth();
  return usuario?.moneda ?? null;
}
