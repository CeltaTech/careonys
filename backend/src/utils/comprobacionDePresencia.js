import { supabase } from '../db/connection.js';
import { ErrorConMotivo } from './errorConMotivo.js';
import {
  codigoCoincide,
  codigoNuevo,
  verificadorDelCodigo,
  vencimientoEnSegundos,
} from './codigoDeUnSoloUso.js';
import { MOTIVOS_SIN_COMPROBAR } from './motivosSinComprobar.js';
import { empujar, ASUNTOS } from '../avisosEnVivo/canal.js';

// Cómo se comprueba que el Asistente está realmente en el domicilio cuando marca la llegada y
// cuando cierra (pendiente #113). El GPS sigue diciendo dónde está el teléfono; esto dice que
// además hubo alguien, o alguien de la Prestadora, del otro lado.
//
// HAY DOS CAMINOS Y UN PISO
//
//   Plan A — el código QR lo muestra una persona en la pantalla de su teléfono: el Cliente, o el
//   Asistente que se va cuando hay relevo. Se renueva solo cada pocos segundos, así que una foto
//   de esa pantalla no sirve un minuto después. Cada código vale dos vueltas, para que quien lo
//   lee justo en el cambio no lo mande vencido. Reemplaza al cartel impreso, que era un secreto
//   permanente a la vista de cualquiera que pasara por la puerta.
//
//   Plan B — cuando no lo puede leer, el Asistente pide autorización y llama a quien coordina.
//   Queda anotado el lugar y la hora desde donde la pidió. Quien coordina encuentra su guardia en
//   Guardias y —después de las verificaciones que acostumbre— aprieta «Autorizar ingreso». Eso vale lo mismo que leer el
//   código QR: la llegada queda comprobada, con quién la autorizó y a qué hora, y la salida del
//   Asistente que se va queda autorizada también. El teléfono del que espera se entera solo y
//   marca la llegada sin que tenga que escribir nada.
//
//   El piso — si en la Prestadora no atiende nadie, se entra igual eligiendo un motivo, y la
//   llegada queda anotada SIN COMPROBAR, con ese motivo. La guardia nunca se traba, y lo que
//   siga lo deciden los protocolos que la Prestadora ya tenga para eso.
//
// EL PACIENTE NO ESTÁ EN ESTA LISTA, Y NO ES UN OLVIDO. El diseño aprobado dice que el código lo
// puede mostrar «el Cliente, el Paciente, o el Asistente saliente». En este producto el Paciente
// no tiene cuenta —los roles posibles son admin_prestadora, coordinador, asistente, cliente y
// superadmin— ni aplicación propia, así que no tiene ninguna pantalla en la que mostrar un
// código. Cuando la tenga, se agrega acá un tercer sujeto_tipo y nada más.

// Los mismos números que la base pone por omisión en las columnas. Se repiten acá para el único
// caso en que la base no llega a aplicarlos, que es cuando esa Prestadora no tiene fila de
// configuración (mismo criterio que `toleranciaCheckin.js`).
export const SEGUNDOS_EN_PANTALLA_POR_OMISION = 30;

// Los mismos topes que las restricciones `..._razonable` de la migración. Se repiten acá para que
// la pantalla de Configuración pueda explicar por qué no acepta un valor, en vez de dejar que lo
// rechace la base con el texto crudo de una restricción.
export const SEGUNDOS_EN_PANTALLA_MINIMO = 10;
export const SEGUNDOS_EN_PANTALLA_MAXIMO = 300;

// La lista corta que el Asistente elige cuando entra sin comprobar. Se re-exporta desde acá para
// que el resto del backend la siga pidiendo en un solo lugar, pero la lista en sí vive en
// `motivosSinComprobar.js`, que es copia del archivo que usa la pantalla: el teléfono ofrece los
// motivos y el backend los valida, y las dos listas tienen que ser la misma.
export { MOTIVOS_SIN_COMPROBAR };

const LARGO_MAXIMO_DEL_DETALLE = 500;

export async function configuracionDeComprobacion(prestadoraId) {
  const { data } = await supabase
    .from('configuracion_ausencia_automatica')
    .select('segundos_codigo_en_pantalla')
    .eq('prestadora_id', prestadoraId)
    .maybeSingle();

  const segundos = data?.segundos_codigo_en_pantalla;
  return {
    segundosEnPantalla: Number.isFinite(segundos) && segundos > 0 ? segundos : SEGUNDOS_EN_PANTALLA_POR_OMISION,
  };
}

