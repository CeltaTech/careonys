/* Las contraseñas de terceros: cada Prestadora con su propia clave.
   =================================================================

   QUÉ GUARDA. Las contraseñas con las que una Prestadora habla con otro software: las tres de
   WhatsApp, los dos secretos con los que firman el software de cobranzas y el de facturación, la
   del proveedor de mensajes de texto y la de cada software externo. Viven en la tabla
   `secretos_de_terceros`, una fila por Prestadora y por uso.

   CÓMO SE GUARDAN. El backend las cifra antes de mandarlas a la base, con AES-256-GCM y una clave
   que es sólo de esa Prestadora. La base guarda el texto cifrado y, al lado, con qué versión de la
   clave se cifró. La clave nunca llega a la base.

   DE DÓNDE SALE LA CLAVE. De la variable de entorno CLAVES_DE_LOS_SECRETOS_DE_TERCEROS, un JSON
   con una entrada por Prestadora:

     {"<prestadora>": {"version": 2, "claves": {"1": "<base64>", "2": "<base64>"}}}

   `version` es la que se usa para cifrar de acá en adelante; las anteriores quedan para leer lo
   que se guardó con ellas. Cada clave son 32 bytes al azar, escritos en base64. La genera
   `scripts/generar_clave_de_secretos.mjs`, que nunca la muestra.

   POR QUÉ UNA POR PRESTADORA. Una sola clave para todas sería una llave maestra: quien la tuviera
   leería las contraseñas de todas. Con una por Prestadora, la de una no descifra nada de otra. Y
   el texto cifrado lleva pegados, como dato autenticado, la Prestadora y el uso: copiar la fila de
   una Prestadora a otra, o la de un uso a otro, no sirve, porque el descifrado falla.

   FALLA CERRADO. Sin clave para esa Prestadora no se guarda ni se lee nada: se corta con un error
   que dice qué falta. Un texto cifrado alterado, o cifrado con otra clave, tampoco se lee. Nunca
   se guarda en claro «mientras tanto». */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { ErrorConMotivo } from './errorConMotivo.js';

const VARIABLE = 'CLAVES_DE_LOS_SECRETOS_DE_TERCEROS';
const TABLA = 'secretos_de_terceros';
const ALGORITMO = 'aes-256-gcm';
const LARGO_DE_LA_CLAVE = 32;
const LARGO_DEL_INICIO = 12;
const LARGO_DE_LA_ETIQUETA = 16;

/** Para qué es cada contraseña. Es la misma lista que la base acepta, y no otra. */
export const USO = Object.freeze({
  WHATSAPP_TOKEN_DE_ACCESO: 'whatsapp_access_token',
  WHATSAPP_SECRETO_DE_LA_APLICACION: 'whatsapp_app_secret',
  WHATSAPP_TOKEN_DEL_SALUDO: 'whatsapp_verify_token',
  AVISO_DE_COBRANZA: 'secreto_del_aviso_de_cobranza',
  AVISO_DE_FACTURACION: 'secreto_del_aviso_de_facturacion',
  MENSAJE_DE_TEXTO: 'credencial_del_mensaje_de_texto',
  SOFTWARE_DE_FACTURACION: 'credencial_software_facturacion',
  SOFTWARE_DE_CREDITOS_Y_COBRANZAS: 'credencial_software_creditos_y_cobranzas',
});

const USOS_CONOCIDOS = new Set(Object.values(USO));

/** Lo que puede salir mal. El motivo viaja a la pantalla; el detalle queda en el registro. */
export const MOTIVO_SECRETO = Object.freeze({
  SIN_CLAVE: 'secretos_sin_clave_de_la_prestadora',
  ILEGIBLE: 'secreto_de_tercero_ilegible',
});

/** Sin clave la Prestadora no puede guardar ni leer: es configuración que falta, no un pedido mal
 *  armado. 503 dice «no disponible en este momento». */
export const ESTADO_SIN_CLAVE = 503;

