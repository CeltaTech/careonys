-- El código postal del domicilio, y la localidad censal de cada lugar.
--
-- El código postal se guarda como se escribió, en la Persona y en el Asistente, al lado de las
-- demás partes del domicilio. Es texto: el argentino lleva letras, y otros países también.
--
-- La localidad censal es la que contesta el servicio de direcciones del Estado cuando se le
-- pregunta por una calle con su número. Guardarla en cada lugar permite saber a cuál de la lista
-- pertenece una dirección sin volver a preguntar. Una localidad censal puede abarcar varios
-- lugares —en la Ciudad de Buenos Aires abarca todos los barrios—, así que no es única.
--
-- Son columnas nuevas en tablas que ya tienen su protección por fila: las políticas son por
-- fila, no por columna, y alcanzan a estas igual.

alter table public.personas add column if not exists codigo_postal text;
alter table public.asistentes add column if not exists codigo_postal text;
alter table public.lugares add column if not exists localidad_censal text;

create index if not exists lugares_localidad_censal
  on public.lugares (prestadora_id, pais, localidad_censal)
  where localidad_censal is not null;

notify pgrst, 'reload schema';
