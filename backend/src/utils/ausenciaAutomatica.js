import { enLaPrestadora } from '../db/connection.js';
import { marcarAusenteYCrearIncidente } from './marcarAusente.js';
import { exigirLaPrestadora } from './prestadoraCertificada.js';

// Detección automática de ausencia (pendiente #20 de docs/PLAN_HASTA_PRODUCCION.md, diseñado con el
// Desarrollador el 2026-07-12): reemplaza al botón manual "marcar ausente" de
// TurnoGuardiaAcciones.jsx como mecanismo principal — el botón queda como excepción/override
// para casos que este proceso no haya detectado solo. Corre cada pocos minutos (ver
// server.js) porque, a diferencia de revisarVencimientos (una vez por día alcanza), acá el
// margen de tolerancia se mide en minutos.
//
// Trabaja en una sola Prestadora, la que le pasa `programar` en server.js, con la credencial del
// trabajo de esa Prestadora, que la base acota a ella. Si la Prestadora no la tiene encendida, no
// hace nada.
export async function revisarAusenciasAutomaticas(prestadoraId, ahora = new Date()) {
  exigirLaPrestadora(prestadoraId, 'revisarAusenciasAutomaticas');
  await revisarLasAusenciasDeUnaPrestadora(prestadoraId, ahora);
}

/** Lo de una sola Prestadora, con la credencial del trabajo de esa Prestadora. */
export function revisarLasAusenciasDeUnaPrestadora(prestadoraId, ahora) {
  return enLaPrestadora(prestadoraId, 'revisar las ausencias automáticas', async (db) => {
    const { data: config, error: errorConfig } = await db
      .from('configuracion_ausencia_automatica')
      .select('minutos_tolerancia_checkin')
      .eq('prestadora_id', prestadoraId)
      .eq('activo', true)
      .maybeSingle();

    if (errorConfig) {
      console.error(`Error consultando configuracion_ausencia_automatica (prestadora ${prestadoraId}):`, errorConfig.message);
      return;
    }
    // La Prestadora no la tiene encendida: no se marca a nadie.
    if (!config) return;
    const minutosTolerancia = config.minutos_tolerancia_checkin;

    // `.not('asistente_id', 'is', null)` no es un detalle: un turno de guardia sin cubrir también
    // llega a su hora sin que nadie marque llegada, pero eso no es una ausencia — no hay
    // nadie que haya faltado. Sin este filtro, cada hueco de la agenda se marcaría como
    // "Ausente sin relevo previo", que es la alerta más grave del sistema, contra nadie.
    const { data: turnos_guardia, error: errorTurnosGuardia } = await db
      .from('turnos_guardia')
      .select('id, paciente_id, fecha, hora_inicio')
      .eq('prestadora_id', prestadoraId)
      .eq('estado', 'programada')
      .not('asistente_id', 'is', null)
      .is('checkin_at', null);

    if (errorTurnosGuardia) {
      console.error(`Error consultando guardias vencidas (prestadora ${prestadoraId}):`, errorTurnosGuardia.message);
      return;
    }

    for (const turno_guardia of turnos_guardia ?? []) {
      const inicioEsperado = new Date(`${turno_guardia.fecha}T${turno_guardia.hora_inicio}`);
      const limiteAusencia = new Date(inicioEsperado.getTime() + minutosTolerancia * 60_000);
      if (ahora < limiteAusencia) continue;

      // Marcar la ausencia y abrir el incidente lo hace `utils/marcarAusente.js`, que es el
      // mismo que usa el botón del Panel. Acá queda sólo la decisión de *cuándo* — el reloj y la
      // tolerancia configurada—, que es lo propio de la detección automática.
      const resultado = await marcarAusenteYCrearIncidente({ db, turno_guardia, prestadoraId });
      if (!resultado.ok) {
        console.error(`Error marcando ausente automático (guardia ${turno_guardia.id}):`, resultado.motivo);
      }
    }
  });
}
