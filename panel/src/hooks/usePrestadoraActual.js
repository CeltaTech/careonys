import { useAuth } from '../context/AuthContext';

/**
 * De qué Prestadora se está hablando en esta pantalla, ahora mismo.
 *
 * Es la Prestadora de la cuenta con la que se entró, y no hay segunda respuesta: una cuenta
 * pertenece a una sola Prestadora, y para trabajar en otra hay que salir y entrar con la cuenta de
 * allá. Es el mismo orden que aplica la base en `current_tenant()`, y esa coincidencia no es
 * casual: si las dos no dicen lo mismo, el Panel arma una consulta apuntando a una Prestadora y la
 * base la contesta apuntando a otra.
 *
 * Sigue existiendo como punto único de verdad, aunque hoy sea un solo renglón: antes cada pantalla
 * leía `usuario.prestadora_id` directo, y cuando la respuesta dejó de ser esa hubo que corregir
 * una por una.
 *
 * Devuelve `null` mientras el usuario todavía no terminó de cargar.
 */
export function usePrestadoraActual() {
  const { usuario } = useAuth();
  return usuario?.prestadora_id ?? null;
}
