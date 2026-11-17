-- Los secretos de terceros se cifran con la clave de cada Prestadora, y sale la caja fuerte de Supabase.
--
-- QUÉ HACE. Las contraseñas con las que cada Prestadora habla con otro software —las tres de
-- WhatsApp, los dos secretos con los que firman el software de cobranzas y el de facturación, la
-- del proveedor de mensajes de texto y la de cada software externo— se guardaban en la caja fuerte
-- de Supabase. Desde ahora se guardan en una tabla nueva, ya cifradas por el backend con una clave
-- distinta para cada Prestadora. La base no tiene esa clave: guarda sólo el texto cifrado.
--
-- POR QUÉ. La caja fuerte de Supabase cifra todo con una sola clave, y la abre cualquiera que
-- pueda llamar a sus funciones de lectura. Era una llave maestra: alcanzaba a todas las
-- Prestadoras a la vez. Con una clave por Prestadora, la clave de una no descifra nada de otra.
--
-- QUÉ SE COMPROBÓ ANTES DE BORRAR. En la base en la nube no había ninguna referencia cargada en
-- las siete columnas que salen: cero filas con algún valor. No hay ningún secreto que mudar. Igual,
-- si al correr aparece alguna, la migración se detiene entera y no borra nada.
--
-- CÓMO SE VUELVE ATRÁS. Con otra migración que cree de nuevo las siete columnas y las doce
-- funciones tal como estaban en la foto de la base, y que borre la tabla nueva. Los secretos que
-- se hubieran cargado mientras tanto se vuelven a cargar desde el Panel.
--
-- LA EXTENSIÓN DE LA CAJA FUERTE SE DEJA. La pone la plataforma en todo proyecto de Supabase y
-- no se puede quitar desde una migración. Sin funciones propias que la usen, queda vacía y sin
-- uso.

BEGIN;

-- Ninguna referencia cargada: si apareció alguna, no se borra nada.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.configuracion_whatsapp_prestadora
              WHERE token_secret_id IS NOT NULL
                 OR app_secret_secret_id IS NOT NULL
                 OR verify_token_secret_id IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.configuracion_facturacion_clientes
                 WHERE secreto_del_aviso_secret_id IS NOT NULL
                    OR secreto_del_aviso_de_facturacion_secret_id IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.configuracion_mensaje_de_texto_prestadora
                 WHERE token_secret_id IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.conexiones_con_software_externo
                 WHERE credencial_secret_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Hay secretos cargados en la caja fuerte: hay que mudarlos antes de borrarla';
  END IF;
END $$;

-- La tabla nueva. Una fila por Prestadora y por uso. El texto llega cifrado desde el backend; la
-- versión de la clave va al lado para poder cambiar la clave sin perder lo ya guardado.
CREATE TABLE public.secretos_de_terceros (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  prestadora_id uuid NOT NULL REFERENCES public.prestadoras(id) ON DELETE CASCADE,
  uso text NOT NULL,
  texto_cifrado text NOT NULL,
  version_de_clave integer NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT secretos_de_terceros_uso_conocido CHECK (uso = ANY (ARRAY[
    'whatsapp_access_token',
    'whatsapp_app_secret',
    'whatsapp_verify_token',
    'secreto_del_aviso_de_cobranza',
    'secreto_del_aviso_de_facturacion',
    'credencial_del_mensaje_de_texto',
    'credencial_software_facturacion',
    'credencial_software_creditos_y_cobranzas'
  ])),
  CONSTRAINT secretos_de_terceros_version_positiva CHECK (version_de_clave > 0),
  CONSTRAINT secretos_de_terceros_texto_no_vacio CHECK (length(texto_cifrado) > 0),
  CONSTRAINT secretos_de_terceros_uno_por_uso UNIQUE (prestadora_id, uso)
);

COMMENT ON TABLE public.secretos_de_terceros IS 'Las contraseñas con las que cada Prestadora habla con otro software. El backend las cifra con la clave de esa Prestadora antes de guardarlas; la base nunca tiene la clave ni el texto en claro.';
COMMENT ON COLUMN public.secretos_de_terceros.uso IS 'Para qué es la contraseña: cuál de las de WhatsApp, cuál de los avisos firmados, la del proveedor de mensajes de texto o la de un software externo.';
COMMENT ON COLUMN public.secretos_de_terceros.texto_cifrado IS 'El texto cifrado por el backend con la clave de esta Prestadora. Sin esa clave no se puede leer.';
COMMENT ON COLUMN public.secretos_de_terceros.version_de_clave IS 'Con qué versión de la clave de esta Prestadora se cifró. Permite cambiar la clave sin perder lo guardado con la anterior.';

