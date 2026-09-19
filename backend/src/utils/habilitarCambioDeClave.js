import { supabase } from '../db/connection.js';
import { ErrorConMotivo } from './errorConMotivo.js';
import { huellaDelTelefono } from './codigoAlTelefono.js';

// LA PRESTADORA HABILITA, NO CAMBIA.
//
// Cuando alguien llama porque no puede entrar, quien atiende el llamado le abre una puerta: un
// cambio de clave que dura poco y sirve una vez. **Nunca elige la clave de nadie ni la ve.** Acá no
// se guarda ninguna clave, ni una huella de clave, ni nada con que deducir una: lo que queda
// anotado es que se abrió la puerta, para quién, quién la abrió y hasta cuándo dura.
//
// SE HABILITA HACIA ABAJO, Y NUNCA A UNO MISMO. El rol técnico de la empresa habilita a la
// administración; la administración, a quien coordina y a la gente de las aplicaciones; quien
// coordina, a la gente de las aplicaciones. A ella misma no la habilita nadie de su propio escalón,
// y por eso hay un escalón arriba.
//
// LA REGLA ESTÁ ESCRITA DOS VECES A PROPÓSITO: acá y en un disparador de la base
// (`interno.se_habilita_hacia_abajo_y_nunca_a_uno_mismo`). No es una copia por descuido: el motor
// entra con la llave maestra y se saltea la protección por fila, así que sin el control de este
// lado la regla de la base nunca se evaluaría con lo que el motor sabe; y sin la de la base,
// cualquier camino nuevo que escriba en esa tabla nacería sin control.

const ESCALON = {
  superadmin: 4,
  admin_prestadora: 3,
  coordinador: 2,
  asistente: 1,
  familia: 1,
};

// Un rol que no se entiende no está por debajo de nadie: nadie lo habilita y él no habilita a
// nadie. Todo control de acceso falla cerrado (CLAUDE.md de la empresa §5).
const ESCALON_DESCONOCIDO = 9;

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
  const { data } = await supabase
    .from('usuarios')
    .select('id, rol, nombre, email, telefono, telefono_verificado_en, prestadora_id')
    .eq('id', usuarioId)
    .eq('prestadora_id', prestadoraId)
    .maybeSingle();
  return data ?? null;
}

/**
 * Abre la puerta. Devuelve la cuenta a la que se le abrió, para que la ruta mande el aviso y deje
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
  await supabase
    .from('cambios_de_clave_habilitados')
    .update({ anulado_en: new Date().toISOString() })
    .eq('usuario_id', usuarioId)
    .is('usado_en', null)
    .is('anulado_en', null);

  const { error } = await supabase.from('cambios_de_clave_habilitados').insert({
    prestadora_id: quien.prestadoraId,
    usuario_id: usuarioId,
    habilitado_por: quien.id,
    expira_en: expiraEn,
  });
  if (error) throw new Error(error.message);

  return cuenta;
}

/**
 * El atajo del paso 17: quien atiende el llamado confirma que ese número es de esa persona, y con
 * eso el número no espera nada para servir de llave.
 *
 * NO CAMBIA EL NÚMERO. Confirma el que la cuenta ya tiene cargado. Cambiarlo es de la persona, con
 * su clave actual, y desde su propia pantalla.
 */
export async function confirmarTelefonoDeLaCuenta({ quien, usuarioId }) {
  if (!quien?.id || !quien?.prestadoraId || !usuarioId) throw new ErrorConMotivo('faltan_datos');
  if (quien.id === usuarioId) throw new ErrorConMotivo('no_puede_habilitar');

  const cuenta = await cuentaDeLaPrestadora(usuarioId, quien.prestadoraId);
  if (!cuenta) throw new ErrorConMotivo('no_encontrado');
  if (!puedeHabilitar(quien.rol, cuenta.rol)) throw new ErrorConMotivo('no_puede_habilitar');
  if (!cuenta.telefono) throw new ErrorConMotivo('telefono_invalido');

  const { error } = await supabase
    .from('telefonos_confirmados_por_la_prestadora')
    .upsert(
      {
        prestadora_id: quien.prestadoraId,
        usuario_id: usuarioId,
        confirmado_por: quien.id,
        telefono_huella: huellaDelTelefono(cuenta.telefono),
      },
      { onConflict: 'usuario_id,telefono_huella' },
    );
  if (error) throw new Error(error.message);

  return cuenta;
}

const TOPE_DE_LOS_PENDIENTES = 50;

