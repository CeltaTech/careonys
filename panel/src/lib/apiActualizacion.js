import { llamadorDe } from './apiPanel';

/* Las rutas de la actualización de precios por índice del backend.
   ==========================================================================

   Los índices con sus valores, la carga a mano de un valor, la vista previa y la aplicación. La
   cuenta la hace la base (`actualizar_precios_por_indice`): el navegador pide y muestra.

   @param {string} path  Lo que va después de `/api/panel/actualizacion`, empezando con `/`.
   @param {object} opciones  Lo mismo que acepta `fetch`. */
export const llamarApiActualizacion = llamadorDe('/actualizacion');

/* La importación de una lista de precios vive con las demás importaciones.

   @param {string} path  Lo que va después de `/api/panel/importacion/precios`. */
export const llamarApiImportacionDePrecios = llamadorDe('/importacion/precios');
