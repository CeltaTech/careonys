import { supabase } from '../db/connection.js';
import { accesosParaGuardar, mezclarAccesosConCatalogo } from './catalogoPersonasAutorizadas.js';
import { visibilidadDeLaPrestadora } from './visibilidadPrestadora.js';
import { textoDeLaInstruccion, verificadorDelDocumento, IDIOMA_DEL_DOCUMENTO } from './documentoInstruccionPersonasAutorizadas.js';
import { avisarPorWhatsapp } from './whatsapp.js';
import { enviarEmail, configuracionEvento } from './email.js';
import { ErrorConMotivo } from './errorConMotivo.js';
import { cuentaDeLaFila, cuentasDeLasFilas } from './cuentaDeLaFila.js';
import { correoDe } from './correoDeUnaPersona.js';
import { mensajeDelSistema } from '../i18n/avisos.js';
import { idiomaDeLaPrestadora } from '../i18n/idiomaDeLaPrestadora.js';
import {
  codigoCoincide,
  codigoNuevoParaGuardar,
  estaVencido,
  minutosQueFaltan,
  seAgotaronLosIntentos,
  sumarIntento,
  vencimientoEnMinutos,
  INTENTOS_MAXIMOS,
} from './codigoDeUnSoloUso.js';

// Todo lo que le pasa a una autorización de acceso de las personas autorizadas: se arma, se firma
// —desde la aplicación con un código, o con el documento firmado que sube la Prestadora—, o se
// anula porque llegó otra.
//
// LOS PERMISOS RIGEN DESDE LA FIRMA. Al armarla, los accesos que pide quedan guardados en la
// misma autorización (`accesos_pedidos`), y recién al firmarse pasan a
// `permisos_personas_autorizadas`. Hasta entonces sigue rigiendo lo anterior, y una persona recién
// anotada no tiene ningún acceso.
//
// UNA SOLA PENDIENTE POR CLIENTE. Si llega una autorización nueva antes de que se firme la
// anterior, la anterior se anula: lo último que pidió el titular es lo que vale, y dos pendientes
// a la vez dejarían al titular firmando algo que ya no rige. La base lo exige además con un índice
// único, así que esto no es la única defensa. Por eso la nueva parte de lo que pedía la pendiente,
// y no de lo que rige: si no, anotar a una segunda persona borraría lo pedido para la primera.
//
// EL CÓDIGO ES DE UN SOLO USO Y SE GUARDA SU IDENTIFICADOR DE VERIFICACIÓN, NUNCA EL CÓDIGO. Cómo se arma, cómo se
// compara y cuántos intentos se toleran está una sola vez, en `codigoDeUnSoloUso.js`: es el mismo
// mecanismo que usan la recuperación de acceso y el pase de guardia.
const VIGENCIA_DEL_CODIGO_MINUTOS = 10;

// Quiénes son las personas autorizadas de este Cliente. El nombre y el DNI salen de su Ficha de
// Persona, que es donde se guardan una sola vez. El titular no tiene fila acá: ve todo siempre, y
// ninguna autorización le puede quitar nada, ni siquiera una suya.
async function personasAutorizadasDelCliente(clienteId) {
  const { data, error } = await supabase
    .from('personas_autorizadas')
    .select('usuario_id, persona_id, email, created_at, personas(nombre, apellido, dni)')
    .eq('cliente_id', clienteId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);

  return (data ?? []).map((fila) => ({
    usuarioId: fila.usuario_id,
    personaId: fila.persona_id,
    email: fila.email,
    nombre: [fila.personas?.nombre, fila.personas?.apellido].filter(Boolean).join(' ') || null,
    dni: fila.personas?.dni ?? null,
  }));
}

// Lo último que se pidió para cada persona: lo que pide la autorización pendiente, si hay una, y
// si no lo que rige. Es de donde parte una autorización nueva, para que cambiar a una persona no
// les cambie nada a las demás.
async function ultimoPedidoPorPersona(clienteId, prestadoraId) {
  const pendiente = await instruccionPendiente(clienteId, prestadoraId);
  if (pendiente) return pendiente.accesos_pedidos ?? {};

  const { data: filas, error } = await supabase
    .from('permisos_personas_autorizadas')
    .select('usuario_id, clave, permitido')
    .eq('cliente_id', clienteId);
  if (error) throw new Error(error.message);

  const porPersona = {};
  for (const fila of filas ?? []) {
    porPersona[fila.usuario_id] ??= {};
    porPersona[fila.usuario_id][fila.clave] = Boolean(fila.permitido);
  }
  return porPersona;
}

