import { abrirSesionDelPedido, clienteDelPedido } from '../db/connection.js';

// Mismo patrón que requiereRolAsistente.js, acotado al rol `cliente` — Etapa 4 (PWA
// Clientes). La credencial se comprueba con la clave pública de la instalación que la emitió, y
// todo lo que se lee acá se lee con la credencial de la persona (`db/connection.js`).
export async function requiereRolCliente(req, res, next) {
  const sesion = await abrirSesionDelPedido(req);
  if (!sesion) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  const db = clienteDelPedido(req);

  // SIN FILTRO DE PRESTADORA, Y NO LE HACE FALTA
  // Acá se resuelve, a partir de la cuenta con la que se entró, cuál es la Prestadora de la
  // sesión. Todo lo que sigue se acota con lo que devuelve esta fila; exigirle el filtro a ella
  // sería pedirle que ya sepa lo que viene a averiguar. La base le devuelve su propia fila y
  // ninguna otra.
  const { data: perfil, error: errorPerfil } = await db
    .from('usuarios')
    .select('rol, prestadora_id')
    .eq('id', sesion.id)
    .single();

  if (errorPerfil || !perfil || perfil.rol !== 'cliente') {
    return res.status(403).json({ error: 'Rol sin permiso' });
  }

  // El usuario logueado puede ser el titular de la cuenta (fila propia en `clientes`) o
  // alguien invitado a las personas autorizadas (fila en `miembros_cliente`, Fase 5) — se
  // resuelve acá una sola vez, no en cada ruta de appClientes.js.
  //
  // Y se busca por la cuenta y acotado a la Prestadora de la sesión, porque la misma persona
  // puede tener otro Legajo en otra Prestadora: la cuenta es una y los Legajos son varios.
  const { data: titular } = await db
    .from('clientes')
    .select('id')
    .eq('usuario_id', sesion.id)
    .eq('prestadora_id', perfil.prestadora_id)
    .maybeSingle();

  let clienteId = titular?.id ?? null;

  if (!clienteId) {
    const { data: miembro } = await db
      .from('miembros_cliente')
      .select('cliente_id, clientes!inner(prestadora_id)')
      .eq('usuario_id', sesion.id)
      .eq('clientes.prestadora_id', perfil.prestadora_id)
      .maybeSingle();

    clienteId = miembro?.cliente_id ?? null;
  }

  if (!clienteId) {
    return res.status(403).json({ error: 'Rol sin permiso' });
  }

  // Acá se deja solamente si es el titular o no, que es un hecho —tiene fila propia en
  // `clientes`— y no una decisión. Qué ve cada persona de las personas autorizadas ya no es un rol con nombre:
  // son once accesos que el titular pidió por escrito, y los resuelve `accesosDelPedido` en las
  // rutas que los necesitan, para no consultarlos en los pedidos que no los miran.
  req.usuarioCliente = {
    id: sesion.id,
    clienteId,
    esTitular: Boolean(titular),
    prestadoraId: perfil.prestadora_id,
  };
  next();
}
