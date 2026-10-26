// ---------------------------------------------------------------------------
// probar_documentos_del_legajo.mjs — ¿el documento del legajo queda encerrado en su Prestadora?
//
// Uso, desde la raíz del producto, con la base local levantada:
//   node scripts/probar_documentos_del_legajo.mjs
//
// Devuelve 0 si el aislamiento aguanta y 1 si algo se filtró.
//
// POR QUÉ EXISTE
//
// Al depósito «documentos-asistente» suben la administración y el propio Asistente, cada uno con
// el pase de la persona que entró. Lo que lo aísla son sus políticas, no un
// filtro escrito en una pantalla. Una política no se prueba leyéndola: se prueba entrando.
//
// Y LA RUTA EMPIEZA POR LA PRESTADORA a propósito. Empezando por la cuenta, el día que una misma
// cuenta tenga legajo en dos Prestadoras las dos verían la misma carpeta. Eso es justamente lo que
// acá se comprueba que no pasa.
//
// QUÉ PRUEBA, con las dos Prestadoras que siembra `supabase/seed.sql` y datos cargados en las dos:
//
//   1. Cada administradora sube un documento a la carpeta de su propia Prestadora: tiene que entrar.
//   2. Cada una intenta subir a la carpeta de la otra: tiene que rebotar, en las dos direcciones.
//   3. Cada una lista el depósito: ve el suyo y ninguno del otro, en las dos direcciones.
//   4. Cada una pide un enlace temporal al documento de la otra: tiene que rebotar.
//   5. Cada Asistente ve y sube en su propia carpeta, y no alcanza nada de la otra Prestadora.
//
// Una consulta que devuelve vacío no prueba nada, y por eso cada comprobación de «no ve» corre
// contra un archivo que existe y que la otra sí ve.
//
// QUÉ NECESITA. La base local levantada, sembrada, y `panel/.env.local` con su dirección. Lo que
// sube se borra al terminar.
// ---------------------------------------------------------------------------

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEPOSITO = 'documentos-asistente';

const CONTENEDOR = process.env.CONTENEDOR_BASE || (() => {
  const toml = readFileSync(join(RAIZ, 'supabase', 'config.toml'), 'utf8');
  const id = toml.match(/^\s*project_id\s*=\s*"([^"]+)"/m);
  if (!id) throw new Error('No encontré project_id en supabase/config.toml.');
  return `supabase_db_${id[1]}`;
})();

// La contraseña de las cuentas de la base local. No se escribe acá: es la que
// recibió `scripts/poner_la_clave_de_la_siembra.mjs` después de sembrar, y entra
// por la misma variable. Sin ella no hay con qué entrar, así que no arranca.
const CONTRASENA = process.env.SEED_LOCAL_PASSWORD;
if (!CONTRASENA) {
  console.error('Falta la variable SEED_LOCAL_PASSWORD. Es la contraseña con la que entran las cuentas de la base local, y no se escribe en el código.');
  console.error('  Se la pone `node scripts/poner_la_clave_de_la_siembra.mjs` con esa misma variable.');
  process.exit(1);
}

const verde = (t) => `\x1b[32m${t}\x1b[0m`;
const rojo = (t) => `\x1b[31m${t}\x1b[0m`;
const gris = (t) => `\x1b[90m${t}\x1b[0m`;

let fallas = 0;
function comprobar(queSeEsperaba, salioBien, detalle = '') {
  if (salioBien) {
    console.log(`  ${verde('✓')} ${queSeEsperaba}`);
  } else {
    fallas += 1;
    console.log(`  ${rojo('✗')} ${queSeEsperaba} ${detalle ? gris(detalle) : ''}`);
  }
}

function leerEntorno() {
  const archivo = join(RAIZ, 'panel', '.env.local');
  if (!existsSync(archivo)) {
    throw new Error(`Falta ${archivo}. Sin la dirección de la base local no hay nada que probar.`);
  }
  const valores = {};
  for (const linea of readFileSync(archivo, 'utf8').split('\n')) {
    const corte = linea.indexOf('=');
    if (corte < 1 || linea.trimStart().startsWith('#')) continue;
    valores[linea.slice(0, corte).trim()] = linea.slice(corte + 1).trim();
  }
  return { base: valores.VITE_SUPABASE_URL, llavePublica: valores.VITE_SUPABASE_ANON_KEY };
}

