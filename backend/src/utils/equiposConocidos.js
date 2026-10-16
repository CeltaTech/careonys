import crypto from 'node:crypto';
import { enLaPrestadora } from '../db/connection.js';
import { cerrarTodasLasSesionesDe } from './claveActual.js';

// QUÉ ES UN EQUIPO NUEVO. Un aparato que no tiene llave guardada y desde el que nunca se entró.
// Nada más que eso: no se reconoce el navegador, no se mira desde dónde se conecta y no se guarda
// ningún dato del aparato. Lo único que hay es una marca al azar que emite el backend, que el
// navegador conserva, y de la que acá queda el identificador de verificación.
//
// POR QUÉ NO ALCANZA `llaves_de_dispositivo`. Ésa es la llave de huella o rostro de las dos
// aplicaciones de teléfono, y el Panel no la tiene. Además prueba quién es; ésta sólo contesta si
// desde este aparato ya se entró antes.
//
// LA MARCA NO ES UNA CREDENCIAL. Sola no deja entrar a nadie: se mira **después** de que la sesión
// ya está hecha, y lo único que decide es si hace falta pedir el segundo factor. Robarla no abre
// ninguna puerta; lo más que consigue es ahorrarse un código teniendo además la clave.
//
// CON DOS CREDENCIALES, CADA UNA PARA LO SUYO. Lo que se lee se lee con la credencial de quien
// pide (`db`), que sólo alcanza sus propios equipos. Lo que se anota o se revoca en
// `equipos_conocidos` lo escribe el trabajo de su Prestadora: si la persona pudiera escribir esa
// tabla con su credencial, con la clave sola —que ya le da sesión— se anotaría un equipo y se
// ahorraría el segundo factor. Las llaves de las aplicaciones de teléfono sí las revoca la propia
// persona, que ya puede hacerlo con las suyas.

const TRABAJO = 'Anotar los equipos conocidos';

export function marcaNueva() {
  return crypto.randomBytes(32).toString('base64url');
}

export function verificadorDeLaMarca(marca) {
  const texto = String(marca ?? '').trim();
  if (!texto) return null;
  return crypto.createHash('sha256').update(texto).digest('hex');
}

/** La fila de este aparato, si existe y no está revocada. Falla cerrado: ante cualquier duda, null.
 *  La Prestadora se nombra siempre, y sale de la sesión de quien está entrando. */
export async function equipoConocido({ usuarioId, prestadoraId, marca, db }) {
  if (!db) throw new Error('equipoConocido: falta la conexión de quien pide');
  const verificador = verificadorDeLaMarca(marca);
  if (!usuarioId || !prestadoraId || !verificador) return null;

  const { data, error } = await db
    .from('equipos_conocidos')
    .select('id, usuario_id, revocado_en')
    .eq('prestadora_id', prestadoraId)
    .eq('usuario_id', usuarioId)
    .eq('marca_verificador', verificador)
    .is('revocado_en', null)
    .maybeSingle();

  if (error) {
    console.error('equiposConocidos: no se pudo resolver el equipo:', error.message);
    return null;
  }
  return data ?? null;
}

/**
 * Deja anotado que desde este aparato se entró, y devuelve la marca que el navegador tiene que
 * guardar. Si no venía ninguna —el caso corriente de la primera vez— se emite una.
 */
export async function anotarEquipo({ usuario, marca = null }) {
  if (!usuario?.id || !usuario?.prestadora_id) return null;

  const laMarca = String(marca ?? '').trim() || marcaNueva();
  const verificador = verificadorDeLaMarca(laMarca);
  const ahora = new Date().toISOString();

  const { error } = await enLaPrestadora(usuario.prestadora_id, TRABAJO, (trabajo) => trabajo
    .from('equipos_conocidos')
    .upsert(
      {
        prestadora_id: usuario.prestadora_id,
        usuario_id: usuario.id,
        marca_verificador: verificador,
        ultima_entrada_en: ahora,
        revocado_en: null,
      },
      { onConflict: 'usuario_id,marca_verificador' },
    ));

  if (error) {
    console.error('equiposConocidos: no se pudo anotar el equipo:', error.message);
    return null;
  }
  return laMarca;
}

/**
 * Cierra la sesión en todos los aparatos: se revocan las marcas, se revocan las llaves de las dos
 * aplicaciones de teléfono y se cierran las sesiones abiertas del servicio de acceso.
 *
 * ES LO PRIMERO QUE NECESITA ALGUIEN A QUIEN LE ROBARON EL TELÉFONO, y hasta acá no existía.
 * Cambiar la clave no alcanzaba: las sesiones ya abiertas seguían vivas.
 *
 * La Prestadora se nombra en las dos tablas, y la trae quien llama desde la sesión comprobada. Las
 * llaves y las sesiones se cierran con la credencial de la propia persona, que es la que pidió
 * cerrarlas.
 */
export async function cerrarSesionEnTodosLosEquipos(usuarioId, prestadoraId, token, db) {
  if (!db) throw new Error('cerrarSesionEnTodosLosEquipos: falta la conexión de quien pide');
  if (!usuarioId || !prestadoraId || !token) return;

  const ahora = new Date().toISOString();

  await enLaPrestadora(prestadoraId, TRABAJO, (trabajo) => trabajo
    .from('equipos_conocidos')
    .update({ revocado_en: ahora })
    .eq('prestadora_id', prestadoraId)
    .eq('usuario_id', usuarioId)
    .is('revocado_en', null));

  // Las llaves de las dos aplicaciones de teléfono. Se marcan revocadas, igual que cuando la
  // persona saca una sola: una llave revocada no abre, y la fila queda.
  const { error: errorLlaves } = await db
    .from('llaves_de_dispositivo')
    .update({ revocada_en: ahora })
    .eq('prestadora_id', prestadoraId)
    .eq('usuario_id', usuarioId)
    .is('revocada_en', null);
  if (errorLlaves) console.error('equiposConocidos: no se pudieron revocar las llaves:', errorLlaves.message);

  // Y las sesiones que ya estaban abiertas. Sin esto lo anterior no sirve: quien tiene el aparato
  // en la mano sigue adentro hasta que su pase venza solo.
  await cerrarTodasLasSesionesDe(token);
}

/** Los aparatos desde los que esta persona entró, para que pueda verlos antes de cerrarlos todos. */
export async function equiposDe(usuarioId, prestadoraId, db) {
  if (!db) throw new Error('equiposDe: falta la conexión de quien pide');
  if (!usuarioId || !prestadoraId) return [];

  const { data, error } = await db
    .from('equipos_conocidos')
    .select('id, primera_entrada_en, ultima_entrada_en')
    .eq('prestadora_id', prestadoraId)
    .eq('usuario_id', usuarioId)
    .is('revocado_en', null)
    .order('ultima_entrada_en', { ascending: false });

  if (error) {
    console.error('equiposConocidos: no se pudieron listar los equipos:', error.message);
    return [];
  }
  return data ?? [];
}
