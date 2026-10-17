/**
 * Las llaves del propio teléfono: darlas de alta, verlas, darlas de baja y firmar con ellas.
 * ==========================================================================================
 *
 * Lo que decide está en `../utils/llaveDelDispositivo.js`, con sus pruebas. Acá está lo que
 * ejecuta: pedirle a la base y hablar con la librería que verifica firmas.
 *
 * TODO PIDE SESIÓN. `routerDeLlavesConSesion(rol)` se monta adentro de cada aplicación, detrás del
 * middleware de su rol, y corre con la credencial de la persona.
 *
 * INGRESAR CON BIOMETRÍA NO PASA POR ACÁ. El teléfono guarda la sesión cerrada con un secreto que
 * sólo su llave sabe sacar, y al abrirla se la renueva directamente con el servicio de acceso
 * (`pwa-asistentes/src/lib/accesoGuardado.js`). El backend no emite ninguna sesión y no necesita la
 * llave maestra para nada de esto.
 */
import { Router } from 'express';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';

import { clienteDelPedido } from '../db/connection.js';
import { ErrorConMotivo, responderError } from '../utils/errorConMotivo.js';
import { IDENTIDAD } from '../config/identidadProducto.js';
import { topeDePedidos } from '../middleware/topeDePedidos.js';
import {
  MINUTOS_DE_VIDA_DEL_DESAFIO,
  comoSeVeLaLlave,
  desafioVencido,
  dondeViveLaApp,
  elContadorRetrocedio,
  porQueNoAbre,
  rolesConLlaveDeDispositivo,
} from '../utils/llaveDelDispositivo.js';

/** El mensaje único cuando un desafío no sirve. Nunca dice por qué. */
const NO_SE_PUDO_ENTRAR = 'llave_no_sirve';

function rolValido(rol) {
  return rolesConLlaveDeDispositivo().includes(rol);
}

/** Guarda un desafío nuevo y lo devuelve. Vence solo, y se gasta al usarse. */
async function guardarDesafio(db, desafio, { para, rol, usuarioId = null, prestadoraId = null }) {
  const venceEn = new Date(Date.now() + MINUTOS_DE_VIDA_DEL_DESAFIO * 60 * 1000).toISOString();
  const { error } = await db.from('desafios_de_llave').insert({
    desafio,
    para,
    rol,
    usuario_id: usuarioId,
    prestadora_id: prestadoraId,
    vence_en: venceEn,
  });
  if (error) throw new Error(error.message);
}

/**
 * Busca el desafío, comprueba que sirva y lo marca usado en el mismo movimiento.
 *
 * El `usado_en IS NULL` va adentro del `update` y no antes: así dos pedidos que llegan juntos con
 * la misma firma no pasan los dos. El que llega segundo no encuentra nada que actualizar.
 *
 * La Prestadora es la de la sesión, y se nombra en la lectura y en la escritura: un desafío emitido para otra no se encuentra.
 */
async function gastarDesafio(db, desafio, { para, rol, prestadoraId }) {
  if (!prestadoraId) throw new ErrorConMotivo(NO_SE_PUDO_ENTRAR);

  const { data: fila } = await db
    .from('desafios_de_llave')
    .select('id, para, rol, usuario_id, prestadora_id, vence_en, usado_en')
    .eq('desafio', desafio)
    .eq('prestadora_id', prestadoraId)
    .maybeSingle();

  if (!fila) throw new ErrorConMotivo(NO_SE_PUDO_ENTRAR);
  if (fila.para !== para || fila.rol !== rol) throw new ErrorConMotivo(NO_SE_PUDO_ENTRAR);
  if (fila.usado_en) throw new ErrorConMotivo(NO_SE_PUDO_ENTRAR);
  if (desafioVencido(fila.vence_en)) throw new ErrorConMotivo(NO_SE_PUDO_ENTRAR);

  const { data: gastado } = await db
    .from('desafios_de_llave')
    .update({ usado_en: new Date().toISOString() })
    .eq('id', fila.id)
    .eq('prestadora_id', prestadoraId)
    .is('usado_en', null)
    .select('id')
    .maybeSingle();
  if (!gastado) throw new ErrorConMotivo(NO_SE_PUDO_ENTRAR);

  return fila;
}

/** El desafío viaja adentro de lo que el navegador firmó, en base64url. */
function leerDesafio(respuesta) {
  const datos = respuesta?.response?.clientDataJSON;
  if (!datos) throw new ErrorConMotivo(NO_SE_PUDO_ENTRAR);
  try {
    const { challenge } = JSON.parse(isoBase64URL.toUTF8String(datos));
    if (!challenge) throw new Error('sin desafio');
    return challenge;
  } catch {
    throw new ErrorConMotivo(NO_SE_PUDO_ENTRAR);
  }
}

