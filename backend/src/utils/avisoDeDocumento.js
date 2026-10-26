import { enviarPushAsistente } from './push.js';
import { respaldoWhatsappSiFalla } from './revisarRecordatoriosPush.js';
import { mensajeDelSistema } from '../i18n/avisos.js';
import { idiomaDeLaPrestadora } from '../i18n/idiomaDeLaPrestadora.js';

// Lo que se le avisa al Asistente sobre uno de sus documentos: que la Prestadora lo aprobó, que lo
// observó y por qué, que está por vencer o que venció. La frase sale de los mensajes del sistema,
// en el idioma de la Prestadora.
//
// Nunca tira: lo que se avisa ya pasó cuando se llega acá, y un aviso que no salió no lo deshace.

const URL_DE_DOCUMENTOS = '/documentos';

/**
 * @param {object} db conexión con la que se pregunta el idioma (la de quien pide, o la del trabajo)
 * @param {object} aviso `{ prestadoraId, asistenteId, clave, documento, motivo?, fecha? }`
 * @returns {Promise<boolean>} si salió por algún lado
 */
export async function avisarDocumentoAlAsistente(db, { prestadoraId, asistenteId, clave, documento, motivo, fecha, idioma }) {
  if (!prestadoraId || !asistenteId) return false;
  try {
    const enIdioma = idioma ?? await idiomaDeLaPrestadora(db, prestadoraId);
    const { titulo, cuerpo } = mensajeDelSistema(clave, enIdioma, { documento, motivo, fecha });
    const enviadoPorPush = await enviarPushAsistente(prestadoraId, asistenteId, { titulo, cuerpo, url: URL_DE_DOCUMENTOS });
    await respaldoWhatsappSiFalla({ prestadoraId, asistenteId, enviadoPorPush, titulo, cuerpo });
    return true;
  } catch (e) {
    console.error(`Error avisando al Asistente ${asistenteId} (${clave}):`, e.message);
    return false;
  }
}