/** El estado con que se contesta un error al guardar o leer: 503 si falta la clave, 500 si no. */
export function estadoDelErrorDeSecreto(error) {
  return error?.motivo === MOTIVO_SECRETO.SIN_CLAVE ? ESTADO_SIN_CLAVE : 500;
}

function sinClave(detalle) {
  return new ErrorConMotivo(MOTIVO_SECRETO.SIN_CLAVE, detalle);
}

/** Las claves, leídas de la variable de entorno cada vez: así cambiarla no exige reiniciar nada
 *  más que el proceso, y las pruebas pueden fijar la suya. Falla si la variable está mal escrita. */
export function clavesDeLosSecretos(texto = process.env[VARIABLE]) {
  if (!texto) return {};
  let claves;
  try {
    claves = JSON.parse(texto);
  } catch {
    throw sinClave(`La variable ${VARIABLE} no es un JSON válido`);
  }
  if (!claves || typeof claves !== 'object' || Array.isArray(claves)) {
    throw sinClave(`La variable ${VARIABLE} tiene que ser un objeto con una entrada por Prestadora`);
  }
  return claves;
}

/** La clave de esa Prestadora en esa versión, como bytes. Corta si no está o no mide 32 bytes. */
function claveDe(prestadoraId, version, claves) {
  const entrada = claves[prestadoraId];
  const texto = entrada && typeof entrada === 'object' ? entrada.claves?.[String(version)] : undefined;
  const clave = typeof texto === 'string' ? Buffer.from(texto, 'base64') : null;
  if (!clave || clave.length !== LARGO_DE_LA_CLAVE) {
    throw sinClave(`La Prestadora ${prestadoraId} no tiene la versión ${version} de su clave de secretos`);
  }
  return clave;
}

/** La versión con la que se cifra hoy para esa Prestadora. */
function versionVigente(prestadoraId, claves) {
  const version = Number(claves[prestadoraId]?.version);
  if (!Number.isInteger(version) || version < 1) {
    throw sinClave(`La Prestadora ${prestadoraId} no tiene clave de secretos`);
  }
  return version;
}

/** Lo que se autentica junto con el texto: de qué Prestadora y para qué es. */
function datoAutenticado(prestadoraId, uso) {
  return Buffer.from(`${prestadoraId}|${uso}`, 'utf8');
}

function exigirUso(uso) {
  if (!USOS_CONOCIDOS.has(uso)) throw new Error(`secretosDeTerceros: uso desconocido (${uso})`);
}

/**
 * Cifra un texto para una Prestadora y un uso. Devuelve la fila tal como se guarda: el texto
 * cifrado —inicio, etiqueta y datos, en base64 y separados por punto— y la versión de la clave.
 */
export function cifrarSecreto({ prestadoraId, uso, texto }, claves = clavesDeLosSecretos()) {
  exigirUso(uso);
  if (!prestadoraId) throw new Error('secretosDeTerceros: falta la Prestadora');
  const version = versionVigente(prestadoraId, claves);
  const clave = claveDe(prestadoraId, version, claves);

  const inicio = randomBytes(LARGO_DEL_INICIO);
  const cifrador = createCipheriv(ALGORITMO, clave, inicio, { authTagLength: LARGO_DE_LA_ETIQUETA });
  cifrador.setAAD(datoAutenticado(prestadoraId, uso));
  const datos = Buffer.concat([cifrador.update(String(texto), 'utf8'), cifrador.final()]);
  const etiqueta = cifrador.getAuthTag();

  return {
    texto_cifrado: [inicio, etiqueta, datos].map((parte) => parte.toString('base64')).join('.'),
    version_de_clave: version,
  };
}

/**
 * Descifra lo que se guardó para una Prestadora y un uso. Corta si falta la clave de esa versión,
 * si el texto está alterado, si se cifró con otra clave o si es de otra Prestadora o de otro uso.
 */