// Lo que la autorización firmada pide pasa a regir: reemplaza entero lo anterior. Una persona que
// se retiró mientras la autorización esperaba firma no recibe nada.
async function aplicarLosAccesosPedidos({ clienteId, instruccionId, accesosPedidos }) {
  const presentes = new Set((await personasAutorizadasDelCliente(clienteId)).map((persona) => persona.usuarioId));
  const ahora = new Date().toISOString();

  const filas = Object.entries(accesosPedidos ?? {})
    .filter(([usuarioId]) => presentes.has(usuarioId))
    .flatMap(([usuarioId, accesos]) => Object.entries(accesos).map(([clave, permitido]) => ({
      cliente_id: clienteId,
      usuario_id: usuarioId,
      clave,
      permitido: Boolean(permitido),
      instruccion_id: instruccionId,
      updated_at: ahora,
    })));

  const { error: errorBorrar } = await supabase
    .from('permisos_personas_autorizadas')
    .delete()
    .eq('cliente_id', clienteId);
  if (errorBorrar) throw new Error(errorBorrar.message);

  if (filas.length === 0) return;
  const { error } = await supabase.from('permisos_personas_autorizadas').insert(filas);
  if (error) throw new Error(error.message);
}

async function nombreDe(usuarioId, prestadoraId) {
  if (!usuarioId || !prestadoraId) return null;
  const { data } = await supabase
    .from('usuarios')
    .select('nombre')
    .eq('prestadora_id', prestadoraId)
    .eq('id', usuarioId)
    .maybeSingle();
  return data?.nombre ?? null;
}

// Arma la autorización con las personas anotadas hoy: el documento se guarda tal cual, junto con
// los accesos que pide, y queda pendiente de firma. No cambia ningún acceso: eso pasa al firmarse.
//
// `accesosPedidos` tiene la forma `{ <usuarioId>: { <clave>: true/false } }` y trae lo que cambia.
// Las personas que no vienen ahí conservan lo último que se pidió para ellas. Lo que llegue de una
// persona que no está anotada se ignora, y lo que falte de una que sí está se completa con el
// valor de fábrica: la autorización dice entero qué puede cada una.
export async function crearInstruccion({ clienteId, prestadoraId, cargadaPor, accesosPedidos }) {
  if (!prestadoraId) throw new ErrorConMotivo('faltan_datos', 'Falta la Prestadora');

  // La Prestadora se nombra en la consulta y no se comprueba después sobre la fila leída: un
  // Cliente de otra Organización no se encuentra, en vez de encontrarse y descartarse.
  const { data: cliente } = await supabase
    .from('clientes')
    .select('id')
    .eq('prestadora_id', prestadoraId)
    .eq('id', clienteId)
    .maybeSingle();
  if (!cliente) {
    throw new ErrorConMotivo('no_encontrado', 'Cliente no encontrado');
  }

  // Sin ninguna persona también se arma: es la autorización que retira a la última.
  const personas = await personasAutorizadasDelCliente(clienteId);
  const anterior = await ultimoPedidoPorPersona(clienteId, prestadoraId);

  // Con la maestra, como todo este archivo: lo llama el Panel, y la base no le deja leer a
  // Superadmin la configuración de la aplicación.
  const visibilidad = await visibilidadDeLaPrestadora(supabase, prestadoraId);

  const { data: prestadora } = await supabase
    .from('prestadoras')
    .select('nombre_fantasia')
    .eq('id', prestadoraId)
    .maybeSingle();

  const pedidos = Object.fromEntries(personas.map((persona) => {
    const pedido = { ...anterior[persona.usuarioId], ...accesosPedidos?.[persona.usuarioId] };
    const filas = accesosParaGuardar({ pedido, visibilidad });
    return [persona.usuarioId, Object.fromEntries(filas.map((fila) => [fila.clave, fila.permitido]))];
  }));

  const texto = textoDeLaInstruccion({
    prestadora: { nombre: prestadora?.nombre_fantasia },
    titular: {
      nombre: await nombreDe(await cuentaDeLaFila('clientes', clienteId, prestadoraId), prestadoraId),
    },
    personas: personas.map((persona) => ({
      nombre: persona.nombre,
      dni: persona.dni,
      accesos: pedidos[persona.usuarioId],
    })),
  });

  // La anterior se anula antes de insertar la nueva, o el índice único de la base rechaza la
  // inserción. No se borra: el historial de lo que el titular fue pidiendo es justamente lo que
  // esta tabla existe para guardar.
  const { error: errorAnular } = await supabase
    .from('instrucciones_acceso_personas_autorizadas')
    .update({ estado: 'anulada' })
    .eq('prestadora_id', prestadoraId)
    .eq('cliente_id', clienteId)
    .eq('estado', 'pendiente_firma');
  if (errorAnular) throw new Error(errorAnular.message);

  const { data: instruccion, error: errorInstruccion } = await supabase
    .from('instrucciones_acceso_personas_autorizadas')
    .insert({
      prestadora_id: prestadoraId,
      cliente_id: clienteId,
      dada_por: clienteId,
      cargada_por: cargadaPor,
      documento_texto: texto,
      documento_verificador: verificadorDelDocumento(texto),
      documento_idioma: IDIOMA_DEL_DOCUMENTO,
      accesos_pedidos: pedidos,
    })
    .select('id, estado, documento_texto, documento_verificador, created_at')
    .single();
  if (errorInstruccion) throw new Error(errorInstruccion.message);

  return instruccion;
}

