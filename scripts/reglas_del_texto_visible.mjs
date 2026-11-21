// ---------------------------------------------------------------------------
// reglas_del_texto_visible.mjs — las reglas de redacción que revisa el control
//
// No se corre solo: lo usa `verificar_texto_visible.mjs`. Vive aparte porque es
// la lista de reglas, y la lista es una sola para todos los textos: los de los
// archivos de traducciones, los del sitio web y los guardados en la base. Si la
// misma regla estuviera escrita dos veces, un día dirían cosas distintas.
//
// DE DÓNDE SALEN. Cada regla de esta lista es una de las marcadas «(lo revisa el
// control)» en la parte «Textos de la interfaz» del glosario de los productos
// Careonys (`celtatech/docs/GLOSARIO_PRODUCTOS_CAREONYS.md`). El nombre de cada
// regla es el que se imprime al lado de cada hallazgo, para que quien lo lea
// sepa qué regla rompió el texto sin abrir este archivo.
//
// CUANDO UNA REGLA SE EQUIVOCA con un texto que está bien escrito, se agrega una
// excepción en EXCEPCIONES, más abajo: para ese texto o para esa clave sola, con
// el motivo escrito al lado. Nunca se apaga una regla entera.
//
// LOS BORDES DE PALABRA SE ESCRIBEN A MANO, sin `\b`. Para una expresión regular,
// `\b` sólo reconoce las letras del alfabeto inglés: una palabra que termina en
// vocal con tilde —«aquí», «acá»— no tiene borde al final y no se encuentra nunca.
// ---------------------------------------------------------------------------

const IZQ = '(?<![\\p{L}\\p{N}_])';
const DER = '(?![\\p{L}\\p{N}_])';

/* Una lista de palabras o frases, cada una entera: «app» no encuentra «aplicación». */
const palabras = (...lista) => new RegExp(`${IZQ}(?:${lista.join('|')})${DER}`, 'iu');
/* Lo mismo, pero respetando mayúsculas y minúsculas. */
const palabrasExactas = (...lista) => new RegExp(`${IZQ}(?:${lista.join('|')})${DER}`, 'u');

/* El idioma de cada texto, en la forma corta que usan las reglas. */
export function idiomaCorto(idioma) {
  const base = String(idioma || '').toLowerCase().split(/[-_]/)[0];
  return ['es', 'en', 'pt'].includes(base) ? base : null;
}

// ---------------------------------------------------------------------------
// El trato: tuteo y voseo
// ---------------------------------------------------------------------------

/* Formas de tuteo que se nombran una por una, porque no siguen ninguna regla de
   terminación que se pueda reconocer sola. */
const FORMAS_DIRECTAS = [
  // Castellano — pronombres y posesivos
  'vos', 'tu', 'tus', 'ti', 'te', 'contigo', 'tuyo', 'tuya', 'tuyos', 'tuyas',
  /* Castellano — verbos irregulares que no terminan en -ás/-és/-ís. No se listan
     "das" ni "anda": en portugués son "das" (de las) y "anda junto", palabras
     corrientes que aparecen a cada rato y no tienen nada que ver con el trato. */
  'sos', 'vas', 'ves', 'oís',
  // Castellano — órdenes (imperativo de vos)
  'andá', 'mirá', 'fijate', 'acordate', 'dale', 'revisá', 'elegí', 'escribí',
  'poné', 'hacé', 'tocá', 'apretá', 'cargá', 'guardá', 'probá', 'volvé', 'sacá',
  'borrá', 'activá', 'desactivá', 'ingresá', 'completá', 'seleccioná', 'confirmá',
  'verificá', 'contá', 'pedí', 'abrí', 'cerrá', 'agregá', 'sumá', 'enviá', 'marcá',
  'usá', 'dejá', 'esperá', 'seguí', 'buscá', 'llená', 'avisá', 'mandá', 'subí',
  // Portugués — pronombres y posesivos informales
  'teu', 'tua', 'teus', 'tuas',
  // Portugués — el trato que obliga a adivinar el género de quien lee
  'o senhor', 'a senhora', 'ao senhor', 'à senhora',
];

/* El guion también corta: en portugués el infinitivo con pronombre pegado se acentúa
   igual que una orden en voseo —"marcá-lo", "revisá-la", "ativá-la"— y es correcto. */
const DER_SIN_GUION = '(?![\\p{L}\\p{N}_-])';
const RE_DIRECTAS = new RegExp(`${IZQ}(${FORMAS_DIRECTAS.join('|')})${DER_SIN_GUION}`, 'giu');

