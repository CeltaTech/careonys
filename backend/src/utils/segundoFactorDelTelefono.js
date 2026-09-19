import { hayViaDeTelefono } from './codigoAlTelefono.js';
import { telefonoConfirmadoPorLaPrestadora } from './habilitarCambioDeClave.js';

// CUÁNDO UN NÚMERO SIRVE DE LLAVE.
//
// Tener el número verificado no alcanza por sí solo, y el caso que lo muestra es el de siempre:
// alguien se queda con la cuenta abierta un rato, cambia el número por el suyo, lo verifica con el
// código que le llega a él, y desde ese momento la recuperación de la clave le pertenece. Verificar
// prueba que el número funciona y que quien lo cargó lo tiene a mano; no prueba que sea de esa
// persona.
//
// LO ÚNICO QUE CONVIERTE UN NÚMERO EN LLAVE ES QUE ALGUIEN LO HABILITE. Una persona de la
// Prestadora llama, reconoce a quien atiende del otro lado y recién ahí confirma que ese número es
// de esa persona. Mientras tanto, el número está cargado y no sirve para recuperar la clave.
//
// NO HAY ESPERA POR TIEMPO, Y NO LA HUBO NUNCA DE VERDAD: la que había valía cero horas mientras
// nadie fijara otra cosa, así que cualquier número verificado quedaba habilitado solo. Una espera
// que se cumple sola es una habilitación automática con otro nombre, y acá la habilitación la hace
// una persona. Tampoco hay vencimiento: un número habilitado sigue habilitado hasta que se cambie,
// y el que se cambia vuelve a empezar, porque lo confirmado es el número y no la cuenta.
//
// A NADIE SE LE SACA NADA. Entrar sigue siendo con el correo y la clave, y recuperar la clave por
// correo sigue andando igual. Lo único que el número sin habilitar no hace es pedir un segundo
// código.

/**
 * ¿A esta cuenta se le puede pedir el código del teléfono?
 *
 * Son cuatro condiciones y todas tienen que darse: que haya número, que esté verificado, que la
 * Prestadora tenga por dónde mandarlo, y que alguien lo haya habilitado.
 *
 * `cuenta` necesita `id`, `prestadora_id`, `telefono` y `telefono_verificado_en`.
 */
export async function elTelefonoSirveDeSegundoFactor(cuenta) {
  if (!cuenta?.telefono || !cuenta?.telefono_verificado_en) return false;
  if (!(await hayViaDeTelefono(cuenta.prestadora_id))) return false;
  return telefonoConfirmadoPorLaPrestadora({ usuarioId: cuenta.id, telefono: cuenta.telefono });
}
