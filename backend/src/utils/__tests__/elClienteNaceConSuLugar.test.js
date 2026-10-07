/**
 * Un Cliente recién creado nace en el Padrón y con su localidad puesta.
 *
 *   npm test --prefix backend
 *
 * POR QUÉ EXISTE ESTA PRUEBA. El Panel busca Clientes por localidad, y un Cliente está donde
 * viven sus Pacientes. Si el Paciente nace sin lugar, al Cliente recién creado no lo encuentra
 * ninguna búsqueda y nadie se entera: la pantalla no falla, contesta vacío. Es el defecto más
 * caro de los dos, porque parece que funciona.
 *
 * El Cliente que llega en una planilla importada nace con su Legajo en el Padrón, y el lugar
 * elegido para el Paciente queda también en ese Legajo. Dos filas que nacen juntas no pueden decir
 * cosas distintas sobre dónde está la persona.
 *
 * SE MIRA EL IDENTIFICADOR Y NO EL NOMBRE. Lo que se guarda es cuál lugar. Dos localidades que se
 * llaman igual en partidos distintos son dos, y el nombre se busca recién al mostrarlo.
 *
 * LA PRESTADORA DE LA PRUEBA NO TIENE SERVICIO DE MAPAS. Así la prueba no sale a preguntarle a un
 * tercero por una dirección: acá se comprueba la localidad, no las coordenadas.
 *
 * Se llama al alta de verdad contra una base de mentira y se mira qué escribió.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import crypto from 'node:crypto';

const PRESTADORA = '11111111-1111-1111-1111-111111111111';
const NUEVA_CUENTA = '33333333-3333-3333-3333-333333333333';
// El Legajo que la base le da a la persona en el Padrón. Es a propósito otro número que el de la
// cuenta: la misma persona puede tener otro Legajo en otra Prestadora, colgando de esta misma cuenta.
const NUEVO_LEGAJO = '66666666-6666-6666-6666-666666666666';
const NUEVO_CLIENTE = '44444444-4444-4444-4444-444444444444';
const PACIENTE = '77777777-7777-7777-7777-777777777777';
const LUGAR = '55555555-5555-5555-5555-555555555555';

/** Qué contesta la base a cada `MÉTODO /ruta`. Cada prueba prepara lo suyo. */
const respuestas = new Map();
/** Todo lo que el backend le pidió a la base, con los filtros de la dirección incluidos. */
let llamadas = [];

const baseFalsa = createServer((req, res) => {
  let crudo = '';
  req.on('data', (parte) => {
    crudo += parte;
  });
  req.on('end', () => {
    const direccion = new URL(req.url, 'http://interno');
    const clave = `${req.method} ${direccion.pathname}`;
    llamadas.push({ clave, ruta: direccion.pathname, filtros: direccion.searchParams, cuerpo: crudo ? JSON.parse(crudo) : null });

    const preparada = respuestas.get(clave);
    const valor = typeof preparada === 'function' ? preparada(direccion.searchParams) : preparada;
    if (valor === undefined) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: `la prueba no preparó respuesta para ${clave}` }));
      return;
    }

    const unoSolo = (req.headers.accept || '').includes('vnd.pgrst.object+json');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(unoSolo && Array.isArray(valor) ? valor[0] ?? null : valor));
  });
});
await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-de-mentira';
process.env.SUPABASE_ANON_KEY = 'clave-publica-de-mentira';
// Una clave inventada para generar la credencial del trabajo sin persona, con la que se piden el
// alta y la baja de la cuenta. Nace acá y se descarta al terminar.
const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
process.env.CLAVE_DEL_TRABAJO_SIN_PERSONA = JSON.stringify({ ...privateKey.export({ format: 'jwk' }), kid: 'prueba' });

// El import va después de dejar puestas las variables de entorno: la conexión a la base se lee en
// el momento del import.
const { crearClienteImportado } = await import('../cuentasPanel.js');
const { supabase } = await import('../../db/connection.js');

after(() => {
  baseFalsa.close();
});

/** Lo que el backend escribió en esa tabla, o `undefined` si no escribió nada. */
function loEscritoEn(tabla) {
  return llamadas.find((l) => l.clave === `POST /rest/v1/${tabla}`)?.cuerpo;
}

function loLeidoDe(tabla) {
  return llamadas.find((l) => l.clave === `GET /rest/v1/${tabla}`);
}

/** Lo que trae la planilla, con datos inventados. */
let fila;

function darDeAlta() {
  return crearClienteImportado({ ...fila, prestadoraId: PRESTADORA, db: supabase });
}

