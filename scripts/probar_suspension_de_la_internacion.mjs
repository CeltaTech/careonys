// ---------------------------------------------------------------------------
// probar_suspension_de_la_internacion.mjs — ¿la suspensión de una internación vuelve sólo al cerrarla?
//
// Uso, desde la raíz del producto, con la base local levantada y sembrada:
//   node scripts/probar_suspension_de_la_internacion.mjs
//
// Devuelve 0 si la base se comportó como debe y 1 si no.
//
// LA REGLA. Cuando se registra la internación de un Paciente con la forma que suspende, la base
// suspende cada Servicio vigente que lo atiende. Esa suspensión vuelve sólo al cerrar la
// internación, o termina con la baja del Servicio. Por ningún otro camino se reanuda, se cambia ni
// se borra mientras la internación siga abierta, y quien lo intenta recibe el motivo
// «la_suspension_es_de_una_internacion».
//
// QUÉ PRUEBA, en orden, sobre un Paciente de la siembra con una Prestación vigente:
//   1. La internación suspende al menos un Servicio.
//   2. El Administrador la reanuda a mano: se rechaza.
//   3. La función interna que levanta interrupciones, llamada sin cerrar la internación: se rechaza.
//   4. Levantarla escribiendo directo en la tabla: se rechaza.
//   5. Cambiarle la fecha de vuelta: se rechaza.
//   6. Borrarla: se rechaza.
//   7. Después de todo eso sigue sin levantar.
//   8. Con la baja del Servicio anotada en la misma operación, levantarla se acepta.
//   9. Cerrar la internación se acepta y la deja levantada. Sin este paso, una base que rechaza
//      todo pasaría los anteriores.
//
// CÓMO ENTRA. Adentro de la base local, con el rol `authenticated` y los datos de sesión del
// Administrador de la Prestadora de prueba que siembra `supabase/seed.sql`, y como dueño de la base
// para los caminos que no pasan por las funciones. Los datos son inventados, y todo corre adentro
// de una transacción que se deshace al final: no deja nada escrito.
// ---------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

// El contenedor sale de `supabase/config.toml`, como en `probar_aislamiento_en_la_base.mjs`.
const CONTENEDOR = process.env.CONTENEDOR_BASE || (() => {
  const toml = readFileSync(join(RAIZ, 'supabase', 'config.toml'), 'utf8');
  const id = toml.match(/^\s*project_id\s*=\s*"([^"]+)"/m);
  if (!id) throw new Error('No encontré project_id en supabase/config.toml.');
  return `supabase_db_${id[1]}`;
})();

// Los de la siembra: la Prestadora de prueba, su Administrador y un Servicio vigente.
const PRESTADORA = '11111111-1111-4111-8111-111111111111';
const ADMINISTRADOR = '20000000-0000-4000-8000-000000000002';
const SERVICIO = '60000000-0000-4000-8000-000000000002';

const MOTIVO = 'la_suspension_es_de_una_internacion';