/* La regla de terminación: en castellano, casi todo el presente del voseo termina
   en -ás, -és o -ís (tenés, podés, querés, sabés, decís, escribís, estás). Es la
   red que atrapa las formas que no están en la lista de arriba. */
const RE_TERMINACION = new RegExp(`${IZQ}(\\p{L}{2,}(?:ás|és|ís))${DER_SIN_GUION}`, 'giu');

/* Palabras que terminan igual y no son tuteo. Cada una está acá porque el colador
   la marcó alguna vez y no correspondía. */
const TERMINACION_PERMITIDA = new Set([
  'más', 'además', 'jamás', 'quizás', 'atrás', 'detrás', 'demás', 'compás', 'gas',
  'después', 'inglés', 'francés', 'portugués', 'interés', 'cortés', 'revés', 'través',
  'mes', 'país', 'raíz', 'anís', 'gris', 'aprés',
]);

const sinAcentos = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/* Las formas de tuteo de un texto, sin mirar si el texto es una frase. */
function formasDeTuteo(texto) {
  const encontradas = new Set();
  RE_DIRECTAS.lastIndex = 0;
  for (const m of texto.matchAll(RE_DIRECTAS)) encontradas.add(m[1].toLowerCase());
  RE_TERMINACION.lastIndex = 0;
  for (const m of texto.matchAll(RE_TERMINACION)) {
    const palabra = m[1].toLowerCase();
    if (TERMINACION_PERMITIDA.has(palabra) || TERMINACION_PERMITIDA.has(sinAcentos(palabra))) continue;
    encontradas.add(palabra);
  }
  return [...encontradas];
}

/* Un texto entre comillas de un archivo de código puede ser una frase o un valor
   del sistema ('created_at', 'pending'). Sólo se revisa si parece una frase. */
export function pareceFraseParaLeer(texto) {
  if (texto.trim().split(/\s+/).length < 2) return false; // una sola palabra: es un valor
  if (/^[a-z0-9_.\-/]+$/.test(texto)) return false; //        clave técnica o ruta
  return /\p{L}{3,}/u.test(texto);
}

/* El tuteo de un texto suelto de un archivo de código, donde no se sabe de antemano
   qué es frase y qué es código. La usa la revisión de los archivos sueltos. */
export function tuteosEnElTexto(texto) {
  return pareceFraseParaLeer(texto) ? formasDeTuteo(texto) : [];
}

// ---------------------------------------------------------------------------
// Qué textos son títulos, botones, etiquetas u opciones de menú
// ---------------------------------------------------------------------------

/* Se decide por el nombre del texto. Cuenta sólo la última parte del nombre:
   «configuracion.moneda_titulo» es un título, «nav.inactividad_aviso» no. Lo que
   está debajo de «errores» es siempre un mensaje, aunque su nombre diga «titulo»:
   «errores.motivos.titulo_de_contenido_repetido» es el error que avisa que un
   título ya está en uso. */
const ULTIMA_PARTE_DE_TITULO =
  /^(titulo|title|boton|btn|etiqueta|label|col|columna|menu|tab|encabezado)(_|$)|_(titulo|title|boton|btn|etiqueta|label|col|columna|tab|encabezado)$/;

/* En la base, las columnas cuyo texto se muestra como título, etiqueta u opción de una
   lista. El nombre que llega es «tabla.columna:fila». */
const COLUMNAS_QUE_SON_TITULOS = new Set([
  'textos_consentimiento.titulo',
  'tipos_asistente.nombre',
  'etapas_incorporacion_asistente.nombre',
  'tipos_documento_asistente.nombre',
  'tipos_documento_pagador.nombre',
  'especialidades.nombre',
  'conceptos_liquidacion.nombre',
  'lista_de_comprobacion_baja_servicio.nombre',
  'motivos_aviso_previo_turno_guardia.nombre',
  'motivos_cierre_servicio.nombre',
  'motivos_reactivacion_servicio.nombre',
  'motivos_resolucion.nombre_es_ar',
  'motivos_resolucion.nombre_en',
  'motivos_resolucion.nombre_pt_br',
  'motivos_sustitucion_turno_guardia.nombre',
  'formas_de_cobro_intermediacion.nombre',
  'relaciones_laborales.nombre',
  'finales_turno_guardia_sin_cubrir.nombre',
  'opciones_postulacion.etiqueta',
  'contenidos.titulo',
  'catalogo_software_externo.nombre',
  'indices_de_actualizacion.nombre',
  'organismos_otorgantes.nombre',
  'listas_de_opciones.i18n',
  'opciones_de_lista.i18n',
  'formulario_campos.etiqueta',
  'formulario_secciones.titulo',
  'formularios_declarados.titulo',
]);

