import { supabase } from '../db/connection.js';
import { idiomaDeLaPrestadora } from '../i18n/idiomaDeLaPrestadora.js';
import { IDIOMA_POR_DEFECTO } from '../i18n/idiomas.js';

/* Qué contesta sola la respuesta automática de WhatsApp, y qué no.
   ======================================================================================

   LA REGLA, EN UNA LÍNEA: contesta todo menos salud y emergencias, y nunca improvisando.

   ACÁ SE DECIDE Y EN NINGÚN OTRO LADO. La pantalla del Panel muestra el banco de respuestas y
   deja aprobarlas; lo que puede salir hacia afuera lo decide esta función. Si la decisión
   viviera en la pantalla, cualquier otro camino hasta el envío —otra pantalla, una ruta escrita
   a mano, un proceso de fondo— la saltearía sin que nadie lo notara.

   LOS CUATRO CAMINOS POSIBLES, y no hay un quinto:

     1. `emergencia`  — el mensaje habla de una emergencia. Se avisa al servicio de emergencias
                        de esa jurisdicción y se deriva igual a una persona.
     2. `derivar`     — el mensaje toca la salud del Paciente. Siempre, aunque haya una
                        respuesta preparada que parezca servir.
     3. `derivar`     — ninguna respuesta aprobada sirve para lo que entró. Ante la duda no
                        contesta.
     4. `responder`   — hay una respuesta aprobada que corresponde, y sale su texto tal cual.

   NUNCA SE REDACTA NADA EN EL CAMINO 4. El texto que sale es, letra por letra, el que la
   Prestadora aprobó. No se completa, no se adapta y no se le agrega un saludo: un texto que
   nadie leyó antes de mandarlo es exactamente lo que esta función viene a terminar.

   FALLA CERRADO. Si la lista de palabras de salud no se puede leer, no se contesta nada: se
   deriva todo a una persona. Una clasificación que no se pudo hacer no es una clasificación
   que dio «no es de salud».

   QUÉ NO ESTÁ ACÁ. El modelo de IA no interviene en esta decisión. Su lugar es antes y aparte:
   propone respuestas para el banco, que nacen sin aprobar (`utils/proponerRespuestasIA.js`). */

export const RESULTADO_RESPONDIDA = 'respondida';
export const RESULTADO_DERIVADA = 'derivada_a_una_persona';
export const RESULTADO_EMERGENCIA_AVISADA = 'emergencia_avisada';

export const MOTIVO_RESPUESTA_APROBADA = 'respuesta_aprobada';
export const MOTIVO_SIN_RESPUESTA_APROBADA = 'sin_respuesta_aprobada';
export const MOTIVO_TEMA_DE_SALUD = 'tema_de_salud';
export const MOTIVO_EMERGENCIA = 'emergencia';
export const MOTIVO_SIN_TELEFONO_DE_EMERGENCIA = 'sin_telefono_de_emergencia';
export const MOTIVO_NO_SE_PUDO_CLASIFICAR = 'no_se_pudo_clasificar';
export const MOTIVO_ENVIO_FALLIDO = 'envio_fallido';

/**
 * El texto en condiciones de compararse con una palabra de la lista.
 *
 * NO ES EL MISMO NORMALIZADOR que usan los tipos de Asistente o los nombres de plantilla: esos
 * borran todo lo que no es letra, y acá los espacios tienen que quedar, porque media lista son
 * dos palabras —«no respira», «blood pressure»—. Se deja además un espacio en cada punta para
 * poder preguntar por la palabra entera y que «dolor» no coincida adentro de «indoloro».
 */
export function textoComparable(texto) {
  const limpio = String(texto ?? '')
    .normalize('NFD')
    // El acento se borra, no se reemplaza por un espacio: `NFD` lo deja como una marca aparte
    // detrás de la letra, y cambiarla por un espacio parte «presión» en «presio n», que no
    // coincide con ninguna palabra de la lista.
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return limpio ? ` ${limpio} ` : '';
}

/** Si ese texto contiene esa palabra —o esas dos palabras— como palabra entera. */
function contiene(textoLimpio, termino) {
  const buscado = textoComparable(termino);
  return Boolean(textoLimpio) && Boolean(buscado) && textoLimpio.includes(buscado);
}

/**
 * Las palabras que hacen que un mensaje no se conteste solo.
 *
 * @returns `{ salud, emergencia }` con las palabras de los tres idiomas juntas —quien escribe
 *          por WhatsApp no elige idioma en ningún lado, así que se miran todas—, o `null` si la
 *          lista no se pudo leer, que es el caso en el que no se contesta nada.
 */
