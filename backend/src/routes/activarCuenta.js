import { Router } from 'express';
import { activarCuentaConToken, cuentaQueActivoConEsteToken, pedirEnlaceNuevo } from '../utils/activacionCuenta.js';
import { ErrorConMotivo, responderError } from '../utils/errorConMotivo.js';
import { claveAceptable } from '../config/reglaDeClave.js';
import { usuarioComparable } from '../config/reglaDeUsuario.js';
import { telefonoAceptable } from '../utils/codigoAlTelefono.js';
import { resolverPrestadoraPublica } from '../middleware/resolverPrestadoraPublica.js';
import {
  ofrecerElCodigoAlActivar,
  verificarElTelefonoAlActivar,
} from '../utils/telefonoAlActivar.js';

export const activarCuentaRouter = Router();

// Sin auth a propósito: quien llega acá todavía no tiene sesión (pendiente #75, docs/PLAN_HASTA_PRODUCCION.md).
//
// Todo lo que puede salir mal acá viaja como **motivo**: un código que la pantalla traduce a
// una frase en el idioma de quien mira (CLAUDE.md §7, reglas 1 y 2). Antes salía solo el
// código en `error`, y las dos pantallas lo comparaban a mano, cada una con su copia de la
// misma lista de códigos — la duplicación que prohíbe la regla 12.
//
// La falla interna es el único caso sin motivo, y es a propósito: su texto está escrito para
// quien programa, y la pantalla ya tiene una frase propia para "se rompió algo de este lado".
// Un motivo ahí sería una segunda frase diciendo exactamente lo mismo.
//
// EL NOMBRE DE USUARIO SE ELIGE ACÁ, junto con la contraseña. Asistentes y Clientes lo mandan
// siempre; la coordinación ya tiene el suyo y no lo manda.
//
// EL TELÉFONO ES OPCIONAL. Sin él, esta puerta contesta sólo que la cuenta quedó activa. Con él, el
// número queda cargado sin verificar y sale el código — y que el código no salga tampoco impide
// entrar: verificar es una oferta, nunca un requisito (`utils/telefonoAlActivar.js`).
//
// LA PRESTADORA VIAJA EN LA DIRECCIÓN, y el código se busca sólo adentro de ella. El enlace del
// correo la trae (`utils/direccionDeLaPrestadora.js`, `enlaceConCodigo`), y el código de otra
// Prestadora no existe desde acá.
activarCuentaRouter.post('/:prestadora', resolverPrestadoraPublica, async (req, res) => {
  const { token, password, telefono, usuario } = req.body ?? {};

  try {
    if (!token || !password) throw new ErrorConMotivo('faltan_datos');
    if (!claveAceptable(password)) throw new ErrorConMotivo('password_debil');

    // El número se revisa **antes** de activar. Después la cuenta ya quedó activa, y contestar
    // entonces que el dato vino mal haría creer que no se activó nada.
    const escrito = String(telefono ?? '').trim();
    if (escrito && !telefonoAceptable(escrito)) throw new ErrorConMotivo('telefono_invalido');

    // El nombre de usuario lo elige la persona acá mismo, y la regla la hace cumplir la base al
    // activar (`activar_la_cuenta`), que es la única que sabe si ya lo tiene otra cuenta.
    const { usuarioId } = await activarCuentaConToken(
      token,
      password,
      req.prestadoraPublica.prestadora_id,
      usuarioComparable(usuario) || null,
    );
    const codigo = await ofrecerElCodigoAlActivar({
      prestadoraId: req.prestadoraPublica.prestadora_id,
      usuarioId,
      telefono: escrito,
    });

    res.json({ ok: true, ...codigo });
  } catch (err) {
    if (err instanceof ErrorConMotivo) return responderError(res, err);
    console.error('Error al activar cuenta:', err.message);
    res.status(500).json({ error: 'error_interno' });
  }
});

// Un enlace nuevo, pedido por la misma persona desde la página de activación cuando el suyo venció.
//
// CONTESTA SIEMPRE LO MISMO, exista el enlace o no, se haya usado o no, y aunque algo falle por
// dentro: si la respuesta cambiara, esta puerta serviría para averiguar qué enlaces existen. Qué
// se manda y a quién lo decide `pedirEnlaceNuevo`.
//
// EL ENLACE VIAJA EN EL CUERPO Y NO EN LA DIRECCIÓN: una dirección queda escrita en el registro del
// servidor y en el historial del navegador.
activarCuentaRouter.post('/:prestadora/enlace-nuevo', resolverPrestadoraPublica, async (req, res) => {
  const { token } = req.body ?? {};
  try {
    await pedirEnlaceNuevo(token, req.prestadoraPublica.prestadora_id);
  } catch (err) {
    console.error('Error al pedir un enlace de activación nuevo:', err?.message ?? err);
  }
  res.json({ ok: true });
});

// El código del teléfono, escrito en la misma pantalla y todavía sin sesión.
//
// LAS DOS CONDICIONES VAN JUNTAS: el enlace dice de quién es la cuenta, y la contraseña que esa
// persona acaba de elegir prueba que es ella. Sin la segunda, quien se quedara con el correo
// podría colgarle a la cuenta un número suyo, y con un número verificado se recupera la clave.
//
// NI EL NÚMERO NI EL CÓDIGO VIAJAN POR LA DIRECCIÓN WEB: todo va en el cuerpo del pedido.
activarCuentaRouter.post('/:prestadora/telefono/confirmar', resolverPrestadoraPublica, async (req, res) => {
  const { token, password, codigo } = req.body ?? {};

  try {
    if (!token || !password || !codigo) throw new ErrorConMotivo('faltan_datos');

    const usuarioId = await cuentaQueActivoConEsteToken(token, req.prestadoraPublica.prestadora_id);
    await verificarElTelefonoAlActivar({
      prestadoraId: req.prestadoraPublica.prestadora_id,
      usuarioId,
      clave: password,
      codigo,
    });

    res.json({ ok: true });
  } catch (err) {
    if (err instanceof ErrorConMotivo) return responderError(res, err);
    console.error('Error al verificar el teléfono al activar:', err.message);
    res.status(500).json({ error: 'error_interno' });
  }
});
