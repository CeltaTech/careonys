/**
 * Un celular es de una sola persona; una línea fija se comparte.
 *
 *   node --test "src/**\/__tests__/*.test.js"   (desde backend/)
 *
 * QUÉ SE PRUEBA ACÁ Y QUÉ NO. La unicidad la impone la base con un índice único
 * (`supabase/migrations/20261004100000_un_celular_es_de_una_sola_persona.sql`), y eso no se prueba
 * desde acá: sin base levantada, nada de lo que hay en este archivo puede comprobar un índice. Lo
 * que se prueba es la segunda red del backend, que es la que contesta con una frase entendible, y cada
 * caso está por el error que evita:
 *
 *   1. QUE EL MISMO CELULAR ENTRE EN DOS PERSONAS. Es el defecto que se viene a corregir.
 *   2. QUE LA LÍNEA FIJA DE UNA CASA SE RECHACE. Una casa con una sola línea es lo corriente.
 *   3. QUE LA REGLA CRUCE PRESTADORAS. La misma persona tiene una cuenta en cada una, con su
 *      celular en las dos, y prohibirlo sería impedirle entrar a la segunda.
 *   4. QUE UNA CUENTA CHOQUE CONSIGO MISMA. Volver a guardar el número que ya tiene no es repetirlo.
 *   5. QUE EL MISMO NÚMERO ESCRITO DISTINTO PASE POR OTRO. `+54 9 11 5555-1234` y `5491155551234`
 *      son el mismo teléfono.
 *   6. QUE EL NÚMERO SE FILTRE. Es dato sensible: no entra en el mensaje, no queda en el registro del
 *      servidor y no viaja en ninguna dirección — ni siquiera en la consulta a la base.
 *   7. QUE LA COMPROBACIÓN SE SALTEE CUANDO LA BASE NO CONTESTA. Todo control falla cerrado.
 *   8. QUE EL PREFIJO QUEDE ESCRITO EN EL CÓDIGO. Cómo se reconoce un celular depende del país y
 *      sale del catálogo de la base.
 *   9. QUE ACTIVAR UNA CUENTA TERMINE EN ERROR. Ahí la cuenta ya quedó activa: el número no se
 *      guarda, pero la respuesta dice por qué y nadie pierde el acceso.
 *
 * LAS PRUEBAS QUE IMPORTAN ROMPEN EL CONTROL A PROPÓSITO: la misma llamada, con la otra cuenta en
 * otra Prestadora o con el número sin el 9 del celular, tiene que pasar. Sin eso una prueba que dice
 * «falló» no prueba nada, porque podría estar fallando por otra cosa.
 *
 * Los datos son inventados.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PRESTADORA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTRA_PRESTADORA = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const USUARIO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OTRA_CUENTA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const CELULAR = '+54 9 11 5555-1234';
const CELULAR_SIN_ADORNOS = '5491155551234';
const LINEA_FIJA = '+54 11 5555-1234';

/** Qué contesta la base a cada `MÉTODO /ruta`. Cada prueba prepara lo suyo. */
const respuestas = new Map();
/** Todo lo que el backend le pidió a la base, con la dirección entera. */
let llamadas = [];

const baseFalsa = createServer((req, res) => {
  let crudo = '';
  req.on('data', (parte) => {
    crudo += parte;
  });
  req.on('end', () => {
    const ruta = new URL(req.url, 'http://interno').pathname;
    const clave = `${req.method} ${ruta}`;
    const cuerpo = crudo ? JSON.parse(crudo) : null;
    llamadas.push({ clave, url: req.url, cuerpo });

    const preparada = respuestas.get(clave);
    const valor = typeof preparada === 'function' ? preparada({ cuerpo, url: req.url }) : preparada;
    if (valor === undefined) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: `la prueba no preparó respuesta para ${clave}` }));
      return;
    }

    if (valor && valor.__estado) {
      res.writeHead(valor.__estado, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(valor.__cuerpo));
      return;
    }

    const unoSolo = (req.headers.accept || '').includes('vnd.pgrst.object+json');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(unoSolo && Array.isArray(valor) ? (valor[0] ?? null) : valor));
  });
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-de-mentira';