// Lo que está esperando firma, si hay algo. Lo miran las dos puntas: el Panel para mostrar que
// quedó pendiente, y la aplicación del titular para ofrecerle firmarla.
export async function instruccionPendiente(clienteId, prestadoraId) {
  if (!clienteId || !prestadoraId) return null;

  const { data } = await supabase
    .from('instrucciones_acceso_personas_autorizadas')
    .select('id, documento_texto, documento_idioma, accesos_pedidos, created_at')
    .eq('prestadora_id', prestadoraId)
    .eq('cliente_id', clienteId)
    .eq('estado', 'pendiente_firma')
    .maybeSingle();

  return data ?? null;
}

// El código que el titular necesita para confirmar desde la aplicación. Va al teléfono cuando la
// Prestadora tiene WhatsApp configurado, y si no —o si el envío falla— al correo, que es el único
// canal que siempre existe. Nunca se pierde la confirmación por un problema de un canal; mismo
// criterio que los mensajes al Coordinador.
export async function pedirCodigo({ instruccionId, clienteId, prestadoraId }) {
  if (!prestadoraId) throw new ErrorConMotivo('faltan_datos', 'Falta la Prestadora');

  const { data: instruccion } = await supabase
    .from('instrucciones_acceso_personas_autorizadas')
    .select('id, prestadora_id, estado, codigo_intentos, codigo_expira_en')
    .eq('prestadora_id', prestadoraId)
    .eq('id', instruccionId)
    .eq('cliente_id', clienteId)
    .maybeSingle();

  if (!instruccion) throw new ErrorConMotivo('no_encontrado', 'Instrucción no encontrada');
  if (instruccion.estado !== 'pendiente_firma') {
    throw new ErrorConMotivo('ya_cerrada', 'Esta instrucción ya no está pendiente de firma');
  }

  // El código nuevo no devuelve intentos: la cuenta es de esta instrucción y no del código de
  // turno (pendiente #177). El porqué, y por qué el caso legítimo del código vencido sigue
  // andando, está escrito una sola vez en `codigoDeUnSoloUso.js`.
  //
  // Salvo después del bloqueo. Agotados los intentos, la instrucción queda bloqueada hasta que
  // vence el último código; mientras tanto no se manda otro, y pasado ese tiempo el código nuevo
  // trae los cinco intentos. Es lo mismo que hace el código al teléfono.
  const bloqueada = (instruccion.codigo_intentos ?? 0) > INTENTOS_MAXIMOS;
  if (bloqueada && !estaVencido(instruccion.codigo_expira_en)) {
    const err = new ErrorConMotivo('demasiados_intentos');
    err.minutos = minutosQueFaltan(instruccion.codigo_expira_en);
    throw err;
  }

  const { codigo, campos } = codigoNuevoParaGuardar(vencimientoEnMinutos(VIGENCIA_DEL_CODIGO_MINUTOS));
  const { error } = await supabase
    .from('instrucciones_acceso_personas_autorizadas')
    .update(bloqueada ? { ...campos, codigo_intentos: 0 } : campos)
    .eq('prestadora_id', prestadoraId)
    .eq('id', instruccionId);
  if (error) throw new Error(error.message);

  const { data: prestadora } = await supabase
    .from('prestadoras')
    .select('nombre_fantasia')
    .eq('id', instruccion.prestadora_id)
    .maybeSingle();

  // `clienteId` es el Legajo; el teléfono es de la persona y vive en la cuenta de la que cuelga.
  const cuentasTitular = await cuentasDeLasFilas('clientes', [clienteId], 'telefono', prestadoraId);
  const titular = cuentasTitular.get(clienteId) ?? null;

  const remite = prestadora?.nombre_fantasia ?? '';
  const textos = mensajeDelSistema('codigo_instruccion_personas_autorizadas', await idiomaDeLaPrestadora(supabase, instruccion.prestadora_id), {
    codigo,
    minutos: VIGENCIA_DEL_CODIGO_MINUTOS,
    remite,
  });
  const cuerpo = textos.texto;

  if (titular?.telefono) {
    try {
      // Lo empieza la Prestadora, así que sólo sale por la plantilla que le eligió al mensaje. Sin
      // plantilla aprobada `avisarPorWhatsapp` devuelve que no salió, y el código va por correo:
      // el Cliente lo está esperando en la pantalla para poder firmar.
      const config = await configuracionEvento('codigo_instruccion_personas_autorizadas', instruccion.prestadora_id);
      const salio = await avisarPorWhatsapp({
        config,
        prestadoraId: instruccion.prestadora_id,
        telefono: titular.telefono,
        valores: [textos.asunto, cuerpo],
      });
      if (salio) return { enviadoA: 'telefono' };
    } catch (error) {
      // Se anota que falló el canal, nunca el número ni el código (CLAUDE.md §6).
      console.error('pedirCodigo: falló el envío por WhatsApp, cae a correo:', error.message);
    }
  }

  // `clienteId` es el Legajo; el correo es de la persona y vive en la cuenta de la que cuelga.
  const correoTitular = await correoDe({
    prestadoraId,
    usuarioId: await cuentaDeLaFila('clientes', clienteId, prestadoraId),
  });
  if (!correoTitular) {
    throw new ErrorConMotivo('sin_canal', 'No hay a dónde mandar el código');
  }

  await enviarEmail({
    to: correoTitular,
    asunto: textos.asunto,
    texto: cuerpo,
    prestadoraId: instruccion.prestadora_id,
  });

  return { enviadoA: 'correo' };
}