function consultarBase(sql) {
  const salida = execFileSync(
    'docker',
    ['exec', CONTENEDOR, 'psql', '-U', 'postgres', '-d', 'postgres', '-tA', '-F', '|', '-c', sql],
    { encoding: 'utf8' },
  );
  return salida.trim().split('\n').filter(Boolean).map((l) => l.split('|'));
}

async function entrar(base, llavePublica, email) {
  const r = await fetch(`${base}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: llavePublica, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: CONTRASENA }),
  });
  const cuerpo = await r.json().catch(() => ({}));
  if (!cuerpo.access_token) {
    throw new Error(`No se pudo entrar como ${email} (${r.status}). ¿Corriste "npx supabase db reset"?`);
  }
  return cuerpo.access_token;
}

const CUERPO = Buffer.from('%PDF-1.4\n% documento de prueba\n');

async function subir({ base, llavePublica, pase, ruta }) {
  const r = await fetch(`${base}/storage/v1/object/${DEPOSITO}/${ruta}`, {
    method: 'POST',
    headers: { apikey: llavePublica, Authorization: `Bearer ${pase}`, 'Content-Type': 'application/pdf' },
    body: CUERPO,
  });
  return r.status;
}

async function listar({ base, llavePublica, pase, carpeta }) {
  const r = await fetch(`${base}/storage/v1/object/list/${DEPOSITO}`, {
    method: 'POST',
    headers: { apikey: llavePublica, Authorization: `Bearer ${pase}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix: carpeta, limit: 100 }),
  });
  const cuerpo = await r.json().catch(() => []);
  return Array.isArray(cuerpo) ? cuerpo.map((o) => o.name) : [];
}

async function borrar({ base, llavePublica, pase, ruta }) {
  await fetch(`${base}/storage/v1/object/${DEPOSITO}/${ruta}`, {
    method: 'DELETE',
    headers: { apikey: llavePublica, Authorization: `Bearer ${pase}` },
  });
}

