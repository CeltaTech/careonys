/*
 * La historia anterior que trae una importación.
 *
 * Lo que una Prestadora tenía antes de usar el producto no se pierde aunque no tenga un lugar
 * propio: guardias, reportes, internaciones, facturas, cobros y deudas viejas, las columnas de
 * una planilla que no corresponden a ningún dato, y los documentos sueltos. Todo se guarda con el
 * renglón entero, con los nombres de las columnas como estaban, en tres lugares:
 *
 * - la historia anterior del Paciente: guardias, reportes, internaciones, documentos, lo
 *   encontrado en un documento y las columnas sin lugar de un Cliente o un Paciente;
 * - los antecedentes del Legajo: las guardias de un Asistente y sus columnas sin lugar;
 * - los antecedentes del Cliente: facturas, cobros y deudas.
 *
 * Un renglón del que no se sabe de quién es no se adivina: queda como pedido `persona`, con el
 * renglón entero guardado, y se anota cuando la Prestadora dice de quién es.
 *
 * Todo corre con la cuenta de la importación, nombrando siempre la Prestadora y el lote.
 */

import { fechaDeLaCelda, valorDesdeFila } from './importacionIA.js';
import { abrirPedido } from './pedidosDeImportacion.js';
import { guardarDocumento } from './originalesDeImportacion.js';

export const CLASES_DEL_PACIENTE = ['guardia', 'reporte', 'internacion'];
export const CLASES_DEL_CLIENTE = ['factura', 'cobro', 'deuda'];

/** Un número de documento sin espacios, puntos ni guiones. */
export function documentoLimpio(valor) {
  const limpio = String(valor ?? '').replace(/[\s.\-/]/g, '').trim();
  return limpio || null;
}

/** La fecha de una celda, o null si no se entiende. La celda sigue entera en los datos. */
export function fechaOVacia(valor) {
  if (valor === undefined || valor === null || String(valor).trim() === '') return null;
  try {
    return fechaDeLaCelda(valor) ?? null;
  } catch {
    return null;
  }
}

/** El renglón como se guarda: cada columna con su valor, sin las vacías. */
export function renglonEntero(fila) {
  const datos = {};
  for (const [columna, valor] of Object.entries(fila ?? {})) {
    if (valor === undefined || valor === null || String(valor).trim() === '') continue;
    datos[columna] = valor;
  }
  return datos;
}

// ─── Quién es quién ─────────────────────────────────────────────────────────────────────────

async function personasConDocumento(db, prestadoraId, documento) {
  const { data, error } = await db
    .from('personas')
    .select('id')
    .eq('prestadora_id', prestadoraId)
    .eq('documento_numero', documento);
  if (error) throw new Error(error.message);
  return (data ?? []).map((p) => p.id);
}

/** El Paciente de la Prestadora con ese documento, con su Cliente, o null si no hay uno solo. */
export async function pacientePorDocumento(db, prestadoraId, valor) {
  const documento = documentoLimpio(valor);
  if (!documento) return null;
  const personas = await personasConDocumento(db, prestadoraId, documento);
  if (!personas.length) return null;
  const { data, error } = await db
    .from('pacientes')
    .select('id, cliente_id')
    .eq('prestadora_id', prestadoraId)
    .in('persona_id', personas)
    .is('deleted_at', null);
  if (error) throw new Error(error.message);
  return data?.length === 1 ? { pacienteId: data[0].id, clienteId: data[0].cliente_id } : null;
}

/** El Asistente de la Prestadora con ese documento, o null si no hay uno solo. */
export async function asistentePorDocumento(db, prestadoraId, valor) {
  const documento = documentoLimpio(valor);
  if (!documento) return null;
  const { data, error } = await db
    .from('asistentes')
    .select('id')
    .eq('prestadora_id', prestadoraId)
    .eq('documento_numero', documento)
    .is('deleted_at', null);
  if (error) throw new Error(error.message);
  return data?.length === 1 ? data[0].id : null;
}

/** El Cliente de la Prestadora cuyo Contratante tiene ese documento, o null si no hay uno solo. */
export async function clientePorDocumento(db, prestadoraId, valor) {
  const documento = documentoLimpio(valor);
  if (!documento) return null;
  const personas = await personasConDocumento(db, prestadoraId, documento);
  if (!personas.length) return null;
  const { data, error } = await db
    .from('clientes')
    .select('id')
    .eq('prestadora_id', prestadoraId)
    .in('contratante_persona_id', personas)
    .is('deleted_at', null);
  if (error) throw new Error(error.message);
  return data?.length === 1 ? data[0].id : null;
}

