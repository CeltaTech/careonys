/**
 * Un Cliente que llega en una planilla importada nace en el Directorio de Personas, con su Paciente
 * reconocido y con el lugar puesto en la Ficha del Paciente.
 *
 *   npm test --prefix backend
 *
 * POR QUÉ EXISTE ESTA PRUEBA. El Panel busca Clientes por localidad, y un Cliente está donde
 * viven sus Pacientes. Si el Paciente nace sin lugar, al Cliente recién creado no lo encuentra
 * ninguna búsqueda y nadie se entera: la pantalla no falla, contesta vacío. Es el defecto más
 * caro de los dos, porque parece que funciona.
 *
 * EL PACIENTE ESTÁ EN EL DIRECTORIO. Su nombre, su domicilio y su lugar se escriben en su Ficha de
 * Persona, y el Paciente sólo la apunta. Se lo reconoce por su CUIL; si la fila no lo trae, es la
 * misma persona que contrata sólo cuando el nombre es el mismo, y si no, la fila no se carga.
 *
 * SE MIRA EL IDENTIFICADOR Y NO EL NOMBRE. Lo que se guarda es cuál lugar. Dos localidades que se
 * llaman igual en partidos distintos son dos, y el nombre se busca recién al mostrarlo.
 *
 * LA PRESTADORA DE LA PRUEBA NO TIENE SERVICIO DE MAPAS. Así la prueba no sale a preguntarle a un
 * tercero por una dirección: acá se comprueba la localidad, no las coordenadas.
 *
 * LA PERSONA SE BUSCA POR SU DOCUMENTO ANTES DE CREARLA. Si ya está en el Directorio, se usa su
 * Ficha tal como está y sólo se le suma lo que no tenía: una persona, una Ficha.
 *
 * UNA FILA QUE YA ENTRÓ NO ENTRA DOS VECES. Así la planilla corregida se puede volver a importar
 * sin duplicar lo que ya se había cargado.
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
const PERSONA_DEL_PACIENTE = '99999999-9999-9999-9999-999999999999';
const NUEVO_CLIENTE = '44444444-4444-4444-4444-444444444444';
const PACIENTE = '77777777-7777-7777-7777-777777777777';
const LUGAR = '55555555-5555-5555-5555-555555555555';
const PERSONA_QUE_YA_ESTABA = '88888888-8888-8888-8888-888888888888';
const CLIENTE_QUE_YA_ESTABA = '22222222-2222-2222-2222-222222222222';
// CUIL inventados. La base de mentira no revisa el dígito verificador: eso lo hace la base de verdad.
const CUIL = '20201112223';
const CUIL_DEL_PACIENTE = '20301112224';

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
    const cuerpo = crudo ? JSON.parse(crudo) : null;
    llamadas.push({ clave, ruta: direccion.pathname, filtros: direccion.searchParams, cuerpo });

    const preparada = respuestas.get(clave);
    const valor = typeof preparada === 'function' ? preparada(direccion.searchParams, cuerpo) : preparada;
    if (valor === undefined || valor?.error) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(valor?.error ?? { message: `la prueba no preparó respuesta para ${clave}` }));
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

function todoLoEscritoEn(tabla) {
  return llamadas.filter((l) => l.clave === `POST /rest/v1/${tabla}`).map((l) => l.cuerpo);
}

/** El cambio que el backend le hizo a una fila de esa tabla, con los filtros que la eligieron. */
function loCambiadoEn(tabla) {
  return llamadas.find((l) => l.clave === `PATCH /rest/v1/${tabla}`);
}

function loLeidoDe(tabla) {
  return llamadas.find((l) => l.clave === `GET /rest/v1/${tabla}`);
}

function seLlamo(clave) {
  return llamadas.some((l) => l.clave === clave);
}

/** Lo que trae la planilla, con datos inventados. */
let fila;
/** Las Fichas que ya están en el Directorio, por documento. */
let enElDirectorio;
/** Lo que ya tiene escrito la Ficha a la que se le completan datos. */
let loQueYaTieneLaFicha;

function darDeAlta() {
  return crearClienteImportado({ ...fila, prestadoraId: PRESTADORA, db: supabase });
}

