import { sinPrestadora, enLaPrestadora } from '../db/connection.js';
import { rotuloDeLaPrestadora } from './direccionDeLaPrestadora.js';

// EL NOMBRE DE USUARIO DE LA COORDINACIÓN.
//
// La coordinación entra al Panel con `<parte>_<código de la Prestadora>` —`juana.perez_demo`—. La
// parte la escribe el Administrador al dar el alta y se guarda en `usuarios.nombre_de_usuario`; el
// código es el de la Prestadora, guardado en `configuracion_prestadora.dominio`, que nunca lleva
// «_». Por eso el nombre se corta en el último «_»: lo de la derecha dice la Prestadora, y lo de la
// izquierda, la cuenta adentro de ella.
//
// Así el ingreso y la recuperación de la clave saben de qué Prestadora es la cuenta por lo que
// escribe la persona. No se mira la dirección de la página: no todas las Prestadoras tienen una.

// La misma forma que exige la base (`nombre_de_usuario_bien_escrito`).
const FORMA_DE_LA_PARTE = /^[a-z0-9]([a-z0-9._-]{0,38}[a-z0-9])?$/;

/** La parte que escribe el Administrador, dejada comparable. */
export function parteComparable(texto) {
  return String(texto ?? '').trim().toLowerCase();
}

/** ¿La parte tiene la forma que la base acepta? */
export function parteBienEscrita(texto) {
  return FORMA_DE_LA_PARTE.test(parteComparable(texto));
}

/** El nombre completo, como se escribe para entrar. */
export function nombreCompleto(parte, rotulo) {
  if (!parte || !rotulo) return null;
  return `${parte}_${rotulo}`;
}

/** El sufijo de una Prestadora: lo que va después de la parte. Nulo si la Prestadora no tiene código. */
export async function sufijoDeLaPrestadora(prestadoraId) {
  const rotulo = await rotuloDeLaPrestadora(prestadoraId);
  return rotulo ? `_${rotulo}` : null;
}

/**
 * La cuenta de coordinación que nombra lo escrito, o nulo.
 *
 * Primero se pregunta, sin Prestadora, cuál es la del código; esa credencial sólo sirve para esa
 * pregunta. Con la respuesta se entra a esa Prestadora y a ninguna otra, y ahí se busca la cuenta.
 *
 * Devuelve nulo en todos los casos en que no hay cuenta —nombre mal escrito, código que no es de
 * ninguna Prestadora, parte que no existe adentro de ella—, y quien la llama los trata igual.
 *
 * @returns {Promise<{ prestadoraId: string, cuenta: object|null } | null>}
 */
export async function cuentaDelNombreDeUsuario(texto, trabajo) {
  const escrito = parteComparable(texto);
  const corte = escrito.lastIndexOf('_');
  if (corte < 1) return null;

  const parte = escrito.slice(0, corte);
  const rotulo = escrito.slice(corte + 1);
  if (!rotulo || !FORMA_DE_LA_PARTE.test(parte)) return null;

  const { data: prestadoraId, error } = await sinPrestadora(trabajo)
    .rpc('prestadora_de_la_direccion', { p_direccion: rotulo });
  if (error) throw new Error(error.message);
  if (!prestadoraId) return null;

  const { data: cuenta, error: errorCuenta } = await enLaPrestadora(prestadoraId, trabajo, (db) => db
    .from('usuarios')
    .select('id, nombre, rol, email, prestadora_id')
    .eq('prestadora_id', prestadoraId)
    .eq('rol', 'coordinador')
    .eq('nombre_de_usuario', parte)
    .maybeSingle());
  if (errorCuenta) throw new Error(errorCuenta.message);

  return { prestadoraId, cuenta: cuenta ?? null };
}
