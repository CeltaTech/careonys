-- El Padrón de Asistentes: Número de Legajo, CUIT o CUIL, DNI y Género.
--
-- CADA LEGAJO TIENE SU NÚMERO. Se asigna solo, arranca en uno en cada Prestadora, no cambia y no
-- se reasigna: el mismo mecanismo que el número de cliente.
--
-- EL ASISTENTE SE IDENTIFICA COMO TODA PERSONA FÍSICA: con su número ante el organismo fiscal, que
-- en Argentina es el CUIT o el CUIL, y es obligatorio. Lo valida la misma función que valida el
-- documento de una Ficha de Persona, así que la regla es una sola.
--
-- EL DNI ES OBLIGATORIO DONDE EL DOCUMENTO LO CONTIENE. El CUIT y el CUIL de una persona física
-- llevan el DNI adentro; el catálogo de documentos dice cuáles con `contiene_dni`. Ahí el DNI se
-- pide, y la base lo compara con el número fiscal: si no coinciden, no se guarda nada. Con un
-- pasaporte o un documento extranjero el DNI no existe y queda vacío.
--
-- EL GÉNERO ES OBLIGATORIO PARA TODA PERSONA FÍSICA: los Asistentes y las Fichas físicas del
-- Directorio. La jurídica no lleva. Los valores salen de un catálogo por país; el texto visible
-- de cada uno es una traducción por código.
--
-- Los datos de hoy son ficticios. El DNI de cada Ficha sale de su CUIL. El género de las Fichas
-- sale del prefijo del CUIL, y el de los Asistentes se alterna. Los Asistentes sin DNI reciben uno
-- inventado, y todos reciben un CUIL inventado y válido armado con su DNI.

-- ---------------------------------------------------------------------------------------------
-- 1. Qué documento contiene el DNI
-- ---------------------------------------------------------------------------------------------

alter table public.catalogo_documentos_de_identidad
  add column contiene_dni boolean not null default false;

update public.catalogo_documentos_de_identidad
   set contiene_dni = true
 where pais = 'AR' and clase = 'fisica' and codigo in ('cuil', 'cuit');

-- El CDI de las personas humanas lo eliminó el organismo fiscal, así que deja de ofrecerse. Se
-- apaga y no se borra, como la LE y la LC: ninguna Ficha lo usa.
update public.catalogo_documentos_de_identidad
   set activo = false
 where pais = 'AR' and clase = 'fisica' and codigo = 'cdi';

-- ---------------------------------------------------------------------------------------------
-- 2. El catálogo de géneros
-- ---------------------------------------------------------------------------------------------

create table public.catalogo_generos (
  id uuid primary key default gen_random_uuid(),
  pais text not null references public.catalogo_paises (codigo),
  codigo text not null,
  orden int not null,
  activo boolean not null default true,
  unique (pais, codigo)
);

alter table public.catalogo_generos enable row level security;

create policy catalogo_generos_lo_lee_quien_tiene_sesion on public.catalogo_generos
  for select to authenticated using (true);

revoke all on public.catalogo_generos from public, anon;
grant select on public.catalogo_generos to authenticated;

insert into public.catalogo_generos (pais, codigo, orden) values
  ('AR', 'femenino', 10),
  ('AR', 'masculino', 20),
  ('AR', 'x', 30);

-- ---------------------------------------------------------------------------------------------
-- 3. Una sola validación del documento, el DNI y el género
-- ---------------------------------------------------------------------------------------------

create function interno.identidad_validada(
  p_prestadora uuid,
  p_clase text,
  p_tipo text,
  p_numero text,
  p_pais text,
  p_dni text,
  p_genero text,
  out numero text,
  out pais text,
  out dni text,
  out genero text
)
language plpgsql
set search_path to 'public', 'interno'
as $$
declare
  v_pais_prestadora text;
  v_tipo record;
