// El cierre de un turno de guardia empezado. Es el único camino, y lo usan las cinco formas de
// cerrar:
//
//   1. el relevo lee el código QR del Asistente que sale (`salidaSinReporte.js`);
//   2. el Asistente que sale lee el código QR del Cliente o de otro Asistente (`/checkout`);
//   3. alguien del Panel autoriza la salida, o la llegada del relevo (`comprobacionDePresencia.js`);
//   4. alguien del Panel cierra el turno con un motivo y una hora (`panelTurnosGuardia.js`);
//   5. quien coordina el Servicio permite que el Paciente quede solo (`panelTurnosGuardia.js`).
//
// Ninguna se traba por el Reporte Diario. Si a algún Paciente todavía le queda el suyo al cerrar,
// el turno queda en «Salida sin Reporte Diario»: lo decide `faltaElReporte`, la base anota la
// elección de la Prestadora sobre la factura y la hora del primer aviso, y desde acá sale el aviso
// al Asistente. Después, `revisarRecordatoriosPush.js` le repite el aviso hasta que lo presente.
//
// La escritura la hace la base, en `cerrar_turno_guardia`: valida quién cierra, el motivo y la
// hora, y ninguna sesión puede escribir el cierre en la tabla por fuera de ella.

import { enLaPrestadora } from '../db/connection.js';
import { ErrorConMotivo } from './errorConMotivo.js';
import { faltaElReporte, ESTADO_SALIDA_SIN_REPORTE } from './salidaSinReporte.js';
import { enviarPushAsistente } from './push.js';
import { respaldoWhatsappSiFalla } from './revisarRecordatoriosPush.js';
import { mensajeDelSistema } from '../i18n/avisos.js';
import { idiomaDeLaPrestadora } from '../i18n/idiomaDeLaPrestadora.js';

// Los motivos que puede contestar la base al cerrar. Cualquier otro texto es una falla del sistema.
const MOTIVOS_DE_LA_BASE = [
  'sin_permiso',
  'no_encontrado',
  'turno_guardia_ya_cerrado',
  'falta_el_motivo',
  'motivo_de_salida_inexistente',
  'motivo_de_salida_pide_detalle',
  'hora_de_salida_obligatoria',
  'hora_de_salida_futura',
  'hora_de_salida_anterior_a_la_llegada',
  'hora_de_salida_posterior_al_relevo',
  'reporte_no_coincide',
  'el_cierre_pasa_por_la_funcion',
  'alarma_tomada_por_otra_persona',
];

/** Convierte el error de la base en uno que la pantalla puede explicar. */
export function errorDelCierre(error) {
  const texto = String(error?.message ?? '');
  const motivo = MOTIVOS_DE_LA_BASE.find((m) => texto === m || texto.startsWith(`${m}:`));
  return motivo ? new ErrorConMotivo(motivo, texto) : new Error(texto);
}

/** Los campos del turno de guardia que hacen falta para cerrarlo y avisar. */
export const CAMPOS_PARA_CERRAR = 'id, prestadora_id, asistente_id, paciente_id, fecha, estado, checkout_at, checkin_at';

/**
 * Cierra un turno de guardia. `db` es la conexión con la que se escribe: la de la persona que
 * cierra desde el Panel, o la del trabajo de la Prestadora cuando cierra el Asistente o cuando el
 * cierre lo autorizó alguien del Panel (`cerradaPor`).
 *
 * `turno_guardia` necesita `id`, `prestadora_id`, `asistente_id`, `paciente_id` y `fecha`.
 * Devuelve el estado en que quedó.
 */
export async function cerrarElTurnoGuardia(db, {
  turno_guardia,
  hora,
  motivoId = null,
  detalle = null,
  cerradaPor = null,
  lat = null,
  lng = null,
}) {
  const reporteAtrasado = await reportePendiente(turno_guardia);

  const { data: estado, error } = await db.rpc('cerrar_turno_guardia', {
    p_turno_guardia: turno_guardia.id,
    p_hora: hora,
    p_reporte_atrasado: reporteAtrasado,
    p_motivo: motivoId,
    p_detalle: detalle,
    p_cerrada_por: cerradaPor,
    p_lat: Number.isFinite(lat) ? lat : null,
    p_lng: Number.isFinite(lng) ? lng : null,
  });
  if (error) throw errorDelCierre(error);

  await despuesDelCierre(turno_guardia, estado);
  return estado;
}

/**
 * Lo que sigue a cualquier cierre: si el turno quedó en «Salida sin Reporte Diario», el primer
 * aviso al Asistente. Lo usa también el permiso para que el Paciente quede solo, que cierra el
 * turno adentro de su propia operación.
 */
export async function despuesDelCierre(turno_guardia, estado) {
  if (estado === ESTADO_SALIDA_SIN_REPORTE) await avisarAlSaliente(turno_guardia);
}

/**
 * Si a algún Paciente del turno de guardia todavía le queda el Reporte Diario. Se pregunta con el
 * trabajo de la Prestadora, porque quien coordina puede no alcanzar los reportes, y sólo se
 * pregunta de quién hay reporte, nunca qué dice.
 */
export async function reportePendiente(turno_guardia) {
  return enLaPrestadora(turno_guardia.prestadora_id, 'Reporte pendiente al cerrar un turno de guardia', (dbTrabajo) =>
    faltaElReporte(dbTrabajo, turno_guardia));
}

/** El identificador de un motivo de salida, buscado por su clave en la Prestadora. */
export async function motivoDeSalida(db, prestadoraId, clave) {
  const { data, error } = await db
    .from('motivos_cierre_turno_guardia')
    .select('id')
    .eq('prestadora_id', prestadoraId)
    .eq('clave', clave)
    .eq('activo', true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new ErrorConMotivo('motivo_de_salida_inexistente', `sin motivo ${clave}`);
  return data.id;
}

// El aviso al que salió: su Reporte Diario está pendiente. Si el aviso falla, la salida ya quedó
// cerrada y anotada; el teléfono se lo muestra igual la próxima vez que abra la lista.
async function avisarAlSaliente(turno_guardia) {
  try {
    await enLaPrestadora(turno_guardia.prestadora_id, 'Aviso del Reporte pendiente al cerrar', async (db) => {
      const idioma = await idiomaDeLaPrestadora(db, turno_guardia.prestadora_id);
      const { titulo, cuerpo } = mensajeDelSistema('reporte_pendiente', idioma, { fecha: turno_guardia.fecha }, turno_guardia.prestadora_id);
      const enviadoPorPush = await enviarPushAsistente(turno_guardia.prestadora_id, turno_guardia.asistente_id, {
        titulo,
        cuerpo,
        url: `/turnos-guardia/${turno_guardia.id}`,
      });
      await respaldoWhatsappSiFalla({
        prestadoraId: turno_guardia.prestadora_id,
        asistenteId: turno_guardia.asistente_id,
        enviadoPorPush,
        titulo,
        cuerpo,
      });
    });
  } catch (err) {
    console.error('Error avisando el Reporte pendiente:', err.message);
  }
}