/**
 * Paso 2 de una firma: ¿la firmó con su llave quien tiene la sesión? Lo usa la ruta que guarda lo
 * firmado, antes de guardar nada. Falla con `firma_no_sirve` y nunca dice por qué.
 *
 * Corre con la credencial de la persona (`db`): la llave, el desafío y el contador son suyos.
 */
export async function comprobarFirma({ db, rol, persona, respuesta }) {
  if (!rolValido(rol) || !respuesta?.id || !persona?.id || !persona?.prestadoraId) {
    throw new ErrorConMotivo('firma_no_sirve');
  }
  const { origen, parteConfiable } = dondeViveLaApp(rol);

  const { data: llave } = await db
    .from('llaves_de_dispositivo')
    .select('id, usuario_id, prestadora_id, rol, credencial_id, clave_publica, contador, transportes, revocada_en')
    .eq('credencial_id', respuesta.id)
    .eq('rol', rol)
    .eq('usuario_id', persona.id)
    .eq('prestadora_id', persona.prestadoraId)
    .maybeSingle();
  const motivo = porQueNoAbre(llave);
  if (motivo) {
    console.warn(`Firma con llave rechazada (${motivo})`);
    throw new ErrorConMotivo('firma_no_sirve');
  }

  let desafio;
  try {
    desafio = leerDesafio(respuesta);
    const fila = await gastarDesafio(db, desafio, { para: 'firma', rol, prestadoraId: persona.prestadoraId });
    if (fila.usuario_id !== persona.id) throw new ErrorConMotivo('firma_no_sirve');
  } catch {
    throw new ErrorConMotivo('firma_no_sirve');
  }

  let verificacion;
  try {
    verificacion = await verifyAuthenticationResponse({
      response: respuesta,
      expectedChallenge: desafio,
      expectedOrigin: origen,
      expectedRPID: parteConfiable,
      requireUserVerification: true,
      credential: {
        id: llave.credencial_id,
        publicKey: isoBase64URL.toBuffer(llave.clave_publica),
        counter: Number(llave.contador),
        transports: llave.transportes ?? undefined,
      },
    });
  } catch {
    throw new ErrorConMotivo('firma_no_sirve');
  }
  if (!verificacion.verified) throw new ErrorConMotivo('firma_no_sirve');

  const contadorNuevo = verificacion.authenticationInfo?.newCounter ?? 0;
  if (elContadorRetrocedio(Number(llave.contador), contadorNuevo)) {
    // Dos aparatos con la misma llave. La baja la hace la persona, que es la única que puede marcar
    // su propia llave.
    console.warn('Firma con llave rechazada (contador hacia atras): llave revocada');
    await db
      .from('llaves_de_dispositivo')
      .update({ revocada_en: new Date().toISOString() })
      .eq('id', llave.id)
      .eq('prestadora_id', persona.prestadoraId);
    throw new ErrorConMotivo('firma_no_sirve');
  }

  await db
    .from('llaves_de_dispositivo')
    .update({ contador: contadorNuevo, ultimo_uso_en: new Date().toISOString() })
    .eq('id', llave.id)
    .eq('prestadora_id', persona.prestadoraId);
}

// ────────────────────────────────────────────────────────────────────────────────────────────
// ADENTRO DE CADA APLICACIÓN: agregar, ver y sacar llaves propias
// ────────────────────────────────────────────────────────────────────────────────────────────

/**
 * El mismo juego de rutas para las dos aplicaciones, montado dos veces con el rol de cada una.
 *
 * Se escribe una sola vez porque es la misma decisión en los dos lados
 * (`celtatech/CLAUDE.md` §8, «ningún patrón repetido sin punto único de verdad»). Lo único que
 * cambia es de qué propiedad sale la persona, porque cada middleware de rol deja la suya.
 *
 * CON QUÉ CREDENCIAL. Todo corre con la de la persona (`clienteDelPedido(req)`): la base le deja
 * ver su propia fila de `usuarios`, ver y agregar sus propias llaves y darlas de baja, y pedir y gastar sus
 * propios desafíos de alta, siempre adentro de la Prestadora de su sesión. Los filtros por la
 * persona y por la Prestadora quedan escritos igual, porque dicen qué se busca.
 */
