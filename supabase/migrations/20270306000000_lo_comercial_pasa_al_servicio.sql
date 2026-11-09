-- Lo comercial de una contratación pasa del Cliente al Servicio.
--
-- El Responsable de pagos, lo que firma, sus documentos, el plazo de pago y el Contratante son de
-- cada Servicio: un mismo Cliente puede tener dos Servicios con distinto Responsable de pagos. Y
-- la factura es una por Servicio y por período. La deuda sigue siendo del Cliente.
--
-- Esta es la primera de tres partes, para que nada deje de andar mientras se hace el cambio:
--   1. (ésta) Se agregan los lugares nuevos en el Servicio y se copia lo que hoy está en el Cliente.
--      Lo viejo queda como está y el código lo sigue usando.
--   2. El código pasa a leer y escribir en el Servicio.
--   3. Se vuelve a copiar lo que se haya escrito en el Cliente entre medio, y se borra lo viejo.
--
-- Hoy ningún Cliente tiene más de un Servicio, así que cada dato tiene un solo lugar adonde ir.
-- La copia sólo toma al Cliente que tiene exactamente un Servicio: si alguno tuviera más, ese dato
-- no se adivina y queda para la tercera parte.

BEGIN;

-- ── El Servicio guarda su Responsable de pagos, su plazo y su Contratante ──────────────────────

ALTER TABLE public.servicios
  ADD COLUMN pagador_tipo text,
  ADD COLUMN pagador_persona_id uuid,
  ADD COLUMN dias_hasta_el_vencimiento smallint,
  ADD COLUMN contratante_persona_id uuid;

ALTER TABLE public.servicios
  ADD CONSTRAINT servicios_pagador_conocido
    CHECK (pagador_tipo IS NULL OR pagador_tipo = ANY (ARRAY['cliente', 'obra_social', 'otro'])),
  ADD CONSTRAINT servicios_dias_hasta_el_vencimiento_check
    CHECK (dias_hasta_el_vencimiento IS NULL
           OR (dias_hasta_el_vencimiento >= 0 AND dias_hasta_el_vencimiento <= 365)),
  ADD CONSTRAINT servicios_pagador_de_la_misma_prestadora
    FOREIGN KEY (pagador_persona_id, prestadora_id) REFERENCES public.personas (id, prestadora_id),
  ADD CONSTRAINT servicios_contratante_de_la_misma_prestadora
    FOREIGN KEY (contratante_persona_id, prestadora_id) REFERENCES public.personas (id, prestadora_id);

-- ── Lo firmado, los documentos y la factura cuelgan del Servicio ───────────────────────────────

ALTER TABLE public.consentimientos_pagador ADD COLUMN servicio_id uuid;
ALTER TABLE public.consentimientos_pagador
  ADD CONSTRAINT consentimientos_pagador_servicio_de_la_misma_prestadora
    FOREIGN KEY (servicio_id, prestadora_id) REFERENCES public.servicios (id, prestadora_id);
CREATE INDEX consentimientos_pagador_por_servicio
  ON public.consentimientos_pagador (servicio_id, created_at DESC);
CREATE UNIQUE INDEX consentimientos_pagador_uno_pendiente_por_servicio
  ON public.consentimientos_pagador (servicio_id) WHERE estado = 'pendiente_firma';

ALTER TABLE public.documentos_pagador ADD COLUMN servicio_id uuid;
ALTER TABLE public.documentos_pagador
  ADD CONSTRAINT documentos_pagador_servicio_de_la_misma_prestadora
    FOREIGN KEY (servicio_id, prestadora_id) REFERENCES public.servicios (id, prestadora_id);
CREATE UNIQUE INDEX documentos_pagador_uno_por_tipo_y_servicio
  ON public.documentos_pagador (servicio_id, tipo_documento_id);

ALTER TABLE public.facturas_cliente ADD COLUMN servicio_id uuid;
ALTER TABLE public.facturas_cliente
  ADD CONSTRAINT facturas_cliente_servicio_de_la_misma_prestadora
    FOREIGN KEY (servicio_id, prestadora_id) REFERENCES public.servicios (id, prestadora_id),
  ADD CONSTRAINT facturas_cliente_una_por_servicio_y_periodo UNIQUE (servicio_id, periodo);

-- ── Se copia lo que hoy está en el Cliente ─────────────────────────────────────────────────────

CREATE TEMP TABLE servicio_unico_del_cliente ON COMMIT DROP AS
  SELECT s.contratante_id AS cliente_id, (array_agg(s.id))[1] AS servicio_id
    FROM public.servicios s
   WHERE s.tipo_contratante = 'cliente'
   GROUP BY s.contratante_id
  HAVING count(*) = 1;

UPDATE public.servicios s
   SET pagador_tipo = c.pagador_tipo,
       pagador_persona_id = c.pagador_persona_id,
       dias_hasta_el_vencimiento = c.dias_hasta_el_vencimiento,
       contratante_persona_id = c.contratante_persona_id
  FROM servicio_unico_del_cliente u
  JOIN public.clientes c ON c.id = u.cliente_id
 WHERE s.id = u.servicio_id;

UPDATE public.consentimientos_pagador t
   SET servicio_id = u.servicio_id
  FROM servicio_unico_del_cliente u
 WHERE t.cliente_id = u.cliente_id AND t.servicio_id IS NULL;

UPDATE public.documentos_pagador t
   SET servicio_id = u.servicio_id
  FROM servicio_unico_del_cliente u
 WHERE t.cliente_id = u.cliente_id AND t.servicio_id IS NULL;

UPDATE public.facturas_cliente t
   SET servicio_id = u.servicio_id
  FROM servicio_unico_del_cliente u
 WHERE t.cliente_id = u.cliente_id AND t.servicio_id IS NULL;

NOTIFY pgrst, 'reload schema';

COMMIT;
