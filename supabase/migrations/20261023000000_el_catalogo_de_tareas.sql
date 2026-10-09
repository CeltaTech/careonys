-- El catálogo de tareas de cada tipo de Asistente, las vías de la medicación, las Especialidades
-- y la firma de la familia que se hace responsable de una medicación.
--
-- TRES CLASES DE TAREA. Frente a un tipo de Asistente, una tarea está habilitada —viene con el
-- oficio—, no incluida —no viene, pero se puede acordar— o prohibida —la ley se la prohíbe a ese
-- tipo y no se asigna nunca—. Sólo la prohibida bloquea.
--
-- LAS DEL PRODUCTO SON DE UN PAÍS. Lo que trae el producto sale del marco normativo de cada país,
-- así que cada tarea del producto dice de qué país es, y una Prestadora ve las de su país. Las de
-- Argentina salen de la lista que trajo el Desarrollador. Las tareas propias de una Prestadora no
-- tienen país: son suyas.
--
-- UNA PROHIBICIÓN ALCANZA TAREAS Y VÍAS. Una tarea prohibida dice qué otras tareas quedan fuera
-- para ese tipo —«aplicación de inyecciones» alcanza la del enfermero que las aplica— y qué vías de
-- medicación. Una prohibición general alcanza todo su campo.
--
-- EN UN SERVICIO, CADA TAREA ACORDADA DICE QUÉ TIPO LA HACE. Así un Servicio con cuidador y
-- enfermero puede tener las tareas de los dos, y el bloqueo mira sólo al tipo que la va a hacer.
-- El tipo que sólo recibe sus propias tareas lo dice en su renglón.
--
-- LA VÍA DE LA MEDICACIÓN SALE DE UNA LISTA CERRADA. Todas las formas por boca son una sola vía.
--
-- UNA MEDICACIÓN SE ACEPTA CON LA ORDEN MÉDICA O CON LA FIRMA DE LA FAMILIA. La firma usa el mismo
-- molde que el consentimiento del Pagador: el texto lo escribe la Prestadora, y se guarda copia
-- congelada de lo firmado. Si la Prestadora no escribió texto, no hay nada que firmar y sólo vale
-- la orden médica.
--
-- LA ESPECIALIDAD ES UN CATÁLOGO por tipo y por Prestadora, y puede exigir matrícula. Lo escrito a
-- mano hasta hoy pasa al catálogo; la columna vieja se borra cuando el código deje de leerla.
--
-- Los Asistentes de hoy son ficticios. Los que no tenían tipo reciben uno según lo que decían sus
-- especialidades.

-- ---------------------------------------------------------------------------------------------
-- 1. El país de la Organización
-- ---------------------------------------------------------------------------------------------

create function interno.pais_de_la_organizacion()
  returns text
  language sql
  stable
  security definer
  set search_path to 'public', 'interno'
as $$
  select p.pais from public.prestadoras p where p.id = interno.current_tenant();
$$;

revoke all on function interno.pais_de_la_organizacion() from public, anon;
grant execute on function interno.pais_de_la_organizacion() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 2. Los tipos nuevos
-- ---------------------------------------------------------------------------------------------

alter table public.tipos_asistente
  add column recibe_solo_sus_tareas boolean not null default false;

update public.tipos_asistente
   set recibe_solo_sus_tareas = true
 where prestadora_id is null and clave = 'cuidador';

insert into public.tipos_asistente (clave, requiere_matricula, tipo_matricula, orden) values
  ('acompanante_terapeutico', true, 'acompanamiento_terapeutico', 50),
  ('asistente_personal_discapacidad', false, null, 60);

-- ---------------------------------------------------------------------------------------------
-- 3. Las tres clases y el país de cada tarea
-- ---------------------------------------------------------------------------------------------

alter table public.tareas_tipo_asistente drop constraint tareas_tipo_asistente_clase_valida;
alter table public.tareas_tipo_asistente
  add constraint tareas_tipo_asistente_clase_valida
  check (clase in ('habilitada', 'no_incluida', 'prohibida'));

alter table public.tareas_tipo_asistente
  add column pais text references public.catalogo_paises (codigo),
  add column descripcion text;

alter table public.tareas_tipo_asistente
  add constraint la_tarea_del_producto_es_de_un_pais
  check ((prestadora_id is null) = (pais is not null));

-- Lo del producto se nombra por su clave y se traduce; lo propio se escribe.
alter table public.tareas_tipo_asistente
  add constraint la_descripcion_propia_es_de_la_tarea_propia
  check (prestadora_id is not null or descripcion is null);

create unique index tareas_del_producto_clave_unica
  on public.tareas_tipo_asistente (pais, clave) where prestadora_id is null;

drop policy todos_leen_tareas_tipo_asistente_visibles on public.tareas_tipo_asistente;
create policy todos_leen_tareas_tipo_asistente_visibles on public.tareas_tipo_asistente
  for select using (
    (prestadora_id is null and pais = interno.pais_de_la_organizacion())
    or prestadora_id = interno.current_tenant()
  );

