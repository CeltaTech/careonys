-- El Asistente se reconoce por su Legajo, y lo que hace en su guardia lo puede hacer con su sesión.
--
-- Son defectos que hoy no se notan porque el backend entra con la llave de servicio, que no pasa
-- por RLS. El día que cada pedido corra con la credencial de la persona, aparecen todos juntos.
--
-- 1. El Legajo no es la cuenta. `guardias.asistente_id` guarda el Legajo del Asistente
--    (`asistentes.id`), y tres lugares lo comparaban con la cuenta (`auth.uid()`): la función que
--    dice qué pacientes atiende el Asistente, las fotos de los reportes y la matrícula. Hoy coinciden
--    porque los Legajos viejos nacieron con el mismo identificador que su cuenta; para toda ficha
--    nueva son distintos, y el Asistente dejaría de ver a sus pacientes. El Legajo de la sesión sale
--    de un solo lugar, `interno.asistente_de_la_sesion()`, que ya usan las demás políticas.
--
-- 2. Lo que el Asistente hace durante la guardia —el descanso, el aviso de demora, la emergencia y
--    el «no puedo continuar»— no tenía permiso ni política para él. Se le da lo que la aplicación
--    hace hoy y nada más: sobre sus propias guardias, en su Prestadora, y sólo las columnas que
--    escribe.
--
-- 3. Lo que la administración hace desde el Panel en esas tablas —cargar un descanso ya terminado
--    y dar por atendida una emergencia— tampoco tenía por dónde pasar. Se le da a la administración
--    de la Prestadora. Al Coordinador no: si se lo limita a su zona está por decidirse, y hasta
--    entonces esas dos escrituras siguen con la llave de servicio.
--
-- 4. Dos tablas de configuración que el Panel escribe o lee sin permiso de tabla: el pago de los
--    Asistentes y las conexiones con software externo.
--
-- 5. Las llaves del dispositivo: entrar con huella o con cara. Quien ya entró lista sus llaves,
--    agrega una y la da de baja, y para agregarla guarda y gasta un desafío. Sólo las propias, en su
--    Prestadora.
--
-- Qué NO cubre:
--   · Los reportes sin Servicio y las tres políticas que esperan una decisión (el Coordinador
--     acotado a su zona, los pendientes de conformidad, las invitaciones sólo cuando la guardia se
--     ofrece).
--   · Escribir una conexión con software externo con la credencial de la persona: la función que
--     lo hace recibe la Prestadora por parámetro y sólo la ejecuta la llave de servicio.
--   · Las políticas del trabajo sin persona, que no cambian.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 1. El Legajo, no la cuenta
-- ─────────────────────────────────────────────────────────────────────────────────────────────

-- Los pacientes que atiende el Asistente de la sesión: los de sus guardias, en su Prestadora. La
-- usan las políticas de pacientes, autorizaciones de monitoreo, rangos de vitales, indicaciones de
-- medicación y recetas del depósito, así que conserva `authenticated`.
CREATE OR REPLACE FUNCTION interno.pacientes_del_asistente()
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'interno'
AS $$
  SELECT gp.paciente_id
    FROM guardia_pacientes gp
    JOIN guardias g ON g.id = gp.guardia_id
   WHERE g.asistente_id = interno.asistente_de_la_sesion()
     AND g.prestadora_id = interno.current_tenant()
$$;

REVOKE ALL ON FUNCTION interno.pacientes_del_asistente() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION interno.pacientes_del_asistente() TO authenticated;

-- Las fotos de los reportes: carpeta de la Prestadora y, adentro, la de una guardia suya.
DROP POLICY IF EXISTS reportes_asistente_sube_foto_de_su_guardia ON storage.objects;
CREATE POLICY reportes_asistente_sube_foto_de_su_guardia
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'reportes-fotos'
    AND (storage.foldername(name))[1] = interno.current_tenant()::text
    AND EXISTS (
      SELECT 1 FROM public.guardias g
       WHERE g.asistente_id = interno.asistente_de_la_sesion()
         AND g.prestadora_id = interno.current_tenant()
         AND (storage.foldername(objects.name))[2] = g.id::text
    )
  );

