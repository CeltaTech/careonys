-- Las coordenadas del domicilio temporal las calcula el sistema desde la dirección, como las del
-- domicilio habitual, y ya no las escribe nadie a mano.
--
-- Cuando el servicio de direcciones no ubica la puerta, el domicilio se guarda igual con las dos
-- columnas en nulo: es lo mismo que pasa con el domicilio habitual (`personas.lat` y `.lng`), y
-- todo lo que mide distancias ya se calla cuando faltan. Exigirlas obligaba a inventar un punto.

ALTER TABLE public.domicilios_temporales_paciente
  ALTER COLUMN lat DROP NOT NULL,
  ALTER COLUMN lng DROP NOT NULL;

NOTIFY pgrst, 'reload schema';
