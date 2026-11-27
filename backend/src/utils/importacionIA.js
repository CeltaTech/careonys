import XLSX from 'xlsx';
import Anthropic from '@anthropic-ai/sdk';
import { registrarUsoIA } from './registrarUsoIA.js';
import { TRATO_IA } from './tratoIA.js';
import { jsonDeRespuestaIA } from './respuestaIA.js';
import { IDENTIDAD } from '../config/identidadProducto.js';
import { MODELO_IA } from '../config/modeloIA.js';
import { ErrorConMotivo } from './errorConMotivo.js';
import { fechaDeArchivo } from './intercambioDeFacturacion.js';

// Fase 3 del plan "Terminar la Etapa 2 (Panel)" (importación masiva de datos con IA).
// Sigue el mismo patrón que backend/src/utils/reporteIA.js: cliente de Anthropic con
// inicialización perezosa condicionada a ANTHROPIC_API_KEY, prompt que exige responder
// solo JSON, y un fallback seguro si la respuesta no es JSON válido o si falta la key
// (acá el fallback es proponer un mapeo vacío para que el Admin_prestadora lo arme a mano,
// nunca bloquear la importación por falta de IA).

// Campos destino disponibles para el mapeo, por tipo — reflejan exactamente lo que
// panel/src/pages/clientes/NuevoPacienteModal.jsx, EditarPacienteModal.jsx y
// crearAsistenteDirecto()/crearClienteImportado() (backend/src/utils/cuentasPanel.js) aceptan.
// La medicación que el Paciente ya tomaba entra con su propia clase de importación, `medicacion`.
//
// El domicilio se acepta de las dos formas en que llega: partido en columnas, o entero en una sola
// celda, que la importación separa. La localidad no se guarda como texto: la resuelve
// `localidadesDeLaImportacion.js` contra la lista de lugares de la Prestadora.
const PARTES_DEL_DOMICILIO = ['Calle', 'Numero', 'Piso', 'Unidad', 'Localidad', 'Municipio', 'Provincia', 'CodigoPostal'];

export const CAMPOS_DOMICILIO = {
  asistente: 'domicilio',
  cliente: 'domicilioPaciente',
  servicio: 'domicilioPaciente',
};

export const CAMPOS_IMPORTACION = {
  asistente: [
    'nombre', 'telefono', 'email', 'documento', 'dni', 'genero', 'tipo_asistente',
    'domicilio', ...PARTES_DEL_DOMICILIO.map((parte) => `domicilio${parte}`),
    'dondeAceptaTrabajar',
    'valor_hora', 'valor_hora_rige_desde', 'horas_semanales',
  ],
  cliente: [
    'nombreContacto', 'apellidoContacto', 'documentoContacto', 'dniContacto', 'generoContacto',
    'telefono', 'email',
    'nombrePaciente', 'documentoPaciente', 'dniPaciente', 'generoPaciente',
    'domicilioPaciente', ...PARTES_DEL_DOMICILIO.map((parte) => `domicilioPaciente${parte}`),
    'fechaNacimientoPaciente', 'nivelComplejidadPaciente', 'patologiasPaciente',
    'servicio',
  ],
  // Un Servicio que ya está en curso: cada renglón es un turno de guardia semanal fijo. Quien
  // contrata y el Paciente, con los mismos campos que un Cliente; el tipo de servicio y la
  // modalidad, como figuran en la lista de precios; el Coordinador, por su nombre, su correo o su
  // nombre de usuario; los días y el horario, escritos de cualquier forma; y el Asistente, sólo por
  // su CUIL. Al Asistente nunca se lo busca por el nombre.
  servicio: [
    'nombreContacto', 'apellidoContacto', 'documentoContacto', 'dniContacto', 'generoContacto',
    'telefono', 'email',
    'nombrePaciente', 'documentoPaciente', 'dniPaciente', 'generoPaciente',
    'domicilioPaciente', ...PARTES_DEL_DOMICILIO.map((parte) => `domicilioPaciente${parte}`),
    'fechaNacimientoPaciente', 'nivelComplejidadPaciente', 'patologiasPaciente',
    'tipoServicio', 'modalidad', 'coordinador', 'dias', 'horario', 'cuilAsistente', 'vigenteDesde',
  ],
  // La medicación que el Paciente ya venía tomando. Entra vigente; la receta y la firma que falten
  // quedan como pedido.
  medicacion: [
    'documentoPaciente', 'nombrePaciente', 'medicamento', 'dosis', 'frecuencia', 'via',
    'fechaDesde', 'fechaHasta', 'nota',
  ],
  // Los valores normales de los signos vitales de cada Paciente.
  rangos_vitales: ['documentoPaciente', 'nombrePaciente', 'signo', 'valorMin', 'valorMax', 'unidad'],
  // La historia anterior: guardias, reportes, internaciones, facturas, cobros y deudas de antes.
  // El renglón entero se guarda; estos campos sólo dicen de quién es y de qué día.
  historia: [
    'documentoPaciente', 'nombrePaciente', 'documentoAsistente', 'nombreAsistente', 'documentoContacto', 'fecha',
  ],
  // Un documento no es una tabla: no tiene columnas que asignar.
  documento: [],
};