async function pedirEnlaceTemporal({ base, llavePublica, pase, ruta }) {
  const r = await fetch(`${base}/storage/v1/object/sign/${DEPOSITO}/${ruta}`, {
    method: 'POST',
    headers: { apikey: llavePublica, Authorization: `Bearer ${pase}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: 60 }),
  });
  return r.status;
}

async function principal() {
  const { base, llavePublica } = leerEntorno();
  if (!base || !llavePublica) throw new Error('Falta VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en panel/.env.local.');

  // Las dos Prestadoras salen de la base, no escritas a mano: si la siembra cambia, esto sigue.
  const filas = consultarBase(`
    SELECT u.prestadora_id, coalesce(a.id, u.id), au.email, u.rol
      FROM public.usuarios u
      JOIN auth.users au ON au.id = u.id
      LEFT JOIN public.asistentes a ON a.usuario_id = u.id AND a.prestadora_id = u.prestadora_id
     WHERE u.rol IN ('admin_prestadora', 'asistente')
       AND u.prestadora_id IS NOT NULL
     ORDER BY u.prestadora_id, u.rol, au.email;`);

  const porPrestadora = new Map();
  for (const [prestadoraId, usuarioId, email, rol] of filas) {
    if (!porPrestadora.has(prestadoraId)) porPrestadora.set(prestadoraId, { prestadoraId });
    const lado = porPrestadora.get(prestadoraId);
    if (rol === 'admin_prestadora' && !lado.admin) lado.admin = { email, id: usuarioId };
    if (rol === 'asistente' && !lado.asistente) lado.asistente = { email, id: usuarioId };
  }

  const lados = [...porPrestadora.values()].filter((l) => l.admin && l.asistente);
  if (lados.length < 2) {
    console.log(rojo('Hacen falta dos Prestadoras sembradas, cada una con administradora y Asistente.'));
    process.exit(1);
  }

  const [una, otra] = lados;
  for (const lado of [una, otra]) {
    lado.pase = await entrar(base, llavePublica, lado.admin.email);
    lado.paseAsistente = await entrar(base, llavePublica, lado.asistente.email);
    lado.ruta = `${lado.prestadoraId}/${lado.asistente.id}/${crypto.randomUUID()}.pdf`;
  }

  // Lo que haya dejado una corrida anterior interrumpida se saca antes de empezar: si no, el
  // listado cuenta de más y la prueba falla por una razón que no es la que vino a buscar.
  for (const lado of [una, otra]) {
    const carpeta = `${lado.prestadoraId}/${lado.asistente.id}`;
    for (const nombre of await listar({ base, llavePublica, pase: lado.pase, carpeta })) {
      await borrar({ base, llavePublica, pase: lado.pase, ruta: `${carpeta}/${nombre}` });
    }
  }

  console.log('\nCada administradora sube el documento a la carpeta de su propia Prestadora');
  for (const lado of [una, otra]) {
    const estado = await subir({ base, llavePublica, pase: lado.pase, ruta: lado.ruta });
    comprobar(`entra el documento de la Prestadora ${lado.prestadoraId.slice(0, 8)}`, estado === 200, `estado ${estado}`);
  }

  console.log('\nCada una intenta subir a la carpeta de la otra');
  for (const [quien, ajena] of [[una, otra], [otra, una]]) {
    const ruta = `${ajena.prestadoraId}/${ajena.asistente.id}/${crypto.randomUUID()}.pdf`;
    const estado = await subir({ base, llavePublica, pase: quien.pase, ruta });
    comprobar(`rebota la de ${quien.prestadoraId.slice(0, 8)} escribiendo en ${ajena.prestadoraId.slice(0, 8)}`,
      estado !== 200, `estado ${estado}`);
  }

  console.log('\nQué ve cada una del depósito');
  for (const [quien, ajena] of [[una, otra], [otra, una]]) {
    const propios = await listar({ base, llavePublica, pase: quien.pase, carpeta: `${quien.prestadoraId}/${quien.asistente.id}` });
    const ajenos = await listar({ base, llavePublica, pase: quien.pase, carpeta: `${ajena.prestadoraId}/${ajena.asistente.id}` });
    comprobar(`${quien.prestadoraId.slice(0, 8)} ve el suyo`, propios.length === 1, `vio ${propios.length}`);
    comprobar(`${quien.prestadoraId.slice(0, 8)} no ve ninguno de ${ajena.prestadoraId.slice(0, 8)}`, ajenos.length === 0, `vio ${ajenos.length}`);
  }

  console.log('\nEl enlace temporal al documento ajeno');
  for (const [quien, ajena] of [[una, otra], [otra, una]]) {
    const propia = await pedirEnlaceTemporal({ base, llavePublica, pase: quien.pase, ruta: quien.ruta });
    const impropia = await pedirEnlaceTemporal({ base, llavePublica, pase: quien.pase, ruta: ajena.ruta });
    comprobar(`${quien.prestadoraId.slice(0, 8)} obtiene el enlace al suyo`, propia === 200, `estado ${propia}`);
    comprobar(`${quien.prestadoraId.slice(0, 8)} no obtiene el enlace al de ${ajena.prestadoraId.slice(0, 8)}`, impropia !== 200, `estado ${impropia}`);
  }

  console.log('\nCada Asistente con sesión');
  for (const [lado, ajena] of [[una, otra], [otra, una]]) {
    const propios = await listar({ base, llavePublica, pase: lado.paseAsistente, carpeta: `${lado.prestadoraId}/${lado.asistente.id}` });
    const ajenos = await listar({ base, llavePublica, pase: lado.paseAsistente, carpeta: `${ajena.prestadoraId}/${ajena.asistente.id}` });
    const enlacePropio = await pedirEnlaceTemporal({ base, llavePublica, pase: lado.paseAsistente, ruta: lado.ruta });
    const enlaceAjeno = await pedirEnlaceTemporal({ base, llavePublica, pase: lado.paseAsistente, ruta: ajena.ruta });
    comprobar('ve el suyo', propios.length === 1, `vio ${propios.length}`);
    comprobar('obtiene el enlace al suyo', enlacePropio === 200, `estado ${enlacePropio}`);
    comprobar('no ve ninguno de la otra Prestadora', ajenos.length === 0, `vio ${ajenos.length}`);
    comprobar('no obtiene el enlace al de la otra Prestadora', enlaceAjeno !== 200, `estado ${enlaceAjeno}`);

    lado.rutaDelAsistente = `${lado.prestadoraId}/${lado.asistente.id}/${crypto.randomUUID()}.pdf`;
    const sube = await subir({ base, llavePublica, pase: lado.paseAsistente, ruta: lado.rutaDelAsistente });
    comprobar('sube a su propia carpeta', sube === 200, `estado ${sube}`);
    const rutaAjena = `${ajena.prestadoraId}/${ajena.asistente.id}/${crypto.randomUUID()}.pdf`;
    const subeAjena = await subir({ base, llavePublica, pase: lado.paseAsistente, ruta: rutaAjena });
    comprobar('no sube a la carpeta de la otra Prestadora', subeAjena !== 200, `estado ${subeAjena}`);
  }

  // El Asistente borra sólo el archivo suelto: el que ninguna fila nombra. Al de la administradora
  // se le anota su fila, y el que subió el Asistente queda suelto. Lo que dice si se borró es el
  // listado de después, no la respuesta del borrado.
  console.log('\nEl Asistente y el archivo suelto');
  const nombreDe = (ruta) => ruta.split('/').pop();
  for (const [lado, ajena] of [[una, otra], [otra, una]]) {
    await borrar({ base, llavePublica, pase: lado.paseAsistente, ruta: ajena.rutaDelAsistente });
  }
  for (const lado of [una, otra]) {
    const quedan = await listar({ base, llavePublica, pase: lado.pase, carpeta: `${lado.prestadoraId}/${lado.asistente.id}` });
    comprobar('no borra el suelto de la otra Prestadora', quedan.includes(nombreDe(lado.rutaDelAsistente)), `quedan ${quedan.length}`);
  }
  for (const lado of [una, otra]) {
    consultarBase(`
      INSERT INTO public.documentos_asistente (prestadora_id, asistente_id, tipo_documento_id, ruta_archivo)
      SELECT '${lado.prestadoraId}', '${lado.asistente.id}', t.id, '${lado.ruta}'
        FROM public.tipos_documento_asistente t
       WHERE t.prestadora_id = '${lado.prestadoraId}'
       LIMIT 1
      RETURNING id;`);
    const carpeta = `${lado.prestadoraId}/${lado.asistente.id}`;

    await borrar({ base, llavePublica, pase: lado.paseAsistente, ruta: lado.ruta });
    await borrar({ base, llavePublica, pase: lado.paseAsistente, ruta: lado.rutaDelAsistente });
    const quedan = await listar({ base, llavePublica, pase: lado.pase, carpeta });
    comprobar('no borra el archivo que tiene su fila', quedan.includes(nombreDe(lado.ruta)), `quedan ${quedan.length}`);
    comprobar('borra el suelto de su carpeta', !quedan.includes(nombreDe(lado.rutaDelAsistente)), `quedan ${quedan.length}`);
    consultarBase(`DELETE FROM public.documentos_asistente WHERE ruta_archivo = '${lado.ruta}' RETURNING id;`);
  }

  // Lo subido se borra por la API de archivos, que es el único camino: la base rechaza el borrado
  // directo de esa tabla para no dejar el archivo huérfano del renglón.
  for (const lado of [una, otra]) {
    await borrar({ base, llavePublica, pase: lado.pase, ruta: lado.ruta });
    if (lado.rutaDelAsistente) await borrar({ base, llavePublica, pase: lado.pase, ruta: lado.rutaDelAsistente });
  }

  console.log(fallas === 0
    ? `\n${verde('✓')} El documento del legajo queda encerrado en su Prestadora.`
    : `\n${rojo('✗')} ${fallas} comprobación(es) fallaron.`);
  process.exit(fallas === 0 ? 0 : 1);
}

principal().catch((e) => {
  console.error(rojo(e.message));
  process.exit(1);
});