-- ---------------------------------------------------------------------------------------------
-- 4. Las vías de la medicación
-- ---------------------------------------------------------------------------------------------

create table public.vias_administracion (
  id uuid primary key default gen_random_uuid(),
  clave text not null unique,
  invasiva boolean not null default false,
  orden int not null
);

alter table public.vias_administracion enable row level security;

create policy vias_administracion_las_lee_quien_tiene_sesion on public.vias_administracion
  for select to authenticated using (true);

create policy superadmin_gestiona_vias_administracion on public.vias_administracion
  for all to authenticated using (interno.es_superadmin()) with check (interno.es_superadmin());

revoke all on public.vias_administracion from public, anon;
grant select on public.vias_administracion to authenticated;
grant insert, update, delete on public.vias_administracion to authenticated;

insert into public.vias_administracion (clave, invasiva, orden) values
  ('oral',          false,  10),
  ('topica',        false,  20),
  ('oftalmica',     false,  30),
  ('otica',         false,  40),
  ('nasal',         false,  50),
  ('inhalatoria',   false,  60),
  ('transdermica',  false,  70),
  ('rectal',        false,  80),
  ('vaginal',       false,  90),
  ('por_sonda',     false, 100),
  ('subcutanea',    true,  110),
  ('intramuscular', true,  120),
  ('endovenosa',    true,  130);

alter table public.indicaciones_medicacion
  add column via_administracion_id uuid references public.vias_administracion (id);

-- ---------------------------------------------------------------------------------------------
-- 5. Qué alcanza cada prohibición
-- ---------------------------------------------------------------------------------------------

create table public.tareas_que_alcanza_la_prohibicion (
  id uuid primary key default gen_random_uuid(),
  prestadora_id uuid references public.prestadoras (id) on delete cascade,
  prohibicion_id uuid not null references public.tareas_tipo_asistente (id) on delete cascade,
  tarea_id uuid not null references public.tareas_tipo_asistente (id) on delete cascade,
  unique (prohibicion_id, tarea_id)
);

create index idx_tareas_que_alcanza_la_prohibicion_tarea
  on public.tareas_que_alcanza_la_prohibicion (tarea_id);
create index idx_tareas_que_alcanza_la_prohibicion_prestadora
  on public.tareas_que_alcanza_la_prohibicion (prestadora_id);

create table public.vias_que_alcanza_la_prohibicion (
  id uuid primary key default gen_random_uuid(),
  prestadora_id uuid references public.prestadoras (id) on delete cascade,
  prohibicion_id uuid not null references public.tareas_tipo_asistente (id) on delete cascade,
  via_administracion_id uuid not null references public.vias_administracion (id) on delete cascade,
  unique (prohibicion_id, via_administracion_id)
);

create index idx_vias_que_alcanza_la_prohibicion_prestadora
  on public.vias_que_alcanza_la_prohibicion (prestadora_id);

-- Una prohibición del producto alcanza sólo lo del producto de su país; una propia, lo del
-- producto o lo suyo. Y lo que alcanza tiene que ser de verdad una prohibición.
create function interno.la_prohibicion_alcanza_lo_suyo()
  returns trigger
  language plpgsql
  set search_path to 'public', 'interno'
as $$
declare
  la_prohibicion public.tareas_tipo_asistente%rowtype;
  la_tarea public.tareas_tipo_asistente%rowtype;
begin
  select * into la_prohibicion from public.tareas_tipo_asistente where id = new.prohibicion_id;

  if not found or la_prohibicion.clase <> 'prohibida' then
    raise exception 'Sólo una tarea prohibida alcanza otras tareas o vías.' using errcode = 'P0001';
  end if;

  if new.prestadora_id is distinct from la_prohibicion.prestadora_id then
    raise exception 'Lo que alcanza una prohibición es de quien escribió la prohibición.'
      using errcode = 'P0001';
  end if;

  if tg_table_name = 'tareas_que_alcanza_la_prohibicion' then
    select * into la_tarea from public.tareas_tipo_asistente where id = new.tarea_id;

    if not found then
      raise exception 'La tarea no existe o no es de esta Prestadora.' using errcode = 'P0001';
    end if;

    if la_tarea.prestadora_id is null and la_prohibicion.prestadora_id is null
       and la_tarea.pais <> la_prohibicion.pais then
      raise exception 'Una prohibición del producto alcanza sólo tareas de su país.'
        using errcode = 'P0001';
    end if;

    if la_tarea.prestadora_id is not null
       and la_tarea.prestadora_id is distinct from la_prohibicion.prestadora_id then
      raise exception 'Esa tarea es de otra Prestadora.' using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

create trigger la_prohibicion_alcanza_lo_suyo
  before insert or update on public.tareas_que_alcanza_la_prohibicion
  for each row execute function interno.la_prohibicion_alcanza_lo_suyo();

create trigger la_prohibicion_alcanza_lo_suyo
  before insert or update on public.vias_que_alcanza_la_prohibicion
  for each row execute function interno.la_prohibicion_alcanza_lo_suyo();

