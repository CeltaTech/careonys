-- Fase 11 (WhatsApp reforzado para alertas críticas, ver docs/PRD_06_WhatsApp_IA.md) —
-- agrega la configurabilidad por Prestadora de a quién avisar además del Coordinador, y
-- siembra las filas de configuracion_notificaciones que faltaban para las prestadoras
-- reales actuales. Ejecutar una sola vez en el SQL Editor de Supabase.

ALTER TABLE configuracion_notificaciones ADD COLUMN IF NOT EXISTS notificar_cliente BOOLEAN NOT NULL DEFAULT false;

-- Los eventos 'alerta_temprana_guardia' e 'incidente_relevo_sin_resolver' ya existen en el
-- código (revisarNotificacionesCoordinador.js) desde antes, pero nunca tuvieron una fila de
-- configuración sembrada para las prestadoras reales actuales — la siembra original de
-- schema_whatsapp_ia_01.sql usaba el id de una prestadora que ya no existe (borrada en el
-- reset de datos del 2026-07-15, pendiente #38). Sin fila, activo/whatsapp_activo/
-- notificar_cliente quedan en su default (apagados) y el Panel no tiene nada que mostrar.
-- Mismo patrón de siembra que schema_documentos_asistente.sql (sección 7).
INSERT INTO configuracion_notificaciones (evento, prestadora_id, descripcion, emails)
SELECT 'alerta_temprana_guardia', id,
       'Alerta temprana de posible ausencia en una guardia',
       '{}'
FROM prestadoras
ON CONFLICT (evento, prestadora_id) DO NOTHING;

INSERT INTO configuracion_notificaciones (evento, prestadora_id, descripcion, emails)
SELECT 'incidente_relevo_sin_resolver', id,
       'Incidente de continuidad de guardia todavía sin resolver (Ausente sin relevo previo)',
       '{}'
FROM prestadoras
ON CONFLICT (evento, prestadora_id) DO NOTHING;

-- Evento nuevo: los avisos de rutina a la Asistente (guardia asignada, mensaje del
-- coordinador, recordatorio de guardia próxima) hoy van solo por push, sin ningún respaldo
-- si el push falla (ver revisarRecordatoriosPush.js). whatsapp_activo en esta fila habilita
-- el respaldo por WhatsApp cuando el push falla — nunca en paralelo, para no generar costo
-- de mensajería en cada aviso de rutina.
INSERT INTO configuracion_notificaciones (evento, prestadora_id, descripcion, emails)
SELECT 'aviso_rutina_asistente', id,
       'Avisos de rutina a la Asistente (guardia asignada, mensaje del coordinador, recordatorio de guardia próxima)',
       '{}'
FROM prestadoras
ON CONFLICT (evento, prestadora_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