beforeEach(() => {
  llamadas = [];
  respuestas.clear();
  enElDirectorio = {};
  loQueYaTieneLaFicha = {};
  fila = {
    nombreContacto: 'Alba',
    apellidoContacto: 'Ferreyra',
    documentoContacto: '20-20111222-3',
    email: 'alba@ejemplo.invalido',
    telefono: '11 5555 0001',
    nombrePaciente: 'Bruno Ferreyra',
    documentoPaciente: '20-30111222-4',
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
  // Cada documento nuevo, su Ficha.
  respuestas.set('POST /rest/v1/personas', (_, cuerpo) => [
    { id: cuerpo.documento_numero === CUIL_DEL_PACIENTE ? PERSONA_DEL_PACIENTE : NUEVA_PERSONA },
  ]);
  // La misma tabla se lee para buscar por documento y para ver qué tiene escrito una Ficha.
  respuestas.set('GET /rest/v1/personas', (filtros) => {
    if (filtros.has('documento_numero')) {
      const id = enElDirectorio[filtros.get('documento_numero').replace(/^eq\./, '')];
      return id ? [{ id }] : [];
    }
    return [loQueYaTieneLaFicha];
  });
  respuestas.set('PATCH /rest/v1/personas', () => []);
  respuestas.set('POST /rest/v1/telefonos_de_la_persona', () => []);
  respuestas.set('GET /rest/v1/telefonos_de_la_persona', () => []);
  // Los tipos de documento del país que llevan dígito verificador, en el orden del catálogo.
  respuestas.set('GET /rest/v1/catalogo_documentos_de_identidad', () => [{ codigo: 'cuil' }, { codigo: 'cuit' }]);
  // Ningún Paciente cargado todavía, salvo que la prueba diga otra cosa.
  respuestas.set('GET /rest/v1/pacientes', () => []);
  respuestas.set('GET /rest/v1/clientes', () => []);
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
  it('quien contrata nace en el Directorio de Personas, con su nombre, su apellido, su correo y su teléfono', async () => {
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

  it('el lugar queda en la Ficha del Paciente, y el Paciente sólo la apunta', async () => {
    await darDeAlta();

    const cambio = loCambiadoEn('personas');
    assert.equal(cambio.filtros.get('id'), `eq.${PERSONA_DEL_PACIENTE}`);
    assert.equal(cambio.filtros.get('prestadora_id'), `eq.${PRESTADORA}`);
    assert.equal(cambio.cuerpo.lugar_id, LUGAR);
    assert.equal(cambio.cuerpo.calle, 'Calle Inventada');
    assert.equal(cambio.cuerpo.numero, '100');

    const paciente = loEscritoEn('pacientes');
    assert.equal(paciente.persona_id, PERSONA_DEL_PACIENTE);
    for (const columna of ['lugar_id', 'nombre', 'domicilio', 'lat', 'lng', 'fecha_nacimiento']) {
      assert.equal(Object.hasOwn(paciente, columna), false, `el Paciente no lleva ${columna}`);
    }
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

    assert.equal(loCambiadoEn('personas')?.cuerpo.lugar_id ?? null, null);
    assert.equal(loLeidoDe('lugares'), undefined);
  });

  it('el domicilio en un renglón suelto se parte en calle y número', async () => {
    fila.domicilioDelPacientePartido = undefined;
    fila.domicilioPaciente = 'Av. Siempre Viva 742, Springfield';

    await darDeAlta();

    const cambio = loCambiadoEn('personas').cuerpo;
    assert.equal(cambio.calle, 'Av. Siempre Viva');
    assert.equal(cambio.numero, '742');
  });

  it('lo que la Ficha ya tenía escrito no se pisa', async () => {
    loQueYaTieneLaFicha = { calle: 'Calle Corregida', numero: null, lugar_id: null };

    await darDeAlta();

    const cambio = loCambiadoEn('personas').cuerpo;
    assert.equal(Object.hasOwn(cambio, 'calle'), false);
    assert.equal(cambio.numero, '100');
    assert.equal(cambio.lugar_id, LUGAR);
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
    enElDirectorio[CUIL] = PERSONA_QUE_YA_ESTABA;

    const alta = await darDeAlta();

    assert.equal(todoLoEscritoEn('personas').some((p) => p.documento_numero === CUIL), false);
    assert.equal(loEscritoEn('clientes').contratante_persona_id, PERSONA_QUE_YA_ESTABA);
    assert.equal(alta.fichaQueYaExistia, true);
    assert.equal(alta.numeroCliente, 7);
  });

  it('a la Ficha que ya estaba se le suma el teléfono que no tenía', async () => {
    enElDirectorio[CUIL] = PERSONA_QUE_YA_ESTABA;

    await darDeAlta();

    assert.deepEqual(loEscritoEn('telefonos_de_la_persona'), {
      prestadora_id: PRESTADORA, persona_id: PERSONA_QUE_YA_ESTABA, telefono: '11 5555 0001',
    });
  });

  it('el teléfono que la Ficha ya tenía no se escribe dos veces', async () => {
    enElDirectorio[CUIL] = PERSONA_QUE_YA_ESTABA;
    respuestas.set('GET /rest/v1/telefonos_de_la_persona', () => [{ id: 'uno' }]);

    await darDeAlta();

    assert.equal(loEscritoEn('telefonos_de_la_persona'), undefined);
  });

  it('un número que la base rechaza no deja ninguna cuenta creada', async () => {
    // Sin respuesta preparada, la base de mentira contesta con un error.
    respuestas.delete('POST /rest/v1/personas');

    await assert.rejects(darDeAlta());
    assert.equal(seLlamo('POST /rest/v1/rpc/dar_de_alta_la_cuenta'), false);
  });
});

describe('quién es el Paciente', () => {
  it('con otro CUIL, el Paciente tiene su propia Ficha, con su nombre y sin el correo de quien contrata', async () => {
    await darDeAlta();

    const delPaciente = todoLoEscritoEn('personas').find((p) => p.documento_numero === CUIL_DEL_PACIENTE);
    assert.equal(delPaciente.nombre, 'Bruno');
    assert.equal(delPaciente.apellido, 'Ferreyra');
    assert.equal(delPaciente.email, null);
    assert.equal(loEscritoEn('pacientes').persona_id, PERSONA_DEL_PACIENTE);
    assert.equal(loEscritoEn('clientes').contratante_persona_id, NUEVA_PERSONA);
  });

  it('con el mismo CUIL que quien contrata, es la misma Ficha', async () => {
    fila.documentoPaciente = '20201112223';

    await darDeAlta();

    assert.equal(todoLoEscritoEn('personas').length, 1);
    assert.equal(loEscritoEn('pacientes').persona_id, NUEVA_PERSONA);
  });

  it('sin CUIL y con el mismo nombre, en otro orden y sin tildes, es la misma Ficha', async () => {
    fila.nombreContacto = 'Álba';
    fila.documentoPaciente = '';
    fila.nombrePaciente = 'FERREYRA Alba';

    await darDeAlta();

    assert.equal(todoLoEscritoEn('personas').length, 1);
    assert.equal(loEscritoEn('pacientes').persona_id, NUEVA_PERSONA);
  });

  it('sin CUIL y con otro nombre, la fila no se carga y no se escribe nada', async () => {
    fila.documentoPaciente = undefined;

    await assert.rejects(darDeAlta(), (e) => e.motivo === 'falta_el_documento_del_paciente');
    assert.equal(llamadas.length, 0);
  });

  it('si la base rechaza el CUIL del Paciente, el motivo dice que es el del Paciente', async () => {
    respuestas.set('POST /rest/v1/personas', (_, cuerpo) => (
      cuerpo.documento_numero === CUIL_DEL_PACIENTE
        ? { error: { message: 'numero_no_valido' } }
        : [{ id: NUEVA_PERSONA }]
    ));

    await assert.rejects(darDeAlta(), (e) => e.motivo === 'documento_del_paciente_no_valido');
    assert.equal(seLlamo('POST /rest/v1/rpc/dar_de_alta_la_cuenta'), false);
  });

  it('si la base rechaza el CUIL de quien contrata, el motivo es el de siempre', async () => {
    respuestas.set('POST /rest/v1/personas', () => ({ error: { message: 'numero_no_valido' } }));

    await assert.rejects(darDeAlta(), (e) => e.motivo === 'numero_no_valido');
  });
});

describe('una fila que ya entró', () => {
  beforeEach(() => {
    enElDirectorio[CUIL] = PERSONA_QUE_YA_ESTABA;
    enElDirectorio[CUIL_DEL_PACIENTE] = PERSONA_DEL_PACIENTE;
    respuestas.set('GET /rest/v1/pacientes', () => [{ cliente_id: CLIENTE_QUE_YA_ESTABA }]);
    respuestas.set('GET /rest/v1/clientes', () => [{ id: CLIENTE_QUE_YA_ESTABA, numero_cliente: 3 }]);
  });

  it('no crea ni cuenta, ni Ficha del cliente, ni Paciente, y dice en qué Ficha del cliente está', async () => {
    const alta = await darDeAlta();

    assert.deepEqual(alta, { yaEstaba: true, numeroCliente: 3 });
    assert.equal(seLlamo('POST /rest/v1/rpc/dar_de_alta_la_cuenta'), false);
    assert.equal(loEscritoEn('clientes'), undefined);
    assert.equal(loEscritoEn('pacientes'), undefined);
  });

  it('se busca en esta Prestadora, con ese Paciente y esa persona contratando', async () => {
    await darDeAlta();

    const pacientes = loLeidoDe('pacientes').filtros;
    assert.equal(pacientes.get('prestadora_id'), `eq.${PRESTADORA}`);
    assert.equal(pacientes.get('persona_id'), `eq.${PERSONA_DEL_PACIENTE}`);
    const clientes = loLeidoDe('clientes').filtros;
    assert.equal(clientes.get('prestadora_id'), `eq.${PRESTADORA}`);
    assert.equal(clientes.get('contratante_persona_id'), `eq.${PERSONA_QUE_YA_ESTABA}`);
    assert.equal(clientes.get('id'), `in.(${CLIENTE_QUE_YA_ESTABA})`);
  });

  it('si esa persona contrata para otro Paciente, es una Ficha del cliente nueva', async () => {
    respuestas.set('GET /rest/v1/clientes', () => []);

    const alta = await darDeAlta();

    assert.equal(alta.yaEstaba, undefined);
    assert.equal(loEscritoEn('clientes').contratante_persona_id, PERSONA_QUE_YA_ESTABA);
  });
});