alter table public.tareas_que_alcanza_la_prohibicion enable row level security;
alter table public.vias_que_alcanza_la_prohibicion enable row level security;

-- Se ve lo que alcanza una prohibición que se ve.
create policy todos_leen_lo_que_alcanza_la_prohibicion on public.tareas_que_alcanza_la_prohibicion
  for select to authenticated using (
    exists (select 1 from public.tareas_tipo_asistente t where t.id = prohibicion_id)
  );
create policy la_administracion_gestiona_lo_que_alcanza_su_prohibicion
  on public.tareas_que_alcanza_la_prohibicion
  for all to authenticated
  using (interno.es_la_administracion_de_la_prestadora(prestadora_id))
  with check (interno.es_la_administracion_de_la_prestadora(prestadora_id));
create policy superadmin_gestiona_lo_que_alcanza_la_prohibicion
  on public.tareas_que_alcanza_la_prohibicion
  for all to authenticated
  using (interno.es_superadmin() and prestadora_id is null)
  with check (interno.es_superadmin() and prestadora_id is null);

create policy todos_leen_las_vias_que_alcanza_la_prohibicion on public.vias_que_alcanza_la_prohibicion
  for select to authenticated using (
    exists (select 1 from public.tareas_tipo_asistente t where t.id = prohibicion_id)
  );
create policy la_administracion_gestiona_las_vias_de_su_prohibicion
  on public.vias_que_alcanza_la_prohibicion
  for all to authenticated
  using (interno.es_la_administracion_de_la_prestadora(prestadora_id))
  with check (interno.es_la_administracion_de_la_prestadora(prestadora_id));
create policy superadmin_gestiona_las_vias_que_alcanza_la_prohibicion
  on public.vias_que_alcanza_la_prohibicion
  for all to authenticated
  using (interno.es_superadmin() and prestadora_id is null)
  with check (interno.es_superadmin() and prestadora_id is null);

revoke all on public.tareas_que_alcanza_la_prohibicion from public, anon;
revoke all on public.vias_que_alcanza_la_prohibicion from public, anon;
grant select, insert, update, delete on public.tareas_que_alcanza_la_prohibicion to authenticated;
grant select, insert, update, delete on public.vias_que_alcanza_la_prohibicion to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 6. Las tareas de Argentina
-- ---------------------------------------------------------------------------------------------

insert into public.tareas_tipo_asistente (tipo_asistente_id, prestadora_id, pais, clase, clave, orden)
select t.id, null, 'AR', l.clase, l.clave, l.orden
  from (values
    -- Cuidador
    ('cuidador', 'habilitada',  'aseo_en_ducha',                               10),
    ('cuidador', 'habilitada',  'higiene_bucal_y_afeitado',                    20),
    ('cuidador', 'habilitada',  'cambio_de_panal_e_higiene_perineal',          30),
    ('cuidador', 'habilitada',  'vestimenta_y_arreglo_personal',               40),
    ('cuidador', 'habilitada',  'asistencia_en_alimentacion_oral',             50),
    ('cuidador', 'habilitada',  'asistencia_en_movilidad_basica',              60),
    ('cuidador', 'habilitada',  'prevencion_basica_de_escaras',                70),
    ('cuidador', 'habilitada',  'medicacion_oral',                             80),
    ('cuidador', 'habilitada',  'orden_y_limpieza_del_entorno_inmediato',      90),
    ('cuidador', 'habilitada',  'acompanamiento_externo',                     100),
    ('cuidador', 'no_incluida', 'limpieza_de_la_vivienda',                    110),
    ('cuidador', 'prohibida',   'curacion_de_heridas_abiertas',               120),
    ('cuidador', 'prohibida',   'aplicacion_de_inyecciones',                  130),
    ('cuidador', 'prohibida',   'sondas_y_cateteres',                         140),
    ('cuidador', 'prohibida',   'alimentacion_por_sonda',                     150),
    ('cuidador', 'prohibida',   'corte_de_unas_en_diabeticos',                160),
    ('cuidador', 'prohibida',   'medicacion_no_oral',                         170),
    -- Enfermero
    ('enfermero', 'habilitada',  'monitoreo_y_registro_biometrico',            10),
    ('enfermero', 'habilitada',  'curacion_de_heridas_complejas',              20),
    ('enfermero', 'habilitada',  'administracion_de_medicamentos_invasivos',   30),
    ('enfermero', 'habilitada',  'manejo_de_dispositivos_y_sondas',            40),
    ('enfermero', 'habilitada',  'alimentacion_enteral_y_parenteral',          50),
    ('enfermero', 'habilitada',  'cuidado_de_ostomias',                        60),
    ('enfermero', 'habilitada',  'aspiracion_de_secreciones_y_traqueostomia',  70),
    ('enfermero', 'habilitada',  'bano_en_cama_paciente_complejo',             80),
    ('enfermero', 'no_incluida', 'cocina_para_el_grupo_familiar',              90),
    ('enfermero', 'no_incluida', 'limpieza_domestica',                        100),
    ('enfermero', 'no_incluida', 'compras_y_tramites_no_medicos',             110),
    -- Acompañante terapéutico
    ('acompanante_terapeutico', 'habilitada',  'contencion_en_crisis_conductuales',      10),
    ('acompanante_terapeutico', 'habilitada',  'ejecucion_del_plan_terapeutico',         20),
    ('acompanante_terapeutico', 'habilitada',  'acompanamiento_a_la_insercion_social',   30),
    ('acompanante_terapeutico', 'habilitada',  'fomento_de_la_autonomia_y_rutina',       40),
    ('acompanante_terapeutico', 'habilitada',  'prevencion_de_situaciones_de_riesgo',    50),
    ('acompanante_terapeutico', 'habilitada',  'registro_de_evolucion_conductual',       60),
    ('acompanante_terapeutico', 'no_incluida', 'tareas_domesticas',                      70),
    ('acompanante_terapeutico', 'no_incluida', 'higiene_corporal_profunda_y_panales',    80),
    ('acompanante_terapeutico', 'no_incluida', 'cuidador_de_reemplazo',                  90),
    ('acompanante_terapeutico', 'prohibida',   'medicacion_invasiva_y_curaciones',      100),
    -- Asistente personal de discapacidad
    ('asistente_personal_discapacidad', 'habilitada', 'transferencias_complejas',                       10),
    ('asistente_personal_discapacidad', 'habilitada', 'higiene_y_desvestido_adaptado',                  20),
    ('asistente_personal_discapacidad', 'habilitada', 'acompanamiento_en_vida_independiente',           30),
    ('asistente_personal_discapacidad', 'habilitada', 'mantenimiento_de_ayudas_tecnicas',               40),
    ('asistente_personal_discapacidad', 'prohibida',  'practicas_clinicas',                             50),
    ('asistente_personal_discapacidad', 'prohibida',  'acompanamiento_terapeutico_de_patologias_graves', 60)
  ) as l (tipo, clase, clave, orden)
  join public.tipos_asistente t on t.prestadora_id is null and t.clave = l.tipo;

