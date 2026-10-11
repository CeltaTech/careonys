-- LA CONTRASEÑA DE UNA CUENTA DE ADMINISTRACIÓN SÓLO CAMBIA CON UN PERMISO DE CELTATECH.
--
-- Esa cuenta es de CeltaTech (`CLAUDE.md` del producto, §5): ella le da la contraseña, se la cambia
-- y se la recupera. El Panel ya no se lo ofrece y el backend se lo niega, pero con su sesión abierta
-- el Administrador puede pedirle el cambio directamente al servicio de acceso, sin pasar por ninguno
-- de los dos. Esta regla lo cierra en la base, que es por donde pasan todos los caminos.
--
-- CÓMO DISTINGUE A CELTATECH. No puede por quién escribe: el servicio de acceso escribe siempre con
-- su propio rol, lo pida la persona o lo pida CeltaTech. Por eso CeltaTech deja anotado antes un
-- permiso para esa cuenta, que sirve una vez y vence solo. El cambio que lo encuentra lo gasta y
-- pasa; el que no lo encuentra se rechaza, venga de donde venga.
--
-- LA FILA QUEDA COMO REGISTRO. Quién lo pidió, cuándo, hasta cuándo valía y cuándo se usó. No se
-- borra.
--
-- Las demás cuentas no pasan por acá: su contraseña la maneja la Prestadora, con sus propios topes.

begin;

create table interno.cambios_de_clave_autorizados (
  id uuid primary key default gen_random_uuid(),
  prestadora_id uuid references public.prestadoras(id),
  usuario_id uuid not null references public.usuarios(id),
  autorizado_por text not null check (btrim(autorizado_por) <> ''),
  expira_en timestamptz not null,
  usado_en timestamptz,
  anulado_en timestamptz,
  created_at timestamptz not null default now()
);

create index cambios_de_clave_autorizados_libres
  on interno.cambios_de_clave_autorizados (usuario_id)
  where usado_en is null and anulado_en is null;

-- Nadie la lee ni la escribe desde afuera: ni con sesión ni sin ella. Sólo las dos funciones de
-- abajo, que corren como dueñas.
alter table interno.cambios_de_clave_autorizados enable row level security;
revoke all on interno.cambios_de_clave_autorizados from public, anon, authenticated, service_role;

-- Qué cuentas pasan por esta regla. Un solo lugar para el disparador y para quien autoriza.
create function interno.es_cuenta_de_administracion(p_usuario uuid)
returns boolean
language sql
stable
security definer
set search_path = public, interno
as $$
  select exists (
    select 1 from public.usuarios
     where id = p_usuario and rol in ('admin_prestadora', 'superadmin')
  );
$$;

-- Deja anotado el permiso. La llama CeltaTech; mientras no tenga su herramienta, la llama la línea
-- de comandos por orden del Desarrollador. Anula el que hubiera libre: pedir dos veces no deja dos
-- permisos abiertos, deja uno.
create function interno.autorizar_cambio_de_clave(p_usuario uuid, p_autorizado_por text, p_minutos integer)
returns uuid
language plpgsql
security definer
set search_path = public, interno
as $$
declare
  v_id uuid;
begin
  if not interno.es_cuenta_de_administracion(p_usuario) then
    raise exception 'autorizar_cambio_de_clave: la cuenta no es de administración';
  end if;
  if coalesce(btrim(p_autorizado_por), '') = '' then
    raise exception 'autorizar_cambio_de_clave: falta quién lo autoriza';
  end if;
  if p_minutos is null or p_minutos < 1 then
    raise exception 'autorizar_cambio_de_clave: los minutos tienen que ser un entero mayor que cero';
  end if;

  update interno.cambios_de_clave_autorizados
     set anulado_en = now()
   where usuario_id = p_usuario and usado_en is null and anulado_en is null;

  insert into interno.cambios_de_clave_autorizados (prestadora_id, usuario_id, autorizado_por, expira_en)
  select u.prestadora_id, u.id, btrim(p_autorizado_por), now() + make_interval(mins => p_minutos)
    from public.usuarios u
   where u.id = p_usuario
  returning id into v_id;

  return v_id;
end;
$$;

-- EL DISPARADOR CORRE COMO DUEÑO A PROPÓSITO. Quien escribe en `auth.users` es el rol del servicio
-- de acceso, que no tiene por qué leer `usuarios` ni esta tabla, y no se le abre ninguna de las
-- dos. La regla general del producto —que un disparador corra con el rol de quien escribe— mira a
-- las tablas propias, donde eso conserva la protección por fila; acá no hay ninguna que conservar.
create function interno.la_clave_de_la_administracion_la_cambia_celtatech()
returns trigger
language plpgsql
security definer
set search_path = public, interno
as $$
declare
  v_permiso uuid;
begin
  if not interno.es_cuenta_de_administracion(new.id) then
    return new;
  end if;

  update interno.cambios_de_clave_autorizados
     set usado_en = now()
   where id = (
     select id from interno.cambios_de_clave_autorizados
      where usuario_id = new.id and usado_en is null and anulado_en is null and expira_en > now()
      order by created_at desc
      limit 1
      for update
   )
  returning id into v_permiso;

  if v_permiso is null then
    raise exception 'la contraseña de una cuenta de administración la cambia CeltaTech'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function interno.es_cuenta_de_administracion(uuid) from public, anon, authenticated, service_role;
revoke all on function interno.autorizar_cambio_de_clave(uuid, text, integer) from public, anon, authenticated, service_role;
revoke all on function interno.la_clave_de_la_administracion_la_cambia_celtatech() from public, anon, authenticated, service_role;

create trigger la_clave_de_la_administracion_la_cambia_celtatech
  before update of encrypted_password on auth.users
  for each row
  when (old.encrypted_password is distinct from new.encrypted_password)
  execute function interno.la_clave_de_la_administracion_la_cambia_celtatech();

commit;

NOTIFY pgrst, 'reload schema';