DROP POLICY IF EXISTS reportes_asistente_lee_fotos_de_sus_guardias ON storage.objects;
CREATE POLICY reportes_asistente_lee_fotos_de_sus_guardias
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'reportes-fotos'
    AND (storage.foldername(name))[1] = interno.current_tenant()::text
    AND EXISTS (
      SELECT 1 FROM public.guardias g
       WHERE g.asistente_id = interno.asistente_de_la_sesion()
         AND g.prestadora_id = interno.current_tenant()
         AND (storage.foldername(objects.name))[2] = g.id::text
    )
  );

-- La matrícula: la ruta la arma el backend con el Legajo (`rutaDeMatriculaNueva`), así que la
-- política compara contra el Legajo. Sin Legajo en esta Prestadora, la comparación da nula y no
-- pasa.
DROP POLICY IF EXISTS prescripciones_asistente_sube_su_matricula ON storage.objects;
CREATE POLICY prescripciones_asistente_sube_su_matricula
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'prescripciones-medicacion'
    AND (storage.foldername(name))[1] = interno.current_tenant()::text
    AND (storage.foldername(name))[2] = 'matriculas'
    AND (storage.foldername(name))[3] = interno.asistente_de_la_sesion()::text
  );

DROP POLICY IF EXISTS prescripciones_asistente_lee_su_matricula ON storage.objects;
CREATE POLICY prescripciones_asistente_lee_su_matricula
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'prescripciones-medicacion'
    AND (storage.foldername(name))[1] = interno.current_tenant()::text
    AND (storage.foldername(name))[2] = 'matriculas'
    AND (storage.foldername(name))[3] = interno.asistente_de_la_sesion()::text
  );

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 2. Lo que el Asistente hace durante su guardia
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- En las cuatro, la misma condición que ya usan los reportes y las comprobaciones: la fila es de
-- la Prestadora de la sesión y de una guardia cuyo Asistente es el Legajo de la sesión. Quien deja
-- constancia (`registrado_por`, `reportado_por`) es la cuenta, y tiene que ser la propia.

-- El descanso: lo empieza, lo ve y lo termina. Terminarlo es escribir el fin, nada más.
CREATE POLICY asistente_ve_descansos_de_su_guardia
  ON public.descansos_guardia FOR SELECT TO authenticated
  USING (
    prestadora_id = interno.current_tenant()
    AND EXISTS (SELECT 1 FROM public.guardias g
                 WHERE g.id = descansos_guardia.guardia_id
                   AND g.asistente_id = interno.asistente_de_la_sesion())
  );

CREATE POLICY asistente_empieza_descanso_en_su_guardia
  ON public.descansos_guardia FOR INSERT TO authenticated
  WITH CHECK (
    prestadora_id = interno.current_tenant()
    AND registrado_por = auth.uid()
    AND fin_at IS NULL
    AND EXISTS (SELECT 1 FROM public.guardias g
                 WHERE g.id = descansos_guardia.guardia_id
                   AND g.asistente_id = interno.asistente_de_la_sesion())
  );

CREATE POLICY asistente_termina_su_descanso
  ON public.descansos_guardia FOR UPDATE TO authenticated
  USING (
    prestadora_id = interno.current_tenant()
    AND fin_at IS NULL
    AND EXISTS (SELECT 1 FROM public.guardias g
                 WHERE g.id = descansos_guardia.guardia_id
                   AND g.asistente_id = interno.asistente_de_la_sesion())
  )
  WITH CHECK (
    prestadora_id = interno.current_tenant()
    AND EXISTS (SELECT 1 FROM public.guardias g
                 WHERE g.id = descansos_guardia.guardia_id
                   AND g.asistente_id = interno.asistente_de_la_sesion())
  );

