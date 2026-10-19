import { abrirSesionDelPedido, clienteDelPedido, enLaPrestadora } from '../db/connection.js';
import { ROLES_PANEL } from '../utils/roles.js';
import {
  faltaRegistrar,
  registrarBorradoDeDatos,
  registrarEntradaAlPanel,
} from '../utils/registroDeActividad.js';

// EL PERMISO DE ACCESO, DE ESTE LADO.
//
// El permiso con el que alguien de CeltaTech entra a los datos de una Prestadora lo abre CeltaTech
// desde su lado: acá no hay ninguna ruta que lo abra, lo renueve ni lo cierre a pedido. Lo que
// queda de este lado es hacerlo cumplir, que es lo que no puede vivir en ningún otro lugar: la que
// decide qué filas ve una consulta es esta base.
//
// El corte por inactividad es a los 5 minutos y se hace en silencio. El tope absoluto está escrito
// en cada fila, en `expira_at`, y es de 60 minutos.
//
// LA CUENTA TÉCNICA NO TIENE ENTRADA PROPIA. Sin un permiso vigente se la rechaza en cada pedido,
// con el mismo rechazo que a cualquier rol sin acceso: no hay una Organización «propia» en la que
// pueda trabajar mientras tanto.
const INACTIVIDAD_LIMITE_MS = 5 * 60 * 1000;

// Las escrituras de las rutas que todavía usan la llave maestra (`supabase`, en
// backend/src/db/connection.js) no llevan la credencial de la persona, así que el disparador que
// anota en `auditoria_de_accesos` no las ve: `auth.uid()` da NULL adentro de un disparador lanzado
// por una escritura con esa llave. Se anotan acá, a nivel de pedido, en vez de a nivel de fila.
//
// Las rutas ya migradas a `clienteDelPedido(req)` sí llevan la credencial, y ahí el disparador
// anota cada fila. Mientras convivan las dos formas, en esas rutas queda anotado dos veces: por
// fila y por pedido. Se saca de acá cuando no quede ninguna ruta con la maestra.
const METODOS_MUTACION = ['POST', 'PUT', 'PATCH', 'DELETE'];

// Con la credencial del trabajo de la Prestadora donde se entró, y no con la de la persona:
// `auditoria_de_accesos` no tiene política que deje escribir a una persona, y no debe tenerla
// —quien está siendo auditado no escribe su propia auditoría—. La base acota la escritura a esa
// Prestadora. Si falla, queda en el registro del servidor y el pedido sigue.
async function registrarAuditoria({ adminId, prestadoraId, tipoEvento, detalle }) {
  try {
    const { error } = await enLaPrestadora(prestadoraId, 'auditoría del permiso de acceso', (db) => db
      .from('auditoria_de_accesos')
      .insert({
        admin_id: adminId,
        prestadora_id: prestadoraId,
        tipo_evento: tipoEvento,
        detalle,
      }));
    if (error) console.error('Error registrando la auditoría del acceso:', error.message);
  } catch (error) {
    console.error('Error registrando la auditoría del acceso:', error.message);
  }
}

// Cerrar un permiso vencido o anotar la actividad de uno vigente. Va con la credencial del trabajo
// de esa Prestadora y no con la de la persona: la persona sólo puede leer sus permisos, no
// cambiarlos. Devuelve si la escritura salió; si no, queda en el registro del servidor.
async function escribirPermiso(permiso, trabajo, cambios) {
  try {
    const { error } = await enLaPrestadora(permiso.prestadora_id, trabajo, (db) => db
      .from('permisos_de_acceso')
      .update(cambios)
      .eq('id', permiso.id)
      // La Prestadora se nombra igual, aunque el identificador del permiso ya sea único: colgar
      // de la fila padre es justamente el molde del defecto que se viene cerrando.
      .eq('prestadora_id', permiso.prestadora_id));
    if (error) throw new Error(error.message);
    return true;
  } catch (error) {
    console.error(`Error en el ${trabajo}:`, error.message);
    return false;
  }
}

