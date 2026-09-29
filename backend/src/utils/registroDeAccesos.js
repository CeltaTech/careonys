import { supabase } from '../db/connection.js';

// EL PUNTO UNICO DE VERDAD PARA ANOTAR QUIEN LEYO UN DATO DE SALUD.
//
// Cada lectura de un dato de salud deja un renglon en `accesos_a_datos_de_salud`: la Prestadora,
// la persona que accedio, el paciente, las categorias de dato alcanzadas, el momento y el origen.
// La tabla, la cadena de resumenes que demuestra que nadie la altero y quien puede leerla estan en
// `supabase/migrations/20261010600000_quien_vio_cada_dato_de_salud.sql`.
//
// Se escribe desde aca y desde ningun otro lado: si cada ruta armara su renglon, la que se olvide
// una columna es justamente la que nadie va a notar.
//
// LO QUE PONE LA BASE Y NO ESTA FUNCION. El momento, el numero en la cadena y los dos resumenes los
// calcula la base al insertar, y lo que se mande en esas columnas se descarta. Con la credencial de
// una persona, la base ademas saca la Prestadora y la persona de la sesion y rechaza el renglon si
// no coinciden con lo que se mando.
//
// LAS CATEGORIAS son los nombres de las tablas de donde salio lo que se leyo
// (`indicaciones_medicacion`, `pacientes`...). La base rechaza una que no exista.
//
// FALLA CERRADO, Y A LOS GRITOS. Al reves que el registro de actividad, que acompaña al trabajo y
// no lo frena: si no queda anotado quien vio el dato, el dato no se entrega. Por eso se anota antes
// de responder, y si la anotacion falla se lanza un error y la ruta contesta que fallo.

// Por donde llego la lectura: el metodo y la ruta tal como esta declarada
// (`/api/app-asistentes/medicacion/:pacienteId`), no la que vino escrita, para que en el origen no
// quede ningun identificador ni nada de lo que viaje despues del signo de pregunta.
export function origenDelPedido(req) {
  const declarada = req?.route?.path;
  const ruta = typeof declarada === 'string'
    ? `${req.baseUrl ?? ''}${declarada}`
    : String(req?.originalUrl ?? req?.url ?? '').split('?')[0];
  return `${req?.method ?? ''} ${ruta}`.trim();
}

// `quien` es la persona ya comprobada por el middleware —`req.usuarioPanel`,
// `req.usuarioAsistente`...—: trae `id` y `prestadoraId`, y la Prestadora sale de ahi, nunca de lo
// que venga en el pedido.
//
// `cliente` es la conexion con la que se escribe. Mientras el backend entre con la llave maestra
// es la de siempre; cuando cada pedido pase a la credencial de la persona (paso 9 del plan), se
// le pasa la de ese pedido y la base empieza a comprobar la Prestadora y la persona por su cuenta.
export async function anotarAccesoADatosDeSalud(quien, { pacienteId, categorias, origen }, { cliente = supabase } = {}) {
  const lista = Array.isArray(categorias) ? categorias.filter(Boolean) : [];
  const origenLimpio = String(origen ?? '').split('?')[0].trim();

  if (!quien?.id || !quien?.prestadoraId || !pacienteId || lista.length === 0 || !origenLimpio) {
    throw new Error('No se pudo anotar el acceso a datos de salud: faltan datos para identificarlo');
  }

  const { error } = await cliente.from('accesos_a_datos_de_salud').insert({
    prestadora_id: quien.prestadoraId,
    usuario_id: quien.id,
    paciente_id: pacienteId,
    categorias: lista,
    origen: origenLimpio,
  });

  if (error) {
    // El texto crudo de la base se queda aca: afuera sale el error generico de la ruta.
    console.error('Error anotando el acceso a datos de salud:', error.message);
    throw new Error('No se pudo anotar el acceso a datos de salud');
  }
}