-- El aviso de demora: sólo el que él mismo da. Las demás alertas tempranas de su guardia las
-- genera el sistema para el Coordinador y no son suyas.
CREATE POLICY asistente_ve_su_aviso_de_demora
  ON public.alertas_tempranas_guardia FOR SELECT TO authenticated
  USING (
    prestadora_id = interno.current_tenant()
    AND fuente = 'aviso_demora_asistente'
    AND EXISTS (SELECT 1 FROM public.guardias g
                 WHERE g.id = alertas_tempranas_guardia.guardia_id
                   AND g.asistente_id = interno.asistente_de_la_sesion())
  );

CREATE POLICY asistente_avisa_demora_en_su_guardia
  ON public.alertas_tempranas_guardia FOR INSERT TO authenticated
  WITH CHECK (
    prestadora_id = interno.current_tenant()
    AND fuente = 'aviso_demora_asistente'
    AND reportado_por = auth.uid()
    AND EXISTS (SELECT 1 FROM public.guardias g
                 WHERE g.id = alertas_tempranas_guardia.guardia_id
                   AND g.asistente_id = interno.asistente_de_la_sesion())
  );

CREATE POLICY asistente_anota_el_envio_de_su_aviso_de_demora
  ON public.alertas_tempranas_guardia FOR UPDATE TO authenticated
  USING (
    prestadora_id = interno.current_tenant()
    AND fuente = 'aviso_demora_asistente'
    AND reportado_por = auth.uid()
    AND EXISTS (SELECT 1 FROM public.guardias g
                 WHERE g.id = alertas_tempranas_guardia.guardia_id
                   AND g.asistente_id = interno.asistente_de_la_sesion())
  )
  WITH CHECK (
    prestadora_id = interno.current_tenant()
    AND fuente = 'aviso_demora_asistente'
    AND reportado_por = auth.uid()
    AND EXISTS (SELECT 1 FROM public.guardias g
                 WHERE g.id = alertas_tempranas_guardia.guardia_id
                   AND g.asistente_id = interno.asistente_de_la_sesion())
  );

-- La emergencia: la da, la ve y anota que salió el aviso. Darla por atendida no es de él.
CREATE POLICY asistente_ve_emergencias_de_su_guardia
  ON public.emergencias_guardia FOR SELECT TO authenticated
  USING (
    prestadora_id = interno.current_tenant()
    AND EXISTS (SELECT 1 FROM public.guardias g
                 WHERE g.id = emergencias_guardia.guardia_id
                   AND g.asistente_id = interno.asistente_de_la_sesion())
  );

CREATE POLICY asistente_avisa_emergencia_en_su_guardia
  ON public.emergencias_guardia FOR INSERT TO authenticated
  WITH CHECK (
    prestadora_id = interno.current_tenant()
    AND reportado_por = auth.uid()
    AND atendida_at IS NULL
    AND atendida_por IS NULL
    AND atendida_nota IS NULL
    AND EXISTS (SELECT 1 FROM public.guardias g
                 WHERE g.id = emergencias_guardia.guardia_id
                   AND g.asistente_id = interno.asistente_de_la_sesion())
  );

CREATE POLICY asistente_anota_el_envio_de_su_emergencia
  ON public.emergencias_guardia FOR UPDATE TO authenticated
  USING (
    prestadora_id = interno.current_tenant()
    AND reportado_por = auth.uid()
    AND EXISTS (SELECT 1 FROM public.guardias g
                 WHERE g.id = emergencias_guardia.guardia_id
                   AND g.asistente_id = interno.asistente_de_la_sesion())
  )
  WITH CHECK (
    prestadora_id = interno.current_tenant()
    AND reportado_por = auth.uid()
    AND atendida_at IS NULL
    AND atendida_por IS NULL
    AND atendida_nota IS NULL
    AND EXISTS (SELECT 1 FROM public.guardias g
                 WHERE g.id = emergencias_guardia.guardia_id
                   AND g.asistente_id = interno.asistente_de_la_sesion())
  );

