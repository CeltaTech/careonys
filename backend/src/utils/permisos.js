import { clienteDelPedido } from '../db/connection.js';

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

// CON LA CREDENCIAL DE QUIEN PIDE, Y SÓLO SOBRE SÍ MISMA. `tiene_permiso_de` y
// `permisos_efectivos_de` reciben de quién se pregunta, y por eso la base no se las deja llamar a
// nadie con sesión. Lo que se llama desde acá es `tiene_permiso_la_sesion` y
// `permisos_efectivos_de_la_sesion`, que no reciben a nadie: preguntan por quien inició sesión y
// contestan lo mismo que las otras dos para esa persona.

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

export async function tienePermiso({ db, accion }) {
  const { data, error } = await db.rpc('tiene_permiso_la_sesion', { p_accion: accion });
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
    // Un pedido sin la sesión de una persona no tiene a quién preguntarle: no pasa.
    let permitido = false;
    try {
      permitido = await tienePermiso({ db: clienteDelPedido(req), accion });
    } catch {
      permitido = false;
    }
    if (!permitido) {
      return res.status(403).json({ error: 'La Prestadora no habilitó esta acción' });
    }
    next();
  };
}

// Las respuestas de todas las acciones de una sola vez, para cuando el Panel necesita saber
// qué botones mostrar. Una consulta en vez de una por acción.
export async function permisosEfectivos(db) {
  const { data, error } = await db.rpc('permisos_efectivos_de_la_sesion');
  if (error) throw error;
  return data || {};
}
