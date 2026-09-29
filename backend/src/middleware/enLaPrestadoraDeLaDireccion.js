import { enLaPrestadora } from '../db/connection.js';
import { esIdentificador } from '../utils/intercambioDeFacturacion.js';

// Las direcciones que llama otro programa —una pasarela de pago, Meta, el software de cobranzas o
// el de facturación de la Prestadora— no traen ninguna persona detrás, pero sí la Prestadora: una
// dirección distinta por cada una. Todo lo que corre detrás entra a la base con la credencial de
// esa Prestadora y de ninguna otra, así que ni un pedido falsificado alcanza a otra.
//
// Que el pedido sea de verdad lo sigue comprobando cada ruta con el secreto de esa Prestadora.
// Esto no lo reemplaza: sólo pone el techo de hasta dónde llega lo que pase después.
//
// El rechazo es el mismo que da la ruta cuando el secreto no coincide: quien llama no tiene por
// qué distinguir una Prestadora ilegible de una clave equivocada.
const rechazarAviso = (res) => res.status(401).json({ error: 'Aviso no autenticado' });

export function enLaPrestadoraDeLaDireccion(trabajo, rechazar = rechazarAviso) {
  return (req, res, next) => {
    const { prestadoraId } = req.params;
    if (!esIdentificador(prestadoraId)) {
      console.warn(`${trabajo} rechazado:`, prestadoraId, 'prestadora_de_la_direccion_ilegible');
      return rechazar(res);
    }
    return enLaPrestadora(prestadoraId, trabajo, next);
  };
}
