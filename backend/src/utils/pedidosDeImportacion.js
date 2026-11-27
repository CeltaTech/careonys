/*
 * Los pedidos de dato de una importación.
 *
 * En una importación ningún renglón queda afuera. Lo que entra firme se crea; lo que falta o está en
 * duda queda como un pedido de dato abierto, que la Prestadora ve en pantalla apenas termina la
 * importación y contesta cuando puede. Al contestarlo, el sistema aplica el dato y completa lo que
 * estaba esperando: crea la persona, le pone la localidad, o sigue armando el Servicio.
 *
 * Hay dos clases de pedido:
 * - Los que esperan para crear a la persona. El renglón entero queda guardado en el pedido, con el
 *   dato que falta señalado, y la persona se crea al contestarlo.
 * - Los que completan a una persona que ya entró. Llevan el Paciente o el Asistente al que le falta
 *   el dato.
 *
 * Todo corre con la cuenta de la importación, que trabaja de a una Prestadora por vez, y cada
 * lectura y escritura nombra esa Prestadora. La cuenta de la importación no puede reescribir el
 * renglón, el motivo ni las sugerencias de un pedido: cuando lo que falta cambia, el pedido se
 * cierra señalando cuál lo reemplaza y se abre uno nuevo.
 *
 * Las dependencias llegan en `ctx`, para poder probar todo esto sin base ni servicios:
 *   db, prestadoraId, importacionId, usuarioPanelId,
 *   crear: { asistente, cliente, servicio }   las altas de cuentasPanel.js
 *   leerGeneros(textos) → Map                 el lector de géneros de la importación
 *   listarLugares() → lugares                 la lista de lugares de la Prestadora
 *   nombreDelLugar(id) → texto
 *   agregarLugar(lugarOficial) → id           agrega a la lista una localidad oficial
 *   ubicar(texto) → resultado                 la lectura de localidades para un solo domicilio
 *   coordenadas({ direccion, localidad }) → { lat, lng }
 *   conformarAsistente(id)                    deja operable a un Asistente de un lote ya conformado
 */

import { ErrorConMotivo } from './errorConMotivo.js';
import { fechaDeLaCelda, fechaDelValorHora } from './importacionIA.js';
import { domicilioEscrito } from './domicilioEscrito.js';

export const DATOS_DE_PEDIDO = [
  'localidad', 'coordinador', 'asistente', 'horario', 'documento', 'documento_paciente', 'tipo_servicio', 'dato',
];

const COLUMNAS_DEL_PEDIDO = 'id, importacion_id, fila, dato, valor_original, motivo, sugerencias, renglon, '
  + 'servicio_id, cliente_id, paciente_id, asistente_id, estado, created_at';

const respuestaInvalida = () => new ErrorConMotivo('respuesta_invalida');

function texto(valor) {
  if (valor === null || valor === undefined) return null;
  const escrito = Array.isArray(valor) ? valor.join(', ') : String(valor);
  return escrito.trim() || null;
}

function vacio(valor) {
  return valor === null || valor === undefined || String(valor).trim() === '';
}

// ---------------------------------------------------------------------------------------------
// El pedido en la base
// ---------------------------------------------------------------------------------------------

