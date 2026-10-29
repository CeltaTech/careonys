// ---------------------------------------------------------------------------
// probar_altas_con_sesion.mjs — ¿una persona con sesión puede dar de alta?
//
// Uso, desde la raíz del producto, con la base local levantada:
//   node scripts/probar_altas_con_sesion.mjs
//
// Devuelve 0 si todas las altas entraron y 1 si alguna rebotó.
//
// POR QUÉ EXISTE
//
// El Panel escribe en la base directamente desde el navegador, con el pase de
// la persona que entró. El backend, en cambio, entra con la llave de servicio,
// que puede todo. Son dos roles distintos con permisos distintos, y hasta que
// se escribió esta prueba **ninguna prueba del producto escribía con el pase de
// una persona**: las del backend pasan por la llave de servicio, y
// `probar_aislamiento.mjs` abre sesión de persona pero solamente lee.
//
// Por ese hueco se coló un defecto que estuvo dado de alta en el código sin que
// nada lo notara: catorce tablas tenían un disparador que llamaba a una función
// que quien inserta no tenía permiso de ejecutar, así que toda alta hecha desde
// el Panel se caía con «42501 permission denied». Con la llave de servicio
// entraba sin problema, y por eso las 576 pruebas del backend seguían en verde.
//
// QUÉ PRUEBA
//
// Tres cosas distintas, y las tres hacen falta:
//
//   1. EL CAMINO REAL. Abre sesión de administradora de la Prestadora de
//      pruebas y da de alta una fila en cada tabla que tenga uno de estos
//      disparadores, sin mandarle el dato que el disparador completa. Espera
//      que entre y que el dato haya quedado puesto. Lo que inserta se borra al
//      terminar.
//
//   2. QUE NO VUELVA A PASAR, ni acá ni en un disparador que se escriba mañana.
//      Le pregunta a la base, para todos sus disparadores que corren con el rol
//      de quien escribe, si alguno llama a una función que ese rol no pueda
//      ejecutar. Con el defecto puesto esto encontraba ocho.
//
//   3. QUIÉN PUEDE ESCRIBIR QUÉ. Que leer la configuración y escribirla sean
//      dos cosas distintas del lado de la base, y no de la pantalla: el
//      catálogo lo lee cualquiera de la Prestadora, lo escribe el personal, la
//      configuración de la empresa la escribe la administración, y lo de cada
//      Asistente lo escribe además el dueño de su propio Legajo del Asistente. Cada negativa
//      va con su afirmativa sobre la misma tabla, cambiando nada más que quién
//      tiene la sesión: sola, la negativa la daría igual una política que niega
//      todo, que además rompe el Panel.
//
// La primera prueba el caso conocido; la segunda, la clase entera. Sin la
// segunda, un disparador nuevo repetiría el defecto y esta prueba seguiría en
// verde porque no toca su tabla.
//
// QUÉ QUEDA AFUERA DEL CAMINO REAL, y por qué no queda sin probar
//
// Dos disparadores no se pueden alcanzar con una sesión de Panel, porque las
// filas que los despiertan no las escribe el Panel:
//
//   · `fn_completar_moneda_desde_cliente`, de `qr_cobro_efectivo`, que escribe
//     un Cliente y no el Panel, y cuya política exige además una suscripción
//     del Match y el permiso de dinero adentro de las personas autorizadas.
//   · `fn_modalidades_de_asistente_nuevo`, que corre sólo al insertar un
//     Asistente, y un Asistente lo da de alta el backend: su identificador es el
//     de la persona, que tiene que existir antes.
//
// Los dos llaman a la misma función que otro disparador que sí se prueba acá,
// y la segunda comprobación los alcanza igual. De `asistentes` se prueba lo que
// el Panel hace de verdad, que es modificarle las modalidades a uno que ya
// existe (`panel/src/pages/asistentes/PerfilTab.jsx`).
//
// QUÉ NECESITA. La Prestadora de pruebas que siembra `supabase/seed.sql`, con
// sus pacientes y asistentes. Si falta algo, avisa y no corre.
// ---------------------------------------------------------------------------

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

// El contenedor de la base local. El nombre se arma con el identificador que
// está en `supabase/config.toml`, no escrito a mano acá.
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
const ADMINISTRADORA = 'admin@sandbox.local';
// El pase más angosto del Panel: lo que alcanza se decide por el Asistente de cada fila.
const COORDINADORA = 'coordinadora@sandbox.local';
// Y alguien que no es del Panel: tiene sesión en la Prestadora y su propio Legajo del Asistente, nada más.
const ASISTENTE = 'ana.asistente@sandbox.local';

const verde = (t) => `\x1b[32m${t}\x1b[0m`;
const rojo = (t) => `\x1b[31m${t}\x1b[0m`;
const gris = (t) => `\x1b[90m${t}\x1b[0m`;

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

// Entra como esa persona en esa Prestadora. La siembra la conoce por su email, que es dato de
// contacto; el servicio de acceso la conoce por otra dirección, que no es la misma para todas:
// coordinación, Asistentes y Clientes entran con `<cuenta>@acceso.careonys.invalid`, y
// administración con su email tal cual. Por eso se le pregunta a la base con cuál entra esa cuenta,
// en vez de armarla acá.
function correoDeAccesoDe(email, prestadoraId) {
  const filas = consultarBase(
    `select u.email from auth.users u join public.usuarios p on p.id = u.id where lower(p.email) = lower('${email.replace(/'/g, "''")}') and prestadora_id = '${prestadoraId}'`,
  );
  if (filas.length !== 1) throw new Error(`No hay una sola cuenta con ${email} en esa Prestadora.`);
  return filas[0][0];
}