// ---------------------------------------------------------------------------------------
// Plan A — el código que se muestra en pantalla
// ---------------------------------------------------------------------------------------

/**
 * Devuelve el código que esta persona tiene que mostrar ahora. Cada vez que se pide, se genera
 * uno nuevo: eso es lo que quiere decir que se renueva solo. La pantalla lo vuelve a pedir cada
 * `segundos`, y el código vale el doble, para que una lectura hecha justo en el cambio no falle.
 *
 * Se guarda uno por pedido, no uno por persona: varias personas autorizadas del mismo Cliente
 * pueden estar mostrándolo a la vez en sus teléfonos, y ninguna le pisa el código a otra.
 *
 * `sujetoTipo` es 'cliente' (todas las personas autorizadas) o 'asistente' (el que se va).
 */
export async function codigoParaMostrar({ prestadoraId, sujetoTipo, sujetoId }) {
  if (!prestadoraId || !sujetoId || !['cliente', 'asistente'].includes(sujetoTipo)) {
    throw new ErrorConMotivo('faltan_datos', 'No se puede armar un código sin saber quién lo muestra');
  }

  const { segundosEnPantalla } = await configuracionDeComprobacion(prestadoraId);
  const codigo = codigoNuevo();
  const expiraEn = vencimientoEnSegundos(segundosEnPantalla);

  const { error } = await supabase.from('codigos_de_presencia').insert({
    prestadora_id: prestadoraId,
    sujeto_tipo: sujetoTipo,
    sujeto_id: sujetoId,
    codigo_verificador: verificadorDelCodigo(codigo),
    expira_en: vencimientoEnSegundos(segundosEnPantalla * 2),
  });
  if (error) throw new Error(error.message);

  // Los vencidos de esta persona no le sirven a nadie: se borran acá para que la tabla no crezca
  // con cada vuelta. Si el borrado falla, el código nuevo ya quedó guardado y vale igual.
  await supabase
    .from('codigos_de_presencia')
    .delete()
    .eq('prestadora_id', prestadoraId)
    .eq('sujeto_tipo', sujetoTipo)
    .eq('sujeto_id', sujetoId)
    .lt('expira_en', ahora());

  return { codigo, segundos: segundosEnPantalla, expiraEn };
}

async function pacientesDeLaGuardia(guardia) {
  const { data: filas } = await supabase
    .from('guardia_pacientes')
    .select('paciente_id')
    .eq('guardia_id', guardia.id)
    .eq('prestadora_id', guardia.prestadora_id);

  const pacienteIds = (filas ?? []).map((f) => f.paciente_id);
  if (pacienteIds.length === 0 && guardia.paciente_id) pacienteIds.push(guardia.paciente_id);
  return pacienteIds;
}

/**
 * Las guardias que todavía están abiertas sobre los mismos Pacientes que ésta: la del Asistente
 * que se va cuando hay relevo. Se las busca por estado, no por horario: quien todavía no cerró es
 * quien todavía está.
 */
async function guardiasSalientes(guardia, pacienteIds) {
  if (pacienteIds.length === 0) return [];

  const { data: otrasGuardias } = await supabase
    .from('guardia_pacientes')
    .select('guardia_id, guardias!inner(id, asistente_id, estado, checkout_at)')
    .in('paciente_id', pacienteIds)
    .eq('prestadora_id', guardia.prestadora_id)
    .eq('guardias.estado', 'activa')
    .is('guardias.checkout_at', null);

  const salientes = [];
  for (const fila of otrasGuardias ?? []) {
    const otra = fila.guardias;
    if (!otra || otra.id === guardia.id || !otra.asistente_id) continue;
    if (!salientes.some((s) => s.id === otra.id)) salientes.push(otra);
  }
  return salientes;
}

/**
 * Quiénes podrían estar mostrando un código QR válido para esta guardia. Se resuelve del lado del
 * backend y nunca con un dato que venga en el pedido: si el teléfono pudiera decir a quién
 * comparar, podría decir cualquiera.
 *
 * Son dos: las personas autorizadas de los Pacientes de esta guardia, y el Asistente que todavía
 * está adentro —el que tiene una guardia abierta sobre alguno de esos mismos Pacientes—, que es
 * la definición operativa de «hay relevo».
 */
