import { Router } from 'express';
import { correoDeAcceso } from '../config/correoDeAcceso.js';
import { cuentaDelNombreDeUsuario, parteComparable } from '../utils/nombreDeUsuario.js';

export const ingresoAlPanelRouter = Router();

// CON QUÉ CORREO SE LE HABLA AL SERVICIO DE ACCESO PARA ENTRAR AL PANEL.
//
// Sin sesión a propósito: es lo que la pantalla de ingreso necesita antes de mandar la clave. La
// coordinación escribe su nombre de usuario, que dice de qué Prestadora es
// (`utils/nombreDeUsuario.js`), y de ahí sale el correo de acceso: el mismo que arma el alta, con el
// correo declarado de la cuenta y su Prestadora. No se mira la dirección de la página.
//
// CONTESTA SIEMPRE LO MISMO. Exista la cuenta o no, sale un correo armado de la misma forma: con la
// cuenta cuando se la encontró, y con datos que no son de nadie cuando no. Desde afuera no se
// distingue una respuesta de la otra, así que esta puerta no sirve para averiguar quién tiene cuenta.
const TRABAJO = 'Ingreso al Panel';
const NINGUNA = 'ninguna';

ingresoAlPanelRouter.post('/correo-de-acceso', async (req, res) => {
  const usuario = parteComparable(req.body?.usuario);
  if (!usuario) return res.status(400).json({ error: 'faltan_datos' });

  try {
    const encontrada = await cuentaDelNombreDeUsuario(usuario, TRABAJO);
    const cuenta = encontrada?.cuenta;
    const correo = cuenta?.email
      ? await correoDeAcceso(cuenta.email, cuenta.prestadora_id)
      : await correoDeAcceso(`${usuario}@${NINGUNA}`, encontrada?.prestadoraId || NINGUNA);
    res.json({ correo });
  } catch (err) {
    console.error('Ingreso al Panel:', err.message);
    res.status(500).json({ error: 'error_interno' });
  }
});
