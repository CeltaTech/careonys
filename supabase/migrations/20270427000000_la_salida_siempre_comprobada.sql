-- La salida del turno de guardia queda siempre comprobada, y se va la marca de cierre trabado.
--
-- Qué hace:
--   - Borra de los turnos de guardia la marca que trababa el cierre y los tres datos de la
--     excepción que lo destrababa: el motivo, quién la autorizó y cuándo. Con ellos se van la regla
--     que exigía la excepción cuando la marca estaba puesta y el enlace con quien la autorizó.
--   - Agrega a las comprobaciones de presencia una regla: una salida no puede quedar sin
--     comprobar. La llegada sigue pudiendo quedar sin comprobar, con su motivo. La salida se
--     comprueba con el código QR o con la autorización del Coordinador.
--
-- Qué se comprobó en la base en vivo antes de escribirla:
--   - ningún turno de guardia tiene la marca de cierre trabado puesta;
--   - ninguna salida quedó sin comprobar, así que la regla nueva no choca con ningún dato;
--   - ninguna vista, función, política ni disparador usa esos cuatro datos: sólo dependen de ellos
--     el valor por omisión de la marca, la regla de la excepción y el enlace con quien la autorizó;
--   - ninguna función de la base registra una comprobación sin comprobar.

ALTER TABLE public.turnos_guardia
  DROP CONSTRAINT IF EXISTS turnos_guardia_checkout_bloqueado_requiere_excepcion;

-- La clave foránea hacia quien autorizó la excepción cae sola con su columna.
ALTER TABLE public.turnos_guardia
  DROP COLUMN checkout_bloqueado,
  DROP COLUMN checkout_excepcion_motivo,
  DROP COLUMN checkout_excepcion_autorizado_por,
  DROP COLUMN checkout_excepcion_at;

ALTER TABLE public.turno_guardia_comprobaciones
  ADD CONSTRAINT turno_guardia_comprobaciones_salida_comprobada_check
  CHECK (NOT (momento = 'checkout' AND estado = 'sin_comprobar'));

NOTIFY pgrst, 'reload schema';
