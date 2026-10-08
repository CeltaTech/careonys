-- El Padrón de personas pasa a ser el Directorio de Personas, y cada persona tiene su Ficha.
--
-- El Padrón es sólo de Asistentes, y cada Asistente tiene su Legajo. Las personas de los Clientes
-- —quien contrata, quien recibe el cuidado, quien paga, quien firma— viven en otro lado, y ese lado
-- se llama Directorio de Personas. Así que la tabla, sus columnas, sus políticas, sus disparadores
-- y los dos permisos que la abren se nombran por lo que guardan.
--
-- Y la Ficha deja de tener número. El número interno no se mostraba en ningún lado: a la persona
-- se la reconoce por su nombre y su documento.
--
-- EL DOCUMENTO ES OBLIGATORIO, y se lo controla acá además de en el formulario:
--   - el tipo sale del catálogo del país de la Prestadora, para la clase de la persona, y activo;
--   - cuando el tipo lo pide, el número lleva el dígito verificador por módulo 11;
--   - cuando el tipo lo pide, se dice qué país lo emitió;
--   - dos Fichas de la misma Prestadora no comparten tipo, país y número.
--
-- Los datos de hoy son ficticios: los que no tienen documento reciben uno inventado y válido, y
-- los DNI pasan a CUIL.

-- ---------------------------------------------------------------------------------------------
-- 1. Los países
-- ---------------------------------------------------------------------------------------------
-- Sólo el código: el nombre de cada país lo pone cada idioma al mostrarlo.

