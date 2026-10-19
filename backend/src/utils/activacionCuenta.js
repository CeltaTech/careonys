import crypto from 'crypto';
import { enLaPrestadora } from '../db/connection.js';
import { correoDe } from './correoDeUnaPersona.js';
import { ErrorConMotivo } from './errorConMotivo.js';
import { enviarEmail } from './email.js';
import { IDENTIDAD } from '../config/identidadProducto.js';
import { marcaDeLaPrestadora } from './marcaPrestadora.js';
import { mensajeDelSistema } from '../i18n/avisos.js';
import { idiomaDelDestinatario } from '../i18n/idiomas.js';
import { idiomaDeLaPrestadora } from '../i18n/idiomaDeLaPrestadora.js';
import { enlaceConCodigo } from './direccionDeLaPrestadora.js';
import { verificadorDelEnlace } from './verificadorDelEnlace.js';
import { seAgotaronLosPedidosDeClave, anotarPedidoDeClave } from './topeDePedidosDeClave.js';
import {
  diasDeValidezDelEnlaceDeActivacion,
  diasHastaElRecordatorioDeActivacion,
} from '../config/enlaceDeActivacion.js';

const UN_DIA_MS = 24 * 60 * 60 * 1000;

// URL pública de la PWA correspondiente al rol de la cuenta nueva — nunca hardcodeada
// (CLAUDE.md §7 regla 1), viene de variables de entorno propias por app (backend/.env.example).
const ROLES_DE_PANEL = ['superadmin', 'admin_prestadora', 'coordinador'];

// A qué pantalla manda el link de activación. Cada rol entra por una puerta distinta, y un link
// a la puerta equivocada no es un detalle estético: la persona no tiene cuenta ahí y se queda
// afuera sin entender por qué.
function urlAppPorRol(rol) {
  if (rol === 'asistente') return process.env.PWA_ASISTENTES_URL;
  if (ROLES_DE_PANEL.includes(rol)) return process.env.PANEL_URL;
  return process.env.PWA_CLIENTES_URL;
}

// Punto único de verdad: genera el token de un solo uso y manda el email de activación por
// el SMTP que ya existe (email.js) — usado por crearCuentaConPerfil cuando la cuenta nueva es de
// Cliente/Asistente/Personas autorizadas, y también para el administrador que se crea al dar de alta una
// Prestadora (`routes/panelPrestadoras.js`): esa persona tampoco tiene a quién pedirle su clave,
// porque quien la dio de alta es de CeltaTech y no puede ver ni elegir la contraseña de nadie.
// Las demás cuentas de Panel —las que una Prestadora crea para su propio equipo— siguen con el
// camino de siempre, en el que quien la crea comunica la primera clave.
export async function invitarActivacionCuenta({ usuarioId, email, nombre, rol, prestadoraId = null, idioma = null }) {
  // Sin Prestadora no hay enlace que sirva ni cuenta a la cual colgarlo: se corta antes de escribir.
  if (!prestadoraId) {
    console.error('invitarActivacionCuenta: falta la Prestadora, no se envió el email de activación');
    return;
  }

  const appUrl = urlAppPorRol(rol);
  if (!appUrl) {
    // Sin URL configurada (ej. entorno local sin la variable seteada) no se puede armar un
    // link válido — se registra y se sigue sin romper el alta de la cuenta, en vez de fallar
    // toda la operación por un email que de todos modos no se podría entregar bien.
    console.error(`invitarActivacionCuenta: falta la variable de entorno para el rol "${rol}", no se envió el email de activación`);
    return;
  }

  const dias = diasDeValidezDelEnlaceDeActivacion();
  const token = crypto.randomBytes(32).toString('base64url');
  const ahora = new Date().toISOString();
  const expiraEn = new Date(Date.now() + dias * UN_DIA_MS).toISOString();

  // El enlace se arma antes de guardar el código: sin la dirección de la Prestadora no hay enlace
  // que sirva, y un código guardado que no viaja en ningún correo no le sirve a nadie.
  const link = await enlaceConCodigo({ appUrl, pantalla: 'activar-cuenta', prestadoraId, codigo: token });
  if (!link) {
    console.error('invitarActivacionCuenta: la Prestadora no tiene dirección, no se envió el email de activación');
    return;
  }

  // Con el trabajo de la Prestadora, que sólo alcanza las cuentas de ella.
  const { data: nuevo, error } = await enLaPrestadora(prestadoraId, 'enlace de activación', (db) => db
    .from('tokens_activacion_cuenta')
    .insert({ usuario_id: usuarioId, token: verificadorDelEnlace(token), expira_en: expiraEn })
    .select('id')
    .single());
  if (error) throw new Error(error.message);

  // SIRVE SÓLO EL ÚLTIMO. Los enlaces anteriores de esta cuenta que todavía servían quedan vencidos
  // desde ahora: el que llega a una dirección corregida no puede convivir con el que salió a la
  // equivocada. Se vencen y no se dan por usados, porque «usado» quiere decir que la cuenta se
  // activó (`nuncaSeActivaron`).
  const { error: errorAnteriores } = await enLaPrestadora(prestadoraId, 'enlace de activación', (db) => db
    .from('tokens_activacion_cuenta')
    .update({ expira_en: ahora })
    .eq('usuario_id', usuarioId)
    .is('usado_en', null)
    .gt('expira_en', ahora)
    .neq('id', nuevo.id));
  if (errorAnteriores) throw new Error(errorAnteriores.message);

  // Este correo lo recibe un Cliente o un Asistente, y para ellos la empresa es la Prestadora: es
  // a quien llamaron, con quien firmaron y de quien esperan un correo. Por eso el nombre que va
  // adelante es el de ella, no el del producto. El producto queda en la línea del pie, que va
  // siempre.
  //
  // Si la marca llegara vacía se usa el nombre del producto: es preferible un correo que dice
  // Careonys a uno que dice «Activación de la cuenta en undefined».
  const marca = await marcaDeLaPrestadora(prestadoraId);
  const textos = mensajeDelSistema('activacion_cuenta', idiomaDelDestinatario(idioma, await enLaPrestadora(prestadoraId, 'enlace de activación', (db) => idiomaDeLaPrestadora(db, prestadoraId))), {
    nombre,
    link,
    dias,
    empresa: marca?.nombre || IDENTIDAD.nombre,
    producto: IDENTIDAD.nombre,
  });
  await enviarEmail({ to: email, asunto: textos.asunto, texto: textos.texto, formato: textos.html });
}

