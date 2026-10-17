import { Router } from 'express';
import {
  pedirRecuperacionPorNombreDeUsuario,
  cambiarClaveConToken,
  segundoFactorDelEnlace,
} from '../utils/recuperacionDeClave.js';
import { ErrorConMotivo, responderError } from '../utils/errorConMotivo.js';
import { claveAceptable } from '../config/reglaDeClave.js';
import { resolverPrestadoraPublica } from '../middleware/resolverPrestadoraPublica.js';

export const recuperarClaveRouter = Router();

// Sin auth a propósito: quien llega acá perdió justamente la forma de tener sesión.
//
// LA COORDINACIÓN PIDE CON SU NOMBRE DE USUARIO, que dice de qué Prestadora es la cuenta
// (`utils/nombreDeUsuario.js`). El enlace llega al correo declarado de esa cuenta. No se mira la
// dirección de la página: no todas las Prestadoras tienen una.
//
// PEDIR CONTESTA SIEMPRE LO MISMO, exista el nombre o no. Si la respuesta cambiara, esta puerta
// sería una forma de averiguar quién tiene cuenta preguntando de a un nombre por vez, y sin sesión
// la puede abrir cualquiera.
//
// El tope de pedidos por hora vive en `utils/topeDePedidosDeClave.js`, y pedir de nuevo no abre una
// puerta más: el enlace anterior se da por usado al emitir el siguiente.
recuperarClaveRouter.post('/pedir-del-panel', async (req, res) => {
  const { usuario } = req.body ?? {};

  try {
    if (!usuario || typeof usuario !== 'string') throw new ErrorConMotivo('faltan_datos');
    await pedirRecuperacionPorNombreDeUsuario(usuario);
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof ErrorConMotivo) return responderError(res, err);
    console.error('Error al pedir recuperación de clave:', err.message);
    res.status(500).json({ error: 'error_interno' });
  }
});

// El segundo paso: el código al teléfono, si esa cuenta lo tiene verificado y su Prestadora tiene
// por dónde mandarlo.
//
// EL ENLACE VIAJA EN EL CUERPO Y NO EN LA DIRECCIÓN, igual que el código: una dirección queda
// escrita en el registro del servidor y en el historial del navegador.
//
// A NADIE SE LE SACA NADA: la cuenta sin teléfono verificado contesta `requiereCodigo: false` y
// sigue recuperando por correo como siempre.
recuperarClaveRouter.post('/:prestadora/segundo-factor', resolverPrestadoraPublica, async (req, res) => {
  const { token } = req.body ?? {};

  try {
    if (!token) throw new ErrorConMotivo('faltan_datos');
    res.json(await segundoFactorDelEnlace(token, req.prestadoraPublica.prestadora_id));
  } catch (err) {
    if (err instanceof ErrorConMotivo) return responderError(res, err);
    console.error('Error al pedir el código de la clave nueva:', err.message);
    res.status(500).json({ error: 'error_interno' });
  }
});

// Canjear el enlace por la clave nueva. Los tres motivos que pueden salir son los mismos de la
// activación, y la pantalla los traduce igual.
//
// Las dos puertas del enlace llevan el código de la Prestadora, que viaja adentro del enlace del
// correo: el enlace se busca sólo adentro de ella.
recuperarClaveRouter.post('/:prestadora/canjear', resolverPrestadoraPublica, async (req, res) => {
  const { token, password, codigo } = req.body;

  try {
    if (!token || !password) throw new ErrorConMotivo('faltan_datos');
    if (!claveAceptable(password)) throw new ErrorConMotivo('password_debil');

    await cambiarClaveConToken(token, password, codigo ?? null, req.prestadoraPublica.prestadora_id);
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof ErrorConMotivo) return responderError(res, err);
    console.error('Error al canjear el enlace de clave nueva:', err.message);
    res.status(500).json({ error: 'error_interno' });
  }
});
