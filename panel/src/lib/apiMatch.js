import { llamadorDe } from './apiPanel';

/* Las rutas del match, desde el Panel.
   ==========================================================================

   Lo que va después de `/api/panel/match`. Una sola línea, acá, es lo que pide «ningún
   patrón repetido sin punto único de verdad» (`celtatech/CLAUDE.md` §8). */
export const llamarApiMatch = llamadorDe('/match');