create table public.catalogo_paises (
  codigo text primary key check (codigo ~ '^[A-Z]{2}$'),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.catalogo_paises enable row level security;

create policy los_paises_los_lee_cualquiera_con_sesion
  on public.catalogo_paises for select to authenticated using (true);

revoke all on public.catalogo_paises from public, anon;
grant select on public.catalogo_paises to authenticated;

insert into public.catalogo_paises (codigo)
select unnest(string_to_array(
  'AD,AE,AF,AG,AI,AL,AM,AO,AQ,AR,AS,AT,AU,AW,AX,AZ,BA,BB,BD,BE,BF,BG,BH,BI,BJ,BL,BM,BN,BO,BQ,BR,'
  'BS,BT,BV,BW,BY,BZ,CA,CC,CD,CF,CG,CH,CI,CK,CL,CM,CN,CO,CR,CU,CV,CW,CX,CY,CZ,DE,DJ,DK,DM,DO,DZ,'
  'EC,EE,EG,EH,ER,ES,ET,FI,FJ,FK,FM,FO,FR,GA,GB,GD,GE,GF,GG,GH,GI,GL,GM,GN,GP,GQ,GR,GS,GT,GU,GW,'
  'GY,HK,HM,HN,HR,HT,HU,ID,IE,IL,IM,IN,IO,IQ,IR,IS,IT,JE,JM,JO,JP,KE,KG,KH,KI,KM,KN,KP,KR,KW,KY,'
  'KZ,LA,LB,LC,LI,LK,LR,LS,LT,LU,LV,LY,MA,MC,MD,ME,MF,MG,MH,MK,ML,MM,MN,MO,MP,MQ,MR,MS,MT,MU,MV,'
  'MW,MX,MY,MZ,NA,NC,NE,NF,NG,NI,NL,NO,NP,NR,NU,NZ,OM,PA,PE,PF,PG,PH,PK,PL,PM,PN,PR,PS,PT,PW,PY,'
  'QA,RE,RO,RS,RU,RW,SA,SB,SC,SD,SE,SG,SH,SI,SJ,SK,SL,SM,SN,SO,SR,SS,ST,SV,SX,SY,SZ,TC,TD,TF,TG,'
  'TH,TJ,TK,TL,TM,TN,TO,TR,TT,TV,TW,TZ,UA,UG,UM,US,UY,UZ,VA,VC,VE,VG,VI,VN,VU,WF,WS,YE,YT,ZA,ZM,ZW',
  ','));

-- ---------------------------------------------------------------------------------------------
-- 2. Los tipos de documento
-- ---------------------------------------------------------------------------------------------

alter table public.catalogo_documentos_de_identidad
  add column lleva_pais boolean not null default false,
  add column verifica_modulo_11 boolean not null default false;

update public.catalogo_documentos_de_identidad
   set activo = false
 where pais = 'AR' and clase = 'fisica' and codigo in ('dni', 'lc', 'le');

update public.catalogo_documentos_de_identidad
   set verifica_modulo_11 = true
 where pais = 'AR' and codigo in ('cuil', 'cuit');

update public.catalogo_documentos_de_identidad
   set lleva_pais = true, orden = 50
 where pais = 'AR' and clase = 'fisica' and codigo = 'pasaporte';

insert into public.catalogo_documentos_de_identidad (pais, clase, codigo, sigla, orden, activo, lleva_pais, verifica_modulo_11)
values
  ('AR', 'fisica', 'cdi', 'CDI', 40, true, false, true),
  ('AR', 'fisica', 'documento_extranjero', 'Documento extranjero', 60, true, true, false),
  ('AR', 'juridica', 'identificacion_fiscal_extranjera', 'Identificación fiscal extranjera', 20, true, true, false);

-- ---------------------------------------------------------------------------------------------
-- 3. El dígito verificador
-- ---------------------------------------------------------------------------------------------
-- Once cifras; las diez primeras por 5,4,3,2,7,6,5,4,3,2; once menos el resto de dividir por
-- once es el verificador, salvo que dé once, que es cero, o diez, que no es válido.

create function interno.cumple_modulo_11(p_numero text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_numero !~ '^[0-9]{11}$' then false
    else (
      with suma as (
        select sum(substr(p_numero, i, 1)::int * (array[5,4,3,2,7,6,5,4,3,2])[i]) as s
          from generate_series(1, 10) as i
      )
      select case 11 - (s % 11)
               when 11 then 0
               when 10 then null
               else 11 - (s % 11)
             end is not distinct from substr(p_numero, 11, 1)::int
        from suma
    )
  end
$$;

revoke all on function interno.cumple_modulo_11(text) from public, anon;
grant execute on function interno.cumple_modulo_11(text) to authenticated, service_role, trabajo_sin_persona;

-- ---------------------------------------------------------------------------------------------
-- 4. La tabla y sus columnas
-- ---------------------------------------------------------------------------------------------

drop trigger asignar_numero_legajos on public.legajos;
drop trigger el_numero_de_legajo_no_cambia on public.legajos;
drop trigger el_legajo_no_se_borra on public.legajos;
drop trigger el_apoderado_es_una_persona on public.legajos;
drop function interno.asignar_numero_de_legajo();
drop function interno.el_numero_de_legajo_no_cambia();
drop function interno.el_legajo_no_se_borra();
drop function interno.el_apoderado_es_una_persona();

alter table public.legajos drop constraint legajos_numero_unico_por_prestadora;
alter table public.legajos drop column numero_legajo;
drop index public.idx_legajos_documento_una_vez_por_prestadora;

alter table public.legajos rename to personas;
alter table public.personas rename column apoderado_legajo_id to apoderado_persona_id;
alter table public.personas add column documento_pais text references public.catalogo_paises (codigo);

alter table public.personas rename constraint legajos_pkey to personas_pkey;
alter table public.personas rename constraint legajos_id_prestadora_unico to personas_id_prestadora_unico;
alter table public.personas rename constraint legajos_apoderado_fkey to personas_apoderado_fkey;
alter table public.personas rename constraint legajos_clase_conocida to personas_clase_conocida;
alter table public.personas rename constraint legajos_el_documento_va_entero to personas_el_documento_va_entero;
alter table public.personas rename constraint legajos_el_nombre_no_va_vacio to personas_el_nombre_no_va_vacio;
alter table public.personas rename constraint legajos_la_fisica_lleva_apellido to personas_la_fisica_lleva_apellido;
alter table public.personas rename constraint legajos_la_juridica_no_lleva_apellido to personas_la_juridica_no_lleva_apellido;
alter table public.personas rename constraint legajos_lugar_fkey to personas_lugar_fkey;
alter table public.personas rename constraint legajos_prestadora_id_fkey to personas_prestadora_id_fkey;
alter table public.personas rename constraint legajos_solo_la_juridica_tiene_apoderado to personas_solo_la_juridica_tiene_apoderado;
alter index public.idx_legajos_por_prestadora rename to idx_personas_por_prestadora;
alter index public.idx_legajos_por_lugar rename to idx_personas_por_lugar;
alter index public.idx_legajos_por_apoderado rename to idx_personas_por_apoderado;

alter table public.clientes rename column legajo_id to contratante_persona_id;
alter table public.clientes rename column pagador_legajo_id to pagador_persona_id;
alter table public.clientes rename constraint clientes_legajo_de_la_misma_prestadora to clientes_contratante_de_la_misma_prestadora;
alter table public.clientes rename constraint clientes_pagador_legajo_de_la_misma_prestadora to clientes_pagador_de_la_misma_prestadora;
alter index public.idx_clientes_pagador_legajo rename to idx_clientes_pagador_persona;

alter table public.pacientes rename column obra_social_legajo_id to obra_social_persona_id;
alter table public.pacientes rename constraint pacientes_obra_social_legajo_de_la_misma_prestadora to pacientes_obra_social_de_la_misma_prestadora;
alter index public.idx_pacientes_obra_social_legajo rename to idx_pacientes_obra_social_persona;

alter table public.consentimientos_pagador rename column pagador_legajo_id to pagador_persona_id;
alter table public.consentimientos_pagador rename column firmante_legajo_id to firmante_persona_id;
alter table public.consentimientos_pagador rename constraint consentimientos_pagador_legajo_tenant_fk to consentimientos_pagador_pagador_fk;

alter table public.excepciones_familiar_relevo rename column familiar_legajo_id to familiar_persona_id;
alter table public.excepciones_familiar_relevo rename constraint excepciones_familiar_legajo_de_la_misma_prestadora to excepciones_familiar_de_la_misma_prestadora;
alter index public.idx_excepciones_familiar_legajo rename to idx_excepciones_familiar_persona;

alter table public.telefonos_del_legajo rename to telefonos_de_la_persona;
alter table public.telefonos_de_la_persona rename column legajo_id to persona_id;
alter table public.telefonos_de_la_persona rename constraint telefonos_del_legajo_pkey to telefonos_de_la_persona_pkey;
alter table public.telefonos_de_la_persona rename constraint telefonos_del_legajo_prestadora_id_fkey to telefonos_de_la_persona_prestadora_id_fkey;
alter table public.telefonos_de_la_persona rename constraint el_telefono_del_legajo_no_va_vacio to el_telefono_de_la_persona_no_va_vacio;
alter table public.telefonos_de_la_persona rename constraint el_telefono_es_de_un_legajo_de_esta_prestadora to el_telefono_es_de_una_persona_de_esta_prestadora;
alter index public.los_telefonos_se_buscan_por_legajo rename to los_telefonos_se_buscan_por_persona;

-- ---------------------------------------------------------------------------------------------
-- 5. Los permisos
-- ---------------------------------------------------------------------------------------------

insert into public.catalogo_acciones_permisos (accion, default_solo_admin, orden)
values ('ver_personas', false, 14), ('editar_personas', true, 15);

alter policy legajos_los_lee_su_organizacion on public.personas
  rename to personas_las_lee_su_organizacion;
alter policy personas_las_lee_su_organizacion on public.personas
  using (prestadora_id = interno.current_tenant() and interno.tiene_permiso('ver_personas'));

alter policy legajos_los_carga_quien_puede on public.personas
  rename to personas_las_carga_quien_puede;
alter policy personas_las_carga_quien_puede on public.personas
  with check (prestadora_id = interno.current_tenant() and interno.tiene_permiso('editar_personas'));

alter policy legajos_los_corrige_quien_puede on public.personas
  rename to personas_las_corrige_quien_puede;
alter policy personas_las_corrige_quien_puede on public.personas
  using (prestadora_id = interno.current_tenant() and interno.tiene_permiso('editar_personas'))
  with check (prestadora_id = interno.current_tenant() and interno.tiene_permiso('editar_personas'));

alter policy los_telefonos_los_lee_su_organizacion on public.telefonos_de_la_persona
  using (prestadora_id = interno.current_tenant() and interno.tiene_permiso('ver_personas'));
alter policy los_telefonos_los_carga_quien_puede on public.telefonos_de_la_persona
  with check (prestadora_id = interno.current_tenant() and interno.tiene_permiso('editar_personas'));
alter policy los_telefonos_los_corrige_quien_puede on public.telefonos_de_la_persona
  using (prestadora_id = interno.current_tenant() and interno.tiene_permiso('editar_personas'))
  with check (prestadora_id = interno.current_tenant() and interno.tiene_permiso('editar_personas'));
alter policy los_telefonos_los_saca_quien_puede on public.telefonos_de_la_persona
  using (prestadora_id = interno.current_tenant() and interno.tiene_permiso('editar_personas'));

delete from public.catalogo_acciones_permisos where accion in ('ver_padron', 'editar_padron');

-- ---------------------------------------------------------------------------------------------
-- 6. Los disparadores
-- ---------------------------------------------------------------------------------------------

create function interno.la_persona_no_cambia_de_organizacion()
returns trigger
language plpgsql
set search_path = public, interno
as $$
begin
  if new.prestadora_id is distinct from old.prestadora_id then
    raise exception 'persona_no_cambia_de_organizacion';
  end if;
  return new;
end;
$$;

create function interno.la_persona_no_se_borra()
returns trigger
language plpgsql
set search_path = public, interno
as $$
begin
  raise exception 'persona_no_se_borra';
end;
$$;

create function interno.el_apoderado_es_una_persona()
returns trigger
language plpgsql
set search_path = public, interno
as $$
declare
  v_clase text;
begin
  if new.apoderado_persona_id is null then
    return new;
  end if;

  if new.apoderado_persona_id = new.id then
    raise exception 'el_apoderado_no_es_la_entidad_misma';
  end if;

  -- La Prestadora va en la condición y no se da por sabida: la clave foránea ya lo exige, y acá se
  -- repite para que esta consulta no pueda mirar el Directorio de otra Organización.
  select clase into v_clase
    from public.personas
   where id = new.apoderado_persona_id
     and prestadora_id = new.prestadora_id;

  if v_clase is null then
    raise exception 'el_apoderado_no_esta_en_el_directorio';
  end if;

  if v_clase <> 'fisica' then
    raise exception 'el_apoderado_es_una_persona';
  end if;

  return new;
end;
$$;

-- El documento: tipo del catálogo, país cuando corresponde, dígito verificador cuando corresponde.
-- El número se guarda limpio —sin guiones, puntos ni espacios cuando es de los que llevan dígito
-- verificador; sin espacios a los costados y en mayúscula en los demás— para que el mismo
-- documento escrito de dos maneras no pase por dos documentos distintos.
create function interno.el_documento_es_valido()
returns trigger
language plpgsql
set search_path = public, interno
as $$
declare
  v_pais_prestadora text;
  v_tipo record;
begin
  if new.documento_tipo is null or new.documento_numero is null or btrim(new.documento_numero) = '' then
    raise exception 'falta_el_documento';
  end if;

  select pais into v_pais_prestadora from public.prestadoras where id = new.prestadora_id;

  select lleva_pais, verifica_modulo_11 into v_tipo
    from public.catalogo_documentos_de_identidad
   where pais = v_pais_prestadora
     and clase = new.clase
     and codigo = new.documento_tipo
     and activo;

  if not found then
    raise exception 'documento_no_corresponde';
  end if;

  if v_tipo.verifica_modulo_11 then
    new.documento_numero := regexp_replace(new.documento_numero, '[\s.\-]', '', 'g');
    if not interno.cumple_modulo_11(new.documento_numero) then
      raise exception 'numero_no_valido';
    end if;
  else
    new.documento_numero := upper(btrim(new.documento_numero));
  end if;

  if v_tipo.lleva_pais then
    if new.documento_pais is null then
      raise exception 'falta_el_pais_del_documento';
    end if;
  else
    new.documento_pais := null;
  end if;

  return new;
end;
$$;

create or replace function interno.exigir_familiar_del_relevo()
returns trigger
language plpgsql
set search_path = public, interno
as $$
declare
  clase_del_familiar text;
begin
  if new.familiar_persona_id is null then
    raise exception 'falta_el_familiar_del_relevo';
  end if;

  select clase into clase_del_familiar
    from public.personas
   where id = new.familiar_persona_id;

  -- Falla cerrado: sin Ficha a la vista, o con una que no es una persona física, no se guarda.
  if clase_del_familiar is distinct from 'fisica' then
    raise exception 'el_familiar_del_relevo_es_una_persona';
  end if;

  return new;
end
$$;

revoke all on function interno.la_persona_no_cambia_de_organizacion() from public, anon;
revoke all on function interno.la_persona_no_se_borra() from public, anon;
revoke all on function interno.el_apoderado_es_una_persona() from public, anon;
revoke all on function interno.el_documento_es_valido() from public, anon;
grant execute on function interno.la_persona_no_cambia_de_organizacion() to authenticated, service_role, trabajo_sin_persona;
grant execute on function interno.la_persona_no_se_borra() to authenticated, service_role, trabajo_sin_persona;
grant execute on function interno.el_apoderado_es_una_persona() to authenticated, service_role, trabajo_sin_persona;
grant execute on function interno.el_documento_es_valido() to authenticated, service_role, trabajo_sin_persona;

-- ---------------------------------------------------------------------------------------------
-- 7. Los documentos de los datos de hoy
-- ---------------------------------------------------------------------------------------------
-- Ficticios. El DNI pasa a CUIL con el prefijo 20; quien no tiene documento recibe un CUIL
-- inventado; la jurídica cuyo CUIT no cierre recibe otro. En todos los casos se busca el primer
-- número que dé un verificador válido.

do $$
declare
  r record;
  v_base bigint;
  v_prefijo text;
  v_numero text;
  v_siguiente bigint := 35000000;
  v_dv int;
  v_suma int;
begin
  for r in
    select id, clase, documento_tipo, documento_numero
      from public.personas
     order by created_at, id
  loop
    if r.documento_tipo in ('cuil', 'cuit') and interno.cumple_modulo_11(regexp_replace(r.documento_numero, '\D', '', 'g')) then
      continue;
    end if;

    if r.clase = 'juridica' then
      v_prefijo := '30';
    else
      v_prefijo := '20';
    end if;

    if r.documento_tipo is not null and r.documento_numero ~ '^[0-9]{7,8}$' and r.clase = 'fisica' then
      v_base := r.documento_numero::bigint;
    else
      v_base := v_siguiente;
      v_siguiente := v_siguiente + 1;
    end if;

    loop
      v_numero := v_prefijo || lpad(v_base::text, 8, '0');
      select sum(substr(v_numero, i, 1)::int * (array[5,4,3,2,7,6,5,4,3,2])[i]) into v_suma
        from generate_series(1, 10) as i;
      v_dv := 11 - (v_suma % 11);
      if v_dv = 11 then v_dv := 0; end if;
      exit when v_dv <> 10;
      v_base := v_siguiente;
      v_siguiente := v_siguiente + 1;
    end loop;

    update public.personas
       set documento_tipo = case when r.clase = 'juridica' then 'cuit' else 'cuil' end,
           documento_numero = v_numero || v_dv::text
     where id = r.id;
  end loop;
end
$$;

update public.personas
   set documento_numero = regexp_replace(documento_numero, '\D', '', 'g')
 where documento_tipo in ('cuil', 'cuit');

alter table public.personas alter column documento_tipo set not null;
alter table public.personas alter column documento_numero set not null;
alter table public.personas drop constraint personas_el_documento_va_entero;

create unique index personas_un_documento_por_prestadora
  on public.personas (prestadora_id, documento_tipo, coalesce(documento_pais, ''), documento_numero);

-- ---------------------------------------------------------------------------------------------
-- 8. Los disparadores, puestos
-- ---------------------------------------------------------------------------------------------

create trigger la_persona_no_cambia_de_organizacion
  before update on public.personas
  for each row execute function interno.la_persona_no_cambia_de_organizacion();

create trigger la_persona_no_se_borra
  before delete on public.personas
  for each row execute function interno.la_persona_no_se_borra();

create trigger el_apoderado_es_una_persona
  before insert or update on public.personas
  for each row execute function interno.el_apoderado_es_una_persona();

create trigger el_documento_es_valido
  before insert or update of clase, documento_tipo, documento_numero, documento_pais on public.personas
  for each row execute function interno.el_documento_es_valido();

NOTIFY pgrst, 'reload schema';
