// ---------------------------------------------------------------------------
// reglaDeUsuario.js — cómo se escribe el nombre de usuario que elige la persona
//
// Asistentes y Clientes eligen su nombre al activar la cuenta. Entre 4 y 12 caracteres: letras sin
// tilde ni eñe, números, punto, guion y guion bajo, sin espacios. Sin distinguir mayúsculas: se
// guarda en minúsculas.
//
// PUNTO ÚNICO DE VERDAD. El backend lo lee de acá, y las aplicaciones de las copias que genera
// `scripts/copias_entre_apps.mjs`. La base exige lo mismo en `interno.usuario_elegido_bien_escrito`,
// y `scripts/verificar_regla_de_usuario.mjs` rompe la construcción si se despegan.
// ---------------------------------------------------------------------------

export const USUARIO_MINIMO = 4;
export const USUARIO_MAXIMO = 12;

const FORMA = new RegExp(`^[a-z0-9._-]{${USUARIO_MINIMO},${USUARIO_MAXIMO}}$`);

/** El nombre escrito, dejado comparable: sin espacios a los costados y en minúsculas. */
export function usuarioComparable(texto) {
  return String(texto ?? '').trim().toLowerCase();
}

/** ¿El nombre que eligió la persona cumple la regla? */
export function usuarioBienEscrito(texto) {
  return FORMA.test(usuarioComparable(texto));
}