export function descifrarSecreto({ prestadoraId, uso, texto_cifrado, version_de_clave }, claves = clavesDeLosSecretos()) {
  exigirUso(uso);
  const clave = claveDe(prestadoraId, version_de_clave, claves);

  const partes = String(texto_cifrado ?? '').split('.');
  if (partes.length !== 3) throw new ErrorConMotivo(MOTIVO_SECRETO.ILEGIBLE, 'El texto cifrado no tiene forma');
  const [inicio, etiqueta, datos] = partes.map((parte) => Buffer.from(parte, 'base64'));
  if (inicio.length !== LARGO_DEL_INICIO || etiqueta.length !== LARGO_DE_LA_ETIQUETA) {
    throw new ErrorConMotivo(MOTIVO_SECRETO.ILEGIBLE, 'El texto cifrado no tiene forma');
  }

  try {
    const descifrador = createDecipheriv(ALGORITMO, clave, inicio, { authTagLength: LARGO_DE_LA_ETIQUETA });
    descifrador.setAAD(datoAutenticado(prestadoraId, uso));
    descifrador.setAuthTag(etiqueta);
    return Buffer.concat([descifrador.update(datos), descifrador.final()]).toString('utf8');
  } catch {
    // El detalle de la biblioteca no dice nada útil y no sale de acá.
    throw new ErrorConMotivo(MOTIVO_SECRETO.ILEGIBLE, 'El texto cifrado no se pudo descifrar con la clave de la Prestadora');
  }
}

/* LO QUE TOCA LA BASE.
   ====================

   Las tres funciones de abajo reciben la conexión del trabajo de esa misma Prestadora
   (`enLaPrestadora` o `conexionDeLaDireccion`). La tabla no tiene ningún permiso para quien inicia
   sesión: la lee y la escribe sólo el backend, y la base acota cada conexión a su Prestadora. */

/** Guarda, o reemplaza, la contraseña de ese uso. Cifra antes de escribir: sin clave no escribe. */
export async function guardarSecretoDeTercero(db, prestadoraId, uso, texto) {
  const fila = cifrarSecreto({ prestadoraId, uso, texto });
  const { error } = await db
    .from(TABLA)
    .upsert(
      { prestadora_id: prestadoraId, uso, ...fila, updated_at: new Date().toISOString() },
      { onConflict: 'prestadora_id,uso' },
    );
  if (error) throw error;
}

/**
 * Lee la contraseña de ese uso. Devuelve `null` si no hay ninguna cargada. Si hay una y no se
 * puede descifrar —falta la clave, está alterada—, corta: quien llama la trata como no cargada y
 * rechaza, pero el motivo queda en el registro.
 */
export async function leerSecretoDeTercero(db, prestadoraId, uso) {
  exigirUso(uso);
  const { data, error } = await db
    .from(TABLA)
    .select('texto_cifrado, version_de_clave')
    .eq('prestadora_id', prestadoraId)
    .eq('uso', uso)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return descifrarSecreto({ prestadoraId, uso, ...data });
}

/**
 * Lee la contraseña para comprobar algo que llega de afuera. No corta: devuelve el texto, o
 * `null` y el motivo por el que no hay. Lo usan las puertas que reciben avisos de otro software,
 * que ante cualquier motivo rechazan, y que dejan el motivo en el registro del servidor.
 */
export async function secretoParaComprobar(db, prestadoraId, uso) {
  try {
    const texto = await leerSecretoDeTercero(db, prestadoraId, uso);
    return texto ? { texto, motivo: null } : { texto: null, motivo: 'secreto_no_cargado' };
  } catch (error) {
    return { texto: null, motivo: error?.motivo ?? 'secreto_no_se_pudo_leer' };
  }
}

/** Qué contraseñas tiene cargadas esa Prestadora. Nunca su contenido: sólo los usos. */
export async function secretosCargados(db, prestadoraId) {
  const { data, error } = await db.from(TABLA).select('uso').eq('prestadora_id', prestadoraId);
  if (error) throw error;
  return new Set((data ?? []).map((fila) => fila.uso));
}
