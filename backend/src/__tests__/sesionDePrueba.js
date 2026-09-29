// La credencial con la que una persona de mentira llama a una ruta en las pruebas.
//
// El backend comprueba la credencial de quien pide con la clave pública de la instalación que la
// emitió (`db/connection.js`, «La credencial de la persona»), así que ya no alcanza con mandar un
// texto cualquiera: tiene que tener la forma de una credencial de verdad, emitida por la base de
// mentira de la prueba.
//
// Va firmada con un algoritmo simétrico y sin identificador de clave. Con esa forma la biblioteca
// no puede verificar la firma por su cuenta y se la pregunta a la base —`GET /auth/v1/user`—, que
// cada prueba ya contesta. Es lo que hace una instalación de verdad con una credencial así: la
// firma de acá no vale nada, y lo que la da por buena es la respuesta de la base.
//
// La verificación con la clave pública, que es el camino de producción, la cubren las pruebas de
// `db/__tests__/credencialDeLaPersona.test.js`.

const enBase64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

/**
 * El encabezado `Authorization` de una persona de mentira.
 *
 * Se llama después de dejar puesta `SUPABASE_URL`: el emisor de la credencial sale de ahí, igual
 * que en una instalación de verdad.
 */
export function sesionDePrueba(usuarioId, { aal = 'aal1', rol = 'authenticated', emisor } = {}) {
  process.env.SUPABASE_ANON_KEY ??= 'clave-publica-de-mentira';
  const ahora = Math.floor(Date.now() / 1000);
  const cabecera = enBase64({ alg: 'HS256', typ: 'JWT' });
  const cuerpo = enBase64({
    sub: usuarioId,
    role: rol,
    aud: 'authenticated',
    iss: emisor ?? `${process.env.SUPABASE_URL}/auth/v1`,
    iat: ahora,
    exp: ahora + 3600,
    aal,
  });
  return `Bearer ${cabecera}.${cuerpo}.${Buffer.from('firma-de-mentira').toString('base64url')}`;
}
