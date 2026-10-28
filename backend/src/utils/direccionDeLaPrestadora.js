import { enLaPrestadora } from '../db/connection.js';

// El código de cada Prestadora.
//
// Es un rótulo corto —`cuidardelsur`— que nombra a la Prestadora sin decir su número interno. Va al
// final del nombre de usuario de su coordinación (`juana.perez_cuidardelsur`, ver
// `nombreDeUsuario.js`) y adentro de los enlaces de los correos con un código de un solo uso. No es
// una dirección web: no existe ninguna dirección propia por Prestadora.
//
// No lo elige Careonys: lo elige CeltaTech y llega con el alta de la Prestadora
// (`docs/PLAN_HASTA_PRODUCCION.md`, paso 111). Careonys lo guarda y no lo cambia nunca, porque
// está escrito en los nombres de usuario de toda su coordinación. Que no se repita lo hace cumplir
// el índice único de la base.

// El enlace que va en un correo con un código de un solo uso: activar la cuenta o elegir una clave
// nueva. Lleva el código de la Prestadora, porque quien lo abre todavía no tiene sesión y es ese
// código el que dice en cuál se busca (`middleware/resolverPrestadoraPublica.js`). Sin código no
// hay enlace que sirva, y devuelve nulo.
export async function enlaceConCodigo({ appUrl, pantalla, prestadoraId, codigo }) {
  if (!appUrl) return null;
  const rotulo = await rotuloDeLaPrestadora(prestadoraId);
  if (!rotulo) return null;
  const parametros = new URLSearchParams({ prestadora: rotulo, token: codigo });
  return `${appUrl}/${pantalla}?${parametros}`;
}

// El código guardado de una Prestadora, o nulo si no tiene. Se lee con el trabajo de
// esa Prestadora, que sólo alcanza su propia configuración.
export async function rotuloDeLaPrestadora(prestadoraId) {
  if (!prestadoraId) return null;
  const { data, error } = await enLaPrestadora(prestadoraId, 'leer la dirección de la Prestadora', (db) =>
    db.from('configuracion_prestadora').select('dominio').eq('prestadora_id', prestadoraId).maybeSingle(),
  );
  if (error) throw error;
  return data?.dominio || null;
}

// El choque de dos altas simultáneas: las dos eligieron el mismo nombre porque ninguna de las dos
// veía a la otra todavía. Lo resuelve el índice único de la base, y quien alta reintenta.
export function esChoqueDeDireccion(error) {
  return error?.code === '23505' && String(error?.message ?? '').includes('dominio');
}
