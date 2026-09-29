import { Router } from 'express';
import { entrevistaPorLlave } from '../utils/entrevistaDePostulacion.js';
import { responderError } from '../utils/errorConMotivo.js';
import { resolverPrestadoraPublica } from '../middleware/resolverPrestadoraPublica.js';

/* La única puerta del postulante.
   ==============================

   SIN SESIÓN A PROPÓSITO. Quien llega acá se postuló y todavía no es Asistente: no hay ninguna
   cuenta que darle. Lo que trae es la llave que le llegó por correo, y la llave es toda su
   credencial. Es la misma forma que ya tiene la activación de cuenta (`activarCuenta.js`).

   LA PRESTADORA VIAJA EN LA DIRECCIÓN, igual que en la activación y en la clave nueva. El enlace
   del correo ya la trae (`enlaceDeLaEntrevista`), así que no se le pide a la persona ningún dato
   que no tenga, y la llave se busca sólo adentro de esa Prestadora.

   LO QUE SALE LO DECIDE `entrevistaPorLlave`, que falla cerrado y no distingue una llave que no
   existe de una entrevista que ya se cerró. */

export const entrevistaPublicaRouter = Router();

entrevistaPublicaRouter.get('/:prestadora/:llave', resolverPrestadoraPublica, async (req, res) => {
  try {
    res.json(await entrevistaPorLlave(req.params.llave));
  } catch (error) {
    responderError(res, error);
  }
});
