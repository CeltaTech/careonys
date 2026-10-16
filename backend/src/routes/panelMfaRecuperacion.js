import { Router } from 'express';
import { abrirSesionDelPedido, clienteDelPedido } from '../db/connection.js';
import { solicitarCodigoRecuperacion, confirmarCodigoRecuperacion } from '../utils/mfaRecuperacionEmail.js';
import { responderError } from '../utils/errorConMotivo.js';

// Pendiente #37 — recuperación de acceso por email para el superadmin que pierde el
// dispositivo TOTP. A propósito NO usa requiereRolPanel: ese middleware exige
// aal2 cuando mfa_admin_obligatorio está en ON, y quien llega acá es precisamente alguien
// que todavía no pudo completar ese segundo factor (sesión aal1, ya autenticado con
// contraseña). Alcanza con validar el token y el rol, sin exigir aal2.
export const panelMfaRecuperacionRouter = Router();

async function requiereSesionBasica(req, res, next) {
  // La credencial se comprueba con la clave pública de la región que la emitió
  // (`db/connection.js`, «La credencial de la persona»).
  const sesion = await abrirSesionDelPedido(req);
  if (!sesion) return res.status(401).json({ error: 'No autorizado' });

  // SIN FILTRO DE PRESTADORA, Y NO LE HACE FALTA
  // Quien llega es soporte técnico de CeltaTech, que no pertenece a ninguna Prestadora, y todavía
  // no hay sesión del Panel de la cual sacarla. Con la credencial de la persona la base le
  // devuelve su propia fila y ninguna otra, y lo que no sea soporte técnico se rechaza abajo.
  const { data: perfil } = await clienteDelPedido(req)
    .from('usuarios')
    .select('rol')
    .eq('id', sesion.id)
    .single();
  if (!perfil || perfil.rol !== 'superadmin') {
    return res.status(403).json({ error: 'Rol sin permiso' });
  }

  req.usuarioId = sesion.id;
  next();
}

panelMfaRecuperacionRouter.use(requiereSesionBasica);

panelMfaRecuperacionRouter.post('/solicitar', async (req, res) => {
  try {
    await solicitarCodigoRecuperacion(req.usuarioId);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error en /mfa-recuperacion/solicitar:', err);
    responderError(res, err);
  }
});

panelMfaRecuperacionRouter.post('/confirmar', async (req, res) => {
  const { codigo } = req.body;
  if (!codigo) return res.status(400).json({ error: 'Falta el código' });

  const valido = await confirmarCodigoRecuperacion(req.usuarioId, codigo);
  if (!valido) return res.status(400).json({ error: 'Código inválido, vencido o ya usado' });

  res.json({ ok: true });
});
