import { Router } from 'express';
import { requiereRolCliente } from '../middleware/requiereRolCliente.js';
import { supabase, clienteDelPedido } from '../db/connection.js';
import { anotarConsultaAHce, origenDelPedido } from '../utils/registroDeConsultas.js';
import { resolverVitalesHabilitados } from '../utils/vitalesReferencia.js';
import { generarTokenQrCobro } from '../utils/qrCobroEfectivo.js';
import { marcaDeLaPrestadora } from '../utils/marcaPrestadora.js';
import { contactoDeLaPrestadora } from '../utils/contactoDeLaPrestadora.js';
import { visibilidadDelPedido, exigeVisible } from '../utils/visibilidadPrestadora.js';
import { columnasSegunVisibilidad } from '../utils/catalogoVisibilidad.js';
import { tipoDelAsistente, tipoConSusTareas } from '../utils/tareasDelTipo.js';
import { esFechaISO, semanaQueContiene } from '../utils/fechas.js';
import { pacientesConDomicilioDeHoy } from '../utils/domicilioDelDia.js';
import { guardarSuscripcionPush } from '../utils/suscripcionesPush.js';
import { accesosDelPedido, exigeDePersonasAutorizadas, soloElTitular, visibilidadDeLaPersona } from '../utils/accesosDePersonasAutorizadas.js';
import { instruccionPendiente, pedirCodigo, confirmarConCodigo } from '../utils/instruccionesPersonasAutorizadas.js';
import { codigoParaMostrar } from '../utils/comprobacionDePresencia.js';
import { responderError, ErrorConMotivo } from '../utils/errorConMotivo.js';
import { topeDePedidos } from '../middleware/topeDePedidos.js';
import { llegadaEstimadaDeGuardia } from '../utils/estimarLlegadaDeGuardia.js';
import { darDeBajaElAcceso } from '../utils/bajaDelAcceso.js';
import { estadoDocumentalParaElCliente } from '../utils/estadoDocumentalParaElCliente.js';
import { laCobranzaLaLlevaOtroSoftware, sinLoQueSeCalculaAca } from '../utils/seguimientoDeLaCobranza.js';
import {
  direccionParaBajarElComprobante,
  laPrestadoraEntregaLaFactura,
} from '../utils/comprobanteDeLaFactura.js';
import {
  COLUMNAS_PERFIL_PUBLICO,
  FUNCION_QUE_HABILITA_EL_ORDEN,
  ORDEN,
  ordenarPool,
  perfilPublicoDeAsistente,
  promedioDeCalificaciones,
} from '../utils/perfilPublicoDeAsistente.js';
import { lugaresDe, lugaresDeVarias } from '../utils/lugaresDeCadaPersona.js';
import { nombresDeLugares, lugaresPorNombre } from '../utils/catalogoDeLugares.js';
import { funcionDeRiesgoEncendida, ofreceMatch } from '../utils/matchDeLaPrestadora.js';
import {
  LADO,
  abrirVideollamada,
  conversacionDeLaPareja,
  desdeCuando,
  escribirMensaje,
  marcarLeido,
  mensajesDeLaConversacion,
  videollamadaEnCurso,
} from '../utils/conversacionMatch.js';
import { direccionDeVideollamada } from '../utils/videollamada.js';
import { abrirElContactoDeUnAsistente, comoEstaElContacto } from '../utils/contactoDelAsistente.js';
import { MODALIDAD } from '../utils/modalidades.js';
import { diaISO } from '../utils/reglaVencimientos.js';

export const appClientesRouter = Router();

// CON LA CREDENCIAL DE QUIEN PIDE. Lo de esta ruta entra a la base con `clienteDelPedido(req)`, no
// con la llave maestra: la base sabe quién pide y le contesta sólo lo de su Cliente y su
// Prestadora. Por eso esas consultas no llevan el filtro de la Prestadora de la sesión; los filtros
// que quedan dicen de qué Paciente, de qué factura o de qué hilo se habla.
//
// LO QUE SIGUE CON LA LLAVE MAESTRA, Y POR QUÉ. Cada consulta que queda con `supabase` lo dice en
// su renglón. Son de dos clases: lo que la base no le deja ver a un Cliente y la pantalla sí
// muestra —la vidriera del Match, que es gente que todavía no lo atendió, y el estado
// documental agregado—, y lo que hoy se contesta a una persona autorizada sin el acceso que la base
// pide para esa tabla —las guardias en la pantalla del Paciente—. Pasarlas a la credencial
// cambiaría lo que ve la persona, y eso no se decide acá.

// pacientes.medicacion_habitual queda deprecado: la medicación vigente se deriva de
// indicaciones_medicacion (estado='aceptada'), nunca de este JSONB suelto.
//
// Las patologías y las coordenadas del domicilio solo se piden si la Prestadora las tiene
// prendidas: lo que no se puede ver, no se manda. `nivel_complejidad` no se pide —ninguna
// pantalla del Cliente lo muestra— y sería una etiqueta clínica de más viajando al teléfono.
//
// RECIBE EL PEDIDO ENTERO Y NO LA VISIBILIDAD SUELTA. Acá hay que saber dos cosas —qué muestra la
// Prestadora y qué le dieron a esta persona— y las dos ya vienen contestadas y guardadas en el
// pedido. Pasándolas por parámetro, una ruta nueva que se olvide de una le mandaría a alguien la
// ficha que el titular le negó, y nadie se enteraría.
async function pacienteDelCliente(db, pacienteId, req) {
  const usuarioCliente = req.usuarioCliente;
  const visibilidad = await visibilidadDeLaPersona(req);
  const accesos = await accesosDelPedido(req);

  // A quien no le dieron la ficha se le contesta que el Paciente existe y nada más: sin domicilio,
  // sin patologías y sin coordenadas. No se lo saca de la lista —dejaría esa aplicación vacía y sin
  // explicación, y quien tenga la agenda o los reportes los sigue necesitando—, y los datos de la
  // persona cuidada directamente no salen de la base.
  const columnas = accesos.persona_autorizada_ficha_del_paciente
    ? columnasSegunVisibilidad([
      'id',
      'nombre',
      'domicilio',
      ['lat', 'cliente_ubicacion_en_vivo'],
      ['lng', 'cliente_ubicacion_en_vivo'],
      ['patologias', 'cliente_patologias_del_paciente'],
      'cliente_id',
      'prestadora_id',
    ], visibilidad)
    : 'id, nombre, cliente_id, prestadora_id';

  const { data } = await db
    .from('pacientes')
    .select(columnas)
    .eq('id', pacienteId)
    .eq('cliente_id', usuarioCliente.clienteId)
    .maybeSingle();
  if (!data) return data;

  // La dirección que se muestra es la de hoy, no la de la ficha, y la decide la base. Va acá
  // adentro y no en cada pantalla para que ninguna se olvide: todas las pantallas del Cliente
  // que muestran un Paciente pasan por esta función.
  const [conDomicilio] = await pacientesConDomicilioDeHoy([data]);
  return conDomicilio;
}

// ============================================================================
// Mi Perfil
// ============================================================================

appClientesRouter.get('/perfil', requiereRolCliente, async (req, res) => {
  // Identidad (nombre/teléfono) vive en `usuarios`, que es la cuenta de la persona. El Legajo
  // —`clientes`— guarda lo suyo en esta Prestadora; el email lo tiene Supabase Auth, no una
  // columna.
  const db = clienteDelPedido(req);
  const { data: usuario, error } = await db
    .from('usuarios')
    .select('nombre, telefono, email')
    .eq('id', req.usuarioCliente.id)
    .single();
  if (error || !usuario) {
    return res.status(404).json({ error: 'Perfil no encontrado' });
  }

  // La marca va acá y no en una dirección aparte porque el encabezado la
  // necesita ni bien la persona entra, que es exactamente cuando la aplicación
  // ya pide el perfil. Dos pedidos para dibujar una misma pantalla es un
  // pedido de más.
  const marca = await marcaDeLaPrestadora(req.usuarioCliente.prestadoraId);

  // Y cómo se llega a ella, por el mismo motivo que la marca: el botón de contacto aparece
  // adentro de pantallas que ya están dibujadas —una alerta abierta a las tres de la mañana— y
  // pedirlo recién ahí sería un pedido de más justo cuando hay apuro.
  const contacto = await contactoDeLaPrestadora(req.usuarioCliente.prestadoraId);

  // Qué eligió mostrar esta Prestadora, por el mismo motivo que la marca: la aplicación lo
  // necesita para dibujar el menú y las pantallas desde el primer momento, y ya está pidiendo
  // el perfil. Es una lista de qué dibujar, no un permiso: el candado de verdad está en cada
  // consulta del backend, que directamente no manda lo apagado.
  const visibilidad = await visibilidadDelPedido(req);

  // Qué le dejaron ver a esta persona, por el mismo motivo que los dos de arriba: la aplicación
  // lo necesita para dibujar el menú. Igual que la visibilidad, es una lista de qué dibujar y no
  // un permiso — el candado está en cada ruta, que directamente no contesta lo que no le dieron.
  const accesos = await accesosDelPedido(req);

  // El plan contratado es una condición comercial, no un dato del cuidado: va con el resto de
  // lo que la Prestadora decide mostrar sobre el dinero. Hay Prestadoras que cobran por fuera
  // de la aplicación y no quieren que el plan aparezca en el teléfono del Cliente. Apagado
  // el interruptor, ni siquiera se le pregunta a la base cuál es. Y lo mismo vale persona por
  // persona: quien acompaña el cuidado no siempre es quien paga.
  let plan = null;
  if (visibilidad.cliente_pagos_y_suscripcion && accesos.persona_autorizada_dinero) {
    const { data: cliente } = await db
      .from('clientes')
      .select('plan')
      .eq('id', req.usuarioCliente.clienteId)
      .maybeSingle();
    plan = cliente?.plan ?? null;
  }

  // Y si hay una instrucción esperando su firma, se la ofrece. Sólo al titular: la instrucción
  // dice qué se le dio y qué se le negó a cada persona autorizada, y eso es del titular.
  const pendiente = req.usuarioCliente.esTitular
    ? await instruccionPendiente(req.usuarioCliente.clienteId, req.usuarioCliente.prestadoraId)
    : null;

  // Si esta Prestadora ofrece Match, la aplicación tiene una pantalla más —la vidriera de
  // Asistentes— y el menú la dibuja. Va acá por el mismo motivo que la marca y la visibilidad:
  // el menú se arma apenas la persona entra, que es cuando ya se está pidiendo el perfil. El
  // candado sigue estando en cada ruta de la vidriera, que no contesta nada sin volver a
  // preguntarlo.
  const match = await ofreceMatch(req.usuarioCliente.prestadoraId);

  res.json({
    perfil: {
      ...usuario,
      plan,
      esTitular: req.usuarioCliente.esTitular,
    },
    marca,
    contacto,
    visibilidad,
    accesos,
    match,
    instruccionPendiente: pendiente,
  });
});

