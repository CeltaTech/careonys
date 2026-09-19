import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '../db/connection.js';
import { registrarUsoIA } from './registrarUsoIA.js';
import { TRATO_IA } from './tratoIA.js';
import { jsonDeRespuestaIA } from './respuestaIA.js';
import { MODELO_IA } from '../config/modeloIA.js';

/* La IA arma el modelo de respuestas. Aprobar es de la Prestadora.
   ======================================================================================

   QUÉ HACE ESTO Y QUÉ NO. Mira los mensajes que ya entraron por WhatsApp y propone un banco de
   respuestas preparadas: cómo se llama cada situación, con qué palabras se reconoce y qué
   contestaría. Nada de lo que propone sale hacia nadie. **Todo entra SIN APROBAR**, y ahí se
   queda hasta que alguien de la Prestadora lo lea, lo corrija y lo apruebe.

   POR QUÉ ESTÁ SEPARADO DE LA RESPUESTA AUTOMÁTICA. Antes, la IA redactaba una respuesta para
   cada mensaje entrante y además decidía si mandarla sola. Eso es improvisar: cada mensaje que
   salía era un texto nuevo que nadie había leído. Ahora son dos momentos distintos y en el
   medio hay una persona: acá se propone, y en `utils/respuestaAutomaticaWhatsapp.js` se elige
   entre lo que esa persona aprobó, sin escribir una sola palabra nueva.

   LO CLÍNICO NO SE PROPONE PARA CONTESTAR SOLO. Cuando una situación toca la salud del
   Paciente, la fila entra marcada `toca_salud`, y una fila marcada así no se puede aprobar: la
   base tampoco la deja. Queda en el banco para que la lea una persona, que es lo que
   corresponde.

   EL HUECO, POR SI NO ESTÁ CONECTADO. El único proveedor de IA de este producto es el SDK de
   Anthropic, y la clave vive en `ANTHROPIC_API_KEY`. Sin esa variable no hay proveedor
   conectado: esto contesta `{ disponible: false }` y no propone nada. No se inventa la
   conexión, no se prueba otro proveedor y no se escribe ninguna respuesta de relleno. El banco
   se llena a mano desde el Panel, que es un camino que funciona igual.

   EL NOMBRE DEL MODELO SALE DE `config/modeloIA.js` y de ningún otro lado. */

const SYSTEM_PROMPT = `Este asistente arma un modelo de respuestas preparadas para una empresa de
cuidado domiciliario, a partir de mensajes de WhatsApp que ya recibió. Cada respuesta preparada
es un texto fijo que después una persona de la empresa revisa, corrige y aprueba, y recién ahí
puede salir tal cual está escrito.

${TRATO_IA}
Alcanza a cada texto propuesto, que es el que va a leer una persona por WhatsApp.

Cada respuesta se propone en los tres idiomas: "es-AR", "en" y "pt-BR".

Nunca se usa lenguaje que suene a relación de dependencia laboral: sin ranking, sin advertencias
disciplinarias y sin imponer horarios.

Cuando la situación toca la salud de la persona cuidada —síntomas, medicación, dolor, una caída,
una emergencia—, la respuesta se marca con "toca_salud": true. Esas respuestas no se contestan
solas nunca: existen para que las lea una persona.

Se responde únicamente con un JSON de esta forma, sin texto adicional:
{"respuestas": [{"nombre_interno": "...", "terminos": ["...", "..."], "toca_salud": true|false,
"texto": {"es-AR": "...", "en": "...", "pt-BR": "..."}}]}`;

let cliente = null;
function obtenerCliente() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!cliente) cliente = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return cliente;
}

/** Una propuesta sirve si tiene nombre, al menos una palabra con la que reconocerla, y texto en
 *  los tres idiomas. Sin las tres cosas la base la rechazaría, y media fila no se guarda. */
function propuestaCompleta(propuesta) {
  const texto = propuesta?.texto;
  return Boolean(
    propuesta?.nombre_interno?.trim?.() &&
      Array.isArray(propuesta.terminos) &&
      propuesta.terminos.filter(Boolean).length &&
      texto?.['es-AR']?.trim?.() &&
      texto?.en?.trim?.() &&
      texto?.['pt-BR']?.trim?.(),
  );
}

/**
 * Le pide a la IA un modelo de respuestas y lo guarda SIN APROBAR.
 *
 * @param {string} prestadoraId
 * @param {Array<{direccion: string, texto: string}>} mensajes  Los que ya entraron por WhatsApp.
 * @returns `{ disponible, propuestas }`. `disponible: false` significa que no hay proveedor de
 *          IA conectado; no es un error, es que esa parte todavía no existe.
 */
export async function proponerRespuestasPreparadas({ prestadoraId, mensajes = [] }) {
  const anthropic = obtenerCliente();
  if (!anthropic) return { disponible: false, propuestas: 0 };
  if (!prestadoraId || !mensajes.length) return { disponible: true, propuestas: 0 };

  const entrantes = mensajes
    .filter((mensaje) => mensaje?.direccion === 'entrante' && mensaje?.texto)
    .map((mensaje) => mensaje.texto);
  if (!entrantes.length) return { disponible: true, propuestas: 0 };

  const respuesta = await anthropic.messages.create({
    model: MODELO_IA,
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: entrantes.join('\n') }],
  });

  registrarUsoIA({ prestadoraId, modulo: 'whatsapp', modelo: MODELO_IA, respuestaAnthropic: respuesta });

  const parseado = jsonDeRespuestaIA(respuesta);
  const propuestas = Array.isArray(parseado?.respuestas) ? parseado.respuestas : [];
  const filas = propuestas.filter(propuestaCompleta).map((propuesta) => ({
    prestadora_id: prestadoraId,
    nombre_interno: propuesta.nombre_interno.trim(),
    terminos: propuesta.terminos.filter(Boolean),
    i18n: {
      'es-AR': propuesta.texto['es-AR'],
      en: propuesta.texto.en,
      'pt-BR': propuesta.texto['pt-BR'],
    },
    toca_salud: propuesta.toca_salud === true,
    origen: 'ia',
    // Las dos columnas de la aprobación quedan vacías, que es como nace todo lo de acá.
  }));

  if (!filas.length) return { disponible: true, propuestas: 0 };

  // Lo que ya existe con ese nombre no se pisa: puede ser justamente lo que alguien corrigió a
  // mano, y pisarlo sería borrar el trabajo de una persona con una propuesta de una máquina.
  const { error } = await supabase
    .from('respuestas_preparadas_whatsapp')
    .upsert(filas, { onConflict: 'prestadora_id,nombre_interno', ignoreDuplicates: true });

  if (error) {
    console.error('No se pudieron guardar las respuestas propuestas por la IA:', error.message);
    return { disponible: true, propuestas: 0 };
  }

  return { disponible: true, propuestas: filas.length };
}