insert into public.tareas_que_alcanza_la_prohibicion (prohibicion_id, tarea_id)
select p.id, t.id
  from (values
    ('curacion_de_heridas_abiertas',     'curacion_de_heridas_complejas'),
    ('aplicacion_de_inyecciones',        'administracion_de_medicamentos_invasivos'),
    ('sondas_y_cateteres',               'manejo_de_dispositivos_y_sondas'),
    ('alimentacion_por_sonda',           'alimentacion_enteral_y_parenteral'),
    ('medicacion_no_oral',               'administracion_de_medicamentos_invasivos'),
    ('medicacion_invasiva_y_curaciones', 'administracion_de_medicamentos_invasivos'),
    ('medicacion_invasiva_y_curaciones', 'curacion_de_heridas_complejas'),
    ('practicas_clinicas',               'monitoreo_y_registro_biometrico'),
    ('practicas_clinicas',               'curacion_de_heridas_complejas'),
    ('practicas_clinicas',               'administracion_de_medicamentos_invasivos'),
    ('practicas_clinicas',               'manejo_de_dispositivos_y_sondas'),
    ('practicas_clinicas',               'alimentacion_enteral_y_parenteral'),
    ('practicas_clinicas',               'cuidado_de_ostomias'),
    ('practicas_clinicas',               'aspiracion_de_secreciones_y_traqueostomia'),
    ('practicas_clinicas',               'bano_en_cama_paciente_complejo'),
    ('acompanamiento_terapeutico_de_patologias_graves', 'contencion_en_crisis_conductuales'),
    ('acompanamiento_terapeutico_de_patologias_graves', 'ejecucion_del_plan_terapeutico'),
    ('acompanamiento_terapeutico_de_patologias_graves', 'acompanamiento_a_la_insercion_social'),
    ('acompanamiento_terapeutico_de_patologias_graves', 'fomento_de_la_autonomia_y_rutina'),
    ('acompanamiento_terapeutico_de_patologias_graves', 'prevencion_de_situaciones_de_riesgo'),
    ('acompanamiento_terapeutico_de_patologias_graves', 'registro_de_evolucion_conductual')
  ) as l (prohibicion, tarea)
  join public.tareas_tipo_asistente p on p.prestadora_id is null and p.pais = 'AR' and p.clave = l.prohibicion
  join public.tareas_tipo_asistente t on t.prestadora_id is null and t.pais = 'AR' and t.clave = l.tarea;

insert into public.vias_que_alcanza_la_prohibicion (prohibicion_id, via_administracion_id)
select p.id, v.id
  from public.tareas_tipo_asistente p
  join public.vias_administracion v on (
       (p.clave = 'medicacion_no_oral' and v.clave <> 'oral')
    or (p.clave in ('aplicacion_de_inyecciones', 'medicacion_invasiva_y_curaciones') and v.invasiva)
    or (p.clave = 'sondas_y_cateteres' and v.clave = 'por_sonda')
    or (p.clave = 'practicas_clinicas' and (v.invasiva or v.clave = 'por_sonda'))
  )
 where p.prestadora_id is null and p.pais = 'AR';