// Cierra la instrucción con el código. Devuelve el motivo del rechazo en vez de lanzarlo, porque
// la pantalla tiene que poder decir cosas distintas: no es lo mismo «el código no es» que «se
// venció» o «probó demasiadas veces, pida uno nuevo».
export async function confirmarConCodigo({ instruccionId, clienteId, prestadoraId, codigo, desde }) {
  if (!prestadoraId) return { ok: false, motivo: 'no_encontrado' };

  const { data: instruccion } = await supabase
    .from('instrucciones_acceso_personas_autorizadas')
    .select('id, cliente_id, estado, codigo_verificador, codigo_expira_en, accesos_pedidos')
    .eq('prestadora_id', prestadoraId)
    .eq('id', instruccionId)
    .eq('cliente_id', clienteId)
    .maybeSingle();

  if (!instruccion) return { ok: false, motivo: 'no_encontrado' };
  if (instruccion.estado !== 'pendiente_firma') return { ok: false, motivo: 'ya_cerrada' };
  if (!instruccion.codigo_verificador) return { ok: false, motivo: 'sin_codigo' };

  // El vencimiento se mira ANTES de contar, y es lo que deja intacto el caso legítimo: a quien
  // se le venció el código no se le gasta ningún intento, así que llega al código nuevo con los
  // cinco enteros.
  if (estaVencido(instruccion.codigo_expira_en)) return { ok: false, motivo: 'vencido' };

  // La suma la hace la base en un solo paso. Antes se leía y se escribía por separado, y dos
  // intentos a la vez contaban como uno (pendiente #177).
  const intentos = await sumarIntento({
    tabla: 'instrucciones_acceso_personas_autorizadas',
    id: instruccionId,
    prestadoraId,
  });
  // El sexto intento bloquea por el tiempo de vida de un código, igual que el código al teléfono;
  // los que llegan durante el bloqueo sólo informan cuánto falta.
  if (seAgotaronLosIntentos(intentos)) {
    if (intentos === INTENTOS_MAXIMOS + 1) {
      await supabase
        .from('instrucciones_acceso_personas_autorizadas')
        .update({ codigo_expira_en: vencimientoEnMinutos(VIGENCIA_DEL_CODIGO_MINUTOS) })
        .eq('prestadora_id', prestadoraId)
        .eq('id', instruccionId);
      return { ok: false, motivo: 'demasiados_intentos', minutos: VIGENCIA_DEL_CODIGO_MINUTOS };
    }
    return { ok: false, motivo: 'demasiados_intentos', minutos: minutosQueFaltan(instruccion.codigo_expira_en) };
  }

  if (!codigoCoincide(codigo, instruccion.codigo_verificador)) {
    return { ok: false, motivo: 'codigo_incorrecto' };
  }

  const { error } = await supabase
    .from('instrucciones_acceso_personas_autorizadas')
    .update({
      estado: 'cerrada',
      cerrada_como: 'confirmada_en_la_app',
      cerrada_en: new Date().toISOString(),
      cerrada_desde: desde ?? null,
      // El código ya cumplió: se borra para que no quede un identificador de verificación vivo de algo de un solo uso.
      codigo_verificador: null,
      codigo_expira_en: null,
    })
    .eq('prestadora_id', prestadoraId)
    .eq('id', instruccionId)
    .eq('estado', 'pendiente_firma');
  if (error) throw new Error(error.message);

  await aplicarLosAccesosPedidos({
    clienteId: instruccion.cliente_id,
    instruccionId,
    accesosPedidos: instruccion.accesos_pedidos,
  });

  return { ok: true };
}

