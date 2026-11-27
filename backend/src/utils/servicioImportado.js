/*
 * La importación de Servicios en curso.
 *
 * Cada renglón de la planilla es un turno de guardia semanal fijo de un Servicio que la Prestadora
 * ya presta. Los renglones del mismo Cliente y el mismo Paciente arman un solo Servicio, una sola
 * Prestación con el precio de lista, un cronograma de guardias con varias guardias, y una serie de
 * turnos de guardia por renglón, con su Asistente.
 *
 * Cada renglón avanza paso a paso hasta donde lo dejan sus datos:
 *   1. el tipo de servicio y la modalidad, contra la lista de precios que rige hoy;
 *   2. la Prestación del Paciente con ese precio;
 *   3. los días y el horario, leídos del texto de la planilla;
 *   4. el Coordinador del Servicio, sin el cual la base no deja programar turnos;
 *   5. la guardia en el cronograma y la serie de turnos de guardia que la usa, juntas: si la base
 *      rechaza la serie, la guardia que se acababa de agregar se quita. En el cronograma no queda
 *      ninguna guardia sin serie;
 *   6. el Asistente, buscado sólo por su CUIL en el Padrón, nunca por el nombre.
 * Donde un dato falta o está en duda, el renglón se detiene y queda un pedido de dato. Al
 * contestarlo, el renglón sigue desde ese paso. Lo que ya se hizo no se repite.
 *
 * La serie se crea aunque el Asistente no se encuentre: los turnos quedan sin cubrir y el pedido
 * del Asistente sigue abierto.
 *
 * Las dependencias llegan en `ctx`, igual que en `pedidosDeImportacion.js`, más:
 *   hoy                         la fecha de hoy en la Prestadora, AAAA-MM-DD
 *   leerHorarios(textos) → Map  el lector de horarios de la importación
 *   motivoDeLaAsignacion(error) qué rechazó la base al asignar un Asistente
 */

import { ErrorConMotivo } from './errorConMotivo.js';
import { fechaDeLaCelda } from './importacionIA.js';
import { textoComparable } from './localidadesDeLaImportacion.js';
import { DIAS } from './lectorDeHorarios.js';
import {
  abrirPedido, reemplazarPedido, altaConPedidos, quienDelRenglon,
  coordinadoresDeLaPrestadora, sugerenciasDeCoordinadores, sugerenciasDeAsistentes,
  listaQueRige, sugerenciasDeLaLista, etiquetaDeLaLista,
} from './pedidosDeImportacion.js';

const respuestaInvalida = () => new ErrorConMotivo('respuesta_invalida');

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

// Lo que la base contesta al crear la serie y que tiene arreglo cambiando el horario.
const RECHAZOS_DEL_HORARIO = [
  'turno_guardia_fuera_del_cronograma', 'fuera_del_periodo_del_servicio',
  'faltan_dias_de_la_semana', 'falta_un_dato',
];

function soloDigitos(valor) {
  return String(valor ?? '').replace(/\D/g, '');
}

function escrito(valor) {
  if (valor === null || valor === undefined) return '';
  return String(valor).trim();
}

function textoDelHorario(dias, horario) {
  return [dias, horario].map(escrito).filter(Boolean).join(' ');
}

// La fecha de inicio del renglón. La que no se entiende no se adivina ni se descarta: queda su
// texto, y el Servicio espera a que la Prestadora la escriba.
function fechaDelRenglon(valor) {
  try {
    return { vigenteDesde: fechaDeLaCelda(valor) ?? null, fechaIlegible: null };
  } catch (error) {
    if (error?.motivo !== 'fecha_invalida') throw error;
    return { vigenteDesde: null, fechaIlegible: escrito(valor) };
  }
}

// ---------------------------------------------------------------------------------------------
// Los renglones de la planilla
// ---------------------------------------------------------------------------------------------

/** La clave que junta los renglones de un mismo Cliente con un mismo Paciente. */
export function claveDelServicio(datos) {
  const contratante = soloDigitos(datos.documentoContacto)
    || textoComparable(`${escrito(datos.nombreContacto)} ${escrito(datos.apellidoContacto)}`);
  const paciente = soloDigitos(datos.documentoPaciente) || textoComparable(datos.nombrePaciente);
  return `${contratante}|${paciente}`;
}