// ============================================================================
// La instrucción sobre los accesos de las personas autorizadas, del lado del titular
//
// Acá el titular no configura nada: lee lo que pidió y lo confirma. Quién entra como persona autorizada y qué
// ve cada uno lo carga la Prestadora, como siempre. Esta es la firma, y nada más.
//
// Y firma esta hoja y ninguna otra. Careonys no es un sistema para firmar documentos.
// ============================================================================

appClientesRouter.get('/instruccion-pendiente', requiereRolCliente, soloElTitular, async (req, res) => {
  res.json({
    instruccion: await instruccionPendiente(
      req.usuarioCliente.clienteId,
      req.usuarioCliente.prestadoraId,
    ),
  });
});

// Pide el código que llega al teléfono. La persona ya entró con su clave: el código es el segundo
// paso, no el único — juntos son la firma que se aprobó.
//
// LAS DOS RUTAS LLEVAN TOPE DE PEDIDOS POR MINUTO. Acá quien prueba los códigos es la misma
// persona que los pide, así que sin tope se piden y se prueban sin freno. Cada una cuenta por
// separado: gastar los pedidos de una no tiene que dejar sin la otra.
appClientesRouter.post('/instruccion/:instruccionId/codigo', requiereRolCliente, soloElTitular, topeDePedidos({ nombre: 'instruccion_pedir_codigo' }), async (req, res) => {
  try {
    const { enviadoA } = await pedirCodigo({
      instruccionId: req.params.instruccionId,
      clienteId: req.usuarioCliente.clienteId,
      prestadoraId: req.usuarioCliente.prestadoraId,
    });
    res.json({ ok: true, enviadoA });
  } catch (error) {
    responderError(res, error);
  }
});

appClientesRouter.post('/instruccion/:instruccionId/confirmar', requiereRolCliente, soloElTitular, topeDePedidos({ nombre: 'instruccion_confirmar' }), async (req, res) => {
  const resultado = await confirmarConCodigo({
    instruccionId: req.params.instruccionId,
    clienteId: req.usuarioCliente.clienteId,
    prestadoraId: req.usuarioCliente.prestadoraId,
    codigo: req.body?.codigo,
    // Con qué aparato firmó, para poder reconstruir el acto. Nunca la dirección de red ni ningún
    // otro dato que no haga falta para eso (CLAUDE.md §6).
    desde: req.headers['user-agent']?.slice(0, 300) ?? null,
  });

  if (!resultado.ok) {
    return res.status(400).json({ error: 'No se pudo confirmar', motivo: resultado.motivo });
  }
  res.json({ ok: true });
});

// ============================================================================
// Mis Pacientes — un solo Paciente: la app va directo a su pantalla (regla del PRD);
// varios: el frontend arma la lista con esta misma respuesta.
// ============================================================================

appClientesRouter.get('/pacientes', requiereRolCliente, async (req, res) => {
  const { data, error } = await clienteDelPedido(req)
    .from('pacientes')
    .select('id, nombre, domicilio')
    .eq('cliente_id', req.usuarioCliente.clienteId)
    .order('nombre');
  if (error) {
    return responderError(res, error);
  }
  // Si al Paciente lo están atendiendo estos días en otro lado, el Cliente ve esa dirección y no
  // la de la ficha — es la misma respuesta que ve el Asistente en su teléfono, escrita una sola
  // vez en la base (regla 12). Sin esto, el Cliente y quien cuida al Paciente leerían direcciones
  // distintas para la misma persona el mismo día.
  res.json({ pacientes: await pacientesConDomicilioDeHoy(data) });
});

// ============================================================================
// Pantalla del Paciente — guardia actual (con Asistente asignado, para que el frontend
// abra la suscripción Realtime a esa fila) o, si no hay ninguna activa, la próxima
// programada. Incluye alertas activas (nivel != verde, sin resolver) para el resumen.
// ============================================================================

appClientesRouter.get('/pacientes/:id', requiereRolCliente, async (req, res) => {
  const db = clienteDelPedido(req);
  const visibilidad = await visibilidadDeLaPersona(req);
  const paciente = await pacienteDelCliente(db, req.params.id, req);
  if (!paciente) {
    return res.status(404).json({ error: 'Paciente no encontrado' });
  }

  // Dónde está el Asistente en este momento solo se pide si la Prestadora tiene prendido el
  // mapa en vivo. Apagado, el dato ni siquiera sale de la base: el Cliente sigue viendo que
  // llegó (`checkin_at`) y quién es, que es lo que no depende de seguirle el recorrido.
  const columnasGuardiaActiva = columnasSegunVisibilidad([
    'id', 'fecha', 'hora_inicio', 'hora_fin', 'estado', 'checkin_at',
    ['ubicacion_actual_lat', 'cliente_ubicacion_en_vivo'],
    ['ubicacion_actual_lng', 'cliente_ubicacion_en_vivo'],
    ['ubicacion_actual_at', 'cliente_ubicacion_en_vivo'],
    'asistente_id', 'asistentes(nombre, foto_url)',
  ], visibilidad);

  // Las guardias de esta pantalla siguen con la llave maestra: la ruta no pide `persona_autorizada_guardias`
  // y la base sí, así que con la credencial de la persona, una persona autorizada sin ese acceso
  // dejaría de ver quién está en la casa. El Paciente ya salió comprobado contra el Cliente.
  const { data: guardiaActiva } = await supabase
    .from('guardias')
    .select(columnasGuardiaActiva)
    .eq('prestadora_id', paciente.prestadora_id)
    .eq('paciente_id', paciente.id)
    .eq('estado', 'activa')
    .order('fecha', { ascending: false })
    .limit(1)
    .maybeSingle();

  let guardiaProxima = null;
  if (!guardiaActiva) {
    const { data } = await supabase
      .from('guardias')
      // salida_checkin_at es lo que permite decirle al Cliente "en camino": el Asistente
      // ya salió de su casa pero todavía no llegó al domicilio.
      .select('id, fecha, hora_inicio, hora_fin, dias_hasta_el_fin, estado, salida_checkin_at, asistente_id, asistentes(nombre, foto_url)')
      .eq('prestadora_id', paciente.prestadora_id)
      .eq('paciente_id', paciente.id)
      .eq('estado', 'programada')
      .gte('fecha', new Date().toISOString().slice(0, 10))
      .order('fecha', { ascending: true })
      .order('hora_inicio', { ascending: true })
      .limit(1)
      .maybeSingle();
    guardiaProxima = data || null;
  }

  // A qué hora se estima que llega quien ya salió.
  //
  // LO QUE VIAJA ES UNA HORA Y NADA MÁS. El Cliente lee «llega alrededor de las 14:45». Nunca ve
  // por dónde va: el punto del que salió el Asistente es casi siempre su casa, y mandarlo al
  // teléfono de un tercero sería entregar la ubicación de quien trabaja. Por eso las coordenadas
  // se leen en una consulta aparte, quedan en una variable de este lado y no tocan la respuesta.
  //
  // Es una estimación, no una promesa, y así se dice en la pantalla. Cuando no se puede calcular
  // —salida sin GPS, domicilio sin coordenadas— viaja `null`, que la pantalla trata como «no se
  // sabe»: una hora inventada parece confiable y nadie la vuelve a mirar.
  let llegadaEstimadaAt = null;
  if (guardiaProxima?.salida_checkin_at) {
    const { data: conSuPuntoDeSalida } = await supabase
      .from('guardias')
      .select('id, fecha, paciente_id, salida_checkin_at, salida_lat, salida_lng')
      .eq('id', guardiaProxima.id)
      .eq('prestadora_id', paciente.prestadora_id)
      .maybeSingle();
    const estimada = await llegadaEstimadaDeGuardia(paciente.prestadora_id, conSuPuntoDeSalida);
    llegadaEstimadaAt = estimada ? estimada.toISOString() : null;
  }

  // Las alertas de la revisión automática solo se consultan si esta Prestadora las muestra.
  // Apagadas, la revisión sigue corriendo y el Coordinador se sigue enterando igual — lo que
  // cambia es que no viajan al teléfono del Cliente.
  //
  // Siguen con la llave maestra por el mismo motivo que las guardias: esta pantalla no pide
  // `persona_autorizada_alertas` y la base sí. Y como son dato de salud, queda anotado quién las leyó antes
  // de responder; si no se puede anotar, no se entregan.
  let alertasActivas = [];
  if (visibilidad.cliente_alertas_de_la_revision) {
    const { data } = await supabase
      .from('alertas')
      .select('id, nivel, descripcion, created_at')
      .eq('prestadora_id', paciente.prestadora_id)
      .eq('paciente_id', paciente.id)
      .is('resuelta_at', null)
      .order('created_at', { ascending: false });
    alertasActivas = data || [];

    try {
      await anotarConsultaAHce(
        req.usuarioCliente,
        { pacienteId: paciente.id, categorias: ['alertas'], origen: origenDelPedido(req) },
        { cliente: db },
      );
    } catch (e) {
      return responderError(res, e);
    }
  }

  // Acá no viaja la medicación vigente del Paciente. No la muestra ninguna pantalla del
  // Cliente: la lista de indicaciones tiene su propia dirección, con su propio candado. Sería
  // dato de salud saliendo al teléfono para que nadie lo leyera.
  res.json({
    paciente,
    guardiaActiva: guardiaActiva || null,
    guardiaProxima: guardiaProxima && { ...guardiaProxima, llegada_estimada_at: llegadaEstimadaAt },
    alertasActivas,
  });
});

// ============================================================================
// Las guardias de la semana — la pregunta "¿quién viene el jueves?"
//
// Esta dirección devuelve la semana entera: los siete días, con quién viene en cada uno y cómo
// terminó cada guardia. Con la guardia de ahora y la que sigue no alcanza: todo lo demás —el
// resto de la semana, y lo que pasó con las que ya fueron— termina preguntándose por teléfono,
// y esa llamada la atiende la Coordinadora.
//
// EL DÍA LO PONE EL TELÉFONO, NO EL SERVIDOR. El backend puede estar corriendo en otro huso
// horario que el Cliente; a las diez de la noche en Buenos Aires, el reloj del servidor ya
// puede estar en el día siguiente. Si el servidor eligiera la semana, habría noches en que
// el Cliente abriría la aplicación y vería la semana que viene. Por eso la pantalla manda su
// propio día y el backend devuelve la semana que lo contiene.
// ============================================================================

