import crypto from 'node:crypto';

// Lo que se guarda del enlace para activar la cuenta y del enlace para restablecer la contraseña.
//
// El enlace viaja entero en el correo y nunca se guarda: se guarda su identificador de verificación. Al abrirlo,
// se calcula el de lo que llegó y se busca ése. Quien se llevara la tabla tendría identificadores, y
// con uno no se arma ningún enlace.
//
// A diferencia del código de verificación, acá no hace falta un secreto del servidor: el enlace
// lleva 32 bytes al azar, y probar todos los valores posibles no termina nunca.
//
// La base hace la misma cuenta en `poner_clave_con_codigo` —sha256 en hexadecimal sobre el texto
// tal cual— y la base misma rechaza guardar algo que no tenga esa forma, así que si las dos puntas
// se despegaran ningún enlace funcionaría y se notaría en el acto.
export function verificadorDelEnlace(codigo) {
  return crypto.createHash('sha256').update(String(codigo ?? ''), 'utf8').digest('hex');
}