-- ---------------------------------------------------------------------------------------------
-- 7. Las tareas acordadas de cada Servicio
-- ---------------------------------------------------------------------------------------------

create table public.tareas_del_servicio (
  id uuid primary key default gen_random_uuid(),
  prestadora_id uuid not null references public.prestadoras (id) on delete cascade,
  servicio_id uuid not null,
  tarea_id uuid not null references public.tareas_tipo_asistente (id),
  tipo_asistente_id uuid not null references public.tipos_asistente (id),
  created_at timestamptz not null default now(),
  foreign key (servicio_id, prestadora_id) references public.servicios (id, prestadora_id) on delete cascade,
  unique (servicio_id, tarea_id, tipo_asistente_id)
);

create index idx_tareas_del_servicio_prestadora on public.tareas_del_servicio (prestadora_id);
create index idx_tareas_del_servicio_tarea on public.tareas_del_servicio (tarea_id);
create index idx_tareas_del_servicio_tipo on public.tareas_del_servicio (tipo_asistente_id);

create function interno.la_tarea_acordada_no_esta_prohibida()
  returns trigger
  language plpgsql
  set search_path to 'public', 'interno'
as $$
declare
  la_tarea public.tareas_tipo_asistente%rowtype;
  el_tipo public.tipos_asistente%rowtype;
  el_pais text;
begin
  select pais into el_pais from public.prestadoras where id = new.prestadora_id;

  select * into el_tipo from public.tipos_asistente where id = new.tipo_asistente_id;
  if not found
     or (el_tipo.prestadora_id is not null and el_tipo.prestadora_id <> new.prestadora_id) then
    raise exception 'El tipo de Asistente no existe o no es de esta Prestadora.' using errcode = 'P0001';
  end if;

  select * into la_tarea from public.tareas_tipo_asistente where id = new.tarea_id;
  if not found
     or (la_tarea.prestadora_id is null and la_tarea.pais is distinct from el_pais)
     or (la_tarea.prestadora_id is not null and la_tarea.prestadora_id <> new.prestadora_id) then
    raise exception 'La tarea no existe o no es de esta Prestadora.' using errcode = 'P0001';
  end if;

  if la_tarea.clase = 'prohibida' then
    raise exception 'Una prohibición no es una tarea que se acuerde.' using errcode = 'P0001';
  end if;

  if el_tipo.recibe_solo_sus_tareas and la_tarea.tipo_asistente_id <> el_tipo.id then
    raise exception 'Ese tipo de Asistente sólo recibe sus propias tareas.' using errcode = 'P0001';
  end if;

  if exists (
    select 1
      from public.tareas_que_alcanza_la_prohibicion a
      join public.tareas_tipo_asistente p on p.id = a.prohibicion_id
     where a.tarea_id = new.tarea_id
       and p.tipo_asistente_id = new.tipo_asistente_id
       and p.clase = 'prohibida'
       and (p.prestadora_id = new.prestadora_id
            or (p.prestadora_id is null and p.pais = el_pais))
  ) then
    raise exception 'Esa tarea está prohibida para ese tipo de Asistente.' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger la_tarea_acordada_no_esta_prohibida
  before insert or update on public.tareas_del_servicio
  for each row execute function interno.la_tarea_acordada_no_esta_prohibida();

alter table public.tareas_del_servicio enable row level security;

create policy panel_gestiona_tareas_del_servicio on public.tareas_del_servicio
  for all to authenticated
  using (prestadora_id = interno.current_tenant() and interno.es_personal_de_la_prestadora())
  with check (prestadora_id = interno.current_tenant() and interno.es_personal_de_la_prestadora());

create policy cliente_ve_las_tareas_de_sus_servicios on public.tareas_del_servicio
  for select to authenticated using (
    prestadora_id = interno.current_tenant()
    and exists (select 1 from public.servicios s where s.id = servicio_id)
  );

revoke all on public.tareas_del_servicio from public, anon;
grant select, insert, update, delete on public.tareas_del_servicio to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 8. Las agrupaciones de tipos de cada Prestadora
-- ---------------------------------------------------------------------------------------------

create table public.agrupaciones_tipos_asistente (
  id uuid primary key default gen_random_uuid(),
  prestadora_id uuid not null references public.prestadoras (id) on delete cascade,
  nombre text not null check (length(btrim(nombre)) > 0),
  orden int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, prestadora_id)
);

create unique index agrupaciones_tipos_asistente_nombre_unico
  on public.agrupaciones_tipos_asistente (prestadora_id, lower(nombre));

-- Cada tipo, en una sola agrupación por Prestadora.
create table public.tipos_asistente_agrupados (
  prestadora_id uuid not null references public.prestadoras (id) on delete cascade,
  tipo_asistente_id uuid not null references public.tipos_asistente (id) on delete cascade,
  agrupacion_id uuid not null,
  primary key (prestadora_id, tipo_asistente_id),
  foreign key (agrupacion_id, prestadora_id)
    references public.agrupaciones_tipos_asistente (id, prestadora_id) on delete cascade
);