appClientesRouter.get('/pacientes/:id/guardias', requiereRolCliente, exigeDePersonasAutorizadas('persona_autorizada_guardias'), async (req, res) => {
  const db = clienteDelPedido(req);
  const visibilidad = await visibilidadDeLaPersona(req);
  const paciente = await pacienteDelCliente(db, req.params.id, req);
  if (!paciente) {
    return res.status(404).json({ error: 'Paciente no encontrado' });
  }

  // Si el día no viene o viene mal escrito se usa el del servidor. Es un plan B, no el camino
  // normal: sirve para que un pedido roto muestre una semana razonable en vez de un error, y
  // como mucho se corre un día en las horas del borde.
  const dia = esFechaISO(req.query.dia) ? req.query.dia : new Date().toISOString().slice(0, 10);
  const semana = semanaQueContiene(dia);

  // Se pregunta por `guardia_pacientes` y no por `guardias.paciente_id`: la tabla del medio es
  // la que dice a quiénes cubre cada guardia, y una guardia puede cubrir a más de una persona
  // —el matrimonio que vive en la misma casa— (ver utils/pacientesDeGuardia.js). Buscando por
  // la columna vieja, ese Cliente vería media semana.
  //
  // Entra con la credencial de la persona: la base deja ver sólo las guardias de los Pacientes de
  // este Cliente y de su Prestadora, y la tabla del medio sólo donde la guardia se ve. `paciente_id`
  // ya salió comprobado contra el Cliente por `pacienteDelCliente`.
  const { data: filas, error } = await db
    .from('guardia_pacientes')
    .select(`
      guardias!inner(
        id, fecha, hora_inicio, hora_fin, dias_hasta_el_fin, estado, cancelacion_origen,
        checkin_at, checkout_at, prestadora_id,
        asistentes(nombre)
      )
    `)
    .eq('paciente_id', paciente.id)
    .gte('guardias.fecha', semana.desde)
    .lte('guardias.fecha', semana.hasta);

  if (error) {
    return responderError(res, error);
  }

  // Qué viaja al teléfono: lo que la pantalla dibuja y nada más. El identificador del Asistente
  // y su foto no se mandan —la pantalla muestra el nombre— y la ubicación tampoco entra acá:
  // dónde está el Asistente ahora es la pantalla del Paciente, con su propio interruptor.
  const guardias = (filas ?? []).map(({ guardias: g }) => ({
    id: g.id,
    fecha: g.fecha,
    hora_inicio: g.hora_inicio,
    hora_fin: g.hora_fin,
    estado: g.estado,
    // Quién canceló cambia lo que el Cliente lee: no es lo mismo "ustedes la cancelaron" que
    // "la canceló la Prestadora". Es un dato que ya está guardado, no uno que se calcule acá.
    cancelacion_origen: g.cancelacion_origen,
    checkin_at: g.checkin_at,
    checkout_at: g.checkout_at,
    asistente: g.asistentes?.nombre ?? null,
  }));

  // El orden se arma acá y no en la consulta porque el pedido ordena la tabla del medio, no la
  // guardia de adentro: pedirle a la base que ordene por una columna prestada no ordena las
  // filas de arriba. Son las guardias de una semana, así que ordenarlas cuesta nada.
  guardias.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.hora_inicio.localeCompare(b.hora_inicio));

  // La semana sale con los siete días escritos, incluidos los que no tienen ninguna guardia.
  // "El jueves no viene nadie" también es una respuesta, y es de las que evitan la llamada.
  // Una guardia de noche que empieza a las 22:00 y termina a las 06:00 se muestra en el día en
  // que empieza, que es el día en que el Cliente la espera.
  res.json({
    desde: semana.desde,
    hasta: semana.hasta,
    // Los días con los que la pantalla vuelve a pedir la semana de al lado. Van armados desde
    // el backend para que la pantalla no tenga que hacer cuentas de calendario por su cuenta.
    semanaAnterior: semana.semanaAnterior,
    semanaSiguiente: semana.semanaSiguiente,
    dias: semana.dias.map((fecha) => ({
      fecha,
      guardias: guardias.filter((g) => g.fecha === fecha),
    })),
  });
});

// ============================================================================
// Reportes del Paciente
// ============================================================================

// Qué columnas de un reporte viajan al teléfono. Una sola definición para la lista y para el
// reporte suelto: si se escribiera dos veces, con el tiempo una de las dos mandaría de más.
//
// `texto_libre` no se pide: es el relato crudo que dictó el Asistente antes de ordenarlo en
// campos, ninguna pantalla del Cliente lo muestra, y sería el dato más delicado del reporte
// viajando al teléfono sin que nadie lo leyera.
//
// `medicacion` es lo que se le dio en ese turno, y va bajo el mismo interruptor que la lista de
// indicaciones: si la Prestadora decidió que la medicación no se muestra, no alcanza con
// esconder la lista y dejarla escrita adentro de cada reporte.
function columnasDelReporte(visibilidad) {
  return columnasSegunVisibilidad([
    'id', 'alimentacion',
    ['medicacion', 'cliente_medicacion_del_paciente'],
    ['signos_vitales', 'cliente_signos_vitales'],
    'estado_animo', 'incidentes', 'observaciones', 'foto_url', 'created_at',
    'guardias!inner(fecha, asistente_id, asistentes(nombre))',
  ], visibilidad);
}

// De qué tablas salió lo que se entrega de los reportes: los reportes siempre, y los rangos
// normales de los signos vitales sólo cuando viajan.
function categoriasDelReporte(vitales) {
  return vitales?.rangos ? ['reportes', 'rangos_referencia_vitales'] : ['reportes'];
}

appClientesRouter.get('/pacientes/:id/reportes', requiereRolCliente, exigeDePersonasAutorizadas('persona_autorizada_reportes'), async (req, res) => {
  const db = clienteDelPedido(req);
  const visibilidad = await visibilidadDeLaPersona(req);
  const paciente = await pacienteDelCliente(db, req.params.id, req);
  if (!paciente) {
    return res.status(404).json({ error: 'Paciente no encontrado' });
  }

  // El reporte dice de quién habla, así que se piden directo. Buscarlos por los turnos que
  // cubrieron a esta persona traería también los reportes de los otros Pacientes del mismo
  // turno: el Cliente vería en la historia de su padre lo que se escribió sobre el vecino de
  // cuarto.
  //
  // Sigue con la llave maestra: cada reporte trae su guardia pegada (`guardias!inner`), y la base
  // sólo muestra guardias a quien tiene `persona_autorizada_guardias`. Con la credencial de la persona, una
  // persona autorizada con los reportes y sin las guardias vería la lista vacía.
  const columnas = columnasDelReporte(visibilidad);

  const { data, error } = await supabase
    .from('reportes')
    .select(columnas)
    .eq('prestadora_id', paciente.prestadora_id)
    .eq('paciente_id', paciente.id)
    .order('created_at', { ascending: false })
    .limit(60);
  if (error) {
    return responderError(res, error);
  }

  // Los rangos normales solo tienen sentido junto a los valores: sin signos vitales en
  // pantalla, mandar el semáforo de "fuera del rango normal" es mandar información clínica de
  // esa persona sin nada a lo que aplicarla.
  const vitales = visibilidad.cliente_signos_vitales
    ? await resolverVitalesHabilitados(paciente.id, paciente.prestadora_id)
    : { rangos: null };

  // Son dato de salud: queda anotado quién los leyó antes de entregarlos.
  try {
    await anotarConsultaAHce(
      req.usuarioCliente,
      { pacienteId: paciente.id, categorias: categoriasDelReporte(vitales), origen: origenDelPedido(req) },
      { cliente: db },
    );
  } catch (e) {
    return responderError(res, e);
  }

  res.json({ reportes: data, rangosVitales: vitales.rangos });
});

// Un reporte suelto. Existe para que la pantalla que muestra un reporte no tenga que pedir la
// lista entera —hasta 60 reportes con todo adentro— para quedarse con uno solo: serían 59 días
// de información de salud de esa persona viajando al teléfono para descartarse en el acto.
appClientesRouter.get('/pacientes/:id/reportes/:reporteId', requiereRolCliente, exigeDePersonasAutorizadas('persona_autorizada_reportes'), async (req, res) => {
  const db = clienteDelPedido(req);
  const visibilidad = await visibilidadDeLaPersona(req);
  const paciente = await pacienteDelCliente(db, req.params.id, req);
  if (!paciente) {
    return res.status(404).json({ error: 'Paciente no encontrado' });
  }

  // El filtro por Paciente no sobra aunque el reporte se pida por su id: sin él, quien conozca
  // el id de un reporte de otro Paciente lo leería pidiéndolo por esta dirección. Sigue con la
  // llave maestra por el mismo motivo que la lista: la guardia pegada al reporte.
  const { data, error } = await supabase
    .from('reportes')
    .select(columnasDelReporte(visibilidad))
    .eq('id', req.params.reporteId)
    .eq('prestadora_id', paciente.prestadora_id)
    .eq('paciente_id', paciente.id)
    .maybeSingle();
  if (error) {
    return responderError(res, error);
  }
  if (!data) {
    return res.status(404).json({ error: 'Reporte no encontrado' });
  }

  const vitales = visibilidad.cliente_signos_vitales
    ? await resolverVitalesHabilitados(paciente.id, paciente.prestadora_id)
    : { rangos: null };

  try {
    await anotarConsultaAHce(
      req.usuarioCliente,
      { pacienteId: paciente.id, categorias: categoriasDelReporte(vitales), origen: origenDelPedido(req) },
      { cliente: db },
    );
  } catch (e) {
    return responderError(res, e);
  }

  res.json({ reporte: data, rangosVitales: vitales.rangos });
});

// ============================================================================
// Alertas del Paciente (activas + historial resuelto — ver AI_PROMPTS.md IA Nivel 2)
// ============================================================================

appClientesRouter.get('/pacientes/:id/alertas', requiereRolCliente, exigeVisible('cliente_alertas_de_la_revision'), exigeDePersonasAutorizadas('persona_autorizada_alertas'), async (req, res) => {
  const db = clienteDelPedido(req);
  const paciente = await pacienteDelCliente(db, req.params.id, req);
  if (!paciente) {
    return res.status(404).json({ error: 'Paciente no encontrado' });
  }

  // `campos_preocupantes` no se manda: es la lista de qué campo del reporte disparó la alerta,
  // la usa el Panel para que el Coordinador sepa dónde mirar, y ninguna pantalla del Cliente
  // la muestra. Es detalle clínico saliendo al teléfono sin que nadie lo lea.
  const { data, error } = await db
    .from('alertas')
    .select('id, nivel, descripcion, reportes_relacionados, resuelta_at, created_at')
    .eq('paciente_id', paciente.id)
    .order('created_at', { ascending: false })
    .limit(60);
  if (error) {
    return responderError(res, error);
  }

  // Son dato de salud: queda anotado quién las leyó antes de entregarlas.
  try {
    await anotarConsultaAHce(
      req.usuarioCliente,
      { pacienteId: paciente.id, categorias: ['alertas'], origen: origenDelPedido(req) },
      { cliente: db },
    );
  } catch (e) {
    return responderError(res, e);
  }

  res.json({ alertas: data });
});

