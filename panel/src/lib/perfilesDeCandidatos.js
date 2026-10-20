// Punto único de verdad de CÓMO PESA CADA COSA al ordenar candidatos para un hueco.
// ============================================================================
//
// QUÉ HAY ACÁ. Los números que usa `candidatos.js` para ordenar la lista: cuánto suma haber
// atendido antes a ese Paciente, cuánto resta vivir lejos, cuántas horas semanales son
// demasiadas. Estaban escritos adentro de `candidatos.js`, y ahí eran iguales para toda
// Prestadora. La Prestadora decide y configura, nunca al revés: acá están los valores de fábrica
// y las tres formas armadas de correrlos, y la configuración de cada Prestadora manda sobre
// los dos.
//
// POR QUÉ ESTÁ SEPARADO DE `candidatos.js`. Porque el backend también tiene que conocerlos —es el
// que recibe lo que la Prestadora guarda y tiene que comprobar que sea un número razonable— y
// `candidatos.js` arrastra media docena de archivos del Panel. Éste no arrastra nada: se copia
// entero al backend (`scripts/copias_entre_apps.mjs`). `candidatos.js` los vuelve a exportar, así
// que quien los importaba de allá los sigue encontrando.
//
// LO QUE NO SE CONFIGURA, Y POR QUÉ. Los cinco motivos que bloquean —ya tiene otra guardia, tiene
// una ausencia cargada, le falta la Matrícula o está vencida o sin comprobar, no trabaja en esa
// modalidad— y el interruptor de "no disponible" no están acá. Esos números no deciden nada: el
// bloqueo ya lo decidió otra cosa, y el −1000 solamente los manda al fondo de la lista. Dejarlos
// tocar sería ofrecer una perilla que no hace nada, o peor, una con la que se puede subir a la
// cabeza de la lista a alguien que no puede tomar la guardia.
//
// Y TAMPOCO ESTIRAR UN HORARIO. Un perfil ordena la lista de candidatos y nada más. Estirar el
// turno de alguien que ya está adentro es una decisión de la Coordinadora, caso por caso, ante un
// problema puntual. Nunca una norma que se deje configurada.

// Con extensión a propósito: este archivo se copia tal cual al backend, que corre en Node y ahí la
// ruta sin extensión no resuelve.
import { DIAS_AVISO_POR_DEFECTO } from './reglaVencimientos.js';

/**
 * Cuánto suma o resta cada criterio. Valores de fábrica.
 *
 * La escala está pensada para que **la continuidad gane**. Para el Paciente y su Cliente, que
 * venga alguien que ya conocen vale más que cualquier otra comodidad de la agenda: tres guardias
 * previas con ese Paciente pesan más que todo lo demás a favor sumado.
 */
const CONTINUIDAD_POR_VEZ_DE_FABRICA = 12;
const VECES_DE_CONTINUIDAD_DE_FABRICA = 5;

