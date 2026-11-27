/*
 * La medicación y los valores normales de signos vitales que trae una importación.
 *
 * Una indicación importada entra aceptada: ya la estaba dando la Prestadora. Lo que no trae queda
 * pedido, nunca inventado:
 *
 * - la receta, siempre: un pedido `receta`, que se contesta subiendo el archivo;
 * - la firma del Cliente, si la Prestadora la pide: el consentimiento queda pendiente de firma y
 *   se abre un pedido `firma_medicacion`;
 * - un dato obligatorio que falta, una vía que no se reconoce con certeza o una fecha que no se
 *   entiende: un pedido `dato`, con el renglón guardado, y la indicación entra cuando se contesta.
 *
 * Quien importa la medicación necesita el mismo permiso que para el resto de la importación, y
 * además que la regla de salud le deje alcanzar la información de salud de ese Paciente: se le
 * pregunta a la base con su sesión, Paciente por Paciente, y ante la duda no se carga. Lo que
 * pasa esa pregunta lo escribe la cuenta de la importación, como el resto de la importación, con
 * quien importa anotado como quien lo pidió.
 *
 * El renglón original de cada indicación queda siempre en la historia anterior del Paciente, que
 * nadie puede modificar ni borrar, también cuando no se carga porque la información de salud de ese
 * Paciente no alcanza a quien importa: ese renglón queda además en los errores del lote, con su
 * motivo. La nota aclaratoria de una indicación es de una sola versión: cualquier cambio posterior
 * de la indicación, aunque sea subir la receta, la deja vacía. Con la copia en la historia, el
 * texto importado no se pierde.
 *
 * Los valores normales los escribe la cuenta de la importación, con la fuente `importacion`. Si el
 * Paciente ya tiene valores normales para ese signo, no se pisan: lo importado queda en su
 * historia anterior.
 */

import { ErrorConMotivo } from './errorConMotivo.js';
import { alcanzaLaInformacionDeSalud } from './alcanceDeLaSalud.js';
import { valorDesdeFila } from './importacionIA.js';
import { abrirPedido } from './pedidosDeImportacion.js';
import {
  anotarEnLaHistoria, columnasSinLugar, fechaOVacia, guardarColumnasSinLugar, pacientePorDocumento, pedirLaPersona,
  renglonEntero,
} from './historiaAnterior.js';
import { SIGNOS_VITALES } from './lecturaIA.js';
import { documentoParaFirmar, pideLaFirma } from './consentimientoMedicacion.js';
import { idiomaDePais } from '../i18n/idiomas.js';

export const CAMPOS_DE_LA_MEDICACION = ['medicamento', 'dosis', 'frecuencia', 'via', 'fechaDesde', 'fechaHasta', 'nota'];
export const CAMPOS_DEL_RANGO = ['signo', 'valorMin', 'valorMax', 'unidad'];

function texto(valor) {
  if (valor === null || valor === undefined) return '';
  return String(valor).trim();
}

// ─── Las vías de administración ─────────────────────────────────────────────────────────────

