// ---------------------------------------------------------------------------
// probar_aclaraciones_del_reporte.mjs — ¿el Reporte se corrige sólo con aclaraciones al pie?
//
// Uso, desde la raíz del producto, con la base local levantada y sembrada:
//   node scripts/probar_aclaraciones_del_reporte.mjs
//
// Devuelve 0 si la base se comportó como debe y 1 si no.
//
// LA REGLA. El Reporte presentado no se modifica ni se borra nunca. Se corrige con una aclaración
// al pie, firmada por quien la escribió, con fecha y hora. La escriben el Asistente que presentó
// ese Reporte, el Coordinador de ese Paciente y el Administrador de la Prestadora. La aclaración
// tampoco se modifica ni se borra. Nadie de otra Prestadora la lee ni la escribe.
//
// QUÉ PRUEBA, con un Reporte en cada una de las dos Prestadoras de prueba:
//   1. El Asistente que presentó el Reporte agrega una aclaración, y la firma es la suya aunque
//      intente poner otra.
//   2. Otro Asistente de la misma Prestadora no puede.
//   3. El Coordinador del Paciente puede.
//   4. El Administrador de la Prestadora puede.
//   5. El Asistente que la escribió la lee: ve las tres.
//   6. Nadie de la otra Prestadora —Administrador, Coordinador, Asistente— la lee ni la escribe.
//   7. La otra Prestadora sí lee y escribe en su propio Reporte. Sin este paso, una base que niega
//      todo pasaría el anterior.
//   8. Nadie modifica ni borra el Reporte: ni la persona, ni el trabajo sin persona, ni el dueño de
//      la base.
//   9. Nadie modifica ni borra la aclaración, por los mismos tres caminos.
//
// CÓMO ENTRA. Adentro de la base local, con el rol `authenticated` y los datos de sesión de cada
// cuenta que siembra `supabase/seed.sql`, o con `trabajo_sin_persona` y su Prestadora. No usa
// contraseñas ni claves. Los dos Reportes se cargan como dueño de la base porque la siembra no trae
// ninguno. Los datos son inventados, y todo corre adentro de una transacción que se deshace al
// final: no deja nada escrito.
// ---------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

// La marca que exigen las políticas de la información de salud lleva el código del producto, que
// sale de su archivo de identidad y no se escribe a mano.
const { IDENTIDAD } = await import(new URL('../backend/src/config/identidadProducto.js', import.meta.url));
const MARCA_DE_LECTURA = `${IDENTIDAD.codigo}.lectura_de_salud`;

// El contenedor sale de `supabase/config.toml`, como en `probar_aislamiento_en_la_base.mjs`.
const CONTENEDOR = process.env.CONTENEDOR_BASE || (() => {
  const toml = readFileSync(join(RAIZ, 'supabase', 'config.toml'), 'utf8');
  const id = toml.match(/^\s*project_id\s*=\s*"([^"]+)"/m);
  if (!id) throw new Error('No encontré project_id en supabase/config.toml.');
  return `supabase_db_${id[1]}`;
})();

// Los de la siembra. Sandbox: el turno de guardia terminado ayer, de Ana con Elena.
const SANDBOX = {
  prestadora: '11111111-1111-4111-8111-111111111111',
  turnoGuardia: '70000000-0000-4000-8000-000000000001',
  paciente: '50000000-0000-4000-8000-000000000001',
  asistente: '30000000-0000-4000-8000-000000000001',
  otroAsistente: '30000000-0000-4000-8000-000000000002',
  coordinador: '20000000-0000-4000-8000-000000000003',
  administrador: '20000000-0000-4000-8000-000000000002',
};
// Cuidar del Sur: su único turno de guardia sembrado, de Elena Escobar.
const SUR = {
  prestadora: '22222222-2222-4222-8222-222222222222',
  turnoGuardia: '80000000-0000-4000-8000-000000000001',
  paciente: '60000000-0000-4000-8000-000000000001',
  asistente: '50000000-0000-4000-8000-000000000003',
  coordinador: '50000000-0000-4000-8000-000000000002',
  administrador: '50000000-0000-4000-8000-000000000001',
};