const SQL = `
BEGIN;
DO $prueba$
DECLARE
  v_paciente uuid;
  v_hosp     uuid;
  v_int      uuid;
  v_hoy      date;
  v_r        text;
  v_resultados text[] := '{}';
BEGIN
  SELECT p.paciente_id INTO v_paciente FROM public.prestaciones p
   WHERE p.servicio_id = '${SERVICIO}' AND p.estado = 'vigente' AND p.paciente_id IS NOT NULL
   LIMIT 1;
  IF v_paciente IS NULL THEN
    RAISE EXCEPTION 'La base local no tiene la Prestación de la siembra. Siémbrela con «supabase db reset --local».';
  END IF;

  PERFORM set_config('request.jwt.claims', '{"sub":"${ADMINISTRADOR}","role":"authenticated"}', true);
  PERFORM set_config('request.jwt.claim.sub', '${ADMINISTRADOR}', true);
  v_hoy := interno.hoy_de_la_prestadora('${PRESTADORA}');

  SET LOCAL ROLE authenticated;
  v_hosp := public.registrar_hospitalizacion(v_paciente, 'Clínica inventada', NULL, v_hoy, NULL, 'suspende');
  RESET ROLE;

  -- 1. La internación suspende el Servicio.
  SELECT i.id INTO v_int FROM public.interrupciones_de_cobertura i
   WHERE i.hospitalizacion_id = v_hosp AND i.servicio_id = '${SERVICIO}' AND i.levantada_at IS NULL;
  v_resultados := v_resultados || CASE WHEN v_int IS NULL THEN 'sin suspension' ELSE 'suspendido' END;

  -- 2. Reanudarla a mano.
  SET LOCAL ROLE authenticated;
  v_r := 'aceptado';
  BEGIN
    PERFORM public.reanudar_cobertura(v_int, NULL);
  EXCEPTION WHEN OTHERS THEN v_r := SQLERRM;
  END;
  RESET ROLE;
  v_resultados := v_resultados || v_r;

  -- 3. La función interna que levanta interrupciones.
  v_r := 'aceptado';
  BEGIN
    PERFORM interno.levantar_interrupcion(v_int, v_hoy);
  EXCEPTION WHEN OTHERS THEN v_r := SQLERRM;
  END;
  v_resultados := v_resultados || v_r;

  -- 4. Levantarla escribiendo directo en la tabla.
  v_r := 'aceptado';
  BEGIN
    UPDATE public.interrupciones_de_cobertura
       SET levantada_desde = desde, levantada_at = now()
     WHERE id = v_int;
  EXCEPTION WHEN OTHERS THEN v_r := SQLERRM;
  END;
  v_resultados := v_resultados || v_r;

  -- 5. Cambiarle la fecha de vuelta.
  v_r := 'aceptado';
  BEGIN
    UPDATE public.interrupciones_de_cobertura SET vuelta = desde + 10 WHERE id = v_int;
  EXCEPTION WHEN OTHERS THEN v_r := SQLERRM;
  END;
  v_resultados := v_resultados || v_r;

  -- 6. Borrarla.
  v_r := 'aceptado';
  BEGIN
    DELETE FROM public.interrupciones_de_cobertura WHERE id = v_int;
  EXCEPTION WHEN OTHERS THEN v_r := SQLERRM;
  END;
  v_resultados := v_resultados || v_r;

  -- 7. Sigue sin levantar.
  v_resultados := v_resultados
    || (SELECT CASE WHEN levantada_at IS NULL THEN 'abierta' ELSE 'levantada' END
          FROM public.interrupciones_de_cobertura WHERE id = v_int);

  -- 8. Con la baja del Servicio anotada en la misma operación. Se deshace al terminar el paso.
  v_r := 'rechazado';
  BEGIN
    INSERT INTO public.bajas_de_servicio (prestadora_id, servicio_id, motivo, dada_por)
    VALUES ('${PRESTADORA}', '${SERVICIO}', 'Motivo inventado', '${ADMINISTRADOR}');
    UPDATE public.interrupciones_de_cobertura
       SET levantada_desde = desde, levantada_at = now()
     WHERE id = v_int;
    v_r := 'aceptado';
    RAISE EXCEPTION 'deshacer_el_paso';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'deshacer_el_paso' THEN v_r := SQLERRM; END IF;
  END;
  v_resultados := v_resultados || v_r;

  -- 9. Cerrar la internación.
  SET LOCAL ROLE authenticated;
  v_r := 'aceptado';
  BEGIN
    PERFORM public.cerrar_hospitalizacion(v_hosp, v_hoy);
  EXCEPTION WHEN OTHERS THEN v_r := SQLERRM;
  END;
  RESET ROLE;
  v_resultados := v_resultados || v_r
    || (SELECT CASE WHEN levantada_at IS NULL THEN 'abierta' ELSE 'levantada' END
          FROM public.interrupciones_de_cobertura WHERE id = v_int);

  RAISE NOTICE '%', array_to_string(v_resultados, '|');
END
$prueba$;
ROLLBACK;
`;

const r = spawnSync(
  'docker',
  ['exec', '-i', CONTENEDOR, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-qtA'],
  { input: SQL, encoding: 'utf8' },
);
if (r.status !== 0) {
  console.error(`La base local no contestó:\n${r.stderr || r.error?.message}`);
  process.exit(1);
}

const aviso = (r.stderr || '').split('\n').map((l) => l.trim()).find((l) => l.startsWith('NOTICE:'));
if (!aviso) {
  console.error('La prueba no devolvió resultado.');
  process.exit(1);
}

// Lo que tiene que contestar cada paso, en el mismo orden en que la prueba lo anota.
const ESPERADO = [
  ['la internación suspende el Servicio', 'suspendido'],
  ['el Administrador la reanuda a mano', MOTIVO],
  ['la función interna la levanta sin cerrar la internación', MOTIVO],
  ['levantarla escribiendo directo en la tabla', MOTIVO],
  ['cambiarle la fecha de vuelta', MOTIVO],
  ['borrarla', MOTIVO],
  ['después de los intentos', 'abierta'],
  ['levantarla con la baja del Servicio', 'aceptado'],
  ['cerrar la internación', 'aceptado'],
  ['después de cerrar la internación', 'levantada'],
];

const obtenido = aviso.replace(/^NOTICE:\s*/, '').split('|');
const fallas = [];
if (obtenido.length !== ESPERADO.length) {
  fallas.push(`La prueba anotó ${obtenido.length} resultados y se esperaban ${ESPERADO.length}: ${obtenido.join(' | ')}`);
} else {
  ESPERADO.forEach(([que, valor], i) => {
    if (obtenido[i] !== valor) fallas.push(`${que}: se esperaba «${valor}» y la base contestó «${obtenido[i]}».`);
  });
}

if (fallas.length) {
  for (const f of fallas) console.error(f);
  process.exit(1);
}
console.log('La base sigue la regla: la suspensión de una internación no se reanuda, no se cambia ni se borra a mano; vuelve al cerrar la internación o termina con la baja del Servicio.');
