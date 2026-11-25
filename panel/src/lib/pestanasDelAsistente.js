// ---------------------------------------------------------------------------
// pestanasDelAsistente.js — qué pestañas tiene el Legajo del Asistente, y quién ve cuáles
//
// Está afuera de la pantalla por dos motivos. Uno: son datos, no dibujo — la lista de qué se
// muestra y el orden en que se muestra no cambia según cómo esté hecho el Legajo del Asistente. El otro: acá
// se puede comprobar que ninguna pestaña quedó sin nombre en alguno de los tres idiomas, que es
// el error que aparece cuando se agrega una y se traduce después.
//
// Por qué el Coordinador ve menos: lo que cobra cada persona vive en
// tablas aparte, donde la base exige el permiso correspondiente para contestar. Esta lista no
// es el candado —el candado es la base—, es no ofrecerle una pestaña que le va a contestar que
// no. Lo operativo lo ve todo: la protección por fila de su zona ya decide qué filas alcanza.
//
// Las calificaciones se ven en las dos modalidades: el Cliente califica al Asistente que lo
// atendió, sea de prestación directa o de Match.
// ---------------------------------------------------------------------------

export const PESTANAS = [
  'perfil',
  'verificacion',
  'certificado',
  'datos_bancarios',
  'turnos_guardia',
  'evaluaciones',
  'ausencias',
  'comunicacion',
];

export const PESTANAS_COORDINADOR = [
  'perfil',
  'verificacion',
  'certificado',
  'datos_bancarios',
  'turnos_guardia',
  'evaluaciones',
  'ausencias',
  'comunicacion',
];

/**
 * Las que además dependen de una acción que la Prestadora puede reservar. Dónde cobra un
 * Asistente nace reservado a la administración, pero la Prestadora puede habilitárselo a quien
 * coordina, así que no alcanza con preguntar el rol. El candado de verdad está en el backend y en
 * las reglas de acceso de la base; esto es no ofrecer una pestaña que va a contestar que no.
 */
export const PESTANAS_POR_PERMISO = {
  datos_bancarios: 'ver_datos_bancarios_asistente',
};

/**
 * Las que se le muestran a quien está mirando.
 *
 * Recibe un objeto y no valores sueltos: una bandera y una función seguidas en la llamada se
 * leen mal sin que nada avise.
 *
 * `puede` es la de los permisos efectivos de la sesión. Si no viene ninguna, se contesta que no:
 * un permiso que no se pudo resolver no es un permiso concedido.
 */
export function pestanasDe({ esAdmin, puede = () => false }) {
  const todas = esAdmin ? PESTANAS : PESTANAS_COORDINADOR;
  return todas.filter((pestana) => {
    const permiso = PESTANAS_POR_PERMISO[pestana];
    if (permiso) return esAdmin || puede(permiso);
    return true;
  });
}
