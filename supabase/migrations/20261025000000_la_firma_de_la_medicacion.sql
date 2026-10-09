-- =============================================================================================
-- La firma del Cliente sobre la medicación que carga
-- =============================================================================================
--
-- El Cliente firma siempre, con receta o sin ella, salvo que la Prestadora lo haya apagado en su
-- configuración. Firma con la llave de su teléfono o en papel. El texto que firma es el de la
-- Prestadora, o el modelo del producto si ella no escribió ninguno.
--
-- Si hay Asistentes asignados y ninguno puede dar la medicación por esa vía, la indicación sólo
-- se puede rechazar, y el rechazo lleva un motivo fijo.

-- ---------------------------------------------------------------------------------------------
-- 1. El interruptor de la Prestadora
-- ---------------------------------------------------------------------------------------------
-- Sin fila, se pide la firma: el valor de fábrica es el que cierra.

create table public.configuracion_medicacion (
  prestadora_id uuid primary key references public.prestadoras (id) on delete cascade,
  pide_firma_del_cliente boolean not null default true,
  actualizado_por uuid references public.usuarios (id),
  updated_at timestamptz not null default now()
);

alter table public.configuracion_medicacion enable row level security;

create policy configuracion_medicacion_la_lee_su_prestadora
  on public.configuracion_medicacion
  for select to authenticated using (interno.lee_la_configuracion(prestadora_id));
create policy configuracion_medicacion_la_escribe_la_administracion
  on public.configuracion_medicacion
  for all to authenticated
  using (interno.es_la_administracion_de_la_prestadora(prestadora_id))
  with check (interno.es_la_administracion_de_la_prestadora(prestadora_id));

revoke all on public.configuracion_medicacion from public, anon;
grant select, insert, update on public.configuracion_medicacion to authenticated;

create trigger trg_auditoria_acceso
  after insert or update or delete on public.configuracion_medicacion
  for each row execute function fn_auditoria_de_acceso_mutacion();

create function interno.la_prestadora_pide_la_firma_de_la_medicacion(p_prestadora_id uuid)
  returns boolean
  language sql
  stable
  set search_path to 'public', 'interno'
as $$
  select coalesce(
    (select c.pide_firma_del_cliente from public.configuracion_medicacion c
      where c.prestadora_id = p_prestadora_id),
    true
  );
$$;

revoke all on function interno.la_prestadora_pide_la_firma_de_la_medicacion(uuid) from public, anon;
grant execute on function interno.la_prestadora_pide_la_firma_de_la_medicacion(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 2. Sin texto propio se firma el modelo del producto
-- ---------------------------------------------------------------------------------------------

create or replace function interno.la_firma_es_sobre_el_texto_de_la_prestadora()
  returns trigger
  language plpgsql
  set search_path to 'public', 'interno'
as $$
begin
  if tg_op = 'UPDATE' and old.estado = 'cerrado'
     and (new.documento_texto is distinct from old.documento_texto
          or new.documento_huella is distinct from old.documento_huella
          or new.estado is distinct from old.estado) then
    raise exception 'Lo que ya se firmó no se cambia.' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 3. Se acepta con la firma, y la receta no la reemplaza
-- ---------------------------------------------------------------------------------------------

create or replace function interno.la_medicacion_se_acepta_con_orden_o_firma()
  returns trigger
  language plpgsql
  set search_path to 'public', 'interno'
as $$
begin
  if new.estado = 'aceptada'
     and old.estado is distinct from 'aceptada'
     and interno.la_prestadora_pide_la_firma_de_la_medicacion(new.prestadora_id)
     and not exists (
       select 1 from public.consentimientos_medicacion c
        where c.indicacion_id = new.id
          and c.prestadora_id = new.prestadora_id
          and c.estado = 'cerrado'
     ) then
    raise exception 'Falta la firma del Cliente.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 4. El motivo fijo del rechazo
-- ---------------------------------------------------------------------------------------------

alter table public.indicaciones_medicacion
  add column motivo_rechazo_clave text
    check (motivo_rechazo_clave is null or motivo_rechazo_clave in ('ningun_asignado_puede_dar_la_via'));

-- ---------------------------------------------------------------------------------------------
-- 5. La advertencia de la vía sin matrícula deja de existir
-- ---------------------------------------------------------------------------------------------
-- Ahora la vía bloquea: no hay nada que advertir.

delete from public.advertencias_legales
 where jurisdiccion = 'AR' and funcion_clave = 'medicacion_via_sin_matricula';

-- ---------------------------------------------------------------------------------------------
-- 6. La llave del teléfono también firma
-- ---------------------------------------------------------------------------------------------

alter table public.desafios_de_llave drop constraint desafios_de_llave_para_check;
alter table public.desafios_de_llave
  add constraint desafios_de_llave_para_check check (para in ('alta', 'entrada', 'firma'));

alter table public.desafios_de_llave
  add constraint desafios_de_llave_la_firma_sabe_de_quien_es
    check (para <> 'firma' or (prestadora_id is not null and usuario_id is not null));

create policy persona_pide_desafio_de_firma on public.desafios_de_llave
  for insert to authenticated with check (
    prestadora_id = interno.current_tenant()
    and usuario_id = auth.uid()
    and para = 'firma'
    and usado_en is null
    and ((rol = 'asistente' and interno.es_asistente()) or (rol = 'cliente' and interno.es_cliente()))
  );
create policy persona_ve_sus_desafios_de_firma on public.desafios_de_llave
  for select to authenticated using (
    prestadora_id = interno.current_tenant() and usuario_id = auth.uid() and para = 'firma'
  );
create policy persona_gasta_su_desafio_de_firma on public.desafios_de_llave
  for update to authenticated
  using (
    prestadora_id = interno.current_tenant() and usuario_id = auth.uid() and para = 'firma'
    and usado_en is null
  )
  with check (
    prestadora_id = interno.current_tenant() and usuario_id = auth.uid() and para = 'firma'
    and usado_en is not null
  );

-- Al firmar, la persona anota el contador de su propia llave.
create policy persona_usa_su_llave on public.llaves_de_dispositivo
  for update to authenticated
  using (prestadora_id = interno.current_tenant() and usuario_id = auth.uid() and revocada_en is null)
  with check (prestadora_id = interno.current_tenant() and usuario_id = auth.uid() and revocada_en is null);

grant update (contador, ultimo_uso_en) on public.llaves_de_dispositivo to authenticated;

notify pgrst, 'reload schema';