// Un enlace nuevo a una cuenta que ya existe, al correo que tiene cargado. Lo usan el pedido de la
// propia persona cuando se le venció el enlace y el recordatorio automático.
//
// La Prestadora se recibe y no se deduce de la cuenta: la cuenta a la que se le reenvía tiene que
// ser de ésa. Es obligatoria y no tiene valor por omisión — sin ella se corta, porque un filtro
// vacío no acota nada (CLAUDE.md §5, todo control de acceso falla cerrado).
export async function reenviarActivacionCuenta(usuarioId, prestadoraId) {
  if (!prestadoraId) throw new Error('Cuenta no encontrada');

  const { data: usuario, error: errorUsuario } = await enLaPrestadora(prestadoraId, 'reenvío de la invitación', (db) => db
    .from('usuarios')
    .select('nombre, rol, prestadora_id')
    .eq('prestadora_id', prestadoraId)
    .eq('id', usuarioId)
    .single());
  if (errorUsuario || !usuario) throw new Error('Cuenta no encontrada');

  // El correo real se lee con `correoDeUnaPersona.js`. Sin él no hay a dónde mandar la invitación,
  // y decirlo así es distinto de decir que la cuenta no existe.
  const email = await correoDe({ prestadoraId: usuario.prestadora_id, usuarioId });
  if (!email) throw new Error('La cuenta no tiene correo');

  await invitarActivacionCuenta({
    usuarioId,
    email,
    nombre: usuario.nombre,
    rol: usuario.rol,
    prestadoraId: usuario.prestadora_id,
  });
}

// QUÉ CUENTAS NUNCA SE ACTIVARON: ningún enlace usado y ningún ingreso. Es la única definición, y
// vive en la base (`cuentas_nunca_activadas`) porque el registro de ingresos es de Supabase y el
// trabajo de la Prestadora no lo alcanza. Contesta sólo por cuentas de esta Prestadora. Si la base
// no contesta, se corta: ante la duda no sale ningún correo.
export async function nuncaSeActivaron(prestadoraId, usuarioIds) {
  if (!prestadoraId) throw new Error('nuncaSeActivaron: falta la Prestadora');
  const ids = [...new Set((usuarioIds ?? []).filter(Boolean))];
  if (!ids.length) return new Set();

  const { data, error } = await enLaPrestadora(prestadoraId, 'cuentas que nunca se activaron', (db) =>
    db.rpc('cuentas_nunca_activadas', { p_usuarios: ids }));
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((fila) => (typeof fila === 'string' ? fila : fila?.cuentas_nunca_activadas)));
}

export async function nuncaSeActivo(usuarioId, prestadoraId) {
  return (await nuncaSeActivaron(prestadoraId, [usuarioId])).has(usuarioId);
}