export const PESOS = {
  /** Por cada vez que ya atendió a este Paciente. */
  continuidad_por_vez: CONTINUIDAD_POR_VEZ_DE_FABRICA,
  /**
   * Tope de la continuidad: a partir de acá, más veces ya no mueven la aguja. No se configura
   * como puntaje: sale de multiplicar las veces que cuentan (`TOPES.continuidad_veces_maxima`)
   * por lo que suma cada vez, y lo recalcula `pesosYTopesDe`.
   */
  continuidad_maxima: VECES_DE_CONTINUIDAD_DE_FABRICA * CONTINUIDAD_POR_VEZ_DE_FABRICA,
  /** Nunca lo atendió. Resta poco: no es un problema, es solo que no hay nada a favor. */
  sin_continuidad: -5,

  /** No tiene ninguna guardia que se pise con esta. */
  libre: 10,
  /** Ya tiene una guardia encima. Bloquea igual; el número es para que quede al fondo. */
  ocupado: -1000,

  /**
   * Tiene una ausencia registrada que cubre la fecha de la guardia. Bloquea igual que estar
   * ocupado y resta lo mismo por el mismo motivo: el número no decide nada —el bloqueo ya está
   * decidido—, solo la manda al fondo para que no se mezcle con quienes sí pueden tomarla.
   */
  ausencia: -1000,

  /** Tiene la Matrícula que su tipo le exige, vigente y comprobada. */
  matricula_ok: 8,
  /** La tiene bien, pero está por vencerse. Resta y se avisa; no bloquea. */
  matricula_vence: -10,
  /**
   * Los tres motivos que sí bloquean. Restan lo mismo que estar ocupado y por el mismo motivo:
   * el número no decide nada —el bloqueo ya lo decidió la base—, solo los manda al fondo de la
   * lista para que no se mezclen con los que sí pueden tomar la guardia.
   */
  matricula_falta: -1000,
  matricula_vencida: -1000,
  matricula_sin_verificar: -1000,

  /**
   * El Asistente no trabaja en la modalidad de esta guardia. Bloquea, y resta lo mismo que los
   * demás bloqueos por el mismo motivo: el número no decide nada, solo lo manda al fondo.
   */
  modalidad_distinta: -1000,

  /**
   * El Asistente puso su interruptor en "no disponible"
   * (`asistentes.disponible`). Resta como un bloqueo **pero no bloquea**, y esa
   * diferencia es toda la regla: en esta lista decide una persona, que puede saber algo que el
   * sistema no sabe —que hablaron ayer, que lo apagó por una semana que ya terminó—. Queda al
   * fondo de los que sí se pueden proponer, con el motivo a la vista. Donde no hay nadie
   * leyendo, la fase automática de la escalada de relevo, ahí sí se respeta sin preguntar.
   */
  no_disponible: -1000,

  papeles_ok: 5,
  papeles_vencen: -10,

  /**
   * Vive cerca de la casa del Paciente. Suma parecido a estar libre y bastante menos que la
   * continuidad, a propósito: la cuenta es en línea recta y no sabe nada del tránsito, del
   * colectivo ni del río que puede haber en el medio. Es una ayuda para ordenar la lista, no
   * un veredicto.
   */
  cerca: 10,
  /** Vive lejos. Resta, no bloquea: hay gente que viaja una hora todos los días y está bien. */
  lejos: -12,

  /** Lo máximo que resta acercarse al tope de horas. Se aplica proporcional, no de golpe. */
  horas_cerca_del_tope: -15,
  /** Con esta guardia se pasa del tope semanal. Resta mucho, pero no bloquea. */
  horas_pasa_el_tope: -30,

  descanso_ok: 6,
  descanso_corto: -25,
};

/** Los topes y umbrales. Valores de fábrica. */
export const TOPES = {
  /**
   * Cuántas veces de haber atendido al Paciente cuentan, como máximo. De ahí sale el techo de la
   * continuidad (`continuidad_maxima`), que es este número por lo que suma cada vez.
   */
  continuidad_veces_maxima: VECES_DE_CONTINUIDAD_DE_FABRICA,

  /**
   * Horas semanales máximas que fija la Prestadora. Si el Asistente tiene cargadas en
   * `asistentes.horas_semanales` las que él acepta trabajar, manda el menor de los dos (ver
   * `topeSemanalDe`).
   */
  horas_semanales: 48,

  /** Horas mínimas de descanso entre el fin de una guardia y el inicio de la siguiente. */
  horas_descanso_minimo: 12,

  /**
   * Descansos más largos que esto no se comentan. Decir "descansa 300 h desde su guardia
   * anterior" es ruido: si hace tres días que no trabaja, el dato no aporta nada.
   */
  horas_descanso_a_mencionar: 24,

  /** Desde qué proporción del tope semanal ya conviene avisar que se está acercando. */
  proporcion_horas_para_avisar: 0.75,

  /**
   * Con cuántos días de anticipación se avisa que un papel o una Matrícula vence.
   *
   * No se configura acá: ya se configura una vez para todo el producto, en Configuración →
   * documentos. Dos lugares para el mismo número terminan en dos plazos distintos.
   */
  dias_aviso_vencimiento: DIAS_AVISO_POR_DEFECTO,

  /** Qué día arranca la semana para contar horas. 1 = lunes (0 sería domingo). */
  dia_inicio_semana: 1,

  /**
   * Los dos bordes de la cercanía, en kilómetros en línea recta entre el domicilio del Asistente
   * y el del Paciente.
   *
   * Hasta `km_cerca` cuenta a favor; desde `km_lejos` cuenta en contra; **en el medio no se dice
   * nada**. Ese silencio es deliberado: a doce kilómetros no hay nada que opinar, y forzar un
   * veredicto para cada candidato llenaría la lista de renglones que no ayudan a decidir.
   */
  km_cerca: 8,
  km_lejos: 25,
};

