// El alta de una Prestadora que pide CeltaTech.
//
// Sólo CeltaTech da de alta una Prestadora (`CLAUDE.md` del producto, «Qué es Careonys»). Lo pide
// por la puerta firmada de `routes/altaDePrestadora.js`, con el contrato de
// `celtatech/docs/MODELO_COMERCIAL_CELTATECH.md`, §6.1. Acá se arma el alta, una vez que la firma
// ya se comprobó.
//
// QUÉ HACE, EN ORDEN.
//   1. Saca el nombre de la casilla de envío del código de la Prestadora, con
//      `casillaDeEnvioDelCodigo`, y le pega el dominio del producto.
//   2. Abre el reenvío de las respuestas hacia el correo que declaró la Prestadora. Va antes de la
//      base porque la regla que devuelve se guarda en la misma operación que la Prestadora.
//   3. Le pide a la base el alta entera: la Prestadora, su código, su casilla, el reenvío, la
//      cuenta del Administrador y el renglón del registro de actividad. O pasa todo o nada.
//   4. Si la base no la creó —falló, o la referencia ya existía—, corta el reenvío recién abierto.
//      Así un alta que falla no deja nada de este lado ni del lado del correo.
//
// SIN LLAVE MAESTRA. La conexión es la del trabajo sin Prestadora, que la base sólo deja averiguar
// listas y, desde ahora, llamar a esta única función de alta, que no lee ni cambia ninguna
// Prestadora que ya exista.
import { sinPrestadora } from '../db/connection.js';
import { casillaDeEnvioDelCodigo } from './casillaDeEnvio.js';
import { dominioDeEnvio, esDireccionDeCorreo } from './email.js';
import { abrirReenvioDeRespuestas, cortarReenvioDeRespuestas } from './reenvioDeRespuestas.js';
import { ErrorConMotivo } from './errorConMotivo.js';

/** El nombre del trabajo, para el registro de la base. */
const TRABAJO = 'alta de Prestadoras';

/** Los motivos que la base devuelve escritos así a propósito. Cualquier otro texto es una falla. */
const MOTIVOS_DE_LA_BASE = [
  'faltan_datos',
  'codigo_en_uso',
  'casilla_en_uso',
  'nombre_en_uso',
  'correo_de_administracion_en_uso',
  'dato_en_uso',
  'codigo_mal_escrito',
  'pais_sin_moneda',
];

function texto(valor) {
  return typeof valor === 'string' ? valor.trim() : '';
}

/**
 * El primer dato que falta o vino mal en el pedido, con el nombre que tiene en el contrato. `null`
 * si está todo. Lo contesta la puerta, para que CeltaTech sepa qué corregir.
 */
export function loQueFaltaEnElAlta(cuerpo) {
  if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) return 'cuerpo';
  const cliente = cuerpo.cliente ?? {};
  const datos = cuerpo.datos_del_producto ?? {};
  const administrador = datos.administrador ?? {};

  if (!texto(cuerpo.suscripcion_id)) return 'suscripcion_id';
  if (!texto(cliente.razon_social)) return 'cliente.razon_social';
  if (!/^[A-Za-z]{2}$/.test(texto(cliente.pais))) return 'cliente.pais';
  if (!texto(datos.nombre_fantasia)) return 'datos_del_producto.nombre_fantasia';
  if (!texto(datos.codigo)) return 'datos_del_producto.codigo';
  if (datos.email_respuestas != null && texto(datos.email_respuestas) && !esDireccionDeCorreo(datos.email_respuestas)) {
    return 'datos_del_producto.email_respuestas';
  }
  if (!texto(administrador.nombre)) return 'datos_del_producto.administrador.nombre';
  if (!esDireccionDeCorreo(administrador.email)) return 'datos_del_producto.administrador.email';
  return null;
}

/** Lo que se usa de verdad. Las pruebas pasan lo suyo, sin base y sin correo. */
const DE_VERDAD = {
  llamarALaBase: (funcion, parametros) => sinPrestadora(TRABAJO).rpc(funcion, parametros),
  abrirReenvio: abrirReenvioDeRespuestas,
  cortarReenvio: cortarReenvioDeRespuestas,
  casillaDelCodigo: casillaDeEnvioDelCodigo,
  dominio: dominioDeEnvio,
};

/**
 * Da de alta la Prestadora. Devuelve `{ tenantRef, creada }`: `creada` es falso cuando la
 * referencia de CeltaTech ya tenía una Prestadora, y entonces `tenantRef` es el de esa.
 * Falla con `ErrorConMotivo` cuando el pedido choca con algo; con `Error` cuando falló la base.
 */
export async function darDeAltaLaPrestadora(cuerpo, dependencias = {}) {
  const usar = { ...DE_VERDAD, ...dependencias };
  const cliente = cuerpo.cliente ?? {};
  const datos = cuerpo.datos_del_producto ?? {};
  const administrador = datos.administrador ?? {};

  const codigo = texto(datos.codigo);
  const casilla = usar.casillaDelCodigo(codigo);
  const dominio = usar.dominio();
  const direccionDeEnvio = casilla && dominio ? `${casilla}@${dominio}` : null;
  const emailRespuestas = texto(datos.email_respuestas).toLowerCase() || null;

  // Nunca falla hacia afuera: sin reenvío configurado, o si no se pudo abrir, devuelve null y el
  // alta sigue. Lo único que se pierde son las respuestas, y eso se avisa en el Panel.
  const regla = await usar.abrirReenvio({ direccionDeEnvio, emailRespuestas });

  let resultado;
  try {
    const { data, error } = await usar.llamarALaBase('dar_de_alta_la_prestadora', {
      p_referencia: texto(cuerpo.suscripcion_id),
      p_razon_social: texto(cliente.razon_social),
      p_identificacion_fiscal: texto(cliente.identificacion_fiscal) || null,
      p_pais: texto(cliente.pais).toUpperCase(),
      p_nombre_fantasia: texto(datos.nombre_fantasia),
      p_codigo: codigo,
      p_casilla_envio: casilla,
      p_email_respuestas: emailRespuestas,
      p_regla_reenvio: regla,
      p_admin_nombre: texto(administrador.nombre),
      p_admin_email: texto(administrador.email).toLowerCase(),
      p_admin_telefono: texto(administrador.telefono) || null,
    });
    if (error) {
      if (MOTIVOS_DE_LA_BASE.includes(error.message)) throw new ErrorConMotivo(error.message);
      throw new Error(error.message);
    }
    if (!data?.prestadora_id) throw new Error('darDeAltaLaPrestadora: la base no devolvió la Prestadora');
    resultado = data;
  } catch (error) {
    // La base no guardó nada: la regla recién abierta no tiene dueño y se corta.
    await usar.cortarReenvio(regla);
    throw error;
  }

  // La referencia ya tenía su Prestadora, con su propio reenvío. El que se abrió recién sobra.
  if (resultado.creada !== true) await usar.cortarReenvio(regla);

  return { tenantRef: resultado.prestadora_id, creada: resultado.creada === true };
}