/**
 * Los números que están a la espera de que alguien los habilite.
 *
 * QUÉ ES ESTAR A LA ESPERA: la cuenta cargó un número, todavía no lo habilitó nadie, y por eso ese
 * número no sirve para recuperar la clave. Entrar con el correo y la clave no depende de esto: lo
 * único que el número no habilitado no puede hacer es recuperarla.
 *
 * QUE ESE NÚMERO ESTÉ VERIFICADO NO LO SACA DE LA LISTA. Verificar prueba que el número funciona y
 * que quien lo cargó lo tiene a mano; lo que falta es que alguien reconozca a esa persona, y eso es
 * justamente lo que esta lista pide. Filtrar por la verificación dejaba afuera a quien cargó su
 * número y lo verificó antes de que nadie lo llamara, que es el caso corriente.
 *
 * NO HAY ESPERA POR TIEMPO. Nada de esta lista se habilita solo ni se vence solo: sale de la lista
 * cuando una persona lo habilita, y no antes.
 *
 * LA LISTA SALE FILTRADA POR QUIÉN PUEDE HABILITAR A QUIÉN, con la misma regla que usan las dos
 * acciones de más arriba. Quien coordina no se ve a sí mismo ni ve a otro que coordine: a la
 * coordinación la habilita la administración de la Prestadora. Es el motor el que lo niega, no la
 * pantalla.
 *
 * NO DEVUELVE NINGÚN NÚMERO DE TELÉFONO, igual que la búsqueda: lo que hace falta para llamar a esa
 * persona y verificar que el cambio es real es su nombre y su correo.
 */
export async function telefonosEsperandoHabilitacion(quien) {
  // Falla cerrado: sin sesión entendible no hay nada que mostrar.
  if (!quien?.id || !quien?.prestadoraId || !quien?.rol) return [];

  const { data, error } = await supabase
    .from('usuarios')
    .select('id, nombre, email, rol, telefono, telefono_verificado_en')
    .eq('prestadora_id', quien.prestadoraId)
    .not('telefono', 'is', null)
    .order('nombre', { ascending: true })
    .limit(TOPE_DE_LOS_PENDIENTES);
  if (error) throw new Error(error.message);

  const alcanzables = (data ?? [])
    .filter((cuenta) => cuenta.id !== quien.id)
    .filter((cuenta) => puedeHabilitar(quien.rol, cuenta.rol))
    .filter((cuenta) => Boolean(cuenta.telefono));
  if (alcanzables.length === 0) return [];

  // Las que ya habilitó alguien salen de la lista. Se pregunta una sola vez por todas, y se compara
  // contra la huella del número que la cuenta tiene hoy: habilitar un número viejo no habilita el
  // que vino después.
  const { data: confirmados, error: errorConfirmados } = await supabase
    .from('telefonos_confirmados_por_la_prestadora')
    .select('usuario_id, telefono_huella')
    .eq('prestadora_id', quien.prestadoraId)
    .in('usuario_id', alcanzables.map((cuenta) => cuenta.id));
  if (errorConfirmados) throw new Error(errorConfirmados.message);

  const yaHabilitados = new Set(
    (confirmados ?? []).map((fila) => `${fila.usuario_id}:${fila.telefono_huella}`),
  );

  return alcanzables
    .filter((cuenta) => !yaHabilitados.has(`${cuenta.id}:${huellaDelTelefono(cuenta.telefono)}`))
    .map((cuenta) => ({
      id: cuenta.id,
      nombre: cuenta.nombre,
      email: cuenta.email,
      rol: cuenta.rol,
    }));
}

/** ¿Este número ya lo confirmó la Prestadora para esta cuenta? */
export async function telefonoConfirmadoPorLaPrestadora({ usuarioId, telefono }) {
  if (!usuarioId || !telefono) return false;
  const { data } = await supabase
    .from('telefonos_confirmados_por_la_prestadora')
    .select('id')
    .eq('usuario_id', usuarioId)
    .eq('telefono_huella', huellaDelTelefono(telefono))
    .maybeSingle();
  return Boolean(data);
}

/** La puerta que sigue abierta para esta cuenta, si hay alguna. */
export async function cambioDeClaveHabilitado(usuarioId) {
  if (!usuarioId) return null;
  const { data } = await supabase
    .from('cambios_de_clave_habilitados')
    .select('id, expira_en')
    .eq('usuario_id', usuarioId)
    .is('usado_en', null)
    .is('anulado_en', null)
    .gt('expira_en', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

/** Se gasta la puerta. Devuelve false si otro pedido la gastó primero. */
export async function usarCambioDeClaveHabilitado(id) {
  if (!id) return false;
  const { data } = await supabase
    .from('cambios_de_clave_habilitados')
    .update({ usado_en: new Date().toISOString() })
    .eq('id', id)
    .is('usado_en', null)
    .select('id')
    .maybeSingle();
  return Boolean(data);
}
