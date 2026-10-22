import { enLaPrestadora } from '../db/connection.js';
import { notificarCoordinador } from './whatsapp.js';
import { mensajeDelSistema } from '../i18n/avisos.js';
import { idiomaDeLaPrestadora } from '../i18n/idiomaDeLaPrestadora.js';

// EL PLAZO PARA ACEPTAR LA UBICACIÓN DURANTE EL TURNO.
//
// Cuando la Prestadora pasa de «Sólo viaje» a «Viaje y turno», la base anota el día del cambio
// (`prestadoras.control_de_ubicacion_en_el_turno_desde`), y cada Asistente tiene los días que ella
// configuró para aceptar el texto nuevo. Al revés no corre ningún plazo: lo aceptado para «Viaje y
// turno» cubre «Sólo viaje».
//
// A quien deja vencer el plazo sin aceptar no se le hace nada: se le avisa a la Prestadora y ella
// decide. Un aviso por Asistente y por cambio, anotado en `plazos_de_ubicacion_avisados`.
//
// El plazo corre desde el cambio, o desde el alta del Asistente si llegó después: quien entra
// hoy tiene los mismos días que tuvieron los demás.
//
// Corre de a una Prestadora por vez (`server.js`), con la credencial del trabajo de esa Prestadora.
//
// @returns {Promise<{ avisados: number }>} Lo usa la prueba; la tarea programada no mira el número.
export async function avisarLosPlazosDeUbicacionVencidos(prestadoraId, ahora = new Date()) {
  if (!prestadoraId) return { avisados: 0 };
  const TRABAJO = 'plazo para aceptar la ubicación';

  const { data: prestadora, error } = await enLaPrestadora(prestadoraId, TRABAJO, (db) => db
    .from('prestadoras')
    .select('control_de_ubicacion_en_el_turno, control_de_ubicacion_en_el_turno_desde, dias_para_aceptar_la_ubicacion')
    .eq('id', prestadoraId)
    .maybeSingle());
  if (error) throw new Error(error.message);
  if (prestadora?.control_de_ubicacion_en_el_turno !== true || !prestadora.control_de_ubicacion_en_el_turno_desde) {
    return { avisados: 0 };
  }
  const desde = prestadora.control_de_ubicacion_en_el_turno_desde;
  const dias = prestadora.dias_para_aceptar_la_ubicacion;
  const plazoMs = dias * 24 * 60 * 60 * 1000;

  const { data: asistentes, error: errorAsistentes } = await enLaPrestadora(prestadoraId, TRABAJO, (db) => db
    .from('asistentes')
    .select('id, nombre, created_at')
    .eq('prestadora_id', prestadoraId)
    .eq('estado', 'activo'));
  if (errorAsistentes) throw new Error(errorAsistentes.message);

  const vencidos = (asistentes ?? []).filter((a) => {
    const inicio = Math.max(new Date(desde).getTime(), new Date(a.created_at).getTime());
    return inicio + plazoMs <= ahora.getTime();
  });
  if (!vencidos.length) return { avisados: 0 };

  const { data: aceptados, error: errorAceptados } = await enLaPrestadora(prestadoraId, TRABAJO, (db) => db
    .from('consentimientos_asistente')
    .select('asistente_id, textos_consentimiento!inner(control_de_ubicacion_en_el_turno, es_borrador, vigente_hasta)')
    .eq('prestadora_id', prestadoraId)
    .eq('clave', 'seguimiento_ubicacion')
    .eq('decision', 'otorgado')
    .is('retirado_at', null)
    .in('asistente_id', vencidos.map((a) => a.id))
    .eq('textos_consentimiento.control_de_ubicacion_en_el_turno', true)
    .eq('textos_consentimiento.es_borrador', false)
    .is('textos_consentimiento.vigente_hasta', null));
  if (errorAceptados) throw new Error(errorAceptados.message);
  const yaAceptaron = new Set((aceptados ?? []).map((c) => c.asistente_id));

  const sinAceptar = vencidos.filter((a) => !yaAceptaron.has(a.id));
  if (!sinAceptar.length) return { avisados: 0 };

  const idioma = await enLaPrestadora(prestadoraId, TRABAJO, (db) => idiomaDeLaPrestadora(db, prestadoraId));

  let avisados = 0;
  for (const asistente of sinAceptar) {
    // Se anota antes de avisar: dos vueltas encimadas no mandan el mismo aviso dos veces, porque la
    // segunda choca con la anotación de la primera y no recibe ninguna fila.
    const { data: anotado, error: errorAnotado } = await enLaPrestadora(prestadoraId, TRABAJO, (db) => db
      .from('plazos_de_ubicacion_avisados')
      .upsert(
        { prestadora_id: prestadoraId, asistente_id: asistente.id, control_en_el_turno_desde: desde },
        { onConflict: 'asistente_id,control_en_el_turno_desde', ignoreDuplicates: true },
      )
      .select('id'));
    if (errorAnotado) {
      console.error(`${TRABAJO}: no se pudo anotar el aviso:`, errorAnotado.message);
      continue;
    }
    if (!anotado?.length) continue;

    await notificarCoordinador({
      evento: 'plazo_ubicacion_sin_aceptar',
      prestadoraId,
      ...mensajeDelSistema('plazo_ubicacion_sin_aceptar', idioma, { nombre: asistente.nombre || undefined, dias }),
    });
    avisados += 1;
  }
  return { avisados };
}
