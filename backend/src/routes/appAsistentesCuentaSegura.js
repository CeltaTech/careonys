import { requiereRolAsistente } from '../middleware/requiereRolAsistente.js';
import { rutasDeLaCuentaSegura } from './cuentaSegura.js';

// LA SEGURIDAD DE LA PROPIA CUENTA, EN LA APLICACIÓN DE LOS ASISTENTES.
//
// Son las mismas rutas que usa el Panel —verificar el número, cambiarlo, reconocer el equipo y
// cerrar todas las sesiones—, con la comprobación de sesión de los Asistentes. La contraseña
// propia no pasa por acá: la aplicación ya la cambia por su propio camino.
export const appAsistentesCuentaSeguraRouter = rutasDeLaCuentaSegura({
  requiereSesion: requiereRolAsistente,
  quienPide: (req) => req.usuarioAsistente,
});
