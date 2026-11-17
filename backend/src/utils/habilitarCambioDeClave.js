import { enLaPrestadora } from '../db/connection.js';
import { ErrorConMotivo } from './errorConMotivo.js';

// LA PRESTADORA HABILITA, NO CAMBIA.
//
// Cuando alguien llama porque no puede entrar, quien atiende el llamado le abre una puerta: un
// cambio de clave que dura poco y sirve una vez. **Nunca elige la clave de nadie ni la ve.** Acá no
// se guarda ninguna clave, ni un identificador de verificación de clave, ni nada con que deducir una: lo que queda
// anotado es que se abrió la puerta, para quién, quién la abrió y hasta cuándo dura.
//
// SE HABILITA HACIA ABAJO, Y NUNCA A UNO MISMO. El rol técnico de la empresa habilita a la
// administración; la administración, a quien coordina y a la gente de las aplicaciones; quien
// coordina, a la gente de las aplicaciones. A ella misma no la habilita nadie de su propio escalón,
// y por eso hay un escalón arriba.
//
// LA REGLA ESTÁ ESCRITA DOS VECES A PROPÓSITO: acá y en un disparador de la base
// (`interno.se_habilita_hacia_abajo_y_nunca_a_uno_mismo`). No es una copia por descuido: el de acá
// contesta con el motivo que entiende la pantalla antes de escribir nada; y sin el de la base,
// cualquier camino nuevo que escriba en esa tabla nacería sin control.
//
// Todo va con el trabajo de la Prestadora de la cuenta, que alcanza sus cuentas y ninguna otra.

const ESCALON = {
  superadmin: 4,
  admin_prestadora: 3,
  coordinador: 2,
  asistente: 1,
  cliente: 1,
};

// Un rol que no se entiende no está por debajo de nadie: nadie lo habilita y él no habilita a
// nadie. Todo control de acceso falla cerrado (CLAUDE.md de la empresa §5).
const ESCALON_DESCONOCIDO = 9;

const TRABAJO = 'habilitación del cambio de clave';

export function escalonDelRol(rol) {
  return ESCALON[rol] ?? ESCALON_DESCONOCIDO;
}

// UN ROL QUE NO SE ENTIENDE NO HABILITA A NADIE, Y NO LO HABILITA NADIE. Son dos cosas y un solo
// número no alcanza para las dos: el escalón desconocido es el más alto, con lo cual ya nadie está
// por encima de él —nadie lo habilita—, pero él quedaría por encima de todos. Por eso el otro lado
// de la regla se escribe acá y no en el número.
export function puedeHabilitar(rolDeQuien, rolDelDestinatario) {
  if (!(rolDeQuien in ESCALON) || !(rolDelDestinatario in ESCALON)) return false;
  return escalonDelRol(rolDeQuien) > escalonDelRol(rolDelDestinatario);
}

const MINUTOS_POR_OMISION = 30;

/**
 * Cuánto dura la puerta abierta.
 *
 * Decisión pendiente del Desarrollador, por eso se lee del entorno y no está escrito en el código.
 * El valor de fábrica es corto a propósito: es el tiempo de una llamada telefónica, que es
 * exactamente lo que este camino resuelve.
 */
export function minutosDeLaHabilitacion() {
  const crudo = String(process.env.MINUTOS_DEL_CAMBIO_DE_CLAVE_HABILITADO ?? '').trim();
  if (!crudo) return MINUTOS_POR_OMISION;
  const numero = Number(crudo);
  if (!Number.isInteger(numero) || numero < 1) {
    console.warn('habilitarCambioDeClave: MINUTOS_DEL_CAMBIO_DE_CLAVE_HABILITADO no es un entero mayor que cero; se usa el valor de fábrica');
    return MINUTOS_POR_OMISION;
  }
  return numero;
}

async function cuentaDeLaPrestadora(usuarioId, prestadoraId) {
  if (!usuarioId || !prestadoraId) return null;
  const { data } = await enLaPrestadora(prestadoraId, TRABAJO, (db) => db
    .from('usuarios')
    .select('id, rol, nombre, email, telefono, telefono_verificado_en, prestadora_id')
    .eq('id', usuarioId)
    .eq('prestadora_id', prestadoraId)
    .is('desactivada_en', null)
    .maybeSingle());
  return data ?? null;
}

/**
 * Abre la puerta. Devuelve la cuenta a la que se le abrió, para que la ruta mande el mensaje y deje
 * el renglón en el registro.
 *
 * `quien` es `req.usuarioPanel`: la Prestadora sale siempre de la sesión comprobada, nunca de lo
 * que venga en el pedido.
 */
export async function habilitarCambioDeClave({ quien, usuarioId }) {
  if (!quien?.id || !quien?.prestadoraId || !usuarioId) throw new ErrorConMotivo('faltan_datos');

  // Ni a uno mismo. Se comprueba antes que nada: es el caso que la regla existe para impedir.
  if (quien.id === usuarioId) throw new ErrorConMotivo('no_puede_habilitar');

  const cuenta = await cuentaDeLaPrestadora(usuarioId, quien.prestadoraId);
  // La cuenta que no existe y la que es de otra Prestadora contestan lo mismo: desde afuera se
  // tienen que ver iguales.
  if (!cuenta) throw new ErrorConMotivo('no_encontrado');

  if (!puedeHabilitar(quien.rol, cuenta.rol)) throw new ErrorConMotivo('no_puede_habilitar');

  const expiraEn = new Date(Date.now() + minutosDeLaHabilitacion() * 60 * 1000).toISOString();

  // Lo anterior se da por anulado antes de abrir de nuevo: llamar dos veces no deja dos puertas
  // abiertas, deja una.
  const { error } = await enLaPrestadora(quien.prestadoraId, TRABAJO, async (db) => {
    await db
      .from('cambios_de_clave_habilitados')
      .update({ anulado_en: new Date().toISOString() })
      .eq('prestadora_id', quien.prestadoraId)
      .eq('usuario_id', usuarioId)
      .is('usado_en', null)
      .is('anulado_en', null);

    return db.from('cambios_de_clave_habilitados').insert({
      prestadora_id: quien.prestadoraId,
      usuario_id: usuarioId,
      habilitado_por: quien.id,
      expira_en: expiraEn,
    });
  });
  if (error) throw new Error(error.message);

  return cuenta;
}

/** La puerta que sigue abierta para esta cuenta, si hay alguna. */
export async function cambioDeClaveHabilitado(usuarioId, prestadoraId) {
  if (!usuarioId || !prestadoraId) return null;
  const { data } = await enLaPrestadora(prestadoraId, TRABAJO, (db) => db
    .from('cambios_de_clave_habilitados')
    .select('id, expira_en')
    .eq('prestadora_id', prestadoraId)
    .eq('usuario_id', usuarioId)
    .is('usado_en', null)
    .is('anulado_en', null)
    .gt('expira_en', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle());
  return data ?? null;
}

/** Se gasta la puerta. Devuelve false si otro pedido la gastó primero. */
export async function usarCambioDeClaveHabilitado(id, prestadoraId) {
  if (!id || !prestadoraId) return false;
  const { data } = await enLaPrestadora(prestadoraId, TRABAJO, (db) => db
    .from('cambios_de_clave_habilitados')
    .update({ usado_en: new Date().toISOString() })
    .eq('prestadora_id', prestadoraId)
    .eq('id', id)
    .is('usado_en', null)
    .select('id')
    .maybeSingle());
  return Boolean(data);
}
