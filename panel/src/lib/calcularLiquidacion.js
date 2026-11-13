// ---------------------------------------------------------------------------
// calcularLiquidacion.js — cuánto se le paga a un Asistente por un período
//
// EL PERÍODO YA NO ES SIEMPRE UN MES. Desde qué día hasta qué día va lo decide
// `frecuenciaDePago.js`, porque con cada persona se arregla distinto: los viernes, cada catorce
// días, el mes cerrado. Acá eso llega hecho y esta cuenta no se entera de dónde salieron los
// bordes. Quien no cambió nada sigue liquidando el mes calendario, exactamente igual que antes.
//
// Vive acá, del lado del Panel, y el backend usa una copia generada
// (`backend/src/utils/calcularLiquidacion.js`, ver `scripts/copias_entre_apps.mjs`). Es la
// misma forma que ya tiene `escalasLegales.js`, que decide qué escala rige a una fecha.
//
// LO ÚNICO QUE IMPORTA ES A SUS HERMANOS COPIADOS. `formaDePago.js` y `condicionesDelCliente.js`
// también viven en las dos carpetas y con el mismo nombre, así que la ruta relativa vale igual de
// los dos lados. Fuera de eso no entra nada: lo que se copia al backend no puede traerse medio
// Panel atrás.
//
// TAMBIÉN LA DEL CLIENTE. Al final está `calcularLiquidacionDelCliente`, que es la otra punta del
// mismo trabajo: cuánto se le cobra a un Cliente por un Servicio en un período. Usa las mismas
// unidades y los mismos redondeos, y por eso vive acá y no copiada en otro lado.
//
// LO QUE NO ES: un comprobante fiscal. El producto no emite facturas ni notas y no está
// previsto que lo haga. Esto es la cuenta interna de qué se le paga a quién.
//
// LO QUE TAMPOCO HACE: inventar un número. Ningún porcentaje ni monto legal está escrito acá
// adentro. Los conceptos los arma cada Prestadora, y el que responde a una escala legal se
// resuelve contra `escalas_legales` a la fecha del período; si esa escala no está, el concepto
// queda afuera y se avisa, nunca se estima.
// ---------------------------------------------------------------------------

import {
  COLUMNA_DEL_VALOR,
  UNIDADES,
  diasCubiertos,
  reglaDePagoDe,
  unidadDeMedicionDe,
  unidadesDelPeriodo,
  valorDeLaHoraExtra,
  valorDeLaUnidad,
} from './formaDePago.js';
import { MEDICIONES, condicionesDe } from './condicionesDelCliente.js';

const ES_UN_DIA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Un período puede venir de dos formas, y las dos son válidas.
 *
 * Como texto `AAAA-MM` es el mes calendario entero, que es lo que el sistema hizo siempre y lo
 * que sigue haciendo quien no cambió nada. Como `{ desde, hasta }` es cualquier tramo, que es lo
 * que arma `frecuenciaDePago.js` cuando a alguien se le paga los viernes o cada catorce días.
 */
export function esPeriodoValido(periodo) {
  if (periodo && typeof periodo === 'object') {
    if (!ES_UN_DIA.test(periodo.desde ?? '') || !ES_UN_DIA.test(periodo.hasta ?? '')) return false;
    return periodo.desde <= periodo.hasta;
  }
  if (typeof periodo !== 'string' || !/^\d{4}-\d{2}$/.test(periodo)) return false;
  const mes = Number(periodo.slice(5, 7));
  return mes >= 1 && mes <= 12;
}

/**
 * Desde qué día hasta qué día va el período, y cómo se lo nombra.
 *
 * La etiqueta es para los avisos que lee una persona, y por eso dice el mes cuando el período es
 * un mes: «no hay escala vigente durante todo 2026-03» se entiende, y «durante todo 2026-03-01 a
 * 2026-03-31» dice lo mismo con más ruido.
 */
export function bordesDelPeriodo(periodo) {
  if (periodo && typeof periodo === 'object') {
    return { desde: periodo.desde, hasta: periodo.hasta, etiqueta: `${periodo.desde} a ${periodo.hasta}` };
  }
  return { desde: primerDia(periodo), hasta: ultimoDia(periodo), etiqueta: periodo };
}

export function primerDia(periodo) {
  return `${periodo}-01`;
}