/**
 * Qué pesos se pueden tocar, y entre qué valores.
 *
 * El borde no es un capricho: un peso que pueda valer −1000 le deja a cualquiera la posibilidad
 * de esconder a un candidato que sí puede tomar la guardia, con el mismo número con el que el
 * sistema marca lo que de verdad bloquea. Y un peso enorme para el otro lado vuelve el orden de
 * la lista una sola cosa repetida.
 */
export const PESOS_QUE_SE_PUEDEN_TOCAR = {
  continuidad_por_vez: { minimo: 0, maximo: 60 },
  sin_continuidad: { minimo: -60, maximo: 0 },
  libre: { minimo: 0, maximo: 60 },
  matricula_ok: { minimo: 0, maximo: 60 },
  matricula_vence: { minimo: -60, maximo: 0 },
  papeles_ok: { minimo: 0, maximo: 60 },
  papeles_vencen: { minimo: -60, maximo: 0 },
  cerca: { minimo: 0, maximo: 60 },
  lejos: { minimo: -60, maximo: 0 },
  horas_cerca_del_tope: { minimo: -120, maximo: 0 },
  horas_pasa_el_tope: { minimo: -120, maximo: 0 },
  descanso_ok: { minimo: 0, maximo: 60 },
  descanso_corto: { minimo: -120, maximo: 0 },
};

/** Qué topes se pueden tocar, y entre qué valores. */
export const TOPES_QUE_SE_PUEDEN_TOCAR = {
  continuidad_veces_maxima: { minimo: 0, maximo: 25 },
  horas_semanales: { minimo: 1, maximo: 168 },
  horas_descanso_minimo: { minimo: 0, maximo: 48 },
  horas_descanso_a_mencionar: { minimo: 1, maximo: 168 },
  proporcion_horas_para_avisar: { minimo: 0.1, maximo: 1 },
  dia_inicio_semana: { minimo: 0, maximo: 6 },
  km_cerca: { minimo: 0, maximo: 200 },
  km_lejos: { minimo: 0, maximo: 500 },
};

/**
 * Los topes que se guardan como proporción y se muestran como porcentaje entero.
 *
 * La Prestadora ve 75 y escribe entre 10 y 100; lo guardado sigue siendo 0,75, así que la base,
 * el Backend y `revisarCambios` no cambian. La conversión vive acá y en ningún otro lado.
 */
const TOPES_EN_PORCENTAJE = new Set(['proporcion_horas_para_avisar']);

/** Los bordes de un tope tal como se muestran: en porcentaje entero si corresponde. */
export function bordeEnPantalla(clave, borde) {
  if (!TOPES_EN_PORCENTAJE.has(clave)) return { ...borde, paso: 'any' };
  return { minimo: Math.round(borde.minimo * 100), maximo: Math.round(borde.maximo * 100), paso: 1 };
}

/** El valor guardado de un tope, tal como se muestra. Un casillero vacío queda vacío. */
export function topeEnPantalla(clave, valor) {
  if (!TOPES_EN_PORCENTAJE.has(clave) || valor === '' || valor === null || valor === undefined) return valor;
  return Math.round(Number(valor) * 100);
}

/** Lo escrito en pantalla, tal como se guarda: el porcentaje vuelve a proporción, entero. */
export function topeGuardado(clave, escrito) {
  if (!TOPES_EN_PORCENTAJE.has(clave) || escrito === '') return escrito;
  return Math.round(Number(escrito)) / 100;
}

/**
 * Los cuatro niveles con los que la Prestadora pondera cada situación, de menos a más.
 *
 * Es lo único que ve: «No importa», «Poco», «Bastante», «Mucho». Lo guardado sigue siendo un
 * número, y la conversión vive acá y en ningún otro lado. «Bastante» es el valor de fábrica de
 * cada situación; los otros tres salen de multiplicarlo.
 */
export const NIVELES = ['no_importa', 'poco', 'bastante', 'mucho'];

/** El nivel que corresponde al valor de fábrica. */
export const NIVEL_DE_FABRICA = 'bastante';