/** Lo que cada renglón dice de su turno de guardia. */
export function guardiaDelRenglon(fila, datos) {
  return {
    fila,
    tipoServicio: escrito(datos.tipoServicio),
    modalidad: escrito(datos.modalidad),
    textoHorario: textoDelHorario(datos.dias, datos.horario),
    cuil: soloDigitos(datos.cuilAsistente),
    ...fechaDelRenglon(datos.vigenteDesde),
    coordinador: escrito(datos.coordinador),
  };
}

/**
 * Junta los renglones por Cliente y Paciente, en el orden en que aparecen.
 * @param {{ fila: number, datos: object, localidad?: object }[]} renglones
 */
export function agruparRenglones(renglones) {
  const grupos = new Map();
  for (const renglon of renglones) {
    const clave = claveDelServicio(renglon.datos);
    if (!grupos.has(clave)) grupos.set(clave, { ...renglon, guardias: [] });
    grupos.get(clave).guardias.push(guardiaDelRenglon(renglon.fila, renglon.datos));
  }
  return [...grupos.values()];
}

// ---------------------------------------------------------------------------------------------
// Lo que se busca en la base
// ---------------------------------------------------------------------------------------------

/** El Coordinador nombrado en la planilla, sólo si el nombre, el correo o el usuario coinciden con uno solo. */
export function coordinadorNombrado(coordinadores, texto) {
  const buscado = textoComparable(texto);
  if (!buscado) return null;
  const coinciden = coordinadores.filter((c) => [c.nombre, c.email, c.nombre_de_usuario]
    .some((v) => v && textoComparable(v) === buscado));
  return coinciden.length === 1 ? coinciden[0] : null;
}

/** El renglón de la lista de precios que nombra la planilla, sólo si es uno solo. */
export function renglonDeLaLista(lista, tipoServicio, modalidad) {
  const tipo = textoComparable(tipoServicio);
  if (!tipo) return null;
  let coinciden = lista.filter((r) => textoComparable(r.tipo_servicio) === tipo);
  const deLaModalidad = textoComparable(modalidad);
  if (deLaModalidad) coinciden = coinciden.filter((r) => textoComparable(r.modalidad) === deLaModalidad);
  return coinciden.length === 1 ? coinciden[0] : null;
}

async function asistentePorCuil(ctx, cuil) {
  const { data, error } = await ctx.db
    .from('asistentes')
    .select('id')
    .eq('prestadora_id', ctx.prestadoraId)
    .eq('documento_numero', cuil)
    .eq('estado', 'activo')
    .eq('pendiente_conformidad', false)
    .is('deleted_at', null)
    .limit(2);
  if (error) throw new Error(error.message);
  return data?.length === 1 ? data[0].id : null;
}