// ============================================================================
// Asistente Asignado — datos del Asistente que tuvo o tiene alguna guardia con este
// Paciente (RLS de asistentes/certificados ya lo acota a eso, ver schema_pwa_clientes_01.sql
// §3-4), estado del Certificado de Aptitud, evaluaciones anteriores, y el id de la guardia
// activa/última (para el botón de calificar).
//
// Además devuelve el tipo del Asistente con sus dos listas de tareas: qué le
// corresponde hacer y qué no. Es el motivo por el que existe el catálogo de
// tipos: que el Cliente lo lea antes y no lo discuta en la puerta.
//
// Y el estado documental agregado, que arma `utils/estadoDocumentalParaElCliente.js`: cuántos
// papeles exige esta Prestadora y cuántos están al día, más cómo está la Matrícula. Cuentas y
// nada más: de acá no sale el nombre de ningún tipo de documento ni el número de una Matrícula.
// ============================================================================

appClientesRouter.get('/pacientes/:id/asistente', requiereRolCliente, async (req, res) => {
  const db = clienteDelPedido(req);
  const visibilidad = await visibilidadDeLaPersona(req);
  const paciente = await pacienteDelCliente(db, req.params.id, req);
  if (!paciente) {
    return res.status(404).json({ error: 'Paciente no encontrado' });
  }

  // La última guardia sigue con la llave maestra: esta ruta no pide `persona_autorizada_guardias` y la base
  // sí, así que con la credencial de la persona una persona autorizada sin ese acceso se quedaría sin
  // saber quién lo atiende.
  const { data: guardia } = await supabase
    .from('guardias')
    .select('id, estado, asistente_id')
    .eq('prestadora_id', paciente.prestadora_id)
    .eq('paciente_id', paciente.id)
    .not('asistente_id', 'is', null)
    .order('fecha', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!guardia?.asistente_id) {
    return res.json({ asistente: null, certificado: null, documentacion: null, evaluaciones: [], guardiaId: null });
  }

  // La base le deja ver al Cliente el Asistente que atendió a alguno de sus Pacientes, que es
  // justamente el de esa guardia.
  const { data: asistente } = await db
    .from('asistentes')
    .select('id, nombre, foto_url, tipo_asistente_id')
    .eq('id', guardia.asistente_id)
    .maybeSingle();

  // Qué es esta persona y qué le toca hacer. Sale del catálogo, que se lee desde un solo
  // lugar para que el Cliente y el Asistente vean exactamente la misma lista.
  const { tipo, tareas } = await tipoConSusTareas(
    asistente?.tipo_asistente_id,
    paciente.prestadora_id
  );

  // El certificado, con la credencial de la persona: la base sólo muestra el del Asistente que
  // atiende a este Cliente.
  const { data: certificado } = await db
    .from('certificados')
    .select('activo, fecha_vencimiento')
    .eq('asistente_id', guardia.asistente_id)
    .eq('activo', true)
    .order('fecha_vencimiento', { ascending: false })
    .limit(1)
    .maybeSingle();

  // El estado documental, agregado. El Cliente ve cuánto se cumplió de lo que la Prestadora
  // exige, y nunca qué papel es cuál: el nombre de un tipo de documento puede ser dato de
  // salud. Las cuatro consultas van juntas porque ninguna depende de la anterior.
  //
  // Los papeles y la Matrícula siguen con la llave maestra: la base no le deja ver a un Cliente
  // los documentos de nadie —y está bien, porque de acá no sale ninguno—, y lo que se entrega es
  // la cuenta, no el papel.
  const [{ data: tiposExigidos }, { data: documentos }, { data: matricula }, { data: prestadora }] =
    await Promise.all([
      supabase
        .from('tipos_documento_asistente')
        .select('id, requiere_vencimiento')
        .eq('prestadora_id', paciente.prestadora_id)
        .eq('activo', true),
      supabase
        .from('documentos_asistente')
        .select('tipo_documento_id, fecha_vencimiento')
        .eq('prestadora_id', paciente.prestadora_id)
        .eq('asistente_id', guardia.asistente_id),
      supabase
        .from('estado_matricula_asistente')
        .select('requiere_matricula, matricula_id, vigente_hasta, verificada_at')
        .eq('asistente_id', guardia.asistente_id)
        .eq('prestadora_id', paciente.prestadora_id)
        .maybeSingle(),
      db
        .from('prestadoras')
        .select('dias_aviso_vencimiento_documentos')
        .eq('id', paciente.prestadora_id)
        .maybeSingle(),
    ]);

  const documentacion = estadoDocumentalParaElCliente({
    tiposExigidos: tiposExigidos || [],
    documentos: documentos || [],
    matricula: matricula || null,
    diasAviso: prestadora?.dias_aviso_vencimiento_documentos ?? undefined,
  });

  // Las calificaciones anteriores solo se piden si esta Prestadora deja calificar. Donde la
  // función está apagada, mostrar las estrellas que alguien puso antes sería seguir puntuando
  // a un trabajador por la ventana.
  let evaluaciones = [];
  if (visibilidad.cliente_califica_al_asistente) {
    const { data } = await db
      .from('calificaciones_asistente')
      .select('id, estrellas, comentario, created_at')
      .eq('asistente_id', guardia.asistente_id)
      .eq('paciente_id', paciente.id)
      .order('created_at', { ascending: false });
    evaluaciones = data || [];
  }

  res.json({
    asistente: asistente || null,
    tipo,
    tareas,
    certificado: certificado || null,
    documentacion,
    evaluaciones,
    guardiaId: guardia.id,
  });
});

// ============================================================================
// Escanear Asistente: verifica que el qr_token escaneado corresponda al Asistente
// asignado a la guardia de HOY de ese Paciente.
// ============================================================================

appClientesRouter.get('/pacientes/:id/verificar-asistente/:qrToken', requiereRolCliente, exigeVisible('cliente_verifica_con_codigo'), exigeDePersonasAutorizadas('persona_autorizada_verifica_con_codigo'), async (req, res) => {
  const paciente = await pacienteDelCliente(clienteDelPedido(req), req.params.id, req);
  if (!paciente) {
    return res.status(404).json({ error: 'Paciente no encontrado' });
  }

  // Desde acá sigue con la llave maestra, y el filtro de la Prestadora es lo que aísla. Quien se
  // escanea puede no ser el Asistente asignado —es justamente lo que se quiere averiguar—, y la
  // base sólo le deja ver al Cliente el que lo atiende: con la credencial de la persona, el QR
  // de alguien que no corresponde contestaría «no reconocido» en vez de «no asignado». Y la
  // guardia de hoy, porque esta ruta no pide `persona_autorizada_guardias` y la base sí.
  const { data: asistenteEscaneado } = await supabase
    .from('asistentes')
    .select('id, nombre, foto_url, tipo_asistente_id')
    .eq('qr_token', req.params.qrToken)
    .eq('prestadora_id', paciente.prestadora_id)
    .maybeSingle();

  if (!asistenteEscaneado) {
    return res.status(404).json({ error: 'qr_no_reconocido' });
  }

  // Qué es esta persona —cuidador/a, enfermero/a…—, para que la pantalla no muestre
  // solo un nombre y una foto. Acá alcanza con el tipo: al escanear no se listan tareas.
  const tipoEscaneado = await tipoDelAsistente(
    asistenteEscaneado.tipo_asistente_id,
    paciente.prestadora_id
  );

  const hoyISO = new Date().toISOString().slice(0, 10);

  const { data: guardiaHoy } = await supabase
    .from('guardias')
    .select('id, estado, hora_inicio, hora_fin, asistente_id')
    .eq('prestadora_id', paciente.prestadora_id)
    .eq('paciente_id', paciente.id)
    .eq('fecha', hoyISO)
    .order('hora_inicio', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!guardiaHoy) {
    return res.json({
      coincide: false,
      motivo: 'sin_guardia_hoy',
      asistenteEscaneado,
      tipoEscaneado,
      guardia: null,
      certificado: null,
    });
  }

  // La guardia de hoy existe pero está sin cubrir. No es lo mismo que "no hay guardia":
  // hay servicio previsto y nadie asignado, y el Cliente tiene que poder distinguirlo —
  // si no, escanea el QR de alguien que se presentó y el sistema le contesta que hoy no
  // había nada previsto.
  if (!guardiaHoy.asistente_id) {
    return res.json({
      coincide: false,
      motivo: 'guardia_sin_cubrir',
      asistenteEscaneado,
      tipoEscaneado,
      guardia: {
        id: guardiaHoy.id,
        estado: guardiaHoy.estado,
        horaInicio: guardiaHoy.hora_inicio,
        horaFin: guardiaHoy.hora_fin,
      },
      certificado: null,
    });
  }

  const coincide = guardiaHoy.asistente_id === asistenteEscaneado.id;

  // Con la llave maestra, el filtro de Prestadora es lo que aísla, no el identificador del
  // Asistente: una misma persona tiene una ficha por cada Prestadora donde trabaja.
  const { data: certificado } = await supabase
    .from('certificados')
    .select('activo, fecha_vencimiento')
    .eq('prestadora_id', paciente.prestadora_id)
    .eq('asistente_id', asistenteEscaneado.id)
    .eq('activo', true)
    .order('fecha_vencimiento', { ascending: false })
    .limit(1)
    .maybeSingle();

  res.json({
    coincide,
    motivo: coincide ? 'asignado' : 'no_asignado',
    asistenteEscaneado,
    tipoEscaneado,
    guardia: {
      id: guardiaHoy.id,
      estado: guardiaHoy.estado,
      horaInicio: guardiaHoy.hora_inicio,
      horaFin: guardiaHoy.hora_fin,
    },
    certificado: certificado || null,
  });
});

// ============================================================================
// Calificación del Asistente al cierre de una guardia (tabla calificaciones_asistente).
// ============================================================================

