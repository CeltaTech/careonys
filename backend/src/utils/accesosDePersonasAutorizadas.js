import { clienteDelPedido } from '../db/connection.js';
import { CATALOGO_PERSONAS_AUTORIZADAS, accesosEfectivos } from './catalogoPersonasAutorizadas.js';
import { visibilidadDelPedido } from './visibilidadPrestadora.js';

// Qué le dejaron ver a esta persona de las personas autorizadas. Es la única lectura de
// `permisos_personas_autorizadas` que hace la aplicación de los Clientes, y devuelve siempre las once
// claves resueltas —no las filas crudas—, para que ninguna ruta tenga que acordarse por su cuenta
// del valor de fábrica ni del tope de la Prestadora.
//
// Entra con la conexión que recibe. El filtro va escrito igual: quien llama puede pasar la llave
// maestra, y ahí las políticas de la base no frenan nada.
//
// El titular no se consulta: ve todo, siempre, y esa decisión no se configura.
export async function accesosDeLaPersona({ db, usuarioId, clienteId, esTitular, visibilidad }) {
  if (esTitular) {
    return accesosEfectivos({ esTitular: true, visibilidad });
  }

  // Se pide por el Cliente y por la persona, que es la clave entera de la tabla. Hoy nadie está
  // anotado en dos personas autorizadass —cada persona tiene una sola fila de membresía—, pero preguntar por
  // media clave es de esas cosas que funcionan hasta el día que dejan de funcionar, y ese día
  // devolvería los accesos que otro titular le dio en otra Cliente.
  const { data } = await db
    .from('permisos_personas_autorizadas')
    .select('clave, permitido')
    .eq('cliente_id', clienteId)
    .eq('usuario_id', usuarioId);

  return accesosEfectivos({ esTitular: false, filasGuardadas: data, visibilidad });
}

// Lo mismo, pero contestando una sola vez por pedido: hay rutas que lo necesitan dos veces (para
// cortar el acceso y después para armar la respuesta) y no tiene sentido volver a preguntarle a la
// base en el mismo pedido. Mismo patrón que `visibilidadDelPedido`.
//
// Con la credencial de quien pide: cada persona de las personas autorizadas lee sus propios accesos.
export async function accesosDelPedido(req) {
  if (!req.accesosDePersonasAutorizadas) {
    const visibilidad = await visibilidadDelPedido(req);
    req.accesosDePersonasAutorizadas = await accesosDeLaPersona({
      db: clienteDelPedido(req),
      usuarioId: req.usuarioCliente?.id,
      clienteId: req.usuarioCliente?.clienteId,
      esTitular: req.usuarioCliente?.esTitular === true,
      visibilidad,
    });
  }
  return req.accesosDePersonasAutorizadas;
}

// Corta el pedido cuando el titular no le dio ese acceso a esta persona. Va en la cadena de la
// ruta, después del middleware de sesión y después de `exigeVisible`, que es el tope de la
// Prestadora: primero se pregunta si la función existe en esta aplicación, y recién después si
// esta persona la tiene.
//
// Es el candado del lado del backend. La aplicación ya sabe qué no le dieron y no dibuja la pantalla,
// pero alguien puede llamar a la dirección igual. Sin esto, la instrucción firmada sería una
// decoración.
//
// El motivo viaja aparte del texto porque los dos casos se explican distinto: `no_disponible` es
// «la Prestadora no ofrece esto», y `sin_acceso` es «esto existe, pero a usted no se lo dieron».
// Meterlos en la misma frase deja a la persona buscando un botón que no le van a habilitar nunca.
export function exigeDePersonasAutorizadas(clave) {
  return async (req, res, next) => {
    const accesos = await accesosDelPedido(req);
    if (!accesos[clave]) {
      return res.status(403).json({ error: 'No tiene acceso a esta función', motivo: 'sin_acceso' });
    }
    next();
  };
}

// Deja pasar solamente al titular. Lo usan las tres rutas de la firma: la hoja dice, persona por
// persona, qué se le dio y qué se le negó a cada uno de las personas autorizadas, y eso es del titular. Además es
// él quien firma, así que nadie más tiene por qué pedir el código ni confirmarlo.
//
// Va acá y no repetido ruta por ruta porque es la misma decisión: escrita tres veces, alcanza con
// que alguien agregue una cuarta ruta y se olvide para que un miembro de las personas autorizadas pueda firmar la
// instrucción que le recorta los accesos a él mismo.
export function soloElTitular(req, res, next) {
  if (req.usuarioCliente?.esTitular !== true) {
    return res.status(403).json({ error: 'No tiene acceso a esta función', motivo: 'sin_acceso' });
  }
  next();
}

// Lo que esta Prestadora muestra, recortado por lo que le dieron a esta persona.
//
// Hay accesos de las personas autorizadas que no son una pantalla entera sino una columna adentro de una que sí se
// muestra: la posición del Asistente vive adentro de la guardia, y la medicación de ese día, adentro
// del reporte. Cortar la ruta ahí sería sacarle la guardia entera a quien sí puede ver la agenda.
//
// Los dos topes son la misma decisión —qué de esto se muestra— aplicada uno arriba del otro:
// primero lo que la Prestadora ofrece y encima lo que el titular pidió para esta persona. Como la
// consulta arma sus columnas con `columnasSegunVisibilidad`, alcanza con darle esto en lugar de la
// visibilidad cruda y la columna negada ni siquiera sale de la base.
//
// Sólo se recortan las claves del catálogo que tienen interruptor, que son justamente las que se
// corresponden con una columna. Las otras —los reportes, la agenda, la ficha, las internaciones—
// son la consulta entera, y las corta `exigeDePersonasAutorizadas` en la puerta de la ruta.
//
// Ojo con confundirla con la visibilidad cruda: la que viaja en `/perfil` para que la aplicación
// dibuje el menú es la de la Prestadora, y los accesos van al lado, aparte. Son dos respuestas
// distintas a dos preguntas distintas.
export async function visibilidadDeLaPersona(req) {
  if (!req.visibilidadRecortada) {
    const visibilidad = await visibilidadDelPedido(req);

    if (req.usuarioCliente?.esTitular) {
      req.visibilidadRecortada = visibilidad;
    } else {
      const accesos = await accesosDelPedido(req);
      const recortada = { ...visibilidad };
      for (const cosa of CATALOGO_PERSONAS_AUTORIZADAS) {
        if (cosa.interruptor && accesos[cosa.clave] === false) {
          recortada[cosa.interruptor] = false;
        }
      }
      req.visibilidadRecortada = recortada;
    }
  }
  return req.visibilidadRecortada;
}