export function esTituloPorClave(clave) {
  if (!clave) return false;
  const columna = clave.split(':')[0];
  if (COLUMNAS_QUE_SON_TITULOS.has(columna)) return true;
  if (clave.includes(':')) return false; // otra columna de la base: no es título
  const partes = clave.replace(/\[\d+\]/g, '').split('.');
  if (partes.includes('errores') || partes.includes('errors')) return false;
  return ULTIMA_PARTE_DE_TITULO.test(partes.at(-1));
}

// ---------------------------------------------------------------------------
// Las reglas
// ---------------------------------------------------------------------------

/* Cada regla tiene un nombre en castellano y su patrón por idioma (`es`, `en`, `pt`),
   o `todos` si vale igual en los tres, o una `prueba` propia. Un idioma sin patrón
   no se revisa con esa regla. `soloTitulos` la aplica sólo a títulos, botones,
   etiquetas y opciones de menú. `crudo` la prueba sobre el texto tal como está, con
   sus marcadores; las demás, sobre el texto con cada marcador reemplazado por una x. */
export const REGLAS = [
  {
    id: 'verbos',
    nombre: 'Verbo de acción no aprobado: Sacar, Eliminar, Habilitar, Deshabilitar o Aceptar',
    es: palabras(
      'sac(?:ar|a|an|ó|ado|ada|ados|adas)', 'saque', 'saquen',
      'elimin(?:ar|a|an|e|en|ó|ado|ada|ados|adas|ación)',
      'habilit(?:ar|a|an|e|en|ó|ado|ada|ados|adas)',
      'deshabilit(?:ar|a|an|e|en|ó|ado|ada|ados|adas)',
      'aceptar', 'acepte', 'acepten',
    ),
  },
  {
    id: 'listo_ok',
    nombre: 'Botón «Listo» u «OK»',
    prueba: (t) => (/^(?:listo|ok)[.!]?$/i.test(t.trim()) ? t.trim() : null),
  },
  {
    id: 'nunca_decir',
    nombre: 'Palabra de la columna «Nunca decir» del glosario',
    es: palabras(
      'licenciatarias?', 'empresas? clientes?', 'empresas? usuarias?', 'organizaci(?:ón|ones) comercial(?:es)?',
      'contratistas?', 'la cooperativa', 'clientes? contratantes?', 'ficheros?', 'base de clientes',
      'lista de clientes', 'legajo del cliente', 'registro del cliente', 'perfil del cliente',
      'detalle del cliente', 'ficha de persona', 'ficha individual', 'sexo', 'responsables? legal(?:es)?',
      'financiador(?:es|a|as)?', 'adultos? mayor(?:es)?', 'círculo de cuidado', 'leads?', 'prospects?',
      'papel firmado', 'hoja firmada', 'emplead[oa]s?', 'trabajador(?:a|es|as)?', 'plantel',
      'base de asistentes', 'número de ficha', 'jef[ea]s?', 'encargad[oa]s?', 'coordinador principal',
      'jefe de coordinación', 'supervisor general', 'comodín', 'pipeline', 'reclutador(?:es|a|as)?',
      'jefe de personal', 'evaluador(?:es|a|as)?', 'examinador(?:es|a|as)?', 'diplomas?', 'compliance',
      'cumplimiento normativo', 'ficha del servicio', 'legajo del servicio', 'guardias? ofrecidas?',
      'turnos? ofrecidos?', 'fichar', 'marcar tarjeta', 'turnos? abiertos?', 'cierre trabado',
      'renuncia al turno', 'horas perdidas', 'horas faltantes', 'ficha médica', 'legajo médico',
      'medicación habitual', 'orden(?:es)? médicas?', 'packs?', 'mostrador', 'estatus', 'dashboards?',
      'home', 'posteos?', 'cron', 'jobs?', 'lookup', 'passwords?', 'credencial(?:es)?', 'passkeys?',
      'enlace de alta', 'token de activación', 'enlace de recuperación', 'recuperar la contraseña',
      '(?<!palabra\\s)claves?(?!\\s+fiscal)',
    ),
    en: palabras('file numbers?'),
  },
  {
    id: 'palabra_corta',
    nombre: 'Palabra larga donde alcanza la corta y común',
    es: palabras(
      /* «solicitud» es sustantivo: la regla habla del verbo «solicitar». */
      'utiliz\\p{L}*', 'solicit(?:ar|a|an|e|en|ó|ado|ada|ados|adas|ando)', 'requier\\p{L}*', 'proporcion(?:a|an|e|en|ar|ó)', 'suministr\\p{L}*',
      'sin embargo', 'no obstante', 'acerca de', 'asimismo', 'a fin de',
    ),
    en: palabras('leverage\\p{L}*', 'in order to', 'however', 'regarding', 'furthermore'),
    pt: palabras('utiliz\\p{L}*', 'solicit(?:ar|a|am|e|em|ou|ado|ada|ados|adas|ando)', 'fornec\\p{L}*', 'no entanto', 'todavia', 'a respeito de', 'além disso', 'a fim de'),
  },
  {
    id: 'relleno',
    nombre: 'Palabra de relleno',
    es: palabras('fácilmente', 'simplemente', 'sencillamente', 'realmente'),
    en: palabras('easily', 'simply', 'really'),
    pt: palabras('facilmente', 'simplesmente', 'realmente'),
  },
  {
    id: 'causa',
    nombre: 'Causa con «ya que», «dado que», «puesto que» o «debido a que», en vez de «porque»',
    es: palabras('ya que', 'dado que', 'puesto que', 'debido a que'),
    pt: palabras('já que', 'dado que', 'visto que'),
  },
  {
    id: 'tiempo_compuesto',
    nombre: 'Tiempo compuesto en vez de simple',
    es: palabras('(?:ha|han|hemos|había|habían)\\s+\\p{L}+(?:ado|ido|to|so|cho)s?'),
    /* En portugués «tem» también es «tiene»: «não tem certificado» está bien. Sólo cuenta
       el auxiliar delante de un participio que no puede ser un sustantivo. */
    pt: palabras('(?:tem|têm|tinha|tinham)\\s+(?:sido|estado|feito|tido|havido)'),
  },
  {
    id: 'queismo',
    nombre: 'Falta el «de»: «asegúrese de que», «acuérdese de que»',
    es: palabras('asegúrese que', 'acuérdese que', 'asegurarse que'),
  },
  {
    id: 'ingles',
    nombre: 'Palabra en inglés que tiene palabra en castellano',
    es: palabras('e-?mails?', 'push', 'apps?', 'ranking', 'roster'),
  },
  {
    id: 'o_sea',
    nombre: '«o sea», «es decir», «i. e.», «etc.» o «p. ej.»',
    es: new RegExp(`${IZQ}(?:o sea|es decir|i\\.\\s?e\\.|etc\\.?|p\\.\\s?ej\\.?)(?!\\p{L})`, 'iu'),
    en: new RegExp(`${IZQ}(?:i\\.\\s?e\\.|e\\.\\s?g\\.|etc\\.?)(?!\\p{L})`, 'iu'),
    pt: new RegExp(`${IZQ}(?:ou seja|isto é|etc\\.?)(?!\\p{L})`, 'iu'),
  },
  {
    id: 'lo_adjetivo',
    nombre: '«lo» delante de un adjetivo en vez del sustantivo',
    es: new RegExp(
      `${IZQ}lo\\s+(?!(?:que|antes|más|mismo|siento|sentimos)${DER})\\p{L}+(?:ado|ido|ada|ida|ados|idos|al|ble|ivo|ente|ante)${DER}`,
      'iu',
    ),
  },
  {
    id: 'pasiva',
    nombre: 'Pasiva con «fue» o «fueron»',
    es: palabras('(?:fue|fueron)\\s+(?:\\p{L}+(?:ad|id)[oa]s?|escrit[oa]s?|hech[oa]s?|puest[oa]s?|vist[oa]s?|dich[oa]s?|abiert[oa]s?|cubiert[oa]s?|resuelt[oa]s?|devuelt[oa]s?)'),
  },
  {
    id: 'dubitativa',
    nombre: 'Construcción dubitativa: «conviene», «sería bueno que», «hace falta», «habría que», «debería»',
    es: palabras('convienen?', 'sería bueno que', 'hace falta', 'habría que', 'debería(?:n|mos)?'),
  },
  {
    id: 'tuteo',
    nombre: 'Tuteo o voseo',
    prueba: (t) => {
      const formas = formasDeTuteo(t);
      return formas.length ? formas.join(', ') : null;
    },
  },
  {
    id: 'vosotros',
    nombre: '«vosotros» en vez de «ustedes»',
    es: palabras('vosotr[oa]s', 'vuestr[oa]s?'),
    pt: palabras('vós'),
  },
  {
    id: 'nosotros',
    nombre: 'Habla en nombre del sistema o de la empresa («nosotros»)',
    es: palabras('nosotr[oa]s', 'pudimos', 'podemos', 'estamos', 'tenemos', 'hemos', 'vamos a', 'le enviamos', 'nuestr[oa]s?'),
    en: palabras('we', "we're", "we've", "we'll", 'our', 'ours', 'us'),
    pt: palabras('nós', 'noss[oa]s?', 'podemos', 'estamos', 'temos', 'vamos'),
  },
  {
    id: 'mi',
    nombre: '«mi» o «mis»',
    es: palabras('mi', 'mis'),
    en: palabras('my'),
    pt: palabras('meu', 'minha', 'meus', 'minhas'),
  },
  {
    id: 'exclamacion',
    nombre: 'Signo de exclamación',
    todos: /[!¡]/u,
  },
  {
    id: 'atencion',
    nombre: '«Atención» como aviso',
    /* Cuenta sólo cuando la palabra es el texto entero o lleva dos puntos o exclamación:
       «sin atención» habla del cuidado y «Warning shown» nombra una columna. */
    es: new RegExp(`^\\s*¡?atención\\s*[.!:]?\\s*$|${IZQ}atención\\s*[:!]`, 'iu'),
    en: new RegExp(`^\\s*(?:attention|warning)\\s*[.!:]?\\s*$|${IZQ}(?:attention|warning)\\s*[:!]`, 'iu'),
    pt: new RegExp(`^\\s*atenção\\s*[.!:]?\\s*$|${IZQ}atenção\\s*[:!]`, 'iu'),
  },
  {
    id: 'interjeccion',
    nombre: 'Interjección',
    es: palabras('uy', 'ups', 'oh', 'ay'),
    en: palabras('oops', 'whoops', 'uh-oh'),
    pt: palabras('ops', 'opa', 'eita'),
  },
  {
    id: 'cortesia',
    nombre: '«por favor», «lo sentimos», «perdón» o «disculpe»',
    es: palabras('por favor', 'lo sentimos', 'perdón', 'disculpe(?:n)?'),
    en: palabras('please', 'sorry', 'we apologi[sz]e'),
    pt: palabras('por favor', 'desculpe', 'lamentamos'),
  },
  {
    id: 'mayuscula_dia_mes_idioma',
    nombre: 'Día, mes o idioma con mayúscula en medio de la oración',
    /* «En medio de la oración» es después de una palabra en minúscula, un número o una
       coma. A principio de texto o después de un punto, la mayúscula es correcta. */
    es: new RegExp(
      `(?<=[\\p{Ll}\\p{N},;]\\s)(?:Lunes|Martes|Miércoles|Jueves|Viernes|Sábado|Domingo|Enero|Febrero|Marzo|Abril|Mayo|Junio|Julio|Agosto|Septiembre|Setiembre|Octubre|Noviembre|Diciembre|Español|Castellano|Inglés|Portugués)${DER}`,
      'u',
    ),
    pt: new RegExp(
      `(?<=[\\p{Ll}\\p{N},;]\\s)(?:Segunda-feira|Terça-feira|Quarta-feira|Quinta-feira|Sexta-feira|Sábado|Domingo|Janeiro|Fevereiro|Março|Abril|Maio|Junho|Julho|Agosto|Setembro|Outubro|Novembro|Dezembro|Português|Inglês|Espanhol)${DER}`,
      'u',
    ),
  },
  {
    id: 'titulo_puntuacion',
    nombre: 'Título, botón, etiqueta u opción de menú con punto final, dos puntos o artículo al principio',
    soloTitulos: true,
    prueba: (t, idioma) => {
      const s = t.trim();
      if (/:$/.test(s)) return 'termina en dos puntos';
      if (/[^.]\.$/.test(s) && !/(?:etc|S\.A)\.$/i.test(s)) return 'termina en punto';
      /* En portugués «O que…» es un pronombre y «A receber» una preposición con un verbo:
         ninguno de los dos es un artículo. */
      const articulo = {
        es: /^(?:El|La|Los|Las|Un|Una|Unos|Unas)\s/u,
        en: /^(?:The|A|An)\s/u,
        pt: /^(?:(?:O|Os)\s(?!qu)|(?:A|As)\s(?!qu|\p{L}+[aei]r(?!\p{L}))|(?:Um|Uma|Uns|Umas)\s)/u,
      }[idioma];
      if (articulo && articulo.test(s)) return `empieza con «${s.split(/\s/)[0]}»`;
      return null;
    },
  },
  {
    id: 'clic',
    nombre: '«haga clic», «clic en» o «toque» en vez de «elija»',
    es: palabras('haga clic', 'hacer clic', 'clic en', 'cliquee', 'toque'),
    en: palabras('click', 'clicks', 'clicking', 'tap', 'tapping'),
    pt: palabras('clique', 'cliques', 'clicar', 'toque', 'tocar em'),
  },
  {
    id: 'tildar',
    nombre: '«tildar» en vez de «marcar»',
    /* «tilde» sola no entra: también es el acento escrito. */
    es: palabras('tild(?:ar|en|ó|ado|ada|ados|adas|ando)', 'destild\\p{L}*'),
    en: palabras('tick', 'ticks', 'untick\\p{L}*'),
  },
  {
    id: 'lugar',
    nombre: 'Indicación de lugar: «arriba», «abajo», «a la izquierda», «a la derecha», «acá», «aquí»',
    /* «de 100 para arriba» y «redondear hacia abajo» hablan de cantidades, no de un lugar
       de la pantalla. «above 90» y «abaixo de 90», tampoco. «De acá en adelante» habla
       de tiempo. */
    es: new RegExp(`${IZQ}(?:(?<!(?:para|hacia)\\s)(?:arriba|abajo)|a la izquierda|a la derecha|(?:acá|aquí)(?!\\s+en\\s+adelante))${DER}`, 'iu'),
    en: new RegExp(`${IZQ}(?:(?:above|below)(?!\\s+\\d)|on the left|on the right|here)${DER}`, 'iu'),
    pt: new RegExp(`${IZQ}(?:(?:acima|abaixo)(?!\\s+(?:de\\s+)?\\d)|à esquerda|à direita|aqui)${DER}`, 'iu'),
  },
  {
    id: 'enlace',
    nombre: 'Texto de enlace que no dice adónde lleva',
    es: palabras('este enlace', 'más información', 'ver más'),
    en: palabras('this link', 'learn more', 'read more', 'see more', 'more info'),
    pt: palabras('este link', 'saiba mais', 'leia mais', 'ver mais'),
  },
  {
    id: 'correo_mayuscula',
    nombre: 'Dirección de correo o web con mayúscula',
    todos: /[^\s@]*\p{Lu}[^\s@]*@[^\s]+|[^\s@]+@[^\s]*\p{Lu}[^\s]*|https?:\/\/[^\s]*\p{Lu}[^\s]*/u,
  },
  {
    id: 'error_generico',
    nombre: 'Error genérico que no dice el dato concreto',
    prueba: (t, idioma) => {
      const s = t.trim().replace(/[.!]+$/, '').toLowerCase();
      const frases = {
        es: ['archivo no encontrado', 'algo salió mal', 'dato incorrecto', 'valor incorrecto', 'ocurrió un error'],
        en: ['file not found', 'something went wrong', 'invalid input', 'an error occurred'],
        pt: ['arquivo não encontrado', 'algo deu errado', 'ocorreu um erro'],
      }[idioma] || [];
      return frases.includes(s) ? t.trim() : null;
    },
  },
  {
    id: 'palabra_de_error',
    nombre: '«inválido», «ilegal», «prohibido», «olvidó», «fatal» o «abortar»',
    es: palabras('inválid[oa]s?', 'ilegal(?:es)?', 'prohibid[oa]s?', 'olvidó', 'fatal(?:es)?', 'abort(?:ar|ó|ado|ada)'),
    en: palabras('invalid', 'illegal', 'forbidden', 'forgot', 'fatal', 'abort(?:ed|ing)?'),
    pt: palabras('inválid[oa]s?', 'ilega(?:l|is)', 'proibid[oa]s?', 'esqueceu', 'fata(?:l|is)', 'abort(?:ar|ou|ado|ada)'),
  },
  {
    id: 'campo_obligatorio',
    nombre: '«Este campo es obligatorio» o «Complete el campo» en vez del dato que falta',
    es: palabras('este campo es obligatorio', 'complete (?:el|este) campo'),
    en: palabras('this field is required'),
    pt: palabras('este campo é obrigatório', 'preencha (?:o|este) campo'),
  },
  {
    id: 'esta_seguro',
    nombre: '«¿Está seguro?» en vez de la pregunta con el verbo de la acción',
    es: /¿\s*está\s+segur[oa]/iu,
    en: palabras('are you sure'),
    pt: palabras('tem certeza'),
  },
  {
    id: 'exito',
    nombre: '«correctamente», «exitosamente», «con éxito» o «éxito»',
    es: palabras('correctamente', 'exitosamente', 'con éxito', 'éxito'),
    en: palabras('successfully', 'success'),
    pt: palabras('com sucesso', 'sucesso', 'corretamente'),
  },
  {
    id: 'cero_delante',
    nombre: 'Falta el cero delante de la coma: «0,5»',
    todos: /(?:^|\s)[,.]\d/u,
  },
  {
    id: 'fecha',
    nombre: 'Fecha con el mes en número o el año en dos cifras, o día con número ordinal',
    es: /(?<!\d)\d{1,2}\/\d{1,2}\/\d{2}(?!\d)|(?<!\d)\d{1,2}\.?º\s+de\s/u,
    en: new RegExp(`(?<!\\d)\\d{1,2}\\/\\d{1,2}\\/\\d{2}(?!\\d)|(?<!\\d)\\d{1,2}(?:st|nd|rd|th)${DER}`, 'u'),
    /* En portugués el primer día del mes se escribe con ordinal, «1º de maio», y es
       correcto. Los demás, no. */
    pt: /(?<!\d)\d{1,2}\/\d{1,2}\/\d{2}(?!\d)|(?<!\d)(?:[2-9]|[1-3]\d)\.?º\s+de\s/u,
  },
  {
    id: 'estacion',
    nombre: 'Estación del año para ubicar una fecha',
    es: palabras('verano', 'otoño', 'invierno', 'primavera'),
    en: palabras('summer', 'autumn', 'winter'),
    pt: palabras('verão', 'outono', 'inverno', 'primavera'),
  },
  {
    id: 'millones',
    nombre: '«M» o «MM» en vez de «millones»',
    es: /\d\s?(?:MM|M|mill\.)(?![\p{L}])/u,
    en: /\d\s?(?:m|bn)(?![\p{L}])/u,
    pt: /\d\s?(?:mi|bi)(?![\p{L}])/u,
  },
  {
    id: 'por_ciento',
    nombre: '«por ciento» en vez de «%»',
    es: palabras('por ciento'),
    en: palabras('percent'),
    pt: palabras('por cento'),
  },
  {
    id: 'signos',
    nombre: '«&», «+» o «~» en vez de «y», «más» o «aproximadamente»',
    todos: /&|\s\+\s|~\s?\d/u,
  },
  {
    id: 'raya',
    nombre: 'Raya larga (—)',
    todos: /—/u,
  },
  {
    id: 'espacios',
    nombre: 'Espacio antes de los puntos suspensivos, dos espacios seguidos o espacio adentro de un paréntesis',
    todos: /[^\s] (?:…|\.\.\.)|[^\s] {2,}[^\s]|\( | \)/u,
  },
  {
    id: 'sigla',
    nombre: 'Sigla con «s» de plural o con puntos',
    es: /(?<![\p{L}\p{N}])\p{Lu}{2,}s(?![\p{L}\p{N}])|(?<![\p{L}])(?:\p{Lu}\.){2,}/u,
    en: /(?<![\p{L}])(?:\p{Lu}\.){2,}/u,
    pt: /(?<![\p{L}])(?:\p{Lu}\.){2,}/u,
  },
  {
    id: 'marcador_sin_nombre',
    nombre: 'Marcador sin nombre: «%s» o «{0}»',
    crudo: true,
    todos: /%[sd]|\{\d+\}/u,
  },
  {
    id: 'plural_a_mano',
    nombre: 'Plural escrito a mano: «turno(s)» o «si es 1»',
    crudo: true,
    todos: /\p{L}\((?:s|es)\)/u,
    es: /\p{L}\((?:s|es)\)|si es 1(?!\d)/u,
  },
];