-- La extensión del turno la abre el sistema. El Asistente la ve mientras está abierta y avisa que
-- no puede continuar.
CREATE POLICY asistente_ve_la_extension_de_su_turno
  ON public.extensiones_de_turno FOR SELECT TO authenticated
  USING (
    prestadora_id = interno.current_tenant()
    AND EXISTS (SELECT 1 FROM public.guardias g
                 WHERE g.id = extensiones_de_turno.guardia_id
                   AND g.asistente_id = interno.asistente_de_la_sesion())
  );

CREATE POLICY asistente_avisa_que_no_puede_continuar
  ON public.extensiones_de_turno FOR UPDATE TO authenticated
  USING (
    prestadora_id = interno.current_tenant()
    AND hasta_at IS NULL
    AND EXISTS (SELECT 1 FROM public.guardias g
                 WHERE g.id = extensiones_de_turno.guardia_id
                   AND g.asistente_id = interno.asistente_de_la_sesion())
  )
  WITH CHECK (
    prestadora_id = interno.current_tenant()
    AND hasta_at IS NULL
    AND EXISTS (SELECT 1 FROM public.guardias g
                 WHERE g.id = extensiones_de_turno.guardia_id
                   AND g.asistente_id = interno.asistente_de_la_sesion())
  );

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 3. Lo que la administración hace desde el Panel en esas tablas
-- ─────────────────────────────────────────────────────────────────────────────────────────────

-- Cargar un descanso que no se marcó a tiempo: entra ya terminado y con quien lo cargó.
CREATE POLICY la_administracion_carga_un_descanso
  ON public.descansos_guardia FOR INSERT TO authenticated
  WITH CHECK (
    prestadora_id = interno.current_tenant()
    AND interno.es_la_administracion_de_la_prestadora(prestadora_id)
    AND registrado_por = auth.uid()
    AND fin_at IS NOT NULL
  );

-- Dar por atendida una emergencia: una sola vez, con nombre y hora. Lo que ya se atendió no se
-- vuelve a tocar. La política de la información de salud sigue rigiendo: quien no atiende al
-- paciente no la ve, y lo que no ve no lo puede marcar.
CREATE POLICY la_administracion_atiende_una_emergencia
  ON public.emergencias_guardia FOR UPDATE TO authenticated
  USING (
    prestadora_id = interno.current_tenant()
    AND interno.es_la_administracion_de_la_prestadora(prestadora_id)
    AND atendida_at IS NULL
  )
  WITH CHECK (
    prestadora_id = interno.current_tenant()
    AND interno.es_la_administracion_de_la_prestadora(prestadora_id)
    AND atendida_at IS NOT NULL
    AND atendida_por = auth.uid()
  );

-- Los permisos de tabla. Las columnas de actualización son las que se escriben, ni una más: el
-- permiso por columna vale para todo `authenticated`, así que ninguna política puede abrir otra.
-- `alertas_tempranas_guardia` ya tiene los permisos de tabla que usa el Panel, y no se tocan.
GRANT INSERT ON public.descansos_guardia TO authenticated;
GRANT UPDATE (fin_at, cliente_uuid_fin) ON public.descansos_guardia TO authenticated;

GRANT INSERT ON public.emergencias_guardia TO authenticated;
GRANT UPDATE (ultima_notificacion_at, veces_notificado, atendida_at, atendida_por, atendida_nota)
  ON public.emergencias_guardia TO authenticated;

GRANT UPDATE (no_puede_continuar_at, no_puede_continuar_detalle, ultima_notificacion_at, veces_notificado)
  ON public.extensiones_de_turno TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 4. La configuración que el Panel escribe o lee
-- ─────────────────────────────────────────────────────────────────────────────────────────────

-- El pago de los Asistentes: las políticas de alta y de edición ya dicen que es de la
-- administración; faltaba el permiso de tabla. Se guarda cargando o pisando la fila de la
-- Prestadora, que pide las dos cosas.
GRANT INSERT, UPDATE ON public.configuracion_pago_asistentes TO authenticated;

