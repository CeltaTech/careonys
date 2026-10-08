-- El Paciente está en el Directorio de Personas.
--
-- Quién es el Paciente —su nombre, su documento, cuándo nació y dónde vive— pasa a su Ficha de
-- Persona, que es el único lugar donde se guarda a una persona. En el Paciente queda lo que es
-- propio de recibir el cuidado: lo clínico, la obra social y el número de afiliado.
--
-- La fecha de fallecimiento se borra: no la usa nada.
--
-- NO SE AMPLÍA LO QUE HOY VE NADIE. La Ficha de un Paciente la lee, además de quien ya lee el
-- Directorio, quien hoy lee a ese Paciente, y nadie más: la pregunta se le hace a la tabla de
-- Pacientes con los permisos de quien consulta, así que el alcance es el mismo y no se copia.
--
-- Los datos de hoy son ficticios. Cada Paciente recibe una Ficha con un CUIL inventado y válido,
-- el nombre partido en nombres y apellido —sin el prefijo «DEMO — »— y el domicilio partido en
-- calle y número. La localidad escrita después de la coma no tiene adónde ir: la lista de lugares
-- está vacía, y un lugar no se inventa. La ubicación en el mapa se conserva.

-- ---------------------------------------------------------------------------------------------
-- 1. Lo que la Ficha de Persona suma
-- ---------------------------------------------------------------------------------------------

alter table public.personas
  add column fecha_nacimiento date,
  add column lat double precision,
  add column lng double precision,
  add constraint personas_la_juridica_no_nace check (clase = 'fisica' or fecha_nacimiento is null),
  add constraint personas_la_ubicacion_va_entera check ((lat is null) = (lng is null));

-- ---------------------------------------------------------------------------------------------
-- 2. El Paciente apunta a su Ficha
-- ---------------------------------------------------------------------------------------------

alter table public.pacientes
  add column persona_id uuid,
  add constraint pacientes_persona_de_la_misma_prestadora
    foreign key (persona_id, prestadora_id) references public.personas (id, prestadora_id);

create index idx_pacientes_por_persona on public.pacientes (persona_id);

-- ---------------------------------------------------------------------------------------------
-- 3. Una Ficha para cada Paciente de hoy
-- ---------------------------------------------------------------------------------------------

do $$
declare
  r record;
  v_nombre text;
  v_apellido text;
  v_antes_de_la_coma text;
  v_calle text;
  v_numero text;
  v_base bigint := 36000000;
  v_cuil text;
  v_suma int;
  v_dv int;
  v_persona uuid;
begin
  for r in
    select id, prestadora_id, nombre, fecha_nacimiento, domicilio, calle, numero, piso, unidad,
           lugar_id, lat, lng
      from public.pacientes
     where persona_id is null
     order by prestadora_id, id
  loop
    -- El nombre: sin el prefijo de los datos de demostración, la última palabra es el apellido y
    -- lo anterior son los nombres.
    v_nombre := btrim(regexp_replace(r.nombre, '^DEMO\s*—\s*', ''));
    if v_nombre !~ '\s' then
      raise exception 'el_paciente_no_tiene_apellido';
    end if;
    v_apellido := regexp_replace(v_nombre, '^.*\s', '');
    v_nombre := btrim(regexp_replace(v_nombre, '\s+\S+$', ''));

    -- El domicilio: si ya estaba partido se respeta; si no, lo que va antes de la coma es la
    -- calle, y la cifra del final es el número.
    if r.calle is not null then
      v_calle := r.calle;
      v_numero := r.numero;
    else
      v_antes_de_la_coma := btrim(split_part(coalesce(r.domicilio, ''), ',', 1));
      if v_antes_de_la_coma ~ '\s\d+\S*$' then
        v_calle := btrim(regexp_replace(v_antes_de_la_coma, '\s\d+\S*$', ''));
        v_numero := substring(v_antes_de_la_coma from '\s(\d+\S*)$');
      else
        v_calle := nullif(v_antes_de_la_coma, '');
        v_numero := null;
      end if;
    end if;

    -- Un CUIL inventado: el primer número libre que dé un verificador válido.
    loop
      v_cuil := '20' || lpad(v_base::text, 8, '0');
      v_base := v_base + 1;
      select sum(substr(v_cuil, i, 1)::int * (array[5,4,3,2,7,6,5,4,3,2])[i]) into v_suma
        from generate_series(1, 10) as i;
      v_dv := 11 - (v_suma % 11);
      if v_dv = 11 then v_dv := 0; end if;
      continue when v_dv = 10;
      v_cuil := v_cuil || v_dv::text;
      exit when not exists (
        select 1 from public.personas
         where prestadora_id = r.prestadora_id and documento_tipo = 'cuil' and documento_numero = v_cuil
      );
    end loop;

    insert into public.personas (
      prestadora_id, clase, nombre, apellido, documento_tipo, documento_numero,
      calle, numero, piso, unidad, lugar_id, fecha_nacimiento, lat, lng
    )
    values (
      r.prestadora_id, 'fisica', v_nombre, v_apellido, 'cuil', v_cuil,
      v_calle, v_numero, r.piso, r.unidad, r.lugar_id, r.fecha_nacimiento, r.lat, r.lng
    )
    returning id into v_persona;

    update public.pacientes set persona_id = v_persona where id = r.id;
  end loop;