// Las clases de hoja de una importación de historia anterior.
export const CLASES_DE_HOJA = ['guardia', 'reporte', 'internacion', 'factura', 'cobro', 'deuda', 'otro'];

// Los campos que la pantalla marca como obligatorios al revisar qué columna es cuál. Un renglón al que
// le falta uno no queda afuera: entra con lo demás y queda un pedido de dato para la Prestadora.
export const CAMPOS_OBLIGATORIOS = {
  asistente: ['documento', 'dni', 'genero'],
  cliente: [
    'documentoContacto', 'dniContacto', 'generoContacto',
    'documentoPaciente', 'dniPaciente', 'generoPaciente',
  ],
  servicio: [
    'documentoContacto', 'dniContacto', 'generoContacto',
    'documentoPaciente', 'dniPaciente', 'generoPaciente',
    'tipoServicio', 'modalidad', 'dias', 'horario',
  ],
  medicacion: ['medicamento', 'dosis', 'frecuencia'],
  rangos_vitales: ['signo'],
  historia: [],
  documento: [],
};

// Todas las clases de importación que la pantalla puede elegir.
export const TIPOS_DE_IMPORTACION = Object.keys(CAMPOS_IMPORTACION);

/** Lo que dice la fila sobre el domicilio, como lo recibe `resolverLocalidades`. */
export function domicilioDesdeFila(fila, mapeo, tipo) {
  const base = CAMPOS_DOMICILIO[tipo];
  const parte = (nombre) => valorDesdeFila(fila, mapeo, `${base}${nombre}`, false) ?? null;
  return {
    renglon: valorDesdeFila(fila, mapeo, base, false) ?? null,
    calle: parte('Calle'),
    numero: parte('Numero'),
    piso: parte('Piso'),
    unidad: parte('Unidad'),
    localidad: parte('Localidad'),
    partido: parte('Municipio'),
    provincia: parte('Provincia'),
    codigo_postal: parte('CodigoPostal'),
  };
}

// Qué campos de cada tipo llegan como una lista adentro de una sola celda ("Norte, Sur"), y
// cómo se saca de una fila el valor de un campo interno con el mapeo ya corregido. Vive acá,
// al lado del catálogo de campos, porque es la misma pregunta —qué forma tiene una planilla
// importada— y la hacen dos lugares distintos: la ruta que confirma la importación y la que
// propone la configuración inicial a partir del archivo.
export const CAMPOS_LISTA = {
  asistente: new Set(['dondeAceptaTrabajar']),
  cliente: new Set(['patologiasPaciente']),
  servicio: new Set(['patologiasPaciente']),
  medicacion: new Set(),
  rangos_vitales: new Set(),
  historia: new Set(),
  documento: new Set(),
};

