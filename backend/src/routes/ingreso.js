import crypto from 'node:crypto';
import { Router } from 'express';
import { direccionDeAcceso } from '../config/direccionDeAcceso.js';
import { usuarioComparable } from '../config/reglaDeUsuario.js';
import { cuentaQueNombra } from '../utils/nombreDeUsuario.js';

export const ingresoRouter = Router();

// CON QUÉ DIRECCIÓN SE LE HABLA AL SERVICIO DE ACCESO PARA ENTRAR.
//
// Sin sesión a propósito: es lo que la pantalla de ingreso necesita antes de mandar la clave. Sirve
// igual a la coordinación en el Panel y a los Asistentes y Clientes en sus aplicaciones. La persona
// escribe su nombre de usuario, que es único en todo el sistema (`utils/nombreDeUsuario.js`), y de
// ahí sale la dirección de acceso de esa cuenta (`config/direccionDeAcceso.js`).
//
// CONTESTA SIEMPRE LO MISMO. Exista la cuenta o no, sale una dirección armada de la misma forma: la
// de la cuenta cuando se la encontró, y una que no es de nadie cuando no. La de nadie sale siempre
// igual para el mismo nombre, y no se puede calcular desde afuera, así que desde afuera no se
// distingue una respuesta de la otra y esta puerta no sirve para averiguar quién tiene cuenta.
//
// Y TARDA LO MISMO: se le hace a la base una sola pregunta, exista la cuenta o no
// (`cuentaQueNombra`). Una segunda pregunta sólo cuando la cuenta existe haría que la demora la
// delatara.
//
// Las cuentas que entran con nombre de usuario son las de coordinación, Asistentes y Clientes, y
// esa lista la aplica la base al contestar. La del Administrador y la del equipo técnico entran con
// su email, que la pantalla manda tal cual sin pasar por acá.
const TRABAJO = 'Ingreso';

// Fija entre reinicios, para que la misma dirección de nadie salga siempre igual.
const CLAVE_DE_LA_DIRECCION_DE_NADIE = process.env.CONTRASENAS_DE_LAS_CUENTAS_AUTOMATICAS
  || crypto.randomBytes(32).toString('hex');

/** Una dirección con la forma de las de acceso, que no es de ninguna cuenta. */
function direccionDeNadie(usuario) {
  const h = crypto.createHmac('sha256', CLAVE_DE_LA_DIRECCION_DE_NADIE)
    .update(`direccion-de-nadie:${usuario}`)
    .digest('hex');
  const forma = `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${'89ab'[parseInt(h[16], 16) % 4]}${h.slice(17, 20)}-${h.slice(20, 32)}`;
  return direccionDeAcceso(forma);
}

ingresoRouter.post('/correo-de-acceso', async (req, res) => {
  const usuario = usuarioComparable(req.body?.usuario);
  if (!usuario) return res.status(400).json({ error: 'faltan_datos' });

  try {
    const cuenta = await cuentaQueNombra(usuario, TRABAJO);
    const correo = cuenta ? direccionDeAcceso(cuenta.id) : direccionDeNadie(usuario);
    res.json({ correo });
  } catch (err) {
    console.error('Ingreso:', err.message);
    res.status(500).json({ error: 'error_interno' });
  }
});