export function ultimoDia(periodo) {
  const [anio, mes] = periodo.split('-').map(Number);
  // El día 0 del mes siguiente es el último del mes pedido, sin tener que saber cuáles
  // tienen 30, 31 o 28 días.
  return new Date(Date.UTC(anio, mes, 0)).toISOString().slice(0, 10);
}

// Los importes se guardan con dos decimales. Se redondea al escribir cada renglón y no al
// final, para que la suma de los renglones dé exactamente el total y nadie tenga que
// explicar un centavo de diferencia.
export function redondear(numero) {
  return Math.round((numero + Number.EPSILON) * 100) / 100;
}

/**
 * La liquidación de un Asistente en un período, con sus renglones.
 *
 * Devuelve `{ faltaBase: true }` cuando el Legajo del Asistente no tiene el valor con el que se paga. No se
 * estima, no se completa con el de otro, no se pone cero: un cero se lee como "no se le paga
 * nada", que es una afirmación distinta de "no sabemos cuánto".
 *
 * `sinEscala` sale con los conceptos que quedaron afuera por no tener escala utilizable.
 */
export function calcularLiquidacion({ asistente, acumulado, conceptos, escalasPorTipo, moneda, jurisdiccion, periodo, reglaDePago }) {
  const regla = reglaDePagoDe(reglaDePago);
  const unidad = unidadDeMedicionDe(asistente);
  const baseUnidad = COLUMNA_DEL_VALOR[unidad];
  const baseValor = valorDeLaUnidad(asistente, unidad);
  if (baseValor === null) return { faltaBase: true };

  const horas = redondear(acumulado.horas);
  const { desde, hasta, etiqueta } = bordesDelPeriodo(periodo);
  const cuantas = unidadesDelPeriodo({
    unidad,
    acumulado,
    diasDeLaPersona: diasCubiertos({
      desde,
      hasta,
      fechaAlta: asistente.fecha_alta,
      fechaBaja: asistente.fecha_baja,
      prorratear: regla.prorratear_monto_fijo,
    }),
  });
  const montoBase = redondear(cuantas * baseValor);

  // El renglón de la base va primero y no viene de ningún concepto. La descripción se escribe
  // con datos y no con una frase: la etiqueta que lee la Coordinadora sale de `base_unidad`,
  // que la pantalla traduce a los tres idiomas, mientras que esto es el detalle que permite
  // volver a explicar el importe años después sin depender del idioma en que se generó.
  const items = [
    {
      concepto_id: null,
      descripcion: `${baseUnidad} ${baseValor.toFixed(2)} × ${cuantas.toFixed(2)} ${unidad}`,
      signo: 'suma',
      unidad: 'base',
      valor_aplicado: baseValor,
      monto: montoBase,
      orden: 0,
    },
  ];

  // Las horas de más son remuneración, así que entran al bruto: un concepto que se calcula
  // como porcentaje del bruto tiene que verlas. Y si nadie cargó cuánto vale la hora extra,
  // no se estiman con el valor hora normal ni se pagan a cero: quedan afuera y se avisa, que
  // es lo mismo que ya se hace con un concepto sin escala vigente.
  const horasExtra = redondear(acumulado.horasExtra ?? 0);
  const valorHoraExtra = valorDeLaHoraExtra(asistente);
  const sinEscala = [];
  let importeHorasExtra = 0;

  if (horasExtra > 0 && valorHoraExtra === null) {
    sinEscala.push(`horas extra: hay ${horasExtra.toFixed(2)} h anotadas y la ficha no tiene cargado el valor de la hora extra`);
  } else if (horasExtra > 0) {
    importeHorasExtra = redondear(horasExtra * valorHoraExtra);
    items.push({
      concepto_id: null,
      descripcion: `valor_hora_extra ${valorHoraExtra.toFixed(2)} × ${horasExtra.toFixed(2)} h`,
      signo: 'suma',
      unidad: 'horas_extra',
      valor_aplicado: valorHoraExtra,
      monto: importeHorasExtra,
      orden: 1,
    });
  }

  const bruto = redondear(montoBase + importeHorasExtra);

  let totalSumas = 0;
  let totalRestas = 0;

  for (const concepto of conceptos) {
    let valorAplicado;
    if (concepto.origen_valor === 'escala_legal') {
      const escala = escalasPorTipo.get(concepto.escala_tipo);
      if (!escala) {
        sinEscala.push(`${concepto.nombre}: no hay una escala «${concepto.escala_tipo}» vigente en ${jurisdiccion} durante todo ${etiqueta}`);
        continue;
      }
      // La escala dice el número y también en qué unidad está. Si no habla de lo mismo que el
      // concepto —un valor en días aplicado como porcentaje, por ejemplo— el importe que
      // saldría no significaría nada, así que no se calcula.
      if (escala.unidad !== concepto.unidad) {
        sinEscala.push(`${concepto.nombre}: la escala «${concepto.escala_tipo}» está en ${escala.unidad} y el concepto en ${concepto.unidad}`);
        continue;
      }
      // Un importe en otra moneda no se convierte: convertirlo obligaría a guardar una
      // cotización y una fecha, y eso es una decisión de la Prestadora, no del sistema.
      // Un porcentaje no es plata y no trae moneda: ahí no hay nada que comparar.
      if (escala.moneda && escala.moneda !== moneda) {
        sinEscala.push(`${concepto.nombre}: la escala «${concepto.escala_tipo}» está en ${escala.moneda} y la liquidación en ${moneda}`);
        continue;
      }
      valorAplicado = Number(escala.valor);
    } else {
      valorAplicado = Number(concepto.valor);
    }

    let monto;
    if (concepto.unidad === 'porcentaje') monto = (bruto * valorAplicado) / 100;
    else if (concepto.unidad === 'monto_por_hora') monto = acumulado.horas * valorAplicado;
    else monto = valorAplicado;
    monto = redondear(monto);

    if (concepto.signo === 'resta') totalRestas += monto;
    else totalSumas += monto;

    items.push({
      concepto_id: concepto.id,
      // El nombre se copia, no se busca: si mañana la Prestadora le cambia el nombre al
      // concepto, el mes de marzo tiene que seguir diciendo lo que decía en marzo.
      descripcion: concepto.nombre,
      signo: concepto.signo,
      unidad: concepto.unidad,
      valor_aplicado: valorAplicado,
      monto,
      // El orden es la posición en el renglón, no el `orden` del catálogo: dos conceptos
      // pueden tener el mismo número ahí y los renglones quedarían empatados.
      orden: items.length,
    });
  }

  totalSumas = redondear(totalSumas);
  totalRestas = redondear(totalRestas);

  return {
    liquidacion: {
      asistente_id: asistente.id,
      // `periodo` es el día en que el período empieza, y con período mensual eso es el primero
      // del mes, igual que siempre. Los dos bordes van aparte y son los que mandan.
      periodo: desde,
      periodo_desde: desde,
      periodo_hasta: hasta,
      relacion_laboral: asistente.relaciones_laborales?.nombre ?? null,
      base_unidad: baseUnidad,
      base_valor: baseValor,
      horas,
      guardias_contadas: acumulado.guardias,
      horas_extra: horasExtra,
      // El valor con el que se pagaron va en la foto: sin él, el importe no se puede volver a
      // explicar. Sin horas extra no hay valor que guardar, y guardar el del Legajo del Asistente diría que
      // se pagó algo que no se pagó.
      valor_hora_extra: importeHorasExtra > 0 ? valorHoraExtra : null,
      importe_horas_extra: importeHorasExtra,
      bruto,
      total_sumas: totalSumas,
      total_restas: totalRestas,
      neto: redondear(bruto + totalSumas - totalRestas),
    },
    items,
    sinEscala,
  };
}