export async function viasDeAdministracion(db) {
  const { data, error } = await db.from('vias_administracion').select('id, clave').order('orden');
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** El texto de una vía como se compara: minúsculas, sin tildes y con guion bajo en los espacios. */
export function normalizarVia(valor) {
  return texto(valor).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_');
}

/** La vía que corresponde con certeza a un texto, o null. Sólo cuenta la coincidencia exacta. */
export function viaReconocida(vias, valor) {
  const buscada = normalizarVia(valor);
  if (!buscada) return null;
  return vias.find((v) => v.clave === buscada) ?? null;
}

export function sugerenciasDeVias(vias) {
  return vias.map((v) => ({ valor: v.id, etiqueta: v.clave }));
}

// ─── Qué le falta a una indicación ──────────────────────────────────────────────────────────

/**
 * Revisa los datos de una indicación sin abrir nada. Devuelve `{ falta }` con el campo, el motivo
 * y las sugerencias, o `{ lista }` con lo que se guarda. `datos.viaId` es la vía ya elegida al
 * contestar un pedido; si no, se reconoce desde `datos.via`.
 */
export function revisarMedicacion(vias, datos) {
  for (const campo of ['medicamento', 'dosis', 'frecuencia']) {
    if (!texto(datos[campo])) return { falta: { campo, motivo: 'campo_obligatorio', sugerencias: [] } };
  }
  const via = datos.viaId ? vias.find((v) => v.id === datos.viaId) : viaReconocida(vias, datos.via);
  if (!via) return { falta: { campo: 'via', motivo: 'via_no_reconocida', sugerencias: sugerenciasDeVias(vias) } };
  const fechaDesde = fechaOVacia(datos.fechaDesde);
  if (!fechaDesde) {
    return { falta: { campo: 'fechaDesde', motivo: texto(datos.fechaDesde) ? 'fecha_invalida' : 'campo_obligatorio', sugerencias: [] } };
  }
  const fechaHasta = texto(datos.fechaHasta) ? fechaOVacia(datos.fechaHasta) : null;
  if (texto(datos.fechaHasta) && !fechaHasta) return { falta: { campo: 'fechaHasta', motivo: 'fecha_invalida', sugerencias: [] } };
  return {
    lista: {
      medicamento: texto(datos.medicamento),
      dosis: texto(datos.dosis),
      frecuencia: texto(datos.frecuencia),
      via_administracion_id: via.id,
      fecha_desde: fechaDesde,
      fecha_hasta: fechaHasta,
      nota_aclaratoria: texto(datos.nota) || null,
    },
  };
}

/** Revisa los valores normales de un signo. Devuelve `{ falta }` o `{ lista }`. */
export function revisarRango(datos) {
  const signo = texto(datos.signo);
  if (!SIGNOS_VITALES.includes(signo)) {
    return { falta: { campo: 'signo', motivo: 'signo_no_reconocido', sugerencias: SIGNOS_VITALES.map((s) => ({ valor: s, etiqueta: s })) } };
  }
  const numero = (valor) => {
    const escrito = texto(valor).replace(',', '.');
    if (!escrito) return null;
    const n = Number(escrito);
    return Number.isFinite(n) ? n : Number.NaN;
  };
  const valorMin = numero(datos.valorMin);
  const valorMax = numero(datos.valorMax);
  for (const [campo, valor] of [['valorMin', valorMin], ['valorMax', valorMax]]) {
    if (valor === null) return { falta: { campo, motivo: 'campo_obligatorio', sugerencias: [] } };
    if (Number.isNaN(valor)) return { falta: { campo, motivo: 'numero_invalido', sugerencias: [] } };
  }
  if (valorMin > valorMax) return { falta: { campo: 'valorMax', motivo: 'rango_invertido', sugerencias: [] } };
  if (!texto(datos.unidad)) return { falta: { campo: 'unidad', motivo: 'campo_obligatorio', sugerencias: [] } };
  return { lista: { signo, valor_min: valorMin, valor_max: valorMax, unidad: texto(datos.unidad) } };
}

/** El pedido de un dato que le falta a una indicación o a un rango, con todo lo necesario para seguir. */
export function pedirElDato(ctx, { para, fila, falta, datos, pacienteId, clienteId, hoja, original = null }) {
  return abrirPedido(ctx.db, {
    prestadoraId: ctx.prestadoraId,
    importacionId: ctx.importacionId,
    fila,
    dato: 'dato',
    motivo: falta.motivo,
    valorOriginal: texto(datos[falta.campo]) || null,
    sugerencias: falta.sugerencias,
    pacienteId,
    clienteId,
    renglon: { para, campo: falta.campo, datos, pacienteId, clienteId, hoja, ...(original ? { original } : {}) },
  });
}

// ─── Cargar ─────────────────────────────────────────────────────────────────────────────────

function exigirLaSesion(ctx) {
  // Sin la sesión de quien importa no hay quién pueda escribir la indicación: falla cerrado.
  if (!ctx.conexionDeQuienPide || !ctx.usuarioPanelId) throw new ErrorConMotivo('sin_permiso');
  return ctx.conexionDeQuienPide;
}

export const SIN_ALCANCE_AL_PACIENTE = 'sin_alcance_al_paciente';

/** El renglón original de una indicación, en la historia anterior del Paciente. */
function copiarEnLaHistoria(ctx, { pacienteId, fila, hoja, valor, original, datos }) {
  return anotarEnLaHistoria(ctx, {
    pacienteId, fila, hoja, clase: 'otro', etiqueta: 'medicacion', valor: texto(valor) || null,
    datos: original && Object.keys(original).length ? original : datos ?? {},
  });
}

/**
 * Corta si la regla de salud no le deja a quien importa alcanzar a ese Paciente. Antes de cortar,
 * el renglón queda en la historia anterior del Paciente, así no se pierde.
 */
async function exigirElAlcance(ctx, { pacienteId, fila, hoja, valor, original, datos }) {
  const sesion = exigirLaSesion(ctx);
  if (!pacienteId) throw new ErrorConMotivo(SIN_ALCANCE_AL_PACIENTE);
  if (await alcanzaLaInformacionDeSalud(sesion, pacienteId)) return;
  await copiarEnLaHistoria(ctx, { pacienteId, fila, hoja, valor, original, datos });
  throw new ErrorConMotivo(SIN_ALCANCE_AL_PACIENTE);
}

/**
 * Guarda una indicación ya revisada, con su pedido de receta y, si la Prestadora la pide, su firma
 * pendiente. Antes deja el renglón original en la historia anterior del Paciente. Devuelve cuántos
 * pedidos abrió.
 */
export async function guardarMedicacion(ctx, { fila, hoja = null, lista, pacienteId, clienteId, original = null }) {
  const copia = { pacienteId, fila, hoja, valor: lista.medicamento, original, datos: lista };
  await exigirElAlcance(ctx, copia);
  await copiarEnLaHistoria(ctx, copia);
  const { data, error } = await ctx.db
    .from('indicaciones_medicacion')
    .insert({
      ...lista,
      prestadora_id: ctx.prestadoraId,
      paciente_id: pacienteId,
      cliente_id: clienteId,
      estado: 'aceptada',
      solicitado_por: ctx.usuarioPanelId,
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  const indicacionId = data.id;

  await abrirPedido(ctx.db, {
    prestadoraId: ctx.prestadoraId,
    importacionId: ctx.importacionId,
    fila,
    dato: 'receta',
    motivo: 'falta_la_receta',
    valorOriginal: lista.medicamento,
    pacienteId,
    clienteId,
    renglon: { para: 'receta', indicacion_id: indicacionId },
  });
  let pedidos = 1;

  if (await pideLaFirma({ prestadoraId: ctx.prestadoraId, db: ctx.db })) {
    const pais = ctx.pais ? await ctx.pais() : null;
    const documento = await documentoParaFirmar({ prestadoraId: ctx.prestadoraId, idioma: idiomaDePais(pais) });
    const { error: errorFirma } = await ctx.db.from('consentimientos_medicacion').insert({
      prestadora_id: ctx.prestadoraId,
      indicacion_id: indicacionId,
      documento_texto: documento.texto,
      documento_verificador: documento.verificador,
      documento_idioma: documento.idioma,
      cargado_por: ctx.usuarioPanelId,
    });
    if (errorFirma) throw new Error(errorFirma.message);
    await abrirPedido(ctx.db, {
      prestadoraId: ctx.prestadoraId,
      importacionId: ctx.importacionId,
      fila,
      dato: 'firma_medicacion',
      motivo: 'falta_la_firma',
      valorOriginal: lista.medicamento,
      pacienteId,
      clienteId,
      renglon: { para: 'firma_medicacion', indicacion_id: indicacionId },
    });
    pedidos += 1;
  }
  return { indicacionId, pedidos };
}

/**
 * Carga una indicación desde sus datos: si le falta algo, queda el pedido del dato. Devuelve
 * `{ creada, pedidos }`.
 */
export async function cargarMedicacion(ctx, { fila, hoja = null, datos, original = null, pacienteId, clienteId, vias = null }) {
  await exigirElAlcance(ctx, { pacienteId, fila, hoja, valor: datos?.medicamento, original, datos });
  const lasVias = vias ?? await viasDeAdministracion(ctx.db);
  const revisada = revisarMedicacion(lasVias, datos);
  if (revisada.falta) {
    await pedirElDato(ctx, { para: 'medicacion', fila, falta: revisada.falta, datos, pacienteId, clienteId, hoja, original });
    return { creada: false, pedidos: 1 };
  }
  const { pedidos } = await guardarMedicacion(ctx, { fila, hoja, lista: revisada.lista, pacienteId, clienteId, original });
  return { creada: true, pedidos };
}

async function rangoExistente(db, prestadoraId, pacienteId, signo) {
  const { data, error } = await db
    .from('rangos_referencia_vitales')
    .select('id')
    .eq('prestadora_id', prestadoraId)
    .eq('paciente_id', pacienteId)
    .eq('signo', signo)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

/** Guarda unos valores normales ya revisados, o los deja en la historia si ese signo ya tenía. */
export async function guardarRango(ctx, { fila, hoja = null, lista, pacienteId, datos }) {
  if (await rangoExistente(ctx.db, ctx.prestadoraId, pacienteId, lista.signo)) {
    await anotarEnLaHistoria(ctx, {
      pacienteId, fila, hoja, clase: 'otro', etiqueta: 'rango_vital', valor: lista.signo, datos: datos ?? {},
    });
    return { creada: true, enLaHistoria: true };
  }
  const { error } = await ctx.db.from('rangos_referencia_vitales').insert({
    ...lista,
    prestadora_id: ctx.prestadoraId,
    paciente_id: pacienteId,
    fuente: 'importacion',
  });
  if (error) throw new Error(error.message);
  return { creada: true, enLaHistoria: false };
}

export async function cargarRango(ctx, { fila, hoja = null, datos, pacienteId, clienteId = null }) {
  const revisado = revisarRango(datos);
  if (revisado.falta) {
    await pedirElDato(ctx, { para: 'rango_vital', fila, falta: revisado.falta, datos, pacienteId, clienteId, hoja });
    return { creada: false, pedidos: 1 };
  }
  await guardarRango(ctx, { fila, hoja, lista: revisado.lista, pacienteId, datos });
  return { creada: true, pedidos: 0 };
}

// ─── Hojas ──────────────────────────────────────────────────────────────────────────────────

function datosDelMapeo(fila, mapeo, campos) {
  return Object.fromEntries(campos.map((campo) => [campo, valorDesdeFila(fila, mapeo, campo, false) ?? '']));
}

function quienEscrito(fila, mapeo) {
  const partes = ['nombrePaciente', 'documentoPaciente']
    .map((campo) => texto(valorDesdeFila(fila, mapeo, campo, false)))
    .filter(Boolean);
  return partes.length ? partes.join(' · ') : null;
}

async function importarHoja(ctx, { hoja, filas, mapeo, campos, destino, cargar }) {
  let creadas = 0;
  let pedidos = 0;
  const errores = [];
  for (let i = 0; i < filas.length; i += 1) {
    const numero = i + 1;
    if (!Object.keys(renglonEntero(filas[i])).length) continue;
    const datos = datosDelMapeo(filas[i], mapeo, campos);
    try {
      const paciente = await pacientePorDocumento(ctx.db, ctx.prestadoraId, valorDesdeFila(filas[i], mapeo, 'documentoPaciente', false));
      if (!paciente) {
        await pedirLaPersona(ctx, {
          fila: numero,
          motivo: 'persona_no_encontrada',
          valorOriginal: quienEscrito(filas[i], mapeo),
          renglon: {
            destino, hoja: hoja.nombre, datos, original: renglonEntero(filas[i]), sobrantes: columnasSinLugar(filas[i], mapeo),
          },
        });
        pedidos += 1;
        continue;
      }
      const resultado = await cargar(ctx, { fila: numero, hoja: hoja.nombre, datos, original: renglonEntero(filas[i]), ...paciente });
      // Las columnas que no son de la indicación tampoco se pierden: van a la historia del Paciente.
      await guardarColumnasSinLugar(ctx, {
        tipo: destino, hoja, fila: numero, sobrantes: columnasSinLugar(filas[i], mapeo), alta: paciente,
      });
      if (resultado.creada) creadas += 1;
      pedidos += resultado.pedidos;
    } catch (error) {
      console.error(`Importación ${ctx.importacionId}, hoja ${hoja.indice}, fila ${numero}:`, error?.message ?? error);
      errores.push({ hoja: hoja.indice, fila: numero, motivo: error?.motivo ?? 'falla_del_sistema' });
    }
  }
  return { creadas, pedidos, errores };
}

/** Importa una hoja de medicación. Cada renglón entra, queda pedido o queda en los errores. */
export async function importarHojaDeMedicacion(ctx, { hoja, filas, mapeo }) {
  exigirLaSesion(ctx);
  const vias = await viasDeAdministracion(ctx.db);
  return importarHoja(ctx, {
    hoja, filas, mapeo, campos: CAMPOS_DE_LA_MEDICACION, destino: 'medicacion',
    cargar: (c, args) => cargarMedicacion(c, { ...args, vias }),
  });
}

/** Importa una hoja de valores normales de signos vitales. */
export function importarHojaDeRangos(ctx, { hoja, filas, mapeo }) {
  return importarHoja(ctx, {
    hoja, filas, mapeo, campos: CAMPOS_DEL_RANGO, destino: 'rango_vital', cargar: cargarRango,
  });
}
