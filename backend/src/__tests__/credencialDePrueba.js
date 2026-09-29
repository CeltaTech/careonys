import { generateKeyPairSync } from 'node:crypto';

// Lo que corre adentro de una Prestadora entra a la base con la credencial del trabajo sin persona
// (`db/connection.js`), y las pruebas que pasan por ahí necesitan con qué generarla. Una clave hecha
// en el momento, que no vale en ninguna base. Va antes de importar la conexión.
export function prepararCredencialDePrueba() {
  process.env.SUPABASE_ANON_KEY = 'clave-publica-de-mentira';
  process.env.CLAVE_DEL_TRABAJO_SIN_PERSONA = JSON.stringify({
    ...generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ format: 'jwk' }),
    kid: 'clave-de-prueba',
  });
}