async function entrar(base, llavePublica, email, prestadoraId) {
  const r = await fetch(`${base}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: llavePublica, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: correoDeAccesoDe(email, prestadoraId), password: CONTRASENA }),
  });
  const cuerpo = await r.json().catch(() => ({}));
  if (!cuerpo.access_token) {
    throw new Error(`No se pudo entrar como ${email} (${r.status}). ¿Corriste "npx supabase db reset --local"?`);
  }
  return cuerpo.access_token;
}

// ---------------------------------------------------------------------------
// Los datos con los que se arman las altas
// ---------------------------------------------------------------------------

function anclas() {
  const [fila] = consultarBase(`
    WITH p AS (
      SELECT id, moneda FROM public.prestadoras
       WHERE razon_social ILIKE '%Sandbox%' OR nombre_fantasia ILIKE '%Sandbox%'
       LIMIT 1
    ),
    -- Un Asistente al que los documentos no le frenen la Guardia, porque si lo
    -- frena el alta rebota por ese otro motivo y la prueba diría que hay un
    -- problema de permisos donde no lo hay. Y de esos, primero el que trabaje
    -- en más de una modalidad: es el único con el que se puede probar el
    -- disparador de las modalidades sin cambiarle a nadie la forma de trabajo.
    elegido AS (
      SELECT a.id, a.canales
        FROM public.asistentes a
       WHERE a.prestadora_id = (SELECT id FROM p)
         AND a.estado = 'activo'
         AND cardinality(interno.documentos_que_bloquean(a.id, CURRENT_DATE, NULL, NULL)) = 0
         AND 'directa' = ANY(a.canales)
       ORDER BY coalesce(array_length(a.canales, 1), 0) DESC, a.id
       LIMIT 1
    )
    SELECT (SELECT id FROM p),
           (SELECT moneda FROM p),
           (SELECT id FROM public.pacientes WHERE prestadora_id = (SELECT id FROM p)
             ORDER BY id LIMIT 1),
           (SELECT id FROM elegido),
           (SELECT array_to_string(canales, ',') FROM elegido),
           -- El Servicio del Paciente, que es el de quien lo contrata, y con Coordinador: sin él
           -- no se arma ninguna guardia.
           (SELECT s.id FROM public.servicios s
              JOIN public.pacientes pa ON pa.cliente_id = s.contratante_id
                                      AND pa.prestadora_id = s.prestadora_id
             WHERE pa.id = (SELECT id FROM public.pacientes WHERE prestadora_id = (SELECT id FROM p)
                             ORDER BY id LIMIT 1)
               AND s.tipo_contratante = 'cliente'
               AND s.estado = 'vigente'
               AND s.coordinador_id IS NOT NULL
             ORDER BY s.id LIMIT 1);
  `);

  const [prestadora, moneda, paciente, asistente, canalesEnTexto, servicio] = fila || [];
  const faltan = [
    !prestadora && 'la Prestadora de pruebas',
    !paciente && 'un Paciente suyo',
    !servicio && 'un Servicio vigente de ese Paciente, con Coordinador',
    !asistente && 'un Asistente suyo sin documentos que le impidan trabajar y que trabaje en directa',
  ].filter(Boolean);

  if (faltan.length) {
    throw new Error(`Falta ${faltan.join(', ')} en la base. Corré "npx supabase db reset --local".`);
  }

  // Para que el disparador de las modalidades llegue a llamar a la función, lo
  // que se escribe tiene que ser distinto de lo que ya está: si es igual, el
  // disparador se corta antes de llamar a nada y la prueba pasaría sin haber
  // probado nada.
  const canalesAhora = (canalesEnTexto || '').split(',').filter(Boolean);
  const canalesDeLaPrueba = canalesAhora.length > 1 ? [canalesAhora[0]] : null;

  return { prestadora, moneda, paciente, asistente, servicio, canalesAhora, canalesDeLaPrueba };
}

// ---------------------------------------------------------------------------
// Primera comprobación: el camino real
// ---------------------------------------------------------------------------

async function probarLasAltas({ base, llavePublica }, token, d) {
  const hoy = new Date().toISOString().slice(0, 10);

  // Cada caso dice qué tabla, qué se manda, qué disparador se está probando y
  // qué tiene que haber quedado completo cuando el disparador hizo su trabajo.
  const casos = [
    {
      tabla: 'prestaciones',
      disparadores: 'fn_completar_moneda → interno.moneda_de_prestadora',
      fila: {
        prestadora_id: d.prestadora,
        paciente_id: d.paciente,
        tipo_servicio: 'Prueba de altas con sesión',
        precio_final: 1234.56,
      },
      completa: (f) => (f.moneda === d.moneda
        ? null
        : `la moneda quedó en ${JSON.stringify(f.moneda)} y la Prestadora trabaja en ${d.moneda}`),
    },
    {
      // Lo que hace el Panel de verdad: cambiarle las modalidades a un
      // Asistente que ya existe. Se le vuelven a poner las que tenía, así que
      // la fila queda como estaba.
      tabla: 'asistentes',
      modifica: d.canalesDeLaPrueba ? `id=eq.${d.asistente}` : null,
      sinCamino: 'ningún Asistente de prueba tiene más de una modalidad, así que no hay '
        + 'valor distinto que escribirle sin cambiarle la forma de trabajo',
      restaura: { canales: d.canalesAhora },
      disparadores: 'fn_modalidades_dentro_de_lo_habilitado → interno.modalidades_habilitadas_de_prestadora',
      fila: { canales: d.canalesDeLaPrueba },
      completa: (f) => (Array.isArray(f.canales) && f.canales.length
        ? null
        : `las modalidades quedaron en ${JSON.stringify(f.canales)}`),
    },
    {
      tabla: 'guardias',
      disparadores:
        'trg_exigir_documentos_en_guardia → interno.documentos_que_bloquean, y '
        + 'fn_modalidad_de_la_guardia → interno.asistente_trabaja_en_modalidad',
      fila: {
        prestadora_id: d.prestadora,
        paciente_id: d.paciente,
        servicio_id: d.servicio,
        asistente_id: d.asistente,
        fecha: hoy,
        hora_inicio: '08:00',
        hora_fin: '12:00',
        modalidad: 'presencial',
        canal_modalidad: 'directa',
      },
      completa: () => null,
    },
  ];

  // La asignación necesita la Guardia que crea el caso anterior, así que se arma
  // recién cuando ésa entró.
  const creado = [];
  const problemas = [];

  console.log('\n== El camino real: dar de alta con el pase de una persona ==\n');
  console.log(gris(`  Sesión: ${ADMINISTRADORA}\n`));

  for (const caso of [...casos, null]) {
    let elCaso = caso;

    if (elCaso === null) {
      const guardia = creado.find((c) => c.tabla === 'guardias');
      if (!guardia) continue;
      elCaso = {
        tabla: 'asignaciones_de_turno',
        disparadores:
          'trg_exigir_documentos_en_asignacion → interno.documentos_que_bloquean, y '
          + 'fn_modalidad_en_asignacion → interno.asistente_trabaja_en_modalidad',
        fila: {
          prestadora_id: d.prestadora,
          guardia_id: guardia.id,
          asistente_id: d.asistente,
        },
        completa: () => null,
      };
    }

    // Un caso que declara `modifica` cambia una fila que ya está en vez de
    // crear una nueva, porque eso es lo que hace el Panel con esa tabla.
    const modifica = 'modifica' in elCaso;
    if (modifica && !elCaso.modifica) {
      console.log(gris(`  – ${elCaso.tabla}: no se pudo probar por el camino real`));
      console.log(gris(`      ${elCaso.sinCamino}`));
      continue;
    }

    const escribir = async (cuerpoDelPedido, filtro) => {
      const r = await fetch(`${base}/rest/v1/${elCaso.tabla}${filtro ? `?${filtro}` : ''}`, {
        method: filtro ? 'PATCH' : 'POST',
        headers: {
          apikey: llavePublica,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify(cuerpoDelPedido),
      });
      return [r, await r.json().catch(() => null)];
    };

    const [r, cuerpo] = await escribir(elCaso.fila, elCaso.modifica);

    if (!r.ok) {
      const detalle = cuerpo?.message || JSON.stringify(cuerpo);
      const codigo = cuerpo?.code ? `${cuerpo.code} ` : '';
      const verbo = modifica ? 'la modificación rebotó' : 'el alta rebotó';
      problemas.push(`${elCaso.tabla}: ${verbo} con ${r.status} — ${codigo}${detalle}`);
      console.log(rojo(`  ✗ ${elCaso.tabla}`));
      console.log(gris(`      ${elCaso.disparadores}`));
      console.log(rojo(`      ${r.status} ${codigo}${detalle}`));
      continue;
    }

    const fila = Array.isArray(cuerpo) ? cuerpo[0] : cuerpo;
    if (modifica) {
      // La fila era de antes y se queda: se le devuelve lo que tenía.
      await escribir(elCaso.restaura, elCaso.modifica);
    } else {
      creado.push({ tabla: elCaso.tabla, id: fila?.id });
    }

    const incompleto = elCaso.completa(fila || {});
    if (incompleto) {
      problemas.push(`${elCaso.tabla}: entró pero el disparador no hizo lo suyo — ${incompleto}`);
      console.log(rojo(`  ✗ ${elCaso.tabla}: ${incompleto}`));
    } else {
      console.log(verde(`  ✓ ${elCaso.tabla}`));
      console.log(gris(`      ${elCaso.disparadores}`));
    }
  }

  return { problemas, creado };
}

// ---------------------------------------------------------------------------
// Segunda comprobación: el hueco
// ---------------------------------------------------------------------------
// La pantalla promete que el turno se puede armar sin Asistente y asignarlo después. Quien más
// usa esa promesa es el Coordinador, y es justo el rol cuyo alcance se define por el Asistente:
// si la regla que lo acota no contempla el hueco, lo que la pantalla ofrece rebota contra la
// base. Pasó —la serie volvía con `new row violates row-level security policy`, que en pantalla
// se lee «este usuario no tiene permiso para hacer esto»— y no lo vio ninguna prueba, porque
// todas entran con la administradora, que alcanza todo lo de su Prestadora. Por eso ésta entra
// con el pase más angosto que hay.

async function probarElHueco({ base, llavePublica }, d) {
  console.log('\n== El hueco: armar el turno sin Asistente todavía ==\n');
  console.log(gris(`  Sesión: ${COORDINADORA}\n`));

  const token = await entrar(base, llavePublica, COORDINADORA, d.prestadora);
  const enUnMes = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const r = await fetch(`${base}/rest/v1/series_guardias`, {
    method: 'POST',
    headers: {
      apikey: llavePublica,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      prestadora_id: d.prestadora,
      paciente_id: d.paciente,
      servicio_id: d.servicio,
      dias_semana: ['martes'],
      hora_inicio: '09:00',
      hora_fin: '13:00',
      modalidad: 'presencial',
      vigente_desde: enUnMes,
    }),
  });
  const cuerpo = await r.json().catch(() => null);

  if (!r.ok) {
    const codigo = cuerpo?.code ? `${cuerpo.code} ` : '';
    const detalle = cuerpo?.message || JSON.stringify(cuerpo);
    console.log(rojo('  ✗ series_guardias sin Asistente'));
    console.log(rojo(`      ${r.status} ${codigo}${detalle}`));
    return [`series_guardias: el Coordinador no pudo armar la serie sin Asistente — ${r.status} ${codigo}${detalle}`];
  }

  const fila = Array.isArray(cuerpo) ? cuerpo[0] : cuerpo;
  if (fila?.id) consultarBase(`DELETE FROM public.series_guardias WHERE id = '${fila.id}';`);
  console.log(verde('  ✓ series_guardias sin Asistente'));
  console.log(gris('      coordinador_gestiona_series_guardias_de_sus_servicios → interno.coordina_el_servicio'));
  return [];
}

// ---------------------------------------------------------------------------
// Tercera comprobación: que no vuelva a pasar
// ---------------------------------------------------------------------------

function probarLaClaseEntera() {
  console.log('\n== La clase entera: ¿algún disparador llama algo que quien escribe no pueda? ==\n');

  const filas = consultarBase(`
    WITH disparadores AS (
      SELECT DISTINCT p.oid, n.nspname || '.' || p.proname AS quien, p.prosrc
        FROM pg_trigger t
        JOIN pg_proc p ON p.oid = t.tgfoid
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE NOT t.tgisinternal AND NOT p.prosecdef
    ),
    llamables AS (
      SELECT p.oid, n.nspname || '.' || p.proname AS cual, p.proname AS solo_nombre
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname IN ('public', 'interno')
    )
    SELECT DISTINCT d.quien, l.cual
      FROM disparadores d
      JOIN llamables l ON l.oid <> d.oid AND d.prosrc ~ ('\\y' || l.solo_nombre || '\\y')
     WHERE NOT has_function_privilege('authenticated', l.oid, 'EXECUTE')
     ORDER BY 1, 2;
  `);

  const [[cuantos]] = consultarBase(`
    SELECT count(DISTINCT p.oid) FROM pg_trigger t
      JOIN pg_proc p ON p.oid = t.tgfoid
     WHERE NOT t.tgisinternal AND NOT p.prosecdef;
  `);

  if (!filas.length) {
    console.log(verde(`  Los ${cuantos} disparadores que corren con el rol de quien escribe`));
    console.log(verde('  llaman solamente cosas que ese rol puede ejecutar.'));
    return [];
  }

  console.log(rojo(`  ${filas.length} llamada(s) que quien escribe no puede hacer:`));
  for (const [quien, cual] of filas) console.log(rojo(`    ${quien} → ${cual}`));
  return filas.map(([quien, cual]) => `${quien} llama a ${cual}, que quien escribe no puede ejecutar`);
}

// ---------------------------------------------------------------------------
// Cuarta comprobación: leer la configuración y escribirla no son lo mismo
//
// El catálogo lo lee cualquiera de la Prestadora; lo escribe el personal; y la
// configuración de la empresa la escribe la administración. Hasta acá eso vivía
// sólo en la pantalla, así que la base dejaba pasar a quien la pantalla frenaba.
//
// Se prueban las dos caras. Sólo comprobar que algo rebota no prueba nada: una
// política que niega todo rebota igual, y encima rompe el Panel. Por eso cada
// negativa viene con su afirmativa, con la misma tabla y el mismo pedido,
// cambiando nada más que quién tiene la sesión.
// ---------------------------------------------------------------------------

async function pedir({ base, llavePublica }, token, metodo, ruta, cuerpo) {
  const r = await fetch(`${base}/rest/v1/${ruta}`, {
    method: metodo,
    headers: {
      apikey: llavePublica,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}),
  });
  const leido = await r.json().catch(() => null);
  return { ok: r.ok, estado: r.status, cuerpo: leido, filas: Array.isArray(leido) ? leido : [] };
}

async function probarQuienEscribeLaConfiguracion(entorno, d) {
  console.log('\n== Leer la configuración y escribirla: quién puede cada cosa ==\n');

  const [[asistenteDeLaSesion, usuarioDelAsistente]] = consultarBase(`
    SELECT a.id, a.usuario_id FROM public.asistentes a
      JOIN public.usuarios u ON u.id = a.usuario_id
     WHERE u.email = '${ASISTENTE}' AND a.prestadora_id = '${d.prestadora}'
     LIMIT 1;
  `);
  if (!asistenteDeLaSesion) {
    throw new Error(`No encontré el Legajo del Asistente de ${ASISTENTE} en la Prestadora de pruebas.`);
  }

  // Un compañero de la misma Prestadora: en su Legajo el Asistente de la sesión no puede escribir.
  const [[otroAsistente]] = consultarBase(`
    SELECT a.id FROM public.asistentes a
     WHERE a.prestadora_id = '${d.prestadora}' AND a.id <> '${asistenteDeLaSesion}'
     ORDER BY a.id LIMIT 1;
  `);

  const problemas = [];
  const bien = (t, n) => { console.log(verde(`  ✓ ${t}`)); if (n) console.log(gris(`      ${n}`)); };
  const mal = (t, n) => { console.log(rojo(`  ✗ ${t}`)); console.log(rojo(`      ${n}`)); problemas.push(`${t} — ${n}`); };

  const deLaAdministracion = await entrar(entorno.base, entorno.llavePublica, ADMINISTRADORA, d.prestadora);
  const deLaCoordinadora = await entrar(entorno.base, entorno.llavePublica, COORDINADORA, d.prestadora);
  const delAsistente = await entrar(entorno.base, entorno.llavePublica, ASISTENTE, d.prestadora);

  // ---- El catálogo lo lee cualquiera de la Prestadora ----------------------
  const lectura = await pedir(entorno, delAsistente, 'GET', `configuracion_ausencias?select=prestadora_id&prestadora_id=eq.${d.prestadora}`);
  if (lectura.filas.length === 1) {
    bien('el Asistente lee la configuración de ausencias de su Prestadora', 'configuracion_ausencias_la_lee_su_prestadora');
  } else {
    mal('el Asistente lee la configuración de ausencias de su Prestadora',
        `esperaba 1 fila y vinieron ${lectura.filas.length} (${lectura.estado})`);
  }

  const lugaresQueVe = await pedir(entorno, delAsistente, 'GET', `lugares?select=id&prestadora_id=eq.${d.prestadora}`);
  if (lugaresQueVe.filas.length > 0) {
    bien('el Asistente lee el catálogo de Lugares de su Prestadora', 'lugares_los_lee_su_prestadora');
  } else {
    mal('el Asistente lee el catálogo de Lugares de su Prestadora',
        `esperaba al menos una fila y no vino ninguna (${lugaresQueVe.estado})`);
  }

  // ---- El catálogo lo escribe el personal, y sólo el personal ---------------
  const lugarDelAsistente = await pedir(entorno, delAsistente, 'POST', 'lugares', {
    prestadora_id: d.prestadora, nombre: 'Lugar de la prueba de escritura', pais: 'AR',
  });
  if (lugarDelAsistente.ok) {
    consultarBase("DELETE FROM public.lugares WHERE nombre = 'Lugar de la prueba de escritura';");
    mal('el Asistente NO escribe el catálogo de Lugares', 'la base lo dejó cargar un Lugar');
  } else {
    bien('el Asistente NO escribe el catálogo de Lugares', `rebotó con ${lugarDelAsistente.estado}`);
  }

  const lugarDeLaCoordinadora = await pedir(entorno, deLaCoordinadora, 'POST', 'lugares', {
    prestadora_id: d.prestadora, nombre: 'Lugar de la prueba de escritura', pais: 'AR',
  });
  if (lugarDeLaCoordinadora.ok) {
    consultarBase("DELETE FROM public.lugares WHERE nombre = 'Lugar de la prueba de escritura';");
    bien('la Coordinadora SÍ escribe el catálogo de Lugares', 'lugares_los_escribe_el_personal');
  } else {
    const c = lugarDeLaCoordinadora.cuerpo || {};
    mal('la Coordinadora SÍ escribe el catálogo de Lugares',
        `${lugarDeLaCoordinadora.estado} ${c.code || ''} ${c.message || ''}`.trim());
  }

  // ---- Las referencias laborales son del personal, no de cualquiera ---------
  const referenciaDelAsistente = await pedir(entorno, delAsistente, 'POST', 'referencias_laborales_asistente', {
    prestadora_id: d.prestadora, asistente_id: asistenteDeLaSesion,
    nombre: 'Referencia de la prueba de escritura', telefono: '000',
  });
  if (referenciaDelAsistente.ok) {
    consultarBase("DELETE FROM public.referencias_laborales_asistente WHERE nombre = 'Referencia de la prueba de escritura';");
    mal('el Asistente NO carga referencias laborales', 'la base lo dejó cargar una referencia de su propio Legajo del Asistente');
  } else {
    bien('el Asistente NO carga referencias laborales', `rebotó con ${referenciaDelAsistente.estado}`);
  }

  const referenciaDeLaCoordinadora = await pedir(entorno, deLaCoordinadora, 'POST', 'referencias_laborales_asistente', {
    prestadora_id: d.prestadora, asistente_id: asistenteDeLaSesion,
    nombre: 'Referencia de la prueba de escritura', telefono: '000',
  });
  if (referenciaDeLaCoordinadora.ok) {
    consultarBase("DELETE FROM public.referencias_laborales_asistente WHERE nombre = 'Referencia de la prueba de escritura';");
    bien('la Coordinadora SÍ carga referencias laborales', 'referencias_laborales_las_gestiona_el_personal');
  } else {
    const c = referenciaDeLaCoordinadora.cuerpo || {};
    mal('la Coordinadora SÍ carga referencias laborales',
        `${referenciaDeLaCoordinadora.estado} ${c.code || ''} ${c.message || ''}`.trim());
  }

  // ---- Y la configuración de la empresa la escribe la administración --------
  // Rebotar por política devuelve 200 con ninguna fila tocada, que se lee igual
  // que un pedido que no encontró nada. Por eso los dos pedidos son idénticos y
  // apuntan a una fila que existe: lo único que cambia es quién tiene la sesión.
  const [[comoEstaba]] = consultarBase(
    `SELECT updated_at FROM public.configuracion_ausencias WHERE prestadora_id = '${d.prestadora}';`,
  );
  const cuandoSea = new Date(Date.now() - 60_000).toISOString();

  const tocaLaCoordinadora = await pedir(
    entorno, deLaCoordinadora, 'PATCH',
    `configuracion_ausencias?prestadora_id=eq.${d.prestadora}`, { updated_at: cuandoSea },
  );
  if (tocaLaCoordinadora.filas.length === 0) {
    bien('la Coordinadora NO escribe la configuración de ausencias', 'no tocó ninguna fila');
  } else {
    mal('la Coordinadora NO escribe la configuración de ausencias', 'la base la dejó modificarla');
  }

  const tocaLaAdministracion = await pedir(
    entorno, deLaAdministracion, 'PATCH',
    `configuracion_ausencias?prestadora_id=eq.${d.prestadora}`, { updated_at: cuandoSea },
  );
  if (tocaLaAdministracion.filas.length === 1) {
    bien('la administración SÍ escribe la configuración de ausencias', 'configuracion_ausencias_la_escribe_la_administracion');
  } else {
    const c = tocaLaAdministracion.cuerpo || {};
    mal('la administración SÍ escribe la configuración de ausencias',
        `${tocaLaAdministracion.estado} ${c.code || ''} ${c.message || ''}`.trim() || 'no tocó ninguna fila');
  }

  consultarBase(
    `UPDATE public.configuracion_ausencias SET updated_at = '${comoEstaba}' WHERE prestadora_id = '${d.prestadora}';`,
  );

  // ---- Y los documentos de cada Asistente: él los carga en revisión, la administración aprobados --
  // Cada carga es una fila nueva. Las de la prueba llevan un número que ninguna fila sembrada usa,
  // y se borran al terminar, pase lo que pase.
  const NUMERO_DE_PRUEBA = 'PRUEBA-ESCRITURA';
  const borrarLosDocumentosDePrueba = () => consultarBase(
    `DELETE FROM public.documentos_asistente WHERE numero = '${NUMERO_DE_PRUEBA}';`,
  );
  const tipoDocumento = Object.fromEntries(consultarBase(
    `SELECT nombre, id FROM public.tipos_documento_asistente WHERE prestadora_id = '${d.prestadora}';`,
  ));
  const organismo = Object.fromEntries(consultarBase(
    `SELECT nombre, id FROM public.organismos_otorgantes WHERE pais = 'AR';`,
  ));
  const [[usuarioDeLaAdministracion]] = consultarBase(
    `SELECT id FROM public.usuarios WHERE lower(email) = lower('${ADMINISTRADORA}') AND prestadora_id = '${d.prestadora}';`,
  );
  const TITULO = tipoDocumento['Título'];
  const ANTECEDENTES = tipoDocumento['Certificado de antecedentes'];
  const LIBRETA = tipoDocumento['Libreta sanitaria'];
  const REINCIDENCIA = organismo['Registro Nacional de Reincidencia'];
  const ARCA = organismo.ARCA;
  if (!TITULO || !ANTECEDENTES || !LIBRETA || !REINCIDENCIA || !ARCA || !usuarioDeLaAdministracion) {
    throw new Error('Faltan en la base los tipos de documento u organismos de la siembra. Corré "npx supabase db reset --local".');
  }
  const unaFila = (sql) => (consultarBase(sql)[0] || []);
  const queDijo = (r) => {
    const c = r.cuerpo || {};
    return `${r.estado} ${c.code || ''} ${c.message || ''}`.trim();
  };
  const documento = (asistente, extra) => ({
    prestadora_id: d.prestadora, asistente_id: asistente, numero: NUMERO_DE_PRUEBA, ...extra,
  });

  try {
    borrarLosDocumentosDePrueba();

    // El Título no vence: aunque llegue una fecha de vencimiento, completar_documento_asistente la
    // borra. Si la fila quedara con la fecha, el disparador no corrió.
    const delAsistentePropio = await pedir(entorno, delAsistente, 'POST', 'documentos_asistente',
      documento(asistenteDeLaSesion, {
        tipo_documento_id: TITULO, estado: 'en_revision', cargado_por: usuarioDelAsistente,
        fecha_vencimiento: '2099-12-31',
      }));
    if (delAsistentePropio.ok) {
      const [estado, vence] = unaFila(
        `SELECT estado, coalesce(fecha_vencimiento::text, 'sin fecha') FROM public.documentos_asistente
          WHERE numero = '${NUMERO_DE_PRUEBA}' AND asistente_id = '${asistenteDeLaSesion}';`,
      );
      if (estado === 'en_revision' && vence === 'sin fecha') {
        bien('el Asistente SÍ carga un documento suyo, y entra en revisión',
             'asistente_carga_sus_documentos; completar_documento_asistente borró el vencimiento de un documento que no vence');
      } else {
        mal('el Asistente SÍ carga un documento suyo, y entra en revisión', `quedó ${estado}, vencimiento ${vence}`);
      }
    } else {
      mal('el Asistente SÍ carga un documento suyo, y entra en revisión', queDijo(delAsistentePropio));
    }

    const delAsistenteAprobado = await pedir(entorno, delAsistente, 'POST', 'documentos_asistente',
      documento(asistenteDeLaSesion, {
        tipo_documento_id: TITULO, estado: 'aprobado', cargado_por: usuarioDelAsistente,
        revisado_por: usuarioDelAsistente,
      }));
    if (delAsistenteAprobado.ok) {
      mal('el Asistente NO se aprueba su propio documento', 'la base lo dejó cargarlo aprobado');
    } else {
      bien('el Asistente NO se aprueba su propio documento', `rebotó con ${delAsistenteAprobado.estado}`);
    }

    if (otroAsistente) {
      const delAsistenteAjeno = await pedir(entorno, delAsistente, 'POST', 'documentos_asistente',
        documento(otroAsistente, { tipo_documento_id: TITULO, estado: 'en_revision', cargado_por: usuarioDelAsistente }));
      if (delAsistenteAjeno.ok) {
        mal('el Asistente NO carga un documento de otro Asistente', 'la base lo dejó escribir en el Legajo del Asistente de otro');
      } else {
        bien('el Asistente NO carga un documento de otro Asistente', `rebotó con ${delAsistenteAjeno.estado}`);
      }
    }

    // La administración carga aprobado, con el organismo que otorga ese documento.
    const deLaAdministracionAprobado = await pedir(entorno, deLaAdministracion, 'POST', 'documentos_asistente',
      documento(asistenteDeLaSesion, {
        tipo_documento_id: ANTECEDENTES, organismo_id: REINCIDENCIA, fecha_vencimiento: '2099-06-30',
        estado: 'aprobado', cargado_por: usuarioDeLaAdministracion,
        revisado_por: usuarioDeLaAdministracion, revisado_at: new Date().toISOString(),
      }));
    if (deLaAdministracionAprobado.ok) {
      const [estado, vence] = unaFila(
        `SELECT estado, fecha_vencimiento FROM public.documentos_asistente
          WHERE numero = '${NUMERO_DE_PRUEBA}' AND tipo_documento_id = '${ANTECEDENTES}';`,
      );
      if (estado === 'aprobado' && vence === '2099-06-30') {
        bien('la administración SÍ carga un documento aprobado', 'admin_prestadora_gestiona_documentos_asistente; completar_documento_asistente sin 42501');
      } else {
        mal('la administración SÍ carga un documento aprobado', `quedó ${estado}, vencimiento ${vence}`);
      }
    } else {
      mal('la administración SÍ carga un documento aprobado', queDijo(deLaAdministracionAprobado));
    }

    // Un organismo que no otorga ese documento: lo frena el disparador, no la política.
    const conOrganismoAjeno = await pedir(entorno, deLaAdministracion, 'POST', 'documentos_asistente',
      documento(asistenteDeLaSesion, {
        tipo_documento_id: ANTECEDENTES, organismo_id: ARCA, fecha_vencimiento: '2099-06-30',
        estado: 'aprobado', cargado_por: usuarioDeLaAdministracion, revisado_por: usuarioDeLaAdministracion,
      }));
    if (!conOrganismoAjeno.ok && /organismo_no_otorga_ese_documento/.test(conOrganismoAjeno.cuerpo?.message || '')) {
      bien('la base NO acepta un organismo que no otorga ese documento', 'completar_documento_asistente → organismo_no_otorga_ese_documento');
    } else {
      mal('la base NO acepta un organismo que no otorga ese documento', queDijo(conOrganismoAjeno) || 'la base lo aceptó');
    }
  } finally {
    borrarLosDocumentosDePrueba();
  }

  // ---- Y la gracia la prorroga la administración, y la base calcula hasta cuándo --------
  // La libreta de Ana venció y estaba aprobada: tiene gracia. El Título nunca estuvo aprobado:
  // no tiene gracia que prorrogar.
  const DIAS_DE_PRUEBA = 3;
  const borrarLasProrrogasDePrueba = () => consultarBase(
    `DELETE FROM public.prorrogas_de_gracia_documento
      WHERE asistente_id = '${asistenteDeLaSesion}' AND dias = ${DIAS_DE_PRUEBA}
        AND created_at > now() - interval '10 minutes';`,
  );
  const [[esperado]] = consultarBase(
    `SELECT (GREATEST(interno.gracia_hasta('${asistenteDeLaSesion}', '${LIBRETA}', CURRENT_DATE), CURRENT_DATE) + ${DIAS_DE_PRUEBA})::text;`,
  );
  try {
    const prorroga = (tipo) => ({
      prestadora_id: d.prestadora, asistente_id: asistenteDeLaSesion, tipo_documento_id: tipo,
      dias: DIAS_DE_PRUEBA, prorrogado_por: usuarioDeLaAdministracion,
    });
    const prorrogada = await pedir(entorno, deLaAdministracion, 'POST', 'prorrogas_de_gracia_documento', prorroga(LIBRETA));
    const hasta = prorrogada.filas[0]?.hasta;
    if (prorrogada.ok && esperado && hasta === esperado) {
      bien('la administración SÍ prorroga la gracia, y la base calcula hasta cuándo',
           `calcular_prorroga_de_gracia → interno.gracia_hasta sin 42501: hasta el ${hasta}`);
    } else {
      mal('la administración SÍ prorroga la gracia, y la base calcula hasta cuándo',
          prorrogada.ok ? `quedó hasta ${hasta}, se esperaba ${esperado}` : queDijo(prorrogada));
    }

    const sinGracia = await pedir(entorno, deLaAdministracion, 'POST', 'prorrogas_de_gracia_documento', prorroga(TITULO));
    if (!sinGracia.ok && /documento_sin_gracia/.test(sinGracia.cuerpo?.message || '')) {
      bien('la base NO prorroga un documento que nunca estuvo aprobado', 'calcular_prorroga_de_gracia → documento_sin_gracia');
    } else {
      mal('la base NO prorroga un documento que nunca estuvo aprobado', queDijo(sinGracia) || 'la base la aceptó');
    }

    const delAsistenteProrroga = await pedir(entorno, delAsistente, 'POST', 'prorrogas_de_gracia_documento',
      { ...prorroga(LIBRETA), prorrogado_por: usuarioDelAsistente });
    if (delAsistenteProrroga.ok) {
      mal('el Asistente NO se prorroga la gracia', 'la base lo dejó');
    } else {
      bien('el Asistente NO se prorroga la gracia', `rebotó con ${delAsistenteProrroga.estado}`);
    }
  } finally {
    borrarLasProrrogasDePrueba();
  }

  // ---- Y adónde se le paga lo informa él: lo carga, lo corrige y lo saca ----
  // Mismo molde que los documentos, que son el precedente de lo que el Asistente
  // escribe en su propio Legajo del Asistente. La cuenta es inventada, como todo lo que se
  // siembra acá, y se borra al terminar.
  const [[paisDeLaPrestadora]] = consultarBase(
    `SELECT pais FROM public.prestadoras WHERE id = '${d.prestadora}';`,
  );
  const CUENTA_DE_PRUEBA = '0009998887776665554443';
  const CUENTA_CORREGIDA = '0001112223334445556667';
  const borrarLaCuentaSembrada = () => consultarBase(
    `DELETE FROM public.datos_bancarios_asistente WHERE identificador IN ('${CUENTA_DE_PRUEBA}', '${CUENTA_CORREGIDA}');`,
  );
  const cuenta = (asistente) => ({
    prestadora_id: d.prestadora, asistente_id: asistente,
    pais: paisDeLaPrestadora || 'AR', identificador_clase: 'cbu',
    identificador: CUENTA_DE_PRUEBA,
  });

  borrarLaCuentaSembrada();
  const cuentaPropia = await pedir(entorno, delAsistente, 'POST', 'datos_bancarios_asistente', cuenta(asistenteDeLaSesion));
  if (cuentaPropia.ok) {
    bien('el Asistente SÍ carga sus propios datos bancarios', 'asistente_carga_sus_datos_bancarios');

    // Corregir y sacar son la misma facultad que cargar, y sin ellas una cuenta
    // que se cerró queda puesta: eso es una transferencia que no llega.
    const corrige = await pedir(
      entorno, delAsistente, 'PATCH',
      `datos_bancarios_asistente?asistente_id=eq.${asistenteDeLaSesion}&identificador_clase=eq.cbu`,
      { identificador: CUENTA_CORREGIDA },
    );
    if (corrige.filas.length === 1) {
      bien('el Asistente SÍ corrige sus propios datos bancarios', 'asistente_corrige_sus_datos_bancarios');
    } else {
      const c = corrige.cuerpo || {};
      mal('el Asistente SÍ corrige sus propios datos bancarios',
          `${corrige.estado} ${c.code || ''} ${c.message || ''}`.trim() || 'no tocó ninguna fila');
    }

    const saca = await pedir(
      entorno, delAsistente, 'DELETE',
      `datos_bancarios_asistente?asistente_id=eq.${asistenteDeLaSesion}&identificador_clase=eq.cbu`,
    );
    const [[quedo]] = consultarBase(
      `SELECT count(*) FROM public.datos_bancarios_asistente WHERE asistente_id = '${asistenteDeLaSesion}' AND identificador_clase = 'cbu';`,
    );
    if (String(quedo) === '0') {
      bien('el Asistente SÍ saca sus propios datos bancarios', 'asistente_saca_sus_datos_bancarios');
    } else {
      const c = saca.cuerpo || {};
      mal('el Asistente SÍ saca sus propios datos bancarios',
          `${saca.estado} ${c.code || ''} ${c.message || ''}`.trim() || 'la fila siguió ahí');
    }
  } else {
    const c = cuentaPropia.cuerpo || {};
    mal('el Asistente SÍ carga sus propios datos bancarios',
        `${cuentaPropia.estado} ${c.code || ''} ${c.message || ''}`.trim());
  }
  borrarLaCuentaSembrada();

  // ESTO ES LO QUE SE ESTÁ PROBANDO DE VERDAD. Cobrar en la cuenta de otro no
  // es ver un dato de más: es que la plata salga hacia otro lado.
  if (otroAsistente) {
    const cuentaAjena = await pedir(entorno, delAsistente, 'POST', 'datos_bancarios_asistente', cuenta(otroAsistente));
    if (cuentaAjena.ok) {
      borrarLaCuentaSembrada();
      mal('el Asistente NO carga los datos bancarios de otro Asistente', 'la base lo dejó escribir en el Legajo del Asistente de otro');
    } else {
      bien('el Asistente NO carga los datos bancarios de otro Asistente', `rebotó con ${cuentaAjena.estado}`);
    }

    // Y tampoco corrige la de otro: se le siembra una con la llave del dueño de
    // la base —que se saltea las políticas— y se intenta cambiarla con su sesión.
    const [[cuentaDelOtro]] = consultarBase(`
      INSERT INTO public.datos_bancarios_asistente (prestadora_id, asistente_id, pais, identificador_clase, identificador)
      VALUES ('${d.prestadora}', '${otroAsistente}', '${paisDeLaPrestadora || 'AR'}', 'cbu', '${CUENTA_DE_PRUEBA}')
      RETURNING id;
    `);
    const corrigeLaDeOtro = await pedir(
      entorno, delAsistente, 'PATCH',
      `datos_bancarios_asistente?asistente_id=eq.${otroAsistente}&identificador_clase=eq.cbu`,
      { identificador: CUENTA_CORREGIDA },
    );
    const [[comoQuedo]] = consultarBase(
      `SELECT identificador FROM public.datos_bancarios_asistente WHERE id = '${cuentaDelOtro}';`,
    );
    if (comoQuedo === CUENTA_DE_PRUEBA) {
      bien('el Asistente NO corrige los datos bancarios de otro Asistente', 'no tocó ninguna fila');
    } else {
      mal('el Asistente NO corrige los datos bancarios de otro Asistente',
          `la base lo dejó cambiar la cuenta de otro (${corrigeLaDeOtro.estado})`);
    }

    const sacaLaDeOtro = await pedir(
      entorno, delAsistente, 'DELETE',
      `datos_bancarios_asistente?asistente_id=eq.${otroAsistente}&identificador_clase=eq.cbu`,
    );
    const [[sigueAhi]] = consultarBase(
      `SELECT count(*) FROM public.datos_bancarios_asistente WHERE id = '${cuentaDelOtro}';`,
    );
    if (String(sigueAhi) === '1') {
      bien('el Asistente NO saca los datos bancarios de otro Asistente', 'no tocó ninguna fila');
    } else {
      mal('el Asistente NO saca los datos bancarios de otro Asistente',
          `la base lo dejó borrar la cuenta de otro (${sacaLaDeOtro.estado})`);
    }

    borrarLaCuentaSembrada();
  }

  // Corregir la cuenta no es mudarla: el país y la clase de cuenta quedan como se cargaron.
  consultarBase(`
    INSERT INTO public.datos_bancarios_asistente (prestadora_id, asistente_id, pais, identificador_clase, identificador)
    VALUES ('${d.prestadora}', '${asistenteDeLaSesion}', '${paisDeLaPrestadora || 'AR'}', 'cbu', '${CUENTA_DE_PRUEBA}');
  `);
  const mudaLaCuenta = await pedir(
    entorno, delAsistente, 'PATCH',
    `datos_bancarios_asistente?asistente_id=eq.${asistenteDeLaSesion}&identificador=eq.${CUENTA_DE_PRUEBA}`,
    { identificador_clase: 'alias' },
  );
  if (mudaLaCuenta.ok) {
    mal('el Asistente NO cambia la clase de su cuenta', 'la base lo dejó');
  } else {
    bien('el Asistente NO cambia la clase de su cuenta', `rebotó con ${mudaLaCuenta.estado}`);
  }
  borrarLaCuentaSembrada();

  // ---- Lo que firmó el Asistente: el texto es el que se le mostró, y después sólo se retira ----
  const [[textoId, textoClave, textoVersion, textoIdioma]] = consultarBase(`
    SELECT id, clave, version, idioma FROM public.textos_consentimiento
     WHERE vigente_hasta IS NULL ORDER BY clave, version DESC LIMIT 1;
  `);
  // El índice deja una sola decisión viva por consentimiento: la que ya tenga se aparta mientras
  // dura la prueba y se le devuelve al final.
  const apartadas = consultarBase(`
    UPDATE public.consentimientos_asistente SET retirado_at = now()
     WHERE asistente_id = '${asistenteDeLaSesion}' AND clave = '${textoClave}' AND retirado_at IS NULL
       AND decision = 'otorgado'
    RETURNING id;
  `).map(([id]) => id).filter((id) => /^[0-9a-f-]{36}$/.test(id));
  const firmadas = [];
  try {
    const firma = (textoMostrado) => ({
      prestadora_id: d.prestadora, asistente_id: asistenteDeLaSesion, clave: textoClave,
      texto_consentimiento_id: textoId, version_mostrada: Number(textoVersion),
      idioma_mostrado: textoIdioma, texto_mostrado: textoMostrado, decision: 'otorgado',
    });

    const inventada = await pedir(entorno, delAsistente, 'POST', 'consentimientos_asistente',
      firma('Un texto que nunca se le mostró.'));
    if (inventada.ok) {
      firmadas.push(...inventada.filas.map((f) => f.id));
      mal('el Asistente NO firma un texto distinto del que se le mostró', 'la base lo dejó');
    } else {
      bien('el Asistente NO firma un texto distinto del que se le mostró', `rebotó con ${inventada.estado}`);
    }

    // El cuerpo se lee como lo lee el backend, con la sesión: puede traer saltos de renglón.
    const mostrado = await pedir(entorno, delAsistente, 'GET', `textos_consentimiento?id=eq.${textoId}&select=cuerpo`);
    const cuerpoReal = mostrado.filas[0]?.cuerpo ?? '';
    const verdadera = await pedir(entorno, delAsistente, 'POST', 'consentimientos_asistente', firma(cuerpoReal));
    const firmada = verdadera.filas[0]?.id;
    if (!firmada) {
      const c = verdadera.cuerpo || {};
      mal('el Asistente SÍ firma el texto que se le mostró', `${verdadera.estado} ${c.code || ''} ${c.message || ''}`.trim());
    } else {
      firmadas.push(firmada);
      bien('el Asistente SÍ firma el texto que se le mostró', 'asistente_registra_su_consentimiento');

      const cambiaLaDecision = await pedir(entorno, delAsistente, 'PATCH',
        `consentimientos_asistente?id=eq.${firmada}`, { decision: 'rechazado' });
      const reescribeElTexto = await pedir(entorno, delAsistente, 'PATCH',
        `consentimientos_asistente?id=eq.${firmada}`, { texto_mostrado: 'Otro texto.' });
      const [[decisionQuedo, textoQuedo]] = consultarBase(
        `SELECT c.decision, c.texto_mostrado = t.cuerpo FROM public.consentimientos_asistente c
           JOIN public.textos_consentimiento t ON t.id = c.texto_consentimiento_id WHERE c.id = '${firmada}';`,
      );
      if (decisionQuedo === 'otorgado' && textoQuedo === 't') {
        bien('el Asistente NO reescribe lo que firmó',
          `rebotó con ${cambiaLaDecision.estado} y ${reescribeElTexto.estado}`);
      } else {
        mal('el Asistente NO reescribe lo que firmó', 'la base lo dejó');
      }

      const retira = await pedir(entorno, delAsistente, 'PATCH',
        `consentimientos_asistente?id=eq.${firmada}`, { retirado_at: new Date().toISOString() });
      if (retira.filas.length === 1) {
        bien('el Asistente SÍ retira su consentimiento', 'asistente_retira_su_consentimiento');
      } else {
        const c = retira.cuerpo || {};
        mal('el Asistente SÍ retira su consentimiento', `${retira.estado} ${c.code || ''} ${c.message || ''}`.trim());
      }

      await pedir(entorno, delAsistente, 'PATCH',
        `consentimientos_asistente?id=eq.${firmada}`, { retirado_at: null });
      const [[sigueRetirado]] = consultarBase(
        `SELECT retirado_at IS NOT NULL FROM public.consentimientos_asistente WHERE id = '${firmada}';`,
      );
      if (sigueRetirado === 't') {
        bien('el Asistente NO deshace un retiro', 'no tocó ninguna fila');
      } else {
        mal('el Asistente NO deshace un retiro', 'la base lo dejó volver a dar por vigente lo retirado');
      }
    }
  } finally {
    if (firmadas.length) {
      consultarBase(`DELETE FROM public.consentimientos_asistente WHERE id IN (${firmadas.map((id) => `'${id}'`).join(',')});`);
    }
    if (apartadas.length) {
      consultarBase(`UPDATE public.consentimientos_asistente SET retirado_at = NULL WHERE id IN (${apartadas.map((id) => `'${id}'`).join(',')});`);
    }
  }

  return problemas;
}

// ---------------------------------------------------------------------------
// Cuarta comprobación: el Coordinador de cada Servicio
// ---------------------------------------------------------------------------
// Un Servicio sin Coordinador no tiene guardias, sólo la administración le asigna uno, y cada
// Coordinador ve sólo los Servicios que tiene asignados. Las tres cosas las decide la base, así que
// se prueban con la sesión de cada uno, sobre un Servicio que nace sin Coordinador para la prueba.

async function probarElCoordinadorDelServicio({ base, llavePublica }, d) {
  console.log('\n== El Coordinador de cada Servicio ==\n');
  const problemas = [];
  const bien = (que) => console.log(verde(`  ✓ ${que}`));
  const mal = (que, por) => {
    console.log(rojo(`  ✗ ${que}`));
    console.log(rojo(`      ${por}`));
    problemas.push(`coordinador del servicio: ${que} — ${por}`);
  };

  const admin = await entrar(base, llavePublica, ADMINISTRADORA, d.prestadora);
  const coordinadora = await entrar(base, llavePublica, COORDINADORA, d.prestadora);
  const [[carla]] = consultarBase(`SELECT id FROM public.usuarios WHERE lower(email) = '${COORDINADORA}';`);
  const [[cliente]] = consultarBase(`SELECT cliente_id FROM public.pacientes WHERE id = '${d.paciente}';`);

  const pedir = async (token, metodo, ruta, cuerpo) => {
    const r = await fetch(`${base}/rest/v1/${ruta}`, {
      method: metodo,
      headers: {
        apikey: llavePublica,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    return { estado: r.status, cuerpo: await r.json().catch(() => null) };
  };

  const alta = await pedir(admin, 'POST', 'servicios', {
    prestadora_id: d.prestadora,
    tipo_contratante: 'cliente',
    contratante_id: cliente,
    etiqueta: 'Prueba del Coordinador del Servicio',
  });
  const servicio = alta.cuerpo?.[0]?.id;
  if (!servicio) {
    mal('la administración da de alta un Servicio', `${alta.estado} ${JSON.stringify(alta.cuerpo)}`);
    return problemas;
  }

  try {
    const guardia = {
      prestadora_id: d.prestadora,
      paciente_id: d.paciente,
      servicio_id: servicio,
      fecha: new Date(Date.now() + 40 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      hora_inicio: '08:00',
      hora_fin: '12:00',
      modalidad: 'presencial',
    };
    const sinCoordinador = await pedir(admin, 'POST', 'guardias', guardia);
    if (sinCoordinador.estado >= 400 && String(sinCoordinador.cuerpo?.message).startsWith('servicio_sin_coordinador')) {
      bien('sin Coordinador, el Servicio no tiene guardias');
    } else {
      mal('sin Coordinador, el Servicio no tiene guardias', `${sinCoordinador.estado} ${JSON.stringify(sinCoordinador.cuerpo)}`);
      const id = sinCoordinador.cuerpo?.[0]?.id;
      if (id) consultarBase(`DELETE FROM public.guardias WHERE id = '${id}';`);
    }

    const noLoVe = await pedir(coordinadora, 'GET', `servicios?id=eq.${servicio}&select=id`);
    if (noLoVe.estado === 200 && noLoVe.cuerpo?.length === 0) bien('la Coordinadora no ve un Servicio que no coordina');
    else mal('la Coordinadora no ve un Servicio que no coordina', `${noLoVe.estado} ${JSON.stringify(noLoVe.cuerpo)}`);

    const seAsigna = await pedir(coordinadora, 'PATCH', `servicios?id=eq.${servicio}`, { coordinador_id: carla });
    const [[queda]] = consultarBase(`SELECT coalesce(coordinador_id::text, 'nadie') FROM public.servicios WHERE id = '${servicio}';`);
    if (queda === 'nadie') bien('la Coordinadora no se asigna un Servicio');
    else mal('la Coordinadora no se asigna un Servicio', `quedó asignado (${seAsigna.estado})`);

    const asigna = await pedir(admin, 'PATCH', `servicios?id=eq.${servicio}`, { coordinador_id: carla });
    if (asigna.estado === 200 && asigna.cuerpo?.[0]?.coordinador_id === carla) bien('la administración le asigna el Coordinador');
    else mal('la administración le asigna el Coordinador', `${asigna.estado} ${JSON.stringify(asigna.cuerpo)}`);

    const loVe = await pedir(coordinadora, 'GET', `servicios?id=eq.${servicio}&select=id`);
    if (loVe.cuerpo?.length === 1) bien('la Coordinadora ve el Servicio que se le asignó');
    else mal('la Coordinadora ve el Servicio que se le asignó', `${loVe.estado} ${JSON.stringify(loVe.cuerpo)}`);

    const conCoordinador = await pedir(coordinadora, 'POST', 'guardias', guardia);
    const idGuardia = conCoordinador.cuerpo?.[0]?.id;
    if (idGuardia) {
      bien('con Coordinador, su Coordinadora le arma una guardia');
      consultarBase(`DELETE FROM public.guardias WHERE id = '${idGuardia}';`);
    } else {
      mal('con Coordinador, su Coordinadora le arma una guardia', `${conCoordinador.estado} ${JSON.stringify(conCoordinador.cuerpo)}`);
    }

    const vaciar = await pedir(admin, 'PATCH', `servicios?id=eq.${servicio}`, { coordinador_id: null });
    if (vaciar.estado >= 400 && String(vaciar.cuerpo?.message) === 'el_servicio_no_se_queda_sin_coordinador') {
      bien('el Servicio no vuelve a quedarse sin Coordinador');
    } else {
      mal('el Servicio no vuelve a quedarse sin Coordinador', `${vaciar.estado} ${JSON.stringify(vaciar.cuerpo)}`);
    }
  } finally {
    consultarBase(`DELETE FROM public.guardias WHERE servicio_id = '${servicio}';`);
    consultarBase(`DELETE FROM public.servicios WHERE id = '${servicio}';`);
  }

  return problemas;
}

// ---------------------------------------------------------------------------
// Quinta comprobación: lo que carga otro Coordinador queda pendiente
// ---------------------------------------------------------------------------
// Un Coordinador que no coordina al Paciente puede proponer un domicilio temporal, pero no queda
// vigente: queda pendiente hasta que lo acepte el Coordinador asignado o la administración. Para
// probarlo, los Servicios del Paciente pasan un rato a otro Coordinador, creado para la prueba, y
// la Coordinadora de la siembra queda como «otro».

async function probarLoQueCargaOtroCoordinador({ base, llavePublica }, d) {
  console.log('\n== Lo que carga otro Coordinador queda pendiente ==\n');
  const problemas = [];
  const bien = (que) => console.log(verde(`  ✓ ${que}`));
  const mal = (que, por) => {
    console.log(rojo(`  ✗ ${que}`));
    console.log(rojo(`      ${por}`));
    problemas.push(`carga pendiente: ${que} — ${por}`);
  };

  const admin = await entrar(base, llavePublica, ADMINISTRADORA, d.prestadora);
  const coordinadora = await entrar(base, llavePublica, COORDINADORA, d.prestadora);
  const [[carla]] = consultarBase(`SELECT id FROM public.usuarios WHERE lower(email) = '${COORDINADORA}';`);
  const otro = '20000000-0000-4000-8000-0000000000aa';
  const domicilio = 'Prueba de carga pendiente';

  const pedir = async (token, metodo, ruta, cuerpo) => {
    const r = await fetch(`${base}/rest/v1/${ruta}`, {
      method: metodo,
      headers: {
        apikey: llavePublica,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    return { estado: r.status, cuerpo: await r.json().catch(() => null) };
  };

  const servicios = consultarBase(
    `SELECT s.id FROM public.servicios s JOIN public.pacientes p ON p.cliente_id = s.contratante_id
      WHERE p.id = '${d.paciente}' AND s.tipo_contratante = 'cliente' AND s.coordinador_id = '${carla}';`,
  ).map(([id]) => id);
  const lista = servicios.map((id) => `'${id}'`).join(',') || 'NULL';

  try {
    consultarBase(`INSERT INTO auth.users (id, instance_id, aud, role, email)
      VALUES ('${otro}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'otro.coordinador@ejemplo.test');`);
    consultarBase(`INSERT INTO public.usuarios (id, prestadora_id, rol, nombre)
      VALUES ('${otro}', '${d.prestadora}', 'coordinador', 'Otro Coordinador de prueba');`);
    consultarBase(`UPDATE public.servicios SET coordinador_id = '${otro}' WHERE id IN (${lista});`);

    const queda = await pedir(coordinadora, 'POST', 'rpc/la_carga_queda_pendiente', { p_paciente: d.paciente });
    if (queda.cuerpo === true) bien('para otro Coordinador, la carga queda pendiente');
    else mal('para otro Coordinador, la carga queda pendiente', `${queda.estado} ${JSON.stringify(queda.cuerpo)}`);

    const directa = await pedir(admin, 'POST', 'rpc/la_carga_queda_pendiente', { p_paciente: d.paciente });
    if (directa.cuerpo === false) bien('para la administración, la carga no queda pendiente');
    else mal('para la administración, la carga no queda pendiente', `${directa.estado} ${JSON.stringify(directa.cuerpo)}`);

    const propone = await pedir(coordinadora, 'POST', 'domicilios_temporales_paciente', {
      prestadora_id: d.prestadora,
      paciente_id: d.paciente,
      domicilio,
      lat: -34.6,
      lng: -58.4,
      motivo: 'Prueba',
      fecha_inicio: '2031-01-01',
      fecha_fin: '2031-01-10',
    });
    const [[vigentes]] = consultarBase(`SELECT count(*) FROM public.domicilios_temporales_paciente WHERE domicilio = '${domicilio}';`);
    const cargas = consultarBase(`SELECT id FROM public.cargas_sujetas_a_aprobacion WHERE datos->>'domicilio' = '${domicilio}' AND estado = 'pendiente';`);
    if (propone.estado < 400 && vigentes === '0' && cargas.length === 1) bien('lo que propone no queda vigente, queda pendiente');
    else mal('lo que propone no queda vigente, queda pendiente', `${propone.estado} vigentes=${vigentes} pendientes=${cargas.length}`);
    const carga = cargas[0]?.[0];

    if (carga) {
      const ellaMisma = await pedir(coordinadora, 'POST', 'rpc/revisar_carga', { p_carga: carga, p_acepta: true, p_motivo: null });
      if (ellaMisma.estado >= 400) bien('quien la cargó no puede aceptarla');
      else mal('quien la cargó no puede aceptarla', `${ellaMisma.estado} ${JSON.stringify(ellaMisma.cuerpo)}`);

      const sinMotivo = await pedir(admin, 'POST', 'rpc/revisar_carga', { p_carga: carga, p_acepta: false, p_motivo: ' ' });
      if (sinMotivo.estado >= 400) bien('no se rechaza sin motivo');
      else mal('no se rechaza sin motivo', `${sinMotivo.estado} ${JSON.stringify(sinMotivo.cuerpo)}`);

      const acepta = await pedir(admin, 'POST', 'rpc/revisar_carga', { p_carga: carga, p_acepta: true, p_motivo: null });
      const [[despues]] = consultarBase(`SELECT count(*) FROM public.domicilios_temporales_paciente WHERE domicilio = '${domicilio}';`);
      if (acepta.cuerpo === true && despues === '1') bien('la administración la acepta y queda vigente');
      else mal('la administración la acepta y queda vigente', `${acepta.estado} ${JSON.stringify(acepta.cuerpo)} vigentes=${despues}`);
    }
  } finally {
    consultarBase(`UPDATE public.servicios SET coordinador_id = '${carla}' WHERE id IN (${lista});`);
    // El domicilio temporal es historia clínica y un disparador impide borrarlo; lo de la prueba se
    // borra igual, con los disparadores apagados sólo para esta limpieza.
    consultarBase(`SET session_replication_role = replica;
      DELETE FROM public.domicilios_temporales_paciente WHERE domicilio = '${domicilio}';
      DELETE FROM public.cargas_sujetas_a_aprobacion WHERE datos->>'domicilio' = '${domicilio}';
      DELETE FROM public.usuarios WHERE id = '${otro}';
      DELETE FROM auth.users WHERE id = '${otro}';`);
  }

  return problemas;
}

// Cada Coordinador ve sólo sus Servicios. Se le pasa a otro Coordinador uno de los Servicios
// sembrados y se mira con la sesión de la Coordinadora: tiene que dejar de verlo, con su Cliente, su
// Paciente, la información de salud y las guardias, y seguir viendo lo suyo. Después se le da cada
// una de las dos puertas que reabren lo ajeno —una alarma tomada y la cobertura de una ausencia— y
// tiene que volver a verlo. Si el recorte no existiera, la primera tanda ya fallaría.
async function probarCadaCoordinadorVeSoloLoSuyo(entorno, d) {
  console.log('\n== Cada Coordinador ve sólo sus Servicios ==\n');
  const problemas = [];
  const bien = (que) => console.log(verde(`  ✓ ${que}`));
  const mal = (que, por) => {
    console.log(rojo(`  ✗ ${que}`));
    console.log(rojo(`      ${por}`));
    problemas.push(`recorte por Coordinador: ${que} — ${por}`);
  };

  const coordinadora = await entrar(entorno.base, entorno.llavePublica, COORDINADORA, d.prestadora);
  const [[carla]] = consultarBase(`SELECT id FROM public.usuarios WHERE lower(email) = '${COORDINADORA}';`);
  const otro = '20000000-0000-4000-8000-0000000000ab';

  // Un Servicio de la Coordinadora cuyo Cliente no tenga otro Servicio suyo, para que al pasarlo
  // quede del todo afuera; y otro que se quede con ella, para ver que lo propio no se pierde.
  const [ajeno] = consultarBase(`
    SELECT s.id, s.contratante_id, p.id,
           (SELECT g.id FROM public.guardias g WHERE g.servicio_id = s.id ORDER BY g.id LIMIT 1)
      FROM public.servicios s
      JOIN public.pacientes p ON p.cliente_id = s.contratante_id AND p.prestadora_id = s.prestadora_id
     WHERE s.prestadora_id = '${d.prestadora}' AND s.coordinador_id = '${carla}' AND s.tipo_contratante = 'cliente'
       AND EXISTS (SELECT 1 FROM public.guardias g WHERE g.servicio_id = s.id)
       AND NOT EXISTS (SELECT 1 FROM public.servicios o WHERE o.contratante_id = s.contratante_id
                        AND o.id <> s.id AND o.coordinador_id = '${carla}')
     ORDER BY s.id DESC LIMIT 1;`);
  const [propio] = consultarBase(`
    SELECT s.id FROM public.servicios s
     WHERE s.prestadora_id = '${d.prestadora}' AND s.coordinador_id = '${carla}' AND s.id <> '${ajeno?.[0]}'
     ORDER BY s.id LIMIT 1;`);
  if (!ajeno || !propio) {
    mal('la siembra trae dos Servicios de la Coordinadora con guardias', 'no los encontré');
    return problemas;
  }
  const [servicio, cliente, paciente, guardia] = ajeno;
  const [[contratante]] = consultarBase(`SELECT contratante_persona_id FROM public.clientes WHERE id = '${cliente}';`);

  const cuenta = async (ruta) => (await pedir(entorno, coordinadora, 'GET', ruta)).filas.length;
  const lecturas = {
    'la Ficha del Contratante': `personas?id=eq.${contratante}&select=id`,
    'el Servicio': `servicios?id=eq.${servicio}&select=id`,
    'el Cliente': `clientes?id=eq.${cliente}&select=id`,
    'el Paciente': `pacientes?id=eq.${paciente}&select=id`,
    'la información de salud': `informacion_de_salud_del_paciente?paciente_id=eq.${paciente}&select=id`,
    'la guardia': `guardias?id=eq.${guardia}&select=id`,
  };
  const mirar = async (que, espera) => {
    for (const [nombre, ruta] of Object.entries(lecturas)) {
      const n = await cuenta(ruta);
      if ((n > 0) === espera) bien(`${que}: ${espera ? 've' : 'no ve'} ${nombre}`);
      else mal(`${que}: ${espera ? 've' : 'no ve'} ${nombre}`, `filas=${n}`);
    }
  };

  const archivosSembrados = [
    ['prescripciones-medicacion', `${d.prestadora}/${paciente}/prueba-coordinador-receta.pdf`],
    ['prescripciones-medicacion', `${d.prestadora}/firmas-medicacion/${paciente}/prueba-coordinador-firma.pdf`],
    ['autorizaciones-monitoreo', `${d.prestadora}/${paciente}/prueba-coordinador-autorizacion.pdf`],
  ];
  const archivosDelPaciente = async () => {
    let n = 0;
    for (const prefix of [`${d.prestadora}/${paciente}/`, `${d.prestadora}/firmas-medicacion/${paciente}/`]) {
      for (const deposito of ['prescripciones-medicacion', 'autorizaciones-monitoreo']) {
        const r = await fetch(`${entorno.base}/storage/v1/object/list/${deposito}`, {
          method: 'POST',
          headers: { apikey: entorno.llavePublica, Authorization: `Bearer ${coordinadora}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ prefix, limit: 100 }),
        });
        const lista = await r.json().catch(() => []);
        n += Array.isArray(lista) ? lista.filter((o) => o.name?.startsWith('prueba-coordinador')).length : 0;
      }
    }
    return n;
  };

  // Antes de pasarlo, lo ve: si no lo viera, el «no lo ve» de después no probaría nada.
  await mirar('mientras lo coordina', true);

  try {
    consultarBase(`INSERT INTO auth.users (id, instance_id, aud, role, email)
      VALUES ('${otro}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'otra.coordinadora@ejemplo.test');`);
    consultarBase(`INSERT INTO public.usuarios (id, prestadora_id, rol, nombre)
      VALUES ('${otro}', '${d.prestadora}', 'coordinador', 'Otra Coordinadora de prueba');`);
    consultarBase(`UPDATE public.servicios SET coordinador_id = '${otro}' WHERE id = '${servicio}';`);

    await mirar('coordinado por otro', false);
    const suyo = await cuenta(`servicios?id=eq.${propio[0]}&select=id`);
    if (suyo === 1) bien('sigue viendo su propio Servicio');
    else mal('sigue viendo su propio Servicio', `filas=${suyo}`);

    // No puede tomar una alarma de una guardia que no ve, que sería otra puerta para verla.
    const intento = await pedir(entorno, coordinadora, 'POST', 'alarmas_tomadas', {
      prestadora_id: d.prestadora, tipo: 'guardia_sin_cerrar', referencia_id: guardia,
      tomada_por: carla, vence_at: new Date(Date.now() + 3600e3).toISOString(),
    });
    const [[tomas]] = consultarBase(`SELECT count(*) FROM public.alarmas_tomadas WHERE referencia_id = '${guardia}';`);
    if (intento.estado >= 400 && Number(tomas) === 0) bien('no puede tomar la alarma de una guardia que no ve');
    else mal('no puede tomar la alarma de una guardia que no ve', `${intento.estado} tomas=${tomas}`);

    // Lo que hizo el otro Coordinador con esa guardia no le llega: ni su toma ni su reasignación.
    // Antes se comprueba que exista, para que el «no la ve» quiera decir algo.
    consultarBase(`INSERT INTO public.alarmas_tomadas (prestadora_id, tipo, referencia_id, tomada_por, vence_at)
      VALUES ('${d.prestadora}', 'guardia_sin_cerrar', '${guardia}', '${otro}', now() + interval '1 hour');
      INSERT INTO public.auditoria_reasignaciones_por_emergencia (prestadora_id, guardia_id, usuario_id, asistente_nuevo_id, motivo)
      SELECT '${d.prestadora}', '${guardia}', '${otro}', g.asistente_id, 'prueba' FROM public.guardias g WHERE g.id = '${guardia}';`);
    const [[sembradas]] = consultarBase(`SELECT (SELECT count(*) FROM public.alarmas_tomadas WHERE referencia_id = '${guardia}')
      + (SELECT count(*) FROM public.auditoria_reasignaciones_por_emergencia WHERE guardia_id = '${guardia}');`);
    const tomaAjena = await cuenta(`alarmas_tomadas?referencia_id=eq.${guardia}&select=id`);
    const reasignacionAjena = await cuenta(`auditoria_reasignaciones_por_emergencia?guardia_id=eq.${guardia}&select=id`);
    if (Number(sembradas) === 2 && tomaAjena === 0) bien('no ve la toma de otro Coordinador');
    else mal('no ve la toma de otro Coordinador', `sembradas=${sembradas} filas=${tomaAjena}`);
    if (Number(sembradas) === 2 && reasignacionAjena === 0) bien('no ve la reasignación de una guardia ajena');
    else mal('no ve la reasignación de una guardia ajena', `sembradas=${sembradas} filas=${reasignacionAjena}`);
    consultarBase(`DELETE FROM public.alarmas_tomadas WHERE referencia_id = '${guardia}';`);

    // Los archivos del Paciente —prescripción, papel firmado, autorización de monitoreo— tampoco.
    // Se siembran en la base de los depósitos y se listan con la sesión: la lista la filtra la
    // misma protección por fila que la lectura.
    consultarBase(archivosSembrados.map(([deposito, ruta]) => `INSERT INTO storage.objects (bucket_id, name)
      VALUES ('${deposito}', '${ruta}') ON CONFLICT DO NOTHING;`).join('\n'));
    const [[enLaBase]] = consultarBase(`SELECT count(*) FROM storage.objects WHERE name LIKE '${d.prestadora}/%prueba-coordinador%';`);
    const archivosAjenos = await archivosDelPaciente();
    if (Number(enLaBase) === archivosSembrados.length && archivosAjenos === 0) bien('no ve los archivos del Paciente');
    else mal('no ve los archivos del Paciente', `sembrados=${enLaBase} archivos=${archivosAjenos}`);
    const subida = await fetch(`${entorno.base}/storage/v1/object/prescripciones-medicacion/${d.prestadora}/firmas-medicacion/${paciente}/prueba-coordinador-subida.pdf`, {
      method: 'POST',
      headers: { apikey: entorno.llavePublica, Authorization: `Bearer ${coordinadora}`, 'Content-Type': 'application/pdf' },
      body: '%PDF-1.4 prueba',
    });
    const [[subidos]] = consultarBase(`SELECT count(*) FROM storage.objects WHERE name LIKE '%prueba-coordinador-subida%';`);
    if (!subida.ok && Number(subidos) === 0) bien('no puede subir el papel firmado de un Paciente que no ve');
    else mal('no puede subir el papel firmado de un Paciente que no ve', `${subida.status} subidos=${subidos}`);

    // Con una alarma de esa guardia tomada, la ve mientras la tenga.
    consultarBase(`INSERT INTO public.alarmas_tomadas (prestadora_id, tipo, referencia_id, tomada_por, vence_at)
      VALUES ('${d.prestadora}', 'guardia_sin_cerrar', '${guardia}', '${carla}', now() + interval '1 hour');`);
    const conAlarma = await cuenta(lecturas['la guardia']);
    if (conAlarma === 1) bien('con la alarma tomada ve la guardia');
    else mal('con la alarma tomada ve la guardia', `filas=${conAlarma}`);
    consultarBase(`DELETE FROM public.alarmas_tomadas WHERE referencia_id = '${guardia}' AND tomada_por = '${carla}';`);

    // Cubriendo la ausencia de la otra, ve todo lo que la otra coordina.
    consultarBase(`INSERT INTO public.ausencias (prestadora_id, usuario_id, coordinador_que_cubre_id, tipo, fecha_inicio, fecha_fin)
      VALUES ('${d.prestadora}', '${otro}', '${carla}', 'otra_licencia', current_date, current_date + 7);`);
    await mirar('cubriendo la ausencia de quien lo coordina', true);
    const reasignacionCubriendo = await cuenta(`auditoria_reasignaciones_por_emergencia?guardia_id=eq.${guardia}&select=id`);
    if (reasignacionCubriendo === 1) bien('cubriendo la ausencia ve la reasignación');
    else mal('cubriendo la ausencia ve la reasignación', `filas=${reasignacionCubriendo}`);
    const archivosCubriendo = await archivosDelPaciente();
    if (archivosCubriendo === archivosSembrados.length) bien('cubriendo la ausencia ve los archivos del Paciente');
    else mal('cubriendo la ausencia ve los archivos del Paciente', `archivos=${archivosCubriendo}`);
    consultarBase(`DELETE FROM public.ausencias WHERE usuario_id = '${otro}';`);

    // WhatsApp va por zona del Asistente: ve la conversación de uno que alcanza y la de un número
    // sin Asistente, y no la de uno de otra zona. Las tres se siembran, así que un recorte que
    // negara todo falla en las dos primeras.
    const [[deSuZona], [deOtraZona]] = [true, false].map((alcanza) => consultarBase(`
      SELECT a.id FROM public.asistentes a
       WHERE a.prestadora_id = '${d.prestadora}'
         AND interno.coordinador_alcanza_asistente_de('${carla}', a.id) = ${alcanza}
       ORDER BY a.id LIMIT 1;`)[0] ?? [null]);
    if (!deSuZona || !deOtraZona) {
      mal('la siembra trae un Asistente de su zona y otro de otra', 'no los encontré');
    } else {
      const conversaciones = { 'de un Asistente de su zona': [deSuZona, true],
        'de un número sin Asistente': [null, true], 'de un Asistente de otra zona': [deOtraZona, false] };
      let i = 0;
      for (const [nombre, [asistente, espera]] of Object.entries(conversaciones)) {
        const id = `30000000-0000-4000-8000-0000000000c${i++}`;
        consultarBase(`INSERT INTO public.conversaciones_whatsapp (id, prestadora_id, telefono, asistente_id)
            VALUES ('${id}', '${d.prestadora}', '+5400000000${i}', ${asistente ? `'${asistente}'` : 'NULL'});
          INSERT INTO public.mensajes_whatsapp (prestadora_id, conversacion_id, direccion, texto)
            VALUES ('${d.prestadora}', '${id}', 'entrante', 'prueba');`);
        const n = (await cuenta(`conversaciones_whatsapp?id=eq.${id}&select=id`))
          + (await cuenta(`mensajes_whatsapp?conversacion_id=eq.${id}&select=id`));
        if (n === (espera ? 2 : 0)) bien(`WhatsApp: ${espera ? 've' : 'no ve'} la conversación ${nombre}`);
        else mal(`WhatsApp: ${espera ? 've' : 'no ve'} la conversación ${nombre}`, `filas=${n}`);
      }
    }

    // El Contratante lo fija la administración: el Coordinador no lo cambia.
    const cambia = await pedir(entorno, coordinadora, 'PATCH', `servicios?id=eq.${propio[0]}`, { contratante_id: cliente });
    const [[sigue]] = consultarBase(`SELECT contratante_id FROM public.servicios WHERE id = '${propio[0]}';`);
    if (cambia.estado >= 400 && sigue !== cliente) bien('no puede cambiar el Contratante del Servicio');
    else mal('no puede cambiar el Contratante del Servicio', `${cambia.estado} ${JSON.stringify(cambia.cuerpo)}`);
  } finally {
    consultarBase(`SET session_replication_role = replica;
      UPDATE public.servicios SET coordinador_id = '${carla}' WHERE id = '${servicio}';
      DELETE FROM public.alarmas_tomadas WHERE referencia_id = '${guardia}';
      DELETE FROM public.auditoria_reasignaciones_por_emergencia WHERE guardia_id = '${guardia}' AND motivo = 'prueba';
      DELETE FROM public.mensajes_whatsapp WHERE conversacion_id::text LIKE '30000000-0000-4000-8000-0000000000c%';
      DELETE FROM public.conversaciones_whatsapp WHERE id::text LIKE '30000000-0000-4000-8000-0000000000c%';
      DELETE FROM storage.objects WHERE name LIKE '${d.prestadora}/%prueba-coordinador%';
      DELETE FROM public.ausencias WHERE usuario_id = '${otro}';
      DELETE FROM public.usuarios WHERE id = '${otro}';
      DELETE FROM auth.users WHERE id = '${otro}';`);
  }

  return problemas;
}

// ---------------------------------------------------------------------------

function limpiar(creado, idAsistente) {
  // Se borra con la llave del dueño de la base y no con la sesión, porque lo
  // que importa que funcione es el alta; si el borrado fallara por permisos, la
  // prueba dejaría basura sembrada y la próxima corrida arrancaría sucia.
  const borrados = [];
  for (const { tabla, id } of [...creado].reverse()) {
    if (!id) continue;
    const comilla = typeof id === 'string' && id.includes('-') ? `'${id}'` : id;
    consultarBase(`DELETE FROM public.${tabla} WHERE id = ${comilla};`);
    borrados.push(tabla);
  }
  if (idAsistente) consultarBase(`DELETE FROM public.asistentes WHERE id = '${idAsistente}';`);
  return borrados;
}

async function main() {
  const entorno = leerEntorno();
  const d = anclas();
  const token = await entrar(entorno.base, entorno.llavePublica, ADMINISTRADORA, d.prestadora);

  let resultado = { problemas: [], creado: [] };
  try {
    resultado = await probarLasAltas(entorno, token, d);
  } finally {
    const borrados = limpiar(resultado.creado);
    consultarBase("DELETE FROM public.asistentes WHERE nombre = 'Prueba de altas con sesión';");
    consultarBase("DELETE FROM public.prestaciones WHERE tipo_servicio = 'Prueba de altas con sesión';");
    if (borrados.length) console.log(gris(`\n  (se borró lo que se dio de alta: ${borrados.join(', ')})`));
  }

  const delHueco = await probarElHueco(entorno, d);
  const deLaClase = probarLaClaseEntera();
  const deLaConfiguracion = await probarQuienEscribeLaConfiguracion(entorno, d);
  const delCoordinador = await probarElCoordinadorDelServicio(entorno, d);
  const deLasCargas = await probarLoQueCargaOtroCoordinador(entorno, d);
  const delRecorte = await probarCadaCoordinadorVeSoloLoSuyo(entorno, d);
  const problemas = [
    ...resultado.problemas, ...delHueco, ...deLaClase, ...deLaConfiguracion, ...delCoordinador, ...deLasCargas, ...delRecorte,
  ];

  console.log('');
  if (problemas.length) {
    console.log(rojo(`FALLA — ${problemas.length} problema(s):`));
    for (const p of problemas) console.log(rojo(`  · ${p}`));
    // Los dos rebotes se leen igual en pantalla y no se arreglan igual, así que se separan acá.
    console.log(gris('\n  «42501 permission denied for function»: un disparador llama a algo que quien'));
    console.log(gris('  inserta no puede ejecutar. No se arregla tocando políticas — la función tiene'));
    console.log(gris('  que estar del lado de adentro, en el esquema `interno`, y con permiso para'));
    console.log(gris('  `authenticated`.'));
    console.log(gris('\n  «42501 new row violates row-level security policy»: la fila quedó afuera del'));
    console.log(gris('  alcance de quien la escribe. Eso sí es una política, y antes de ampliarla hay'));
    console.log(gris('  que ver si el caso no está ya contemplado en la tabla hermana.'));
    process.exit(1);
  }

  console.log(verde('BIEN — quien tiene sesión puede dar de alta, ningún disparador pide un permiso que no'));
  console.log(verde('tiene, y la configuración la escribe sólo quien corresponde.'));
  process.exit(0);
}

main().catch((e) => {
  console.error(rojo(`\n${e.message}`));
  process.exit(1);
});