/** Comprueba que un identificador contestado sea de esa Prestadora. */
export async function esDeLaPrestadora(db, prestadoraId, tabla, id) {
  if (!id) return false;
  const { data, error } = await db.from(tabla).select('id').eq('id', id).eq('prestadora_id', prestadoraId).maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

// ─── Anotar ─────────────────────────────────────────────────────────────────────────────────

async function insertar(db, tabla, fila) {
  const { data, error } = await db.from(tabla).insert(fila).select('id').single();
  if (error) throw new Error(error.message);
  return data.id;
}

function comun(ctx, { fila = null, hoja = null, clase, etiqueta = null, valor = null, datos, fecha = null }) {
  return {
    prestadora_id: ctx.prestadoraId,
    importacion_id: ctx.importacionId,
    fila,
    hoja,
    clase,
    etiqueta,
    valor: valor === null || valor === undefined ? null : String(valor),
    datos: datos ?? {},
    fecha,
  };
}

export function anotarEnLaHistoria(ctx, { pacienteId, documento = null, ...resto }) {
  return insertar(ctx.db, 'historia_anterior_del_paciente', {
    ...comun(ctx, resto),
    paciente_id: pacienteId,
    documento_ruta: documento?.ruta ?? null,
    documento_nombre: documento?.nombre ?? null,
    documento_tipo: documento?.tipo ?? null,
  });
}

export function anotarEnElLegajo(ctx, { asistenteId, pacienteId = null, ...resto }) {
  return insertar(ctx.db, 'antecedentes_del_legajo', { ...comun(ctx, resto), asistente_id: asistenteId, paciente_id: pacienteId });
}

export function anotarEnElCliente(ctx, { clienteId, ...resto }) {
  return insertar(ctx.db, 'antecedentes_del_cliente', { ...comun(ctx, resto), cliente_id: clienteId });
}

/**
 * Anota un renglón de historia donde corresponde según su clase y de quién es. Devuelve cuántas
 * anotaciones hizo; cero quiere decir que falta saber de quién es.
 *
 * - guardia, reporte, internación: en la historia del Paciente; la guardia, además, en el Legajo
 *   del Asistente, si se sabe quién es;
 * - factura, cobro, deuda: en los antecedentes del Cliente, o del Cliente del Paciente;
 * - otro: en el primero que se sepa, Paciente, Asistente o Cliente.
 */
export async function anotarRenglonDeHistoria(ctx, { clase, quien, hoja, fila, datos, fecha }) {
  const { pacienteId = null, asistenteId = null } = quien;
  const clienteId = quien.clienteId ?? null;
  const comunes = { hoja, fila, datos, fecha };
  if (CLASES_DEL_PACIENTE.includes(clase)) {
    if (!pacienteId) return 0;
    await anotarEnLaHistoria(ctx, { ...comunes, clase, pacienteId });
    if (clase === 'guardia' && asistenteId) {
      await anotarEnElLegajo(ctx, { ...comunes, clase: 'guardia', asistenteId, pacienteId });
      return 2;
    }
    return 1;
  }
  if (CLASES_DEL_CLIENTE.includes(clase)) {
    if (!clienteId) return 0;
    await anotarEnElCliente(ctx, { ...comunes, clase, clienteId });
    return 1;
  }
  if (pacienteId) { await anotarEnLaHistoria(ctx, { ...comunes, clase: 'otro', pacienteId }); return 1; }
  if (asistenteId) { await anotarEnElLegajo(ctx, { ...comunes, clase: 'otro', asistenteId }); return 1; }
  if (clienteId) { await anotarEnElCliente(ctx, { ...comunes, clase: 'otro', clienteId }); return 1; }
  return 0;
}

/** De quién es un renglón de historia, según los documentos que trae. */
export async function quienDeLaHistoria(ctx, { fila, mapeo }) {
  const valor = (campo) => valorDesdeFila(fila, mapeo, campo, false);
  const paciente = await pacientePorDocumento(ctx.db, ctx.prestadoraId, valor('documentoPaciente'));
  const asistenteId = await asistentePorDocumento(ctx.db, ctx.prestadoraId, valor('documentoAsistente'));
  const clienteDelContacto = await clientePorDocumento(ctx.db, ctx.prestadoraId, valor('documentoContacto'));
  return {
    pacienteId: paciente?.pacienteId ?? null,
    asistenteId,
    clienteId: clienteDelContacto ?? paciente?.clienteId ?? null,
  };
}

/** El nombre escrito de quien no se encontró, para mostrarlo en el pedido. */
function quienEscrito(fila, mapeo) {
  const partes = ['nombrePaciente', 'documentoPaciente', 'nombreAsistente', 'documentoAsistente', 'documentoContacto']
    .map((campo) => valorDesdeFila(fila, mapeo, campo, false))
    .filter((v) => v !== undefined && v !== null && String(v).trim() !== '');
  return partes.length ? partes.join(' · ') : null;
}

/** El pedido de un renglón del que no se sabe de quién es, con el renglón entero guardado. */
export function pedirLaPersona(ctx, { fila, motivo, valorOriginal, renglon }) {
  return abrirPedido(ctx.db, {
    prestadoraId: ctx.prestadoraId,
    importacionId: ctx.importacionId,
    fila,
    dato: 'persona',
    motivo,
    valorOriginal,
    renglon: { para: 'persona', ...renglon },
  });
}

/**
 * Importa una hoja de historia anterior. Cada renglón se anota donde corresponde o queda como
 * pedido `persona`; ninguno queda afuera.
 */
export async function importarHojaDeHistoria(ctx, { hoja, filas, mapeo, clase }) {
  const claseDeLaHoja = clase ?? 'otro';
  let creadas = 0;
  let pedidos = 0;
  const errores = [];
  for (let i = 0; i < filas.length; i += 1) {
    const numero = i + 1;
    const datos = renglonEntero(filas[i]);
    if (!Object.keys(datos).length) continue;
    const fecha = fechaOVacia(valorDesdeFila(filas[i], mapeo, 'fecha', false));
    try {
      const quien = await quienDeLaHistoria(ctx, { fila: filas[i], mapeo });
      const anotadas = await anotarRenglonDeHistoria(ctx, { clase: claseDeLaHoja, quien, hoja: hoja.nombre, fila: numero, datos, fecha });
      if (anotadas) {
        creadas += 1;
      } else {
        await pedirLaPersona(ctx, {
          fila: numero,
          motivo: 'persona_no_encontrada',
          valorOriginal: quienEscrito(filas[i], mapeo),
          renglon: { destino: 'historia', clase: claseDeLaHoja, hoja: hoja.nombre, datos, fecha, quien },
        });
        pedidos += 1;
      }
    } catch (error) {
      console.error(`Importación ${ctx.importacionId}, hoja ${hoja.indice}, fila ${numero}:`, error?.message ?? error);
      errores.push({ hoja: hoja.indice, fila: numero, motivo: error?.motivo ?? 'falla_del_sistema' });
    }
  }
  return { creadas, pedidos, errores };
}

// ─── Columnas sin lugar ─────────────────────────────────────────────────────────────────────

/** Las columnas de un renglón que el mapeo no llevó a ningún dato, con su valor. */
export function columnasSinLugar(fila, mapeo) {
  const sobrantes = {};
  for (const [columna, valor] of Object.entries(fila ?? {})) {
    if (mapeo?.[columna]) continue;
    if (valor === undefined || valor === null || String(valor).trim() === '') continue;
    sobrantes[columna] = valor;
  }
  return sobrantes;
}

/**
 * Guarda las columnas sin lugar de un renglón de personas: las de un Asistente en su Legajo, las
 * de un Cliente o un Servicio en la historia del Paciente. Si la persona todavía no entró —el
 * renglón quedó esperando un dato—, queda un pedido `persona` con esas columnas.
 */
export async function guardarColumnasSinLugar(ctx, { tipo, hoja, fila, sobrantes, alta }) {
  if (!Object.keys(sobrantes).length) return 0;
  const comunes = { hoja: hoja.nombre, fila, clase: 'columna_sin_lugar', datos: sobrantes };
  if (tipo === 'asistente' && alta?.asistenteId) {
    await anotarEnElLegajo(ctx, { ...comunes, asistenteId: alta.asistenteId });
    return 1;
  }
  if (tipo !== 'asistente' && alta?.pacienteId) {
    await anotarEnLaHistoria(ctx, { ...comunes, pacienteId: alta.pacienteId });
    return 1;
  }
  await pedirLaPersona(ctx, {
    fila,
    motivo: 'persona_no_encontrada',
    valorOriginal: null,
    renglon: { destino: 'columna_sin_lugar', tipo, hoja: hoja.nombre, datos: sobrantes },
  });
  return 0;
}

// ─── Documentos ─────────────────────────────────────────────────────────────────────────────

/**
 * Guarda un documento en la historia del Paciente, y lo encontrado en él como anotaciones
 * `hallazgo`, cada una con su pedido para que la Prestadora la confirme o la descarte.
 */
export async function importarDocumento(ctx, { pacienteId, archivo, texto = null, hallazgos = [] }) {
  const ruta = await guardarDocumento(ctx.db, {
    prestadoraId: ctx.prestadoraId, pacienteId, loteId: ctx.importacionId, archivo,
  });
  const documentoId = await anotarEnLaHistoria(ctx, {
    pacienteId,
    fila: 1,
    clase: 'documento',
    etiqueta: archivo.originalname,
    datos: texto ? { texto } : {},
    documento: { ruta, nombre: archivo.originalname, tipo: archivo.mimetype || 'application/octet-stream' },
  });
  let pedidos = 0;
  for (const hallazgo of hallazgos) {
    const hallazgoId = await anotarEnLaHistoria(ctx, {
      pacienteId,
      fila: 1,
      clase: 'hallazgo',
      etiqueta: hallazgo.tipo,
      valor: hallazgo.valores.medicamento || hallazgo.valores.signo || null,
      datos: { ...hallazgo, documentoId },
    });
    await abrirPedido(ctx.db, {
      prestadoraId: ctx.prestadoraId,
      importacionId: ctx.importacionId,
      fila: 1,
      dato: 'hallazgo',
      motivo: hallazgo.tipo,
      valorOriginal: hallazgo.donde?.fragmento || null,
      pacienteId,
      renglon: { para: 'hallazgo', hallazgo_id: hallazgoId },
    });
    pedidos += 1;
  }
  return { documentoId, pedidos };
}