// El import va después de las variables de entorno: la conexión se arma al importar.
const {
  exigirQueElCelularSeaDeUnaSolaPersona,
  esUnCelularSegun,
  huellaComparable,
  digitosDelTelefono,
} = await import('../celularDeUnaSolaPersona.js');
const { ErrorConMotivo, responderError } = await import('../errorConMotivo.js');

after(() => {
  baseFalsa.close();
});

/** El catálogo, tal como sale de la base. Argentina: el 9 delante del área. */
function catalogoConArgentina() {
  respuestas.set('GET /rest/v1/catalogo_prefijos_de_celular', [{ prefijo: '549' }]);
}

/** Qué contesta la base cuando se le pregunta si ese celular ya está en otra cuenta. */
function yaEstaEnOtraCuenta(filas) {
  respuestas.set('GET /rest/v1/usuarios', filas);
}

beforeEach(() => {
  respuestas.clear();
  llamadas = [];
});

describe('un celular es de una sola persona', () => {
  it('rechaza el mismo celular en dos personas de la misma Prestadora', async () => {
    catalogoConArgentina();
    yaEstaEnOtraCuenta([{ id: OTRA_CUENTA }]);

    await assert.rejects(
      () => exigirQueElCelularSeaDeUnaSolaPersona({
        telefono: CELULAR,
        prestadoraId: PRESTADORA,
        usuarioId: USUARIO,
      }),
      (e) => e instanceof ErrorConMotivo && e.motivo === 'celular_de_otra_persona',
    );
  });

  // El control roto a propósito: lo único que cambia es que la otra cuenta no está, y entonces pasa.
  it('deja pasar el celular que no está en ninguna otra cuenta', async () => {
    catalogoConArgentina();
    yaEstaEnOtraCuenta([]);

    await exigirQueElCelularSeaDeUnaSolaPersona({
      telefono: CELULAR,
      prestadoraId: PRESTADORA,
      usuarioId: USUARIO,
    });
  });

  it('deja pasar la misma línea fija en dos personas, y ni siquiera le pregunta a la base', async () => {
    catalogoConArgentina();

    await exigirQueElCelularSeaDeUnaSolaPersona({
      telefono: LINEA_FIJA,
      prestadoraId: PRESTADORA,
      usuarioId: USUARIO,
    });

    assert.equal(llamadas.filter((l) => l.clave === 'GET /rest/v1/usuarios').length, 0);
  });

  it('pregunta sólo adentro de la Prestadora, y sin contar la cuenta que se está cambiando', async () => {
    catalogoConArgentina();
    yaEstaEnOtraCuenta([]);

    await exigirQueElCelularSeaDeUnaSolaPersona({
      telefono: CELULAR,
      prestadoraId: PRESTADORA,
      usuarioId: USUARIO,
    });

    const consulta = llamadas.find((l) => l.clave === 'GET /rest/v1/usuarios').url;
    assert.ok(consulta.includes(`prestadora_id=eq.${PRESTADORA}`));
    assert.ok(consulta.includes(`id=neq.${USUARIO}`));
    assert.ok(!consulta.includes(OTRA_PRESTADORA));
  });

  it('con la cuenta sin Prestadora compara contra las que tampoco tienen', async () => {
    catalogoConArgentina();
    yaEstaEnOtraCuenta([]);

    await exigirQueElCelularSeaDeUnaSolaPersona({ telefono: CELULAR });

    const consulta = llamadas.find((l) => l.clave === 'GET /rest/v1/usuarios').url;
    assert.ok(consulta.includes('prestadora_id=is.null'));
  });

  it('el mismo número escrito de dos maneras es el mismo número', () => {
    assert.equal(huellaComparable(CELULAR), huellaComparable(CELULAR_SIN_ADORNOS));
    assert.equal(huellaComparable('+54 9 11 5555 1234'), huellaComparable('5491155551234'));
    assert.notEqual(huellaComparable(CELULAR), huellaComparable('5491155551235'));
    assert.equal(huellaComparable(''), null);
    assert.equal(huellaComparable(null), null);
    assert.equal(digitosDelTelefono(CELULAR), CELULAR_SIN_ADORNOS);
  });
});