create index idx_tipos_asistente_agrupados_agrupacion on public.tipos_asistente_agrupados (agrupacion_id);
create index idx_tipos_asistente_agrupados_tipo on public.tipos_asistente_agrupados (tipo_asistente_id);

create function interno.el_tipo_agrupado_es_visible()
  returns trigger
  language plpgsql
  set search_path to 'public', 'interno'
as $$
begin
  if not exists (
    select 1 from public.tipos_asistente t
     where t.id = new.tipo_asistente_id
       and (t.prestadora_id is null or t.prestadora_id = new.prestadora_id)
  ) then
    raise exception 'El tipo de Asistente no existe o no es de esta Prestadora.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger el_tipo_agrupado_es_visible
  before insert or update on public.tipos_asistente_agrupados
  for each row execute function interno.el_tipo_agrupado_es_visible();

alter table public.agrupaciones_tipos_asistente enable row level security;
alter table public.tipos_asistente_agrupados enable row level security;

create policy su_prestadora_lee_las_agrupaciones on public.agrupaciones_tipos_asistente
  for select to authenticated using (interno.lee_la_configuracion(prestadora_id));
create policy la_administracion_gestiona_las_agrupaciones on public.agrupaciones_tipos_asistente
  for all to authenticated
  using (interno.es_la_administracion_de_la_prestadora(prestadora_id))
  with check (interno.es_la_administracion_de_la_prestadora(prestadora_id));

create policy su_prestadora_lee_los_tipos_agrupados on public.tipos_asistente_agrupados
  for select to authenticated using (interno.lee_la_configuracion(prestadora_id));
create policy la_administracion_gestiona_los_tipos_agrupados on public.tipos_asistente_agrupados
  for all to authenticated
  using (interno.es_la_administracion_de_la_prestadora(prestadora_id))
  with check (interno.es_la_administracion_de_la_prestadora(prestadora_id));

revoke all on public.agrupaciones_tipos_asistente from public, anon;
revoke all on public.tipos_asistente_agrupados from public, anon;
grant select, insert, update, delete on public.agrupaciones_tipos_asistente to authenticated;
grant select, insert, update, delete on public.tipos_asistente_agrupados to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 9. Las Especialidades
-- ---------------------------------------------------------------------------------------------

create table public.especialidades (
  id uuid primary key default gen_random_uuid(),
  prestadora_id uuid not null references public.prestadoras (id) on delete cascade,
  tipo_asistente_id uuid not null references public.tipos_asistente (id) on delete cascade,
  nombre text not null check (length(btrim(nombre)) > 0),
  tipo_matricula text check (tipo_matricula is null or length(btrim(tipo_matricula)) > 0),
  activo boolean not null default true,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, prestadora_id)
);

create unique index especialidades_nombre_unico_por_tipo
  on public.especialidades (prestadora_id, tipo_asistente_id, lower(nombre));
create index idx_especialidades_tipo on public.especialidades (tipo_asistente_id);

create table public.especialidades_asistente (
  prestadora_id uuid not null references public.prestadoras (id) on delete cascade,
  asistente_id uuid not null,
  especialidad_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (asistente_id, especialidad_id),
  foreign key (asistente_id, prestadora_id)
    references public.asistentes (id, prestadora_id) on delete cascade,
  foreign key (especialidad_id, prestadora_id)
    references public.especialidades (id, prestadora_id) on delete cascade
);

create index idx_especialidades_asistente_prestadora on public.especialidades_asistente (prestadora_id);
create index idx_especialidades_asistente_especialidad on public.especialidades_asistente (especialidad_id);

create function interno.la_especialidad_es_de_su_tipo()
  returns trigger
  language plpgsql
  set search_path to 'public', 'interno'
as $$
begin
  if tg_table_name = 'especialidades' then
    if not exists (
      select 1 from public.tipos_asistente t
       where t.id = new.tipo_asistente_id
         and (t.prestadora_id is null or t.prestadora_id = new.prestadora_id)
    ) then
      raise exception 'El tipo de Asistente no existe o no es de esta Prestadora.' using errcode = 'P0001';
    end if;
  else
    if not exists (
      select 1
        from public.asistentes a
        join public.especialidades e on e.id = new.especialidad_id
       where a.id = new.asistente_id
         and a.tipo_asistente_id = e.tipo_asistente_id
    ) then
      raise exception 'Esa Especialidad no es del tipo de este Asistente.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger la_especialidad_es_de_su_tipo
  before insert or update on public.especialidades
  for each row execute function interno.la_especialidad_es_de_su_tipo();

create trigger la_especialidad_es_de_su_tipo
  before insert or update on public.especialidades_asistente
  for each row execute function interno.la_especialidad_es_de_su_tipo();

alter table public.especialidades enable row level security;
alter table public.especialidades_asistente enable row level security;

create policy su_prestadora_lee_las_especialidades on public.especialidades
  for select to authenticated using (prestadora_id = interno.current_tenant());
