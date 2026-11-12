// ---------------------------------------------------------------------------
// probar_aislamiento_en_la_base.mjs — ¿la base protege sola, sin el filtro del código?
//
// Uso, desde la raíz del producto, con la base local levantada y sembrada:
//   node scripts/probar_aislamiento_en_la_base.mjs
//
// Devuelve 0 si nada se cruzó y 1 si algo se cruzó o si la prueba no prueba nada.
//
// QUÉ HACE. Toma, una por una, cada cuenta activa de las dos Prestadoras de prueba que siembra
// `supabase/seed.sql`, y además la credencial del trabajo sin persona de cada una. Con cada una lee
// todas las tablas de `public` que tienen columna de Prestadora **sin ningún filtro de Prestadora**:
// es la consulta tal como quedaría si alguien se olvidara de escribirlo en el código. Cuenta las filas
// propias y las ajenas. Una sola fila ajena es una filtración.
//
// Después pide la copia de respaldo entera de cada Prestadora con el pase de `copia_de_respaldo`:
// tiene que traer todas las tablas, las cuentas de entrada de su gente y ninguna fila de la otra.
// Con el filtro de la copia quitado a propósito, la prueba tiene que encontrar la filtración; y con
// cualquier otro pase, la copia tiene que negarse.
//
// CÓMO ENTRA. Adentro de la base local, con el mismo rol y los mismos datos de sesión que la base
// recibe de una credencial verdadera: `authenticated` con el identificador de la cuenta, o
// `trabajo_sin_persona` con la Prestadora. No usa contraseñas ni claves, y todo corre adentro de una
// transacción que se deshace al final: no deja nada escrito.
//
// POR QUÉ PUEDE FALLAR. Comprobar que no aparece nada ajeno no alcanza: una base que lo niega todo
// contesta lo mismo. Por eso la prueba exige tres cosas más, y si falta una, falla:
//   1. que las dos Prestadoras tengan filas cargadas, así hay algo ajeno que podría verse;
//   2. que cada cuenta de administración vea filas propias;
//   3. que la prueba se dé cuenta cuando la protección falta: apaga a propósito la protección por fila
//      de una tabla con filas de las dos, vuelve a leerla, y tiene que encontrar la filtración.
//
// QUÉ NO PRUEBA. Lo que una cuenta ve adentro de su propia Prestadora —la zona de un Coordinador,
// lo de un Cliente— es cosa de permisos y no de aislamiento. Los archivos de los depósitos tampoco:
// la siembra no carga ninguno.
// ---------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

// El contenedor sale de `supabase/config.toml`, como en `probar_aislamiento.mjs`.
const CONTENEDOR = process.env.CONTENEDOR_BASE || (() => {
  const toml = readFileSync(join(RAIZ, 'supabase', 'config.toml'), 'utf8');
  const id = toml.match(/^\s*project_id\s*=\s*"([^"]+)"/m);
  if (!id) throw new Error('No encontré project_id en supabase/config.toml.');
  return `supabase_db_${id[1]}`;
})();

const PRESTADORAS_DE_PRUEBA = ['Sandbox', 'Cuidar del Sur'];

