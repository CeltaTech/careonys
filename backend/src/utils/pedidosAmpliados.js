/*
 * Las respuestas a los pedidos de la importación que no son de una persona nueva.
 *
 * - `persona`: de quién es un renglón guardado. Se contesta con `{ pacienteId }`, `{ asistenteId }`
 *   o `{ clienteId }`, que tienen que ser de la Prestadora, y el renglón se anota donde iba.
 * - `hallazgo`: lo encontrado en un documento. `{ confirmar: true, valores }` crea la indicación o
 *   los valores normales; `{ confirmar: false }` lo descarta, y la anotación queda en la historia.
 * - `renglones`: los renglones contados que no se leyeron. Se cierra con `{ conforme: true }`.
 * - `firma_medicacion`: la firma de una medicación importada, que se obtuvo por fuera. Se cierra
 *   con `{ resuelto: true }`.
 * - `receta`: se contesta subiendo el archivo, por su propia ruta; acá no.
 * - `medicacion` y `rango_vital`: el dato que faltaba. Si queda bien y falta otro, el pedido pasa
 *   a ser del que falta.
 *
 * Lo que entra queda en el lote del pedido: `ctx` ya viene con ese lote.
 */

import { ErrorConMotivo } from './errorConMotivo.js';
import { reemplazarPedido } from './pedidosDeImportacion.js';
import {
  anotarEnElCliente, anotarEnElLegajo, anotarEnLaHistoria, anotarRenglonDeHistoria, esDeLaPrestadora,
} from './historiaAnterior.js';
import {
  CAMPOS_DE_LA_MEDICACION, CAMPOS_DEL_RANGO, cargarMedicacion, cargarRango, guardarMedicacion, guardarRango,
  revisarMedicacion, revisarRango, viasDeAdministracion,
} from './medicacionImportada.js';

const respuestaInvalida = () => new ErrorConMotivo('respuesta_invalida');

function identificador(valor) {
  return typeof valor === 'string' && valor.trim() ? valor.trim() : null;
}

