import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import { clienteDelPedido } from '../db/connection.js';
import { ErrorConMotivo, responderError } from '../utils/errorConMotivo.js';
import { cambiarLaClave } from '../utils/claveActual.js';
import { claveAceptable } from '../config/reglaDeClave.js';
import { esAdminOSuperior } from '../utils/roles.js';
import { registrarActividad, yaQuedoRegistrado } from '../utils/registroDeActividad.js';
import { rutasDeLaCuentaSegura, miCuenta } from './cuentaSegura.js';

// LA SEGURIDAD DE LA PROPIA CUENTA, EN EL PANEL.
//
// El teléfono, los equipos y la salida de golpe son los mismos para todos y viven en
// `cuentaSegura.js`. Lo único propio del Panel es esto: la puerta que se le cierra a la cuenta del
// Administrador, y el cambio de la contraseña propia.

const ACCION_CAMBIO_DE_CLAVE = 'cambio_de_clave_propia';

// LA CUENTA DEL ADMINISTRADOR ES DE CELTATECH. Su contraseña y el teléfono con que verifica su
// identidad los da y los cambia CeltaTech (`CLAUDE.md` de Careonys §5), así que acá esas dos
// puertas se le cierran. Ve sus dispositivos y puede cerrar todas sus sesiones, nada más.
// Quién es quién sale de `utils/roles.js`, copia del original del Panel.
function noParaLaAdministracion(req, res, next) {
  if (esAdminOSuperior(req.usuarioPanel?.rol)) {
    return res.status(403).json({ error: 'sin_permiso' });
  }
  next();
}

export const panelCuentaSeguraRouter = rutasDeLaCuentaSegura({
  requiereSesion: requiereRolPanel,
  quienPide: (req) => req.usuarioPanel,
  soloElDuenoDelTelefono: [noParaLaAdministracion],
});

// Cambiar la contraseña propia.
//
// PASA POR ACÁ Y NO DIRECTO AL SERVICIO DE ACCESO para que el rol se mire antes: la del
// Administrador no se cambia desde Careonys. Se pide la actual y se entra con ella; con esa misma
// sesión se escribe la nueva, sin llave maestra.
panelCuentaSeguraRouter.post('/clave', requiereRolPanel, noParaLaAdministracion, async (req, res) => {
  try {
    const { claveActual, claveNueva } = req.body ?? {};
    if (!claveActual || !claveNueva) throw new ErrorConMotivo('faltan_datos');
    if (!claveAceptable(claveNueva)) throw new ErrorConMotivo('password_debil');

    const cuenta = await miCuenta(clienteDelPedido(req), req.usuarioPanel);
    if (!cuenta) throw new ErrorConMotivo('no_encontrado');

    await cambiarLaClave({
      usuarioId: cuenta.id,
      prestadoraId: cuenta.prestadora_id,
      claveActual,
      claveNueva,
    });

    await registrarActividad(req.usuarioPanel, ACCION_CAMBIO_DE_CLAVE, {
      tablaAfectada: 'usuarios',
      registroId: cuenta.id,
    });
    yaQuedoRegistrado(res);

    res.json({ ok: true });
  } catch (err) {
    responderError(res, err);
  }
});
