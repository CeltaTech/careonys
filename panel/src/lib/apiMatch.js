import { llamadorDe } from './apiPanel';

/* Las rutas del Match, desde el Panel.
   ==========================================================================

   Lo que va después de `/api/panel/match`. Existía escrito dos veces —una copia adentro de
   `pages/match/Clientes.jsx` y otra adentro de `pages/configuracion/LaPrestadora.jsx`—, y
   las dos eran una versión vieja del `fetch` que hoy vive en `apiPanel.js`: armaban el encabezado
   del tipo de contenido siempre, aunque el envío llevara un archivo. Una sola línea, acá, es lo
   que pide «ningún patrón repetido sin punto único de verdad» (`celtatech/CLAUDE.md` §8). */
export const llamarApiMatch = llamadorDe('/match');
