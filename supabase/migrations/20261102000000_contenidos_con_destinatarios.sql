-- CONTENIDOS: UNA SOLA BIBLIOTECA, Y CADA PIEZA DICE PARA QUIÉN ES.
--
-- La biblioteca que la Prestadora escribía para sus Clientes pasa a servir a tres destinatarios:
-- Clientes, Asistentes y su propio personal. Cada pieza marca uno o más. Lo que no está publicado
-- existe solamente para quien escribe, y lo publicado lo ve cada destinatario marcado.
--
-- El nombre guardado deja de decir «para clientes», porque ya no lo es. La tabla no tiene filas y
-- el permiso no tiene ninguna configuración guardada, así que no se pierde nada al renombrar.

BEGIN;

-- 1. La tabla y lo que cuelga de ella, con el nombre nuevo.
ALTER TABLE public.contenidos_para_clientes RENAME TO contenidos;

ALTER TABLE public.contenidos RENAME CONSTRAINT contenidos_para_clientes_pkey TO contenidos_pkey;
ALTER TABLE public.contenidos RENAME CONSTRAINT contenidos_para_clientes_id_prestadora TO contenidos_id_prestadora;
ALTER TABLE public.contenidos RENAME CONSTRAINT contenidos_para_clientes_cuerpo_con_texto TO contenidos_cuerpo_con_texto;
ALTER TABLE public.contenidos RENAME CONSTRAINT contenidos_para_clientes_titulo_con_texto TO contenidos_titulo_con_texto;
ALTER TABLE public.contenidos RENAME CONSTRAINT contenidos_para_clientes_enlace_es_https TO contenidos_enlace_es_https;
ALTER TABLE public.contenidos RENAME CONSTRAINT contenidos_para_clientes_creado_por_fkey TO contenidos_creado_por_fkey;
ALTER TABLE public.contenidos RENAME CONSTRAINT contenidos_para_clientes_prestadora_id_fkey TO contenidos_prestadora_id_fkey;
ALTER INDEX public.contenidos_para_clientes_titulo_unico RENAME TO contenidos_titulo_unico;
ALTER INDEX public.contenidos_para_clientes_por_orden RENAME TO contenidos_por_orden;

-- 2. Para quién es cada pieza. Publicada, tiene que tener al menos un destinatario.
ALTER TABLE public.contenidos
  ADD COLUMN destinatarios text[] NOT NULL DEFAULT '{}',
  ADD CONSTRAINT contenidos_destinatarios_conocidos
    CHECK (destinatarios <@ ARRAY['clientes', 'asistentes', 'personal']::text[]),
  ADD CONSTRAINT contenidos_publicado_con_destinatarios
    CHECK (NOT publicado OR cardinality(destinatarios) > 0);

COMMENT ON TABLE public.contenidos IS 'La biblioteca que cada Prestadora escribe para su gente: Clientes, Asistentes y su propio personal. Sin siembra de fábrica y sin traducción: lo escribe la Prestadora.';
COMMENT ON COLUMN public.contenidos.destinatarios IS 'Quiénes ven la pieza una vez publicada: clientes, asistentes, personal. Uno o más.';
COMMENT ON COLUMN public.contenidos.publicado IS 'Si la ven sus destinatarios. Sin publicar, la pieza existe solamente para quien escribe contenidos.';

-- 3. El permiso, con el nombre nuevo. Ninguna Prestadora lo configuró todavía.
UPDATE public.catalogo_acciones_permisos
   SET accion = 'publicar_contenidos'
 WHERE accion = 'escribir_contenido_para_clientes';

-- 4. Quién ve qué. Escribe quien tiene el permiso, y ve todo, borradores incluidos. Cada
--    destinatario ve sólo lo publicado para él, en su propia Prestadora.
DROP POLICY admin_prestadora_escribe_su_contenido ON public.contenidos;
DROP POLICY cliente_ve_el_contenido_publicado ON public.contenidos;
DROP POLICY prestadora_lee_su_contenido ON public.contenidos;

CREATE POLICY quien_publica_escribe_los_contenidos ON public.contenidos
  USING (prestadora_id = interno.current_tenant() AND interno.tiene_permiso('publicar_contenidos'))
  WITH CHECK (prestadora_id = interno.current_tenant() AND interno.tiene_permiso('publicar_contenidos'));

CREATE POLICY el_personal_ve_lo_publicado_para_el ON public.contenidos FOR SELECT
  USING (
    publicado
    AND 'personal' = ANY (destinatarios)
    AND prestadora_id = interno.current_tenant()
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
       WHERE u.id = auth.uid()
         AND u.rol = ANY (ARRAY['admin_prestadora', 'coordinador', 'superadmin'])
    )
  );

CREATE POLICY el_cliente_ve_lo_publicado_para_el ON public.contenidos FOR SELECT
  USING (
    publicado
    AND 'clientes' = ANY (destinatarios)
    AND prestadora_id = (
      SELECT f.prestadora_id FROM public.clientes f
       WHERE f.id = interno.cliente_id_de_usuario(auth.uid())
    )
  );

CREATE POLICY el_asistente_ve_lo_publicado_para_el ON public.contenidos FOR SELECT
  USING (
    publicado
    AND 'asistentes' = ANY (destinatarios)
    AND prestadora_id = interno.current_tenant()
    AND interno.es_asistente()
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
