import { supabase } from '../db/connection.js';

// Quién, además de un administrador, puede hacer cada una de las acciones que la Prestadora
// puede reservar.
//
// ACÁ NO SE DECIDE NADA. La decisión está programada una sola vez y está en la base, en la
// función `tiene_permiso_de`; este archivo solamente la consulta. Antes no era así: el backend
// tenía su propia copia de la lista de acciones reservadas, la pantalla de configuración
// tenía otra, y la base una tercera — las tres decían cosas distintas, y la pantalla llegaba
// a mostrarle a la Prestadora un estado que el backend no aplicaba (pendiente #127).
//
// Por qué la lista vive en la base y no en un archivo de este proyecto, como sí pasa con
// `catalogoVisibilidad.js` y `catalogoAvisos.js`: porque esta decisión no la consulta
// solamente el backend. La consultan también las reglas de acceso de la propia base, que están
// escritas en SQL y no pueden leer un archivo de JavaScript. Cuando los dos lados que
// comparten una decisión no pueden compartir código, el punto único de verdad es una función
// de la base — es lo que manda la regla 12 del §7 de CLAUDE.md para este caso exacto.

// CON LA CONEXIÓN QUE RECIBEN. Cada función entra a la base con la que le pasa quien la llama:
// la de la persona si su ruta la usa, la maestra si la ruta quedó con ella a propósito. Las dos
// preguntas a `tiene_permiso_de` y `permisos_efectivos_de` la reciben igual, pero hoy sólo la
// maestra puede hacerlas: la base no le da a una persona con sesión permiso para llamarlas.

// El catálogo cambia con una migración, o sea junto con una versión nueva del backend, así que
// alcanza con leerlo una vez por arranque. Es el mismo para todas las Prestadoras, y la base se lo
// deja leer a cualquiera que haya iniciado sesión.
let catalogoEnMemoria = null;

export async function accionesDePermisos(db) {
  if (catalogoEnMemoria) return catalogoEnMemoria;
  const { data, error } = await db
    .from('catalogo_acciones_permisos')
    .select('accion, default_solo_admin')
    .order('orden');
  if (error) throw error;
  catalogoEnMemoria = data || [];
  return catalogoEnMemoria;
}

export async function tienePermiso({ db, accion, usuarioId }) {
  const { data, error } = await db.rpc('tiene_permiso_de', {
    p_usuario: usuarioId ?? null,
    p_accion: accion,
  });
  // Ante la duda, no. Un permiso que no se pudo comprobar no es un permiso otorgado.
  if (error) return false;
  return data === true;
}

// El portero de una ruta que la Prestadora puede reservar: deja pasar solo si esta persona
// tiene habilitada la acción.
//
// Vive acá y no en cada archivo de rutas por la regla 12 del §7 de CLAUDE.md. Hasta hoy
// estaba escrito cuatro veces, palabra por palabra, en panelCuentas.js, panelImportacion.js,
// panelLiquidaciones.js y panelInformesObraSocial.js. Cuatro copias de la misma decisión son
// cuatro lugares donde corregirla, y basta con que alguien arregle tres para que la cuarta
// ruta quede contestando otra cosa.
//
// El texto del rechazo también es uno solo, y es a propósito: desde afuera, una acción que la
// Prestadora no habilitó tiene que verse siempre igual, venga de la ruta que venga.
export function requierePermiso(accion) {
  return async (req, res, next) => {
    // Con la maestra: la base no le da a una persona con sesión permiso para llamar a
    // `tiene_permiso_de`, así que con la suya este portero no dejaría pasar a nadie.
    const permitido = await tienePermiso({ db: supabase, accion, usuarioId: req.usuarioPanel?.id });
    if (!permitido) {
      return res.status(403).json({ error: 'La Prestadora no habilitó esta acción' });
    }
    next();
  };
}

// Las respuestas de todas las acciones de una sola vez, para cuando el Panel necesita saber
// qué botones mostrar. Una consulta en vez de una por acción.
export async function permisosEfectivos(db, usuarioId) {
  const { data, error } = await db.rpc('permisos_efectivos_de', { p_usuario: usuarioId ?? null });
  if (error) throw error;
  return data || {};
}