const SQL = `
BEGIN;
DO $prueba$
DECLARE
  v_r1   uuid;
  v_r2   uuid;
  v_acl  uuid;
  v_r    text;
  v_n    int;
  v_res  text[] := '{}';
BEGIN
  -- Un Reporte en cada Prestadora, cargado como dueño de la base.
  INSERT INTO public.reportes (prestadora_id, turno_guardia_id, paciente_id, observaciones, confirmado_asistente)
  VALUES ('${SANDBOX.prestadora}', '${SANDBOX.turnoGuardia}', '${SANDBOX.paciente}', 'Durmió la siesta. Texto inventado.', true)
  RETURNING id INTO v_r1;
  INSERT INTO public.reportes (prestadora_id, turno_guardia_id, paciente_id, observaciones, confirmado_asistente)
  VALUES ('${SUR.prestadora}', '${SUR.turnoGuardia}', '${SUR.paciente}', 'Caminó por el patio. Texto inventado.', true)
  RETURNING id INTO v_r2;

  -- 1. El Asistente que presentó el Reporte. Intenta firmar con el nombre del Administrador.
  v_res := v_res || pg_temp.agregar('${SANDBOX.asistente}', v_r1,
    jsonb_build_object('escrita_por', '${SANDBOX.administrador}'));
  SELECT CASE WHEN escrita_por = '${SANDBOX.asistente}' THEN 'firma propia' ELSE 'firma ajena' END INTO v_r
    FROM public.aclaraciones_reporte WHERE reporte_id = v_r1 ORDER BY escrita_at LIMIT 1;
  v_res := v_res || coalesce(v_r, 'sin aclaracion');

  -- 2. Otro Asistente de la misma Prestadora.
  v_res := v_res || pg_temp.agregar('${SANDBOX.otroAsistente}', v_r1, '{}');
  -- 3. El Coordinador del Paciente.
  v_res := v_res || pg_temp.agregar('${SANDBOX.coordinador}', v_r1, '{}');
  -- 4. El Administrador de la Prestadora.
  v_res := v_res || pg_temp.agregar('${SANDBOX.administrador}', v_r1, '{}');

  -- 5. El Asistente lee las aclaraciones de su Reporte.
  v_res := v_res || pg_temp.leer('${SANDBOX.asistente}', v_r1);

  -- 6. La otra Prestadora, sobre el Reporte de Sandbox.
  v_res := v_res || pg_temp.leer('${SUR.administrador}', v_r1);
  v_res := v_res || pg_temp.leer('${SUR.coordinador}', v_r1);
  v_res := v_res || pg_temp.leer('${SUR.asistente}', v_r1);
  v_res := v_res || pg_temp.agregar('${SUR.administrador}', v_r1, '{}');
  v_res := v_res || pg_temp.agregar('${SUR.coordinador}', v_r1, '{}');
  v_res := v_res || pg_temp.agregar('${SUR.asistente}', v_r1, '{}');

  -- 7. La otra Prestadora, sobre su propio Reporte. Y Sandbox no lo ve.
  v_res := v_res || pg_temp.agregar('${SUR.coordinador}', v_r2, '{}');
  v_res := v_res || pg_temp.leer('${SUR.administrador}', v_r2);
  v_res := v_res || pg_temp.leer('${SANDBOX.administrador}', v_r2);

  -- 8. Modificar o borrar el Reporte.
  v_res := v_res || pg_temp.intentar('${SANDBOX.asistente}', NULL,
    format('UPDATE public.reportes SET observaciones = %L WHERE id = %L', 'Cambiado', v_r1));
  v_res := v_res || pg_temp.intentar('${SANDBOX.administrador}', NULL,
    format('DELETE FROM public.reportes WHERE id = %L', v_r1));
  v_res := v_res || pg_temp.intentar(NULL, '${SANDBOX.prestadora}',
    format('UPDATE public.reportes SET observaciones = %L WHERE id = %L', 'Cambiado', v_r1));
  v_res := v_res || pg_temp.intentar(NULL, NULL,
    format('UPDATE public.reportes SET observaciones = %L WHERE id = %L', 'Cambiado', v_r1));
  v_res := v_res || pg_temp.intentar(NULL, NULL,
    format('DELETE FROM public.reportes WHERE id = %L', v_r1));

  -- 9. Modificar o borrar la aclaración.
  SELECT id INTO v_acl FROM public.aclaraciones_reporte WHERE reporte_id = v_r1 LIMIT 1;
  v_res := v_res || pg_temp.intentar('${SANDBOX.asistente}', NULL,
    format('UPDATE public.aclaraciones_reporte SET texto = %L WHERE id = %L', 'Cambiada', v_acl));
  v_res := v_res || pg_temp.intentar('${SANDBOX.administrador}', NULL,
    format('DELETE FROM public.aclaraciones_reporte WHERE id = %L', v_acl));
  v_res := v_res || pg_temp.intentar(NULL, '${SANDBOX.prestadora}',
    format('DELETE FROM public.aclaraciones_reporte WHERE id = %L', v_acl));
  v_res := v_res || pg_temp.intentar(NULL, NULL,
    format('UPDATE public.aclaraciones_reporte SET texto = %L WHERE id = %L', 'Cambiada', v_acl));
  v_res := v_res || pg_temp.intentar(NULL, NULL,
    format('DELETE FROM public.aclaraciones_reporte WHERE id = %L', v_acl));

  -- Después de los intentos, el Reporte y las aclaraciones siguen como estaban.
  SELECT count(*) INTO v_n FROM public.reportes
   WHERE id = v_r1 AND observaciones = 'Durmió la siesta. Texto inventado.';
  v_res := v_res || CASE WHEN v_n = 1 THEN 'reporte intacto' ELSE 'reporte cambiado' END;
  SELECT count(*) INTO v_n FROM public.aclaraciones_reporte WHERE reporte_id = v_r1 AND texto LIKE 'Aclaración inventada%';
  v_res := v_res || (v_n::text || ' aclaraciones intactas');

  RAISE NOTICE '%', array_to_string(v_res, '|');
END
$prueba$;
ROLLBACK;
`;