export async function terminosDeSaludYEmergencia() {
  const { data, error } = await supabase
    .from('terminos_de_salud_y_emergencia')
    .select('termino, motivo')
    .eq('activo', true);

  // El texto crudo de la base nombra tablas y columnas, así que no sale de acá (CLAUDE.md §6).
  if (error) {
    console.error('No se pudo leer la lista de palabras de salud y emergencia:', error.message);
    return null;
  }
  if (!data?.length) return null;

  return {
    salud: data.filter((fila) => fila.motivo === 'salud').map((fila) => fila.termino),
    emergencia: data.filter((fila) => fila.motivo === 'emergencia').map((fila) => fila.termino),
  };
}

/**
 * A qué número se avisa una emergencia donde está esa Prestadora.
 *
 * Mismo camino que la advertencia legal: sale de la jurisdicción configurada de la Prestadora y de
 * ningún otro lado. **Si no hay fila para esa jurisdicción, devuelve `null` y no se inventa
 * ningún número**: llamar a donde no corresponde es peor que no llamar.
 */
export async function telefonoDeEmergencia(prestadoraId) {
  if (!prestadoraId) return null;

  const { data: prestadora, error: errorPrestadora } = await supabase
    .from('prestadoras')
    .select('pais')
    .eq('id', prestadoraId)
    .maybeSingle();
  if (errorPrestadora || !prestadora?.pais) return null;

  const { data, error } = await supabase
    .from('telefonos_de_emergencia')
    .select('telefono')
    .eq('jurisdiccion', prestadora.pais)
    .eq('activo', true)
    .maybeSingle();
  if (error) return null;

  return data?.telefono || null;
}

/** Las respuestas que la Prestadora aprobó y tiene activas. Ninguna otra existe para acá. */
async function respuestasAprobadas(prestadoraId) {
  const { data, error } = await supabase
    .from('respuestas_preparadas_whatsapp')
    .select('id, nombre_interno, terminos, i18n, toca_salud, aprobada_at, activa')
    .eq('prestadora_id', prestadoraId)
    .eq('activa', true)
    .not('aprobada_at', 'is', null);

  if (error) {
    console.error('No se pudo leer el banco de respuestas preparadas:', error.message);
    return null;
  }

  return data ?? [];
}

/** Cuántas de sus palabras aparecen en el mensaje. Cero significa que esta respuesta no es. */
function cuantoCoincide(respuesta, textoLimpio) {
  const terminos = (respuesta.terminos ?? []).filter(Boolean);
  if (!terminos.length) return 0;
  return terminos.filter((termino) => contiene(textoLimpio, termino)).length;
}

/**
 * Qué hay que hacer con un mensaje que entró.
 *
 * @returns `{ accion, motivo, respuesta, texto }`, donde `accion` es `responder`, `derivar` o
 *          `emergencia`. `texto` sólo viene con `responder`, y es el texto aprobado tal cual.
 */
export async function resolverRespuestaAutomatica({ prestadoraId, texto, idioma = null }) {
  const textoLimpio = textoComparable(texto);

  // Un mensaje sin palabras que comparar no se contesta solo: puede ser un audio transcripto a
  // la nada, un adjunto sin texto o un signo suelto. Nada de eso se parece a ninguna respuesta.
  if (!textoLimpio) {
    return { accion: 'derivar', motivo: MOTIVO_SIN_RESPUESTA_APROBADA, respuesta: null, texto: null };
  }

  const terminos = await terminosDeSaludYEmergencia();
  // FALLA CERRADO: sin la lista no se puede afirmar que esto no sea de salud.
  if (!terminos) {
    return { accion: 'derivar', motivo: MOTIVO_NO_SE_PUDO_CLASIFICAR, respuesta: null, texto: null };
  }

  // La emergencia se mira primero: es el caso en el que esperar a una persona cuesta más caro.
  if (terminos.emergencia.some((termino) => contiene(textoLimpio, termino))) {
    return { accion: 'emergencia', motivo: MOTIVO_EMERGENCIA, respuesta: null, texto: null };
  }

  // Y lo clínico se deriva SIEMPRE, antes de mirar el banco: que exista una respuesta preparada
  // que parezca servir no convierte una pregunta sobre la salud del Paciente en una pregunta
  // que pueda contestar un sistema.
  if (terminos.salud.some((termino) => contiene(textoLimpio, termino))) {
    return { accion: 'derivar', motivo: MOTIVO_TEMA_DE_SALUD, respuesta: null, texto: null };
  }

  const aprobadas = await respuestasAprobadas(prestadoraId);
  if (!aprobadas) {
    return { accion: 'derivar', motivo: MOTIVO_NO_SE_PUDO_CLASIFICAR, respuesta: null, texto: null };
  }

  let elegida = null;
  let mejor = 0;
  for (const respuesta of aprobadas) {
    // Segunda red sobre lo clínico. La base ya no deja aprobar una respuesta marcada así, y acá
    // se vuelve a preguntar: una regla que no puede fallar se escribe dos veces.
    if (respuesta.toca_salud) continue;

    const coincidencias = cuantoCoincide(respuesta, textoLimpio);
    if (coincidencias > mejor) {
      mejor = coincidencias;
      elegida = respuesta;
    }
  }

  if (!elegida) {
    return { accion: 'derivar', motivo: MOTIVO_SIN_RESPUESTA_APROBADA, respuesta: null, texto: null };
  }

  const idiomaDelTexto = idioma ?? (await idiomaDeLaPrestadora(prestadoraId));
  const textoAprobado = elegida.i18n?.[idiomaDelTexto] ?? elegida.i18n?.[IDIOMA_POR_DEFECTO];

  // Sin texto en ese idioma no hay nada que mandar, y no se traduce ni se arma uno parecido.
  if (!textoAprobado || !String(textoAprobado).trim()) {
    return { accion: 'derivar', motivo: MOTIVO_SIN_RESPUESTA_APROBADA, respuesta: null, texto: null };
  }

  return {
    accion: 'responder',
    motivo: MOTIVO_RESPUESTA_APROBADA,
    respuesta: elegida,
    texto: String(textoAprobado),
  };
}

