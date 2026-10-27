import { supabase } from './supabaseClient';
import { errorDeLaRespuesta } from './errores';

const API_URL = import.meta.env.VITE_API_URL;

async function tokenActual() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token;
}

async function pedido(ruta, opciones = {}) {
  const token = await tokenActual();
  const respuesta = await fetch(`${API_URL}/api/app-asistentes${ruta}`, {
    ...opciones,
    headers: {
      ...(opciones.body && !(opciones.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${token}`,
      ...opciones.headers,
    },
  });
  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    // El error lo arma lib/errores.js y no esta función: ahí viajan juntos el número de la
    // respuesta —que distingue una sesión vencida (401) de un permiso que falta (403)— y el
    // motivo, que es lo que después le permite a la pantalla explicar por qué no se pudo.
    const error = errorDeLaRespuesta(respuesta, datos);
    if (datos.yaRegistrado) error.yaRegistrado = true;
    // Cuando falta un reporte, el backend dice de quiénes falta. Con un turno que cubre a
    // tres personas, "falta un reporte" no le dice al Asistente cuál le quedó pendiente.
    if (datos.pacientesSinReporte) error.pacientesSinReporte = datos.pacientesSinReporte;
    // Un documento ya vencido trae la fecha después de la cual tiene que estar emitido el nuevo,
    // y un turno que no se puede aceptar trae qué documentos lo impiden.
    if (datos.fecha) error.fecha = datos.fecha;
    if (datos.documentos) error.documentos = datos.documentos;
    throw error;
  }
  return datos;
}

/**
 * Los datos de un acto del turno, con la hora del hecho y el identificador del envío puestos por
 * el teléfono.
 *
 * LA HORA DEL HECHO LA PONE EL TELÉFONO, y el backend la guarda en su propia columna, aparte de la
 * hora en que el dato le llegó a la base. Las dos no son la misma y no se mezclan: un check-in
 * que esperó tres horas de señal ocurrió cuando la persona llegó, no cuando volvió la red.
 *
 * EL IDENTIFICADOR VA PUESTO DE ANTEMANO, antes del primer intento, para que un reenvío no
 * duplique. Si el envío sale y la respuesta se pierde, el segundo intento llega con el mismo
 * identificador y el backend lo reconoce en vez de anotar el hecho dos veces.
 *
 * Los dos se respetan si ya vienen: la cola manda los que anotó cuando pasó la cosa, y ésos son
 * los que valen.
 *
 * El nombre `ocurrido_at` es el que ya usaban la emergencia y el «no puedo continuar»: es uno
 * solo para todos los actos, no uno por pantalla.
 */
function conElActo(datos) {
  return {
    ...datos,
    ocurrido_at: datos?.ocurrido_at ?? new Date().toISOString(),
    clienteUuid: datos?.clienteUuid ?? crypto.randomUUID(),
  };
}

export const api = {
  perfil: () => pedido('/perfil'),
  // Sus documentos, con cuántos lleva enviados de cuántos le exige su Prestadora. Va aparte de
  // `/perfil` porque `/perfil` lo pide la aplicación al arrancar y esto lo mira quien entró a
  // Documentos.
  documentos: () => pedido('/documentos'),
  // Un tipo de documento con lo que hace falta para cargarlo: requisitos, enlace, organismos que
  // lo otorgan, qué fecha lleva y si lleva número.
  tipoDeDocumento: (tipoDocumentoId) => pedido(`/documentos/tipo/${encodeURIComponent(tipoDocumentoId)}`),
  // Un documento, en un solo envío —datos y archivo juntos—: un archivo sin su dueño queda
  // suelto y nadie lo va a mirar. Lo que se manda entra en revisión.
  enviarDocumento: (tipoDocumentoId, { organismoId, fechaEmision, fechaVencimiento, numero, archivo }) => {
    const formData = new FormData();
    formData.append('tipo_documento_id', tipoDocumentoId);
    if (organismoId) formData.append('organismo_id', organismoId);
    if (fechaEmision) formData.append('fecha_emision', fechaEmision);
    if (fechaVencimiento) formData.append('fecha_vencimiento', fechaVencimiento);
    if (numero) formData.append('numero', numero);
    if (archivo) formData.append('archivo', archivo);
    return pedido('/documentos', { method: 'POST', body: formData });
  },  // El interruptor de disponibilidad. No lleva el identificador de nadie: la sesión decide sobre
  // en quién se escribe, y lo que vuelve es lo que quedó guardado, no lo que se mandó.
  cambiarDisponibilidad: (disponible) =>
    pedido('/perfil/disponibilidad', { method: 'PATCH', body: JSON.stringify({ disponible }) }),
  // Lo que la Prestadora publicó para los Asistentes. Sólo lo publicado: lo decide la base.
  contenidos: () => pedido('/contenidos'),
  enlaceDeArchivoDeContenido: (id) => pedido(`/contenidos/archivos/${encodeURIComponent(id)}/enlace`),
  misGuardias: () => pedido('/guardias'),
  misCoberturas: () => pedido('/coberturas'),
  objetarCobertura: (id) => pedido(`/coberturas/${id}/objecion`, { method: 'POST' }),
  guardia: (id) => pedido(`/guardias/${id}`),
  checkin: (id, datos) => pedido(`/guardias/${id}/checkin`, { method: 'POST', body: JSON.stringify(conElActo(datos)) }),
  checkout: (id, datos) => pedido(`/guardias/${id}/checkout`, { method: 'POST', body: JSON.stringify(conElActo(datos)) }),
  // Los dos actos de antes de llegar (pendiente #101). Son deliberados: los aprieta la persona,
  // y por eso quedan guardados como acto suyo y no como una cuenta del sistema. Ninguno de los
  // dos exige ubicación: sin GPS se manda igual y lo único que se pierde es la estimación.
  registrarSalida: (id, datos) => pedido(`/guardias/${id}/salida`, { method: 'POST', body: JSON.stringify(conElActo(datos)) }),
  avisarDemora: (id, datos) => pedido(`/guardias/${id}/aviso-demora`, { method: 'POST', body: JSON.stringify(conElActo(datos)) }),
  // El último punto del viaje al domicilio, para el mapa del Cliente. No es un acto de la persona
  // y no va a la cola: un punto viejo no le sirve a nadie, lo reemplaza el siguiente.
  ubicacionDelViaje: (id, punto) => pedido(`/guardias/${id}/ubicacion`, { method: 'PATCH', body: JSON.stringify(punto) }),
  // Lo que pasa durante la guardia y no admite esperar al cierre. Manda el momento en que pasó,
  // porque si el aviso queda en la cola sin conexión lo que importa es esa hora y no la de la
  // sincronización.
  avisarEmergencia: (id, datos) => pedido(`/guardias/${id}/emergencia`, { method: 'POST', body: JSON.stringify(conElActo(datos)) }),
  // El «no puedo continuar» de quien se quedó esperando el relevo. No la libera del turno: avisa
  // con la máxima urgencia. Manda el momento por lo mismo que la emergencia.
  relevoDeEmergencia: (id, datos) => pedido(`/guardias/${id}/relevo-de-emergencia`, { method: 'POST', body: JSON.stringify(conElActo(datos)) }),
  // El descanso adentro de una guardia larga. No cierra nada ni descuenta nada: deja constancia.
  empezarDescanso: (id, datos) => pedido(`/guardias/${id}/descanso/empezar`, { method: 'POST', body: JSON.stringify(conElActo(datos)) }),
  terminarDescanso: (id, datos) => pedido(`/guardias/${id}/descanso/terminar`, { method: 'POST', body: JSON.stringify(conElActo(datos)) }),
  // El pase de guardia (pendiente #113). Tres pedidos y ninguno más:
  //   - el código que este Asistente muestra cuando es él el que se va y llega el relevo;
  //   - el pedido de autorización, que aparece en el Panel con desde dónde y cuándo se pidió;
  //   - en qué quedó ese pedido, que la pantalla pregunta sola mientras espera.
  // El código que se tipea no viaja por acá: va adentro del mismo checkin o checkout, junto con
  // la ubicación, porque comprobar la presencia y marcar la llegada son un solo acto.
  codigoDePresencia: () => pedido('/codigo-de-presencia'),
  pedirAutorizacion: (id, { momento, lat, lng, motivo, detalle }) =>
    pedido(`/guardias/${id}/comprobacion/pedido`, { method: 'POST', body: JSON.stringify({ momento, lat, lng, motivo, detalle }) }),
  estadoDeComprobacion: (id, momento) => pedido(`/guardias/${id}/comprobacion/${momento}`),
  estructurarReporte: (id, textoLibre) =>
    pedido(`/guardias/${id}/reporte/estructurar`, { method: 'POST', body: JSON.stringify({ textoLibre }) }),
  subirFotoReporte: (id, archivo) => {
    const formData = new FormData();
    formData.append('foto', archivo);
    return pedido(`/guardias/${id}/reporte/foto`, { method: 'POST', body: formData });
  },
  confirmarReporte: (id, datos) => pedido(`/guardias/${id}/reporte/confirmar`, { method: 'POST', body: JSON.stringify(conElActo(datos)) }),
  reportesDelPaciente: (pacienteId) => pedido(`/pacientes/${pacienteId}/reportes`),
  medicacionDelPaciente: (pacienteId) => pedido(`/medicacion/${pacienteId}`),
  // El enlace a la receta se pide al tocar el botón: preparado de antemano se vence antes de usarlo.
  recetaDeLaOrden: (pacienteId, indicacionId) => pedido(`/medicacion/${pacienteId}/receta/${indicacionId}`),
  // Pendiente #102 — consentimiento para el registro de ubicación. El idioma
  // viaja en el pedido porque el texto que se guarda como constancia tiene que
  // ser el mismo que la persona leyó en pantalla.
  consentimientos: (idioma) => pedido(`/consentimientos?idioma=${encodeURIComponent(idioma)}`),
  decidirConsentimiento: (clave, decision, idioma) =>
    pedido('/consentimientos', { method: 'POST', body: JSON.stringify({ clave, decision, idioma }) }),
  // Los turnos que se le asignaron y todavía no respondió, con la lista de motivos de rechazo de
  // su Prestadora. Rechazar pide uno de esos motivos, y el detalle cuando el motivo lo pide.
  asignaciones: () => pedido('/asignaciones'),
  responderAsignacion: (id, respuesta, { motivoId, detalle } = {}) =>
    pedido(`/asignaciones/${id}/responder`, {
      method: 'POST',
      body: JSON.stringify({ respuesta, motivoId, detalle }),
    }),
  // Las calificaciones que le pusieron, y el descargo que puede dejar ante cada una. El
  // descargo se carga una sola vez y no se edita nunca: la base lo sostiene con la policy
  // `asistente_carga_su_descargo`, que sólo deja escribir mientras el campo esté vacío.
  calificaciones: () => pedido('/calificaciones'),
  cargarDescargo: (id, descargo) =>
    pedido(`/calificaciones/${id}/descargo`, { method: 'PATCH', body: JSON.stringify({ descargo }) }),
  suscribirPush: (suscripcion) => pedido('/push/suscribir', { method: 'POST', body: JSON.stringify(suscripcion) }),
  desuscribirPush: (endpoint) => pedido('/push/suscribir', { method: 'DELETE', body: JSON.stringify({ endpoint }) }),
  // EL CHAT CON UN CLIENTE DE LA VIDRIERA. Es el mismo hilo que ve el Cliente, mirado desde la
  // otra punta. El dato de contacto sale tapado para los dos lados hasta que esa pareja lo abra:
  // tapar de un solo lado no taparía nada, porque alcanza con que lo escriba el otro.
  conversacionesDeLaIntermediacion: () => pedido('/intermediacion/conversaciones'),
  // Con `desde`, el backend contesta nada más lo posterior a ese momento: es el refresco del hilo
  // abierto, que pide lo que le falta y no vuelve a bajar lo que ya está en pantalla.
  conversacionDeLaIntermediacion: (id, desde = null) =>
    pedido(`/intermediacion/conversaciones/${id}${desde ? `?desde=${encodeURIComponent(desde)}` : ''}`),
  escribirEnConversacion: (id, cuerpo) =>
    pedido(`/intermediacion/conversaciones/${id}/mensajes`, { method: 'POST', body: JSON.stringify({ cuerpo }) }),
  abrirVideollamada: (id) => pedido(`/intermediacion/conversaciones/${id}/videollamada`, { method: 'POST' }),
  // LAS LLAVES QUE ESTA PERSONA GUARDA EN SUS APARATOS: ver cuáles tiene, agregar una en este
  // aparato, sacar la de uno que ya no usa, y avisar que se ingresó con biometría, que es también
  // cómo se entera el teléfono de que su aparato fue revocado (`lib/accesoGuardado.js`). Lo que vuelve son fechas: ni la credencial ni la mitad pública de la llave salen del
  // backend, porque para reconocer cuál es cuál no hacen falta.
  llaves: () => pedido('/llaves'),
  desafioDeLlave: () => pedido('/llaves/desafio', { method: 'POST' }),
  guardarLlave: (respuesta) => pedido('/llaves', { method: 'POST', body: JSON.stringify({ respuesta }) }),
  sacarLlave: (id) => pedido(`/llaves/${id}`, { method: 'DELETE' }),
  llaveUsada: (id) => pedido(`/llaves/${id}/usada`, { method: 'POST' }),
};
