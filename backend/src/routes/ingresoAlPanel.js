import { Router } from 'express';
import { sinPrestadora } from '../db/connection.js';
import { correoDeAcceso, correoComparable } from '../config/correoDeAcceso.js';

export const ingresoAlPanelRouter = Router();

// CON QUÉ CORREO SE LE HABLA AL SERVICIO DE ACCESO PARA ENTRAR AL PANEL.
//
// Sin sesión a propósito: es lo que la pantalla de ingreso necesita antes de mandar la clave. La
// Prestadora sale del correo de la cuenta, que en el Panel es de una sola Prestadora, y no de la
// dirección de la página.
//
// CONTESTA SIEMPRE LO MISMO. Exista la cuenta o no, sale un correo armado de la misma forma: con la
// Prestadora cuando se la encontró, y con una que no existe cuando no. Desde afuera no se distingue
// una respuesta de la otra, así que esta puerta no sirve para averiguar quién tiene cuenta.
const TRABAJO = 'Ingreso al Panel';
const NINGUNA = 'ninguna';

ingresoAlPanelRouter.post('/correo-de-acceso', async (req, res) => {
  const correo = correoComparable(req.body?.email);
  if (!correo) return res.status(400).json({ error: 'faltan_datos' });

  try {
    const { data: prestadoraId, error } = await sinPrestadora(TRABAJO)
      .rpc('prestadora_del_correo_del_panel', { p_correo: correo });
    if (error) throw new Error(error.message);

    res.json({ correo: await correoDeAcceso(correo, prestadoraId || NINGUNA) });
  } catch (err) {
    console.error('Ingreso al Panel:', err.message);
    res.status(500).json({ error: 'error_interno' });
  }
});
