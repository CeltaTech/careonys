-- =============================================================================
-- Retiro del cobro en efectivo anotado a mano y del código QR de cobro en efectivo
-- =============================================================================
--
-- QUÉ HACE
--   · Borra la política `panel_registra_cobro_efectivo_manual` de
--     `public.cobros_intermediacion`, por la que el Panel anotaba a mano un
--     cobro en efectivo de Match.
--   · Borra la tabla `public.qr_cobro_efectivo`, con sus políticas y su
--     disparador `trg_completar_moneda`.
--   · Borra la función `public.fn_completar_moneda_desde_cliente()`, que sólo
--     usaba ese disparador.
--
-- POR QUÉ
--   En Match el cobro lo hace el software de cobranzas y Careonys sólo muestra
--   lo que él informa. El cobro anotado a mano y el QR para cobrar en efectivo
--   salieron del backend, del Panel y de la aplicación de Clientes; las piezas
--   quedaron en el estante, en
--   `Codigos-utiles/cobro-en-efectivo-anotado-a-mano-y-codigo-qr-de-cobro/`.
--
-- QUÉ SE COMPROBÓ EN LA BASE EN VIVO ANTES DE ESCRIBIRLA
--   · `qr_cobro_efectivo` tiene 0 filas, y ninguna clave foránea la apunta.
--   · `cobros_intermediacion` no tiene ninguna fila con medio `efectivo_manual`.
--   · Ninguna vista nombra `qr_cobro`, y ninguna función nombra
--     `qr_cobro_efectivo` ni `efectivo_manual`.
--   · `fn_completar_moneda_desde_cliente` la usa un solo disparador, el de
--     `qr_cobro_efectivo`.
--   · Ninguna restricción CHECK nombra el efectivo.
--
-- CÓMO SE VUELVE ATRÁS
--   Con otra migración adelante que vuelva a crear la tabla, la función, el
--   disparador y las políticas tal como están en `esquema.sql`, en la carpeta
--   del estante nombrada arriba.
-- =============================================================================

BEGIN;

DROP POLICY IF EXISTS panel_registra_cobro_efectivo_manual ON public.cobros_intermediacion;

DROP TABLE IF EXISTS public.qr_cobro_efectivo;

DROP FUNCTION IF EXISTS public.fn_completar_moneda_desde_cliente();

COMMIT;

NOTIFY pgrst, 'reload schema';