export async function sujetosQuePuedenMostrar(guardia) {
  const pacienteIds = await pacientesDeLaGuardia(guardia);
  if (pacienteIds.length === 0) return [];

  const sujetos = [];

  const { data: pacientes } = await supabase
    .from('pacientes')
    .select('id, cliente_id')
    .in('id', pacienteIds)
    .eq('prestadora_id', guardia.prestadora_id);

  for (const paciente of pacientes ?? []) {
    if (paciente.cliente_id && !sujetos.some((s) => s.tipo === 'cliente' && s.id === paciente.cliente_id)) {
      sujetos.push({ tipo: 'cliente', id: paciente.cliente_id });
    }
  }

  for (const otra of await guardiasSalientes(guardia, pacienteIds)) {
    if (!sujetos.some((s) => s.tipo === 'asistente' && s.id === otra.asistente_id)) {
      sujetos.push({ tipo: 'asistente', id: otra.asistente_id });
    }
  }

  return sujetos;
}

// ---------------------------------------------------------------------------------------
// La comprobación de una llegada o de una salida
// ---------------------------------------------------------------------------------------

export async function comprobacionDe({ prestadoraId, guardiaId, momento }) {
  if (!prestadoraId) {
    throw new ErrorConMotivo('faltan_datos', 'No se busca una comprobación sin saber de qué Organización es');
  }

  const { data } = await supabase
    .from('guardia_comprobaciones')
    .select('*')
    .eq('prestadora_id', prestadoraId)
    .eq('guardia_id', guardiaId)
    .eq('momento', momento)
    .maybeSingle();
  return data ?? null;
}

function ahora() {
  return new Date().toISOString();
}

async function guardarComprobacion(fila) {
  if (!fila.prestadora_id) {
    throw new ErrorConMotivo('faltan_datos', 'No se escribe una comprobación sin saber de qué Organización es');
  }

  // SIN PRESTADORA A PROPÓSITO
  // La Prestadora va adentro de la fila —arriba se corta si no viene—, y la columna del conflicto
  // es el identificador de una guardia, único en toda la base: la fila en conflicto es siempre de
  // la misma guardia y por lo tanto de la misma Prestadora. La base lo sostiene además con la clave
  // foránea `(guardia_id, prestadora_id)` contra `guardias`, que rechaza cualquier otra pareja.
  const { data, error } = await supabase
    .from('guardia_comprobaciones')
    .upsert({ ...fila, updated_at: ahora() }, { onConflict: 'guardia_id,momento' })
    .select('*')
    .single();
  if (error) throw new Error(error.message);

  // La pantalla de la Prestadora se entera acá y no cuando le toque preguntar. Sale en toda
  // escritura y no sólo en las que entran o salen de «esperando autorización»: por acá pasan dos
  // escrituras por guardia, el mensaje no lleva ningún dato y lo único que provoca del otro lado
  // es que la lista se vuelva a pedir. Averiguar antes el estado anterior costaría una consulta
  // por escritura —más de lo que ahorra— y dejaría la puerta abierta a olvidarse de un camino.
  empujar(fila.prestadora_id, ASUNTOS.PEDIDOS_DE_AUTORIZACION);

  return data;
}

/**
 * ¿El código QR que escaneó el Asistente, o los números que tipeó, son de alguien que está en esa
 * casa?
 *
 * Devuelve `{ medio, sujetoTipo, sujetoId }`. Si no coincide con ninguno, lanza el motivo, y la
 * pantalla ofrece volver a intentar o pedir autorización. Que un código equivocado no marque la
 * llegada no traba nada: el camino de «pido autorización» y el de «entro igual con un motivo»
 * están siempre a un botón de distancia.
 */
async function resolverCodigo({ guardia, codigo }) {
  const texto = String(codigo ?? '').trim();
  if (!texto) throw new ErrorConMotivo('faltan_datos', 'Falta el código');

  const sujetos = await sujetosQuePuedenMostrar(guardia);
  if (sujetos.length > 0) {
    const { data: vigentes } = await supabase
      .from('codigos_de_presencia')
      .select('sujeto_tipo, sujeto_id, codigo_verificador, expira_en')
      .eq('prestadora_id', guardia.prestadora_id)
      .in('sujeto_id', sujetos.map((s) => s.id))
      .gt('expira_en', ahora());

    for (const vigente of vigentes ?? []) {
      const esCandidato = sujetos.some((s) => s.tipo === vigente.sujeto_tipo && s.id === vigente.sujeto_id);
      if (!esCandidato) continue;
      if (!codigoCoincide(texto, vigente.codigo_verificador)) continue;
      return {
        medio: vigente.sujeto_tipo === 'cliente' ? 'codigo_cliente' : 'codigo_asistente_saliente',
        sujetoTipo: vigente.sujeto_tipo,
        sujetoId: vigente.sujeto_id,
      };
    }
  }

  throw new ErrorConMotivo('codigo_incorrecto', 'El código no corresponde a nadie de este domicilio');
}

