// Las pruebas corren sin el entorno del servidor. El secreto de los códigos de verificación se pone
// acá, inventado y distinto en cada corrida, antes de cargar cualquier archivo de prueba.
import crypto from 'node:crypto';

process.env.SECRETO_DE_LOS_CODIGOS ||= crypto.randomBytes(32).toString('hex');

// Y lo que arma la conexión con la base de mentira de cada prueba: la clave pública y la clave con
// la que el backend firma el trabajo sin persona, inventadas igual.
process.env.SUPABASE_ANON_KEY ||= 'clave-publica-de-mentira';
if (!process.env.CLAVE_DEL_TRABAJO_SIN_PERSONA) {
  const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  process.env.CLAVE_DEL_TRABAJO_SIN_PERSONA = JSON.stringify({ ...privateKey.export({ format: 'jwk' }), kid: 'prueba' });
}