/* ==========================================================================
   Lo que se le cobra a un Cliente por un Servicio en un período.
   ==========================================================================

   Llega todo leído: las prestaciones del Servicio, las guardias completadas del período con sus
   horas ya contadas, y la medición que rige (la resuelve `condicionesDelCliente.js`). Sale un
   renglón por cada cosa que se cobra, con cuántas unidades, de qué, a qué precio y en qué moneda.

   CADA GUARDIA SE COBRA CON LA PRESTACIÓN VIGENTE EL DÍA DE LA GUARDIA. Si el precio cambió a mitad
   de período, la guardia de antes del cambio se cobra al precio de antes: es la escala vigente a la
   fecha del hecho. La guardia va a la prestación de su mismo Servicio y del mismo Paciente.
     - Si ninguna prestación estaba vigente ese día, la guardia queda sin cobrar y se cuenta en
       `guardiasSinAsignar`.
     - Si había más de una, no se elige ninguna: queda sin cobrar y se cuenta en
       `guardiasAmbiguas`. Elegir una sería inventar a qué precio se pactó.

   UNA GUARDIA QUE CUBRE A VARIOS PACIENTES reparte sus horas entre ellos, igual que en
   `utils/horasDeGuardia.js`: la misma hora no se cobra dos veces. Como guardia y como día cuenta
   una vez para cada uno, porque cada uno tiene su prestación pactada.

   LAS TRES MEDICIONES
     - pactado_mas_excedente: el precio de la prestación entero, una vez por período en que la
       prestación esté vigente aunque sea un día. Si la prestación dice cuántas guardias se
       pactaron (`configuracion.cantidad_guardias`), cada guardia por encima se cobra a
       precio / cantidad, y cada hora extra anotada a ese valor de la guardia / las horas de esa
       guardia. Sin cantidad pactada no se cobra excedente y se avisa en `sinCantidadPactada`.

   UN CAMBIO DE PRECIO A MITAD DE PERÍODO. El precio nuevo es otra prestación que dice a cuál
   reemplaza (`prestacion_anterior_id`), y las dos forman una cadena. En la medición por hora y por
   día de guardia no cambia nada: cada hecho ya se cobra con la prestación vigente su día. En la
   pactada, la cadena se cobra una sola vez por período, y cada eslabón pone la parte de su precio
   que corresponde a sus días: precio × días del eslabón / días que la cadena cubre en el período.
   Una prestación sin cambios cubre todos sus días y se cobra entera, igual que antes. Lo pactado
   se reparte de la misma forma (cantidad × la misma fracción, sumado y redondeado), y las
   guardias por encima son las últimas, por fecha: cada una se cobra con el valor de la guardia
   del eslabón vigente su día.
     - hora: cada hora trabajada, más las horas extra, al precio de la prestación.
     - dia_de_guardia: cada día calendario en que hubo guardia, al precio de la prestación. Una
       guardia de 48 horas cubre dos días.

   NO INVENTA MONEDA. Cada renglón lleva la de su prestación. Si en el mismo Servicio hay
   prestaciones en dos monedas, `monedas` trae las dos y quien arma la factura decide no armarla:
   una factura tiene una sola moneda. */

