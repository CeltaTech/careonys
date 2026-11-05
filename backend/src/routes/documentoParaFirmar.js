import { Router } from 'express';
import { normalizarIdioma } from '../i18n/idiomas.js';
import { resolverPrestadoraPublica } from '../middleware/resolverPrestadoraPublica.js';
import { enlaceDeDescarga, firmarDocumento, leerDocumento } from '../utils/enlaceConsentimientoPagador.js';
import { ErrorConMotivo, responderError } from '../utils/errorConMotivo.js';

// Sin sesión: quien llega trae el enlace que le llegó por email. La Prestadora sale de la dirección,
// y el enlace viaja en el cuerpo del pedido para que no quede en ningún registro.
export const documentoParaFirmarRouter = Router();

function responder(hacer) {
  return async (req, res) => {
    try {
      res.json(
        await hacer({
          prestadoraId: req.prestadoraPublica.prestadora_id,
          token: req.body?.token,
          idioma: normalizarIdioma(req.body?.idioma),
        }),
      );
    } catch (err) {
      if (err instanceof ErrorConMotivo) return responderError(res, err);
      console.error('Documento para firmar:', err.message);
      res.status(500).json({ error: 'error_interno' });
    }
  };
}

documentoParaFirmarRouter.post('/:prestadora', resolverPrestadoraPublica, responder(leerDocumento));
documentoParaFirmarRouter.post('/:prestadora/firmar', resolverPrestadoraPublica, responder(firmarDocumento));
documentoParaFirmarRouter.post('/:prestadora/descargar', resolverPrestadoraPublica, responder(enlaceDeDescarga));