// Calificar es una de las dos acciones de escritura que tiene el Cliente, y viene negada de
// fábrica para todas las personas autorizadas: poner estrellas y un comentario sobre el trabajo de alguien es un
// acto del titular. Lo decide la instrucción que el titular firmó, y no la columna `rol` del
// miembro: «solo lectura o no» no distingue entre las dos acciones de escritura ni permite dar
// una sin la otra.
appClientesRouter.post('/guardias/:guardiaId/calificar', requiereRolCliente, exigeVisible('cliente_califica_al_asistente'), exigeDePersonasAutorizadas('persona_autorizada_califica_al_asistente'), async (req, res) => {
  const { estrellas, comentario } = req.body || {};
  if (!Number.isInteger(estrellas) || estrellas < 1 || estrellas > 5) {
    return res.status(400).json({ error: 'La calificación debe ser un número entero de 1 a 5' });
  }

  // El turno se busca por la lista de Pacientes, no por la columna vieja. Un turno puede cubrir
  // a más de una persona de la misma casa, y la calificación es del Asistente por ese turno: se
  // guarda contra el Paciente del Cliente que califica, tomando el primero por orden de
  // nombre cuando son varios, para que dos calificaciones del mismo turno no queden colgadas de
  // Pacientes distintos según el orden en que la base devuelva las filas.
  //
  // Esta búsqueda sigue con la llave maestra: trae la guardia pegada, y la base sólo muestra
  // guardias a quien tiene `persona_autorizada_guardias`, que esta ruta no pide. Con la credencial de la
  // persona, una persona autorizada que puede calificar y no ver la agenda no encontraría el turno.
  const { data: filas } = await supabase
    .from('guardia_pacientes')
    .select('paciente_id, pacientes!inner(nombre, cliente_id), guardias!inner(id, asistente_id, prestadora_id)')
    .eq('prestadora_id', req.usuarioCliente.prestadoraId)
    .eq('guardia_id', req.params.guardiaId)
    .eq('pacientes.cliente_id', req.usuarioCliente.clienteId);
  const fila = (filas ?? [])
    .slice()
    .sort((a, b) => (a.pacientes?.nombre ?? '').localeCompare(b.pacientes?.nombre ?? ''))[0];
  if (!fila) {
    return res.status(404).json({ error: 'Guardia no encontrada' });
  }
  const guardia = { ...fila.guardias, paciente_id: fila.paciente_id };
  // Una guardia que quedó sin cubrir no tiene a quién calificar. Sin este corte, el INSERT
  // manda asistente_id en NULL contra una columna obligatoria y devuelve un 500 sin
  // explicación.
  if (!guardia.asistente_id) {
    return res.status(400).json({ error: 'guardia_sin_asistente' });
  }

  // La calificación se escribe con la credencial de la persona: la base comprueba que sea de su
  // Cliente y que tenga el acceso para calificar. La Prestadora sale de la fila del Paciente que la
  // base le deja ver, no del pedido.
  const db = clienteDelPedido(req);
  const { data: paciente } = await db
    .from('pacientes')
    .select('id, prestadora_id')
    .eq('id', guardia.paciente_id)
    .eq('cliente_id', req.usuarioCliente.clienteId)
    .maybeSingle();
  if (!paciente) {
    return res.status(404).json({ error: 'Guardia no encontrada' });
  }

  const { error } = await db.from('calificaciones_asistente').insert({
    asistente_id: guardia.asistente_id,
    paciente_id: paciente.id,
    cliente_id: req.usuarioCliente.clienteId,
    guardia_id: guardia.id,
    prestadora_id: paciente.prestadora_id,
    estrellas,
    comentario: comentario || null,
  });
  if (error) {
    return responderError(res, error);
  }

  res.json({ ok: true });
});

// ============================================================================
// Notificaciones push (Web Push API + VAPID) — mismo contrato que appAsistentes.js,
// generalizado del lado de push.js a cliente_id.
// ============================================================================

appClientesRouter.post('/push/suscribir', requiereRolCliente, async (req, res) => {
  const { endpoint, keys } = req.body || {};
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: 'Suscripción push incompleta' });
  }

  // La suscripción se guarda a nombre del Cliente, no de quien la registró. Los mensajes se
  // mandan con `enviarPushCliente(cliente.id)`, así que una fila guardada con el identificador
  // propio de la persona no la encuentra nadie: para el titular daba igual —su identificador y
  // el de su Cliente son el mismo—, pero quien es persona autorizada y no es el titular se
  // suscribía y no recibía nunca ninguno.
  const { error } = await guardarSuscripcionPush({
    prestadoraId: req.usuarioCliente.prestadoraId,
    rol: 'cliente',
    usuarioId: req.usuarioCliente.clienteId,
    endpoint,
    keys,
    userAgent: req.headers['user-agent'],
  });
  if (error) {
    return responderError(res, error);
  }

  res.json({ ok: true });
});

appClientesRouter.delete('/push/suscribir', requiereRolCliente, async (req, res) => {
  const { endpoint } = req.body || {};
  if (!endpoint) {
    return res.status(400).json({ error: 'Falta el endpoint de la suscripción' });
  }

  const { error } = await clienteDelPedido(req)
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint)
    .eq('cliente_id', req.usuarioCliente.clienteId);
  if (error) {
    return responderError(res, error);
  }

  res.json({ ok: true });
});

// ============================================================================
// El acceso al Match + cobro en efectivo por QR. El QR es la
// alternativa a la carga manual del cobrador: el Cliente lo genera desde su propio
// dispositivo, de un solo uso y con vencimiento corto (10 min) — el canje ocurre siempre en
// el Panel vía service_role, nunca como UPDATE directo desde acá.
// ============================================================================

appClientesRouter.get('/acceso/:pacienteId', requiereRolCliente, exigeVisible('cliente_pagos_y_suscripcion'), exigeDePersonasAutorizadas('persona_autorizada_dinero'), async (req, res) => {
  // Sigue con la llave maestra por la forma de cobro pegada: la base sólo le deja ver al Cliente
  // las formas que la Prestadora ofrece hoy, y un acceso contratado con una que ya no se ofrece
  // perdería el dato de si se renueva solo.
  const { data, error } = await supabase
    .from('accesos_match')
    .select(
      // La moneda viaja con el importe y no se deduce: un importe suelto se lee en la moneda de
      // quien mira, y la Prestadora puede estar en otro país.
      'id, estado, importe, moneda, gratis_hasta, proximo_cobro, cancelada_en, vigente_hasta, ' +
        'formas_de_cobro_match(renueva_sola)'
    )
    .eq('prestadora_id', req.usuarioCliente.prestadoraId)
    .eq('cliente_id', req.usuarioCliente.clienteId)
    .eq('paciente_id', req.params.pacienteId)
    .maybeSingle();
  if (error) return responderError(res, error);
  // La pantalla necesita saber si hay renovación que apagar para decidir si ofrece la baja, y no
  // tiene por qué recibir la forma de cobro entera para eso.
  const acceso = data
    ? {
        ...sinLaFormaDeCobro(data),
        renueva_sola: Boolean(data.formas_de_cobro_match?.renueva_sola),
      }
    : data;
  res.json({ acceso });
});

function sinLaFormaDeCobro({ formas_de_cobro_match: _forma, ...resto }) {
  return resto;
}

// La baja en un clic del §3.2 del `docs/PRD_07_Modalidad_Match.md`: la hace quien paga, sin
// pedírselo a nadie. Qué apaga y qué conserva lo decide `utils/bajaDelAcceso.js`, que es el único
// lugar por donde un acceso se da de baja; acá sólo se comprueba quién llama.
appClientesRouter.post('/acceso/:accesoId/baja', requiereRolCliente, exigeVisible('cliente_pagos_y_suscripcion'), exigeDePersonasAutorizadas('persona_autorizada_dinero'), async (req, res) => {
  const resultado = await darDeBajaElAcceso({
    accesoId: req.params.accesoId,
    clienteId: req.usuarioCliente.clienteId,
  });

  if (!resultado.ok) {
    // El motivo es un código y la frase vive en las traducciones; qué número de respuesta le
    // toca a cada uno lo decide `utils/errorConMotivo.js`, que es el único lugar que lo sabe.
    return responderError(res, new ErrorConMotivo(resultado.motivo, resultado.detalle));
  }

  res.json({ baja: resultado.baja, ya_estaba: Boolean(resultado.yaEstaba) });
});

appClientesRouter.post('/qr-cobro', requiereRolCliente, exigeVisible('cliente_pagos_y_suscripcion'), exigeDePersonasAutorizadas('persona_autorizada_dinero'), async (req, res) => {
  const { acceso_id: accesoId } = req.body || {};
  if (!accesoId) {
    return res.status(400).json({ error: 'Falta acceso_id' });
  }

  const db = clienteDelPedido(req);
  const { data: acceso } = await db
    .from('accesos_match')
    .select('id, cliente_id, importe, proximo_cobro')
    .eq('id', accesoId)
    .eq('cliente_id', req.usuarioCliente.clienteId)
    .maybeSingle();
  if (!acceso) {
    return res.status(404).json({ error: 'Acceso no encontrado' });
  }

  const { token, expiraEn } = generarTokenQrCobro();
  const { data, error } = await db
    .from('qr_cobro_efectivo')
    .insert({
      acceso_id: acceso.id,
      cliente_id: req.usuarioCliente.clienteId,
      periodo: acceso.proximo_cobro || new Date().toISOString().slice(0, 10),
      monto: acceso.importe,
      token,
      expira_en: expiraEn.toISOString(),
    })
    .select('id, token, expira_en, usado_en')
    .single();
  if (error) return responderError(res, error);

  res.json({ qr: data });
});

appClientesRouter.get('/qr-cobro/:id', requiereRolCliente, exigeVisible('cliente_pagos_y_suscripcion'), exigeDePersonasAutorizadas('persona_autorizada_dinero'), async (req, res) => {
  const { data, error } = await clienteDelPedido(req)
    .from('qr_cobro_efectivo')
    .select('id, expira_en, usado_en, cobro_id')
    .eq('id', req.params.id)
    .eq('cliente_id', req.usuarioCliente.clienteId)
    .maybeSingle();
  if (error) return responderError(res, error);
  if (!data) return res.status(404).json({ error: 'QR no encontrado' });
  res.json({ qr: data });
});

// ============================================================================
// Las facturas del Cliente — la ventanilla
//
// LA CUENTA YA ESTABA HECHA Y NO SE VOLVIÓ A HACER ACÁ. Lo facturado menos lo cobrado lo resuelve
// la vista `saldos_cliente`, que es el único lugar donde vive esa resta, y el estado de hoy lo
// calcula la base con la fecha de vencimiento. Repetir la resta del lado del backend daría dos
// respuestas posibles para la misma pregunta, y una de las dos la vería el Cliente.
//
// LO QUE SE MUESTRA ES EL DESGLOSE, no un total suelto. Un importe sin decir de qué es no se
// puede comprobar ni discutir: cada renglón dice a qué Paciente y a qué Servicio corresponde.
//
// LOS COBROS ANULADOS VAN TAMBIÉN, marcados. Anular no es borrar: un pago que se anotó y después
// se dio de baja, desaparecido de la pantalla, es indistinguible de uno que nunca existió, y
// quien pagó tiene derecho a ver ese movimiento. El motivo de la anulación no viaja: es una nota
// interna de la Prestadora.
//
// ENTRA POR LAS DOS PUERTAS QUE YA EXISTEN: el interruptor de la Prestadora
// —`cliente_pagos_y_suscripcion`— y el acceso que el titular reparte —`persona_autorizada_dinero`—. Ningún
// permiso nuevo: quien ya podía ver la cuota del Match es quien puede ver esto.
//
// Y CON UN SOFTWARE DE COBRANZAS CONECTADO, ESA RESTA NO SALE DE ACÁ. Si la Prestadora eligió que
// el seguimiento de la cobranza es de otro software, el que sabe cuánto debe este Cliente es él, y
// este sistema deja de calcular: lo que se entrega es el período y lo que se facturó —que son
// datos guardados—, sin el saldo, sin lo cobrado y sin el estado. **No se manda un cero ni un
// vacío en su lugar**: un cero dice que no debe nada, y eso es una afirmación que acá ya no se
// puede hacer. La ausencia del dato es la respuesta, y la respuesta lo dice en
// `sigue_la_cobranza`, con el mismo nombre con el que ya lo dice el Panel.
//
// Esto no se contesta con un error, como sí lo hace el Panel: el Cliente no configuró nada y no
// tiene otra pantalla adonde ir, así que su ventanilla sigue abierta con lo que sí se sabe.
// ============================================================================

