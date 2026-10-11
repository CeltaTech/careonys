-- EL CIERRE DEL PANEL POR INACTIVIDAD, CONFIGURABLE POR PRESTADORA.
--
-- Encendido o apagado, y cuántos minutos sin actividad cierran la sesión. Lo de fábrica son estos
-- `DEFAULT`: encendido y 15 minutos. Los bordes —de 5 a 120— son los de
-- `panel/src/lib/cierrePorInactividad.js`; se repiten acá porque la base no puede leer ese archivo.
--
-- Viven en la fila de la Prestadora porque los lee quien entra al Panel junto con la moneda, y esa
-- fila ya la ve cada cuenta de su propia Prestadora.

begin;

alter table public.prestadoras
  add column cierre_por_inactividad_activo boolean not null default true,
  add column cierre_por_inactividad_minutos integer not null default 15
    constraint prestadoras_cierre_por_inactividad_minutos_check
    check (cierre_por_inactividad_minutos between 5 and 120);

commit;

NOTIFY pgrst, 'reload schema';
