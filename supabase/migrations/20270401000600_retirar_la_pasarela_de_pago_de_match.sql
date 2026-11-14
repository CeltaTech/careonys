-- =============================================================================
-- Retirar la pasarela de pago de Match
-- =============================================================================
--
-- QUÉ HACE
--   En Match la compra de un acceso la cobra el software de pagos, en su propia
--   ventana, y le informa a Careonys con un aviso firmado. Careonys no cobra, no
--   factura, no gestiona la mora y no decide restricciones. El código que se
--   conectaba a las pasarelas ya salió del producto y está en el estante
--   (Codigos-utiles/pasarela-de-pago-de-match/, con su esquema.sql). Esto saca
--   de la base lo que sólo usaba ese código:
--   1. Las cuatro funciones de la caja fuerte de la base que guardaban y leían el
--      dato de acceso y el secreto de firma de cada pasarela.
--   2. Los secretos de `vault` a los que apuntaba la tabla de las pasarelas, y la
--      tabla. Sin la tabla nadie vuelve a encontrarlos.
--   3. `prestadora_pasarela_pago`: qué pasarelas tenía conectadas cada
--      Prestadora, con sus políticas y su índice.
--   4. `configuracion_cobro_intermediacion`: los plazos del cobro (días de aviso,
--      de gracia y de vida del cupón), con sus políticas.
--      `sembrar_configuracion_prestadora` recorre las tablas `configuracion_*`
--      sin nombrarlas, así que no hay que tocarla: deja de sembrar ésta sola.
--   5. De `accesos_intermediacion`: `proveedor`, `referencia_externa`,
--      `url_accion`, `alta_en_pasarela`, `aviso_previo_en` y `gracia_hasta`, y con
--      ellas los índices `idx_accesos_intermediacion_en_gracia` e
--      `idx_accesos_intermediacion_referencia`.
--   6. De `cobros_intermediacion`: `url_accion`, la dirección del QR de pago de
--      cada período.
--
-- QUÉ QUEDA
--   `cobros_intermediacion` entera salvo `url_accion` —`referencia_externa` la
--   lee el Panel y la va a usar el aviso firmado para no anotar dos veces el
--   mismo pago—, y de `accesos_intermediacion` el importe, la moneda, la forma de
--   cobro, `proximo_cobro`, `vigente_hasta`, `gratis_hasta`, `cancelada_en` y el
--   saldo de contactos.
--
-- QUÉ SE COMPROBÓ EN LA BASE EN VIVO (2026-11-13)
--   · 0 accesos de Match y 0 cobros de Match: quitar las columnas no pierde ningún
--     dato.
--   · 2 filas en `configuracion_cobro_intermediacion`: los plazos de fábrica de
--     dos Prestadoras, que nadie lee desde que salió el código.
--   · Ninguna función de `public` ni de `interno`, fuera de las cuatro que se
--     borran, nombra estas tablas o estas columnas, y ninguna vista depende de
--     ellas.
--   · La tabla de los secretos de las pasarelas no se consultó: es de la caja
--     fuerte.
-- =============================================================================

BEGIN;

-- 1. Las funciones de la caja fuerte.
DROP FUNCTION public.guardar_credencial_pasarela_pago(uuid, text, text);
DROP FUNCTION public.guardar_secreto_firma_pasarela_pago(uuid, text, text);
DROP FUNCTION public.leer_credencial_pasarela_pago(uuid, text);
DROP FUNCTION public.leer_secreto_firma_pasarela_pago(uuid, text);

-- 2. Los secretos y la tabla que los señalaba.
DELETE FROM vault.secrets s
USING public.credenciales_pasarela_pago c
WHERE s.id IN (c.credencial_secret_id, c.secreto_firma_secret_id);

DROP TABLE public.credenciales_pasarela_pago;

-- 3. Qué pasarelas tenía conectadas cada Prestadora.
DROP TABLE public.prestadora_pasarela_pago;

-- 4. Los plazos del cobro.
DROP TABLE public.configuracion_cobro_intermediacion;

-- 5. Las columnas del acceso. Los dos índices caen con sus columnas.
ALTER TABLE public.accesos_intermediacion
  DROP COLUMN proveedor,
  DROP COLUMN referencia_externa,
  DROP COLUMN url_accion,
  DROP COLUMN alta_en_pasarela,
  DROP COLUMN aviso_previo_en,
  DROP COLUMN gracia_hasta;

-- 6. La dirección del QR de pago de cada período.
ALTER TABLE public.cobros_intermediacion
  DROP COLUMN url_accion;

COMMIT;

NOTIFY pgrst, 'reload schema';