end
$$;

alter table public.pacientes alter column persona_id set not null;

-- ---------------------------------------------------------------------------------------------
-- 4. Lo que se va del Paciente
-- ---------------------------------------------------------------------------------------------

drop function public.domicilio_del_paciente_en(uuid, date);
drop function public.domicilios_de_pacientes_en(uuid[], date);

alter table public.pacientes drop constraint pacientes_no_fallece_antes_de_nacer;
alter table public.pacientes drop constraint pacientes_lugar_fkey;
drop index public.idx_pacientes_por_lugar;

alter table public.pacientes
  drop column nombre,
  drop column fecha_nacimiento,
  drop column fecha_fallecimiento,
  drop column domicilio,
  drop column calle,
  drop column numero,
  drop column piso,
  drop column unidad,
  drop column lugar_id,
  drop column lat,
  drop column lng;

-- ---------------------------------------------------------------------------------------------
-- 5. Quién lee la Ficha de un Paciente
-- ---------------------------------------------------------------------------------------------
-- Quien lee al Paciente. La función corre con los permisos de quien consulta, así que la tabla de
-- Pacientes aplica sus propias políticas y contesta exactamente lo que esa persona ya veía. Ninguna
-- política de Pacientes mira el Directorio, así que no hay vuelta en redondo.