/**
 * Qué hace falta para avisar al servicio de emergencias del lugar donde está la Prestadora.
 *
 * QUÉ HACE HOY. Resuelve el número de esa jurisdicción y contesta con él. Si no hay ninguno
 * configurado contesta `null`, **y no inventa ninguno**: quien llama deriva a una persona y lo
 * deja registrado. Es el mismo criterio de la advertencia legal: sin documento no hay advertencia.
 *
 * EL HUECO, ESCRITO ACÁ PARA QUE NO SE PIERDA. Lo que corresponde ante una emergencia es una
 * llamada de voz, y este producto no tiene por dónde hacerla: las tres vías que tiene —WhatsApp,
 * mensaje de texto y correo— son de mensaje, y además WhatsApp sólo entrega texto libre adentro
 * de una conversación que abrió la otra persona, cosa que un servicio de emergencias nunca hizo.
 * Hasta que exista una vía de voz, lo que pasa con una emergencia es lo único honesto que se
 * puede hacer: se deriva a una persona, con el número ya resuelto para que llame, y queda
 * registrado que se derivó por eso.
 *
 * Y NO SE MANDA EL DETALLE POR NINGÚN MENSAJE. Lo que la persona escribió es información
 * clínica, y eso no viaja en un mensaje (`docs/REGLAS_PRODUCTOS_CAREONYS.md`). El detalle queda
 * en el hilo, que es donde la RLS ya lo cuida, y ahí lo lee quien atiende.
 */
export async function avisarAlServicioDeEmergencias({ prestadoraId }) {
  const telefono = await telefonoDeEmergencia(prestadoraId);

  if (!telefono) {
    console.warn(
      'Emergencia por WhatsApp sin teléfono de emergencias configurado para la jurisdicción de la Prestadora:',
      prestadoraId,
    );
    return { telefono: null, motivo: MOTIVO_SIN_TELEFONO_DE_EMERGENCIA };
  }

  return { telefono, motivo: MOTIVO_EMERGENCIA };
}

/**
 * Deja constancia de qué se hizo con un mensaje entrante.
 *
 * **Nunca lleva contenido**: ni el texto que entró, ni el que salió, ni el teléfono. Van los
 * identificadores y un motivo de lista cerrada. Para leer el contenido se mira el hilo, que es
 * donde vive.
 *
 * No hace fallar a quien la llama: el registro acompaña al trabajo, no lo bloquea.
 */
export async function registrarRespuestaAutomatica({
  prestadoraId,
  conversacionId = null,
  mensajeEntranteId = null,
  mensajeSalienteId = null,
  respuestaPreparadaId = null,
  resultado,
  motivo,
}) {
  if (!prestadoraId || !resultado || !motivo) return;

  const { error } = await supabase.from('auditoria_respuesta_automatica_whatsapp').insert({
    prestadora_id: prestadoraId,
    conversacion_id: conversacionId,
    mensaje_entrante_id: mensajeEntranteId,
    mensaje_saliente_id: mensajeSalienteId,
    respuesta_preparada_id: respuestaPreparadaId,
    resultado,
    motivo,
  });

  if (error) console.error('No se pudo registrar la respuesta automática de WhatsApp:', error.message);
}