export function valorDesdeFila(fila, mapeo, campo, esLista) {
  const columna = Object.keys(mapeo).find((col) => mapeo[col] === campo);
  if (!columna) return esLista ? [] : undefined;
  const valor = fila[columna];
  if (esLista) {
    return String(valor ?? '').split(',').map((v) => v.trim()).filter(Boolean);
  }
  return valor === '' || valor == null ? undefined : valor;
}

/**
 * La fecha de una celda, en la forma que guarda la base.
 *
 * La celda vacía no trae fecha. La que trae algo que no es una fecha del calendario es un dato mal
 * cargado: la fila vuelve con ese motivo, y la fecha nunca se adivina.
 */
export function fechaDeLaCelda(valor) {
  const fecha = fechaDeArchivo(valor);
  if (fecha === '') throw new ErrorConMotivo('fecha_invalida', 'una fecha de la planilla no se entiende');
  return fecha ?? undefined;
}

/** La fecha desde la que rige el valor hora de la fila. Acompaña a ese valor: sin valor, se ignora. */
export function fechaDelValorHora(datos) {
  return datos.valor_hora ? fechaDeLaCelda(datos.valor_hora_rige_desde) : undefined;
}

// Capa 1 (formato conocido): cualquier formato que `xlsx` ya sepa leer — XLSX/XLSM/XLSB/XLS,
// ODS, XML SpreadsheetML, CSV/TSV/TXT delimitado, DIF, SYLK, DBF, WK1/WK3 — se acepta sin
// código nuevo, `XLSX.read` autodetecta el formato por firma de archivo, no hace falta un
// flag por extensión.
export function parsearArchivo(buffer, nombreArchivo) {
  // codepage 65001 (UTF-8) explícito: sin esto, un CSV en UTF-8 sin BOM (el caso normal al
  // exportar desde Excel/Sheets en español) se interpreta con acentos/ñ corrompidos —
  // encontrado en la verificación de esta fase con una planilla de prueba real.
  // `raw` deja el texto de un CSV tal cual está escrito. Sin eso, la librería convierte por su
  // cuenta lo que parece una fecha y lee `05/03/2026` como 3 de mayo, a la manera de Estados
  // Unidos: la fecha la interpreta después `fechaDeLaCelda`, que lee el día adelante. En un
  // archivo de Excel no cambia nada: la celda con formato de fecha sigue llegando como número.
  const libro = XLSX.read(buffer, { type: 'buffer', codepage: 65001, raw: true });
  const planilla = libro.Sheets[libro.SheetNames[0]];
  const filas = XLSX.utils.sheet_to_json(planilla, { defval: '' });
  if (filas.length === 0) {
    throw new ErrorConMotivo('archivo_ilegible', 'el archivo no tiene filas de datos');
  }
  const headers = Object.keys(filas[0]);
  return { headers, filas };
}

