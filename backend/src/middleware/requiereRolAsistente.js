import { abrirSesionDelPedido, clienteDelPedido } from '../db/connection.js';

// Mismo patrón que requiereRolPanel.js (credencial comprobada con la clave pública de la
// región que la emitió + lookup de rol/prestadora en `usuarios` con la credencial de la
// persona), acotado al rol `asistente` — Etapa 3 (PWA Asistentes). No reutiliza requiereRolPanel
// porque ese exige un rol de Panel y arrastra lógica de modo-Prestadora/MFA que no aplica acá.
export async function requiereRolAsistente(req, res, next) {
  const sesion = await abrirSesionDelPedido(req);
  if (!sesion) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  const db = clienteDelPedido(req);

  // SIN FILTRO DE PRESTADORA, Y NO LE HACE FALTA
  // Es el paso anterior a todo lo demás: de acá sale la Prestadora de esta sesión, y la consulta
  // que viene abajo —el Legajo del Asistente— ya la usa. Pedirle a esta que la sepa de antemano
  // sería circular: no hay de dónde sacarla salvo de esta misma fila, que la base le devuelve a
  // su dueño y a nadie más.
  const { data: perfil, error: errorPerfil } = await db
    .from('usuarios')
    .select('rol, prestadora_id')
    .eq('id', sesion.id)
    .single();

  if (errorPerfil || !perfil || perfil.rol !== 'asistente') {
    return res.status(403).json({ error: 'Rol sin permiso' });
  }

  // Dos números distintos, y hace falta tener los dos a mano. `id` es la persona —con qué entra,
  // cómo se llama—; `asistenteId` es lo suyo en esta Prestadora, con su antigüedad, sus lugares y
  // sus matrículas. La misma persona puede tener otro en otra Prestadora, y por eso se busca
  // acotado a la Prestadora de esta sesión.
  const { data: asistente, error: errorAsistente } = await db
    .from('asistentes')
    .select('id')
    .eq('usuario_id', sesion.id)
    .eq('prestadora_id', perfil.prestadora_id)
    .maybeSingle();

  if (errorAsistente || !asistente) {
    return res.status(403).json({ error: 'Rol sin permiso' });
  }

  req.usuarioAsistente = {
    id: sesion.id,
    asistenteId: asistente.id,
    prestadoraId: perfil.prestadora_id,
  };
  next();
}
