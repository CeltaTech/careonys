import { enLaPrestadora } from '../db/connection.js';

// EL INFORME DIARIO DE LOS ACCESOS FUERA DE LO NORMAL.
//
// Una vez por día, de a una Prestadora por vez, se cuentan los accesos a la información de salud
// del día anterior que salen de lo normal —fuera del horario, sin relación con el paciente o con
// demasiados pacientes en el día— y la cantidad queda anotada en el registro de actividad. La base
// hace todo (`informar_accesos_fuera_de_lo_normal_del_dia_anterior`): el día anterior se cuenta en
// la zona horaria de la Prestadora, y si ese día ya quedó anotado no se anota dos veces. Acá sólo
// se la llama, con la credencial del trabajo de esa Prestadora: la base no deja llamarla a nadie más.
//
// Una vuelta que falla no se cae ni deja nada a medias: el día queda sin informe y la administración
// lo ve igual en la revisión del período.
export async function informarLosAccesosFueraDeLoNormal(prestadoraId) {
  if (!prestadoraId) return { informe: null };

  const { data, error } = await enLaPrestadora(prestadoraId, 'revisión del registro de accesos', (db) =>
    db.rpc('informar_accesos_fuera_de_lo_normal_del_dia_anterior'));

  if (error) {
    console.error(`No se pudo informar los accesos fuera de lo normal (prestadora ${prestadoraId}):`, error.message);
    return { informe: null };
  }
  const fila = Array.isArray(data) ? data[0] : data;
  return { informe: fila ?? null };
}