// Las funciones de ayuda van en el esquema temporal de la sesión: se van solas al terminar.
const AYUDA = `
-- Entra como una cuenta: rol authenticated y el identificador de la cuenta en los datos de sesión.
CREATE FUNCTION pg_temp.entrar(p_cuenta uuid, p_prestadora uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_cuenta IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', p_cuenta, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', p_cuenta::text, true);
    PERFORM set_config('role', 'authenticated', true);
  ELSIF p_prestadora IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims', json_build_object('role', 'trabajo_sin_persona', 'prestadora_id', p_prestadora)::text, true);
    PERFORM set_config('role', 'trabajo_sin_persona', true);
  END IF;
END $$;


-- Agrega una aclaración por la función de la información de salud. Contesta «aceptado» o «rechazado».
CREATE FUNCTION pg_temp.agregar(p_cuenta uuid, p_reporte uuid, p_extra jsonb) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_r text := 'aceptado';
BEGIN
  PERFORM pg_temp.entrar(p_cuenta, NULL);
  BEGIN
    PERFORM public.agregar_informacion_de_salud('aclaraciones_reporte', 'prueba de aclaraciones',
      jsonb_build_object('reporte_id', p_reporte, 'texto', 'Aclaración inventada.') || p_extra);
  EXCEPTION WHEN OTHERS THEN v_r := 'rechazado';
  END;
  PERFORM set_config('role', 'postgres', true);
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN v_r;
END $$;

-- Cuántas aclaraciones de ese Reporte ve esa cuenta, por la función de la información de salud.
CREATE FUNCTION pg_temp.leer(p_cuenta uuid, p_reporte uuid) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_filas jsonb; v_r text;
BEGIN
  PERFORM pg_temp.entrar(p_cuenta, NULL);
  BEGIN
    v_filas := public.leer_informacion_de_salud('aclaraciones_reporte', 'prueba de aclaraciones', ARRAY['reporte_id']);
    SELECT count(*)::text INTO v_r FROM jsonb_array_elements(v_filas) f WHERE (f ->> 'reporte_id')::uuid = p_reporte;
  EXCEPTION WHEN OTHERS THEN v_r := '0';
  END;
  PERFORM set_config('role', 'postgres', true);
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN 've ' || v_r;
END $$;

-- Corre una escritura como esa cuenta, como el trabajo sin persona de esa Prestadora o, sin
-- ninguna de las dos, como dueño de la base. Contesta «rechazado» o cuántas filas tocó.
CREATE FUNCTION pg_temp.intentar(p_cuenta uuid, p_prestadora uuid, p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_r text; v_n int;
BEGIN
  PERFORM pg_temp.entrar(p_cuenta, p_prestadora);
  -- Lo que la información de salud exige para escribir directo: se abre a propósito, así lo único
  -- que puede frenar la escritura es la regla del Reporte.
  PERFORM set_config('${MARCA_DE_LECTURA}', 'anotada', true);
  BEGIN
    EXECUTE p_sql;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_r := 'toco ' || v_n;
  EXCEPTION WHEN OTHERS THEN v_r := 'rechazado';
  END;
  PERFORM set_config('${MARCA_DE_LECTURA}', '', true);
  PERFORM set_config('role', 'postgres', true);
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN v_r;
END $$;
`;

