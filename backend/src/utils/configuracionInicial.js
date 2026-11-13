import { enLaPrestadora } from '../db/connection.js';
import { ErrorConMotivo, responderError } from './errorConMotivo.js';

/* La configuración inicial de una Prestadora: lo que tiene que estar cargado antes de cargar gente.
   ==========================================================================

   QUÉ ES. Dos cosas: los datos de contacto de la Prestadora (teléfono y email) y al menos una
   zona de cobertura activa. Mientras falte alguna, no se da de alta ningún Asistente ni ningún
   Cliente, ni a mano ni por importación.

   LA LISTA DE PRECIOS NO ENTRA. Es una orientación: el precio de cada Prestación se puede
   escribir directo, sin pasar por ella. Exigirla antes de cargar gente obligaría a armar una
   lista que la Prestadora tal vez no usa.

   ÚNICO PUNTO DE VERDAD. El criterio vive acá y en ningún otro lado. El Panel no lo copia: le
   pregunta a `GET /api/panel/cuentas/configuracion-inicial`, que contesta con esta misma función,
   y con esa respuesta arma la guía de primeros pasos y apaga los botones de alta. El candado de
   las rutas que crean gente (`exigirConfiguracionInicial`, abajo) usa también esta función. Así
   la pantalla y el candado no pueden discrepar.

   NO HAY TABLA DE HITOS. Se deriva en vivo de los mismos datos que carga la pantalla de
   Configuración. Una columna «ya completó» podría decir que sí mientras la Prestadora borró sus
   zonas.

   CON QUÉ CREDENCIAL SE PREGUNTA. Los datos de contacto y las zonas los lee el trabajo de la
   Prestadora (`enLaPrestadora`), que alcanza sólo a la de la sesión: la base no le deja ver esas
   dos tablas a un Coordinador, y un Coordinador al que su Prestadora le habilitó el alta o la
   importación tiene que recibir la misma respuesta que la Administración. La Prestadora es
   siempre la de la sesión verificada (`req.usuarioPanel`), nunca un dato del pedido.

   VALE IGUAL PARA TODOS LOS ROLES. Lo que decide es el estado de la Prestadora, no quién pide:
   un Superadmin con un permiso de acceso abierto tampoco carga gente en una Prestadora que no
   terminó su configuración inicial. */

/** El orden en que se muestran los pasos. `clave` nombra sus textos en el Panel. */
export const PASOS_CONFIGURACION_INICIAL = ['datos', 'zonas'];

/** El código con el que el Panel encuentra la frase traducida. */
export const MOTIVO_CONFIGURACION_INICIAL_INCOMPLETA = 'configuracion_inicial_incompleta';

/** El criterio, sin base: qué paso está hecho con estos datos. */
export function pasosDeLaConfiguracionInicial({ empresa, hayZonas }) {
  const hecho = {
    datos: Boolean(empresa?.telefono) && Boolean(empresa?.email),
    zonas: hayZonas === true,
  };
  return PASOS_CONFIGURACION_INICIAL.map((clave) => ({ clave, hecho: hecho[clave] }));
}

/**
 * Lee de la base lo que hace falta y contesta `{ pasos, completa }`. Si la base falla, tira el
 * error: no contesta «incompleta», que sería decirle a la Prestadora que le falta algo que tal
 * vez ya cargó.
 */
export async function configuracionInicialDe(req) {
  const prestadoraId = req.usuarioPanel?.prestadoraId;
  if (!prestadoraId) throw new Error('configuracionInicialDe: sin Organización activa');

  const { empresa, hayZonas } = await enLaPrestadora(prestadoraId, 'configuración inicial', async (db) => {
    const [empresaLeida, zonas] = await Promise.all([
      db.from('configuracion_prestadora').select('telefono, email').eq('prestadora_id', prestadoraId).maybeSingle(),
      db.from('zonas_cobertura').select('id').eq('prestadora_id', prestadoraId).eq('activa', true).limit(1),
    ]);
    if (empresaLeida.error) throw empresaLeida.error;
    if (zonas.error) throw zonas.error;
    return { empresa: empresaLeida.data, hayZonas: Array.isArray(zonas.data) && zonas.data.length > 0 };
  });

  const pasos = pasosDeLaConfiguracionInicial({ empresa, hayZonas });
  return { pasos, completa: pasos.every((p) => p.hecho) };
}

/**
 * El candado de las rutas que crean Asistentes o Clientes. Va después de `requiereRolPanel`, que
 * deja puesta la Prestadora de la sesión.
 *
 * Falla cerrado (CLAUDE.md §5): sin Organización, o si la base no contesta, no deja pasar.
 */
export async function exigirConfiguracionInicial(req, res, next) {
  if (!req.usuarioPanel?.prestadoraId) {
    return responderError(res, new ErrorConMotivo(MOTIVO_CONFIGURACION_INICIAL_INCOMPLETA, 'sin Organización activa'));
  }
  let resultado;
  try {
    resultado = await configuracionInicialDe(req);
  } catch (e) {
    return responderError(res, e);
  }
  if (resultado.completa !== true) {
    const faltan = resultado.pasos.filter((p) => !p.hecho).map((p) => p.clave).join(', ');
    return responderError(res, new ErrorConMotivo(MOTIVO_CONFIGURACION_INICIAL_INCOMPLETA, `falta: ${faltan}`));
  }
  next();
}