async function clienteDelPaciente(ctx, pacienteId) {
  const { data, error } = await ctx.db
    .from('pacientes')
    .select('cliente_id')
    .eq('id', pacienteId)
    .eq('prestadora_id', ctx.prestadoraId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new ErrorConMotivo('persona_no_encontrada');
  return data.cliente_id ?? null;
}

/** Lo contestado en un pedido `persona`, comprobado contra la Prestadora. Falla cerrado. */
async function quienContestado(ctx, valor) {
  const pacienteId = identificador(valor?.pacienteId);
  const asistenteId = identificador(valor?.asistenteId);
  const clienteId = identificador(valor?.clienteId);
  if (!pacienteId && !asistenteId && !clienteId) throw respuestaInvalida();
  const comprobar = async (tabla, id) => {
    if (id && !(await esDeLaPrestadora(ctx.db, ctx.prestadoraId, tabla, id))) throw new ErrorConMotivo('persona_no_encontrada');
  };
  await comprobar('pacientes', pacienteId);
  await comprobar('asistentes', asistenteId);
  await comprobar('clientes', clienteId);
  return {
    pacienteId,
    asistenteId,
    clienteId: clienteId ?? (pacienteId ? await clienteDelPaciente(ctx, pacienteId) : null),
  };
}

async function guardarSobrantes(ctx, { pacienteId, fila, hoja, sobrantes }) {
  if (!sobrantes || !Object.keys(sobrantes).length) return;
  await anotarEnLaHistoria(ctx, { pacienteId, fila, hoja, clase: 'columna_sin_lugar', datos: sobrantes });
}

async function responderPersona(ctx, pedido, valor) {
  const renglon = pedido.renglon ?? {};
  const quien = await quienContestado(ctx, valor);
  const comunes = { hoja: renglon.hoja ?? null, fila: pedido.fila };

  if (renglon.destino === 'historia') {
    const anotadas = await anotarRenglonDeHistoria(ctx, {
      clase: renglon.clase ?? 'otro', quien, ...comunes, datos: renglon.datos ?? {}, fecha: renglon.fecha ?? null,
    });
    // La persona contestada no es de la clase que pide el renglón: una factura sin Cliente, una
    // guardia sin Paciente. El pedido queda abierto.
    if (!anotadas) throw respuestaInvalida();
    return {};
  }

  if (renglon.destino === 'columna_sin_lugar') {
    const datos = renglon.datos ?? {};
    if (renglon.tipo === 'asistente') {
      if (!quien.asistenteId) throw respuestaInvalida();
      await anotarEnElLegajo(ctx, { ...comunes, clase: 'columna_sin_lugar', datos, asistenteId: quien.asistenteId });
    } else if (quien.pacienteId) {
      await anotarEnLaHistoria(ctx, { ...comunes, clase: 'columna_sin_lugar', datos, pacienteId: quien.pacienteId });
    } else if (quien.clienteId) {
      await anotarEnElCliente(ctx, { ...comunes, clase: 'otro', datos, clienteId: quien.clienteId });
    } else {
      throw respuestaInvalida();
    }
    return {};
  }

  if (renglon.destino === 'medicacion' || renglon.destino === 'rango_vital') {
    if (!quien.pacienteId) throw respuestaInvalida();
    const args = {
      fila: pedido.fila, hoja: renglon.hoja ?? null, datos: renglon.datos ?? {}, original: renglon.original ?? null,
      pacienteId: quien.pacienteId, clienteId: quien.clienteId,
    };
    if (renglon.destino === 'medicacion') await cargarMedicacion(ctx, args);
    else await cargarRango(ctx, args);
    await guardarSobrantes(ctx, { pacienteId: quien.pacienteId, fila: pedido.fila, hoja: renglon.hoja ?? null, sobrantes: renglon.sobrantes });
    return {};
  }

  throw respuestaInvalida();
}

/** Lo encontrado en un documento, leído con la cuenta de la importación de esa Prestadora. */
export async function leerHallazgo(db, prestadoraId, hallazgoId) {
  if (!identificador(hallazgoId)) return null;
  const { data, error } = await db
    .from('historia_anterior_del_paciente')
    .select('id, paciente_id, etiqueta, datos')
    .eq('id', hallazgoId)
    .eq('prestadora_id', prestadoraId)
    .eq('clase', 'hallazgo')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

async function responderHallazgo(ctx, pedido, valor) {
  if (valor?.confirmar === false) return {};
  if (valor?.confirmar !== true) throw respuestaInvalida();
  const hallazgo = await leerHallazgo(ctx.db, ctx.prestadoraId, pedido.renglon?.hallazgo_id);
  if (!hallazgo) throw new ErrorConMotivo('pedido_inexistente');
  const tipo = hallazgo.datos?.tipo ?? hallazgo.etiqueta;
  const campos = tipo === 'medicacion' ? CAMPOS_DE_LA_MEDICACION : tipo === 'rango_vital' ? CAMPOS_DEL_RANGO : null;
  if (!campos) throw respuestaInvalida();

  // Lo que la Prestadora corrigió manda sobre lo leído; lo que no tocó queda como se leyó.
  const leidos = hallazgo.datos?.valores ?? {};
  const corregidos = valor.valores && typeof valor.valores === 'object' ? valor.valores : {};
  const datos = Object.fromEntries(campos.map((c) => [c, Object.hasOwn(corregidos, c) ? corregidos[c] : leidos[c] ?? '']));
  const pacienteId = hallazgo.paciente_id;
  const clienteId = await clienteDelPaciente(ctx, pacienteId);
  const args = { fila: pedido.fila, hoja: null, datos, pacienteId, clienteId };

  const revisado = tipo === 'medicacion'
    ? revisarMedicacion(await viasDeAdministracion(ctx.db), datos)
    : revisarRango(datos);
  // Confirmado con un dato que falta o que no se entiende: el pedido queda abierto y la Prestadora
  // ve cuál es.
  if (revisado.falta) throw new ErrorConMotivo(revisado.falta.motivo);
  if (tipo === 'medicacion') {
    await guardarMedicacion(ctx, { fila: args.fila, lista: revisado.lista, pacienteId, clienteId, original: hallazgo.datos?.valores ?? datos });
  }
  else await guardarRango(ctx, { ...args, lista: revisado.lista });
  return {};
}

/** El dato que faltaba en una indicación o en unos valores normales. */
async function responderDatoQueFaltaba(ctx, pedido, valor) {
  const renglon = pedido.renglon ?? {};
  const { campo } = renglon;
  const escrito = typeof valor === 'string' ? valor.trim() : typeof valor === 'number' ? String(valor) : '';
  if (!campo || !escrito) throw respuestaInvalida();
  const esMedicacion = renglon.para === 'medicacion';
  const vias = esMedicacion ? await viasDeAdministracion(ctx.db) : null;

  const datos = { ...(renglon.datos ?? {}) };
  if (esMedicacion && campo === 'via') {
    if (!vias.some((v) => v.id === escrito)) throw respuestaInvalida();
    datos.viaId = escrito;
  } else {
    datos[campo] = escrito;
  }

  const revisado = esMedicacion ? revisarMedicacion(vias, datos) : revisarRango(datos);
  if (revisado.falta) {
    if (revisado.falta.campo === campo) throw new ErrorConMotivo(revisado.falta.motivo);
    await reemplazarPedido(ctx, pedido, {
      motivo: revisado.falta.motivo,
      valorOriginal: datos[revisado.falta.campo] ?? null,
      sugerencias: revisado.falta.sugerencias,
      renglon: { ...renglon, datos, campo: revisado.falta.campo },
    });
    return { reemplazado: true };
  }

  const { pacienteId, clienteId = null, hoja = null } = renglon;
  if (!pacienteId) throw respuestaInvalida();
  if (esMedicacion) {
    await guardarMedicacion(ctx, {
      fila: pedido.fila, hoja, lista: revisado.lista, pacienteId, clienteId, original: renglon.original ?? renglon.datos ?? null,
    });
  }
  else await guardarRango(ctx, { fila: pedido.fila, hoja, lista: revisado.lista, pacienteId, datos });
  return {};
}

/**
 * Contesta un pedido ampliado. Es la `deps.responderAmpliado` que espera `responderPedido`.
 * Devuelve `{ reemplazado: true }` cuando el pedido pasó a ser de otro dato.
 */
export async function responderAmpliado(ctx, pedido, valor) {
  switch (pedido.renglon?.para) {
    case 'persona':
      return responderPersona(ctx, pedido, valor);
    case 'hallazgo':
      return responderHallazgo(ctx, pedido, valor);
    case 'renglones':
      if (valor?.conforme !== true) throw respuestaInvalida();
      return {};
    case 'firma_medicacion':
      if (valor?.resuelto !== true) throw respuestaInvalida();
      return {};
    case 'medicacion':
    case 'rango_vital':
      return responderDatoQueFaltaba(ctx, pedido, valor);
    default:
      // `receta` se contesta subiendo el archivo.
      throw respuestaInvalida();
  }
}
