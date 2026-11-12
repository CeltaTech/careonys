-- En qué horarios suele estar disponible cada Asistente.
--
-- Se guarda en `asistentes.disponibilidad` como la lista de las opciones que eligió, por su clave,
-- de la lista de opciones `disponibilidad`: la misma que usa la postulación. Vacía o nula quiere
-- decir que no está cargada.
--
-- La carga el Asistente desde su aplicación, y la corrige quien gestiona su Legajo. La aplicación
-- guarda con el trabajo de la Prestadora, como el interruptor de disponible, porque el Asistente no
-- tiene permiso para corregir su propio Legajo: por eso ese trabajo recibe permiso para escribir
-- esta columna, y ninguna otra más. También la llena al dar de alta el Legajo desde una
-- postulación, que ya trae lo que la persona indicó.

ALTER TABLE public.asistentes
  ADD CONSTRAINT la_disponibilidad_es_una_lista_de_opciones CHECK (
    disponibilidad IS NULL
    OR (
      jsonb_typeof(disponibilidad) = 'array'
      AND NOT jsonb_path_exists(disponibilidad, '$[*] ? (@.type() != "string")')
    )
  );

COMMENT ON COLUMN public.asistentes.disponibilidad IS
  'En qué horarios suele estar disponible: las claves de las opciones elegidas de la lista de opciones disponibilidad. Nula o vacía, no está cargada.';

GRANT INSERT (disponibilidad), UPDATE (disponibilidad) ON TABLE public.asistentes TO trabajo_sin_persona;

NOTIFY pgrst, 'reload schema';
