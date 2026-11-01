-- LA LLEGADA TARDE Y LOS DOS CIERRES NUEVOS DEL PEDIDO DE RELEVO
--
-- Lo anotado del Asistente y el estado de la guardia son dos cosas. Si el titular marca la llegada
-- sobre una guardia que ya se había marcado ausente, la guardia empieza —pasa a activa, como
-- cualquier otra— y lo que queda anotado de él es la llegada tarde. La ausencia era provisoria.
--
-- El pedido de relevo de esa guardia se cierra como resuelto por el titular, y deja de insistirse.
-- Y se suma un cierre más desde el Panel: lo cubrió el Coordinador.

ALTER TABLE public.guardias
  ADD COLUMN llegada_tarde boolean NOT NULL DEFAULT false;

-- La marca la pone la base, nunca quien escribe: el teléfono no puede anotarse puntual ni el Panel
-- borrarle la tardanza a nadie. Corre después de `asistente_marca_solo_su_guardia` —los
-- disparadores van por orden alfabético—, así que ése no la ve como un cambio del Asistente.
CREATE FUNCTION interno.la_llegada_tarde_la_anota_la_base()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'interno'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.llegada_tarde := false;
    RETURN NEW;
  END IF;

  NEW.llegada_tarde := OLD.llegada_tarde
    OR (OLD.estado = 'ausente' AND OLD.checkin_at IS NULL AND NEW.checkin_at IS NOT NULL);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION interno.la_llegada_tarde_la_anota_la_base() FROM PUBLIC, anon;

CREATE TRIGGER llegada_tarde_la_anota_la_base
  BEFORE INSERT OR UPDATE ON public.guardias
  FOR EACH ROW EXECUTE FUNCTION interno.la_llegada_tarde_la_anota_la_base();

-- Los cierres. El titular nombra a un Asistente —el de la guardia—, igual que el relevo; el
-- Coordinador no nombra a nadie, porque quién fue lo anota la base en `resuelto_por_usuario`.
ALTER TABLE public.incidentes_relevo
  DROP CONSTRAINT incidentes_relevo_resuelto_por_tipo_check,
  DROP CONSTRAINT incidentes_relevo_resuelto_por_check;

ALTER TABLE public.incidentes_relevo
  ADD CONSTRAINT incidentes_relevo_resuelto_por_tipo_check
    CHECK (resuelto_por_tipo IN ('suplente', 'franquero', 'emergencia', 'titular', 'coordinador',
                                 'familiar', 'paciente_solo', 'nadie')),
  ADD CONSTRAINT incidentes_relevo_resuelto_por_check
    CHECK ((resuelto_por_id IS NOT NULL) = (resuelto_por_tipo IN ('suplente', 'franquero', 'emergencia', 'titular')));

-- Igual que antes, salvo el titular: si el Asistente que resuelve es el de la guardia y la guardia
-- no cambió de manos, no es un relevo, y el tipo no se deduce del personal de emergencia.
CREATE OR REPLACE FUNCTION interno.el_relevo_se_resuelve_como_paso()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'interno'
AS $function$
DECLARE
  v_asistente_del_turno uuid;
  v_llego_tarde boolean;
BEGIN
  -- Ya resuelto: queda como quedó.
  IF OLD.resuelto_at IS NOT NULL THEN
    NEW.resuelto_at := OLD.resuelto_at;
    NEW.resuelto_por_tipo := OLD.resuelto_por_tipo;
    NEW.resuelto_por_id := OLD.resuelto_por_id;
    NEW.resuelto_por_usuario := OLD.resuelto_por_usuario;
    RETURN NEW;
  END IF;

  IF NEW.resuelto_at IS NULL THEN
    NEW.resuelto_por_tipo := NULL;
    NEW.resuelto_por_id := NULL;
    NEW.resuelto_por_usuario := NULL;
    RETURN NEW;
  END IF;

  NEW.resuelto_por_usuario := interno.usuario_de_la_sesion();

  IF NEW.resuelto_por_id IS NOT NULL THEN
    SELECT g.asistente_id, g.llegada_tarde INTO v_asistente_del_turno, v_llego_tarde
      FROM guardias g
     WHERE g.id = NEW.guardia_entrante_id
       AND g.prestadora_id = NEW.prestadora_id;
    IF v_asistente_del_turno IS DISTINCT FROM NEW.resuelto_por_id THEN
      RAISE EXCEPTION 'relevo_con_otro_asistente' USING ERRCODE = '23514';
    END IF;

    -- Es el titular sólo si marcó la llegada sobre la guardia ausente: quien la cubre entra sobre
    -- una guardia que la reasignación ya volvió a programada, así que nunca llega tarde por esto.
    IF NEW.resuelto_por_tipo = 'titular' THEN
      IF NOT coalesce(v_llego_tarde, false) THEN
        RAISE EXCEPTION 'relevo_con_otro_asistente' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END IF;

    NEW.resuelto_por_tipo := coalesce(
      (SELECT pe.tipo
         FROM personal_emergencia pe
        WHERE pe.asistente_id = NEW.resuelto_por_id
          AND pe.prestadora_id = NEW.prestadora_id
          AND pe.activo
        ORDER BY (pe.tipo = 'franquero') DESC
        LIMIT 1),
      'suplente');
  END IF;

  RETURN NEW;
END;
$function$;

NOTIFY pgrst, 'reload schema';
