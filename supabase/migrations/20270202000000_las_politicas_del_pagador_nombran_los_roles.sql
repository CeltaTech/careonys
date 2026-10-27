-- Las dos políticas de lectura del Pagador se llamaban por una expresión que no está en el
-- glosario. Pasan a nombrar los dos roles que la condición deja pasar: el Administrador y el
-- Coordinador. La condición no cambia.

ALTER POLICY consentimientos_pagador_los_lee_el_personal ON public.consentimientos_pagador
  RENAME TO consentimientos_pagador_los_leen_administrador_y_coordinador;

ALTER POLICY documentos_pagador_los_lee_el_personal ON public.documentos_pagador
  RENAME TO documentos_pagador_los_leen_administrador_y_coordinador;

NOTIFY pgrst, 'reload schema';
