-- El Cliente deja de leer de la base la Ficha de Persona, la información de salud y los
-- domicilios temporales de sus Pacientes.
-- ============================================================================
--
-- La base no distingue entre el titular y la persona autorizada: a las dos les abría el domicilio,
-- las coordenadas, la fecha de nacimiento y el número fiscal del Paciente, sus patologías y el
-- motivo de su domicilio temporal —que puede decir «internación»—, aunque el titular no le hubiera
-- dado la ficha a esa persona o la Prestadora tuviera apagado lo que se muestra. La protección por
-- fila no recorta columnas ni sabe qué le dio el titular a cada uno.
--
-- Lo que el Cliente ve del Paciente lo arma el backend con el trabajo de la Prestadora, con las
-- columnas que corresponden a quien pide (backend/src/routes/appClientes.js). La información de
-- salud conserva su regla: el backend la pide sólo si
-- `alcanza_la_informacion_de_salud_la_sesion` contesta que sí.

-- La Ficha del Paciente la sigue leyendo quien lee al Paciente, salvo su Cliente.
CREATE OR REPLACE FUNCTION interno.lee_al_paciente_de_la_ficha(p_persona uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
  select exists (
    select 1 from public.pacientes p
     where p.persona_id = p_persona
       and p.cliente_id is distinct from interno.cliente_id_de_usuario(interno.usuario_de_la_sesion())
  )
$$;

DROP POLICY IF EXISTS cliente_lee_domicilios_temporales ON public.domicilios_temporales_paciente;
DROP POLICY IF EXISTS cliente_lee_informacion_de_salud_de_sus_pacientes ON public.informacion_de_salud_del_paciente;

NOTIFY pgrst, 'reload schema';
