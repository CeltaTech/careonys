import { requiereRolCliente } from '../middleware/requiereRolCliente.js';
import { rutasDeLaCuentaSegura } from './cuentaSegura.js';

// LA SEGURIDAD DE LA PROPIA CUENTA, EN LA APLICACIÓN DE LOS CLIENTES.
//
// Son las mismas rutas que usa el Panel —verificar el número, cambiarlo, reconocer el equipo y
// cerrar todas las sesiones—, con la comprobación de sesión de los Clientes. Valen para el titular
// y para cada persona autorizada por igual: cada una cuida su propia cuenta. La contraseña propia
// no pasa por acá: la aplicación ya la cambia por su propio camino.
export const appClientesCuentaSeguraRouter = rutasDeLaCuentaSegura({
  requiereSesion: requiereRolCliente,
  quienPide: (req) => req.usuarioCliente,
});