begin
  if p_tipo is null or p_numero is null or btrim(p_numero) = '' then
    raise exception 'falta_el_documento';
  end if;

  select prestadoras.pais into v_pais_prestadora from public.prestadoras where id = p_prestadora;

  select lleva_pais, verifica_modulo_11, contiene_dni into v_tipo
    from public.catalogo_documentos_de_identidad c
   where c.pais = v_pais_prestadora
     and c.clase = p_clase
     and c.codigo = p_tipo
     and c.activo;

  if not found then
    raise exception 'documento_no_corresponde';
  end if;

  if v_tipo.verifica_modulo_11 then
    numero := regexp_replace(p_numero, '[\s.\-]', '', 'g');
    if not interno.cumple_modulo_11(numero) then
      raise exception 'numero_no_valido';
    end if;
  else
    numero := upper(btrim(p_numero));
  end if;

  if v_tipo.lleva_pais then
    if p_pais is null then
      raise exception 'falta_el_pais_del_documento';
    end if;
    pais := p_pais;
  else
    pais := null;
  end if;

  if v_tipo.contiene_dni then
    dni := regexp_replace(coalesce(p_dni, ''), '[\s.\-]', '', 'g');
    if dni = '' then
      raise exception 'falta_el_dni';
    end if;
    if dni !~ '^[0-9]{1,8}$' or ltrim(dni, '0') <> ltrim(substr(numero, 3, 8), '0') then
      raise exception 'dni_no_coincide';
    end if;
    dni := ltrim(dni, '0');
  else
    dni := null;
  end if;

  if p_clase = 'fisica' then
    if p_genero is null or btrim(p_genero) = '' then
      raise exception 'falta_el_genero';
    end if;
    if not exists (
      select 1 from public.catalogo_generos g
       where g.pais = v_pais_prestadora and g.codigo = p_genero and g.activo
    ) then
      raise exception 'genero_no_corresponde';
    end if;
    genero := p_genero;
  else
    genero := null;
  end if;
end;
$$;

revoke all on function interno.identidad_validada(uuid, text, text, text, text, text, text) from public, anon;

-- ---------------------------------------------------------------------------------------------
-- 4. La Ficha de Persona suma DNI y género
-- ---------------------------------------------------------------------------------------------

alter table public.personas
  add column dni text,
  add column genero text;

update public.personas
   set dni = ltrim(substr(documento_numero, 3, 8), '0'),
       genero = case left(documento_numero, 2)
                  when '27' then 'femenino'
                  when '20' then 'masculino'
                  else 'x'
                end
 where clase = 'fisica';

create index idx_personas_por_dni on public.personas (prestadora_id, dni) where dni is not null;

create or replace function interno.el_documento_es_valido()
returns trigger
language plpgsql
set search_path to 'public', 'interno'
as $$
declare
  v record;
begin
  select * into v
    from interno.identidad_validada(new.prestadora_id, new.clase, new.documento_tipo,
                                    new.documento_numero, new.documento_pais, new.dni, new.genero);
  new.documento_numero := v.numero;
  new.documento_pais := v.pais;
  new.dni := v.dni;
  new.genero := v.genero;
  return new;
end;
$$;

drop trigger el_documento_es_valido on public.personas;
create trigger el_documento_es_valido
  before insert or update of clase, documento_tipo, documento_numero, documento_pais, dni, genero
  on public.personas
  for each row execute function interno.el_documento_es_valido();

-- ---------------------------------------------------------------------------------------------
-- 5. El Legajo del Asistente suma número, documento y género
-- ---------------------------------------------------------------------------------------------

alter table public.asistentes
  add column numero_legajo int,
  add column documento_tipo text,
  add column documento_numero text,
  add column documento_pais text references public.catalogo_paises (codigo),
  add column genero text;

do $$
declare
  r record;
  v_n int := 0;
  v_dni text;
  v_genero text;
  v_prefijo text;
  v_cuil text;
  v_dv int;