describe('el teléfono no sale por ningún lado', () => {
  it('no viaja en la consulta a la base: lo que va es la huella', async () => {
    catalogoConArgentina();
    yaEstaEnOtraCuenta([{ id: OTRA_CUENTA }]);

    await assert.rejects(() => exigirQueElCelularSeaDeUnaSolaPersona({
      telefono: CELULAR,
      prestadoraId: PRESTADORA,
    }));

    for (const { url } of llamadas) {
      const direccion = decodeURIComponent(url);
      assert.ok(!direccion.includes(CELULAR_SIN_ADORNOS), 'el número quedó escrito en una dirección');
      assert.ok(!direccion.includes('5555-1234'), 'el número quedó escrito en una dirección');
    }

    const consulta = llamadas.find((l) => l.clave === 'GET /rest/v1/usuarios').url;
    assert.ok(consulta.includes(huellaComparable(CELULAR)));
  });

  it('no entra en el aviso ni en lo que queda anotado del lado del servidor', async () => {
    catalogoConArgentina();
    yaEstaEnOtraCuenta([{ id: OTRA_CUENTA }]);

    const error = await exigirQueElCelularSeaDeUnaSolaPersona({
      telefono: CELULAR,
      prestadoraId: PRESTADORA,
    }).then(() => null, (e) => e);

    assert.ok(error instanceof ErrorConMotivo);
    assert.ok(!error.message.includes(CELULAR_SIN_ADORNOS));
    assert.ok(!error.message.includes('5555'));

    // Y lo que sale hacia la pantalla, y lo que se escribe en el registro del servidor, tampoco.
    const anotado = [];
    const original = console.error;
    console.error = (...partes) => anotado.push(partes.map(String).join(' '));

    let cuerpo = null;
    let estado = null;
    const res = {
      req: { method: 'POST', originalUrl: '/panel/usuarios' },
      status(c) { estado = c; return this; },
      json(b) { cuerpo = b; return this; },
    };

    try {
      responderError(res, error);
    } finally {
      console.error = original;
    }

    assert.equal(estado, 409);
    assert.deepEqual(cuerpo, { error: 'celular_de_otra_persona', motivo: 'celular_de_otra_persona' });
    assert.equal(JSON.stringify(cuerpo).includes('5555'), false);
    assert.equal(anotado.join(' ').includes('5555'), false);
  });
});

describe('cómo se reconoce un celular sale de la base', () => {
  it('sin catálogo cargado no hay ningún celular reconocido', () => {
    assert.equal(esUnCelularSegun([], CELULAR), false);
    assert.equal(esUnCelularSegun([], CELULAR_SIN_ADORNOS), false);
  });

  it('con el prefijo cargado, el celular se reconoce y la línea fija no', () => {
    assert.equal(esUnCelularSegun(['549'], CELULAR), true);
    assert.equal(esUnCelularSegun(['549'], LINEA_FIJA), false);
    assert.equal(esUnCelularSegun(['549'], ''), false);
    assert.equal(esUnCelularSegun(['549'], null), false);
  });

  it('ningún prefijo de ningún país está escrito en el código', () => {
    const fuente = readFileSync(
      fileURLToPath(new URL('../celularDeUnaSolaPersona.js', import.meta.url)),
      'utf8',
    );
    const lineas = fuente.split('\n').filter((linea) => !linea.trimStart().startsWith('//'));
    for (const linea of lineas) {
      assert.equal(
        /'\d{2,}'|"\d{2,}"/.test(linea),
        false,
        `hay un prefijo escrito en el código: ${linea.trim()}`,
      );
    }
  });

  it('falla cerrado: si el catálogo no se puede leer, no deja pasar nada', async () => {
    respuestas.set('GET /rest/v1/catalogo_prefijos_de_celular', {
      __estado: 500,
      __cuerpo: { message: 'la base no contesta' },
    });

    await assert.rejects(() => exigirQueElCelularSeaDeUnaSolaPersona({
      telefono: CELULAR,
      prestadoraId: PRESTADORA,
    }));
  });

  it('falla cerrado también si no se puede preguntar por las otras cuentas', async () => {
    catalogoConArgentina();
    respuestas.set('GET /rest/v1/usuarios', {
      __estado: 500,
      __cuerpo: { message: 'la base no contesta' },
    });

    await assert.rejects(() => exigirQueElCelularSeaDeUnaSolaPersona({
      telefono: CELULAR,
      prestadoraId: PRESTADORA,
    }));
  });
});

