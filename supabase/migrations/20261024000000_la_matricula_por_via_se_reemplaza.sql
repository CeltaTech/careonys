-- La tabla que decía qué matrícula exige cada vía de administración se borra.
--
-- Qué vía puede dar cada tipo de Asistente ya lo dicen sus prohibiciones: las tareas de clase
-- «prohibida» y las vías que alcanza cada una. Con las dos en pie, la misma regla quedaba
-- escrita en dos lugares. El backend y el Panel ya leen sólo la nueva.

-- ----------------------------------------------------------------------------
-- La tabla vieja
-- ----------------------------------------------------------------------------

drop table public.configuracion_matricula_via_medicacion;

-- ----------------------------------------------------------------------------
-- El comentario que la nombraba
-- ----------------------------------------------------------------------------

comment on column public.tipos_asistente.tipo_matricula is
  'Qué matrícula exige. Se compara contra matriculas_asistente.tipo: los dos tienen que hablar el mismo idioma o la regla no engancha.';

notify pgrst, 'reload schema';