// LA PERSONA PIDE UN ENLACE NUEVO desde la página de activación, con el enlace vencido en la mano.
//
// NO DEVUELVE NADA, PASE LO QUE PASE. La ruta contesta siempre lo mismo: si la respuesta cambiara,
// la página serviría para averiguar qué enlaces existen. Sale un enlace nuevo, al correo que la
// cuenta ya tiene, sólo si el enlace existe en esta Prestadora, no se usó y la cuenta nunca se
// activó. El tope por hora es el mismo de los pedidos de clave (`topeDePedidosDeClave.js`) y se
// cuenta por el correo de la cuenta, que es a quien se le llenaría la bandeja.
export async function pedirEnlaceNuevo(token, prestadoraId) {
  if (!prestadoraId || typeof token !== 'string' || !token) return;

  const { data: fila, error } = await enLaPrestadora(prestadoraId, 'pedido de un enlace de activación nuevo', (db) => db
    .from('tokens_activacion_cuenta')
    .select('usuario_id, usado_en')
    .eq('token', verificadorDelEnlace(token))
    .maybeSingle());
  if (error) throw new Error(error.message);
  if (!fila) return;

  const email = await correoDe({ prestadoraId, usuarioId: fila.usuario_id });
  if (!email) return;

  if (await seAgotaronLosPedidosDeClave(prestadoraId, fila.usuario_id)) return;
  await anotarPedidoDeClave(prestadoraId, fila.usuario_id);

  if (fila.usado_en) return;
  if (!(await nuncaSeActivo(fila.usuario_id, prestadoraId))) return;

  await reenviarActivacionCuenta(fila.usuario_id, prestadoraId);
}

// EL RECORDATORIO. A la cuenta que tiene un enlace vigente sin usar, emitido hace unos días, le sale
// solo un enlace nuevo, una sola vez en la vida de esa cuenta. Cuántos días esperar y cuánto sirve
// el enlace son configuración (`config/enlaceDeActivacion.js`).
//
// Corre de a una Prestadora por vez (`server.js`). La marca se pone antes de mandar y sólo si nadie
// la puso antes: dos vueltas encimadas no mandan dos recordatorios.
//
// @returns {Promise<{ recordados: number }>} Lo usa la prueba; el trabajo diario no mira el número.
export async function recordarLosEnlacesDeActivacion(prestadoraId) {
  if (!prestadoraId) return { recordados: 0 };
  const TRABAJO = 'recordatorio del enlace de activación';
  const ahora = new Date();
  const emitidoHasta = new Date(ahora.getTime() - diasHastaElRecordatorioDeActivacion() * UN_DIA_MS).toISOString();

  const { data: enlaces, error } = await enLaPrestadora(prestadoraId, TRABAJO, (db) => db
    .from('tokens_activacion_cuenta')
    .select('id, usuario_id')
    .is('usado_en', null)
    .is('recordatorio_enviado_en', null)
    .gt('expira_en', ahora.toISOString())
    .lte('created_at', emitidoHasta));
  if (error) throw new Error(error.message);

  const enlacePorCuenta = new Map();
  for (const enlace of enlaces ?? []) {
    if (!enlacePorCuenta.has(enlace.usuario_id)) enlacePorCuenta.set(enlace.usuario_id, enlace.id);
  }
  if (!enlacePorCuenta.size) return { recordados: 0 };

  // Una sola vez por cuenta: la que ya tuvo recordatorio en cualquiera de sus enlaces no recibe otro.
  const { data: yaRecordadas, error: errorRecordadas } = await enLaPrestadora(prestadoraId, TRABAJO, (db) => db
    .from('tokens_activacion_cuenta')
    .select('usuario_id')
    .in('usuario_id', [...enlacePorCuenta.keys()])
    .not('recordatorio_enviado_en', 'is', null));
  if (errorRecordadas) throw new Error(errorRecordadas.message);
  for (const { usuario_id } of yaRecordadas ?? []) enlacePorCuenta.delete(usuario_id);

  const nunca = await nuncaSeActivaron(prestadoraId, [...enlacePorCuenta.keys()]);

  let recordados = 0;
  for (const [usuarioId, enlaceId] of enlacePorCuenta) {
    if (!nunca.has(usuarioId)) continue;
    const { data: marcado, error: errorMarca } = await enLaPrestadora(prestadoraId, TRABAJO, (db) => db
      .from('tokens_activacion_cuenta')
      .update({ recordatorio_enviado_en: new Date().toISOString() })
      .eq('id', enlaceId)
      .is('recordatorio_enviado_en', null)
      .select('id'));
    if (errorMarca) {
      console.error(`${TRABAJO}: no se pudo anotar el recordatorio:`, errorMarca.message);
      continue;
    }
    if (!marcado?.length) continue;
    try {
      await reenviarActivacionCuenta(usuarioId, prestadoraId);
      recordados += 1;
    } catch (err) {
      console.error(`${TRABAJO}: no se pudo mandar:`, err?.message ?? err);
    }
  }
  return { recordados };
}