const SYSTEM_PROMPT = `Este asistente ayuda a mapear columnas de una planilla (Excel/CSV)
subida por una Prestadora de cuidado domiciliario a los campos internos del sistema ${IDENTIDAD.nombre},
para importar en forma masiva Asistentes, Clientes/Pacientes, Servicios en curso, la medicación
que cada Paciente ya tomaba, los valores normales de sus signos vitales o su historia anterior. Cada Prestadora
nombra sus columnas distinto (puede venir en español, con abreviaturas, en otro orden, con
columnas de más que no aplican). La tarea es proponer, para cada columna del archivo, a qué
campo interno corresponde (o null si no aplica a ninguno), y marcar advertencias sobre datos
que parezcan faltantes, ambiguos o de formato dudoso mirando las filas de muestra.

En una importación de Servicios en curso (tipo "servicio") cada fila es un turno de guardia semanal
fijo: quien contrata y el Paciente, el tipo de servicio y la modalidad como figuran en la lista de
precios ("tipoServicio", "modalidad"), el Coordinador ("coordinador"), los días de la semana
("dias"), el horario ("horario") y el CUIL del Asistente ("cuilAsistente"). Una columna con el
nombre del Asistente no se mapea a ningún campo: al Asistente se lo identifica sólo por su CUIL.
Si los días y el horario vienen juntos en una sola columna, esa columna va a "dias".

En una importación de medicación (tipo "medicacion") cada fila es un medicamento de un Paciente; la
vía de administración va a "via". En una de signos vitales de referencia (tipo "rangos_vitales")
cada fila es un signo de un Paciente con su valor mínimo, su valor máximo y su unidad. En una de
historia anterior (tipo "historia") sólo se mapean las columnas que dicen de quién es el renglón y
de qué día: el renglón entero se guarda igual, con todas sus columnas.

Además se propone "clase": sólo en el tipo "historia", qué es cada renglón de esta hoja, uno de
guardia, reporte, internacion, factura, cobro, deuda u otro; en los demás tipos queda null.

${TRATO_IA}
Alcanza a "advertencias", que se muestran en pantalla a quien subió la planilla.

Se responde únicamente con un JSON de esta forma, sin texto adicional:
{"mapeo": {"columna_del_archivo": "campo_interno_o_null", ...}, "advertencias": ["texto breve", ...], "clase": null}`;

const SYSTEM_PROMPT_LOCALIDADES = `Este asistente reescribe localidades de {{pais}} que una
Prestadora de cuidado domiciliario cargó a mano en una planilla y que el servicio oficial de
direcciones no reconoció tal como estaban escritas: abreviaturas ("Cap. Fed.", "V. Ballester",
"Gral. San Martín"), errores de tipeo, el domicilio entero en un solo casillero, o el nombre
coloquial de una zona.

Por cada pedido se devuelve el nombre oficial completo de la localidad o del barrio, del partido o
departamento y de la provincia, sin abreviaturas. Se reescribe sólo lo que está escrito: si un
pedido no dice qué localidad es, o lo escrito puede ser más de una, o no se sabe, el campo queda
vacío. Nunca se completa con una localidad probable. Lo que se devuelve se vuelve a comprobar
contra el servicio oficial, así que un nombre inventado no ayuda: hace volver la fila.

Se responde únicamente con un JSON de esta forma, sin texto adicional:
{"resultados": [{"clave": "la misma del pedido", "localidad": "", "partido": "", "provincia": "", "lugarDeTrabajo": ""}]}
"lugarDeTrabajo" se completa sólo en los pedidos que lo traen, con el nombre oficial de esa
localidad o barrio.`;

// Lo que la importación no reconoció de las localidades, reescrito por la IA. Propone y nunca
// confirma: `localidadesDeLaImportacion.js` vuelve a pasar todo por la lista y el servicio de
// direcciones. Sin clave de la IA devuelve null, y lo no reconocido vuelve con su motivo.
export function reescritorDeLocalidades({ pais, prestadoraId }) {
  const anthropic = obtenerCliente();
  if (!anthropic) return null;
  return async (pedidos) => {
    const respuesta = await anthropic.messages.create({
      model: MODELO_IA,
      max_tokens: Math.min(8000, 200 + pedidos.length * 80),
      system: SYSTEM_PROMPT_LOCALIDADES.replace('{{pais}}', pais || 'cualquier país'),
      messages: [{ role: 'user', content: JSON.stringify({ pedidos }) }],
    });
    registrarUsoIA({ prestadoraId, modulo: 'importacion_localidades', modelo: MODELO_IA, respuestaAnthropic: respuesta });
    const parseado = jsonDeRespuestaIA(respuesta);
    return Array.isArray(parseado?.resultados) ? parseado.resultados : [];
  };
}