const FACTOR_DE_NIVEL = { no_importa: 0, poco: 0.5, bastante: 1, mucho: 2.5 };

/** Las situaciones que se ponderan por nivel: las que se pueden tocar, en el orden de la tabla. */
export const SITUACIONES_PONDERABLES = Object.keys(PESOS_QUE_SE_PUEDEN_TOCAR);

/**
 * El número que vale una situación en un nivel. Redondea a entero conservando el signo del valor
 * de fábrica: lo que resta, resta más o menos, nunca pasa a sumar.
 */
export function pesoDeNivel(clave, nivel) {
  const base = PESOS[clave];
  const factor = FACTOR_DE_NIVEL[nivel];
  if (!Number.isFinite(base) || factor === undefined) return base;
  const valor = Math.sign(base) * Math.round(Math.abs(base) * factor);
  return valor === 0 ? 0 : valor;
}

/**
 * El nivel que corresponde a un número guardado. Si no coincide con ninguno, el más cercano; si
 * no es un número, el de fábrica.
 */
export function nivelMasCercano(clave, valor) {
  const numero = Number(valor);
  if (valor === '' || valor === null || valor === undefined || !Number.isFinite(numero)) return NIVEL_DE_FABRICA;
  let mejor = NIVEL_DE_FABRICA;
  let distancia = Infinity;
  for (const nivel of NIVELES) {
    const d = Math.abs(pesoDeNivel(clave, nivel) - numero);
    if (d < distancia) {
      distancia = d;
      mejor = nivel;
    }
  }
  return mejor;
}

/**
 * Las tres formas armadas.
 *
 * Cada una guarda **solamente lo que corre** respecto de los valores de fábrica; lo que no
 * nombra, queda como está. Así, el día que un valor de fábrica cambie, los tres perfiles se
 * mueven con él en vez de quedarse con una copia vieja.
 *
 * `continuidad` no corre nada, y eso es a propósito: los valores de fábrica ya están armados
 * para que la continuidad gane. Es el perfil con el que nace una Prestadora.
 */
export const PERFILES = {
  /**
   * Que venga quien ya conoce al Paciente. Es como sale de fábrica.
   */
  continuidad: { pesos: {}, topes: {} },

  /**
   * Que nadie quede al límite. Baja el techo de la continuidad para que no tape todo lo demás, y
   * sube mucho lo que cuesta llegar sin haber descansado o con la semana casi llena.
   */
  descanso: {
    pesos: {
      descanso_ok: pesoDeNivel('descanso_ok', 'mucho'),
      descanso_corto: pesoDeNivel('descanso_corto', 'mucho'),
      horas_cerca_del_tope: pesoDeNivel('horas_cerca_del_tope', 'mucho'),
      horas_pasa_el_tope: pesoDeNivel('horas_pasa_el_tope', 'mucho'),
    },
    topes: {
      continuidad_veces_maxima: 3,
      horas_descanso_minimo: 14,
    },
  },

  /**
   * Que el viaje sea corto. Sube bastante lo que pesa vivir cerca, baja el techo de la
   * continuidad para que la cercanía llegue a notarse, y achica la franja de en el medio: con
   * estos bordes se dice algo de más candidatos.
   */
  cercania: {
    pesos: {
      cerca: pesoDeNivel('cerca', 'mucho'),
      lejos: pesoDeNivel('lejos', 'mucho'),
    },
    topes: {
      continuidad_veces_maxima: 3,
      km_cerca: 10,
      km_lejos: 20,
    },
  },
};

/** Con cuál nace una Prestadora que nunca entró a esta pantalla. */
export const PERFIL_POR_DEFECTO = 'continuidad';

/** Los nombres de los tres perfiles, para recorrerlos sin escribirlos a mano. */
export const NOMBRES_DE_PERFIL = Object.keys(PERFILES);

/**
 * Los pesos y topes con los que hay que llamar a `candidatosParaGuardia`.
 *
 * Se apilan tres capas, y la última manda: los valores de fábrica, encima lo que corre el perfil
 * elegido, y encima lo que esa Prestadora haya cambiado número por número.
 *
 * @param {object|null} configuracion Lo guardado: `{ perfil, pesos, topes }`. Puede venir vacío.
 * @returns {{ pesos: object, topes: object, perfil: string }}
 */
