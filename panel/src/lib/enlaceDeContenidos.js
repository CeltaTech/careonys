// Qué enlace admite una pieza de Contenidos: una página web cifrada, de cualquier sitio. Lo que no
// se admite es un `javascript:` ni un `http://` suelto, porque esto termina en un enlace que toca
// un Cliente. El backend valida con esta regla y el Panel la usa para encender «Abrir».
//
// Original en el backend; la copia del Panel la regenera `scripts/sincronizar_copias.mjs`.

export const ENLACE_DE_CONTENIDO_ACEPTADO = /^https:\/\/\S+$/;