// El otro camino, el de siempre: el titular firma la hoja en papel, la Prestadora la guarda y
// carga el archivo. La ruta que sube el archivo se encarga del depósito; acá sólo se cierra.
export async function cerrarConPapelFirmado({ instruccionId, prestadoraId, archivoUrl }) {
  const { data: instruccion } = await supabase
    .from('instrucciones_acceso_personas_autorizadas')
    .select('id, cliente_id, estado, accesos_pedidos')
    .eq('id', instruccionId)
    .eq('prestadora_id', prestadoraId)
    .maybeSingle();

  if (!instruccion) throw new ErrorConMotivo('no_encontrado', 'Instrucción no encontrada');
  if (instruccion.estado !== 'pendiente_firma') {
    throw new ErrorConMotivo('ya_cerrada', 'Esta instrucción ya no está pendiente de firma');
  }

  const { error } = await supabase
    .from('instrucciones_acceso_personas_autorizadas')
    .update({
      estado: 'cerrada',
      cerrada_como: 'papel_firmado',
      cerrada_en: new Date().toISOString(),
      archivo_firmado_url: archivoUrl,
    })
    .eq('prestadora_id', prestadoraId)
    .eq('id', instruccionId)
    .eq('estado', 'pendiente_firma');
  if (error) throw new Error(error.message);

  await aplicarLosAccesosPedidos({
    clienteId: instruccion.cliente_id,
    instruccionId,
    accesosPedidos: instruccion.accesos_pedidos,
  });
}

// Las diez claves con lo decidido para cada persona autorizada, que es lo que dibuja la pantalla
// del Panel. Se devuelve siempre el catálogo entero, tenga o no fila guardada cada clave.
export async function personasAutorizadasConSusAccesos({ clienteId, prestadoraId }) {
  const personas = await personasAutorizadasDelCliente(clienteId);
  if (personas.length === 0) return [];

  const { data: filas } = await supabase
    .from('permisos_personas_autorizadas')
    .select('usuario_id, clave, permitido')
    .eq('cliente_id', clienteId);

  // Con la maestra, por lo mismo que al crear la autorización.
  const visibilidad = await visibilidadDeLaPrestadora(supabase, prestadoraId);
  const porPersona = new Map(personas.map((persona) => [persona.usuarioId, []]));
  for (const fila of filas ?? []) {
    porPersona.get(fila.usuario_id)?.push(fila);
  }

  // `accesos` es lo que rige; `pedido`, lo último que se pidió, que es de donde parte la próxima
  // autorización. Difieren mientras hay una esperando firma, o con una persona recién anotada.
  const anterior = await ultimoPedidoPorPersona(clienteId, prestadoraId);

  return personas.map((persona) => ({
    ...persona,
    accesos: mezclarAccesosConCatalogo({
      filasGuardadas: porPersona.get(persona.usuarioId),
      visibilidad,
    }),
    pedido: Object.fromEntries(
      accesosParaGuardar({ pedido: anterior[persona.usuarioId], visibilidad })
        .map((fila) => [fila.clave, fila.permitido]),
    ),
  }));
}