// La unicidad de verdad la impone la base, y sin base levantada no se la puede ejercitar desde acá.
// Lo que sí se puede comprobar es que la migración que la impone siga diciendo lo que dice: que el
// índice es único y parcial —si dejara de ser parcial, dos personas no podrían compartir la línea
// fija de la casa—, que la comparación es por la huella y no por el número, y que ninguna función
// nueva se saltea la protección por fila. Que la migración corre bien se comprueba al aplicarla:
// termina con su propio bloque de comprobación.
describe('la unicidad la impone la base', () => {
  const migracion = readFileSync(
    fileURLToPath(new URL(
      '../../../../supabase/migrations/20261004100000_un_celular_es_de_una_sola_persona.sql',
      import.meta.url,
    )),
    'utf8',
  );

  it('el índice es único, es parcial y compara la huella', () => {
    assert.match(migracion, /CREATE UNIQUE INDEX IF NOT EXISTS un_celular_es_de_una_sola_persona/);
    assert.match(migracion, /WHERE telefono_es_celular;/);
    assert.match(migracion, /telefono_comparable\s*\n\s*\)\s*\n\s*WHERE telefono_es_celular;/);
  });

  it('ninguna función nueva se saltea la protección por fila', () => {
    // Como atributo de una función va en su propio renglón; lo que aparece adentro de un comentario
    // o de un texto cualquiera no declara nada.
    const declarada = migracion
      .split('\n')
      .filter((linea) => /^\s*SECURITY\s+DEFINER\s*$/i.test(linea));
    assert.deepEqual(declarada, []);
    assert.match(migracion, /p\.prosecdef/);
  });

  it('termina como termina todo cambio de esquema', () => {
    assert.match(migracion, /COMMIT;\s*\n\s*NOTIFY pgrst, 'reload schema';\s*$/);
  });
});

describe('al activar la cuenta, el celular repetido no la deja sin activar', () => {
  it('no guarda el número, no manda ningún código y dice por qué', async () => {
    const { ofrecerElCodigoAlActivar } = await import('../telefonoAlActivar.js');

    catalogoConArgentina();
    respuestas.set('GET /rest/v1/usuarios', ({ url }) => (
      url.includes('telefono_comparable')
        ? [{ id: OTRA_CUENTA }]
        : [{ id: USUARIO, prestadora_id: PRESTADORA, telefono: null, telefono_verificado_en: null }]
    ));

    const salida = await ofrecerElCodigoAlActivar({ usuarioId: USUARIO, telefono: CELULAR });

    assert.deepEqual(salida, { codigoEnviado: false, motivo: 'celular_de_otra_persona' });
    assert.equal(llamadas.filter((l) => l.clave.startsWith('PATCH')).length, 0);
  });

  // El control roto a propósito: el mismo camino, con el número libre, sí guarda.
  it('con el número libre el número se guarda', async () => {
    const { ofrecerElCodigoAlActivar } = await import('../telefonoAlActivar.js');

    catalogoConArgentina();
    respuestas.set('GET /rest/v1/usuarios', ({ url }) => (
      url.includes('telefono_comparable')
        ? []
        : [{ id: USUARIO, prestadora_id: PRESTADORA, telefono: null, telefono_verificado_en: null }]
    ));
    respuestas.set('PATCH /rest/v1/usuarios', []);
    // Sin vía de teléfono en esa Prestadora no sale ningún código, y eso no deshace nada.
    respuestas.set('GET /rest/v1/plantillas_whatsapp', []);

    const salida = await ofrecerElCodigoAlActivar({ usuarioId: USUARIO, telefono: CELULAR });

    assert.equal(salida.codigoEnviado, false);
    assert.equal(salida.motivo, undefined);
    assert.equal(llamadas.filter((l) => l.clave === 'PATCH /rest/v1/usuarios').length, 1);
  });
});
