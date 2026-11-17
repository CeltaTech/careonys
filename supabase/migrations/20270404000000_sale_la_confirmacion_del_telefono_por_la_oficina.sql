-- Sale la confirmación del número de teléfono por la oficina.
--
-- Qué hace: borra la tabla donde quedaba anotado que alguien de la Prestadora había confirmado el
-- número de una cuenta.
--
-- Por qué: un número verificado con su código de verificación ya sirve de llave por sí solo, igual
-- que en cualquier software corriente. Nadie de la oficina tiene que llamar ni confirmar nada.
--
-- Qué se comprobó antes de borrar: en la base en vivo la tabla tenía tres filas, las tres de la
-- Prestadora de prueba, con datos inventados. Ninguna función ni vista la nombra. Su disparador
-- usa una función que comparte con la habilitación del cambio de contraseña, y esa función queda:
-- borrar la tabla sólo se lleva el disparador de esta tabla.
--
-- Qué no se toca: los tres renglones del registro de actividad que anotaron esas confirmaciones, y
-- la acción en el catálogo de acciones registradas que ellos citan. Lo que pasó queda como pasó.
--
-- Cómo se vuelve atrás: con otra migración que vuelva a crear la tabla con su protección por fila,
-- sus políticas y sus permisos, tal como estaban en la foto de la base.

BEGIN;

DROP TABLE public.telefonos_confirmados_por_la_prestadora;

COMMIT;

NOTIFY pgrst, 'reload schema';
