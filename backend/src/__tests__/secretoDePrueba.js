// Las pruebas corren sin el entorno del servidor. El secreto de los códigos de verificación se pone
// acá, inventado y distinto en cada corrida, antes de cargar cualquier archivo de prueba.
import crypto from 'node:crypto';

process.env.SECRETO_DE_LOS_CODIGOS ||= crypto.randomBytes(32).toString('hex');
