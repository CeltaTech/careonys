import { Router } from 'express';
import { topeDePedidos } from '../middleware/topeDePedidos.js';
import { clienteDelPedido, enLaPrestadora } from '../db/connection.js';
import { ErrorConMotivo, responderError } from '../utils/errorConMotivo.js';
import { exigirLaClaveActual } from '../utils/claveActual.js';
import { exigirQueElCelularSeaDeUnaSolaPersona } from '../utils/celularDeUnaSolaPersona.js';
import {
  mandarCodigoAlTelefono,
  comprobarCodigoDelTelefono,
  hayViaDeTelefono,
  telefonoAceptable,
  normalizarTelefono,
  USO_VERIFICAR,
  USO_EQUIPO_NUEVO,
} from '../utils/codigoAlTelefono.js';
import {
  equipoConocido,
  anotarEquipo,
  equiposDe,
  cerrarSesionEnTodosLosEquipos,
} from '../utils/equiposConocidos.js';
import {
  avisarDeSeguridad,
  MENSAJE_TELEFONO_CAMBIADO,
  MENSAJE_EQUIPO_NUEVO,
} from '../utils/avisoDeSeguridad.js';
import {
  registrarActividad,
  yaQuedoRegistrado,
  ACCION_VERIFICACION_DE_TELEFONO,
} from '../utils/registroDeActividad.js';

// LA SEGURIDAD DE LA PROPIA CUENTA: el teléfono, los equipos y la salida de golpe.
//
// ES UNA SOLA PARA TODOS. La usan el Panel, la aplicación de los Asistentes y la de los Clientes.
// Cada uno la monta con su propia comprobación de sesión, y lo que pasa adentro es lo mismo: un
// número se verifica igual, un equipo nuevo se reconoce igual y las sesiones se cierran igual,
// sea quien sea.
//
// ESTO NO APARECE EN LA CONFIGURACIÓN DE LA PRESTADORA, y no es un olvido. Cómo se entra y cómo se
// recupera la contraseña es igual para todas y para todos los roles: acá no hay ninguna puerta
// para encenderlo ni apagarlo, y no se agrega.
//
// A NADIE SE LE SACA NADA. Los números ya cargados están sin verificar, y así se quedan hasta que
// su dueño los verifique. Mientras tanto esa persona entra y recupera la contraseña por correo
// como siempre, y las vías del teléfono no se le ofrecen.
//
// NI EL NÚMERO NI EL CÓDIGO VIAJAN POR LA DIRECCIÓN WEB. Todo va en el cuerpo del pedido, incluso
// lo que sería más cómodo poner en la dirección: una dirección queda escrita en el registro del
// servidor, en el historial del navegador y en cualquier intermediario del camino
// (`docs/REGLAS_PRODUCTOS_CAREONYS.md` §4). Por eso `GET` no recibe nada.

const ACCION_CAMBIO_DE_TELEFONO = 'cambio_de_telefono';
const ACCION_EQUIPO_NUEVO = 'entrada_desde_un_equipo_nuevo';
const ACCION_CERRAR_TODO = 'cierre_de_sesion_de_todos_los_equipos';

// La propia cuenta se lee con la credencial de quien pide (`clienteDelPedido(req)`): la base le
// deja ver a cada persona su propia fila y ninguna otra, así que no hace falta nombrar la
// Organización. La Prestadora que se usa después es la de esa fila, la propia de la cuenta, nunca
// la de un permiso de acceso abierto: acá se mira de quién es la cuenta, no dónde está parada.
export async function miCuenta(db, quien) {
  if (!quien?.id) return null;
  const { data } = await db.from('usuarios')
    .select('id, rol, nombre, email, telefono, telefono_verificado_en, prestadora_id')
    .eq('id', quien.id)
    .maybeSingle();
  return data ?? null;
}