export function routerDeLlavesConSesion(rol) {
  if (!rolValido(rol)) throw new Error(`El rol «${rol}» no tiene llave de dispositivo`);
  const router = Router();

  const quienEs = (req) => (rol === 'asistente' ? req.usuarioAsistente : req.usuarioCliente);

  /** Las llaves propias que siguen vivas. Sin la credencial ni la clave, que no hacen falta. */
  router.get('/', async (req, res) => {
    try {
      const persona = quienEs(req);
      const { data, error } = await clienteDelPedido(req)
        .from('llaves_de_dispositivo')
        .select('id, creada_en, ultimo_uso_en')
        .eq('usuario_id', persona.id)
        .eq('prestadora_id', persona.prestadoraId)
        .is('revocada_en', null)
        .order('creada_en', { ascending: false });
      if (error) throw new Error(error.message);
      res.json({ llaves: (data ?? []).map(comoSeVeLaLlave) });
    } catch (err) {
      console.error('Error al listar llaves de dispositivo:', err.message);
      res.status(500).json({ error: 'error_interno' });
    }
  });

  /** Paso 1 del alta: el número que el teléfono va a firmar con la llave nueva. */
  router.post('/desafio', topeDePedidos({ nombre: 'alta_llave_dispositivo' }), async (req, res) => {
    try {
      const persona = quienEs(req);
      const { parteConfiable } = dondeViveLaApp(rol);
      const db = clienteDelPedido(req);

      // La fila propia, con la credencial de la persona: la base le devuelve la suya y ninguna
      // otra. El correo sale de la misma fila, que es de donde lo lee `correoDe`.
      const { data: perfil } = await db
        .from('usuarios')
        .select('nombre, email')
        .eq('id', persona.id)
        .maybeSingle();
      const correo = perfil?.email || null;
      if (!correo) throw new ErrorConMotivo('faltan_datos');

      const { data: yaTiene } = await db
        .from('llaves_de_dispositivo')
        .select('credencial_id, transportes')
        .eq('prestadora_id', persona.prestadoraId)
        .eq('usuario_id', persona.id)
        .is('revocada_en', null);

      const opciones = await generateRegistrationOptions({
        rpName: IDENTIDAD.nombre,
        rpID: parteConfiable,
        userID: new TextEncoder().encode(persona.id),
        userName: correo,
        userDisplayName: perfil?.nombre || correo,
        attestationType: 'none',
        // Que el mismo teléfono no quede con dos llaves para la misma persona: no sumaría nada y
        // la pantalla mostraría dos renglones que nadie sabe distinguir.
        excludeCredentials: (yaTiene ?? []).map((l) => ({
          id: l.credencial_id,
          transports: l.transportes ?? undefined,
        })),
        authenticatorSelection: {
          // Detectable, para que el teléfono la ofrezca sola. Y con verificación del dueño, que es
          // lo que hace que la llave se abra con huella o con el rostro y no con sólo tener el
          // aparato en la mano.
          residentKey: 'required',
          userVerification: 'required',
        },
      });

      await guardarDesafio(db, opciones.challenge, {
        para: 'alta',
        rol,
        usuarioId: persona.id,
        prestadoraId: persona.prestadoraId,
      });
      res.json(opciones);
    } catch (err) {
      if (err instanceof ErrorConMotivo) return responderError(res, err);
      console.error('Error al preparar el alta de una llave:', err.message);
      res.status(500).json({ error: 'error_interno' });
    }
  });

  /** Paso 2 del alta: llega la llave nueva y se guarda su mitad pública. */
  router.post('/', topeDePedidos({ nombre: 'alta_llave_dispositivo' }), async (req, res) => {
    try {
      const persona = quienEs(req);
      const { respuesta } = req.body ?? {};
      if (!respuesta?.id) throw new ErrorConMotivo('faltan_datos');

      const { origen, parteConfiable } = dondeViveLaApp(rol);
      const desafio = leerDesafio(respuesta);
      const db = clienteDelPedido(req);
      const fila = await gastarDesafio(db, desafio, {
        para: 'alta',
        rol,
        prestadoraId: persona.prestadoraId,
      });
      // El desafío es de quien lo pidió, y de nadie más: sin esto, alguien podría hacerse dar uno
      // y presentarlo desde otra sesión.
      if (fila.usuario_id !== persona.id) throw new ErrorConMotivo('llave_no_sirve');

      const verificacion = await verifyRegistrationResponse({
        response: respuesta,
        expectedChallenge: desafio,
        expectedOrigin: origen,
        expectedRPID: parteConfiable,
        requireUserVerification: true,
      });
      const credencial = verificacion?.registrationInfo?.credential;
      if (!verificacion.verified || !credencial) throw new ErrorConMotivo('llave_no_sirve');

      // Vuelve la fila que quedó guardada, y no la que se mandó: la pantalla la agrega a su lista
      // sin volver a pedirla entera, y lo que muestra es lo que la base escribió de verdad. Pasa
      // por el mismo filtro que la lista, así que de acá tampoco sale la credencial ni la llave.
      const { data, error } = await db
        .from('llaves_de_dispositivo')
        .insert({
          prestadora_id: persona.prestadoraId,
          usuario_id: persona.id,
          rol,
          credencial_id: credencial.id,
          clave_publica: isoBase64URL.fromBuffer(credencial.publicKey),
          contador: credencial.counter ?? 0,
          transportes: credencial.transports ?? null,
        })
        .select('id, creada_en, ultimo_uso_en')
        .single();
      if (error) throw new Error(error.message);

      res.status(201).json({ llave: comoSeVeLaLlave(data) });
    } catch (err) {
      if (err instanceof ErrorConMotivo) return responderError(res, err);
      console.error('Error al guardar una llave de dispositivo:', err.message);
      res.status(500).json({ error: 'error_interno' });
    }
  });

  /**
   * Paso 1 de una firma: el número que el teléfono va a firmar con una llave ya guardada.
   *
   * La lista de llaves va llena: el teléfono sólo ofrece las de esta persona. Sin ninguna, la pantalla ofrece guardar una.
   */
  router.post('/firma/desafio', topeDePedidos({ nombre: 'firma_llave_dispositivo' }), async (req, res) => {
    try {
      const persona = quienEs(req);
      const { parteConfiable } = dondeViveLaApp(rol);
      const db = clienteDelPedido(req);

      const { data: llaves, error } = await db
        .from('llaves_de_dispositivo')
        .select('credencial_id, transportes')
        .eq('prestadora_id', persona.prestadoraId)
        .eq('usuario_id', persona.id)
        .is('revocada_en', null);
      if (error) throw new Error(error.message);
      if (!llaves?.length) throw new ErrorConMotivo('sin_llave');

      const opciones = await generateAuthenticationOptions({
        rpID: parteConfiable,
        userVerification: 'required',
        allowCredentials: llaves.map((l) => ({ id: l.credencial_id, transports: l.transportes ?? undefined })),
      });

      await guardarDesafio(db, opciones.challenge, {
        para: 'firma',
        rol,
        usuarioId: persona.id,
        prestadoraId: persona.prestadoraId,
      });
      res.json(opciones);
    } catch (err) {
      if (err instanceof ErrorConMotivo) return responderError(res, err);
      console.error('Error al preparar una firma con llave:', err.message);
      res.status(500).json({ error: 'error_interno' });
    }
  });

  /**
   * El teléfono avisa que acaba de ingresar con biometría usando esta llave. Anota el uso y, de
   * paso, contesta si la llave sigue viva: si fue revocada, el teléfono olvida el acceso guardado
   * y cierra la sesión que acaba de abrir.
   */
  router.post('/:id/usada', topeDePedidos({ nombre: 'uso_llave_dispositivo' }), async (req, res) => {
    try {
      const persona = quienEs(req);
      const { data, error } = await clienteDelPedido(req)
        .from('llaves_de_dispositivo')
        .update({ ultimo_uso_en: new Date().toISOString() })
        .eq('id', req.params.id)
        .eq('usuario_id', persona.id)
        .eq('prestadora_id', persona.prestadoraId)
        .is('revocada_en', null)
        .select('id')
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new ErrorConMotivo('no_encontrado');
      res.json({ ok: true });
    } catch (err) {
      if (err instanceof ErrorConMotivo) return responderError(res, err);
      console.error('Error al anotar el uso de una llave de dispositivo:', err.message);
      res.status(500).json({ error: 'error_interno' });
    }
  });

  /**
   * La baja. No borra: marca. Y filtra por la persona de la sesión, así que el identificador de
   * una llave ajena no alcanza para sacarla.
   */
  router.delete('/:id', topeDePedidos({ nombre: 'baja_llave_dispositivo' }), async (req, res) => {
    try {
      const persona = quienEs(req);
      const { data, error } = await clienteDelPedido(req)
        .from('llaves_de_dispositivo')
        .update({ revocada_en: new Date().toISOString() })
        .eq('id', req.params.id)
        .eq('usuario_id', persona.id)
        .eq('prestadora_id', persona.prestadoraId)
        .is('revocada_en', null)
        .select('id')
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new ErrorConMotivo('no_encontrado');
      res.json({ ok: true });
    } catch (err) {
      if (err instanceof ErrorConMotivo) return responderError(res, err);
      console.error('Error al dar de baja una llave de dispositivo:', err.message);
      res.status(500).json({ error: 'error_interno' });
    }
  });

  return router;
}
