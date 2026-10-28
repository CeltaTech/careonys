-- La comprobación de presencia —el código QR que muestra el Cliente o el Asistente que se va, y el
-- pedido de autorización que contesta quien coordina— pasa al trabajo de la Prestadora, de a una
-- Prestadora por vez. Lo hacen el Asistente, el Cliente y el Panel, y los tres necesitan lo de
-- otro: el Asistente compara el código que mostró el Cliente, y la autorización de una llegada
-- deja autorizada la salida de otro Asistente. Por eso no va con la sesión de cada uno.

-- Los códigos: se guardan, se comparan y se borran los vencidos.
GRANT SELECT (prestadora_id, sujeto_tipo, sujeto_id, codigo_verificador, expira_en),
      INSERT (prestadora_id, sujeto_tipo, sujeto_id, codigo_verificador, expira_en),
      DELETE
  ON public.codigos_de_presencia TO trabajo_sin_persona;

CREATE POLICY trabajo_sin_persona_de_esta_prestadora ON public.codigos_de_presencia
  FOR ALL TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual())
  WITH CHECK (prestadora_id = interno.prestadora_actual());

-- Las comprobaciones: se leen enteras y se escriben con la guardia y el momento como clave.
GRANT SELECT ON public.guardia_comprobaciones TO trabajo_sin_persona;

GRANT INSERT (prestadora_id, guardia_id, asistente_id, momento, estado, medio, sujeto_tipo,
              sujeto_id, lat, lng, comprobada_en, pedido_en, motivo_sin_comprobar,
              motivo_detalle, updated_at, autorizada_por, motivo_del_pedido, detalle_del_pedido),
      UPDATE (prestadora_id, guardia_id, asistente_id, momento, estado, medio, sujeto_tipo,
              sujeto_id, lat, lng, comprobada_en, pedido_en, motivo_sin_comprobar,
              motivo_detalle, updated_at, autorizada_por, motivo_del_pedido, detalle_del_pedido)
  ON public.guardia_comprobaciones TO trabajo_sin_persona;

CREATE POLICY trabajo_sin_persona_de_esta_prestadora ON public.guardia_comprobaciones
  FOR ALL TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual())
  WITH CHECK (prestadora_id = interno.prestadora_actual());

NOTIFY pgrst, 'reload schema';