// Las dos escrituras sobre la propia cuenta —marcar el número verificado y cambiarlo— van con la
// credencial del trabajo de la Prestadora de la cuenta, que la base acota a esa Prestadora: la base
// no le da a nadie con sesión permiso de modificar su fila de `usuarios`.
//
// Toda escritura sobre la propia cuenta dice además para qué Organización trabaja, y no se apoya
// sólo en el identificador que ya se leyó: así el renglón nombra la Prestadora, y una cuenta que
// entretanto cambió de Organización no se toca con el dato viejo.
//
// Una cuenta sin Prestadora no escribe nada: `enLaPrestadora` falla sin Prestadora.
export function escribirMiCuenta(cuenta, cambios) {
  return enLaPrestadora(cuenta.prestadora_id, 'seguridad de la propia cuenta', (db) =>
    db.from('usuarios')
      .update(cambios)
      .eq('id', cuenta.id)
      .eq('prestadora_id', cuenta.prestadora_id));
}

/**
 * Arma las rutas de la seguridad de la propia cuenta.
 *
 * - `requiereSesion`: la comprobación de sesión de quien monta las rutas (la del Panel, la de los
 *   Asistentes o la de los Clientes). Va primero en cada ruta.
 * - `quienPide(req)`: la persona que dejó en el pedido esa comprobación. Si no hay nadie, se
 *   contesta que no se encontró la cuenta: falla cerrado.
 * - `soloElDuenoDelTelefono`: comprobaciones extra para verificar y cambiar el número. El Panel
 *   pone acá la que cierra esas puertas a la cuenta del Administrador; las aplicaciones no ponen
 *   nada.
 */
