// La puerta por la que CeltaTech da de alta una Prestadora.
//
// Es la entrada `POST /integracion/v1/tenants` del contrato entre CeltaTech y sus productos
// (`celtatech/docs/MODELO_COMERCIAL_CELTATECH.md`, §6.1 y §6.2). Contesta `201 { tenant_ref }`
// con el identificador de la Prestadora nueva, y `200 { tenant_ref }` cuando la misma referencia
// ya tenía la suya: CeltaTech reintenta cuando no le llegó la respuesta, y un reintento no crea
// una segunda Prestadora.
//
// CÓMO SE SABE QUE EL PEDIDO ES DE CELTATECH.
//   1. **El cuerpo se recibe crudo**, porque la firma se calcula sobre los bytes exactos que
//      llegaron. Por eso este router trae su propio lector y en `server.js` se monta antes del
//      `express.json()` general.
//   2. **Ante cualquier duda se corta con 401, antes de tocar nada.** Sin clave de firma
//      configurada, sin cabecera, o con una firma que no da: se rechaza, y a quien llamó se le
//      contesta siempre lo mismo. Decirle cuál comprobación falló es enseñarle a pasarla.
//
// Lo que CeltaTech manda sobre qué tiene contratado la Prestadora (`entitlements`) se recibe y no
// se usa todavía: guardarlo y hacerlo cumplir es la segunda parte de este trabajo.
import express, { Router } from 'express';
import { claveDeFirmaDeCeltaTech, comprobarFirmaDeCeltaTech } from '../utils/firmaDeCeltaTech.js';
import { darDeAltaLaPrestadora, loQueFaltaEnElAlta } from '../utils/altaDePrestadora.js';

/** Qué contesta cada motivo que llega de la base. Ninguno nombra una tabla ni una columna. */
const ESTADO_POR_MOTIVO = {
  faltan_datos: 400,
  codigo_mal_escrito: 400,
  pais_sin_moneda: 400,
  codigo_en_uso: 409,
  casilla_en_uso: 409,
  nombre_en_uso: 409,
  correo_de_administracion_en_uso: 409,
  dato_en_uso: 409,
};

/**
 * Arma la puerta. Las pruebas le pasan lo suyo; en el servidor se usa la de abajo, con lo de
 * verdad.
 */
export function crearAltaDePrestadoraRouter({ clave = claveDeFirmaDeCeltaTech, alta = darDeAltaLaPrestadora } = {}) {
  const router = Router();
  router.use(express.raw({ type: 'application/json', limit: '64kb' }));

  router.post('/', async (req, res) => {
    function rechazar(motivo) {
      console.warn('Alta de Prestadora rechazada:', motivo);
      return res.status(401).json({ error: 'Pedido no autenticado' });
    }

    const cuerpoCrudo = Buffer.isBuffer(req.body) ? req.body : null;
    const firma = comprobarFirmaDeCeltaTech({
      secreto: clave(),
      cabecera: req.get('X-CeltaTech-Firma'),
      cuerpoCrudo,
    });
    if (!firma.valido) return rechazar(firma.motivo);

    // De acá para abajo el pedido está probado auténtico, así que lo que esté mal se contesta con
    // el dato: del otro lado está CeltaTech, que tiene que poder corregir lo que mandó.
    let cuerpo;
    try {
      cuerpo = JSON.parse(cuerpoCrudo.toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'Cuerpo ilegible' });
    }

    const falta = loQueFaltaEnElAlta(cuerpo);
    if (falta) return res.status(400).json({ error: 'faltan_datos', dato: falta });

    try {
      const { tenantRef, creada } = await alta(cuerpo);
      return res.status(creada ? 201 : 200).json({ tenant_ref: tenantRef });
    } catch (error) {
      const estado = ESTADO_POR_MOTIVO[error?.motivo];
      if (estado) return res.status(estado).json({ error: error.motivo });
      // El detalle queda en el registro del servidor. Afuera sale sólo que no se pudo.
      console.error('No se pudo dar de alta la Prestadora:', error?.message ?? error);
      return res.status(502).json({ error: 'alta_no_completada' });
    }
  });

  return router;
}

export const altaDePrestadoraRouter = crearAltaDePrestadoraRouter();