async function asistenteDelPadron(ctx, id) {
  const { data, error } = await ctx.db
    .from('asistentes')
    .select('id')
    .eq('id', id)
    .eq('prestadora_id', ctx.prestadoraId)
    .eq('estado', 'activo')
    .eq('pendiente_conformidad', false)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

async function coordinadorDelServicio(ctx, servicioId) {
  const { data, error } = await ctx.db
    .from('servicios')
    .select('coordinador_id')
    .eq('id', servicioId)
    .eq('prestadora_id', ctx.prestadoraId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.coordinador_id ?? null;
}

async function asignarCoordinador(ctx, servicioId, coordinadorId) {
  const { error } = await ctx.db
    .from('servicios')
    .update({ coordinador_id: coordinadorId, coordinador_asignado_por: ctx.usuarioPanelId })
    .eq('id', servicioId)
    .eq('prestadora_id', ctx.prestadoraId);
  if (error) throw new Error(error.message);
}

// Una sola lectura por tanda de lo que no cambia mientras se avanza.
function memoria(ctx) {
  let lista;
  let coordinador;
  return {
    lista: async () => {
      lista ??= await listaQueRige(ctx.db, ctx.prestadoraId, ctx.hoy);
      return lista;
    },
    coordinador: async (servicioId) => {
      if (!coordinador) coordinador = await coordinadorDelServicio(ctx, servicioId);
      return coordinador;
    },
    olvidarCoordinador: () => { coordinador = undefined; },
  };
}

// ---------------------------------------------------------------------------------------------
// Los pasos de cada guardia
// ---------------------------------------------------------------------------------------------

async function prestacionDeLaGuardia(ctx, servicio, renglonLista) {
  const { data: existente, error } = await ctx.db
    .from('prestaciones')
    .select('id')
    .eq('prestadora_id', ctx.prestadoraId)
    .eq('servicio_id', servicio.servicioId)
    .eq('paciente_id', servicio.pacienteId)
    .eq('precio_lista_id', renglonLista.id)
    .limit(1);
  if (error) throw new Error(error.message);
  if (existente?.length) return existente[0].id;

  const precio = Number(renglonLista.precio);
  const { data, error: errorAlta } = await ctx.db
    .from('prestaciones')
    .insert({
      prestadora_id: ctx.prestadoraId,
      servicio_id: servicio.servicioId,
      paciente_id: servicio.pacienteId,
      forma_de_precio: 'lista',
      tipo_servicio: etiquetaDeLaLista(renglonLista),
      precio_lista_id: renglonLista.id,
      precio_lista_snapshot: precio,
      precio_final: Math.round(precio * 100) / 100,
      moneda: renglonLista.moneda,
      configuracion: {},
      vigente_desde: servicio.vigenteDesde ?? ctx.hoy,
    })
    .select('id')
    .single();
  if (errorAlta) throw new Error(errorAlta.message);
  return data.id;
}

// La guardia del cronograma. Si ya está la misma, no se agrega otra. `agregada` dice si la agregó
// esta llamada: sólo ésa se puede quitar si la serie no se crea.
async function guardiaEnElCronograma(ctx, prestacionId, horario) {
  const { data: existentes, error } = await ctx.db
    .from('cronograma_de_guardias')
    .select('id, dias_semana, hora_inicio, hora_fin, dias_hasta_el_fin')
    .eq('prestadora_id', ctx.prestadoraId)
    .eq('prestacion_id', prestacionId);
  if (error) throw new Error(error.message);
  const dias = DIAS.filter((d) => horario.dias.includes(d));
  const hora = (h) => String(h ?? '').slice(0, 5);
  const igual = (existentes ?? []).some((g) => Array.isArray(g.dias_semana)
    && g.dias_semana.join(',') === dias.join(',')
    && hora(g.hora_inicio) === horario.horaInicio
    && hora(g.hora_fin) === horario.horaFin
    && Number(g.dias_hasta_el_fin) === Number(horario.diasHastaElFin));
  if (igual) return { ok: true, agregada: null };

  const { data: alta, error: errorAlta } = await ctx.db.from('cronograma_de_guardias').insert({
    prestadora_id: ctx.prestadoraId,
    prestacion_id: prestacionId,
    dias_semana: dias,
    fecha: null,
    hora_inicio: horario.horaInicio,
    hora_fin: horario.horaFin,
    dias_hasta_el_fin: Number(horario.diasHastaElFin),
  }).select('id').single();
  if (!errorAlta) return { ok: true, agregada: alta.id };
  // Un horario que la base no acepta se vuelve a pedir; cualquier otra falla es del sistema.
  if (errorAlta.code === '23514' || errorAlta.code === '22007' || errorAlta.code === '22P02') return { ok: false };
  throw new Error(errorAlta.message);
}

// Quita la guardia que se acababa de agregar al cronograma y no llegó a tener serie.
async function quitarGuardiaSinSerie(ctx, guardiaId) {
  const { error } = await ctx.db
    .from('cronograma_de_guardias')
    .delete()
    .eq('id', guardiaId)
    .eq('prestadora_id', ctx.prestadoraId);
  if (error) throw new Error(`No se pudo quitar la guardia sin serie ${guardiaId}: ${error.message}`);
}

/**
 * Lleva una guardia tan lejos como la dejan sus datos. Devuelve `null` si quedó entera —serie
 * creada y Asistente asignado—, o el pedido que la detiene: { dato, motivo, valorOriginal }.
 * La guardia se modifica en el lugar: lo que se hizo queda anotado en ella.
 */
export async function avanzarGuardia(ctx, servicio, guardia, horarios, mem = memoria(ctx)) {
  const g = guardia;
  const lista = await mem.lista();

  // 1. La lista de precios.
  let renglonLista = g.listaId ? lista.find((r) => String(r.id) === String(g.listaId)) : null;
  if (!renglonLista && !g.prestacionId) {
    renglonLista = renglonDeLaLista(lista, g.tipoServicio, g.modalidad);
    if (!renglonLista) {
      g.listaId = null;
      return {
        dato: 'tipo_servicio',
        motivo: g.tipoServicio ? 'tipo_servicio_no_reconocido' : 'faltan_datos',
        valorOriginal: [g.tipoServicio, g.modalidad].filter(Boolean).join(' — ') || null,
      };
    }
    g.listaId = renglonLista.id;
  }

  // 2. La Prestación.
  if (!g.prestacionId) {
    g.prestacionId = await prestacionDeLaGuardia(ctx, servicio, renglonLista);
    g.modalidadDeLaLista = renglonLista.modalidad ?? null;
  }

  // 3. Los días y el horario.
  if (!g.horario) {
    const leido = horarios?.get(g.textoHorario);
    if (!leido || leido.dudoso || !leido.dias?.length || !leido.horaInicio || !leido.horaFin) {
      return { dato: 'horario', motivo: 'horario_no_reconocido', valorOriginal: g.textoHorario || null };
    }
    g.horario = {
      dias: leido.dias, horaInicio: leido.horaInicio, horaFin: leido.horaFin, diasHastaElFin: leido.diasHastaElFin ?? 0,
    };
  }

  // 4. El Coordinador.
  if (!g.serieId && !(await mem.coordinador(servicio.servicioId))) {
    return { dato: 'coordinador', motivo: 'faltan_datos', valorOriginal: null };
  }

  // 5. La guardia en el cronograma y su serie de turnos de guardia.
  if (!g.serieId) {
    const guardiaDelCronograma = await guardiaEnElCronograma(ctx, g.prestacionId, g.horario);
    if (!guardiaDelCronograma.ok) {
      g.horario = null;
      return { dato: 'horario', motivo: 'dato_invalido', valorOriginal: g.textoHorario || null };
    }
    const desde = servicio.vigenteDesde && servicio.vigenteDesde > ctx.hoy ? servicio.vigenteDesde : ctx.hoy;
    const { data, error } = await ctx.db.rpc('crear_turno_guardia_recurrente', {
      p_servicio: servicio.servicioId,
      p_pacientes: [servicio.pacienteId],
      p_dias_semana: DIAS.filter((d) => g.horario.dias.includes(d)),
      p_hora_inicio: g.horario.horaInicio,
      p_hora_fin: g.horario.horaFin,
      p_dias_hasta_el_fin: Number(g.horario.diasHastaElFin),
      p_modalidad: g.modalidadDeLaLista ?? (g.modalidad || null),
      p_vigente_desde: desde,
      p_vigente_hasta: null,
    });
    if (error) {
      if (guardiaDelCronograma.agregada) await quitarGuardiaSinSerie(ctx, guardiaDelCronograma.agregada);
      const texto = String(error.message ?? '');
      if (texto.includes('sin_coordinador')) {
        mem.olvidarCoordinador();
        return { dato: 'coordinador', motivo: 'faltan_datos', valorOriginal: null };
      }
      const conocido = RECHAZOS_DEL_HORARIO.find((codigo) => texto.includes(codigo));
      if (!conocido) console.error(`Servicio importado ${servicio.servicioId}, serie:`, texto);
      // El horario no entra en el cronograma ni en el período: se vuelve a pedir entero.
      g.horario = null;
      return { dato: 'horario', motivo: conocido ?? 'falla_del_sistema', valorOriginal: g.textoHorario || null };
    }
    g.serieId = data;
  }

  // 6. El Asistente.
  if (!g.asignada) {
    if (!g.asistenteId) {
      if (!g.cuil) return { dato: 'asistente', motivo: 'faltan_datos', valorOriginal: null };
      g.asistenteId = await asistentePorCuil(ctx, g.cuil);
      if (!g.asistenteId) return { dato: 'asistente', motivo: 'asistente_no_encontrado', valorOriginal: g.cuil };
    }
    const { error } = await ctx.db.rpc('asignar_serie_en_curso', {
      p_serie_id: g.serieId, p_asistente_id: g.asistenteId,
    });
    if (error) {
      const previsto = ctx.motivoDeLaAsignacion?.(error);
      if (!previsto) console.error(`Servicio importado ${servicio.servicioId}, asignación:`, error.message);
      g.asistenteId = null;
      return { dato: 'asistente', motivo: previsto?.motivo ?? 'falla_del_sistema', valorOriginal: g.cuil || null };
    }
    g.asignada = true;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Los pedidos del Servicio
// ---------------------------------------------------------------------------------------------

/**
 * Las opciones de Coordinador de un Servicio: las que la base sugiere para ese Servicio, en su
 * orden, y si no sugiere ninguna, todos los Coordinadores activos. Sólo entran los activos de esta
 * Prestadora, aunque la sugerencia traiga otro.
 */
async function opcionesDeCoordinador(ctx, servicioId, coordinadores) {
  const activos = new Map(coordinadores.map((c) => [c.id, c]));
  const sugeridos = ctx.coordinadoresSugeridos ? await ctx.coordinadoresSugeridos(servicioId) : [];
  const deLaBase = (sugeridos ?? []).filter((id) => activos.has(id)).map((id) => activos.get(id));
  return sugerenciasDeCoordinadores(deLaBase.length ? deLaBase : coordinadores);
}

async function sugerenciasDelPedido(ctx, dato, mem, servicioId) {
  if (dato === 'coordinador') {
    return opcionesDeCoordinador(ctx, servicioId, await coordinadoresDeLaPrestadora(ctx.db, ctx.prestadoraId));
  }
  if (dato === 'tipo_servicio') return sugerenciasDeLaLista(await mem.lista());
  if (dato === 'asistente') return sugerenciasDeAsistentes(ctx.db, ctx.prestadoraId);
  return [];
}

/**
 * Deja el pedido de un Servicio. Si ya hay uno abierto que pide lo mismo —el Coordinador del
 * Servicio, o el mismo dato escrito igual—, las guardias se suman a ése en vez de abrir otro.
 * `excluir` es el pedido que se está contestando, que se cierra aparte.
 */
async function pedidoDelServicio(ctx, servicio, bloqueo, guardias, mem, excluir = null) {
  const { data: abiertos, error } = await ctx.db
    .from('pedidos_de_importacion')
    .select('id, importacion_id, fila, dato, valor_original, motivo, sugerencias, renglon, servicio_id, cliente_id, paciente_id, asistente_id')
    .eq('prestadora_id', ctx.prestadoraId)
    .eq('servicio_id', servicio.servicioId)
    .eq('dato', bloqueo.dato)
    .eq('estado', 'abierto');
  if (error) throw new Error(error.message);
  const mismo = (abiertos ?? []).find((p) => p.id !== excluir
    && (bloqueo.dato === 'coordinador' || (p.valor_original ?? null) === (bloqueo.valorOriginal ?? null)));
  if (mismo) {
    return reemplazarPedido(ctx, mismo, {
      renglon: { ...mismo.renglon, guardias: [...(mismo.renglon?.guardias ?? []), ...guardias] },
    });
  }
  return abrirPedido(ctx.db, {
    prestadoraId: ctx.prestadoraId,
    importacionId: ctx.importacionId,
    fila: guardias[0]?.fila ?? servicio.fila,
    dato: bloqueo.dato,
    motivo: bloqueo.motivo,
    valorOriginal: bloqueo.valorOriginal,
    sugerencias: await sugerenciasDelPedido(ctx, bloqueo.dato, mem, servicio.servicioId),
    renglon: { para: 'servicio', quien: servicio.quien, servicio, guardias },
    servicioId: servicio.servicioId,
    clienteId: servicio.clienteId,
    pacienteId: servicio.pacienteId,
  });
}

/**
 * Avanza las guardias y deja los pedidos de las que se detienen, juntando en uno las que piden lo
 * mismo. Devuelve cuántas quedaron enteras y los pedidos que quedaron.
 */
async function detenerGuardias(ctx, servicio, guardias, mem) {
  const textos = guardias.filter((g) => !g.horario).map((g) => g.textoHorario).filter(Boolean);
  const horarios = textos.length ? await ctx.leerHorarios(textos) : new Map();
  const detenidas = new Map();
  let enteras = 0;
  for (const guardia of guardias) {
    const bloqueo = await avanzarGuardia(ctx, servicio, guardia, horarios, mem);
    if (!bloqueo) {
      enteras += 1;
      continue;
    }
    const clave = bloqueo.dato === 'coordinador'
      ? 'coordinador'
      : `${bloqueo.dato}|${bloqueo.motivo}|${bloqueo.valorOriginal ?? ''}`;
    if (!detenidas.has(clave)) detenidas.set(clave, { bloqueo, guardias: [] });
    detenidas.get(clave).guardias.push(guardia);
  }
  return { enteras, detenidas: [...detenidas.values()] };
}

async function dejarPedidos(ctx, servicio, detenidas, mem, excluir) {
  const pedidos = [];
  for (const { bloqueo, guardias } of detenidas) {
    pedidos.push({ ...bloqueo, guardias, id: await pedidoDelServicio(ctx, servicio, bloqueo, guardias, mem, excluir) });
  }
  return pedidos;
}

export async function avanzarGuardias(ctx, servicio, guardias, { mem = memoria(ctx), excluir = null } = {}) {
  const { enteras, detenidas } = await detenerGuardias(ctx, servicio, guardias, mem);
  return { enteras, pedidos: await dejarPedidos(ctx, servicio, detenidas, mem, excluir) };
}

// ---------------------------------------------------------------------------------------------
// El Servicio de un grupo de renglones
// ---------------------------------------------------------------------------------------------

/**
 * Si algún renglón del grupo trae una fecha de inicio que no se entiende, deja el pedido de esa
 * fecha con el renglón entero guardado y devuelve verdadero. Los renglones que dicen lo mismo se
 * contestan juntos. Al contestarlo, el alta vuelve a comprobar la fecha y sigue el Servicio.
 */
async function pedidoDeLaFecha(ctx, { grupo, datos, localidad = null, quien }) {
  const ilegible = grupo.guardias.find((g) => g.fechaIlegible);
  if (!ilegible) return false;
  await abrirPedido(ctx.db, {
    prestadoraId: ctx.prestadoraId,
    importacionId: ctx.importacionId,
    fila: ilegible.fila,
    dato: 'dato',
    motivo: 'fecha_invalida',
    valorOriginal: ilegible.fechaIlegible,
    renglon: {
      tipo: 'servicio',
      datos: { ...datos, vigenteDesde: ilegible.fechaIlegible },
      localidad,
      quien,
      campo: 'vigenteDesde',
      grupo: { ...grupo, fechaIlegible: ilegible.fechaIlegible },
    },
  });
  return true;
}

// La fecha contestada pasa a los renglones que decían ese mismo texto.
function aplicarFechaContestada(grupo, datos) {
  if (!grupo.fechaIlegible) return grupo;
  const fecha = fechaDeLaCelda(datos?.vigenteDesde) ?? null;
  if (!fecha) throw new ErrorConMotivo('fecha_invalida');
  const { fechaIlegible, ...resto } = grupo;
  return {
    ...resto,
    guardias: grupo.guardias.map((g) => (g.fechaIlegible === fechaIlegible
      ? { ...g, vigenteDesde: fecha, fechaIlegible: null }
      : g)),
  };
}

/**
 * Con el Cliente y el Paciente ya creados, arma el Servicio y avanza sus guardias. Lo llama la
 * importación, y también el pedido de dato que esperaba para crear a esas personas. `datos` es el
 * renglón con el que se creó a esas personas, con la fecha de inicio si se la acaba de contestar.
 *
 * Si otro renglón trae todavía una fecha que no se entiende, el Servicio no se arma: queda el
 * pedido de esa fecha.
 *
 * @param {{ grupo: { fila: number, guardias: object[] }, alta: { clienteId, pacienteId }, quien: string, datos?: object }} arg
 */
export async function continuarGrupo(ctx, { grupo: recibido, alta, quien, datos = {} }) {
  const grupo = aplicarFechaContestada(recibido, datos);
  if (await pedidoDeLaFecha(ctx, { grupo, datos, quien })) return { servicioId: null, enteras: 0, pedidos: [] };

  const fechas = grupo.guardias.map((g) => g.vigenteDesde).filter(Boolean).sort();
  const etiqueta = grupo.guardias.find((g) => g.tipoServicio)?.tipoServicio || quien || '';
  const servicioId = await ctx.crear.servicio(ctx.db, {
    prestadoraId: ctx.prestadoraId, clienteId: alta.clienteId, etiqueta, vigenteDesde: fechas[0],
  });
  const { data: leido, error } = await ctx.db
    .from('servicios')
    .select('vigente_desde')
    .eq('id', servicioId)
    .eq('prestadora_id', ctx.prestadoraId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const servicio = {
    servicioId,
    clienteId: alta.clienteId,
    pacienteId: alta.pacienteId,
    vigenteDesde: leido?.vigente_desde ?? fechas[0] ?? null,
    quien,
    fila: grupo.fila,
  };

  // El Coordinador, si la planilla lo nombra sin duda. Si no, el pedido queda abierto desde ya,
  // y las guardias que llegan hasta ahí se le suman.
  const mem = memoria(ctx);
  const nombrado = grupo.guardias.find((g) => g.coordinador)?.coordinador ?? '';
  const coordinadores = await coordinadoresDeLaPrestadora(ctx.db, ctx.prestadoraId);
  const elegido = coordinadorNombrado(coordinadores, nombrado);
  if (elegido) {
    await asignarCoordinador(ctx, servicioId, elegido.id);
  } else {
    await abrirPedido(ctx.db, {
      prestadoraId: ctx.prestadoraId,
      importacionId: ctx.importacionId,
      fila: grupo.fila,
      dato: 'coordinador',
      motivo: nombrado ? 'coordinador_no_encontrado' : 'faltan_datos',
      valorOriginal: nombrado || null,
      sugerencias: await opcionesDeCoordinador(ctx, servicioId, coordinadores),
      renglon: { para: 'servicio', quien, servicio, guardias: [] },
      servicioId,
      clienteId: alta.clienteId,
      pacienteId: alta.pacienteId,
    });
  }
  const { enteras, pedidos } = await avanzarGuardias(ctx, servicio, grupo.guardias, { mem });
  return { servicioId, enteras, pedidos };
}

async function servicioVigenteDelCliente(ctx, clienteId) {
  const { data, error } = await ctx.db
    .from('servicios')
    .select('id, vigente_hasta')
    .eq('prestadora_id', ctx.prestadoraId)
    .eq('cliente_id', clienteId);
  if (error) throw new Error(error.message);
  return (data ?? []).some((s) => !s.vigente_hasta || s.vigente_hasta >= ctx.hoy);
}

/**
 * Un grupo de renglones de la planilla: crea el Cliente y el Paciente, o deja el pedido del dato
 * que lo impide con todos los renglones guardados, y sigue con el Servicio.
 *
 * @returns {Promise<{ estado: 'creada'|'pedido'|'yaEstaba', numeroCliente?: string, alta?: object }>}
 */
export async function procesarGrupo(ctx, grupo) {
  const quien = quienDelRenglon('servicio', grupo.datos);
  const guardado = { fila: grupo.fila, guardias: grupo.guardias };
  // Una fecha de inicio que no se entiende frena el grupo antes de crear a nadie.
  if (await pedidoDeLaFecha(ctx, { grupo: guardado, datos: grupo.datos, localidad: grupo.localidad, quien })) {
    return { estado: 'pedido' };
  }
  const resultado = await altaConPedidos(ctx, {
    tipo: 'servicio', fila: grupo.fila, datos: grupo.datos, localidad: grupo.localidad, quien, grupo: guardado,
  });
  if (resultado.estado === 'pedido') return resultado;
  if (resultado.estado === 'yaEstaba' && await servicioVigenteDelCliente(ctx, resultado.alta.clienteId)) {
    return { estado: 'yaEstaba', alta: resultado.alta };
  }
  await continuarGrupo(ctx, { grupo: guardado, alta: resultado.alta, quien, datos: grupo.datos });
  return { estado: resultado.estado === 'yaEstaba' ? 'creada' : resultado.estado, alta: resultado.alta };
}

// ---------------------------------------------------------------------------------------------
// Contestar un pedido del Servicio
// ---------------------------------------------------------------------------------------------

/** El horario que manda la Prestadora, comprobado. */
export function horarioDeLaRespuesta(valor) {
  if (!valor || typeof valor !== 'object') throw respuestaInvalida();
  const { dias, horaInicio, horaFin } = valor;
  const diasHastaElFin = valor.diasHastaElFin === undefined || valor.diasHastaElFin === null
    ? 0
    : Number(valor.diasHastaElFin);
  if (!Array.isArray(dias) || !dias.length || !dias.every((d) => DIAS.includes(d))) throw respuestaInvalida();
  if (!HORA.test(horaInicio ?? '') || !HORA.test(horaFin ?? '')) throw respuestaInvalida();
  if (!Number.isInteger(diasHastaElFin) || diasHastaElFin < 0) throw respuestaInvalida();
  if (diasHastaElFin === 0 && horaFin <= horaInicio) throw respuestaInvalida();
  return { dias: DIAS.filter((d) => dias.includes(d)), horaInicio, horaFin, diasHastaElFin };
}

/**
 * Contesta un pedido de tipo de servicio, horario, Coordinador o Asistente: aplica el dato a cada
 * guardia del pedido y las vuelve a avanzar. Si todas se detienen otra vez en el mismo dato, nada
 * se cierra y vuelve el motivo.
 */
export async function responderDeServicio(ctx, pedido, valor) {
  const { servicio, guardias = [] } = pedido.renglon ?? {};
  if (!servicio?.servicioId) throw respuestaInvalida();
  const mem = memoria(ctx);

  switch (pedido.dato) {
    case 'tipo_servicio': {
      const lista = await mem.lista();
      const renglon = lista.find((r) => String(r.id) === String(valor));
      if (!renglon) throw respuestaInvalida();
      for (const g of guardias) {
        if (!g.prestacionId) g.listaId = renglon.id;
      }
      break;
    }
    case 'horario': {
      const horario = horarioDeLaRespuesta(valor);
      for (const g of guardias) {
        if (!g.serieId) g.horario = horario;
      }
      break;
    }
    case 'coordinador': {
      if (typeof valor !== 'string') throw respuestaInvalida();
      const coordinadores = await coordinadoresDeLaPrestadora(ctx.db, ctx.prestadoraId);
      if (!coordinadores.some((c) => c.id === valor)) throw respuestaInvalida();
      await asignarCoordinador(ctx, servicio.servicioId, valor);
      break;
    }
    case 'asistente': {
      if (typeof valor !== 'string' || !(await asistenteDelPadron(ctx, valor))) throw respuestaInvalida();
      for (const g of guardias) {
        if (!g.asignada) g.asistenteId = valor;
      }
      break;
    }
    default:
      throw respuestaInvalida();
  }

  const { detenidas } = await detenerGuardias(ctx, servicio, guardias, mem);
  // Si todas siguen trabadas en el mismo dato, la respuesta no sirvió: vuelve el motivo y el
  // pedido queda abierto, sin abrir otro. Lo que sí avanzó —la Prestación— se reconoce la próxima
  // vez y no se repite.
  const mismo = detenidas.find((d) => d.bloqueo.dato === pedido.dato);
  if (guardias.length && detenidas.length === 1 && mismo && mismo.guardias.length === guardias.length) {
    throw new ErrorConMotivo(mismo.bloqueo.motivo);
  }
  const pedidos = await dejarPedidos(ctx, servicio, detenidas, mem, pedido.id);
  return { pedidos: pedidos.length };
}
