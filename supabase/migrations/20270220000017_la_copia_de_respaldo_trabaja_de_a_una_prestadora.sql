-- La copia de respaldo trabaja de a una Prestadora.
--
-- La migración anterior le dejó leer los archivos de todas las Prestadoras con una sola
-- credencial: era la puerta que el aislamiento no admite (celtatech/CLAUDE.md, «Aislamiento entre
-- Organizaciones»). Ahora entra como todo trabajo sin persona: su credencial dice para qué
-- Prestadora trabaja, y la base le deja ver sólo la carpeta de esa Prestadora. Sin Prestadora no
-- ve ningún archivo.
--
-- La Prestadora la resuelve `interno.prestadora_actual()`, la misma función de todas las reglas:
-- se le suma este rol a su tercer caso, y nada más cambia.

CREATE OR REPLACE FUNCTION interno.prestadora_actual()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'interno'
AS $function$
  SELECT COALESCE(
    -- 1. El permiso de acceso que CeltaTech abrió para esta cuenta, mientras está vigente. Tapa
    --    todo lo demás.
    (SELECT s.prestadora_id FROM permisos_de_acceso s
      WHERE s.admin_id = auth.uid()
        AND s.salida_at IS NULL
        AND s.expira_at > NOW()
        AND s.ultima_actividad_at > NOW() - INTERVAL '5 minutes'
      ORDER BY s.entrada_at DESC LIMIT 1),

    -- 2. La Prestadora de la cuenta con la que se entró, si la cuenta no está desactivada. Es una
    --    sola: para trabajar en otra hay que salir de ésta y entrar allá, con la cuenta de allá.
    (SELECT prestadora_id FROM usuarios WHERE id = auth.uid() AND desactivada_en IS NULL),

    -- 3. El trabajo sin persona y la copia de respaldo: la Prestadora para la que el backend
    --    generó su credencial.
    (SELECT NULLIF(auth.jwt() ->> 'prestadora_id', '')::uuid
      WHERE auth.jwt() ->> 'role' IN ('trabajo_sin_persona', 'copia_de_respaldo'))
  )
$function$;

-- Las reglas evalúan la función con los permisos de quien consulta.
GRANT USAGE ON SCHEMA interno TO copia_de_respaldo;
GRANT EXECUTE ON FUNCTION interno.prestadora_actual() TO copia_de_respaldo;

DROP POLICY copia_de_respaldo_ve_los_depositos ON storage.buckets;
DROP POLICY copia_de_respaldo_lee_los_archivos ON storage.objects;

-- Qué depósitos hay no es dato de ninguna Prestadora, pero sin Prestadora tampoco eso.
CREATE POLICY copia_de_respaldo_ve_los_depositos ON storage.buckets
  FOR SELECT TO copia_de_respaldo
  USING (interno.prestadora_actual() IS NOT NULL);

CREATE POLICY copia_de_respaldo_lee_los_archivos_de_su_prestadora ON storage.objects
  FOR SELECT TO copia_de_respaldo
  USING ((storage.foldername(name))[1] = (interno.prestadora_actual())::text);

NOTIFY pgrst, 'reload schema';