/* `palabrasExactas` queda disponible para una regla que necesite distinguir
   mayúsculas; hoy las que lo necesitan escriben su expresión entera. */
void palabrasExactas;

// ---------------------------------------------------------------------------
// Excepciones: un texto o una clave concreta, con su motivo
// ---------------------------------------------------------------------------

/* Cada excepción nombra la regla que exceptúa y, o bien la clave exacta del texto
   (`clave`), o bien el texto exacto (`texto`). La clave de la base es
   «tabla.columna:fila». Ninguna excepción apaga una regla entera. */
export const EXCEPCIONES = [
  {
    regla: 'verbos',
    clave: 'configuracion.ubicacion_dias',
    motivo:
      'Es el plazo que tiene el Asistente para aceptar que se registre su ubicación, algo que se le ofrece: ' +
      'el glosario permite «aceptar» cuando la persona acepta algo que le ofrecen.',
  },
  {
    regla: 'palabra_de_error',
    clave: 'tareas_asistente.clase_prohibida',
    motivo: '«Prohibidas» es el nombre aprobado de una de las tres clases de tarea del glosario.',
  },
  ...[
    'errores.motivos.tarea_prohibida_bloquea',
    'configuracion.tareas_especialidad_error_tarea_prohibida',
    'modalidades.error_tarea_prohibida',
    'turnos_guardia.cobertura_panel.motivo_tarea_prohibida',
  ].map((clave) => ({
    regla: 'palabra_de_error',
    clave,
    motivo: 'Nombra la clase «Prohibidas» del glosario: una tarea prohibida para ese tipo de Asistente.',
  })),
  {
    regla: 'verbos',
    clave: 'tareas_asistente.clase_habilitada',
    motivo: '«Habilitadas» es el nombre aprobado de una de las tres clases de tarea del glosario.',
  },
  {
    regla: 'verbos',
    clave: 'asignaciones.aceptar',
    motivo: 'El Asistente acepta un turno que le ofrecen: el glosario permite «Aceptar» ahí.',
  },
  {
    regla: 'verbos',
    clave: 'errores.motivos.documentos_bloquean',
    motivo: 'Habla de aceptar un turno ofrecido: el glosario permite «aceptar» ahí.',
  },
  {
    regla: 'verbos',
    clave: 'turnos_guardia.confirmar_asignacion.mover_con_asistente',
    motivo: 'El Asistente tiene que aceptar el turno nuevo que se le ofrece: el glosario permite «aceptar» ahí.',
  },
  ...['turno_guardia_para_responder.cuerpo', 'turno_guardia_fijo_para_responder.cuerpo', 'reemplazo_para_responder.cuerpo', 'reemplazo_para_responder.cuerpo_sin_fin'].map((fila) => ({
    regla: 'verbos',
    clave: `mensajes_del_sistema.i18n:${fila}`,
    motivo: 'El Asistente acepta o rechaza un turno que le ofrecen: el glosario permite «Aceptar» ahí.',
  })),
  {
    regla: 'mi',
    clave: 'textos_consentimiento.cuerpo:AR / autorizacion_signos_vitales / v1',
    motivo: 'Es la autorización que firma el titular, en primera persona: «mi carácter» es de quien firma, no del sistema.',
  },
  ...['La Rioja', 'La Pampa'].map((texto) => ({
    regla: 'titulo_puntuacion',
    texto,
    motivo: 'Es el nombre de una provincia: «La» es parte del nombre propio, no un artículo agregado.',
  })),
  {
    regla: 'atencion',
    clave: 'alertas.nivel_amarilla',
    motivo: '«Atención» es el nombre aprobado del nivel amarillo de una alerta.',
  },
];

