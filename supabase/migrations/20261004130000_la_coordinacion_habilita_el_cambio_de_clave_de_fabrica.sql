-- La coordinación habilita el cambio de clave, de fábrica
-- =====================================================================================
--
-- QUÉ ESTABA MAL. `habilitar_cambio_de_clave` nació reservada a la administración de la Prestadora
-- (`default_solo_admin = true`), copiando el molde de `ver_pagos_asistente`. Pero la regla dice otra
-- cosa: **a un Asistente y a una Familia los habilita la coordinación; a quien coordina lo habilita
-- la administración**. Con el valor de fábrica de ayer, quien coordina no veía la lista de números
-- esperando, no podía atender ese llamado y no podía habilitar a nadie hasta que cada Prestadora,
-- una por una, se lo diera a mano. La tarea pendiente le aparecía a quien no la tiene a cargo.
--
-- QUÉ CAMBIA Y QUÉ NO. Cambia el valor de fábrica de esa acción, y nada más.
--
--   * EL ESCALÓN NO SE TOCA. Quien coordina sigue sin poder habilitarse a sí mismo y sin poder
--     habilitar a otro que coordine: eso no es un permiso configurable, es la regla de que se
--     habilita hacia abajo, y vive en el motor y en el disparador
--     `interno.se_habilita_hacia_abajo_y_nunca_a_uno_mismo`. Darle la acción a la coordinación le da
--     alcance sobre los Asistentes y las Familias, sobre nadie más.
--   * SIGUE SIENDO CONFIGURABLE. Es un valor de fábrica, no una imposición: la Prestadora que
--     prefiera reservarlo a su administración lo cambia desde su Configuración, y la que ya lo
--     configuró conserva lo que eligió —esta migración no toca ninguna fila de
--     `permisos_prestadora`—.
--   * NO CAMBIA NADA DE CÓMO SE ENTRA NI DE CÓMO SE RECUPERA LA CLAVE. Eso es igual para todas las
--     Prestadoras y no entra en su configuración. Lo único que se reparte acá es **quién** atiende
--     ese llamado, que es reparto de trabajo adentro de la Prestadora.
--
-- SIGUE AUDITADO IGUAL. Quién habilitó a quién y cuándo queda en `registro_actividad`, con las
-- acciones `habilitacion_de_cambio_de_clave` y `confirmacion_de_telefono_por_la_prestadora`, que ya
-- existen. No se agrega ningún registro nuevo ni ningún dato nuevo adentro de los que hay.
-- =====================================================================================

BEGIN;

UPDATE public.catalogo_acciones_permisos
   SET default_solo_admin = false
 WHERE accion = 'habilitar_cambio_de_clave';

-- La acción tiene que existir: si no está en el catálogo, `tiene_permiso_de` contesta que no y la
-- coordinación se queda sin nada, que es justo lo que esto viene a corregir.
DO $comprobacion$
DECLARE
  v_solo_admin boolean;
BEGIN
  SELECT default_solo_admin INTO v_solo_admin
    FROM public.catalogo_acciones_permisos
   WHERE accion = 'habilitar_cambio_de_clave';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'habilitar_cambio_de_clave no esta en el catalogo de acciones de permisos';
  END IF;
  IF v_solo_admin THEN
    RAISE EXCEPTION 'habilitar_cambio_de_clave sigue reservada a la administracion';
  END IF;

  -- El control roto a propósito: las otras dos acciones que sí nacen reservadas tienen que seguir
  -- reservadas. Sin esto, una migración que hubiera abierto el catálogo entero pasaría igual.
  IF EXISTS (
    SELECT 1 FROM public.catalogo_acciones_permisos
     WHERE accion IN ('ver_pagos_asistente', 'ver_estado_de_cuenta_familia')
       AND NOT default_solo_admin
  ) THEN
    RAISE EXCEPTION 'se abrio alguna accion que tenia que seguir reservada a la administracion';
  END IF;
END;
$comprobacion$;

COMMIT;

NOTIFY pgrst, 'reload schema';