begin
  for r in
    select id, dni,
           row_number() over (partition by prestadora_id order by created_at, id) as legajo
      from public.asistentes
     order by created_at, id
  loop
    v_n := v_n + 1;
    v_genero := case when v_n % 2 = 1 then 'femenino' else 'masculino' end;
    v_dni := ltrim(regexp_replace(coalesce(r.dni, ''), '[\s.\-]', '', 'g'), '0');
    if v_dni = '' then
      v_dni := (90000000 + v_n)::text;
    end if;

    v_cuil := null;
    foreach v_prefijo in array
      case when v_genero = 'femenino' then array['27', '23', '24'] else array['20', '23', '24'] end
    loop
      for v_dv in 0..9 loop
        if interno.cumple_modulo_11(v_prefijo || lpad(v_dni, 8, '0') || v_dv) then
          v_cuil := v_prefijo || lpad(v_dni, 8, '0') || v_dv;
          exit;
        end if;
      end loop;
      exit when v_cuil is not null;
    end loop;

    if v_cuil is null then
      raise exception 'no_se_pudo_armar_el_cuil';
    end if;

    update public.asistentes
       set numero_legajo = r.legajo,
           documento_tipo = 'cuil',
           documento_numero = v_cuil,
           dni = v_dni,
           genero = v_genero
     where id = r.id;
  end loop;
end;
$$;

alter table public.asistentes
  alter column numero_legajo set not null;

create unique index asistentes_un_numero_de_legajo_por_prestadora
  on public.asistentes (prestadora_id, numero_legajo);

create unique index asistentes_un_documento_por_prestadora
  on public.asistentes (prestadora_id, documento_tipo, coalesce(documento_pais, ''), documento_numero);

create index idx_asistentes_por_dni on public.asistentes (prestadora_id, dni) where dni is not null;

-- El número se asigna al dar de alta y no se elige.
create function interno.asignar_numero_de_legajo()
returns trigger
language plpgsql
set search_path to 'public', 'interno'
as $$
begin
  if new.numero_legajo is not null then
    raise exception 'numero_de_legajo_no_se_elige';
  end if;

  perform pg_advisory_xact_lock(hashtext('asistentes:' || new.prestadora_id::text));

  select coalesce(max(numero_legajo), 0) + 1
    into new.numero_legajo
    from public.asistentes
   where prestadora_id = new.prestadora_id;

  return new;
end;
$$;

create function interno.el_numero_de_legajo_no_cambia()
returns trigger
language plpgsql
set search_path to 'public', 'interno'
as $$
begin
  if new.numero_legajo is distinct from old.numero_legajo then
    raise exception 'numero_de_legajo_no_cambia';
  end if;
  if new.prestadora_id is distinct from old.prestadora_id then
    raise exception 'asistente_no_cambia_de_organizacion';
  end if;
  return new;
end;
$$;

-- El Asistente es siempre una persona física.
create function interno.el_documento_del_asistente_es_valido()
returns trigger
language plpgsql
set search_path to 'public', 'interno'
as $$
declare
  v record;
begin
  select * into v
    from interno.identidad_validada(new.prestadora_id, 'fisica', new.documento_tipo,
                                    new.documento_numero, new.documento_pais, new.dni, new.genero);
  new.documento_numero := v.numero;
  new.documento_pais := v.pais;
  new.dni := v.dni;
  new.genero := v.genero;
  return new;
end;
$$;

revoke all on function interno.asignar_numero_de_legajo() from public, anon;
revoke all on function interno.el_numero_de_legajo_no_cambia() from public, anon;
revoke all on function interno.el_documento_del_asistente_es_valido() from public, anon;

create trigger asignar_numero_de_legajo
  before insert on public.asistentes
  for each row execute function interno.asignar_numero_de_legajo();

create trigger el_numero_de_legajo_no_cambia
  before update on public.asistentes
  for each row execute function interno.el_numero_de_legajo_no_cambia();

create trigger el_documento_del_asistente_es_valido
  before insert or update of documento_tipo, documento_numero, documento_pais, dni, genero
  on public.asistentes
  for each row execute function interno.el_documento_del_asistente_es_valido();

-- ---------------------------------------------------------------------------------------------
-- 6. Lo que ve el Coordinador suma lo nuevo
-- ---------------------------------------------------------------------------------------------

create or replace view public.asistentes_coordinador
with (security_invoker = true) as
select id,
       nombre,
       telefono,
       email,
       foto_url,
       especialidades,
       disponibilidad,
       estado,
       qr_token,
       fecha_alta,
       created_at,
       updated_at,
       deleted_at,
       dni,
       tipo_asistente_id,
       numero_legajo,
       documento_tipo,
       documento_numero,
       documento_pais,
       genero
  from public.asistentes;

notify pgrst, 'reload schema';