/* El texto que la persona acepta en su propio nombre habla en primera persona —«Acepto
   los términos», «Autorizo el uso de mis datos»— y ahí «mi» y «nosotros» son de ella,
   no del sistema. El glosario lo exceptúa con esas palabras. */
const HABLA_LA_PERSONA = /^\s*(?:acepto|autorizo|declaro|doy mi|i accept|i agree|i authorize|i declare|aceito|autorizo|declaro|concordo)(?![\p{L}])/iu;
const REGLAS_DE_LA_PRIMERA_PERSONA = new Set(['mi', 'nosotros']);

function exceptuado(regla, texto, clave) {
  if (REGLAS_DE_LA_PRIMERA_PERSONA.has(regla) && HABLA_LA_PERSONA.test(texto)) return true;
  const recortado = texto.trim();
  return EXCEPCIONES.some((e) => e.regla === regla && ((e.clave && e.clave === clave) || (e.texto && e.texto === recortado)));
}

// ---------------------------------------------------------------------------
// El punto único: qué reglas rompe un texto
// ---------------------------------------------------------------------------

/* Un marcador —«{asistente}», «{{producto}}»— es el lugar donde el programa pone un
   dato. Para las reglas de redacción se lo reemplaza por una x, así su nombre no se
   lee como palabra de la frase. */