create policy la_administracion_gestiona_las_especialidades on public.especialidades
  for all to authenticated
  using (interno.es_la_administracion_de_la_prestadora(prestadora_id))
  with check (interno.es_la_administracion_de_la_prestadora(prestadora_id));

create policy su_prestadora_lee_las_especialidades_de_cada_asistente on public.especialidades_asistente
  for select to authenticated using (prestadora_id = interno.current_tenant());
create policy el_panel_gestiona_las_especialidades_de_cada_asistente on public.especialidades_asistente
  for all to authenticated
  using (prestadora_id = interno.current_tenant() and interno.es_personal_de_la_prestadora())
  with check (prestadora_id = interno.current_tenant() and interno.es_personal_de_la_prestadora());

revoke all on public.especialidades from public, anon;
revoke all on public.especialidades_asistente from public, anon;
grant select, insert, update, delete on public.especialidades to authenticated;
grant select, insert, update, delete on public.especialidades_asistente to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 10. Los Asistentes de hoy: tipo y Especialidades
-- ---------------------------------------------------------------------------------------------

-- Lo escrito que nombra un oficio pasa a ser el tipo; lo demás, Especialidad de ese tipo.
create temporary table oficio_de_lo_escrito on commit drop as
select e.texto,
       case
         when e.texto ilike 'enfermer%' then 'enfermero'
         when e.texto ilike 'acompa%terap%' then 'acompanante_terapeutico'
         when e.texto ilike 'rehabilit%' then 'kinesiologo'
       end as oficio
  from (select distinct unnest(especialidades) as texto from public.asistentes) e;

update public.asistentes a
   set tipo_asistente_id = t.id
  from public.tipos_asistente t
 where a.tipo_asistente_id is null
   and t.prestadora_id is null
   and t.clave = coalesce(
     (select o.oficio
        from oficio_de_lo_escrito o
       where o.texto = any (a.especialidades) and o.oficio is not null
       order by case o.oficio
                  when 'enfermero' then 1
                  when 'acompanante_terapeutico' then 2
                  else 3
                end
       limit 1),
     'cuidador');

insert into public.especialidades (prestadora_id, tipo_asistente_id, nombre)
select distinct a.prestadora_id, a.tipo_asistente_id, btrim(e.texto)
  from public.asistentes a
 cross join lateral unnest(a.especialidades) as e (texto)
  join oficio_de_lo_escrito o on o.texto = e.texto and o.oficio is null
 where a.tipo_asistente_id is not null
on conflict do nothing;

insert into public.especialidades_asistente (prestadora_id, asistente_id, especialidad_id)
select distinct a.prestadora_id, a.id, s.id
  from public.asistentes a
 cross join lateral unnest(a.especialidades) as e (texto)
  join public.especialidades s
    on s.prestadora_id = a.prestadora_id
   and s.tipo_asistente_id = a.tipo_asistente_id
   and lower(s.nombre) = lower(btrim(e.texto))
on conflict do nothing;

-- ---------------------------------------------------------------------------------------------
-- 11. La firma de la familia que se hace responsable de una medicación
-- ---------------------------------------------------------------------------------------------

alter table public.indicaciones_medicacion
  add constraint indicaciones_medicacion_id_prestadora_unico unique (id, prestadora_id);

create table public.textos_consentimiento_medicacion (
  prestadora_id uuid not null references public.prestadoras (id) on delete cascade,
  idioma text not null check (idioma in ('es-AR', 'en', 'pt-BR')),
  cuerpo text not null check (length(btrim(cuerpo)) > 0),
  actualizado_por uuid references public.usuarios (id),
  updated_at timestamptz not null default now(),
  primary key (prestadora_id, idioma)
);

alter table public.textos_consentimiento_medicacion enable row level security;

create policy textos_consentimiento_medicacion_los_lee_su_prestadora
  on public.textos_consentimiento_medicacion
  for select to authenticated using (interno.lee_la_configuracion(prestadora_id));
create policy textos_consentimiento_medicacion_los_escribe_la_administracion
  on public.textos_consentimiento_medicacion
  for all to authenticated
  using (interno.es_la_administracion_de_la_prestadora(prestadora_id))
  with check (interno.es_la_administracion_de_la_prestadora(prestadora_id));

revoke all on public.textos_consentimiento_medicacion from public, anon;
grant select, insert, update, delete on public.textos_consentimiento_medicacion to authenticated;

create trigger trg_auditoria_acceso
  after insert or update or delete on public.textos_consentimiento_medicacion
  for each row execute function fn_auditoria_de_acceso_mutacion();

