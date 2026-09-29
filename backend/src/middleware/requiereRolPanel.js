import { abrirSesionDelPedido, clienteDelPedido, supabase } from '../db/connection.js';
import { elRolUsaSegundoFactor, elSegundoFactorEsObligatorio } from '../utils/reglaMfaObligatorio.js';
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

// Con la maestra a propósito: `auditoria_de_accesos` no tiene política que deje escribir a una
// persona, y no debe tenerla —quien está siendo auditado no escribe su propia auditoría—.
async function registrarAuditoria({ adminId, prestadoraId, tipoEvento, detalle }) {
  const { error } = await supabase.from('auditoria_de_accesos').insert({
    admin_id: adminId,
    prestadora_id: prestadoraId,
    tipo_evento: tipoEvento,
    detalle,
  });
  if (error) console.error('Error registrando la auditoría del acceso:', error.message);
}

export async function requiereRolPanel(req, res, next) {
  // La credencial se comprueba con la clave pública de la instalación que la emitió, y de ahí en
  // más todo lo que este middleware lee de la persona lo lee con esa misma credencial
  // (`db/connection.js`, «La credencial de la persona»).
  const sesion = await abrirSesionDelPedido(req);
  if (!sesion) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  const db = clienteDelPedido(req);

  // SIN FILTRO DE PRESTADORA, Y NO LE HACE FALTA
  // Es el paso anterior a todo lo demás: la Prestadora de la sesión sale de acá, y pedirle a esta
  // consulta que ya la sepa es circular. Y en el Panel la cuenta puede no pertenecer a ninguna:
  // la del soporte técnico la lleva vacía por restricción de la base. Con la credencial de la
  // persona la base le devuelve su propia fila y ninguna otra.
  const { data: perfil, error: errorPerfil } = await db
    .from('usuarios')
    .select('rol, prestadora_id')
    .eq('id', sesion.id)
    .single();

  if (errorPerfil || !perfil || !ROLES_PANEL.includes(perfil.rol)) {
    return res.status(403).json({ error: 'Rol sin permiso' });
  }

  // La lectura se pasa entera —con su error— a la regla compartida: si la fila única de
  // configuración no se puede leer, se exige el segundo factor igual y queda registrado
  // (panel/src/lib/reglaMfaObligatorio.js, copiado acá; CLAUDE.md §7 regla 12).
  if (elRolUsaSegundoFactor(perfil.rol)) {
    const lecturaConfig = await db
      .from('configuracion_plataforma')
      .select('mfa_admin_obligatorio')
      .single();
    // El nivel con que entró sale de la credencial ya verificada: Supabase no lo pone en ningún
    // otro lado.
    if (elSegundoFactorEsObligatorio(lecturaConfig) && sesion.aal !== 'aal2') {
      return res.status(403).json({ error: 'MFA requerido', codigo: 'mfa_requerido' });
    }
  }

  let prestadoraId = perfil.prestadora_id;
  let conPermisoDeAcceso = false;

  // Sin permiso de acceso abierto, el rol técnico ve únicamente su propia Organización —Sandbox,
  // por su `prestadora_id`—. Con uno abierto, ve la Prestadora de ese permiso.
  //
  // Es exactamente el mismo orden que aplica la función SQL `current_tenant()`, que es el punto
  // único de verdad de la protección por fila: acá se repite para que el resto de las rutas use el
  // mismo `req.usuarioPanel.prestadoraId` sin preguntar por el rol. Si los dos no dijeran lo mismo,
  // una ruta armaría la consulta apuntando a una Prestadora y la base la contestaría apuntando a
  // otra.
  if (perfil.rol === 'superadmin') {
    // SIN FILTRO DE PRESTADORA, Y NO LE HACE FALTA
    // Busca en qué Prestadora hay un permiso abierto, sin saber de antemano en cuál. Acotarlo a la
    // Organización propia de quien entra —que es Sandbox— no encontraría nunca el que está abierto
    // en otra. No devuelve dato de la Organización; el paso siguiente sí la nombra, sacada de la
    // fila hallada. Con la credencial de la persona, la base le muestra sólo sus propios permisos.
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
    // `current_tenant()` la sigue encontrando, así que la base seguiría abriéndole el cajón a una
    // consulta hecha con el pase de esa persona. Y este es el único lugar por el que pasan todos los
    // pedidos, así que es el único que puede enterarse de que el tiempo se cumplió. Antes lo cerraba
    // la pantalla que preguntaba cada 30 segundos, y eso hacía depender de una pantalla algo que
    // tiene que pasar igual con la pantalla cerrada.
    if (permiso && !vigente) {
      await db
        .from('permisos_de_acceso')
        .update({ salida_at: ahora.toISOString() })
        .eq('id', permiso.id)
        // La Prestadora se nombra igual, aunque el identificador del permiso ya sea único: colgar
        // de la fila padre es justamente el molde del defecto que se viene cerrando.
        .eq('prestadora_id', permiso.prestadora_id);

      await registrarAuditoria({
        adminId: sesion.id,
        prestadoraId: permiso.prestadora_id,
        tipoEvento: 'logout',
        detalle: { motivo: vencioPorTope ? 'tope_60min' : 'inactividad_5min' },
      });
    }

    if (permiso && vigente) {
      await db
        .from('permisos_de_acceso')
        .update({ ultima_actividad_at: ahora.toISOString() })
        .eq('id', permiso.id)
        .eq('prestadora_id', permiso.prestadora_id);

      prestadoraId = permiso.prestadora_id;
      conPermisoDeAcceso = true;
    }
  }

  // `prestadoraId` es la Organización sobre la que se está trabajando ahora (la del permiso de
  // acceso si hay uno abierto). `organizacionPropiaId` es la Organización a la que pertenece la
  // cuenta en sí, que no cambia al entrar a una Prestadora. Casi todo el código quiere la
  // primera; la segunda hace falta en el único lugar donde importa de quién es la cuenta y no
  // dónde está parada: al dar de alta otra cuenta superadmin (panelUsuarios.js).
  req.usuarioPanel = {
    id: sesion.id,
    rol: perfil.rol,
    prestadoraId,
    organizacionPropiaId: perfil.prestadora_id,
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
  // preguntas distintas y viven en dos tablas distintas, por el motivo escrito en la migración
  // `20261001110000_registro_de_actividad.sql`.
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

  // Sólo se anota lo que se hace adentro de una Prestadora ajena: el trabajo del rol técnico en su
  // propia Organización —Sandbox— no es un acceso a los datos de nadie.
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