export function pesosYTopesDe(configuracion) {
  const nombre = configuracion?.perfil;
  const perfil = PERFILES[nombre] ?? PERFILES[PERFIL_POR_DEFECTO];
  const pesos = { ...PESOS, ...perfil.pesos, ...soloLoQueSePuedeTocar(configuracion?.pesos, PESOS_QUE_SE_PUEDEN_TOCAR) };
  const topes = { ...TOPES, ...perfil.topes, ...soloLoQueSePuedeTocar(configuracion?.topes, TOPES_QUE_SE_PUEDEN_TOCAR) };
  return {
    perfil: PERFILES[nombre] ? nombre : PERFIL_POR_DEFECTO,
    pesos: { ...pesos, continuidad_maxima: techoDeContinuidad(pesos, topes) },
    topes,
  };
}

/**
 * El techo de la continuidad: las veces que cuentan por lo que suma cada vez. Es la misma cuenta
 * para el Panel y para el backend, porque los dos leen este archivo.
 */
export function techoDeContinuidad(pesos, topes) {
  return topes.continuidad_veces_maxima * pesos.continuidad_por_vez;
}

/**
 * Deja pasar únicamente las claves que se pueden tocar, con un número adentro del borde.
 *
 * Se filtra acá y no solo al guardar porque lo guardado puede haber quedado de una versión
 * anterior, con una clave que después dejó de configurarse. Si algo no pasa, no se rechaza todo:
 * se ignora ese valor y manda el de fábrica. Una lista de candidatos vale más que una pantalla
 * de error.
 */
function soloLoQueSePuedeTocar(cambios, bordes) {
  const limpio = {};
  for (const [clave, borde] of Object.entries(bordes)) {
    const valor = Number(cambios?.[clave]);
    if (!Number.isFinite(valor)) continue;
    if (valor < borde.minimo || valor > borde.maximo) continue;
    limpio[clave] = valor;
  }
  return limpio;
}

/**
 * Qué cambió la Prestadora respecto del perfil que eligió.
 *
 * Es lo que se guarda: nunca la tabla entera. Guardar los cuarenta números congelaría los valores
 * de fábrica el día que alguien abra la pantalla y le dé a guardar sin tocar nada.
 */
export function soloLoQueCorreDelPerfil(nombrePerfil, pesos, topes) {
  const perfil = PERFILES[nombrePerfil] ?? PERFILES[PERFIL_POR_DEFECTO];
  const base = {
    pesos: { ...PESOS, ...perfil.pesos },
    topes: { ...TOPES, ...perfil.topes },
  };
  return {
    pesos: diferencias(base.pesos, pesos, PESOS_QUE_SE_PUEDEN_TOCAR),
    topes: diferencias(base.topes, topes, TOPES_QUE_SE_PUEDEN_TOCAR),
  };
}

function diferencias(base, propuesto, bordes) {
  const corridos = {};
  for (const clave of Object.keys(bordes)) {
    const valor = Number(propuesto?.[clave]);
    if (!Number.isFinite(valor)) continue;
    if (valor === base[clave]) continue;
    corridos[clave] = valor;
  }
  return corridos;
}

/**
 * Comprueba lo que llega de afuera antes de guardarlo.
 *
 * @returns {{ ok: true }|{ ok: false, clave: string }} La clave que no pasó, para que quien
 *   muestra el error arme la frase en el idioma del Panel y sin nombrar ninguna tabla.
 */
export function revisarCambios(nombrePerfil, pesos, topes) {
  if (nombrePerfil !== undefined && nombrePerfil !== null && !PERFILES[nombrePerfil]) {
    return { ok: false, clave: 'perfil' };
  }
  for (const [cambios, bordes] of [[pesos, PESOS_QUE_SE_PUEDEN_TOCAR], [topes, TOPES_QUE_SE_PUEDEN_TOCAR]]) {
    for (const [clave, valor] of Object.entries(cambios ?? {})) {
      const borde = bordes[clave];
      if (!borde) return { ok: false, clave };
      const numero = Number(valor);
      if (!Number.isFinite(numero) || numero < borde.minimo || numero > borde.maximo) {
        return { ok: false, clave };
      }
    }
  }
  return { ok: true };
}