export function rutasDeLaCuentaSegura({ requiereSesion, quienPide, soloElDuenoDelTelefono = [] }) {
  if (typeof requiereSesion !== 'function' || typeof quienPide !== 'function') {
    throw new Error('rutasDeLaCuentaSegura: faltan la comprobación de sesión o quién pide');
  }

  const router = Router();
  const tope = topeDePedidos({ nombre: 'codigo_al_telefono' });

  async function cuentaDelPedido(req, db = clienteDelPedido(req)) {
    const cuenta = await miCuenta(db, quienPide(req));
    if (!cuenta) throw new ErrorConMotivo('no_encontrado');
    return cuenta;
  }

  // Cómo está la cuenta. No devuelve el número: la pantalla no lo necesita para nada de lo que
  // ofrece, y un número que no viaja es un número que no se filtra.
  router.get('/', requiereSesion, async (req, res) => {
    try {
      const db = clienteDelPedido(req);
      const cuenta = await cuentaDelPedido(req, db);

      res.json({
        telefonoCargado: Boolean(cuenta.telefono),
        telefonoVerificado: Boolean(cuenta.telefono_verificado_en),
        viaDeTelefono: await hayViaDeTelefono(cuenta.prestadora_id),
        equipos: (await equiposDe(cuenta.id, cuenta.prestadora_id, db)).map((equipo) => ({
          id: equipo.id,
          desde: equipo.primera_entrada_en,
          ultima: equipo.ultima_entrada_en,
        })),
      });
    } catch (err) {
      responderError(res, err);
    }
  });

  // Pedir el código para verificar el número que la cuenta ya tiene cargado.
  //
  // EL CÓDIGO SALE POR LA MISMA VÍA QUE SE ESTÁ VERIFICANDO. Mandarlo a otro lado probaría que esa
  // persona lee el otro lado, no que este número es suyo.
  router.post('/telefono/codigo', requiereSesion, ...soloElDuenoDelTelefono, tope, async (req, res) => {
    try {
      const cuenta = await cuentaDelPedido(req);
      if (!cuenta.telefono) throw new ErrorConMotivo('telefono_invalido');

      const { vence } = await mandarCodigoAlTelefono({ usuario: cuenta, uso: USO_VERIFICAR });
      res.json({ ok: true, vence });
    } catch (err) {
      responderError(res, err);
    }
  });

  // Escribir el código. Acá el número pasa de ser un dato tecleado a ser una llave.
  router.post('/telefono/confirmar', requiereSesion, ...soloElDuenoDelTelefono, tope, async (req, res) => {
    try {
      const { codigo } = req.body ?? {};
      if (!codigo) throw new ErrorConMotivo('faltan_datos');

      const cuenta = await cuentaDelPedido(req);

      const usado = await comprobarCodigoDelTelefono({
        prestadoraId: cuenta.prestadora_id,
        usuarioId: cuenta.id,
        uso: USO_VERIFICAR,
        codigo,
      });

      // Se marca verificado sólo si el número sigue siendo el mismo al que se le mandó el código.
      // Entre el pedido y la respuesta el número pudo haber cambiado, y marcar entonces daría por
      // verificado un número que nadie comprobó.
      if (normalizarTelefono(usado.telefono) !== normalizarTelefono(cuenta.telefono)) {
        throw new ErrorConMotivo('codigo_incorrecto');
      }

      const { error } = await escribirMiCuenta(cuenta, { telefono_verificado_en: new Date().toISOString() });
      if (error) throw new Error(error.message);

      await registrarActividad(quienPide(req), ACCION_VERIFICACION_DE_TELEFONO, {
        tablaAfectada: 'usuarios',
        registroId: cuenta.id,
        detalle: { via: 'whatsapp' },
      });
      yaQuedoRegistrado(res);

      res.json({ ok: true });
    } catch (err) {
      responderError(res, err);
    }
  });

  // Cambiar el número.
  //
  // LAS TRES COSAS VAN JUNTAS Y NINGUNA SIRVE SOLA: hace falta la contraseña actual, el número
  // nuevo nace sin verificar, y el código se manda al número nuevo, que es el que se está
  // verificando. Sin la primera, quien se sienta en una máquina abierta se queda con la cuenta; sin
  // la segunda, el número nuevo heredaría la confianza del viejo; sin la tercera, verificar no
  // probaría nada.
  router.post('/telefono/cambiar', requiereSesion, ...soloElDuenoDelTelefono, tope, async (req, res) => {
    try {
      const { claveActual, telefono } = req.body ?? {};
      if (!claveActual || !telefono) throw new ErrorConMotivo('faltan_datos');
      if (!telefonoAceptable(telefono)) throw new ErrorConMotivo('telefono_invalido');

      const cuenta = await cuentaDelPedido(req);

      await exigirLaClaveActual({ usuarioId: cuenta.id, prestadoraId: cuenta.prestadora_id, clave: claveActual });

      // Un celular es de una sola persona; una línea fija se comparte. La base lo impide con un
      // índice único y esto es la segunda red, para contestar con una frase entendible en vez de un
      // choque de base. Se comprueba antes de escribir y antes de mandar ningún código, y el
      // mensaje no lleva el número adentro.
      await exigirQueElCelularSeaDeUnaSolaPersona({
        telefono,
        prestadoraId: cuenta.prestadora_id,
        usuarioId: cuenta.id,
      });

      const numero = normalizarTelefono(telefono);
      // `telefono_verificado_en` se pone en nulo acá **y** lo pone en nulo un disparador de la base.
      // No es una copia por descuido: la red de abajo es la que sigue estando el día que otro camino
      // toque esta columna sin acordarse.
      const { error } = await escribirMiCuenta(cuenta, { telefono: numero, telefono_verificado_en: null });
      if (error) throw new Error(error.message);

      await registrarActividad(quienPide(req), ACCION_CAMBIO_DE_TELEFONO, {
        tablaAfectada: 'usuarios',
        registroId: cuenta.id,
        camposCambiados: ['telefono'],
      });
      yaQuedoRegistrado(res);

      // El mensaje va al correo y no al teléfono: si el número cambió porque alguien se lo llevó,
      // avisar por el teléfono sería avisarle justamente a esa persona.
      await avisarDeSeguridad(MENSAJE_TELEFONO_CAMBIADO, cuenta);

      // Y el código sale para el número nuevo. Que no salga no deshace el cambio: el número quedó
      // cargado y sin verificar, que es un estado perfectamente válido.
      let vence = null;
      try {
        ({ vence } = await mandarCodigoAlTelefono({
          usuario: { ...cuenta, telefono: numero },
          uso: USO_VERIFICAR,
        }));
      } catch (e) {
        console.warn('cuentaSegura: el número cambió pero el código no salió:', e.message);
      }

      res.json({ ok: true, vence });
    } catch (err) {
      responderError(res, err);
    }
  });

  // ¿Desde este aparato se entró antes?
  //
  // LA MARCA VA EN EL CUERPO Y NO EN LA DIRECCIÓN, y no es una credencial: sola no deja entrar a
  // nadie. Se mira **después** de que la sesión ya está hecha, y lo único que decide es si hace
  // falta pedir el código de verificación.
  router.post('/equipo/reconocer', requiereSesion, async (req, res) => {
    try {
      const { marca } = req.body ?? {};
      const db = clienteDelPedido(req);
      const cuenta = await cuentaDelPedido(req, db);

      if (await equipoConocido({ usuarioId: cuenta.id, prestadoraId: cuenta.prestadora_id, marca, db })) {
        await anotarEquipo({ usuario: cuenta, marca });
        return res.json({ equipoNuevo: false, requiereCodigo: false, marca });
      }

      // Equipo nuevo. Si esta persona tiene el número verificado y su Prestadora tiene por dónde
      // mandar, se le pide el código. Si no, entra igual y se le avisa por correo: a nadie se le
      // saca nada, y ese mensaje es lo que le permite darse cuenta si no fue ella.
      const puedePedirse = Boolean(cuenta.telefono && cuenta.telefono_verificado_en)
        && await hayViaDeTelefono(cuenta.prestadora_id);

      if (!puedePedirse) {
        const marcaNueva = await anotarEquipo({ usuario: cuenta, marca: null });
        await avisarDeSeguridad(MENSAJE_EQUIPO_NUEVO, cuenta);
        await registrarActividad(quienPide(req), ACCION_EQUIPO_NUEVO, {
          tablaAfectada: 'equipos_conocidos',
        });
        yaQuedoRegistrado(res);
        return res.json({ equipoNuevo: true, requiereCodigo: false, marca: marcaNueva });
      }

      const { vence } = await mandarCodigoAlTelefono({ usuario: cuenta, uso: USO_EQUIPO_NUEVO });
      return res.json({ equipoNuevo: true, requiereCodigo: true, vence });
    } catch (err) {
      responderError(res, err);
    }
  });

  // El código del equipo nuevo. Recién acá el aparato queda anotado.
  router.post('/equipo/confirmar', requiereSesion, tope, async (req, res) => {
    try {
      const { codigo } = req.body ?? {};
      if (!codigo) throw new ErrorConMotivo('faltan_datos');

      const cuenta = await cuentaDelPedido(req);

      await comprobarCodigoDelTelefono({
        prestadoraId: cuenta.prestadora_id,
        usuarioId: cuenta.id,
        uso: USO_EQUIPO_NUEVO,
        codigo,
      });

      const marca = await anotarEquipo({ usuario: cuenta, marca: null });
      await avisarDeSeguridad(MENSAJE_EQUIPO_NUEVO, cuenta);
      await registrarActividad(quienPide(req), ACCION_EQUIPO_NUEVO, {
        tablaAfectada: 'equipos_conocidos',
        detalle: { via: 'whatsapp' },
      });
      yaQuedoRegistrado(res);

      res.json({ ok: true, marca });
    } catch (err) {
      responderError(res, err);
    }
  });

  // Cerrar la sesión en todos los equipos.
  //
  // ES LO PRIMERO QUE NECESITA ALGUIEN A QUIEN LE ROBARON EL TELÉFONO. Se hace desde otro equipo y
  // con la contraseña, que son las dos condiciones que quien tiene el aparato robado no cumple.
  router.post('/cerrar-sesiones', requiereSesion, async (req, res) => {
    try {
      const { claveActual } = req.body ?? {};
      if (!claveActual) throw new ErrorConMotivo('faltan_datos');

      const db = clienteDelPedido(req);
      const cuenta = await cuentaDelPedido(req, db);

      await exigirLaClaveActual({ usuarioId: cuenta.id, prestadoraId: cuenta.prestadora_id, clave: claveActual });

      // El renglón se escribe antes de cerrar: después de cerrar, la sesión con la que se está
      // escribiendo ya no vale.
      await registrarActividad(quienPide(req), ACCION_CERRAR_TODO, {
        tablaAfectada: 'equipos_conocidos',
        registroId: cuenta.id,
      });
      yaQuedoRegistrado(res);

      // Con la sesión que vino en el pedido, ya comprobada por `requiereSesion`.
      const token = String(req.headers.authorization || '').replace(/^Bearer /, '');
      await cerrarSesionEnTodosLosEquipos(cuenta.id, cuenta.prestadora_id, token, db);

      res.json({ ok: true });
    } catch (err) {
      responderError(res, err);
    }
  });

  return router;
}
