-- Salen los dos casilleros de texto libre que ya tienen su catálogo.
--
-- · asistentes.especialidades: las Especialidades son ahora un catálogo por tipo de Asistente
--   y se anotan en especialidades_asistente.
-- · indicaciones_medicacion.via_administracion: la vía se guarda como cuál del catálogo, en
--   via_administracion_id, que pasa a ser obligatoria.
--
-- La vista de quien coordina lista la columna vieja, así que se rehace sin ella, con las
-- mismas opciones, el mismo comentario y los mismos permisos.

begin;

drop view public.asistentes_coordinador;

alter table public.asistentes drop column especialidades;

create view public.asistentes_coordinador
  with (security_invoker = true) as
select id, nombre, telefono, email, foto_url, disponibilidad, estado, qr_token, fecha_alta,
       created_at, updated_at, deleted_at, dni, tipo_asistente_id, numero_legajo,
       documento_tipo, documento_numero, documento_pais, genero
  from public.asistentes;

comment on view public.asistentes_coordinador is
  'Lo que quien coordina ve de una Asistente: sin vinculo laboral y sin remuneraciones.';

revoke all on public.asistentes_coordinador from public, anon;
grant all on public.asistentes_coordinador to authenticated, service_role;

alter table public.indicaciones_medicacion drop column via_administracion;
alter table public.indicaciones_medicacion alter column via_administracion_id set not null;

commit;

NOTIFY pgrst, 'reload schema';
