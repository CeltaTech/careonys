-- Un índice guarda el nombre que tenía la columna el día que se creó, y no sigue el cambio de
-- nombre. Estos cuatro todavía decían «huella»: se rehacen iguales para que digan `verificador`.
-- Mismos nombres, mismas columnas, misma unicidad; ningún dato se toca.
BEGIN;

ALTER TABLE public.equipos_conocidos DROP CONSTRAINT equipos_conocidos_marca_unica;
ALTER TABLE public.equipos_conocidos
  ADD CONSTRAINT equipos_conocidos_marca_unica UNIQUE (usuario_id, marca_verificador);

ALTER TABLE public.telefonos_confirmados_por_la_prestadora DROP CONSTRAINT telefonos_confirmados_uno_por_numero;
ALTER TABLE public.telefonos_confirmados_por_la_prestadora
  ADD CONSTRAINT telefonos_confirmados_uno_por_numero UNIQUE (usuario_id, telefono_verificador);

DROP INDEX public.idx_pedidos_de_clave_por_correo;
CREATE INDEX idx_pedidos_de_clave_por_correo
  ON public.pedidos_de_clave_nueva (prestadora_id, correo_verificador, pedido_en DESC);

DROP INDEX public.idx_pedidos_de_codigo_por_numero;
CREATE INDEX idx_pedidos_de_codigo_por_numero
  ON public.pedidos_de_codigo_al_telefono (telefono_verificador, pedido_en DESC);

COMMIT;

NOTIFY pgrst, 'reload schema';
