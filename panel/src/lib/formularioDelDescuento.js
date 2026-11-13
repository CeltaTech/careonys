/* El formulario de alta de un descuento del Servicio: qué casilleros tiene, cuáles se ven, cuáles
   son obligatorios, qué se acepta en cada uno y qué renglón sale para la base.
   ==========================================================================

   Se declara acá y la pantalla lo dibuja con un solo bucle (`DescuentosDelServicio.jsx`). No usa
   `FormularioDeclarado`: aquél dibuja una declaración guardada en la base y la controla el
   backend, y sus clases de casillero no tienen número ni moneda.

   Lo que la base también controla (`descuentos_del_servicio`) se controla acá antes, para que el
   aviso salga pegado al casillero y no como un error general después de mandar. */

import { CLASES_DE_DESCUENTO, CLASES_DE_DESCUENTO_POSIBLES } from './descuentosDelPeriodo.js';

// Cómo termina: después de una cantidad de períodos de facturación, o en una fecha.
export const DURACIONES = Object.freeze({
  PERIODOS: 'periodos',
  FECHA: 'fecha',
});
export const DURACIONES_POSIBLES = Object.freeze(Object.values(DURACIONES));

export const MOTIVO_LARGO_MAXIMO = 500;
export const PERIODOS_MAXIMOS = 999;

// Los avisos que puede dar cada casillero. La frase sale de las traducciones.
export const AVISOS = Object.freeze({
  FALTA: 'falta',
  VALOR_NO_POSITIVO: 'valor_no_positivo',
  PORCENTAJE_MAYOR_A_CIEN: 'porcentaje_mayor_a_cien',
  PERIODOS_FUERA_DE_RANGO: 'periodos_fuera_de_rango',
  FECHAS_AL_REVES: 'fechas_al_reves',
  TEXTO_LARGO: 'texto_largo',
});

export const CAMPOS_DEL_DESCUENTO = Object.freeze([
  { clave: 'clase', tipo: 'lista', obligatorio: true, opciones: CLASES_DE_DESCUENTO_POSIBLES },
  { clave: 'valor', tipo: 'numero', obligatorio: true },
  { clave: 'vigente_desde', tipo: 'fecha', obligatorio: true },
  { clave: 'duracion', tipo: 'lista', obligatorio: true, opciones: DURACIONES_POSIBLES },
  { clave: 'cantidad_de_periodos', tipo: 'entero', obligatorio: true, visible: (f) => f.duracion === DURACIONES.PERIODOS },
  { clave: 'vigente_hasta', tipo: 'fecha', obligatorio: true, visible: (f) => f.duracion === DURACIONES.FECHA },
  { clave: 'motivo', tipo: 'texto_largo', obligatorio: false },
]);

export function formularioVacio(hoy) {
  return {
    clase: CLASES_DE_DESCUENTO.PORCENTAJE,
    valor: '',
    vigente_desde: hoy ?? '',
    duracion: DURACIONES.PERIODOS,
    cantidad_de_periodos: '',
    vigente_hasta: '',
    motivo: '',
  };
}

/** Los casilleros que se ven con lo que hay cargado, en orden. */
export function camposVisibles(form) {
  return CAMPOS_DEL_DESCUENTO.filter((c) => (typeof c.visible === 'function' ? c.visible(form) : true));
}

function vacio(valor) {
  return valor === null || valor === undefined || String(valor).trim() === '';
}

/**
 * Qué casillero visible está mal y por qué: `{ clave: aviso }`. Vacío si se puede guardar.
 * El orden de las claves es el del formulario, así que la primera es a la que se salta.
 */
export function avisosDelDescuento(form) {
  const avisos = {};
  for (const campo of camposVisibles(form)) {
    const valor = form?.[campo.clave];
    if (vacio(valor)) {
      if (campo.obligatorio) avisos[campo.clave] = AVISOS.FALTA;
      continue;
    }
    if (campo.tipo === 'lista' && !campo.opciones.includes(valor)) {
      avisos[campo.clave] = AVISOS.FALTA;
    } else if (campo.clave === 'valor') {
      const n = Number(valor);
      if (!Number.isFinite(n) || n <= 0) avisos.valor = AVISOS.VALOR_NO_POSITIVO;
      else if (form.clase === CLASES_DE_DESCUENTO.PORCENTAJE && n > 100) avisos.valor = AVISOS.PORCENTAJE_MAYOR_A_CIEN;
    } else if (campo.clave === 'cantidad_de_periodos') {
      const n = Number(valor);
      if (!Number.isInteger(n) || n < 1 || n > PERIODOS_MAXIMOS) avisos.cantidad_de_periodos = AVISOS.PERIODOS_FUERA_DE_RANGO;
    } else if (campo.clave === 'vigente_hasta') {
      if (!vacio(form.vigente_desde) && String(valor) < String(form.vigente_desde)) avisos.vigente_hasta = AVISOS.FECHAS_AL_REVES;
    } else if (campo.clave === 'motivo') {
      if (String(valor).trim().length > MOTIVO_LARGO_MAXIMO) avisos.motivo = AVISOS.TEXTO_LARGO;
    }
  }
  return avisos;
}

/**
 * El renglón para `descuentos_del_servicio`. La moneda va sólo con el monto, y es la de la
 * Prestadora: no se elige. Quién lo cargó y cuándo lo escribe la base.
 */
export function filaDelDescuento(form, { prestadoraId, servicioId, moneda }) {
  const esMonto = form.clase === CLASES_DE_DESCUENTO.MONTO;
  const porPeriodos = form.duracion === DURACIONES.PERIODOS;
  const motivo = vacio(form.motivo) ? null : String(form.motivo).trim();
  return {
    prestadora_id: prestadoraId,
    servicio_id: servicioId,
    clase: form.clase,
    valor: Number(form.valor),
    moneda: esMonto ? moneda ?? null : null,
    vigente_desde: form.vigente_desde,
    cantidad_de_periodos: porPeriodos ? Number(form.cantidad_de_periodos) : null,
    vigente_hasta: porPeriodos ? null : form.vigente_hasta,
    motivo,
  };
}

/** Si un descuento ya cargado sigue corriendo hoy: no terminado y sin fecha de fin pasada. */
export function sigueVigente(descuento, hoy) {
  if (!descuento || descuento.terminado_en) return false;
  const hasta = descuento.vigente_hasta ? String(descuento.vigente_hasta).slice(0, 10) : null;
  return hasta === null || hasta >= hoy;
}