create function interno.lee_al_paciente_de_la_ficha(p_persona uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (select 1 from public.pacientes where persona_id = p_persona)
$$;

revoke all on function interno.lee_al_paciente_de_la_ficha(uuid) from public, anon;
grant execute on function interno.lee_al_paciente_de_la_ficha(uuid) to authenticated, service_role;

create policy la_ficha_del_paciente_la_lee_quien_lee_al_paciente
  on public.personas for select to authenticated
  using (prestadora_id = interno.current_tenant() and interno.lee_al_paciente_de_la_ficha(id));

-- Las tareas automáticas nombran al Paciente en los avisos y miden a qué distancia está su
-- domicilio: lo leían del Paciente, y ahora está en la Ficha. Leen lo mismo que antes, de su
-- Prestadora y de ninguna otra, y de la Ficha sólo el nombre y el domicilio: ni el documento, ni el
-- correo, ni las notas.
grant select (id, prestadora_id, clase, nombre, apellido, nombre_visible, calle, numero, piso,
              unidad, lugar_id, lat, lng)
  on public.personas to trabajo_sin_persona;
create policy trabajo_sin_persona_de_esta_prestadora
  on public.personas for select to trabajo_sin_persona
  using (prestadora_id = interno.current_tenant());

-- Y para saber dónde se atiende al Paciente un día dado, la función de abajo mira los domicilios
-- temporales y el nombre del lugar. Sin estos dos permisos la tarea que avisa las llegadas
-- demoradas no podía preguntarlo.
grant select on public.lugares to trabajo_sin_persona;
create policy trabajo_sin_persona_de_esta_prestadora
  on public.lugares for select to trabajo_sin_persona
  using (prestadora_id = interno.current_tenant());

grant select on public.domicilios_temporales_paciente to trabajo_sin_persona;
create policy trabajo_sin_persona_de_esta_prestadora
  on public.domicilios_temporales_paciente for select to trabajo_sin_persona
  using (prestadora_id = interno.current_tenant());

-- ---------------------------------------------------------------------------------------------
-- 6. Dónde se atiende a cada Paciente un día dado
-- ---------------------------------------------------------------------------------------------
-- Manda el domicilio temporal vigente ese día; si no hay, el de la Ficha de Persona. Devuelve las
-- partes y el nombre del lugar, no el renglón: el renglón se arma al mostrarlo, en el idioma de
-- quien mira, con `domicilioEscrito`. Corre con los permisos de quien llama, así que lo que no
-- puede leer no le llega.

create function public.domicilios_de_pacientes_en(p_pacientes uuid[], p_fecha date)
returns table (
  paciente_id uuid,
  domicilio_temporal_id uuid,
  calle text,
  numero text,
  piso text,
  unidad text,
  lugar text,
  lat double precision,
  lng double precision,
  es_temporal boolean,
  motivo text,
  desde date,
  hasta date
)
language sql
stable
set search_path = ''
as $$
  select
    p.id as paciente_id,
    d.id as domicilio_temporal_id,
    case when d.id is null then f.calle else d.calle end as calle,
    case when d.id is null then f.numero else d.numero end as numero,
    case when d.id is null then f.piso else d.piso end as piso,
    case when d.id is null then f.unidad else d.unidad end as unidad,
    l.nombre as lugar,
    case when d.id is null then f.lat else d.lat end as lat,
    case when d.id is null then f.lng else d.lng end as lng,
    d.id is not null as es_temporal,
    d.motivo,
    d.fecha_inicio as desde,
    d.fecha_fin as hasta
  from public.pacientes p
  join public.personas f on f.id = p.persona_id and f.prestadora_id = p.prestadora_id
  left join lateral (
    select t.id, t.calle, t.numero, t.piso, t.unidad, t.lugar_id, t.lat, t.lng, t.motivo,
           t.fecha_inicio, t.fecha_fin
      from public.domicilios_temporales_paciente t
     where t.paciente_id = p.id
       and t.fecha_inicio <= p_fecha
       and (t.fecha_fin is null or t.fecha_fin >= p_fecha)
     -- La restricción de la tabla garantiza que haya una sola; el orden y el tope son la red por
     -- si alguna vez se afloja.
     order by t.fecha_inicio desc
     limit 1
  ) d on true
  left join public.lugares l
    on l.id = case when d.id is null then f.lugar_id else d.lugar_id end
   and l.prestadora_id = p.prestadora_id
  where p.id = any (p_pacientes);
$$;

create function public.domicilio_del_paciente_en(p_paciente_id uuid, p_fecha date)
returns table (
  paciente_id uuid,
  domicilio_temporal_id uuid,
  calle text,
  numero text,
  piso text,
  unidad text,
  lugar text,
  lat double precision,
  lng double precision,
  es_temporal boolean,
  motivo text,
  desde date,
  hasta date
)
language sql
stable
set search_path = ''
as $$
  select * from public.domicilios_de_pacientes_en(array[p_paciente_id], p_fecha);
$$;

revoke all on function public.domicilios_de_pacientes_en(uuid[], date) from public, anon;
revoke all on function public.domicilio_del_paciente_en(uuid, date) from public, anon;
grant execute on function public.domicilios_de_pacientes_en(uuid[], date) to authenticated, service_role, trabajo_sin_persona;
grant execute on function public.domicilio_del_paciente_en(uuid, date) to authenticated, service_role;

NOTIFY pgrst, 'reload schema';
