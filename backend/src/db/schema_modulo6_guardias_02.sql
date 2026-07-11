-- Módulo 6 — Guardias, Parte 1: enforcement a nivel de base de checkout_bloqueado
--
-- Diagnóstico (2026-07-10): checkout_bloqueado solo estaba impuesto por la UI del Panel
-- (GuardiaAcciones.jsx no muestra el botón de checkout si el flag es true), pero el Panel
-- escribe con la anon key (pública, vive en el cliente) y las policies RLS de `guardias`
-- (panel_gestiona_guardias, coordinador_gestiona_guardias_de_su_zona) son FOR ALL USING
-- sobre tenant/rol/zona únicamente — ninguna referencia a checkout_bloqueado ni WITH CHECK
-- separado. Sin este constraint, cualquier llamada directa a Supabase con esa key podía
-- fijar checkout_at aunque checkout_bloqueado=true, anulando la protección del protocolo de
-- continuidad de guardia diseñada para el caso de "Ausente sin relevo previo".
--
-- Este constraint no depende de que exista todavía la UI de excepción (eso es Parte 2):
-- hoy ninguna fila tiene checkout_bloqueado=true, así que no rompe nada al aplicarse; a
-- partir de la Parte 2, cualquier checkout sobre una guardia bloqueada solo será posible si
-- también se cargan los tres campos de excepción documentada.

ALTER TABLE guardias ADD CONSTRAINT guardias_checkout_bloqueado_requiere_excepcion
  CHECK (
    checkout_at IS NULL
    OR NOT checkout_bloqueado
    OR (checkout_excepcion_motivo IS NOT NULL
        AND checkout_excepcion_autorizado_por IS NOT NULL
        AND checkout_excepcion_at IS NOT NULL)
  );
