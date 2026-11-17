import { enLaPrestadora } from '../db/connection.js';

// EL PUNTO UNICO DE VERDAD PARA ESCRIBIR EL REGISTRO DE ACTIVIDAD.
//
// Que hace la gente de una Prestadora: quien, cuando, sobre que y que cambio. La tabla es
// `public.registro_actividad`, y su forma la sostienen los disparadores
// `trg_registro_actividad_solo_lo_permitido` y `trg_registro_actividad_no_se_toca`.
//
// Se escribe desde acá y desde ningun otro lado. Cada ruta que registra algo llama a una de
// estas funciones: si la misma decision se copiara ruta por ruta, el dia que cambie el nombre de
// una accion habria que acordarse de todas.
//
// SE ESCRIBE CON LA CREDENCIAL DEL TRABAJO DE LA PRESTADORA de la sesion, que la base acota a esa
// Prestadora: quien pide no tiene permiso de escribir el registro, y no tiene que tenerlo, porque
// si lo tuviera podria escribirse a si mismo lo que quisiera.
//
// NUNCA SE LE PASA UN DATO SENSIBLE. Ninguna clave, ningun dato de contenido, ninguna
// direccion, ningun importe y ninguna remuneracion. La base ademas lo hace cumplir: `detalle`
// solo admite las claves del catalogo `catalogo_datos_del_registro`, y lo que no este ahi hace
// fallar la escritura.

export const ACCION_ENTRADA_AL_PANEL = 'entrada_al_panel';
export const ACCION_ALTA_DE_CUENTA = 'alta_de_cuenta_del_panel';
export const ACCION_CAMBIO_DE_CUENTA = 'cambio_de_datos_de_cuenta_del_panel';
export const ACCION_DESACTIVACION_DE_CUENTA = 'desactivacion_de_cuenta';
export const ACCION_ENVIO_DE_DOCUMENTO_PARA_FIRMAR = 'envio_de_documento_para_firmar';
export const ACCION_CAMBIO_DE_PERMISOS = 'cambio_de_permisos_de_la_prestadora';
export const ACCION_BORRADO_DE_DATOS = 'borrado_de_datos';
export const ACCION_MODIFICACION_CRITICA = 'modificacion_critica';
export const ACCION_CAMBIO_DE_MONEDA = 'cambio_de_moneda';
// Adonde se le paga a un Asistente. Lo informa el, asi que esta es la unica accion que anota acá
// alguien que no entra por el Panel: queda el renglon igual, porque cambiar una cuenta de destino
// tiene consecuencia economica. **Nunca se le pasa el numero de la cuenta**, ni entero ni a
// medias: se anota que cambio, quien y cuando, y para verlo se mira la fila.
export const ACCION_CAMBIO_DE_DATOS_BANCARIOS = 'cambio_de_datos_bancarios_del_asistente';
// Se anota desde dos lugares —la pantalla de la cuenta y la activación—, así que el nombre vive
// acá y no en ninguno de los dos: escrito dos veces, el día que cambie cambiaría en uno solo.
export const ACCION_VERIFICACION_DE_TELEFONO = 'verificacion_de_telefono';

// Cada cuanto vuelve a anotarse la entrada al Panel de la misma cuenta. La sesion del Panel no
// pasa por ninguna ruta del backend al abrirse —la clave se valida contra Supabase directamente—,
// asi que la entrada se reconoce en el primer pedido que llega con esa cuenta. Sin esta ventana,
// cada pedido de la jornada dejaria un renglon de entrada y el registro se volveria ilegible.
// Se puede correr por ambiente sin publicar una version nueva.
const MINUTOS_ENTRE_ENTRADAS = Number(process.env.MINUTOS_ENTRE_ENTRADAS_REGISTRADAS ?? 60);

// Cuando se anoto por ultima vez la entrada de cada cuenta, en este proceso. Vive en memoria a
// proposito: preguntarle a la base en cada pedido costaria una consulta por pedido para no
// escribir nada. Si el backend se reinicia, lo unico que pasa es que la entrada se anota una vez
// mas, que es el lado seguro del error.
const ultimaEntrada = new Map();

