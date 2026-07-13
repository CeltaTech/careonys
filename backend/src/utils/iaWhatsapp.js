import Anthropic from '@anthropic-ai/sdk';

// Primera integración real del SDK de Claude en este backend (docs/CONTEXT.md ya lo
// documentaba como motor de IA por defecto del proyecto). Se usa acá para el punto 6 de
// docs/PRD_06_WhatsApp_IA.md: la IA participa de conversaciones de WhatsApp entrantes con
// Asistentes, redactando una respuesta y decidiendo si puede enviarse sola (situación común,
// configurable por prestadora) o si tiene que esperar la revisión del Coordinador.
//
// Regla de fondo (decisión del Desarrollador, punto 2 de docs/PRD_06_WhatsApp_IA.md):
// "Nunca un mensaje puede quedar sin respuesta, siempre el coordinador debe saber lo que la
// IA responde" — por eso esta función siempre devuelve tanto la respuesta sugerida como una
// bandera explícita de si necesita revisión, nunca decide en silencio.

const MODELO = 'claude-sonnet-5';

const SYSTEM_PROMPT = `Sos un asistente que ayuda a un Coordinador de cuidado domiciliario a
responder mensajes de WhatsApp de Asistentes Integrales (cuidadores independientes, no
empleados). Tu tarea es sugerir una respuesta breve y clara en español rioplatense, y decidir
si la situación es lo bastante común y de bajo riesgo como para responder de forma automática,
o si necesita que un Coordinador humano la revise antes de enviarse.

Nunca uses lenguaje que suene a relación de dependencia laboral (sin ranking, sin advertencias
disciplinarias, sin imponer horarios). Ante cualquier mensaje sobre salud del paciente,
ausencias, urgencias, quejas, o cualquier cosa fuera de lo administrativo simple, marcá que
necesita revisión del Coordinador.

Respondé únicamente con un JSON de esta forma, sin texto adicional:
{"respuesta_sugerida": "...", "confianza_alta": true|false, "requiere_coordinador": true|false, "motivo": "..."}`;

let cliente = null;
function obtenerCliente() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!cliente) cliente = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return cliente;
}

// historial: array de { direccion: 'entrante'|'saliente', texto } en orden cronológico.
export async function generarRespuestaIA({ mensajeEntrante, historial = [] }) {
  const anthropic = obtenerCliente();
  if (!anthropic) {
    return {
      respuestaSugerida: null,
      confianzaAlta: false,
      requiereCoordinador: true,
      motivo: 'ANTHROPIC_API_KEY no configurada — pendiente de completar en el test final con prestadora real',
    };
  }

  const mensajes = [
    ...historial.map((m) => ({
      role: m.direccion === 'entrante' ? 'user' : 'assistant',
      content: m.texto,
    })),
    { role: 'user', content: mensajeEntrante },
  ];

  const respuesta = await anthropic.messages.create({
    model: MODELO,
    max_tokens: 500,
    system: SYSTEM_PROMPT,
    messages: mensajes,
  });

  const texto = respuesta.content?.[0]?.type === 'text' ? respuesta.content[0].text : '';

  try {
    const parseado = JSON.parse(texto);
    return {
      respuestaSugerida: parseado.respuesta_sugerida ?? null,
      confianzaAlta: Boolean(parseado.confianza_alta),
      requiereCoordinador: parseado.requiere_coordinador !== false,
      motivo: parseado.motivo ?? null,
    };
  } catch {
    return {
      respuestaSugerida: null,
      confianzaAlta: false,
      requiereCoordinador: true,
      motivo: 'La IA no devolvió un JSON válido — se escala al Coordinador por seguridad',
    };
  }
}