/**
 * Deja anotado cómo se comprobó esta llegada o esta salida. Se llama desde /checkin y /checkout,
 * antes de marcar y antes de contestar.
 *
 * Si quien coordina ya la autorizó, queda como está, venga lo que venga del teléfono: la
 * autorización vale lo mismo que el código QR, y un teléfono que reintenta desde la cola sin
 * conexión no la puede convertir en «sin comprobar».
 *
 * `comprobacion` viene del teléfono y tiene una de estas formas:
 *   { codigo: '123456' }                                  — alguien mostró el código QR
 *   { autorizada: true }                                  — quien coordina autorizó el ingreso
 *   { motivoSinComprobar: 'nadie_para_mostrar', detalle }  — se entra igual, y queda en la lista
 *
 * Devuelve `{ estado, medio }`.
 */
export async function registrarComprobacion({ guardia, momento, lat, lng, comprobacion }) {
  const yaHay = await comprobacionDe({ prestadoraId: guardia.prestadora_id, guardiaId: guardia.id, momento });
  if (yaHay?.estado === 'comprobada') {
    return { estado: 'comprobada', medio: yaHay.medio };
  }

  const base = {
    prestadora_id: guardia.prestadora_id,
    guardia_id: guardia.id,
    asistente_id: guardia.asistente_id,
    momento,
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    autorizada_por: null,
  };

  if (comprobacion?.codigo) {
    const { medio, sujetoTipo, sujetoId } = await resolverCodigo({ guardia, codigo: comprobacion.codigo });
    await guardarComprobacion({
      ...base,
      estado: 'comprobada',
      medio,
      sujeto_tipo: sujetoTipo,
      sujeto_id: sujetoId,
      comprobada_en: ahora(),
      motivo_sin_comprobar: null,
      motivo_detalle: null,
    });
    return { estado: 'comprobada', medio };
  }

  // El teléfono dice que lo autorizaron y la base no lo tiene: no se le cree al teléfono.
  if (comprobacion?.autorizada) {
    throw new ErrorConMotivo('faltan_datos', 'Esta llegada todavía no fue autorizada');
  }

  const motivo = comprobacion?.motivoSinComprobar;
  if (!MOTIVOS_SIN_COMPROBAR.includes(motivo)) {
    throw new ErrorConMotivo('faltan_datos', 'Falta el código o el motivo por el que no se pudo comprobar');
  }

  await guardarComprobacion({
    ...base,
    estado: 'sin_comprobar',
    medio: null,
    sujeto_tipo: null,
    sujeto_id: null,
    comprobada_en: null,
    motivo_sin_comprobar: motivo,
    motivo_detalle: String(comprobacion.detalle ?? '').trim().slice(0, LARGO_MAXIMO_DEL_DETALLE) || null,
  });

  return { estado: 'sin_comprobar', medio: null };
}

// ---------------------------------------------------------------------------------------
// Plan B — el Asistente pide autorización, quien coordina la da
// ---------------------------------------------------------------------------------------

/**
 * El Asistente no puede leer el código QR y pide autorización. Queda anotado desde dónde y a qué
 * hora la pidió, y el pedido aparece en el Panel. No marca ni la llegada ni la salida.
 */
export async function pedirAutorizacion({ guardia, momento, lat, lng }) {
  const yaHay = await comprobacionDe({ prestadoraId: guardia.prestadora_id, guardiaId: guardia.id, momento });
  if (yaHay?.estado === 'comprobada') {
    return { id: yaHay.id, estado: yaHay.estado, pedidoEn: yaHay.pedido_en };
  }

  const fila = await guardarComprobacion({
    prestadora_id: guardia.prestadora_id,
    guardia_id: guardia.id,
    asistente_id: guardia.asistente_id,
    momento,
    estado: 'pendiente_de_autorizacion',
    medio: null,
    sujeto_tipo: null,
    sujeto_id: null,
    comprobada_en: null,
    autorizada_por: null,
    motivo_sin_comprobar: null,
    motivo_detalle: null,
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    pedido_en: ahora(),
  });

  return { id: fila.id, estado: fila.estado, pedidoEn: fila.pedido_en };
}