export const UNIDADES_DEL_COBRO = Object.freeze({
  PERIODO: 'periodo',
  GUARDIA: UNIDADES.GUARDIA,
  HORA: UNIDADES.HORA,
  HORA_EXTRA: 'hora_extra',
  DIA_DE_GUARDIA: 'dia_de_guardia',
});

const HORAS_DE_UN_DIA = 24;

function estaVigente(prestacion, fecha) {
  if (!prestacion.vigente_desde || prestacion.vigente_desde > fecha) return false;
  return !prestacion.vigente_hasta || prestacion.vigente_hasta >= fecha;
}

function correEnElTramo(prestacion, desde, hasta) {
  if (!prestacion.vigente_desde || prestacion.vigente_desde > hasta) return false;
  return !prestacion.vigente_hasta || prestacion.vigente_hasta >= desde;
}

// Los días de una prestación dentro del tramo, con los dos bordes incluidos.
function diasEnElTramo(prestacion, desde, hasta) {
  const inicio = prestacion.vigente_desde > desde ? prestacion.vigente_desde : desde;
  const fin = prestacion.vigente_hasta && prestacion.vigente_hasta < hasta ? prestacion.vigente_hasta : hasta;
  if (fin < inicio) return 0;
  const ms = Date.parse(`${fin}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`);
  return Math.round(ms / 86400000) + 1;
}

// La primera prestación de la cadena de reemplazos a la que pertenece ésta.
function raizDeLaCadena(prestacion, porId) {
  let actual = prestacion;
  const vistas = new Set();
  while (actual.prestacion_anterior_id != null && porId.has(actual.prestacion_anterior_id) && !vistas.has(actual.id)) {
    vistas.add(actual.id);
    actual = porId.get(actual.prestacion_anterior_id);
  }
  return actual.id;
}