export async function requiereRolPanel(req, res, next) {
  // La credencial se comprueba con la clave pública de la región que la emitió, y de ahí en
  // más todo lo que este middleware lee de la persona lo lee con esa misma credencial
  // (`db/connection.js`, «La credencial de la persona»).
  const sesion = await abrirSesionDelPedido(req);
  if (!sesion) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  const db = clienteDelPedido(req);

  // SIN FILTRO DE PRESTADORA, Y NO LE HACE FALTA
  // Es el paso anterior a todo lo demás: la Prestadora de la sesión sale de acá, y pedirle a esta
  // consulta que ya la sepa es circular. Con la credencial de la persona la base le devuelve su
  // propia fila y ninguna otra.
  const { data: perfil, error: errorPerfil } = await db
    .from('usuarios')
    .select('rol, prestadora_id')
    .eq('id', sesion.id)
    .single();

  if (errorPerfil || !perfil || !ROLES_PANEL.includes(perfil.rol)) {
    return res.status(403).json({ error: 'Rol sin permiso' });
  }

  let prestadoraId = perfil.prestadora_id;
  let conPermisoDeAcceso = false;

  // Con un permiso de acceso vigente, el rol técnico trabaja en la Prestadora de ese permiso, y en
  // ninguna otra. Sin uno, no pasa de acá.
  //
  // Es exactamente el mismo orden que aplica la función SQL `prestadora_actual()`, que es el punto
  // único de verdad de la protección por fila: acá se repite para que el resto de las rutas use el
  // mismo `req.usuarioPanel.prestadoraId` sin preguntar por el rol. Si los dos no dijeran lo mismo,
  // una ruta armaría la consulta apuntando a una Prestadora y la base la contestaría apuntando a
  // otra.
  if (perfil.rol === 'superadmin') {
    // SIN FILTRO DE PRESTADORA, Y NO LE HACE FALTA
    // Busca en qué Prestadora hay un permiso abierto, sin saber de antemano en cuál. No devuelve
    // dato de la Organización; el paso siguiente sí la nombra, sacada de la fila hallada. Con la
    // credencial de la persona, la base le muestra sólo sus propios permisos, y sólo para leerlos:
    // abrirlos es de CeltaTech.
    const { data: permiso } = await db
      .from('permisos_de_acceso')
      .select('id, prestadora_id, expira_at, ultima_actividad_at')
      .eq('admin_id', sesion.id)
      .is('salida_at', null)
      .order('entrada_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const ahora = new Date();
    const vencioPorTope = Boolean(permiso) && new Date(permiso.expira_at) <= ahora;
    const vencioPorInactividad =
      Boolean(permiso) &&
      ahora.getTime() - new Date(permiso.ultima_actividad_at).getTime() > INACTIVIDAD_LIMITE_MS;
    const vigente = Boolean(permiso) && !vencioPorTope && !vencioPorInactividad;

    // ACÁ SE CIERRA EL PERMISO VENCIDO, Y NO EN NINGÚN OTRO LADO.
    //
    // No alcanza con dejar de contestar sobre esa Prestadora: mientras la fila siga sin `salida_at`,
    // `prestadora_actual()` la sigue encontrando, así que la base seguiría abriéndole el cajón a una
    // consulta hecha con el pase de esa persona. Y este es el único lugar por el que pasan todos los
    // pedidos, así que es el único que puede enterarse de que el tiempo se cumplió. Antes lo cerraba
    // la pantalla que preguntaba cada 30 segundos, y eso hacía depender de una pantalla algo que
    // tiene que pasar igual con la pantalla cerrada.
    if (permiso && !vigente) {
      await escribirPermiso(permiso, 'cierre del permiso de acceso', { salida_at: ahora.toISOString() });

      await registrarAuditoria({
        adminId: sesion.id,
        prestadoraId: permiso.prestadora_id,
        tipoEvento: 'logout',
        detalle: { motivo: vencioPorTope ? 'tope_60min' : 'inactividad_5min' },
      });
    }

    if (permiso && vigente) {
      // Sin la actividad anotada, la base daría el permiso por muerto con la persona trabajando:
      // el pedido no pasa, y cae en el rechazo de abajo.
      const anotada = await escribirPermiso(permiso, 'registro de actividad del permiso de acceso', {
        ultima_actividad_at: ahora.toISOString(),
      });
      if (anotada) {
        prestadoraId = permiso.prestadora_id;
        conPermisoDeAcceso = true;
      }
    }

    // SIN PERMISO VIGENTE, AFUERA. Falla cerrado: no encontrar el permiso, encontrarlo vencido o no
    // poder leerlo terminan igual, con el mismo rechazo que cualquier rol sin acceso.
    if (!conPermisoDeAcceso) {
      return res.status(403).json({ error: 'Rol sin permiso' });
    }
  }

  // `prestadoraId` es la Organización sobre la que se está trabajando ahora: la del permiso de
  // acceso para el rol técnico, la propia para todos los demás.
  req.usuarioPanel = {
    id: sesion.id,
    rol: perfil.rol,
    prestadoraId,
    conPermisoDeAcceso,
  };

  // LA ENTRADA ADMINISTRATIVA AL REGISTRO DE ACTIVIDAD.
  //
  // El Panel valida la clave contra Supabase directamente, así que la entrada no pasa por
  // ninguna ruta del backend: el primer pedido que llega con esa cuenta es lo más cerca que se
  // está de verla entrar, y acá pasan todos. La función se ocupa de que no quede un renglón por
  // pedido, y de no interrumpir el trabajo si la escritura falla.
  //
  // Esto es del registro de la Prestadora, no de la auditoría de los accesos: son dos
  // preguntas distintas y viven en dos tablas distintas, `auditoria_de_accesos` y
  // `registro_actividad`.
  registrarEntradaAlPanel(req.usuarioPanel).catch((error) => {
    console.error('Error registrando la entrada al Panel:', error.message);
  });

  // EL BORRADO DE DATOS, PARA TODAS LAS RUTAS A LA VEZ.
  //
  // Se anota cualquier borrado del Panel que haya terminado bien, sin importar de qué pantalla
  // venga: es lo único que asegura que la ruta que se escriba mañana quede registrada sin que
  // nadie se acuerde de agregarla. Va después de que la respuesta salió, para no anotar un
  // borrado que en realidad falló.
  //
  // Se saltea cuando la propia ruta ya dejó un renglón con mejor nombre: dar de baja una cuenta
  // del Panel es un cambio de membresía, y decirlo dos veces —una con su nombre y otra como
  // «borrado»— hace el registro más difícil de leer, no más completo.
  if (req.method === 'DELETE') {
    res.on('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 300 && faltaRegistrar(res)) {
        registrarBorradoDeDatos(req.usuarioPanel, req.method, req.originalUrl)
          .catch((error) => console.error('Error registrando el borrado de datos:', error.message));
      }
    });
  }

  // Todo lo que el rol técnico cambia adentro de una Prestadora queda anotado en la auditoría de
  // los accesos.
  if (conPermisoDeAcceso && METODOS_MUTACION.includes(req.method)) {
    res.on('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        registrarAuditoria({
          adminId: sesion.id,
          prestadoraId,
          tipoEvento: 'mutacion',
          detalle: { metodo: req.method, ruta: req.originalUrl },
        });
      }
    });
  }

  next();
}