/** Los pedidos de autorización que están esperando a quien coordina. */
export async function pedidosEsperandoAutorizacion(prestadoraId) {
  const { data, error } = await supabase
    .from('guardia_comprobaciones')
    .select(`
      id, momento, pedido_en,
      guardia_id, guardias!guardia_comprobaciones_guardia_tenant_fk(fecha, hora_inicio, hora_fin),
      asistente_id, asistentes!guardia_comprobaciones_asistente_tenant_fk(nombre)
    `)
    .eq('prestadora_id', prestadoraId)
    .eq('estado', 'pendiente_de_autorizacion')
    .order('pedido_en', { ascending: true });
  if (error) throw new Error(error.message);

  return (data ?? []).map((fila) => ({
    id: fila.id,
    guardiaId: fila.guardia_id,
    momento: fila.momento,
    pedidoEn: fila.pedido_en,
    asistente: fila.asistentes?.nombre ?? null,
    fecha: fila.guardias?.fecha ?? null,
    horaInicio: fila.guardias?.hora_inicio ?? null,
    horaFin: fila.guardias?.hora_fin ?? null,
  }));
}

/**
 * Quien coordina hizo las verificaciones que acostumbre y autoriza. Vale lo mismo que leer el
 * código QR: la comprobación queda hecha, con quién la autorizó y a qué hora. Si lo que se
 * autoriza es una llegada, la salida del Asistente que se va queda autorizada en el mismo acto,
 * así su teléfono cierra la guardia sin pedirle ningún código QR.
 */
export async function autorizarIngreso({ comprobacionId, prestadoraId, autorizadaPor }) {
  if (!autorizadaPor) throw new ErrorConMotivo('faltan_datos', 'Falta quién autoriza');

  const { data: fila } = await supabase
    .from('guardia_comprobaciones')
    .select('id, estado, momento, guardia_id')
    .eq('id', comprobacionId)
    .eq('prestadora_id', prestadoraId)
    .maybeSingle();

  if (!fila) throw new ErrorConMotivo('no_encontrado', 'No se encontró ese pedido');
  if (fila.estado !== 'pendiente_de_autorizacion') {
    throw new ErrorConMotivo('ya_resuelta', 'Ese pedido ya no está esperando autorización');
  }

  const cuando = ahora();
  const autorizada = {
    estado: 'comprobada',
    medio: 'autorizacion_prestadora',
    sujeto_tipo: null,
    sujeto_id: null,
    comprobada_en: cuando,
    autorizada_por: autorizadaPor,
    motivo_sin_comprobar: null,
    motivo_detalle: null,
  };

  const { data: cambiada, error } = await supabase
    .from('guardia_comprobaciones')
    .update({ ...autorizada, updated_at: cuando })
    .eq('prestadora_id', prestadoraId)
    .eq('id', comprobacionId)
    .eq('estado', 'pendiente_de_autorizacion')
    .select('id');
  if (error) throw new Error(error.message);
  if (!cambiada?.length) throw new ErrorConMotivo('ya_resuelta', 'Ese pedido ya no está esperando autorización');

  if (fila.momento === 'checkin') {
    const { data: guardia } = await supabase
      .from('guardias')
      .select('id, prestadora_id, asistente_id, paciente_id')
      .eq('id', fila.guardia_id)
      .eq('prestadora_id', prestadoraId)
      .maybeSingle();

    if (guardia) {
      const salientes = await guardiasSalientes(guardia, await pacientesDeLaGuardia(guardia));
      for (const saliente of salientes) {
        const suya = await comprobacionDe({ prestadoraId, guardiaId: saliente.id, momento: 'checkout' });
        if (suya?.estado === 'comprobada') continue;
        await guardarComprobacion({
          prestadora_id: prestadoraId,
          guardia_id: saliente.id,
          asistente_id: saliente.asistente_id,
          momento: 'checkout',
          ...autorizada,
        });
      }
    }
  }

  // Ese pedido dejó de estar esperando. Quien lo esté mirando desde otra pantalla lo ve
  // desaparecer solo, en vez de quedarse con un pedido que alguien ya resolvió.
  empujar(prestadoraId, ASUNTOS.PEDIDOS_DE_AUTORIZACION);

  return { estado: 'comprobada', comprobadaEn: cuando };
}