function correr(sql) {
  const r = spawnSync(
    'docker',
    ['exec', '-i', CONTENEDOR, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-qtA', '-F', '|'],
    { input: sql, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  if (r.status !== 0) throw new Error(`La base local no contestó:\n${r.stderr || r.error?.message}`);
  const renglones = (texto) => texto.split('\n').map((l) => l.trim()).filter(Boolean);
  return {
    filas: renglones(r.stdout).map((l) => l.split('|')),
    avisos: renglones(r.stderr)
      .filter((l) => l.startsWith('NOTICE:'))
      .map((l) => l.replace(/^NOTICE:\s*/, '').split('|')),
  };
}

const literal = (texto) => `'${String(texto).replace(/'/g, "''")}'`;

// --- Lo que hay, leído como dueño de la base, antes de entrar como nadie ------------------------

const prestadoras = correr(
  `SELECT id, nombre_fantasia FROM prestadoras WHERE nombre_fantasia IN (${PRESTADORAS_DE_PRUEBA.map(literal).join(',')});`,
).filas;
if (prestadoras.length !== PRESTADORAS_DE_PRUEBA.length) {
  console.error(`La base local no tiene las dos Prestadoras de prueba (${PRESTADORAS_DE_PRUEBA.join(' y ')}). Siémbrela con «supabase db reset --local».`);
  process.exit(1);
}
const nombreDe = new Map(prestadoras.map(([id, nombre]) => [id, nombre]));
const ids = prestadoras.map(([id]) => id);

const tablas = correr(`
  SELECT c.relname FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'prestadora_id' AND NOT a.attisdropped
   WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
   ORDER BY 1;`).filas.map(([t]) => t);

const cuentas = correr(`
  SELECT id, prestadora_id, rol FROM usuarios
   WHERE desactivada_en IS NULL AND prestadora_id IN (${ids.map(literal).join(',')})
   ORDER BY prestadora_id, rol, id;`).filas.map(([id, prestadora, rol]) => ({ id, prestadora, rol }));

// Cuántas filas tiene cada Prestadora en cada tabla, para saber qué podría filtrarse.
const cargadas = new Map();
for (const [tabla, prestadora, n] of correr(
  tablas
    .map((t) => `SELECT ${literal(t)}, prestadora_id, count(*) FROM public."${t}" WHERE prestadora_id IN (${ids.map(literal).join(',')}) GROUP BY 2;`)
    .join('\n'),
).filas) {
  cargadas.set(`${tabla}|${prestadora}`, Number(n));
}

// --- La lectura sin filtro, con cada identidad ---------------------------------------------------

// Un bloque por identidad. Adentro, cada tabla se lee entera; la que el rol no tiene permiso de leer
// queda anotada como tal y no cuenta como filtración: no devolvió nada.
function bloque(etiqueta, rol, datosDeSesion, prestadora, soloTablas = tablas) {
  return `
SET LOCAL ROLE ${rol};
SELECT set_config('request.jwt.claims', ${literal(JSON.stringify(datosDeSesion))}, true);
SELECT set_config('request.jwt.claim.sub', ${literal(datosDeSesion.sub ?? '')}, true);
DO $prueba$
DECLARE
  v_tabla text;
  v_propias bigint;
  v_ajenas bigint;
BEGIN
  FOREACH v_tabla IN ARRAY ARRAY[${soloTablas.map(literal).join(',')}]::text[] LOOP
    BEGIN
      EXECUTE format(
        'SELECT count(*) FILTER (WHERE prestadora_id = %L), count(*) FILTER (WHERE prestadora_id <> %L) FROM public.%I',
        ${literal(prestadora)}, ${literal(prestadora)}, v_tabla
      ) INTO v_propias, v_ajenas;
      RAISE NOTICE '%|%|%|%', ${literal(etiqueta)}, v_tabla, v_propias, v_ajenas;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE '%|%|sin permiso|0', ${literal(etiqueta)}, v_tabla;
    END;
  END LOOP;
END
$prueba$;
RESET ROLE;`;
}

const identidades = [
  ...cuentas.map((c) => ({
    etiqueta: `${nombreDe.get(c.prestadora)} · ${c.rol} ${c.id}`,
    rol: 'authenticated',
    sesion: { sub: c.id, role: 'authenticated' },
    prestadora: c.prestadora,
    esAdministracion: c.rol === 'admin_prestadora',
  })),
  ...ids.map((p) => ({
    etiqueta: `${nombreDe.get(p)} · trabajo sin persona`,
    rol: 'trabajo_sin_persona',
    sesion: { role: 'trabajo_sin_persona', prestadora_id: p },
    prestadora: p,
    esAdministracion: false,
  })),
];

const { avisos } = correr(
  `BEGIN;\n${identidades.map((i) => bloque(i.etiqueta, i.rol, i.sesion, i.prestadora)).join('\n')}\nROLLBACK;`,
);

const fallas = [];
const propiasPorIdentidad = new Map();
for (const [etiqueta, tabla, propias, ajenas] of avisos) {
  if (Number(ajenas) > 0) fallas.push(`FILTRACIÓN: ${etiqueta} lee ${ajenas} fila(s) ajenas de public.${tabla}.`);
  if (propias !== 'sin permiso') {
    propiasPorIdentidad.set(etiqueta, (propiasPorIdentidad.get(etiqueta) ?? 0) + (Number(propias) > 0 ? 1 : 0));
  }
}
const leidas = avisos.length;
const esperadas = identidades.length * tablas.length;
if (leidas !== esperadas) fallas.push(`Se esperaban ${esperadas} lecturas y volvieron ${leidas}: la prueba no recorrió todo.`);

// 1. Las dos Prestadoras tienen filas cargadas.
for (const p of ids) {
  const conFilas = tablas.filter((t) => (cargadas.get(`${t}|${p}`) ?? 0) > 0).length;
  if (conFilas === 0) fallas.push(`${nombreDe.get(p)} no tiene ninguna fila cargada: no hay nada ajeno que pudiera verse.`);
}

// 2. Cada cuenta de administración ve filas propias.
for (const i of identidades.filter((x) => x.esAdministracion)) {
  if (!(propiasPorIdentidad.get(i.etiqueta) > 0)) {
    fallas.push(`${i.etiqueta} no ve ninguna fila propia: una base que lo niega todo también pasaría la prueba.`);
  }
}

// 3. La prueba de la prueba: sin protección en una tabla, la filtración tiene que aparecer.
const administraciones = identidades.filter((x) => x.esAdministracion);
const control = tablas.find((t) => ids.every((p) => (cargadas.get(`${t}|${p}`) ?? 0) > 0) &&
  correr(`SELECT has_table_privilege('authenticated', 'public."${t}"', 'SELECT');`).filas[0][0] === 't');
if (!control || administraciones.length === 0) {
  fallas.push('No hay ninguna tabla con filas de las dos Prestadoras para probar que la prueba detecta una filtración.');
} else {
  const quien = administraciones[0];
  const { avisos: deControl } = correr(`BEGIN;
ALTER TABLE public."${control}" DISABLE ROW LEVEL SECURITY;
${bloque(quien.etiqueta, quien.rol, quien.sesion, quien.prestadora, [control])}
ROLLBACK;`);
  const detectada = deControl.some(([, , , ajenas]) => Number(ajenas) > 0);
  if (!detectada) {
    fallas.push(`Con la protección de public.${control} apagada a propósito, la prueba no encontró la filtración: no puede fallar, y entonces no prueba nada.`);
  } else {
    console.log(`Control: con la protección de public.${control} apagada, la prueba encuentra la filtración.`);
  }
}

// 4. La copia de respaldo. Sus dos funciones saltean la protección por fila, así que el filtro lo
// ponen ellas: con el pase de una Prestadora, ninguna fila de la otra; con cualquier otro pase,
// nada. Se pide cada tabla entera, de a tramos, como la pide el backend.
const RESPALDO_TRAMO = 5000;
function bloqueDeRespaldo(prestadora) {
  return `
SET LOCAL ROLE copia_de_respaldo;
SELECT set_config('request.jwt.claims', ${literal(JSON.stringify({ role: 'copia_de_respaldo', prestadora_id: prestadora }))}, true);
DO $respaldo$
DECLARE
  v_tabla text;
  v_tramo jsonb;
  v_desde integer;
  v_propias bigint;
  v_ajenas bigint;
  v_cuentas text;
BEGIN
  FOR v_tabla IN SELECT public.tablas_del_respaldo() LOOP
    v_desde := 0; v_propias := 0; v_ajenas := 0; v_cuentas := '';
    LOOP
      v_tramo := public.filas_del_respaldo(v_tabla, v_desde, ${RESPALDO_TRAMO});
      EXIT WHEN jsonb_array_length(v_tramo) = 0;
      IF v_tabla LIKE 'auth.%' THEN
        -- Las cuentas de entrada no tienen columna de Prestadora: se anotan y se revisan afuera.
        SELECT v_cuentas || coalesce(string_agg(coalesce(f->>'user_id', f->>'id'), ','), '') || ','
          INTO v_cuentas FROM jsonb_array_elements(v_tramo) f;
        v_propias := v_propias + jsonb_array_length(v_tramo);
      ELSE
        SELECT v_propias + count(*) FILTER (WHERE coalesce(f->>'prestadora_id', f->>'id') = ${literal(prestadora)}),
               v_ajenas  + count(*) FILTER (WHERE coalesce(f->>'prestadora_id', f->>'id') IS DISTINCT FROM ${literal(prestadora)})
          INTO v_propias, v_ajenas FROM jsonb_array_elements(v_tramo) f;
      END IF;
      v_desde := v_desde + ${RESPALDO_TRAMO};
    END LOOP;
    RAISE NOTICE '%|%|%|%', v_tabla, v_propias, v_ajenas, v_cuentas;
  END LOOP;
END
$respaldo$;
RESET ROLE;`;
}

const cuentasDe = new Map(ids.map((p) => [p, new Set(cuentas.filter((c) => c.prestadora === p).map((c) => c.id))]));
const todasLasCuentasDe = new Map(ids.map((p) => [p, new Set(
  correr(`SELECT id FROM usuarios WHERE prestadora_id = ${literal(p)};`).filas.map(([id]) => id),
)]));
for (const p of ids) {
  const { avisos: delRespaldo } = correr(`BEGIN;\n${bloqueDeRespaldo(p)}\nROLLBACK;`);
  const nombre = nombreDe.get(p);
  const vistas = new Set(delRespaldo.map(([t]) => t));
  for (const t of tablas) {
    if (!vistas.has(`public.${t}`)) fallas.push(`Respaldo de ${nombre}: public.${t} tiene columna de Prestadora y la copia no la incluye.`);
  }
  let propiasTotales = 0;
  for (const [tabla, propias, ajenas, listaDeCuentas] of delRespaldo) {
    propiasTotales += Number(propias);
    if (Number(ajenas) > 0) fallas.push(`FILTRACIÓN: el respaldo de ${nombre} trae ${ajenas} fila(s) de otra Prestadora de ${tabla}.`);
    const ajenasDeAuth = (listaDeCuentas ?? '').split(',').filter(Boolean).filter((id) => !todasLasCuentasDe.get(p).has(id));
    if (ajenasDeAuth.length > 0) fallas.push(`FILTRACIÓN: el respaldo de ${nombre} trae ${ajenasDeAuth.length} fila(s) de ${tabla} de cuentas que no son suyas.`);
  }
  const cuentasEnElRespaldo = new Set(delRespaldo.filter(([t]) => t === 'auth.users').flatMap(([, , , l]) => (l ?? '').split(',').filter(Boolean)));
  const faltan = [...cuentasDe.get(p)].filter((id) => !cuentasEnElRespaldo.has(id));
  if (faltan.length > 0) fallas.push(`Respaldo de ${nombre}: faltan ${faltan.length} cuenta(s) de entrada de su gente.`);
  if (propiasTotales === 0) fallas.push(`Respaldo de ${nombre}: no trajo ninguna fila, y una copia vacía también pasaría la prueba.`);
  console.log(`Respaldo de ${nombre}: ${vistas.size} tablas, ${propiasTotales} filas propias.`);
}

// La prueba de la prueba: con el filtro de la copia quitado a propósito, la filtración aparece.
{
  const definicion = correr(`SELECT pg_get_functiondef('public.filas_del_respaldo(text, integer, integer)'::regprocedure);`)
    .filas.map((f) => f.join('|')).join('\n');
  const sinFiltro = definicion.replace(`ELSE 't.prestadora_id = $1'`, `ELSE 'true'`);
  if (sinFiltro === definicion) {
    fallas.push('No encontré el filtro de public.filas_del_respaldo para probar que la prueba detecta una copia sin él.');
  } else {
    const { avisos: sinElFiltro } = correr(`BEGIN;\n${sinFiltro};\n${bloqueDeRespaldo(ids[0])}\nROLLBACK;`);
    if (!sinElFiltro.some(([, , ajenas]) => Number(ajenas) > 0)) {
      fallas.push('Con el filtro de la copia de respaldo quitado a propósito, la prueba no encontró la filtración: no prueba nada.');
    } else {
      console.log('Control: con el filtro de la copia de respaldo quitado, la prueba encuentra la filtración.');
    }
  }
}

// Con cualquier otro pase, las funciones de la copia no contestan.
const otrosPases = [
  { rol: 'authenticated', sesion: { sub: cuentas[0]?.id, role: 'authenticated' } },
  { rol: 'trabajo_sin_persona', sesion: { role: 'trabajo_sin_persona', prestadora_id: ids[0] } },
  { rol: 'anon', sesion: { role: 'anon' } },
  { rol: 'copia_de_respaldo', sesion: { role: 'copia_de_respaldo' } },
];
for (const { rol, sesion } of otrosPases) {
  const { avisos: deOtro } = correr(`BEGIN;
SET LOCAL ROLE ${rol};
SELECT set_config('request.jwt.claims', ${literal(JSON.stringify(sesion))}, true);
DO $otro$
BEGIN
  BEGIN
    PERFORM public.filas_del_respaldo('public.prestadoras', 0, 1);
    RAISE NOTICE 'contestó';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'negado';
  END;
END
$otro$;
ROLLBACK;`);
  const como = `${rol}${sesion.prestadora_id ? ' con Prestadora' : rol === 'copia_de_respaldo' ? ' sin Prestadora' : ''}`;
  if (deOtro[0]?.[0] !== 'negado') fallas.push(`La copia de respaldo le contesta a ${como}: tiene que negarse.`);
}
console.log(`La copia de respaldo se niega a ${otrosPases.length} pases que no son el suyo.`);

console.log(`${identidades.length} identidades × ${tablas.length} tablas leídas sin filtro de Prestadora.`);
for (const i of identidades) console.log(`  ${i.etiqueta}: ve filas propias en ${propiasPorIdentidad.get(i.etiqueta) ?? 0} tablas.`);

if (fallas.length > 0) {
  console.error(`\n${fallas.join('\n')}`);
  process.exit(1);
}
console.log('\nNinguna identidad lee una sola fila de la otra Prestadora: protege la base.');
