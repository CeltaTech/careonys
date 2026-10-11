// Para quién puede ser una pieza de Contenidos. La base admite estos tres y ningún otro
// (`contenidos_destinatarios_conocidos`); el backend valida contra esta lista y el Panel la recorre
// para dibujar las casillas.
//
// Original en el backend; la copia del Panel la regenera `scripts/sincronizar_copias.mjs`.

export const DESTINATARIOS_DE_CONTENIDOS = Object.freeze(['clientes', 'asistentes', 'personal']);