/** Lo que se le entrega al Cliente de cada factura. La resta, cuando corresponde, viene adentro. */
const COLUMNAS_DE_LA_FACTURA =
  'factura_id, periodo, moneda, monto_total, cobrado, saldo, estado, fecha_emision, fecha_vencimiento';

/** El saldo de una factura de este Cliente, o null. Nunca se busca una factura sin decir de quién es.
 *  La vista se lee con los permisos de quien pide, así que la base sólo deja ver las de su Cliente. */
async function saldoDelCliente(db, req, facturaId) {
  const { data, error } = await db
    .from('saldos_cliente')
    .select(COLUMNAS_DE_LA_FACTURA)
    .eq('factura_id', facturaId)
    .eq('cliente_id', req.usuarioCliente.clienteId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

/**
 * Cuáles de estas facturas tienen el comprobante guardado. Devuelve un conjunto de identificadores.
 *
 * Es una consulta aparte y no una columna más de la vista: la vista es la resta, y esto es dónde
 * quedó un archivo. La ruta no sale de acá —al teléfono no le sirve y sí serviría para que quede
 * escrita en algún registro—: lo único que viaja es si hay papel o no.
 */
async function facturasConComprobante(db, req, facturaIds) {
  if (facturaIds.length === 0) return new Set();
  const { data, error } = await db
    .from('facturas_cliente')
    .select('id')
    .in('id', facturaIds)
    .eq('cliente_id', req.usuarioCliente.clienteId)
    .not('comprobante_archivo', 'is', null);
  if (error) throw new Error(error.message);
  return new Set((data || []).map((f) => f.id));
}

appClientesRouter.get('/facturas', requiereRolCliente, exigeVisible('cliente_pagos_y_suscripcion'), exigeDePersonasAutorizadas('persona_autorizada_dinero'), async (req, res) => {
  let laLlevaOtro;
  let entrega;
  try {
    laLlevaOtro = await laCobranzaLaLlevaOtroSoftware(req.usuarioCliente.prestadoraId);
    entrega = await laPrestadoraEntregaLaFactura(req.usuarioCliente.prestadoraId);
  } catch (e) {
    return responderError(res, e);
  }

  const db = clienteDelPedido(req);
  const { data, error } = await db
    .from('saldos_cliente')
    .select(COLUMNAS_DE_LA_FACTURA)
    .eq('cliente_id', req.usuarioCliente.clienteId)
    .order('periodo', { ascending: false });
  if (error) return responderError(res, error);

  let facturas = laLlevaOtro ? (data || []).map(sinLoQueSeCalculaAca) : data || [];

  // Con la entrega apagada no se dice ni cuáles tienen papel: la Prestadora hace llegar la factura
  // por su cuenta, y contar acá que existe un archivo que no se puede bajar es peor que no decir
  // nada.
  if (entrega) {
    let conPapel;
    try {
      conPapel = await facturasConComprobante(db, req, facturas.map((f) => f.factura_id));
    } catch (e) {
      return responderError(res, e);
    }
    facturas = facturas.map((f) => ({ ...f, tiene_comprobante: conPapel.has(f.factura_id) }));
  }

  res.json({ facturas, sigue_la_cobranza: !laLlevaOtro, entrega_la_factura: entrega });
});

appClientesRouter.get('/facturas/:facturaId', requiereRolCliente, exigeVisible('cliente_pagos_y_suscripcion'), exigeDePersonasAutorizadas('persona_autorizada_dinero'), async (req, res) => {
  let factura;
  let laLlevaOtro;
  let entrega;
  let conPapel;
  const db = clienteDelPedido(req);
  try {
    laLlevaOtro = await laCobranzaLaLlevaOtroSoftware(req.usuarioCliente.prestadoraId);
    entrega = await laPrestadoraEntregaLaFactura(req.usuarioCliente.prestadoraId);
    factura = await saldoDelCliente(db, req, req.params.facturaId);
    conPapel = entrega && factura ? await facturasConComprobante(db, req, [factura.factura_id]) : new Set();
  } catch (e) {
    return responderError(res, e);
  }
  if (!factura) return res.status(404).json({ error: 'Factura no encontrada' });
  if (laLlevaOtro) factura = sinLoQueSeCalculaAca(factura);
  if (entrega) factura = { ...factura, tiene_comprobante: conPapel.has(factura.factura_id) };

  const { data: renglones, error: errorRenglones } = await db
    .from('facturas_cliente_items')
    .select('id, descripcion, monto, moneda, paciente_id, servicio_id')
    .eq('factura_id', factura.factura_id)
    .order('created_at', { ascending: true });
  if (errorRenglones) return responderError(res, errorRenglones);

  const { data: cobros, error: errorCobros } = await db
    .from('cobros_cliente')
    .select('id, monto, moneda, fecha_cobro, medio, estado')
    .eq('factura_id', factura.factura_id)
    .order('fecha_cobro', { ascending: false });
  if (errorCobros) return responderError(res, errorCobros);

  res.json({
    factura,
    renglones: renglones || [],
    cobros: cobros || [],
    sigue_la_cobranza: !laLlevaOtro,
    entrega_la_factura: entrega,
  });
});

/**
 * Bajar el comprobante de una factura.
 *
 * QUÉ SE ENTREGA. Un enlace temporal que vence, no el archivo: el depósito es privado y así el
 * teléfono lo baja derecho de ahí sin que el backend tenga que pasar los bytes por el medio.
 *
 * CON LA ENTREGA APAGADA NO HAY PAPEL ACÁ. La Prestadora eligió hacer llegar la factura por su
 * cuenta, y se contesta lo mismo que si no existiera: la pantalla no ofrece el botón, y quien
 * llame a la dirección igual no llega a ningún lado.
 *
 * LAS DOS PUERTAS DE SIEMPRE: el interruptor de la Prestadora y el acceso que reparte el titular.
 * Ningún permiso nuevo: quien ya podía ver la factura es quien puede bajarla.
 */
appClientesRouter.get('/facturas/:facturaId/comprobante', requiereRolCliente, exigeVisible('cliente_pagos_y_suscripcion'), exigeDePersonasAutorizadas('persona_autorizada_dinero'), async (req, res) => {
  let entrega;
  try {
    entrega = await laPrestadoraEntregaLaFactura(req.usuarioCliente.prestadoraId);
  } catch (e) {
    return responderError(res, e);
  }
  if (!entrega) return res.status(404).json({ error: 'Comprobante no encontrado' });

  // La factura se busca diciendo de quién es, siempre, y con la credencial de la persona: la base
  // sólo le deja ver las de su Cliente.
  const { data: factura, error } = await clienteDelPedido(req)
    .from('facturas_cliente')
    .select('comprobante_archivo')
    .eq('id', req.params.facturaId)
    .eq('cliente_id', req.usuarioCliente.clienteId)
    .maybeSingle();
  if (error) return responderError(res, error);
  if (!factura?.comprobante_archivo) return res.status(404).json({ error: 'Comprobante no encontrado' });

  const direccion = await direccionParaBajarElComprobante(factura.comprobante_archivo);
  if (!direccion) return res.status(502).json({ error: 'El comprobante no se pudo preparar' });

  res.json({ direccion });
});

// ============================================================================
// El pase de guardia — el código que el Cliente muestra en pantalla
//
// Cuando llega el Asistente, quien está en la casa abre esto y le muestra el código. Se renueva
// solo cada pocos segundos —los que configuró la Prestadora—, así que una foto de la pantalla no
// sirve un minuto después. No se usa un cartel impreso: pegado en la puerta sería un secreto
// permanente a la vista de cualquiera que pase.
//
// Lo muestra cualquiera de las personas autorizadas, sin acceso especial: no revela ningún dato del
// Paciente ni de la Prestadora, y su único efecto es dejar entrar a quien ya tenía la guardia
// asignada. El código vale para todas las personas autorizadas —sujeto_tipo 'cliente'—, así que da lo mismo
// cuál de sus miembros esté en la casa ese día.
// ============================================================================

appClientesRouter.get('/codigo-de-presencia', requiereRolCliente, async (req, res) => {
  try {
    const { codigo, segundos, expiraEn } = await codigoParaMostrar({
      prestadoraId: req.usuarioCliente.prestadoraId,
      sujetoTipo: 'cliente',
      sujetoId: req.usuarioCliente.clienteId,
    });
    res.json({ codigo, segundos, expiraEn });
  } catch (e) {
    responderError(res, e);
  }
});

// ============================================================================
// La vidriera del Match: buscar Asistentes y ver su perfil público
//
// QUÉ RESUELVE. Hasta acá, en la modalidad Match existía todo el andamiaje —la base, los
// disparadores, los cobros, el consentimiento— y no existía la modalidad: el Cliente no podía
// buscar un Asistente ni verlo. Estas dos direcciones son eso, y nada más que eso.
//
// LO QUE NO ESTÁ ACÁ, A PROPÓSITO: el dato de contacto. Llegar a la persona es justamente lo
// que el Match vende, se descuenta de un paquete y tiene su propio circuito
// (`contactos_vistos_match`). De estas dos direcciones no sale un teléfono ni un correo
// por ningún camino: la consulta no pide esas columnas (`perfilPublicoDeAsistente.js`).
//
// LA PUERTA ES LA MODALIDAD, Y NO UN INTERRUPTOR NUEVO. La Prestadora que no ofrece
// Match no tiene vidriera, y eso ya está dicho en `prestadora_modalidades`. Un
// interruptor aparte para lo mismo sería la misma decisión escrita en dos lugares.
//
// EL ORDEN LO DECIDE UNA FUNCIÓN DE RIESGO, NO EL GUSTO DE LA PANTALLA. Con
// `ranking_plataforma` apagada —que es como nace— la lista sale mezclada parejo. El motivo
// está escrito en `perfilPublicoDeAsistente.js` y es legal, no estético.
// ============================================================================

/** Cuánta gente entra en una pantalla de la vidriera, y cuántas opiniones se leen de una. */
const TOPE_DE_LA_VIDRIERA = 60;
const TOPE_DE_OPINIONES = 30;

/** Quién entra en la vidriera: de esta Prestadora, activo, en Match y tomando trabajo.
 *  Con la llave maestra: la base sólo le deja ver al Cliente los Asistentes que ya la atienden,
 *  y la vidriera muestra justamente a los que todavía no. Lo mismo vale para su documentación y
 *  sus calificaciones públicas, más abajo. */
function poolDeLaPrestadora(prestadoraId) {
  return supabase
    .from('asistentes')
    .select(COLUMNAS_PERFIL_PUBLICO)
    .eq('prestadora_id', prestadoraId)
    .eq('estado', 'activo')
    .eq('disponible_para_ofertas', true)
    .is('deleted_at', null)
    .contains('canales', [MODALIDAD.MATCH]);
}

/** Corta el paso donde la Prestadora no ofrece la modalidad. Mismo motivo en las dos rutas. */
async function exigeVidriera(req) {
  if (!(await ofreceMatch(req.usuarioCliente.prestadoraId))) {
    throw new ErrorConMotivo('match_no_habilitado');
  }
}

/**
 * El estado documental de varios Asistentes de una vez, con las mismas reglas que el de uno
 * solo. Tres consultas para toda la lista y no tres por persona: con veinte perfiles serían
 * sesenta viajes a la base para contestar una pantalla.
 */
async function documentacionDeVarios(prestadoraId, asistenteIds) {
  if (!asistenteIds.length) return new Map();

  // Con la llave maestra: los tipos de documento, los documentos y la matrícula no tienen política
  // que deje leerlos a un Cliente, y son de Asistentes que no la atienden.
  const [{ data: tiposExigidos }, { data: documentos }, { data: matriculas }, { data: prestadora }] =
    await Promise.all([
      supabase
        .from('tipos_documento_asistente')
        .select('id, requiere_vencimiento')
        .eq('prestadora_id', prestadoraId)
        .eq('activo', true),
      supabase
        .from('documentos_asistente')
        .select('asistente_id, tipo_documento_id, fecha_vencimiento')
        .eq('prestadora_id', prestadoraId)
        .in('asistente_id', asistenteIds),
      supabase
        .from('estado_matricula_asistente')
        .select('asistente_id, requiere_matricula, matricula_id, vigente_hasta, verificada_at')
        .eq('prestadora_id', prestadoraId)
        .in('asistente_id', asistenteIds),
      supabase
        .from('prestadoras')
        .select('dias_aviso_vencimiento_documentos')
        .eq('id', prestadoraId)
        .maybeSingle(),
    ]);

  const porAsistente = new Map();
  const matriculaDe = new Map((matriculas || []).map((m) => [m.asistente_id, m]));
  for (const id of asistenteIds) {
    porAsistente.set(
      id,
      estadoDocumentalParaElCliente({
        tiposExigidos: tiposExigidos || [],
        documentos: (documentos || []).filter((d) => d.asistente_id === id),
        matricula: matriculaDe.get(id) || null,
        diasAviso: prestadora?.dias_aviso_vencimiento_documentos ?? undefined,
      })
    );
  }
  return porAsistente;
}

/** Las calificaciones públicas de varios Asistentes, o un mapa vacío si acá no se califica. */
async function calificacionesDeVarios(prestadoraId, asistenteIds, visibilidad) {
  if (!visibilidad.cliente_califica_al_asistente || !asistenteIds.length) return new Map();
  // Con la llave maestra: son las calificaciones que dejaron otros Clientes, y la base sólo le
  // deja ver a cada una las suyas.
  const { data } = await supabase
    .from('calificaciones_asistente')
    .select('asistente_id, estrellas')
    .eq('prestadora_id', prestadoraId)
    .eq('visible_publica', true)
    .in('asistente_id', asistenteIds);

  const porAsistente = new Map();
  for (const id of asistenteIds) {
    porAsistente.set(id, promedioDeCalificaciones((data || []).filter((c) => c.asistente_id === id)));
  }
  return porAsistente;
}

/** Los tipos de Asistente que aparecen en la vidriera, armados para mostrar. */
async function tiposDeLaVidriera(db, tipoIds) {
  if (!tipoIds.length) return new Map();
  // La base deja ver los tipos generales y los de la Prestadora de quien pide, y ningún otro.
  const { data } = await db
    .from('tipos_asistente')
    .select('id, clave, nombre, prestadora_id')
    .in('id', tipoIds);
  return new Map((data || []).map((t) => [t.id, t]));
}

appClientesRouter.get('/match/asistentes', requiereRolCliente, async (req, res) => {
  try {
    await exigeVidriera(req);
    const prestadoraId = req.usuarioCliente.prestadoraId;
    const visibilidad = await visibilidadDelPedido(req);

    // Las opciones de los filtros salen del pool y no de una lista escrita: un lugar en el que
    // no trabaja nadie no se ofrece, porque elegirlo devolvería siempre vacío.
    const { data: todos } = await poolDeLaPrestadora(prestadoraId);
    const tiposOfrecidos = [...new Set((todos || []).map((a) => a.tipo_asistente_id).filter(Boolean))];

    // Dónde trabaja cada uno. Está en la tabla que cruza a la persona con cada lugar, así que el
    // filtro se resuelve acá y no en la consulta de fichas: se piden los lugares de todo el pool
    // una sola vez, y con eso se arma tanto la lista de opciones como el recorte. Con la
    // credencial del Cliente: los lugares y quién trabaja en cada uno los lee toda la Prestadora.
    const lugaresPorAsistente = await lugaresDeVarias(
      clienteDelPedido(req), 'asistente_lugares', 'asistente_id', (todos || []).map((a) => a.id), prestadoraId
    );
    const lugaresOfrecidos = await lugaresPorNombre(
      clienteDelPedido(req), [...new Set([...lugaresPorAsistente.values()].flat())], prestadoraId
    );

    const lugarElegido = req.query.zona ? String(req.query.zona) : null;
    const delLugar = (id) => !lugarElegido || (lugaresPorAsistente.get(id) || []).includes(lugarElegido);

    let consulta = poolDeLaPrestadora(prestadoraId).limit(TOPE_DE_LA_VIDRIERA);
    if (req.query.tipo) consulta = consulta.eq('tipo_asistente_id', String(req.query.tipo));

    const { data: todasLasFichas, error } = await consulta;
    if (error) return responderError(res, error);
    const asistentes = (todasLasFichas || []).filter((a) => delLugar(a.id));

    const ids = asistentes.map((a) => a.id);
    const [documentacion, calificaciones, tipos] = await Promise.all([
      documentacionDeVarios(prestadoraId, ids),
      calificacionesDeVarios(prestadoraId, ids, visibilidad),
      tiposDeLaVidriera(clienteDelPedido(req), tiposOfrecidos),
    ]);

    const nombreDe = new Map(lugaresOfrecidos.map((l) => [l.id, l.nombre]));
    const perfiles = asistentes.map((asistente) =>
      perfilPublicoDeAsistente({
        asistente: {
          ...asistente,
          zonas: (lugaresPorAsistente.get(asistente.id) || []).map((id) => nombreDe.get(id)).filter(Boolean),
        },
        tipo: tipos.get(asistente.tipo_asistente_id) || null,
        documentacion: documentacion.get(asistente.id) || null,
        calificacion: calificaciones.get(asistente.id) || null,
      })
    );

    const porCalificacion = await funcionDeRiesgoEncendida(prestadoraId, FUNCION_QUE_HABILITA_EL_ORDEN);
    const orden = porCalificacion ? ORDEN.CALIFICACION : ORDEN.NEUTRO;

    res.json({
      asistentes: ordenarPool(perfiles, { orden, semilla: diaISO(new Date()) }),
      // Viaja para que la pantalla pueda decir en qué orden está mirando, y no prometa uno
      // que no existe.
      orden,
      zonas: lugaresOfrecidos,
      tipos: tiposOfrecidos.map((id) => tipos.get(id)).filter(Boolean),
    });
  } catch (e) {
    responderError(res, e);
  }
});

appClientesRouter.get('/match/asistentes/:id', requiereRolCliente, async (req, res) => {
  try {
    await exigeVidriera(req);
    const prestadoraId = req.usuarioCliente.prestadoraId;
    const visibilidad = await visibilidadDelPedido(req);

    // Se busca adentro del pool y no en la tabla entera: quien no está en la vidriera no tiene
    // perfil público, aunque alguien pruebe la dirección con su identificador.
    const { data: asistente } = await poolDeLaPrestadora(prestadoraId)
      .eq('id', req.params.id)
      .maybeSingle();
    // El que no existe y el que está fuera de la vidriera contestan lo mismo: desde afuera se
    // tienen que ver iguales.
    if (!asistente) throw new ErrorConMotivo('no_encontrado');

    const [documentacion, calificaciones, tipos] = await Promise.all([
      documentacionDeVarios(prestadoraId, [asistente.id]),
      calificacionesDeVarios(prestadoraId, [asistente.id], visibilidad),
      tiposDeLaVidriera(clienteDelPedido(req), asistente.tipo_asistente_id ? [asistente.tipo_asistente_id] : []),
    ]);

    // Las opiniones escritas, sin quién las escribió: quien calificó es un Cliente, y su
    // nombre no es parte de lo que se publica. Van sólo las que la Prestadora dejó públicas.
    let opiniones = [];
    if (visibilidad.cliente_califica_al_asistente) {
      // Con la llave maestra: son opiniones de otros Clientes, que la base no le deja ver a ésta.
      const { data } = await supabase
        .from('calificaciones_asistente')
        .select('id, estrellas, comentario, created_at')
        .eq('prestadora_id', prestadoraId)
        .eq('asistente_id', asistente.id)
        .eq('visible_publica', true)
        .order('created_at', { ascending: false })
        .limit(TOPE_DE_OPINIONES);
      opiniones = data || [];
    }

    // Con la credencial del Cliente, por lo mismo que en la vidriera.
    const dondeTrabaja = await nombresDeLugares(
      clienteDelPedido(req),
      await lugaresDe(clienteDelPedido(req), 'asistente_lugares', 'asistente_id', asistente.id, prestadoraId),
      prestadoraId
    );

    res.json({
      asistente: perfilPublicoDeAsistente({
        asistente: { ...asistente, zonas: dondeTrabaja },
        tipo: tipos.get(asistente.tipo_asistente_id) || null,
        documentacion: documentacion.get(asistente.id) || null,
        calificacion: calificaciones.get(asistente.id) || null,
      }),
      opiniones,
    });
  } catch (e) {
    responderError(res, e);
  }
});

// ============================================================================
// VER CÓMO LLEGAR A UN ASISTENTE: LA ACTIVACIÓN AL INTENTAR VER EL CONTACTO
//
// QUÉ RESUELVE. El dato de contacto es lo que el Match vende, y hasta acá no se le abría a
// ningún Cliente por ningún camino: el descuento del saldo estaba escrito en la base y en
// `utils/contactosMatch.js`, y no lo llamaba nadie. Estas dos direcciones son el botón que
// faltaba, y todo lo que deciden vive en `utils/contactoDelAsistente.js`.
//
// DOS DIRECCIONES Y NO UNA, A PROPÓSITO. La primera dice qué va a pasar y no toca nada; la
// segunda cobra. Así abrir un contacto no puede ser nunca el efecto colateral de haber mirado
// una pantalla: hace falta un pedido aparte, que ninguna aplicación manda sin que alguien toque
// el botón y confirme.
//
// LA PLATA NO LA MIRA CUALQUIERA DE LAS PERSONAS AUTORIZADAS. Activar un cobro es plata, así que el botón lleva
// los mismos dos candados que el acceso —lo que la Prestadora muestra
// (`cliente_pagos_y_suscripcion`) y lo que el titular repartió (`persona_autorizada_dinero`)—. Preguntar
// cómo está el contacto no los lleva: quien no mira la plata puede ver el dato ya abierto, y no
// se entera de cuánto sale ni de cuánto saldo queda.
// ============================================================================

/** El Asistente de la vidriera al que se le quiere ver el contacto. Fuera del pool no hay perfil
 *  ni contacto, aunque alguien pruebe el identificador. */
async function asistenteDeLaVidriera(req) {
  const { data } = await poolDeLaPrestadora(req.usuarioCliente.prestadoraId)
    .eq('id', req.params.id)
    .maybeSingle();
  if (!data) throw new ErrorConMotivo('no_encontrado');
  return data;
}

appClientesRouter.get('/match/asistentes/:id/contacto', requiereRolCliente, async (req, res) => {
  try {
    await exigeVidriera(req);
    const asistente = await asistenteDeLaVidriera(req);

    const visibilidad = await visibilidadDelPedido(req);
    const accesos = await accesosDelPedido(req);
    const miraElDinero = Boolean(visibilidad.cliente_pagos_y_suscripcion && accesos.persona_autorizada_dinero);

    const estado = await comoEstaElContacto({
      prestadoraId: req.usuarioCliente.prestadoraId,
      clienteId: req.usuarioCliente.clienteId,
      asistenteId: asistente.id,
      mira_el_dinero: miraElDinero,
    });
    res.json(estado);
  } catch (e) {
    responderError(res, e);
  }
});

appClientesRouter.post(
  '/match/asistentes/:id/contacto',
  requiereRolCliente,
  exigeVisible('cliente_pagos_y_suscripcion'),
  exigeDePersonasAutorizadas('persona_autorizada_dinero'),
  async (req, res) => {
    try {
      await exigeVidriera(req);
      const asistente = await asistenteDeLaVidriera(req);

      const abierto = await abrirElContactoDeUnAsistente({
        prestadoraId: req.usuarioCliente.prestadoraId,
        clienteId: req.usuarioCliente.clienteId,
        asistenteId: asistente.id,
      });
      // El motivo por el que no se pudo no es una falla del sistema: es algo que el Cliente tiene
      // que poder leer y resolver —contratar, renovar, comprar otro paquete—, y la frase sale de
      // sus traducciones.
      if (!abierto.ok) throw new ErrorConMotivo(abierto.motivo);

      res.json({ abierto: true, contacto: abierto.contacto, saldo_contactos: abierto.saldo_contactos });
    } catch (e) {
      responderError(res, e);
    }
  }
);

// ============================================================================
// EL CHAT CON UN ASISTENTE DE LA VIDRIERA
//
// QUÉ RESUELVE. El Cliente ya podía mirar un perfil y no tenía forma de hablarle a la persona.
// Estas rutas son el hilo, y el de la aplicación del Asistente es el mismo: las dos puntas
// entran por `utils/conversacionMatch.js`, que es donde vive el tapado.
//
// EL CHAT NO SE COBRA. Lo dice el documento del producto: la búsqueda, los perfiles, el chat y
// la videollamada son libres (`docs/PRD_07_Modalidad_Match.md:69`). Lo que se vende es
// llegar a la persona por afuera, y por eso el dato de contacto viaja tapado mientras el
// contacto de esa pareja no esté abierto. Acá no se decide qué es un dato de contacto: se
// pregunta una sola cosa —si está abierto— y tapa `contactoTapado.js`.
//
// LA PUERTA SIGUE SIENDO LA MODALIDAD. Igual que la vidriera: donde la Prestadora no ofrece
// Match no hay a quién escribirle, y el backend lo contesta con todas las letras.
// ============================================================================

/** El hilo que se pide, comprobando que sea de este Cliente y de esta Prestadora. El que no
 *  existe y el ajeno contestan lo mismo: desde afuera se tienen que ver iguales. */
async function conversacionDelCliente(req) {
  const { data } = await clienteDelPedido(req)
    .from('conversaciones_match')
    .select('id, prestadora_id, cliente_id, asistente_id, ultimo_mensaje_at, sala_videollamada, sala_abierta_at')
    .eq('id', req.params.id)
    .eq('cliente_id', req.usuarioCliente.clienteId)
    .maybeSingle();

  if (!data) throw new ErrorConMotivo('no_encontrado');
  return data;
}

appClientesRouter.get('/match/conversaciones', requiereRolCliente, async (req, res) => {
  try {
    await exigeVidriera(req);
    // Con la llave maestra: el hilo trae el nombre y la foto del Asistente, y la base no le deja
    // ver al Cliente un Asistente que todavía no lo atiende, que es el caso de la vidriera.
    const { data, error } = await supabase
      .from('conversaciones_match')
      .select('id, asistente_id, ultimo_mensaje_at, asistentes(id, nombre, foto_url)')
      .eq('prestadora_id', req.usuarioCliente.prestadoraId)
      .eq('cliente_id', req.usuarioCliente.clienteId)
      .order('ultimo_mensaje_at', { ascending: false, nullsFirst: false });
    if (error) return responderError(res, error);

    const hilos = data || [];
    // Cuántos mensajes sin leer tiene cada hilo, en una sola consulta para toda la lista. Sólo
    // cuentan los del otro lado: lo propio ya lo leyó quien lo escribió.
    const { data: sinLeer } = hilos.length
      ? await clienteDelPedido(req)
          .from('mensajes_match')
          .select('conversacion_id')
          .in('conversacion_id', hilos.map((c) => c.id))
          .eq('lado', 'asistente')
          .is('leido_at', null)
      : { data: [] };

    const cuenta = new Map();
    for (const m of sinLeer || []) cuenta.set(m.conversacion_id, (cuenta.get(m.conversacion_id) || 0) + 1);

    res.json({
      conversaciones: hilos.map((c) => ({
        id: c.id,
        asistente: {
          id: c.asistente_id,
          nombre: c.asistentes?.nombre || '',
          foto_url: c.asistentes?.foto_url || null,
        },
        ultimo_mensaje_at: c.ultimo_mensaje_at,
        sin_leer: cuenta.get(c.id) || 0,
      })),
    });
  } catch (e) {
    responderError(res, e);
  }
});

/** Abrir el hilo con alguien de la vidriera. Se busca adentro del pool y no en la tabla entera:
 *  a quien no está en la vidriera no se le escribe, aunque se pruebe su identificador. */
appClientesRouter.post('/match/asistentes/:id/conversacion', requiereRolCliente, async (req, res) => {
  try {
    await exigeVidriera(req);
    const { data: asistente } = await poolDeLaPrestadora(req.usuarioCliente.prestadoraId)
      .eq('id', req.params.id)
      .maybeSingle();
    if (!asistente) throw new ErrorConMotivo('no_encontrado');

    const conversacion = await conversacionDeLaPareja({
      prestadoraId: req.usuarioCliente.prestadoraId,
      clienteId: req.usuarioCliente.clienteId,
      asistenteId: asistente.id,
      crear: true,
    });
    res.json({ conversacion_id: conversacion.id });
  } catch (e) {
    responderError(res, e);
  }
});

appClientesRouter.get('/match/conversaciones/:id', requiereRolCliente, async (req, res) => {
  try {
    await exigeVidriera(req);
    const conversacion = await conversacionDelCliente(req);

    // El refresco del hilo abierto pide nada más lo posterior a lo que ya tiene. Sin `desde` sale
    // el hilo entero, que es lo que hace falta al abrirlo.
    const desde = desdeCuando(req.query?.desde);

    // El nombre y la foto del Asistente, con la llave maestra: la base no le deja ver al Cliente
    // un Asistente que todavía no la atiende.
    const [mensajes, { data: asistente }, enCurso, base] = await Promise.all([
      mensajesDeLaConversacion({ conversacion, desde }),
      supabase.from('asistentes').select('id, nombre, foto_url').eq('id', conversacion.asistente_id).eq('prestadora_id', conversacion.prestadora_id).maybeSingle(),
      videollamadaEnCurso(conversacion),
      direccionDeVideollamada(conversacion.prestadora_id),
    ]);

    await marcarLeido({ conversacion, lado: LADO.CLIENTE });

    res.json({
      conversacion: {
        id: conversacion.id,
        asistente: { id: conversacion.asistente_id, nombre: asistente?.nombre || '', foto_url: asistente?.foto_url || null },
      },
      mensajes,
      // Qué es lo que viaja: el hilo entero, o nada más lo nuevo. La pantalla suma en un caso y
      // reemplaza en el otro, y no tiene que deducirlo de lo que pidió.
      solo_lo_nuevo: Boolean(desde),
      videollamada_disponible: Boolean(base),
      videollamada: enCurso,
    });
  } catch (e) {
    responderError(res, e);
  }
});

appClientesRouter.post('/match/conversaciones/:id/mensajes', requiereRolCliente, async (req, res) => {
  try {
    await exigeVidriera(req);
    const conversacion = await conversacionDelCliente(req);

    const cuerpo = String(req.body?.cuerpo ?? '').trim();
    if (!cuerpo) throw new ErrorConMotivo('faltan_datos');

    await escribirMensaje({
      conversacion,
      lado: LADO.CLIENTE,
      autorUsuarioId: req.usuarioCliente.id,
      cuerpo,
    });

    // Se devuelve el hilo tal como quedó guardado: tapado si la base tapó algo, y con el motivo.
    // Devolverle a quien escribió su texto entero le haría creer que llegó completo.
    res.json({ mensajes: await mensajesDeLaConversacion({ conversacion }) });
  } catch (e) {
    responderError(res, e);
  }
});

appClientesRouter.post('/match/conversaciones/:id/videollamada', requiereRolCliente, async (req, res) => {
  try {
    await exigeVidriera(req);
    const conversacion = await conversacionDelCliente(req);
    const sala = await abrirVideollamada({
      conversacion,
      lado: LADO.CLIENTE,
      autorUsuarioId: req.usuarioCliente.id,
    });
    if (!sala) throw new ErrorConMotivo('videollamada_no_configurada');
    res.json(sala);
  } catch (e) {
    responderError(res, e);
  }
});

// ============================================================================
// Contenido y recursos para cuidadores familiares
// ============================================================================

// Lo que la Prestadora escribió para quien cuida en su casa
// (`routes/panelContenidos.js`). Sale solamente lo publicado y solamente de la Prestadora de este
// Cliente: un borrador es un texto a medio escribir y no sale de adentro del Panel.
//
// No pide modalidad ni acceso abierto: leer no cuesta nada y no es lo que el Match vende.
appClientesRouter.get('/contenidos', requiereRolCliente, async (req, res) => {
  const { data, error } = await clienteDelPedido(req)
    .from('contenidos_para_clientes')
    .select('id, titulo, cuerpo, enlace_url, updated_at')
    .eq('publicado', true)
    .order('orden', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) return responderError(res, error);
  res.json({ contenidos: data });
});