create table public.consentimientos_medicacion (
  id uuid primary key default gen_random_uuid(),
  prestadora_id uuid not null references public.prestadoras (id) on delete cascade,
  indicacion_id uuid not null,
  documento_texto text not null check (length(btrim(documento_texto)) > 0),
  documento_huella text not null check (length(btrim(documento_huella)) > 0),
  documento_idioma text not null check (documento_idioma in ('es-AR', 'en', 'pt-BR')),
  estado text not null default 'pendiente_firma'
    check (estado in ('pendiente_firma', 'cerrado', 'anulado')),
  cerrado_como text check (cerrado_como is null or cerrado_como in ('papel_firmado', 'confirmado_en_la_app')),
  cerrado_en timestamptz,
  cerrado_desde text,
  archivo_firmado_url text,
  firmante_persona_id uuid,
  firmante_nombre text,
  cargado_por uuid references public.usuarios (id),
  created_at timestamptz not null default now(),
  foreign key (indicacion_id, prestadora_id)
    references public.indicaciones_medicacion (id, prestadora_id),
  foreign key (firmante_persona_id, prestadora_id)
    references public.personas (id, prestadora_id),
  check ((estado = 'cerrado') = (cerrado_como is not null and cerrado_en is not null)),
  check (
    (firmante_persona_id is null and firmante_nombre is null)
    or (firmante_persona_id is not null and length(btrim(firmante_nombre)) > 0)
  )
);

create index idx_consentimientos_medicacion_prestadora on public.consentimientos_medicacion (prestadora_id);
create index idx_consentimientos_medicacion_indicacion on public.consentimientos_medicacion (indicacion_id);
create unique index un_consentimiento_pendiente_por_indicacion
  on public.consentimientos_medicacion (indicacion_id) where estado = 'pendiente_firma';

-- Sin texto de la Prestadora no hay nada que firmar.
create function interno.la_firma_es_sobre_el_texto_de_la_prestadora()
  returns trigger
  language plpgsql
  set search_path to 'public', 'interno'
as $$
begin
  if tg_op = 'INSERT' and not exists (
    select 1 from public.textos_consentimiento_medicacion x
     where x.prestadora_id = new.prestadora_id
  ) then
    raise exception 'La Prestadora no tiene texto para que la familia se haga responsable de una medicación.'
      using errcode = 'P0001';
  end if;

  if tg_op = 'UPDATE' and old.estado = 'cerrado'
     and (new.documento_texto is distinct from old.documento_texto
          or new.documento_huella is distinct from old.documento_huella
          or new.estado is distinct from old.estado) then
    raise exception 'Lo que ya se firmó no se cambia.' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger la_firma_es_sobre_el_texto_de_la_prestadora
  before insert or update on public.consentimientos_medicacion
  for each row execute function interno.la_firma_es_sobre_el_texto_de_la_prestadora();

create trigger trg_auditoria_acceso
  after insert or update or delete on public.consentimientos_medicacion
  for each row execute function fn_auditoria_de_acceso_mutacion();

alter table public.consentimientos_medicacion enable row level security;

-- Lo firmado lo ve la Prestadora, que es parte, y la familia que lo firma. El Asistente no.
create policy consentimientos_medicacion_los_lee_el_panel on public.consentimientos_medicacion
  for select to authenticated using (
    prestadora_id = interno.current_tenant() and interno.es_personal_de_la_prestadora()
  );
create policy consentimientos_medicacion_los_lee_la_familia on public.consentimientos_medicacion
  for select to authenticated using (
    prestadora_id = interno.current_tenant()
    and interno.persona_autorizada_puede(auth.uid(), 'persona_autorizada_medicacion')
    and exists (
      select 1 from public.indicaciones_medicacion i
       where i.id = indicacion_id
         and i.paciente_id in (select interno.pacientes_del_cliente())
    )
  );
create policy consentimientos_medicacion_los_firma_la_familia on public.consentimientos_medicacion
  for insert to authenticated with check (
    prestadora_id = interno.current_tenant()
    and interno.persona_autorizada_puede(auth.uid(), 'persona_autorizada_pide_medicacion')
    and exists (
      select 1 from public.indicaciones_medicacion i
       where i.id = indicacion_id
         and i.paciente_id in (select interno.pacientes_del_cliente())
    )
  );
create policy consentimientos_medicacion_los_gestiona_la_administracion on public.consentimientos_medicacion
  for all to authenticated
  using (interno.es_la_administracion_de_la_prestadora(prestadora_id))
  with check (interno.es_la_administracion_de_la_prestadora(prestadora_id));

revoke all on public.consentimientos_medicacion from public, anon;
grant select, insert, update on public.consentimientos_medicacion to authenticated;

-- Para aceptar una medicación hace falta la orden médica o la firma de la familia.
create function interno.la_medicacion_se_acepta_con_orden_o_firma()
  returns trigger
  language plpgsql
  set search_path to 'public', 'interno'
as $$
begin
  if new.estado = 'aceptada'
     and old.estado is distinct from 'aceptada'
     and new.prescripcion_archivo_url is null
     and not exists (
       select 1 from public.consentimientos_medicacion c
        where c.indicacion_id = new.id
          and c.prestadora_id = new.prestadora_id
          and c.estado = 'cerrado'
     ) then
    raise exception 'Para aceptar la medicación hace falta la orden médica o la firma de la familia.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger la_medicacion_se_acepta_con_orden_o_firma
  before update of estado on public.indicaciones_medicacion
  for each row execute function interno.la_medicacion_se_acepta_con_orden_o_firma();

notify pgrst, 'reload schema';