-- Protección por fila. La tabla guarda secretos: la lee y la escribe sólo el backend, con el
-- trabajo de esa misma Prestadora. Nadie con sesión la toca, ni siquiera la administración.
ALTER TABLE public.secretos_de_terceros ENABLE ROW LEVEL SECURITY;

CREATE POLICY trabajo_sin_persona_de_esta_prestadora ON public.secretos_de_terceros
  TO trabajo_sin_persona
  USING (prestadora_id = interno.prestadora_actual())
  WITH CHECK (prestadora_id = interno.prestadora_actual());

REVOKE ALL ON TABLE public.secretos_de_terceros FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.secretos_de_terceros TO trabajo_sin_persona;

-- Salen las doce funciones de la caja fuerte.
DROP FUNCTION public.guardar_app_secret_whatsapp(uuid, text);
DROP FUNCTION public.guardar_token_whatsapp(uuid, text);
DROP FUNCTION public.guardar_verify_token_whatsapp(uuid, text);
DROP FUNCTION public.guardar_secreto_del_aviso_de_cobranza(uuid, text);
DROP FUNCTION public.guardar_secreto_del_aviso_de_facturacion(uuid, text);
DROP FUNCTION public.guardar_conexion_con_software_externo(uuid, text, text, text);
DROP FUNCTION public.leer_app_secret_whatsapp(uuid);
DROP FUNCTION public.leer_token_whatsapp(uuid);
DROP FUNCTION public.leer_verify_token_whatsapp(uuid);
DROP FUNCTION public.leer_secreto_del_aviso_de_cobranza(uuid);
DROP FUNCTION public.leer_secreto_del_aviso_de_facturacion(uuid);
DROP FUNCTION public.leer_credencial_de_software_externo(uuid, text);

-- Y salen las siete columnas que apuntaban a la caja fuerte.
ALTER TABLE public.configuracion_whatsapp_prestadora
  DROP COLUMN token_secret_id,
  DROP COLUMN app_secret_secret_id,
  DROP COLUMN verify_token_secret_id;
ALTER TABLE public.configuracion_facturacion_clientes
  DROP COLUMN secreto_del_aviso_secret_id,
  DROP COLUMN secreto_del_aviso_de_facturacion_secret_id;
ALTER TABLE public.configuracion_mensaje_de_texto_prestadora
  DROP COLUMN token_secret_id;
ALTER TABLE public.conexiones_con_software_externo
  DROP COLUMN credencial_secret_id;

COMMENT ON TABLE public.conexiones_con_software_externo IS 'Cual es el software de facturacion y cual el de creditos y cobranzas de cada Prestadora. La credencial con la que se entra vive cifrada en secretos_de_terceros. Aca no se factura ni se cobra: esto dice unicamente con quien habla.';
COMMENT ON TABLE public.configuracion_mensaje_de_texto_prestadora IS 'Con que proveedor manda mensajes de texto cada Prestadora. Sin fila no hay proveedor y la via no se puede elegir. La credencial vive cifrada en secretos_de_terceros.';

-- Elegir el software externo sigue siendo una función, ahora sin la credencial: la credencial la
-- guarda el backend, cifrada. Cambiar de software deja sin valor la credencial anterior, que es la
-- llave de otra puerta, y por eso se borra.
CREATE FUNCTION public.guardar_conexion_con_software_externo(p_prestadora_id uuid, p_clase text, p_software text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_software_anterior TEXT;
BEGIN
  IF NOT interno.le_corresponde(p_prestadora_id) THEN
    RAISE EXCEPTION 'la Prestadora no corresponde a quien llama' USING ERRCODE = '42501';
  END IF;

  SELECT software INTO v_software_anterior
  FROM conexiones_con_software_externo
  WHERE prestadora_id = p_prestadora_id AND clase = p_clase;

  INSERT INTO conexiones_con_software_externo (prestadora_id, clase, software)
  VALUES (p_prestadora_id, p_clase, p_software)
  ON CONFLICT (prestadora_id, clase)
  DO UPDATE SET software = EXCLUDED.software, updated_at = NOW();

  IF v_software_anterior IS DISTINCT FROM p_software THEN
    DELETE FROM secretos_de_terceros
     WHERE prestadora_id = p_prestadora_id
       AND uso = 'credencial_software_' || p_clase;
  END IF;
END;
$$;

ALTER FUNCTION public.guardar_conexion_con_software_externo(uuid, text, text) OWNER TO postgres;

COMMENT ON FUNCTION public.guardar_conexion_con_software_externo(uuid, text, text) IS 'Anota cual es el software de esa clase para esa Prestadora. Si cambio de software, borra la credencial cifrada del anterior.';

REVOKE ALL ON FUNCTION public.guardar_conexion_con_software_externo(uuid, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.guardar_conexion_con_software_externo(uuid, text, text) TO trabajo_sin_persona;

COMMIT;

NOTIFY pgrst, 'reload schema';