const SYSTEM_PROMPT_GENEROS = `Este asistente lee el género de personas tal como una
Prestadora de cuidado domiciliario lo escribió a mano en una planilla, y que no se reconoció como
estaba escrito: errores de tipeo, palabras pegadas, abreviaturas, otro idioma.

Por cada pedido se devuelve uno de estos códigos: "femenino", "masculino" o "x" (no binario).
Se devuelve un código sólo cuando lo escrito no puede querer decir otra cosa. Si puede ser más de
uno, si no dice un género («otro», «no informa», «-», un nombre, un número), o si no se sabe, el
código queda vacío. Nunca se deduce el género de otra cosa que lo escrito, y nunca se completa con
el más probable: un código equivocado queda guardado en los datos de una persona.

Se responde únicamente con un JSON de esta forma, sin texto adicional:
{"resultados": [{"clave": "la misma del pedido", "codigo": ""}]}`;

// Lo que la importación no reconoció del género, leído por la IA. Propone y nunca confirma:
// `generosDeLaImportacion.js` sólo acepta un código exacto del catálogo. Sin clave de la IA
// devuelve null, y lo no reconocido vuelve con su motivo.
export function lectorDeGeneros({ prestadoraId }) {
  const anthropic = obtenerCliente();
  if (!anthropic) return null;
  return async (pedidos) => {
    const respuesta = await anthropic.messages.create({
      model: MODELO_IA,
      max_tokens: Math.min(8000, 200 + pedidos.length * 30),
      system: SYSTEM_PROMPT_GENEROS,
      messages: [{ role: 'user', content: JSON.stringify({ pedidos }) }],
    });
    registrarUsoIA({ prestadoraId, modulo: 'importacion_generos', modelo: MODELO_IA, respuestaAnthropic: respuesta });
    const parseado = jsonDeRespuestaIA(respuesta);
    return Array.isArray(parseado?.resultados) ? parseado.resultados : [];
  };
}

let cliente = null;
/** El cliente de la IA, o null si no está configurada. Lo comparten las lecturas de la importación. */
export function obtenerCliente() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!cliente) cliente = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return cliente;
}

export async function proponerMapeoIA({ tipo, headers, filasMuestra, prestadoraId }) {
  const camposDisponibles = CAMPOS_IMPORTACION[tipo];
  const anthropic = obtenerCliente();
  if (!anthropic) {
    return {
      mapeo: Object.fromEntries(headers.map((h) => [h, null])),
      advertencias: ['ia_no_configurada'],
      clase: null,
    };
  }

  const mensaje = `Tipo de importación: ${tipo}
Campos internos disponibles: ${camposDisponibles.join(', ')}
Columnas del archivo: ${headers.join(', ')}
Primeras filas de muestra (JSON): ${JSON.stringify(filasMuestra.slice(0, 5))}`;
  if (!camposDisponibles?.length) return { mapeo: {}, advertencias: [], clase: null };

  const respuesta = await anthropic.messages.create({
    model: MODELO_IA,
    max_tokens: 1000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: mensaje }],
  });

  registrarUsoIA({ prestadoraId, modulo: 'importacion', modelo: MODELO_IA, respuestaAnthropic: respuesta });

  const parseado = jsonDeRespuestaIA(respuesta);
  if (!parseado) {
    return {
      mapeo: Object.fromEntries(headers.map((h) => [h, null])),
      advertencias: ['ia_sin_mapeo'],
      clase: null,
    };
  }

  const mapeo = Object.fromEntries(
    headers.map((h) => {
      const campo = parseado.mapeo?.[h];
      return [h, camposDisponibles.includes(campo) ? campo : null];
    })
  );
  const clase = tipo === 'historia' && CLASES_DE_HOJA.includes(parseado.clase) ? parseado.clase : null;
  return { mapeo, advertencias: Array.isArray(parseado.advertencias) ? parseado.advertencias : [], clase };
}