// La Prestadora sale siempre de la sesion comprobada, nunca de lo que venga en el pedido.
// `req.usuarioPanel` lo arma `requiereRolPanel`, que resuelve la precedencia —permiso de acceso
// primero, Organizacion propia despues— con el mismo orden que la funcion SQL
// `interno.prestadora_actual()`.
export async function registrarActividad(usuarioPanel, accion, {
  tablaAfectada = null,
  registroId = null,
  camposCambiados = null,
  detalle = null,
} = {}) {
  // Falla cerrado, y en silencio: sin cuenta o sin Prestadora resuelta no hay a quien ni a que
  // atribuirle la accion, y una fila mal atribuida es peor que ninguna. No se interrumpe el
  // pedido por esto: el registro acompaña al trabajo, no lo bloquea.
  if (!usuarioPanel?.id || !usuarioPanel?.prestadoraId) return;

  try {
    const { error } = await enLaPrestadora(usuarioPanel.prestadoraId, 'registro de actividad', (db) =>
      db.from('registro_actividad').insert({
        prestadora_id: usuarioPanel.prestadoraId,
        usuario_id: usuarioPanel.id,
        accion,
        tabla_afectada: tablaAfectada,
        registro_id: registroId,
        campos_cambiados: camposCambiados,
        detalle,
      }));
    if (error) console.error('Error escribiendo el registro de actividad:', error.message);
  } catch (err) {
    console.error('Error escribiendo el registro de actividad:', err?.message ?? err);
  }
}

// VER O DESCARGAR EL REGISTRO DE ACCESOS A LA INFORMACIÓN DE SALUD.
//
// Mirar quién leyó información de salud también es leer información de salud, y queda anotado
// siempre: no hay configuración que lo apague. A diferencia del resto del registro, acá el
// renglón no acompaña al trabajo, lo condiciona: si no se pudo anotar, no se entrega nada. Por eso
// esta variante no se calla el error, lo tira, y la ruta contesta que algo falló. La descarga se
// anota con la acción de exportación de toda descarga.
export const ACCION_CONSULTA_DEL_REGISTRO_DE_ACCESOS = 'consulta_del_registro_de_accesos';
// La anota la base, desde el informe diario que corre sin persona. El nombre vive acá igual,
// para que el Panel y las pruebas lo lean del mismo lugar.
export const ACCION_INFORME_DIARIO_DE_ACCESOS = 'informe_diario_de_accesos_fuera_de_lo_normal';

export async function registrarActividadSinFalta(usuarioPanel, accion, {
  tablaAfectada = null,
  registroId = null,
  camposCambiados = null,
  detalle = null,
} = {}) {
  if (!usuarioPanel?.id || !usuarioPanel?.prestadoraId) {
    throw new Error('No hay cuenta o Prestadora a la que atribuirle la acción');
  }
  const { error } = await enLaPrestadora(usuarioPanel.prestadoraId, 'registro de actividad', (db) =>
    db.from('registro_actividad').insert({
      prestadora_id: usuarioPanel.prestadoraId,
      usuario_id: usuarioPanel.id,
      accion,
      tabla_afectada: tablaAfectada,
      registro_id: registroId,
      campos_cambiados: camposCambiados,
      detalle,
    }));
  if (error) throw error;
}

// La entrada administrativa. Se anota una vez por ventana y por cuenta.
export async function registrarEntradaAlPanel(usuarioPanel) {
  if (!usuarioPanel?.id || !usuarioPanel?.prestadoraId) return;

  const clave = `${usuarioPanel.id}:${usuarioPanel.prestadoraId}`;
  const ahora = Date.now();
  const anterior = ultimaEntrada.get(clave);
  if (anterior && ahora - anterior < MINUTOS_ENTRE_ENTRADAS * 60 * 1000) return;

  // Se marca antes de escribir para que dos pedidos que llegan juntos no dejen dos renglones.
  ultimaEntrada.set(clave, ahora);
  await registrarActividad(usuarioPanel, ACCION_ENTRADA_AL_PANEL);
}