// Consumido por el endpoint público POST /api/activar-cuenta/:prestadora — corre adentro de la
// Prestadora de la dirección, así que el código sólo se encuentra si es de ella. Valida el token
// (existe, no vencido, no usado), fija el nombre de usuario y la contraseña elegidos por la
// persona, y lo marca usado. Nunca expone ningún dato del usuario.
export async function activarCuentaConToken(token, passwordNueva, prestadoraId, usuario) {
  if (!prestadoraId) throw new ErrorConMotivo('token_invalido');
  return enLaPrestadora(prestadoraId, 'activación de la cuenta', (db) => activarAdentro(db, token, passwordNueva, usuario));
}

// Los motivos con que la base rechaza el nombre de usuario elegido. Viajan tal cual hasta la
// pantalla, que los muestra al pie del casillero.
const MOTIVOS_DEL_USUARIO = ['faltan_datos', 'usuario_mal_escrito', 'usuario_en_uso'];

async function activarAdentro(db, token, passwordNueva, usuario) {
  const { data: fila, error: errorFila } = await db
    .from('tokens_activacion_cuenta')
    .select('id, usuario_id, expira_en, usado_en')
    .eq('token', verificadorDelEnlace(token))
    .maybeSingle();

  // Los tres motivos viajan tal cual hasta la pantalla, que los explica en el idioma de
  // quien mira: son tres problemas distintos y se resuelven distinto —el enlace equivocado se
  // vuelve a abrir desde el correo, el ya usado se saltea entrando por la pantalla de ingreso,
  // y el vencido se reemplaza pidiendo uno nuevo desde la misma página (`pedirEnlaceNuevo`)—. Van sin detalle a propósito: el código
  // ya dice todo lo que hay para decir, y un detalle acá solo reemplazaría el código en la
  // respuesta sin quedar registrado en ningún lado.
  if (errorFila || !fila) throw new ErrorConMotivo('token_invalido');
  if (fila.usado_en) throw new ErrorConMotivo('token_ya_usado');
  if (new Date(fila.expira_en) < new Date()) throw new ErrorConMotivo('token_vencido');

  // EL CÓDIGO SE GASTA, EL NOMBRE DE USUARIO SE GUARDA Y LA CLAVE SE PONE EN UNA SOLA OPERACIÓN DE
  // LA BASE (`activar_la_cuenta`): o pasan las tres o no pasa ninguna. Un nombre ya tomado devuelve
  // el motivo y deja el enlace sin gastar, para que la persona elija otro. Dos pedidos con el mismo
  // código al mismo tiempo no pasan los dos, porque el segundo ya no lo encuentra libre y se va por
  // donde se va un enlace ya usado. Y el código se busca sólo adentro de la Prestadora de la
  // dirección: el de otra no existe desde acá. Viaja el enlace tal como llegó: el identificador de
  // verificación lo calcula la base.
  const { data: usuarioId, error: errorClave } = await db.rpc('activar_la_cuenta', {
    p_codigo: token,
    p_clave: passwordNueva,
    p_usuario: usuario ?? null,
  });
  if (errorClave) {
    if (MOTIVOS_DEL_USUARIO.includes(errorClave.message)) throw new ErrorConMotivo(errorClave.message);
    throw new Error(errorClave.message);
  }
  if (!usuarioId) throw new ErrorConMotivo('token_ya_usado');

  // De quién era el enlace. Lo devuelve para lo que sigue en la misma pantalla —ofrecerle
  // verificar el teléfono—, y no sale de acá hacia el navegador: lo que viaja es si salió el
  // código, nunca a quién ni a qué número.
  return { usuarioId };
}

// De quién es este enlace, **ya usado**.
//
// SIRVE PARA UN SOLO PASO Y NO ES UNA CREDENCIAL. Después de activar, la pantalla ofrece
// verificar el teléfono, y para eso hace falta saber de quién es la cuenta. El enlace alcanza
// para nombrarla y no alcanza para nada más: quien pide ese paso tiene que escribir además la
// contraseña que acaba de elegir (`utils/telefonoAlActivar.js`), que es lo que no tiene alguien
// que se haya quedado con el correo. Sin esa segunda condición, un enlace viejo serviría para
// colgarle a una cuenta ajena un número propio, y un número verificado recupera la clave.
//
// Se exige `usado_en`: sin activar no hay contraseña contra la cual comprobar nada.
export async function cuentaQueActivoConEsteToken(token, prestadoraId) {
  if (!prestadoraId) throw new ErrorConMotivo('token_invalido');
  const { data: fila, error } = await enLaPrestadora(prestadoraId, 'activación de la cuenta', (db) => db
    .from('tokens_activacion_cuenta')
    .select('usuario_id, usado_en')
    .eq('token', verificadorDelEnlace(token))
    .maybeSingle());

  if (error || !fila || !fila.usado_en) throw new ErrorConMotivo('token_invalido');
  return fila.usuario_id;
}