const r = spawnSync(
  'docker',
  ['exec', '-i', CONTENEDOR, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-qtA'],
  { input: AYUDA + SQL, encoding: 'utf8' },
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
  ['el Asistente que presentó el Reporte agrega una aclaración', 'aceptado'],
  ['la firma es la de quien la escribió', 'firma propia'],
  ['otro Asistente de la misma Prestadora agrega una', 'rechazado'],
  ['el Coordinador del Paciente agrega una', 'aceptado'],
  ['el Administrador de la Prestadora agrega una', 'aceptado'],
  ['el Asistente lee las aclaraciones de su Reporte', 've 3'],
  ['el Administrador de la otra Prestadora las lee', 've 0'],
  ['el Coordinador de la otra Prestadora las lee', 've 0'],
  ['el Asistente de la otra Prestadora las lee', 've 0'],
  ['el Administrador de la otra Prestadora agrega una', 'rechazado'],
  ['el Coordinador de la otra Prestadora agrega una', 'rechazado'],
  ['el Asistente de la otra Prestadora agrega una', 'rechazado'],
  ['la otra Prestadora agrega una en su propio Reporte', 'aceptado'],
  ['la otra Prestadora lee la de su propio Reporte', 've 1'],
  ['Sandbox lee la del Reporte de la otra Prestadora', 've 0'],
  ['el Asistente modifica el Reporte', 'rechazado'],
  ['el Administrador borra el Reporte', 'rechazado'],
  ['el trabajo sin persona modifica el Reporte', 'rechazado'],
  ['el dueño de la base modifica el Reporte', 'rechazado'],
  ['el dueño de la base borra el Reporte', 'rechazado'],
  ['el Asistente modifica la aclaración', 'rechazado'],
  ['el Administrador borra la aclaración', 'rechazado'],
  ['el trabajo sin persona borra la aclaración', 'rechazado'],
  ['el dueño de la base modifica la aclaración', 'rechazado'],
  ['el dueño de la base borra la aclaración', 'rechazado'],
  ['después de los intentos, el Reporte', 'reporte intacto'],
  ['después de los intentos, las aclaraciones', '3 aclaraciones intactas'],
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
console.log('La base sigue la regla: el Reporte y sus aclaraciones no se modifican ni se borran; aclaran el Asistente que lo presentó, el Coordinador del Paciente y el Administrador; la otra Prestadora no lee ni escribe nada.');
