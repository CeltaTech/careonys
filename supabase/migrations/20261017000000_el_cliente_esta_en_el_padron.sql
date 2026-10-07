-- El Cliente está en el Padrón, y las Solicitudes desaparecen.
--
-- Hasta acá el contacto de cada Cliente vivía en la Solicitud que lo había originado: nombre,
-- teléfono, correo y localidad escritos ahí, aparte del Padrón. Ahora cada Cliente apunta a su
-- Legajo, que es donde vive toda Persona de la Prestadora, y lo que estaba en la Solicitud pasa al
-- Legajo y a sus teléfonos.
--
-- Al Cliente se llega con un presupuesto aprobado, como en cualquier circuito comercial; la
-- Solicitud era un paso propio que no seguía ese circuito, y se retira entera: tabla, columna que
-- la citaba y motivos con que se la resolvía.
--
-- También sale del Servicio el Legajo de quien contrata. El Contratante es parte del Cliente y se
-- anota en el Cliente, no en cada Servicio.

-- 1. El Legajo del Cliente.
alter table public.clientes add column legajo_id uuid;

alter table public.clientes
  add constraint clientes_legajo_de_la_misma_prestadora
  foreign key (legajo_id, prestadora_id) references public.legajos (id, prestadora_id);

-- 2. Cada Cliente que existe pasa al Padrón con lo que decía su Solicitud. El nombre se parte en
--    nombre y apellido por la última palabra, que es como estaban escritos.
do $$
declare
  fila record;
  limpio text;
  nuevo_legajo uuid;
begin
  for fila in
    select c.id as cliente_id, c.prestadora_id, s.nombre, s.email, s.telefono, s.lugar_id
      from public.clientes c
      join public.solicitudes s on s.id = c.solicitud_id
  loop
    limpio := btrim(regexp_replace(regexp_replace(fila.nombre, '^DEMO\s*—\s*', ''), '\s*\(.*\)\s*$', ''));
    insert into public.legajos (prestadora_id, clase, nombre, apellido, email, lugar_id)
    values (
      fila.prestadora_id,
      'fisica',
      case when position(' ' in limpio) > 0 then regexp_replace(limpio, '\s+\S+$', '') else limpio end,
      case when position(' ' in limpio) > 0 then substring(limpio from '\S+$') else limpio end,
      nullif(btrim(fila.email), ''),
      fila.lugar_id
    )
    returning id into nuevo_legajo;

    if nullif(btrim(fila.telefono), '') is not null then
      insert into public.telefonos_del_legajo (prestadora_id, legajo_id, telefono)
      values (fila.prestadora_id, nuevo_legajo, btrim(fila.telefono));
    end if;

    update public.clientes set legajo_id = nuevo_legajo where id = fila.cliente_id;
  end loop;
end;
$$;

-- Un Cliente sin Legajo no tiene a nadie detrás: no se lo admite.
alter table public.clientes alter column legajo_id set not null;

-- 3. Fuera las Solicitudes.
alter table public.clientes drop column solicitud_id;
drop table public.solicitudes;

delete from public.motivos_resolucion where tabla = 'solicitudes';

create or replace function public.sembrar_motivos_resolucion(p_prestadora_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  insert into motivos_resolucion
    (prestadora_id, tabla, estado, nombre_es_ar, nombre_en, nombre_pt_br, pide_detalle, orden)
  values
    -- Postulaciones.
    (p_prestadora_id, 'postulaciones', 'en_revision',
     'Pasa a revisión', 'Moves to review', 'Passa para análise', false, 10),
    (p_prestadora_id, 'postulaciones', 'aprobado',
     'Reúne lo que el puesto pide', 'Meets what the role requires', 'Atende ao que a vaga exige', false, 20),
    (p_prestadora_id, 'postulaciones', 'rechazado',
     'No reúne la experiencia pedida', 'Does not have the required experience', 'Não tem a experiência exigida', false, 30),
    (p_prestadora_id, 'postulaciones', 'rechazado',
     'Queda fuera de las zonas cubiertas', 'Outside the areas covered', 'Fora das áreas atendidas', false, 40),
    (p_prestadora_id, 'postulaciones', 'rechazado',
     'No se presentó a la entrevista', 'Did not attend the interview', 'Não compareceu à entrevista', false, 50),
    (p_prestadora_id, 'postulaciones', 'rechazado',
     'Pidió retirar su postulación', 'Asked to withdraw the application', 'Pediu para retirar a candidatura', false, 60),
    (p_prestadora_id, 'postulaciones', 'rechazado',
     'Otro motivo', 'Other reason', 'Outro motivo', true, 99),
    -- Guardias. Por ahora sólo las canceladas: es la decisión que se toma mirando la Guardia y que
    -- hasta hoy no dejaba rastro. La llegada y la salida las escribe el motor cuando pasan, y no
    -- se resuelven con un motivo porque no son una decisión sino un hecho.
    (p_prestadora_id, 'guardias', 'cancelada',
     'El Cliente la dio de baja', 'The Client cancelled it', 'O Cliente cancelou', false, 10),
    (p_prestadora_id, 'guardias', 'cancelada',
     'El Paciente quedó internado', 'The Patient was admitted to hospital', 'O Paciente ficou internado', false, 20),
    (p_prestadora_id, 'guardias', 'cancelada',
     'No se consiguió quién la cubriera', 'Nobody could be found to cover it', 'Não foi possível encontrar quem cobrisse', false, 30),
    (p_prestadora_id, 'guardias', 'cancelada',
     'Terminó el Servicio', 'The Service ended', 'O Serviço terminou', false, 40),
    (p_prestadora_id, 'guardias', 'cancelada',
     'Se había cargado por error', 'It had been entered by mistake', 'Tinha sido cadastrado por engano', false, 50),
    (p_prestadora_id, 'guardias', 'cancelada',
     'Otro motivo', 'Other reason', 'Outro motivo', true, 99)
  on conflict do nothing;
end;
$function$;

-- El comentario de `sembrar_configuracion_prestadora` todavía nombra la solicitud. Se reescribe la
-- misma función con esa línea corregida, sin copiar el resto a mano.
do $$
declare
  definicion text;
begin
  definicion := pg_get_functiondef('public.sembrar_configuracion_prestadora'::regproc);
  definicion := replace(definicion,
    'una postulación o una solicitud.',
    'una postulación o una Guardia.');
  execute definicion;
end;
$$;

-- 4. El Contratante sale del Servicio.
create or replace function interno.exigir_contratante_del_servicio()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'interno'
as $function$
declare
  prestadora_del_contratante uuid;
begin
  -- Una rama por tipo. El `ELSE` es el que hace que falle cerrado: un tipo que esta versión no
  -- conoce se rechaza, en vez de guardarse apuntando a la nada.
  if new.tipo_contratante = 'cliente' then
    select prestadora_id into prestadora_del_contratante
      from clientes where id = new.contratante_id;
  else
    raise exception 'contratante_de_tipo_desconocido:%', new.tipo_contratante;
  end if;

  if prestadora_del_contratante is null then
    raise exception 'contratante_inexistente:%:%', new.tipo_contratante, new.contratante_id;
  end if;

  if prestadora_del_contratante <> new.prestadora_id then
    raise exception 'contratante_de_otra_prestadora:%', new.contratante_id;
  end if;

  return new;
end;
$function$;

alter table public.servicios drop column contratante_legajo_id;

NOTIFY pgrst, 'reload schema';