-- Las conexiones con software externo: qué software tiene conectado cada clase. La lee sólo la
-- administración, que es la única que entra a esa pantalla; la política anterior dejaba leerla a
-- cualquiera con sesión en la Prestadora. La credencial no está en la tabla: queda la referencia
-- a la bóveda, que sin la llave de servicio no abre nada.
DROP POLICY IF EXISTS panel_lee_conexiones_con_software_externo ON public.conexiones_con_software_externo;
CREATE POLICY la_administracion_lee_conexiones_con_software_externo
  ON public.conexiones_con_software_externo FOR SELECT TO authenticated
  USING (
    prestadora_id = interno.current_tenant()
    AND interno.es_la_administracion_de_la_prestadora(prestadora_id)
  );

GRANT SELECT ON public.conexiones_con_software_externo TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 5. Las llaves del dispositivo
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- La persona es la cuenta (`usuario_id = auth.uid()`) en la Prestadora de la sesión. La llave y el
-- desafío llevan el rol de la aplicación, y tiene que ser el de quien los pide: un Asistente no da
-- de alta una llave de Cliente. Ni la llave ni el desafío se borran: la llave se revoca y el
-- desafío se gasta.

CREATE POLICY persona_ve_sus_llaves
  ON public.llaves_de_dispositivo FOR SELECT TO authenticated
  USING (
    prestadora_id = interno.current_tenant()
    AND usuario_id = auth.uid()
  );

CREATE POLICY persona_agrega_su_llave
  ON public.llaves_de_dispositivo FOR INSERT TO authenticated
  WITH CHECK (
    prestadora_id = interno.current_tenant()
    AND usuario_id = auth.uid()
    AND revocada_en IS NULL
    AND ((rol = 'asistente' AND interno.es_asistente())
      OR (rol = 'cliente' AND interno.es_cliente()))
  );

CREATE POLICY persona_revoca_su_llave
  ON public.llaves_de_dispositivo FOR UPDATE TO authenticated
  USING (
    prestadora_id = interno.current_tenant()
    AND usuario_id = auth.uid()
    AND revocada_en IS NULL
  )
  WITH CHECK (
    prestadora_id = interno.current_tenant()
    AND usuario_id = auth.uid()
    AND revocada_en IS NOT NULL
  );

GRANT SELECT, INSERT ON public.llaves_de_dispositivo TO authenticated;
GRANT UPDATE (revocada_en) ON public.llaves_de_dispositivo TO authenticated;

-- El desafío del alta. El de la entrada lo emite el trabajo sin persona, porque quien entra todavía
-- no tiene sesión; con sesión sólo se pide el del alta, y es de quien lo pidió.
CREATE POLICY persona_ve_sus_desafios_de_alta
  ON public.desafios_de_llave FOR SELECT TO authenticated
  USING (
    prestadora_id = interno.current_tenant()
    AND usuario_id = auth.uid()
    AND para = 'alta'
  );

CREATE POLICY persona_pide_desafio_de_alta
  ON public.desafios_de_llave FOR INSERT TO authenticated
  WITH CHECK (
    prestadora_id = interno.current_tenant()
    AND usuario_id = auth.uid()
    AND para = 'alta'
    AND usado_en IS NULL
    AND ((rol = 'asistente' AND interno.es_asistente())
      OR (rol = 'cliente' AND interno.es_cliente()))
  );

CREATE POLICY persona_gasta_su_desafio_de_alta
  ON public.desafios_de_llave FOR UPDATE TO authenticated
  USING (
    prestadora_id = interno.current_tenant()
    AND usuario_id = auth.uid()
    AND para = 'alta'
    AND usado_en IS NULL
  )
  WITH CHECK (
    prestadora_id = interno.current_tenant()
    AND usuario_id = auth.uid()
    AND para = 'alta'
    AND usado_en IS NOT NULL
  );

GRANT SELECT, INSERT ON public.desafios_de_llave TO authenticated;
GRANT UPDATE (usado_en) ON public.desafios_de_llave TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