// El precio pactado de una guardia o una hora adicional: un número desde cero, o null si no hay.
function precioDelAdicional(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  const numero = Number(valor);
  return Number.isFinite(numero) && numero >= 0 ? numero : null;
}

function numeroPositivo(valor) {
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function diaSiguiente(fecha, dias) {
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

// De dónde sale cada renglón. Lo guarda la factura para que cada uno se pueda explicar solo.
export const CONCEPTOS_DEL_COBRO = Object.freeze({
  PACTADO: 'pactado',
  MEDIDO: 'medido',
  ADICIONAL: 'adicional',
  NO_PRESTADO: 'no_prestado',
  CANCELADO_POR_EL_CLIENTE: 'cancelado_por_el_cliente',
});

/* Qué condiciones de cobro usa la cuenta de cada medición. Las demás no cambian nada con esa
   medición: por hora no hay pactado del que descontar ni guardias de más, y por día de guardia
   tampoco hay horas de más. La interfaz muestra sólo éstas, y la cuenta de abajo no lee otras. */
export const CONDICIONES_DE_CADA_MEDICION = Object.freeze({
  [MEDICIONES.PACTADO_MAS_EXCEDENTE]: Object.freeze([
    'descuenta_lo_no_prestado',
    'cobra_cancelada_por_el_cliente',
    'cobra_guardias_adicionales',
    'cobra_horas_adicionales',
  ]),
  [MEDICIONES.HORA]: Object.freeze(['cobra_cancelada_por_el_cliente', 'cobra_horas_adicionales']),
  [MEDICIONES.DIA_DE_GUARDIA]: Object.freeze(['cobra_cancelada_por_el_cliente']),
});

// Los estados de una guardia que entran en la cuenta. La que no dice estado es una completada,
// como antes de que la cuenta mirara las otras.
const ESTADOS = Object.freeze({ COMPLETADA: 'completada', AUSENTE: 'ausente', CANCELADA: 'cancelada' });

// Qué es una guardia para la cuenta: trabajada, no prestada por causa de la Prestadora o del
// Asistente (propia), cancelada por el Cliente, o ninguna de las tres (no entra).
function claseDeLaGuardia(g) {
  const estado = g.estado ?? ESTADOS.COMPLETADA;
  if (estado === ESTADOS.COMPLETADA) return 'trabajada';
  if (estado === ESTADOS.AUSENTE) return 'propia';
  if (estado === ESTADOS.CANCELADA) {
    if (g.cancelacion_origen === 'cliente') return 'cliente';
    if (g.cancelacion_origen === 'prestadora') return 'propia';
  }
  return null;
}

const porFecha = (a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0);

/**
 * - periodo: { desde, hasta } o 'AAAA-MM'.
 * - medicion: una de MEDICIONES. Una desconocida no cobra nada y lo dice en `medicionDesconocida`.
 * - condiciones: las condiciones que rigen para el Servicio (`condicionesDe`). Sin ellas, las de
 *   fábrica. Si traen `medicion`, ésa manda sobre el parámetro suelto.
 * - prestaciones: [{ id, paciente_id, servicio_id, tipo_servicio, precio_final, moneda,
 *   vigente_desde, vigente_hasta, configuracion, prestacion_anterior_id,
 *   precio_guardia_adicional, precio_hora_adicional }]. Los dos últimos son optativos: sin ellos,
 *   la guardia y la hora adicionales valen la parte proporcional del precio pactado.
 * - guardias: [{ id, fecha, servicio_id, horas, horas_extra, pacientes: [paciente_id], estado,
 *   cancelacion_origen }]. Entran las completadas, las ausentes y las canceladas; una sin estado
 *   cuenta como completada.
 * - nombresDePacientes: Map de paciente_id a nombre, para la descripción.
 *
 * Cada ítem lleva `concepto` (CONCEPTOS_DEL_COBRO). El que se descuenta lleva monto negativo,
 * con cantidad y precio unitario positivos.
 */
export function calcularLiquidacionDelCliente({
  periodo,
  medicion: medicionSuelta,
  condiciones: condicionesQueLlegan,
  prestaciones = [],
  guardias = [],
  nombresDePacientes = new Map(),
}) {
  const resultado = {
    renglones: [],
    total: 0,
    monedas: [],
    guardiasSinAsignar: 0,
    guardiasAmbiguas: 0,
    sinCantidadPactada: [],
    sinPrecio: [],
    medicionDesconocida: false,
  };
  if (!esPeriodoValido(periodo)) return resultado;
  const { desde, hasta } = bordesDelPeriodo(periodo);
  // Las condiciones que llegan ya están resueltas; pasarlas otra vez por `condicionesDe` completa
  // con las de fábrica lo que falte o no sirva, y deja la medición como llegó para que una
  // desconocida se note.
  const condiciones = condicionesDe(condicionesQueLlegan ?? null, null);
  const medicion = condicionesQueLlegan?.medicion !== undefined ? condicionesQueLlegan.medicion : medicionSuelta;
  if (!Object.values(MEDICIONES).includes(medicion)) {
    resultado.medicionDesconocida = true;
    return resultado;
  }
  const cobraCanceladas = condiciones.cobra_cancelada_por_el_cliente === true;
  const descuentaPropias = condiciones.descuenta_lo_no_prestado === true;
  const cobraGuardiasAdicionales = condiciones.cobra_guardias_adicionales === true;
  const cobraHorasAdicionales = condiciones.cobra_horas_adicionales === true;

  const delTramo = prestaciones.filter((p) => correEnElTramo(p, desde, hasta));

  // Qué guardias le tocan a cada prestación, y con cuántas horas, separadas por clase.
  const trabajo = new Map(delTramo.map((p) => [p.id, []]));
  const propias = new Map(delTramo.map((p) => [p.id, []]));
  const delCliente = new Map(delTramo.map((p) => [p.id, []]));
  const destino = { trabajada: trabajo, propia: propias, cliente: delCliente };
  for (const g of guardias) {
    if (!g?.fecha || g.fecha < desde || g.fecha > hasta) continue;
    const clase = claseDeLaGuardia(g);
    if (!clase) continue;
    const pacientes = [...new Set((g.pacientes || []).filter(Boolean))];
    if (pacientes.length === 0) {
      resultado.guardiasSinAsignar += 1;
      continue;
    }
    const horasDeLaGuardia = Math.max(Number(g.horas) || 0, 0);
    // Sólo la guardia trabajada tiene horas extra: la que no se prestó no tuvo ninguna.
    const horasExtraDeLaGuardia = clase === 'trabajada' ? Math.max(Number(g.horas_extra) || 0, 0) : 0;
    for (const pacienteId of pacientes) {
      const candidatas = delTramo.filter(
        (p) => p.servicio_id === g.servicio_id && p.paciente_id === pacienteId && estaVigente(p, g.fecha)
      );
      if (candidatas.length === 0) {
        resultado.guardiasSinAsignar += 1;
        continue;
      }
      if (candidatas.length > 1) {
        resultado.guardiasAmbiguas += 1;
        continue;
      }
      destino[clase].get(candidatas[0].id).push({
        fecha: g.fecha,
        horasDeLaGuardia,
        horas: horasDeLaGuardia / pacientes.length,
        horasExtra: horasExtraDeLaGuardia / pacientes.length,
      });
    }
  }

  /* Las cadenas de reemplazos: qué fracción del período pone cada eslabón y, en la medición
     pactada, cuántas guardias de cada eslabón van de más y cuántas se descuentan.
       - Lo consumido de lo pactado son las trabajadas, más las canceladas por el Cliente si se le
         cobran.
       - De más: las trabajadas que pasan lo pactado, las últimas por fecha.
       - Lo que falta para lo pactado se reparte primero entre las no prestadas por causa propia y
         después entre las canceladas por el Cliente, las primeras por fecha. Una guardia que no
         figura en ninguna de las dos no se descuenta: el precio del período es el pactado. */
  const porId = new Map(prestaciones.map((p) => [p.id, p]));
  const cadenas = new Map();
  for (const p of delTramo) {
    const raiz = raizDeLaCadena(p, porId);
    if (!cadenas.has(raiz)) cadenas.set(raiz, []);
    cadenas.get(raiz).push(p);
  }
  const fraccionDe = new Map();
  const excedenteDe = new Map();
  const propiasDe = new Map();
  const delClienteDe = new Map();
  const cadenaSinCantidad = new Set();
  const contar = (mapa, lista) => {
    for (const g of lista) mapa.set(g.prestacionId, (mapa.get(g.prestacionId) ?? 0) + 1);
  };
  const juntar = (mapa, eslabones) =>
    eslabones.flatMap((p) => (mapa.get(p.id) || []).map((s) => ({ prestacionId: p.id, fecha: s.fecha }))).sort(porFecha);
  for (const eslabones of cadenas.values()) {
    const dias = eslabones.map((p) => diasEnElTramo(p, desde, hasta));
    const totalDeDias = dias.reduce((a, b) => a + b, 0);
    eslabones.forEach((p, i) => fraccionDe.set(p.id, totalDeDias > 0 ? dias[i] / totalDeDias : 1));

    if (medicion !== MEDICIONES.PACTADO_MAS_EXCEDENTE) continue;
    const cantidades = eslabones.map((p) => numeroPositivo(p.configuracion?.cantidad_guardias));
    if (cantidades.some((c) => !c)) {
      for (const p of eslabones) cadenaSinCantidad.add(p.id);
      continue;
    }
    const pactadas = Math.round(eslabones.reduce((suma, p, i) => suma + cantidades[i] * fraccionDe.get(p.id), 0));
    const trabajadas = juntar(trabajo, eslabones);
    const noPrestadas = juntar(propias, eslabones);
    const canceladas = juntar(delCliente, eslabones);
    const consumidasSinTrabajar = cobraCanceladas ? canceladas.length : 0;
    contar(excedenteDe, trabajadas.slice(Math.max(pactadas - consumidasSinTrabajar, 0)));
    const faltan = Math.max(pactadas - trabajadas.length - consumidasSinTrabajar, 0);
    const porCausaPropia = Math.min(noPrestadas.length, faltan);
    if (descuentaPropias) contar(propiasDe, noPrestadas.slice(0, porCausaPropia));
    if (!cobraCanceladas) contar(delClienteDe, canceladas.slice(0, Math.min(canceladas.length, faltan - porCausaPropia)));
  }

  const monedas = new Set();
  for (const p of delTramo) {
    const precio = p.precio_final === null || p.precio_final === undefined ? NaN : Number(p.precio_final);
    if (!Number.isFinite(precio) || precio < 0) {
      resultado.sinPrecio.push(p.id);
      continue;
    }
    const nombre = nombresDePacientes.get(p.paciente_id);
    const descripcion = nombre ? `${p.tipo_servicio} — ${nombre}` : String(p.tipo_servicio ?? '');
    const base = {
      prestacion_id: p.id,
      paciente_id: p.paciente_id,
      servicio_id: p.servicio_id,
      moneda: p.moneda,
      descripcion,
    };
    const suyas = trabajo.get(p.id) || [];
    const canceladasSuyas = delCliente.get(p.id) || [];
    const renglonesDeEsta = [];
    // El signo del monto lo pone `signo`: -1 en lo que se descuenta. La cantidad y el precio
    // unitario quedan siempre positivos.
    const agregar = (concepto, unidad, cantidad, precioUnitario, opciones = {}) => {
      const { monto = cantidad * precioUnitario, signo = 1 } = opciones;
      if (!(cantidad > 0)) return;
      renglonesDeEsta.push({
        ...base,
        concepto,
        unidad,
        cantidad: redondear(cantidad),
        precio_unitario: redondear(precioUnitario),
        monto: redondear(signo * monto),
      });
    };
    // Las guardias y las horas adicionales: al precio pactado para ellas, si lo hay; si no, a la
    // parte proporcional del precio pactado. La Prestadora lo cambia después en cada factura.
    const adicional = (unidad, cantidad, precioUnitario, monto = cantidad * precioUnitario) =>
      agregar(CONCEPTOS_DEL_COBRO.ADICIONAL, unidad, cantidad, precioUnitario, { monto });
    const guardiaAdicional = precioDelAdicional(p.precio_guardia_adicional);
    const horaAdicional = precioDelAdicional(p.precio_hora_adicional);

    if (medicion === MEDICIONES.PACTADO_MAS_EXCEDENTE) {
      // Una fracción del período: la parte de los días que cubre este eslabón de su cadena.
      const fraccion = fraccionDe.get(p.id) ?? 1;
      agregar(CONCEPTOS_DEL_COBRO.PACTADO, UNIDADES_DEL_COBRO.PERIODO, fraccion, precio, { monto: precio * fraccion });
      const pactadas = numeroPositivo(p.configuracion?.cantidad_guardias);
      const tieneGuardias = suyas.length + (propias.get(p.id) || []).length + canceladasSuyas.length > 0;
      if (!pactadas || cadenaSinCantidad.has(p.id)) {
        if (tieneGuardias) resultado.sinCantidadPactada.push(p.id);
      } else {
        const valorDeLaGuardia = precio / pactadas;
        if (cobraGuardiasAdicionales) adicional(UNIDADES_DEL_COBRO.GUARDIA, excedenteDe.get(p.id) ?? 0, guardiaAdicional ?? valorDeLaGuardia);
        // Cada hora extra vale lo que vale una hora de su propia guardia.
        let horasExtra = 0;
        let montoExtra = 0;
        for (const s of suyas) {
          if (s.horasExtra > 0 && s.horasDeLaGuardia > 0) {
            horasExtra += s.horasExtra;
            montoExtra += s.horasExtra * (valorDeLaGuardia / s.horasDeLaGuardia);
          }
        }
        if (cobraHorasAdicionales && horasExtra > 0) {
          if (horaAdicional !== null) adicional(UNIDADES_DEL_COBRO.HORA_EXTRA, horasExtra, horaAdicional);
          else adicional(UNIDADES_DEL_COBRO.HORA_EXTRA, horasExtra, montoExtra / horasExtra, montoExtra);
        }
        agregar(CONCEPTOS_DEL_COBRO.NO_PRESTADO, UNIDADES_DEL_COBRO.GUARDIA, propiasDe.get(p.id) ?? 0, valorDeLaGuardia, { signo: -1 });
        agregar(CONCEPTOS_DEL_COBRO.CANCELADO_POR_EL_CLIENTE, UNIDADES_DEL_COBRO.GUARDIA, delClienteDe.get(p.id) ?? 0, valorDeLaGuardia, { signo: -1 });
      }
    } else if (medicion === MEDICIONES.HORA) {
      // Se cobra lo trabajado. Lo no prestado nunca se cobró, así que no hay nada que descontar.
      agregar(CONCEPTOS_DEL_COBRO.MEDIDO, UNIDADES_DEL_COBRO.HORA, suyas.reduce((suma, s) => suma + s.horas, 0), precio);
      if (cobraHorasAdicionales) {
        adicional(UNIDADES_DEL_COBRO.HORA_EXTRA, suyas.reduce((suma, s) => suma + s.horasExtra, 0), horaAdicional ?? precio);
      }
      if (cobraCanceladas) {
        agregar(CONCEPTOS_DEL_COBRO.CANCELADO_POR_EL_CLIENTE, UNIDADES_DEL_COBRO.HORA, canceladasSuyas.reduce((suma, s) => suma + s.horas, 0), precio);
      }
    } else {
      const diasDe = (lista) => {
        const dias = new Set();
        for (const s of lista) {
          const cubre = Math.max(Math.ceil(s.horasDeLaGuardia / HORAS_DE_UN_DIA), 1);
          for (let i = 0; i < cubre; i += 1) dias.add(diaSiguiente(s.fecha, i));
        }
        return dias;
      };
      const trabajados = diasDe(suyas);
      agregar(CONCEPTOS_DEL_COBRO.MEDIDO, UNIDADES_DEL_COBRO.DIA_DE_GUARDIA, trabajados.size, precio);
      if (cobraCanceladas) {
        // Un día que ya se cobra por una guardia trabajada no se cobra otra vez.
        const soloCancelados = [...diasDe(canceladasSuyas)].filter((d) => !trabajados.has(d));
        agregar(CONCEPTOS_DEL_COBRO.CANCELADO_POR_EL_CLIENTE, UNIDADES_DEL_COBRO.DIA_DE_GUARDIA, soloCancelados.length, precio);
      }
    }

    if (renglonesDeEsta.length > 0) monedas.add(p.moneda);
    resultado.renglones.push(...renglonesDeEsta);
  }

  resultado.monedas = [...monedas];
  resultado.total = redondear(resultado.renglones.reduce((suma, r) => suma + r.monto, 0));
  return resultado;
}