// TODO BORRADO DE DATOS DEL PANEL, EN UN SOLO LUGAR.
//
// La regla de la empresa pide auditar el borrado de datos, y no el borrado de tal o cual cosa: si
// cada ruta que borra algo tuviera que acordarse de anotarlo, la que se olvide es justamente la
// que nadie va a notar. Por eso se engancha una sola vez, en `requiereRolPanel`, sobre cualquier
// pedido de borrado del Panel que haya terminado bien.
//
// Se anota que se borro y donde, nunca que se borro: recuperar el contenido no es trabajo de un
// registro de auditoria, y guardarlo ahi seria guardar dos veces el dato que alguien pidio sacar.
//
// La ruta se guarda sin lo que venga despues del signo de pregunta: ahi puede viajar cualquier
// cosa —un nombre, un correo, una busqueda— y nada de eso entra.
export function registrarBorradoDeDatos(usuarioPanel, metodo, ruta) {
  return registrarActividad(usuarioPanel, ACCION_BORRADO_DE_DATOS, {
    detalle: { metodo, ruta: String(ruta ?? '').split('?')[0] },
  });
}

// EL FIN DE LA SESION, en el Panel y en las dos aplicaciones. Lo avisa la pantalla justo antes de
// cerrar, con la sesion que todavia vale: despues de cerrar ya no hay con que escribirlo. La causa
// es una de dos, y cualquier otra no se anota.
export const ACCION_FIN_DE_SESION = 'fin_de_sesion';
export const CAUSAS_DE_FIN_DE_SESION = ['a_mano', 'por_inactividad'];

export function causaDeFinDeSesionValida(causa) {
  return CAUSAS_DE_FIN_DE_SESION.includes(causa);
}

export function registrarFinDeSesion(usuario, causa) {
  if (!causaDeFinDeSesionValida(causa)) return Promise.resolve();
  return registrarActividad(usuario, ACCION_FIN_DE_SESION, { detalle: { causa } });
}

// TODA DESCARGA DE DATOS, CON UNA SOLA FUNCION. Se anota que se bajo un archivo, quien y desde
// que ruta, nunca lo que tenia adentro. La ruta va sin la parte de la consulta, por lo mismo que
// en el borrado.
export const ACCION_EXPORTACION = 'exportacion';

export function registrarExportacion(usuario, metodo, ruta) {
  return registrarActividad(usuario, ACCION_EXPORTACION, {
    detalle: { metodo, ruta: String(ruta ?? '').split('?')[0] },
  });
}

// Se monta en cada ruta que entrega una descarga, despues de la comprobacion de sesion. Anota
// cuando la respuesta salio bien, y no antes: un pedido rechazado no se llevo nada.
// `quienPide` dice de donde sale la persona; por defecto, la sesion del Panel.
export function anotarExportacion(quienPide = (req) => req.usuarioPanel) {
  return (req, res, next) => {
    res.on('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        registrarExportacion(quienPide(req), req.method, req.originalUrl);
      }
    });
    next();
  };
}

// Cuando una ruta ya dejo su propio renglon, con un nombre que dice mejor lo que paso —dar de baja
// una cuenta del Panel es un cambio de membresia y no «un borrado»—, se marca acá para que el
// enganche general no escriba un segundo renglon de lo mismo.
export function yaQuedoRegistrado(res) {
  res.locals.actividadRegistrada = true;
}

export function faltaRegistrar(res) {
  return !res.locals?.actividadRegistrada;
}

// Que columnas cambiaron, sin sus valores. Es la forma de contestar «que cambio» sin guardar
// contenido de nadie: se guardan los nombres y, para verlos, se mira la fila.
export function camposQueCambiaron(cambios) {
  return Object.keys(cambios ?? {}).filter((campo) => cambios[campo] !== undefined);
}