export async function abrirPedido(db, {
  prestadoraId, importacionId, fila, dato, valorOriginal = null, motivo = null, sugerencias = [], renglon = {},
  servicioId = null, clienteId = null, pacienteId = null, asistenteId = null,
}) {
  const { data, error } = await db
    .from('pedidos_de_importacion')
    .insert({
      prestadora_id: prestadoraId,
      importacion_id: importacionId,
      fila,
      dato,
      valor_original: texto(valorOriginal),
      motivo,
      sugerencias,
      renglon,
      servicio_id: servicioId,
      cliente_id: clienteId,
      paciente_id: pacienteId,
      asistente_id: asistenteId,
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

// Cierra un pedido que sigue abierto. Si otro lo contestó primero, no cierra nada y lo dice: dos
// personas contestando el mismo pedido no aplican el dato dos veces.
export async function cerrarPedido(db, { prestadoraId, id, respuesta, usuarioPanelId = null }) {
  const { data, error } = await db
    .from('pedidos_de_importacion')
    .update({
      estado: 'resuelto',
      respuesta: respuesta ?? null,
      resuelto_en: new Date().toISOString(),
      resuelto_por: usuarioPanelId,
    })
    .eq('id', id)
    .eq('prestadora_id', prestadoraId)
    .eq('estado', 'abierto')
    .select('id');
  if (error) throw new Error(error.message);
  if (!data?.length) throw new ErrorConMotivo('pedido_ya_resuelto');
}

/**
 * Cambia lo que pide un pedido: abre el nuevo con lo que no se diga distinto y cierra el viejo
 * señalándolo. Primero se abre el nuevo, para que un corte a mitad de camino deje dos pedidos y no
 * ninguno.
 */
export async function reemplazarPedido(ctx, viejo, nuevo) {
  const id = await abrirPedido(ctx.db, {
    prestadoraId: ctx.prestadoraId,
    importacionId: viejo.importacion_id,
    fila: viejo.fila,
    dato: viejo.dato,
    valorOriginal: viejo.valor_original,
    motivo: viejo.motivo,
    sugerencias: viejo.sugerencias ?? [],
    renglon: viejo.renglon ?? {},
    servicioId: viejo.servicio_id,
    clienteId: viejo.cliente_id,
    pacienteId: viejo.paciente_id,
    asistenteId: viejo.asistente_id,
    ...nuevo,
  });
  await cerrarPedido(ctx.db, {
    prestadoraId: ctx.prestadoraId, id: viejo.id, respuesta: { reemplazadoPor: id }, usuarioPanelId: ctx.usuarioPanelId,
  });
  return id;
}

export async function leerPedido(db, prestadoraId, id) {
  const { data, error } = await db
    .from('pedidos_de_importacion')
    .select(COLUMNAS_DEL_PEDIDO)
    .eq('id', id)
    .eq('prestadora_id', prestadoraId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

/** Lo que la pantalla recibe de cada pedido. El renglón guardado no sale: es del sistema. */
export function pedidoParaLaPantalla(pedido) {
  return {
    id: pedido.id,
    importacionId: pedido.importacion_id,
    fila: pedido.fila,
    dato: pedido.dato,
    valorOriginal: pedido.valor_original ?? null,
    motivo: pedido.motivo ?? null,
    sugerencias: Array.isArray(pedido.sugerencias) ? pedido.sugerencias : [],
    estado: pedido.estado,
    quien: pedido.renglon?.quien ?? null,
    // El campo del renglón que se pide, para que el Panel diga qué dato falta. Del renglón no
    // sale nada más: el resto son los datos de la planilla.
    campo: typeof pedido.renglon?.campo === 'string' ? pedido.renglon.campo : null,
  };
}

export async function listarPedidos(db, { prestadoraId, importacionId = null }) {
  let consulta = db
    .from('pedidos_de_importacion')
    .select(COLUMNAS_DEL_PEDIDO)
    .eq('prestadora_id', prestadoraId)
    .eq('estado', 'abierto');
  if (importacionId) consulta = consulta.eq('importacion_id', importacionId);
  const { data, error } = await consulta.order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(pedidoParaLaPantalla);
}

export async function contarAbiertos(db, { prestadoraId, importacionId = null }) {
  let consulta = db
    .from('pedidos_de_importacion')
    .select('id', { count: 'exact', head: true })
    .eq('prestadora_id', prestadoraId)
    .eq('estado', 'abierto');
  if (importacionId) consulta = consulta.eq('importacion_id', importacionId);
  const { count, error } = await consulta;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Cierra los pedidos que siguen abiertos de un lote que se rechazó: ya no hay nada que completar. */
export async function cerrarPedidosDelLote(db, { prestadoraId, importacionId, usuarioPanelId = null }) {
  const { error } = await db
    .from('pedidos_de_importacion')
    .update({
      estado: 'resuelto',
      respuesta: { loteRechazado: true },
      resuelto_en: new Date().toISOString(),
      resuelto_por: usuarioPanelId,
    })
    .eq('prestadora_id', prestadoraId)
    .eq('importacion_id', importacionId)
    .eq('estado', 'abierto');
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------------------------
// Las sugerencias
// ---------------------------------------------------------------------------------------------

/** Los Coordinadores activos de la Prestadora. */
export async function coordinadoresDeLaPrestadora(db, prestadoraId) {
  const { data, error } = await db
    .from('usuarios')
    .select('id, nombre, email, nombre_de_usuario')
    .eq('prestadora_id', prestadoraId)
    .eq('rol', 'coordinador')
    .is('desactivada_en', null);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export function sugerenciasDeCoordinadores(coordinadores) {
  return coordinadores.map((c) => ({
    valor: c.id,
    etiqueta: c.nombre || c.nombre_de_usuario || c.email,
    ...(c.email ? { detalle: c.email } : {}),
  }));
}

/** Los Asistentes conformados y activos de la Prestadora, con su documento para distinguirlos. */
export async function sugerenciasDeAsistentes(db, prestadoraId) {
  const { data, error } = await db
    .from('asistentes')
    .select('id, nombre, documento_numero')
    .eq('prestadora_id', prestadoraId)
    .eq('estado', 'activo')
    .eq('pendiente_conformidad', false)
    .is('deleted_at', null)
    .order('nombre', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((a) => ({
    valor: a.id,
    etiqueta: a.nombre,
    ...(a.documento_numero ? { detalle: a.documento_numero } : {}),
  }));
}

/** Los renglones de la lista de precios que rigen hoy, sin el precio: lo ve también quien no factura. */
export async function listaQueRige(db, prestadoraId, hoy) {
  const { data, error } = await db
    .from('lista_precios')
    .select('id, tipo_servicio, modalidad, precio, moneda, vigente_desde, vigente_hasta')
    .eq('prestadora_id', prestadoraId)
    .eq('activo', true)
    .lte('vigente_desde', hoy);
  if (error) throw new Error(error.message);
  return (data ?? []).filter((r) => !r.vigente_hasta || r.vigente_hasta >= hoy);
}

export function etiquetaDeLaLista(renglon) {
  return [renglon.tipo_servicio, renglon.modalidad].filter(Boolean).join(' — ');
}

export function sugerenciasDeLaLista(renglones) {
  return renglones.map((r) => ({ valor: String(r.id), etiqueta: etiquetaDeLaLista(r) }));
}

/**
 * Las opciones de una localidad dudosa. Si la lectura encontró candidatos, son ésos; la localidad
 * oficial que todavía no está en la lista viaja guardada en el pedido, para agregarla el día que la
 * Prestadora la elija. Si no encontró ninguno, son los lugares de la Prestadora.
 */
export async function sugerenciasDeLugares(ctx, motivo) {
  const oficiales = {};
  if (Array.isArray(motivo?.candidatos) && motivo.candidatos.length) {
    const sugerencias = motivo.candidatos.map(({ texto: etiqueta, lugar }) => {
      if (lugar?.id) return { valor: lugar.id, etiqueta };
      const clave = String(lugar?.idOficial ?? '');
      oficiales[clave] = lugar;
      return { valor: `oficial:${clave}`, etiqueta };
    });
    return { sugerencias, oficiales };
  }
  const lugares = await ctx.listarLugares();
  const sugerencias = lugares
    .filter((l) => l.activo)
    .map((l) => {
      const detalle = [l.municipio, l.provincia].filter(Boolean).join(', ');
      return { valor: l.id, etiqueta: l.nombre, ...(detalle ? { detalle } : {}) };
    });
  return { sugerencias, oficiales };
}

// ---------------------------------------------------------------------------------------------
// La persona del renglón
// ---------------------------------------------------------------------------------------------

/** El texto visible de la persona de un renglón, para que la Prestadora sepa de quién se habla. */
export function quienDelRenglon(tipo, datos) {
  if (tipo === 'asistente') return texto(datos.nombre);
  return texto(datos.nombrePaciente)
    ?? texto([datos.nombreContacto, datos.apellidoContacto].filter(Boolean).join(' '));
}

/**
 * Crea la persona de un renglón. Los datos guardados son los de la planilla, ya leídos; acá se
 * convierten las fechas, que es lo que puede fallar con un motivo propio.
 */
export async function altaDeLaFila(ctx, tipo, datos) {
  const comun = { prestadoraId: ctx.prestadoraId, importacionId: ctx.importacionId, db: ctx.db };
  if (tipo === 'asistente') {
    const listos = { ...datos, ...comun, usuarioPanelId: ctx.usuarioPanelId };
    listos.rige_desde = fechaDelValorHora(listos);
    delete listos.valor_hora_rige_desde;
    const alta = await ctx.crear.asistente(listos);
    if (ctx.loteConformado && ctx.conformarAsistente) await ctx.conformarAsistente(alta.asistenteId);
    return alta;
  }
  const listos = {
    ...datos,
    ...comun,
    // El lote de Servicios en curso entra visible. El de Clientes pasa por la revisión, salvo que
    // el lote ya se haya conformado mientras el pedido esperaba.
    pendienteConformidad: tipo !== 'servicio' && !ctx.loteConformado,
  };
  listos.fechaNacimientoPaciente = fechaDeLaCelda(datos.fechaNacimientoPaciente);
  if (tipo === 'servicio') {
    // La fecha de inicio del Servicio se comprueba antes de crear a nadie: si no se entiende, el
    // renglón espera a que la Prestadora la escriba.
    fechaDeLaCelda(datos.vigenteDesde);
    // En el lote de Servicios en curso el Servicio lo arma la importación, con sus guardias: el
    // alta del Cliente no tiene que crear otro.
    delete listos.servicio;
  }
  return ctx.crear.cliente(listos);
}

function fechaIlegible(valor) {
  try {
    fechaDeLaCelda(valor);
    return false;
  } catch (error) {
    if (error?.motivo === 'fecha_invalida') return true;
    throw error;
  }
}

const OBLIGATORIOS_DE_LA_PERSONA = {
  asistente: ['nombre', 'email'],
  cliente: ['nombreContacto', 'apellidoContacto', 'email', 'nombrePaciente'],
};

/**
 * Qué dato pedir cuando la persona no se pudo crear, según el motivo. `campo` es el campo del
 * renglón donde va la respuesta; sin campo, contestar el pedido sólo vuelve a intentar.
 */
export function pedidoPorFalta(motivo, tipo, datos = {}) {
  const deAsistente = tipo === 'asistente';
  const campo = (asistente, cliente) => (deAsistente ? asistente : cliente);
  switch (motivo) {
    case 'faltan_datos': {
      const obligatorios = OBLIGATORIOS_DE_LA_PERSONA[deAsistente ? 'asistente' : 'cliente'];
      return { dato: 'dato', campo: obligatorios.find((c) => vacio(datos[c])) ?? null };
    }
    case 'falta_el_documento':
    case 'numero_no_valido':
    case 'documento_repetido':
    case 'legajo_repetido':
      return { dato: 'documento', campo: campo('documento', 'documentoContacto') };
    case 'falta_el_documento_del_paciente':
    case 'documento_del_paciente_no_valido':
      return { dato: 'documento_paciente', campo: deAsistente ? null : 'documentoPaciente' };
    case 'falta_el_dni':
    case 'dni_no_coincide':
      return { dato: 'dato', campo: campo('dni', 'dniContacto') };
    case 'falta_el_dni_del_paciente':
    case 'dni_del_paciente_no_coincide':
      return { dato: 'dato', campo: deAsistente ? null : 'dniPaciente' };
    case 'falta_el_genero':
    case 'genero_no_reconocido':
      return { dato: 'dato', campo: campo('genero', 'generoContacto') };
    case 'falta_el_genero_del_paciente':
      return { dato: 'dato', campo: deAsistente ? null : 'generoPaciente' };
    case 'fecha_invalida':
    case 'dato_invalido':
      if (deAsistente) return { dato: 'dato', campo: 'valor_hora_rige_desde' };
      // Se pide la fecha que no se entiende, en el mismo orden en que el alta las comprueba.
      if (tipo === 'servicio' && !fechaIlegible(datos.fechaNacimientoPaciente) && fechaIlegible(datos.vigenteDesde)) {
        return { dato: 'dato', campo: 'vigenteDesde' };
      }
      return { dato: 'dato', campo: 'fechaNacimientoPaciente' };
    case 'correo_de_esta_prestadora':
    case 'usuario_en_uso':
    case 'usuario_mal_escrito':
    case 'falta_el_email_de_quien_contrata':
      return { dato: 'dato', campo: 'email' };
    case 'celular_de_otra_persona':
      return { dato: 'dato', campo: 'telefono' };
    default:
      return { dato: 'dato', campo: null };
  }
}

function motivoDelError(error, donde) {
  if (error?.motivo) return error.motivo;
  console.error(`${donde}:`, error?.message ?? error);
  return 'falla_del_sistema';
}

/**
 * Crea la persona de un renglón, o deja el pedido del dato que lo impide con el renglón entero
 * guardado. Si la persona entra, deja además los pedidos de su localidad dudosa.
 *
 * `localidad` es lo que leyó la importación del domicilio y de los lugares de trabajo:
 * { motivo, domicilioQueEntra, trabajoNoReconocido, valorOriginal, valorTrabajo }.
 * `grupo` son los renglones del Servicio en curso que esperan a esta persona.
 */
export async function altaConPedidos(ctx, { tipo, fila, datos, localidad = null, quien, grupo = null }) {
  let alta;
  try {
    alta = await altaDeLaFila(ctx, tipo, datos);
  } catch (error) {
    const motivo = motivoDelError(error, `Importación ${ctx.importacionId}, fila ${fila}`);
    const { dato, campo } = pedidoPorFalta(motivo, tipo, datos);
    await abrirPedido(ctx.db, {
      prestadoraId: ctx.prestadoraId,
      importacionId: ctx.importacionId,
      fila,
      dato,
      motivo,
      valorOriginal: campo ? datos[campo] : null,
      renglon: { tipo, datos, localidad, quien, campo, grupo },
    });
    return { estado: 'pedido' };
  }
  if (alta.yaEstaba) return { estado: 'yaEstaba', alta };
  await pedidosDeLocalidad(ctx, { tipo, fila, alta, localidad, quien });
  return { estado: 'creada', alta };
}

/** Los pedidos de la localidad de una persona que ya entró. */
export async function pedidosDeLocalidad(ctx, { tipo, fila, alta, localidad, quien }) {
  const codigo = localidad?.motivo?.codigo;
  if (!codigo) return;
  const deAsistente = tipo === 'asistente';
  const deQuien = deAsistente
    ? { asistenteId: alta.asistenteId }
    : { clienteId: alta.clienteId, pacienteId: alta.pacienteId };
  const comun = { prestadoraId: ctx.prestadoraId, importacionId: ctx.importacionId, fila, ...deQuien };

  if (codigo !== 'lugar_de_trabajo_no_reconocido') {
    if (!localidad.domicilioQueEntra) {
      // Sin calle no hay domicilio que completar: se pide el domicilio entero.
      await abrirPedido(ctx.db, {
        ...comun, dato: 'dato', motivo: codigo, valorOriginal: localidad.valorOriginal,
        renglon: { para: 'domicilio', tipo, quien },
      });
    } else {
      const { sugerencias, oficiales } = await sugerenciasDeLugares(ctx, localidad.motivo);
      await abrirPedido(ctx.db, {
        ...comun, dato: 'localidad', motivo: codigo, valorOriginal: localidad.valorOriginal, sugerencias,
        renglon: { para: 'domicilio', tipo, quien, oficiales, domicilio: localidad.domicilioQueEntra },
      });
    }
  }
  if (deAsistente && localidad.trabajoNoReconocido) {
    const { sugerencias } = await sugerenciasDeLugares(ctx, null);
    await abrirPedido(ctx.db, {
      ...comun, dato: 'localidad', motivo: 'lugar_de_trabajo_no_reconocido', valorOriginal: localidad.valorTrabajo,
      sugerencias, renglon: { para: 'trabajo', tipo, quien, oficiales: {} },
    });
  }
}

// ---------------------------------------------------------------------------------------------
// Completar el domicilio de una persona que ya entró
// ---------------------------------------------------------------------------------------------

/** El lugar elegido en un pedido de localidad, agregado a la lista si era oficial y no estaba. */
async function lugarElegido(ctx, pedido, valor) {
  if (typeof valor !== 'string' || !valor.trim()) throw respuestaInvalida();
  const lugares = await ctx.listarLugares();
  if (valor.startsWith('oficial:')) {
    const clave = valor.slice('oficial:'.length);
    const oficial = pedido.renglon?.oficiales?.[clave];
    if (!oficial) throw respuestaInvalida();
    const yaEsta = lugares.find((l) => l.id_oficial && String(l.id_oficial) === clave);
    if (yaEsta) return yaEsta.id;
    return ctx.agregarLugar(oficial);
  }
  if (!lugares.some((l) => l.id === valor && l.activo)) throw respuestaInvalida();
  return valor;
}

async function ubicacionDe(ctx, partes) {
  const nombre = partes.lugar_id ? await ctx.nombreDelLugar(partes.lugar_id) : null;
  const direccion = domicilioEscrito({ ...partes, lugar: nombre }) || null;
  const coordenadas = direccion ? await ctx.coordenadas({ direccion, localidad: nombre || undefined }) : null;
  return {
    direccion,
    coordenadas: coordenadas && coordenadas.lat != null && coordenadas.lng != null
      ? { lat: coordenadas.lat, lng: coordenadas.lng }
      : {},
  };
}

/** Guarda el domicilio completo, o sólo su localidad, en la persona del pedido. */
async function guardarDomicilio(ctx, pedido, partes) {
  const { direccion, coordenadas } = await ubicacionDe(ctx, partes);
  const columnas = {
    calle: partes.calle ?? null,
    numero: partes.numero ?? null,
    piso: partes.piso ?? null,
    unidad: partes.unidad ?? null,
    codigo_postal: partes.codigo_postal ?? null,
    lugar_id: partes.lugar_id ?? null,
    ...coordenadas,
  };

  if (pedido.paciente_id) {
    const { data: paciente, error } = await ctx.db
      .from('pacientes')
      .select('persona_id')
      .eq('id', pedido.paciente_id)
      .eq('prestadora_id', ctx.prestadoraId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!paciente?.persona_id) throw new ErrorConMotivo('pedido_inexistente');
    const { error: errorPersona } = await ctx.db
      .from('personas')
      .update(columnas)
      .eq('id', paciente.persona_id)
      .eq('prestadora_id', ctx.prestadoraId);
    if (errorPersona) throw new Error(errorPersona.message);
    return;
  }

  if (pedido.asistente_id) {
    const fila = { ...columnas, domicilio: direccion };
    const { data, error } = await ctx.db
      .from('domicilio_asistente')
      .update(fila)
      .eq('asistente_id', pedido.asistente_id)
      .eq('prestadora_id', ctx.prestadoraId)
      .select('asistente_id');
    if (error) throw new Error(error.message);
    if (!data?.length) {
      const { error: errorAlta } = await ctx.db
        .from('domicilio_asistente')
        .insert({ asistente_id: pedido.asistente_id, prestadora_id: ctx.prestadoraId, ...fila });
      if (errorAlta) throw new Error(errorAlta.message);
    }
    return;
  }
  throw new ErrorConMotivo('pedido_inexistente');
}

async function responderLocalidad(ctx, pedido, valor) {
  const lugarId = await lugarElegido(ctx, pedido, valor);
  if (pedido.renglon?.para === 'trabajo') {
    if (!pedido.asistente_id) throw new ErrorConMotivo('pedido_inexistente');
    const { error } = await ctx.db
      .from('asistente_lugares')
      .insert({ asistente_id: pedido.asistente_id, lugar_id: lugarId, prestadora_id: ctx.prestadoraId });
    // Si ya lo tenía, no hay nada más que hacer.
    if (error && error.code !== '23505') throw new Error(error.message);
    return { lugarId };
  }
  await guardarDomicilio(ctx, pedido, { ...(pedido.renglon?.domicilio ?? {}), lugar_id: lugarId });
  return { lugarId };
}

// El domicilio que faltaba, escrito por la Prestadora. Se lee igual que el de la planilla; si la
// localidad vuelve a quedar en duda, el domicilio se guarda y queda el pedido de la localidad.
async function responderDomicilio(ctx, pedido, valor) {
  const escrito = typeof valor === 'string' ? valor.trim() : '';
  if (!escrito) throw respuestaInvalida();
  const leido = await ctx.ubicar(escrito);
  const partes = leido?.partes ?? leido?.domicilioQueEntra ?? null;
  if (!partes?.calle) throw respuestaInvalida();
  await guardarDomicilio(ctx, pedido, partes);
  if (!leido.partes) {
    const { sugerencias, oficiales } = await sugerenciasDeLugares(ctx, leido.motivo);
    await reemplazarPedido(ctx, pedido, {
      dato: 'localidad',
      motivo: leido.motivo?.codigo ?? 'localidad_no_reconocida',
      valorOriginal: escrito,
      sugerencias,
      renglon: { ...pedido.renglon, oficiales, domicilio: partes },
    });
    return { reemplazado: true };
  }
  return { domicilio: escrito };
}

// ---------------------------------------------------------------------------------------------
// Completar el renglón de una persona que todavía no se creó
// ---------------------------------------------------------------------------------------------

async function responderAlta(ctx, pedido, valor, deps) {
  const escrito = typeof valor === 'string' ? valor.trim() : '';
  const { tipo, datos, campo, localidad, quien, grupo } = pedido.renglon;
  if (campo && !escrito) throw respuestaInvalida();

  const nuevos = { ...datos };
  if (campo) {
    nuevos[campo] = campo.startsWith('genero')
      ? (await ctx.leerGeneros([escrito])).get(escrito) ?? escrito
      : escrito;
  }

  let alta;
  try {
    alta = await altaDeLaFila(ctx, tipo, nuevos);
  } catch (error) {
    const motivo = motivoDelError(error, `Pedido ${pedido.id}`);
    const falta = pedidoPorFalta(motivo, tipo, nuevos);
    // El mismo dato sigue mal: el pedido queda abierto y la Prestadora ve por qué.
    if (!campo || (falta.campo === campo && falta.dato === pedido.dato)) throw new ErrorConMotivo(motivo);
    // Ese dato quedó bien y ahora falta otro: el pedido pasa a ser del que falta.
    await reemplazarPedido(ctx, pedido, {
      dato: falta.dato,
      motivo,
      valorOriginal: falta.campo ? texto(nuevos[falta.campo]) : null,
      renglon: { ...pedido.renglon, datos: nuevos, campo: falta.campo },
    });
    return { reemplazado: true };
  }

  if (!alta.yaEstaba) await pedidosDeLocalidad(ctx, { tipo, fila: pedido.fila, alta, localidad, quien });
  if (tipo === 'servicio' && grupo) {
    if (!deps?.continuarGrupo) throw new Error('Falta la continuación del Servicio importado');
    await deps.continuarGrupo(ctx, { grupo, alta, quien, datos: nuevos });
  }
  return { creada: true };
}

// ---------------------------------------------------------------------------------------------
// Contestar
// ---------------------------------------------------------------------------------------------

const DATOS_DEL_SERVICIO = new Set(['coordinador', 'asistente', 'horario', 'tipo_servicio']);

/**
 * Contesta un pedido abierto: aplica el dato, completa lo que esperaba y cierra el pedido. Si el
 * dato no sirve, el pedido queda abierto y vuelve el motivo.
 *
 * `deps.responderDeServicio(ctx, pedido, valor)` contesta los pedidos del Servicio en curso y
 * `deps.continuarGrupo` sigue armando un Servicio cuya persona se acaba de crear. Llegan desde
 * afuera porque viven en `servicioImportado.js`, que a su vez usa este archivo.
 *
 * @returns {Promise<{ ok: true, pendientes: number }>}
 */
export async function responderPedido(ctx, id, valor, deps = {}) {
  const pedido = await leerPedido(ctx.db, ctx.prestadoraId, id);
  if (!pedido) throw new ErrorConMotivo('pedido_inexistente');
  if (pedido.estado !== 'abierto') throw new ErrorConMotivo('pedido_ya_resuelto');

  const { data: lote, error: errorLote } = await ctx.db
    .from('importaciones_prestadora')
    .select('id, tipo, estado_conformidad')
    .eq('id', pedido.importacion_id)
    .eq('prestadora_id', ctx.prestadoraId)
    .maybeSingle();
  if (errorLote) throw new Error(errorLote.message);
  if (!lote) throw new ErrorConMotivo('pedido_inexistente');
  if (lote.estado_conformidad === 'rechazada') throw new ErrorConMotivo('lote_no_abierto');

  // Lo que se cree al contestar entra en el lote del pedido, no en otro.
  const enElLote = {
    ...ctx,
    importacionId: pedido.importacion_id,
    loteConformado: lote.tipo !== 'servicio' && lote.estado_conformidad === 'confirmada',
  };

  let resultado;
  if (DATOS_DEL_SERVICIO.has(pedido.dato)) {
    if (!deps.responderDeServicio) throw respuestaInvalida();
    resultado = await deps.responderDeServicio(enElLote, pedido, valor);
  } else if (pedido.renglon?.datos) {
    resultado = await responderAlta(enElLote, pedido, valor, deps);
  } else if (pedido.dato === 'localidad') {
    resultado = await responderLocalidad(enElLote, pedido, valor);
  } else if (pedido.renglon?.para === 'domicilio') {
    resultado = await responderDomicilio(enElLote, pedido, valor);
  } else {
    throw respuestaInvalida();
  }

  if (!resultado?.reemplazado) {
    await cerrarPedido(ctx.db, {
      prestadoraId: ctx.prestadoraId,
      id: pedido.id,
      respuesta: { valor: typeof valor === 'object' ? valor : String(valor ?? '') },
      usuarioPanelId: ctx.usuarioPanelId,
    });
  }
  return { ok: true, pendientes: await contarAbiertos(ctx.db, { prestadoraId: ctx.prestadoraId }) };
}
