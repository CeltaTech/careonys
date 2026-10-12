-- Las cuentas de Clientes y Asistentes pasan al correo de acceso de su Prestadora.
--
-- Con el mismo correo, cada Prestadora tiene su propia cuenta: el servicio de acceso guarda un
-- correo interno armado con la Prestadora y el correo real (`backend/src/config/correoDeAcceso.js`),
-- y el correo real queda en `usuarios.email`. Las cuentas de las aplicaciones creadas antes de eso
-- tienen todavía el correo real en el servicio de acceso y nada en `usuarios.email`, así que con la
-- pantalla de ingreso nueva no podrían entrar. Ésta las pasa a la forma nueva.
--
-- Tiene que dar exactamente lo mismo que `correoDeAcceso`: el resumen SHA-256, en hexadecimal, de
-- `prestadora:correo`, los dos en minúsculas y el correo sin espacios a los costados.

CREATE TEMP TABLE cuentas_a_pasar ON COMMIT DROP AS
SELECT u.id,
       lower(btrim(a.email)) AS correo,
       encode(extensions.digest(lower(u.prestadora_id::text) || ':' || lower(btrim(a.email)), 'sha256'), 'hex')
         || '@acceso.careonys.invalid' AS acceso
  FROM public.usuarios u
  JOIN auth.users a ON a.id = u.id
 WHERE u.email IS NULL
   AND u.rol IN ('asistente', 'cliente')
   AND u.prestadora_id IS NOT NULL
   AND a.email IS NOT NULL
   AND a.email NOT LIKE '%@acceso.careonys.invalid';

UPDATE public.usuarios u
   SET email = c.correo
  FROM cuentas_a_pasar c
 WHERE u.id = c.id;

UPDATE auth.users a
   SET email = c.acceso
  FROM cuentas_a_pasar c
 WHERE a.id = c.id;

UPDATE auth.identities i
   SET identity_data = jsonb_set(i.identity_data, '{email}', to_jsonb(c.acceso))
  FROM cuentas_a_pasar c
 WHERE i.user_id = c.id
   AND i.provider = 'email';

NOTIFY pgrst, 'reload schema';