const RE_MARCADOR = /\{\{?\s*[\p{L}_][\p{L}\p{N}_.]*\s*\}?\}/gu;

/* Devuelve la lista de reglas que rompe el texto: [{ id, nombre, encontrado }].
   Vacía si el texto está bien. `idioma` es «es-AR», «en» o «pt-BR» (o su forma
   corta). `clave` es el nombre del texto, y decide si es un título y si tiene
   alguna excepción. */
export function reglasRotasEnElTexto(texto, idioma, clave = '') {
  if (typeof texto !== 'string' || !texto.trim()) return [];
  const corto = idiomaCorto(idioma);
  const limpio = texto.replace(RE_MARCADOR, 'x');
  const titulo = esTituloPorClave(clave);
  const rotas = [];

  for (const regla of REGLAS) {
    if (regla.soloTitulos && !titulo) continue;
    const objetivo = regla.crudo ? texto : limpio;
    let encontrado = null;
    if (regla.prueba) {
      encontrado = regla.prueba(objetivo, corto);
    } else {
      const patron = (corto && regla[corto]) || regla.todos;
      const m = patron ? objetivo.match(patron) : null;
      if (m) encontrado = m[0].trim() || m[0];
    }
    if (!encontrado || exceptuado(regla.id, texto, clave)) continue;
    rotas.push({ id: regla.id, nombre: regla.nombre, encontrado });
  }
  return rotas;
}