beforeEach(() => {
  llamadas = [];
  respuestas.clear();
  fila = {
    nombreContacto: 'Alba',
    apellidoContacto: 'Ferreyra',
    email: 'alba@ejemplo.invalido',
    telefono: '11 5555 0001',
    nombrePaciente: 'Bruno Ferreyra',
    localidad: 'belgrano',
    domicilioDelPacientePartido: { calle: 'Calle Inventada', numero: '100', lugar_id: LUGAR },
  };

  respuestas.set('POST /rest/v1/usuarios', () => []);
  // Sin ningún prefijo de celular cargado. Acá se prueba dónde nace el Cliente, no la regla de que
  // un celular es de una sola persona, que tiene sus propias pruebas: con el catálogo vacío ningún
  // número se reconoce como celular, que es como se comporta un país que todavía no cargó el suyo.
  respuestas.set('GET /rest/v1/catalogo_prefijos_de_celular', () => []);
  respuestas.set('POST /rest/v1/membresias', () => []);
  respuestas.set('GET /rest/v1/usuarios', () => [{ id: NUEVA_CUENTA, prestadora_id: PRESTADORA }]);
  respuestas.set('DELETE /rest/v1/usuarios', () => []);
  // El alta y la baja de la cuenta las hace la base, cada una en un solo procedimiento.
  respuestas.set('POST /rest/v1/rpc/dar_de_alta_la_cuenta', () => NUEVA_CUENTA);
  respuestas.set('POST /rest/v1/rpc/dar_de_baja_la_cuenta', () => true);
  respuestas.set('POST /rest/v1/legajos', () => [{ id: NUEVO_LEGAJO }]);
  respuestas.set('POST /rest/v1/telefonos_del_legajo', () => []);
  respuestas.set('POST /rest/v1/clientes', () => [{ id: NUEVO_CLIENTE }]);
  respuestas.set('DELETE /rest/v1/clientes', () => []);
  respuestas.set('POST /rest/v1/pacientes', () => [{ id: PACIENTE }]);
  respuestas.set('DELETE /rest/v1/pacientes', () => []);
  // Cómo se llama el lugar señalado. El nombre se usa para ubicar el domicilio, nunca para
  // decidir cuál lugar es.
  respuestas.set('GET /rest/v1/lugares', () => [{ nombre: 'Belgrano' }]);
  // Un país sin servicio de mapas: el domicilio se guarda igual, sin coordenadas.
  respuestas.set('GET /rest/v1/prestadoras', () => [{ pais: 'UY' }]);
});

// ---------------------------------------------------------------------------------------

describe('el Cliente que llega en una planilla importada', () => {
  it('nace en el Padrón, con su nombre, su apellido, su correo y su teléfono', async () => {
    await darDeAlta();

    const legajo = loEscritoEn('legajos');
    assert.equal(legajo.clase, 'fisica');
    assert.equal(legajo.nombre, 'Alba');
    assert.equal(legajo.apellido, 'Ferreyra');
    assert.equal(legajo.email, 'alba@ejemplo.invalido');
    assert.deepEqual(loEscritoEn('telefonos_del_legajo'), {
      prestadora_id: PRESTADORA, legajo_id: NUEVO_LEGAJO, telefono: '11 5555 0001',
    });
    assert.equal(loEscritoEn('clientes').legajo_id, NUEVO_LEGAJO);
  });

  it('deja el mismo lugar en el Paciente y en el Legajo', async () => {
    await darDeAlta();

    assert.equal(loEscritoEn('pacientes').lugar_id, LUGAR);
    assert.equal(loEscritoEn('legajos').lugar_id, LUGAR);
  });

  it('el nombre del lugar se pregunta dentro de la Prestadora y no entre los lugares de todas', async () => {
    await darDeAlta();

    const lectura = loLeidoDe('lugares');
    assert.equal(lectura.filtros.get('id'), `eq.${LUGAR}`);
    assert.equal(lectura.filtros.get('prestadora_id'), `eq.${PRESTADORA}`);
  });

  it('si nadie señaló ningún lugar, no se inventa ninguno', async () => {
    fila.domicilioDelPacientePartido = undefined;

    await darDeAlta();

    assert.equal(loEscritoEn('pacientes').lugar_id ?? null, null);
    assert.equal(loEscritoEn('legajos').lugar_id, null);
    assert.equal(loLeidoDe('lugares'), undefined);
  });

  it('sin apellido no se da de alta, y no se escribe nada', async () => {
    fila.apellidoContacto = undefined;

    await assert.rejects(darDeAlta(), (e) => e.motivo === 'faltan_datos');
    assert.equal(llamadas.length, 0);
  });
});
