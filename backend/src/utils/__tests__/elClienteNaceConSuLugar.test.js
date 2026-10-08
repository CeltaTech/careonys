/**
 * Un Cliente recién creado nace en el Directorio de Personas y con su localidad puesta.
 *
 *   npm test --prefix backend
 *
 * POR QUÉ EXISTE ESTA PRUEBA. El Panel busca Clientes por localidad, y un Cliente está donde
 * viven sus Pacientes. Si el Paciente nace sin lugar, al Cliente recién creado no lo encuentra
 * ninguna búsqueda y nadie se entera: la pantalla no falla, contesta vacío. Es el defecto más
 * caro de los dos, porque parece que funciona.
 *
 * El Cliente que llega en una planilla importada nace con su Ficha en el Directorio de Personas,
 * y el lugar elegido para el Paciente queda también en esa Ficha. Dos filas que nacen juntas no pueden decir
 * cosas distintas sobre dónde está la persona.
 *
 * SE MIRA EL IDENTIFICADOR Y NO EL NOMBRE. Lo que se guarda es cuál lugar. Dos localidades que se
 * llaman igual en partidos distintos son dos, y el nombre se busca recién al mostrarlo.
 *
 * LA PRESTADORA DE LA PRUEBA NO TIENE SERVICIO DE MAPAS. Así la prueba no sale a preguntarle a un
 * tercero por una dirección: acá se comprueba la localidad, no las coordenadas.
 *
 * LA PERSONA SE BUSCA POR SU DOCUMENTO ANTES DE CREARLA. Si ya está en el Directorio, se usa su
 * Ficha tal como está y sólo se le suma el teléfono que no tenía: una persona, una Ficha.
 *
 * Se llama al alta de verdad contra una base de mentira y se mira qué escribió.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import crypto from 'node:crypto';

const PRESTADORA = '11111111-1111-1111-1111-111111111111';
const NUEVA_CUENTA = '33333333-3333-3333-3333-333333333333';
// La Ficha que la base le da a la persona en el Directorio. Es a propósito otro número que el de
// la cuenta: la misma persona puede tener otra Ficha en otra Prestadora, colgando de esta misma
// cuenta.
const NUEVA_PERSONA = '66666666-6666-6666-6666-666666666666';
const NUEVO_CLIENTE = '44444444-4444-4444-4444-444444444444';
const PACIENTE = '77777777-7777-7777-7777-777777777777';
const LUGAR = '55555555-5555-5555-5555-555555555555';
const PERSONA_QUE_YA_ESTABA = '88888888-8888-8888-8888-888888888888';
// Un CUIL inventado que cierra la cuenta del dígito verificador, y nada más.
const CUIL = '20201112223';

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
    documentoContacto: '20-20111222-3',
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
  respuestas.set('POST /rest/v1/personas', () => [{ id: NUEVA_PERSONA }]);
  respuestas.set('POST /rest/v1/telefonos_de_la_persona', () => []);
  respuestas.set('GET /rest/v1/telefonos_de_la_persona', () => []);
  // Los tipos de documento del país que llevan dígito verificador, en el orden del catálogo.
  respuestas.set('GET /rest/v1/catalogo_documentos_de_identidad', () => [{ codigo: 'cuil' }, { codigo: 'cuit' }]);
  // Nadie con ese documento en el Directorio, salvo que la prueba diga otra cosa.
  respuestas.set('GET /rest/v1/personas', () => []);
  respuestas.set('POST /rest/v1/clientes', () => [{ id: NUEVO_CLIENTE, numero_cliente: 7 }]);
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
  it('nace en el Directorio de Personas, con su nombre, su apellido, su correo y su teléfono', async () => {
    await darDeAlta();

    const persona = loEscritoEn('personas');
    assert.equal(persona.clase, 'fisica');
    assert.equal(persona.nombre, 'Alba');
    assert.equal(persona.apellido, 'Ferreyra');
    assert.equal(persona.email, 'alba@ejemplo.invalido');
    assert.deepEqual(loEscritoEn('telefonos_de_la_persona'), {
      prestadora_id: PRESTADORA, persona_id: NUEVA_PERSONA, telefono: '11 5555 0001',
    });
    assert.equal(loEscritoEn('clientes').contratante_persona_id, NUEVA_PERSONA);
  });

  it('deja el mismo lugar en el Paciente y en la Ficha', async () => {
    await darDeAlta();

    assert.equal(loEscritoEn('pacientes').lugar_id, LUGAR);
    assert.equal(loEscritoEn('personas').lugar_id, LUGAR);
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
    assert.equal(loEscritoEn('personas').lugar_id, null);
    assert.equal(loLeidoDe('lugares'), undefined);
  });

  it('sin apellido no se da de alta, y no se escribe nada', async () => {
    fila.apellidoContacto = undefined;

    await assert.rejects(darDeAlta(), (e) => e.motivo === 'faltan_datos');
    assert.equal(llamadas.length, 0);
  });

  it('sin documento no se da de alta, y no se escribe nada', async () => {
    fila.documentoContacto = '  ';

    await assert.rejects(darDeAlta(), (e) => e.motivo === 'falta_el_documento');
    assert.equal(llamadas.length, 0);
  });

  it('la Ficha nueva lleva el documento sin guiones y con el primer tipo del catálogo', async () => {
    await darDeAlta();

    const persona = loEscritoEn('personas');
    assert.equal(persona.documento_tipo, 'cuil');
    assert.equal(persona.documento_numero, CUIL);
  });

  it('la persona se busca en esta Prestadora, por su número, entre los tipos del catálogo', async () => {
    await darDeAlta();

    const busqueda = loLeidoDe('personas');
    assert.equal(busqueda.filtros.get('prestadora_id'), `eq.${PRESTADORA}`);
    assert.equal(busqueda.filtros.get('documento_numero'), `eq.${CUIL}`);
    assert.equal(busqueda.filtros.get('documento_tipo'), 'in.(cuil,cuit)');
  });

  it('si la persona ya está en el Directorio, se usa su Ficha y no se crea otra', async () => {
    respuestas.set('GET /rest/v1/personas', () => [{ id: PERSONA_QUE_YA_ESTABA }]);

    const alta = await darDeAlta();

    assert.equal(loEscritoEn('personas'), undefined);
    assert.equal(loEscritoEn('clientes').contratante_persona_id, PERSONA_QUE_YA_ESTABA);
    assert.equal(alta.fichaQueYaExistia, true);
    assert.equal(alta.numeroCliente, 7);
  });

  it('a la Ficha que ya estaba se le suma el teléfono que no tenía', async () => {
    respuestas.set('GET /rest/v1/personas', () => [{ id: PERSONA_QUE_YA_ESTABA }]);

    await darDeAlta();

    assert.deepEqual(loEscritoEn('telefonos_de_la_persona'), {
      prestadora_id: PRESTADORA, persona_id: PERSONA_QUE_YA_ESTABA, telefono: '11 5555 0001',
    });
  });

  it('el teléfono que la Ficha ya tenía no se escribe dos veces', async () => {
    respuestas.set('GET /rest/v1/personas', () => [{ id: PERSONA_QUE_YA_ESTABA }]);
    respuestas.set('GET /rest/v1/telefonos_de_la_persona', () => [{ id: 'uno' }]);

    await darDeAlta();

    assert.equal(loEscritoEn('telefonos_de_la_persona'), undefined);
  });

  it('un número que la base rechaza no deja ninguna cuenta creada', async () => {
    // Sin respuesta preparada, la base de mentira contesta con un error.
    respuestas.delete('POST /rest/v1/personas');

    await assert.rejects(darDeAlta());
    assert.equal(llamadas.some((l) => l.clave === 'POST /rest/v1/rpc/dar_de_alta_la_cuenta'), false);
  });
});
