/**
 * Pruebas de qué contesta sola la respuesta automática de WhatsApp.
 *
 * LAS DOS QUE NO PUEDEN FALTAR, y por eso están primeras:
 *   - sin una respuesta aprobada que corresponda, NO contesta: deriva a una persona;
 *   - lo que toca la salud se deriva SIEMPRE, aunque haya una respuesta preparada que sirva.
 *
 * Cada prueba está escrita para ponerse en rojo si se saca la comprobación que afirma. Si el
 * filtro de `aprobada_at` desapareciera, la primera contestaría con un texto sin aprobar; si el
 * corte por salud se mirara después del banco, la segunda contestaría en vez de derivar.
 *
 *   node --test "src/**\/__tests__/*.test.js"
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';

const PRESTADORA = '11111111-1111-1111-1111-111111111111';

/** Qué contesta la base a cada `MÉTODO /ruta`. Cada prueba prepara lo suyo. */
const respuestas = new Map();
/** Todo lo que el backend le pidió a la base. */
let llamadas = [];

/** Lo que dice adentro una credencial, o `null` si no se puede leer. */
function leerCredencial(autorizacion) {
  try {
    return JSON.parse(Buffer.from(autorizacion.replace('Bearer ', '').split('.')[1], 'base64url').toString());
  } catch {
    return null;
  }
}

const baseFalsa = createServer((req, res) => {
  let crudo = '';
  req.on('data', (parte) => {
    crudo += parte;
  });
  req.on('end', () => {
    const ruta = new URL(req.url, 'http://interno').pathname;
    const clave = `${req.method} ${ruta}`;
    const cuerpo = crudo ? JSON.parse(crudo) : null;
    llamadas.push({ clave, url: req.url, cuerpo, credencial: leerCredencial(req.headers.authorization ?? '') });

    const preparada = respuestas.get(clave);
    const valor = typeof preparada === 'function' ? preparada({ url: req.url, cuerpo }) : preparada;
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
prepararCredencialDePrueba();

// El import va después de las variables de entorno: la conexión se arma al importar.
const {
  resolverRespuestaAutomatica,
  avisarAlServicioDeEmergencias,
  registrarRespuestaAutomatica,
  textoComparable,
  MOTIVO_RESPUESTA_APROBADA,
  MOTIVO_SIN_RESPUESTA_APROBADA,
  MOTIVO_TEMA_DE_SALUD,
  MOTIVO_EMERGENCIA,
  MOTIVO_SIN_TELEFONO_DE_EMERGENCIA,
  MOTIVO_NO_SE_PUDO_CLASIFICAR,
  MOTIVO_PIDIO_UNA_PERSONA,
  MOTIVO_LA_ATIENDE_UNA_PERSONA,
  RESULTADO_DERIVADA,
} = await import('../respuestaAutomaticaWhatsapp.js');

// Las advertencias del backend se juntan acá en vez de ensuciar la salida.
const avisarDeVerdad = console.warn;
const errarDeVerdad = console.error;
let anotados = [];
console.warn = (...partes) => anotados.push(partes.join(' '));
console.error = (...partes) => anotados.push(partes.join(' '));

after(() => {
  console.warn = avisarDeVerdad;
  console.error = errarDeVerdad;
  baseFalsa.close();
});

/** Una respuesta del banco, con lo que la prueba quiera cambiarle. Datos inventados. */
function respuestaPreparada(cambios = {}) {
  return {
    id: '44444444-4444-4444-4444-444444444444',
    nombre_interno: 'horario de atencion',
    terminos: ['horario', 'horarios'],
    i18n: {
      'es-AR': 'La oficina atiende de lunes a viernes de 9 a 17.',
      en: 'The office is open Monday to Friday, 9 to 17.',
      'pt-BR': 'O escritório atende de segunda a sexta, das 9 às 17.',
    },
    toca_salud: false,
    aprobada_at: '2026-09-01T10:00:00.000Z',
    activa: true,
    ...cambios,
  };
}

/** La base con la lista de palabras cargada, una Prestadora en Argentina y el banco vacío. */
beforeEach(() => {
  llamadas = [];
  anotados = [];
  respuestas.clear();
  respuestas.set('GET /rest/v1/terminos_de_salud_y_emergencia', () => [
    { termino: 'dolor', motivo: 'salud' },
    { termino: 'fiebre', motivo: 'salud' },
    { termino: 'presion', motivo: 'salud' },
    { termino: 'pain', motivo: 'salud' },
    { termino: 'no respira', motivo: 'emergencia' },
    { termino: 'se cayo', motivo: 'emergencia' },
  ]);
  respuestas.set('GET /rest/v1/terminos_para_pedir_una_persona', () => [
    { termino: 'hablar con una persona' },
    { termino: 'atendente' },
  ]);
  respuestas.set('GET /rest/v1/prestadoras', () => [{ pais: 'AR' }]);
  respuestas.set('GET /rest/v1/respuestas_preparadas_whatsapp', () => []);
  respuestas.set('GET /rest/v1/telefonos_de_emergencia', () => []);
  respuestas.set('POST /rest/v1/auditoria_respuesta_automatica_whatsapp', () => []);
});

describe('sin una respuesta aprobada que corresponda, no contesta', () => {
  it('con el banco vacío deriva a una persona y no devuelve ningún texto', async () => {
    const resultado = await resolverRespuestaAutomatica({
      prestadoraId: PRESTADORA,
      texto: 'Buenas, quería consultar por los horarios.',
    });

    assert.equal(resultado.accion, 'derivar');
    assert.equal(resultado.motivo, MOTIVO_SIN_RESPUESTA_APROBADA);
    assert.equal(resultado.texto, null);
    assert.equal(resultado.respuesta, null);
  });

  it('una respuesta sin aprobar ni siquiera se trae de la base', async () => {
    // Acá está la mitad de la regla: el filtro de la aprobación va en la consulta, así que un
    // texto sin aprobar no llega nunca hasta la elección. Si el filtro se sacara, esta prueba
    // se pone en rojo aunque el resto del camino siga igual.
    await resolverRespuestaAutomatica({ prestadoraId: PRESTADORA, texto: 'consulto horarios' });

    const consulta = llamadas.find((l) => l.clave === 'GET /rest/v1/respuestas_preparadas_whatsapp');
    assert.ok(consulta, 'el banco tiene que consultarse');
    assert.ok(consulta.url.includes('aprobada_at=not.is.null'), consulta.url);
    assert.ok(consulta.url.includes('activa=eq.true'), consulta.url);
    assert.ok(consulta.url.includes(`prestadora_id=eq.${PRESTADORA}`), consulta.url);
  });

  it('con una respuesta aprobada cuyas palabras no aparecen, tampoco contesta', async () => {
    respuestas.set('GET /rest/v1/respuestas_preparadas_whatsapp', () => [respuestaPreparada()]);

    const resultado = await resolverRespuestaAutomatica({
      prestadoraId: PRESTADORA,
      texto: 'Quería avisar que mañana no estamos en casa.',
    });

    assert.equal(resultado.accion, 'derivar');
    assert.equal(resultado.motivo, MOTIVO_SIN_RESPUESTA_APROBADA);
  });

  it('sin el texto en el idioma que corresponde no se improvisa ninguno', async () => {
    respuestas.set('GET /rest/v1/respuestas_preparadas_whatsapp', () => [
      respuestaPreparada({ i18n: { 'es-AR': '   ', en: '', 'pt-BR': '' } }),
    ]);

    const resultado = await resolverRespuestaAutomatica({
      prestadoraId: PRESTADORA,
      texto: 'consulto por los horarios',
    });

    assert.equal(resultado.accion, 'derivar');
    assert.equal(resultado.motivo, MOTIVO_SIN_RESPUESTA_APROBADA);
  });

  it('si el banco no se puede leer, deriva; no da por hecho que esté vacío', async () => {
    respuestas.delete('GET /rest/v1/respuestas_preparadas_whatsapp');

    const resultado = await resolverRespuestaAutomatica({
      prestadoraId: PRESTADORA,
      texto: 'consulto por los horarios',
    });

    assert.equal(resultado.accion, 'derivar');
    assert.equal(resultado.motivo, MOTIVO_NO_SE_PUDO_CLASIFICAR);
  });
});

describe('el bot ayuda, no se queda con la conversación', () => {
  it('quien pide hablar con una persona la tiene, aunque haya una respuesta aprobada que sirva', async () => {
    respuestas.set('GET /rest/v1/respuestas_preparadas_whatsapp', () => [respuestaPreparada()]);

    const resultado = await resolverRespuestaAutomatica({
      prestadoraId: PRESTADORA,
      texto: 'Consulto los horarios, pero quiero hablar con una persona.',
    });

    assert.equal(resultado.accion, 'derivar');
    assert.equal(resultado.motivo, MOTIVO_PIDIO_UNA_PERSONA);
    assert.equal(resultado.texto, null);
  });

  it('el pedido se reconoce en cualquiera de los tres idiomas', async () => {
    const resultado = await resolverRespuestaAutomatica({
      prestadoraId: PRESTADORA,
      texto: 'Quero falar com um ATENDENTE.',
    });

    assert.equal(resultado.motivo, MOTIVO_PIDIO_UNA_PERSONA);
  });

  it('si esa lista no se puede leer, no se contesta nada', async () => {
    respuestas.delete('GET /rest/v1/terminos_para_pedir_una_persona');
    respuestas.set('GET /rest/v1/respuestas_preparadas_whatsapp', () => [respuestaPreparada()]);

    const resultado = await resolverRespuestaAutomatica({ prestadoraId: PRESTADORA, texto: 'consulto horarios' });

    assert.equal(resultado.accion, 'derivar');
    assert.equal(resultado.motivo, MOTIVO_NO_SE_PUDO_CLASIFICAR);
  });

  it('con la conversación esperando a una persona no contesta, y el banco ni se consulta', async () => {
    respuestas.set('GET /rest/v1/respuestas_preparadas_whatsapp', () => [respuestaPreparada()]);

    const resultado = await resolverRespuestaAutomatica({
      prestadoraId: PRESTADORA,
      texto: 'consulto horarios',
      laAtiendeUnaPersona: true,
    });

    assert.equal(resultado.accion, 'derivar');
    assert.equal(resultado.motivo, MOTIVO_LA_ATIENDE_UNA_PERSONA);
    assert.equal(llamadas.some((l) => l.clave === 'GET /rest/v1/respuestas_preparadas_whatsapp'), false);
  });

  it('sin saber si la atiende una persona, tampoco contesta', async () => {
    respuestas.set('GET /rest/v1/respuestas_preparadas_whatsapp', () => [respuestaPreparada()]);

    const resultado = await resolverRespuestaAutomatica({
      prestadoraId: PRESTADORA,
      texto: 'consulto horarios',
      laAtiendeUnaPersona: null,
    });

    assert.equal(resultado.motivo, MOTIVO_LA_ATIENDE_UNA_PERSONA);
  });

  it('la emergencia se sigue avisando aunque la conversación ya espere a una persona', async () => {
    const resultado = await resolverRespuestaAutomatica({
      prestadoraId: PRESTADORA,
      texto: 'se cayo y no respira',
      laAtiendeUnaPersona: true,
    });

    assert.equal(resultado.accion, 'emergencia');
  });

  it('nadie la atiende y hay respuesta aprobada: contesta', async () => {
    // La contracara: sin esta, las de arriba pasarían igual con un bot que no contesta nunca.
    respuestas.set('GET /rest/v1/respuestas_preparadas_whatsapp', () => [respuestaPreparada()]);

    const resultado = await resolverRespuestaAutomatica({
      prestadoraId: PRESTADORA,
      texto: 'consulto horarios',
      laAtiendeUnaPersona: false,
    });

    assert.equal(resultado.accion, 'responder');
  });
});

describe('lo clínico se deriva siempre a una persona', () => {
  it('aunque haya una respuesta aprobada que coincida palabra por palabra', async () => {
    // La respuesta preparada habla de horarios y el mensaje también, así que sin el corte por
    // salud saldría sola. Lleva además una palabra de salud: eso manda.
    respuestas.set('GET /rest/v1/respuestas_preparadas_whatsapp', () => [respuestaPreparada()]);

    const resultado = await resolverRespuestaAutomatica({
      prestadoraId: PRESTADORA,
      texto: 'Consulto por los horarios, y aparte tiene fiebre desde anoche.',
    });

    assert.equal(resultado.accion, 'derivar');
    assert.equal(resultado.motivo, MOTIVO_TEMA_DE_SALUD);
    assert.equal(resultado.texto, null);
  });

  it('el banco ni se consulta cuando el mensaje toca la salud', async () => {
    respuestas.set('GET /rest/v1/respuestas_preparadas_whatsapp', () => [respuestaPreparada()]);

    await resolverRespuestaAutomatica({ prestadoraId: PRESTADORA, texto: 'tiene mucho dolor' });

    assert.equal(
      llamadas.some((l) => l.clave === 'GET /rest/v1/respuestas_preparadas_whatsapp'),
      false,
    );
  });

  it('la palabra de salud se reconoce escrita con acento y en mayúsculas', async () => {
    const resultado = await resolverRespuestaAutomatica({
      prestadoraId: PRESTADORA,
      texto: 'Le subió la PRESIÓN.',
    });

    assert.equal(resultado.motivo, MOTIVO_TEMA_DE_SALUD);
  });

  it('en cualquiera de los tres idiomas, porque quien escribe no elige idioma', async () => {
    const resultado = await resolverRespuestaAutomatica({
      prestadoraId: PRESTADORA,
      texto: 'she says she has pain in her leg',
    });

    assert.equal(resultado.motivo, MOTIVO_TEMA_DE_SALUD);
  });

  it('una respuesta marcada como que toca la salud no se usa ni estando aprobada', async () => {
    // La base ya no deja aprobarla; esta es la segunda red, adentro del backend.
    respuestas.set('GET /rest/v1/respuestas_preparadas_whatsapp', () => [
      respuestaPreparada({ toca_salud: true }),
    ]);

    const resultado = await resolverRespuestaAutomatica({
      prestadoraId: PRESTADORA,
      texto: 'consulto por los horarios',
    });

    assert.equal(resultado.accion, 'derivar');
    assert.equal(resultado.motivo, MOTIVO_SIN_RESPUESTA_APROBADA);
  });

  it('si la lista de palabras no se puede leer, no se contesta nada', async () => {
    respuestas.delete('GET /rest/v1/terminos_de_salud_y_emergencia');
    respuestas.set('GET /rest/v1/respuestas_preparadas_whatsapp', () => [respuestaPreparada()]);

    const resultado = await resolverRespuestaAutomatica({
      prestadoraId: PRESTADORA,
      texto: 'consulto por los horarios',
    });

    assert.equal(resultado.accion, 'derivar');
    assert.equal(resultado.motivo, MOTIVO_NO_SE_PUDO_CLASIFICAR);
  });

  it('con la lista vacía tampoco se da por hecho que nada sea de salud', async () => {
    respuestas.set('GET /rest/v1/terminos_de_salud_y_emergencia', () => []);

    const resultado = await resolverRespuestaAutomatica({
      prestadoraId: PRESTADORA,
      texto: 'consulto por los horarios',
    });

    assert.equal(resultado.motivo, MOTIVO_NO_SE_PUDO_CLASIFICAR);
  });
});

describe('con una respuesta aprobada que corresponde', () => {
  beforeEach(() => {
    respuestas.set('GET /rest/v1/respuestas_preparadas_whatsapp', () => [respuestaPreparada()]);
  });

  it('sale el texto aprobado, letra por letra', async () => {
    const resultado = await resolverRespuestaAutomatica({
      prestadoraId: PRESTADORA,
      texto: 'Hola, ¿cuáles son los horarios?',
    });

    assert.equal(resultado.accion, 'responder');
    assert.equal(resultado.motivo, MOTIVO_RESPUESTA_APROBADA);
    assert.equal(resultado.texto, respuestaPreparada().i18n['es-AR']);
    assert.equal(resultado.respuesta.id, respuestaPreparada().id);
  });

  it('en el idioma que se le pida, sin traducir nada', async () => {
    const resultado = await resolverRespuestaAutomatica({
      prestadoraId: PRESTADORA,
      texto: 'what are the horarios',
      idioma: 'pt-BR',
    });

    assert.equal(resultado.texto, respuestaPreparada().i18n['pt-BR']);
  });

  it('una palabra que aparece adentro de otra no cuenta', async () => {
    // «horario» está adentro de «antihorario», y eso no es una consulta por los horarios.
    const resultado = await resolverRespuestaAutomatica({
      prestadoraId: PRESTADORA,
      texto: 'gira en sentido antihorario',
    });

    assert.equal(resultado.accion, 'derivar');
  });

  it('un mensaje sin ninguna palabra que comparar no se contesta solo', async () => {
    const resultado = await resolverRespuestaAutomatica({ prestadoraId: PRESTADORA, texto: '   ' });

    assert.equal(resultado.accion, 'derivar');
    assert.equal(resultado.motivo, MOTIVO_SIN_RESPUESTA_APROBADA);
    // Ni siquiera se sale a preguntarle nada a la base.
    assert.equal(llamadas.length, 0);
  });
});

describe('la emergencia', () => {
  it('se reconoce y no la contesta ninguna respuesta preparada', async () => {
    respuestas.set('GET /rest/v1/respuestas_preparadas_whatsapp', () => [respuestaPreparada()]);

    const resultado = await resolverRespuestaAutomatica({
      prestadoraId: PRESTADORA,
      texto: 'Vengan, no respira, los horarios no importan.',
    });

    assert.equal(resultado.accion, 'emergencia');
    assert.equal(resultado.motivo, MOTIVO_EMERGENCIA);
    assert.equal(resultado.texto, null);
  });

  it('el número sale de la jurisdicción configurada de la Prestadora', async () => {
    respuestas.set('GET /rest/v1/telefonos_de_emergencia', () => [{ telefono: '911' }]);

    const derivacion = await avisarAlServicioDeEmergencias({ prestadoraId: PRESTADORA });

    assert.equal(derivacion.telefono, '911');
    assert.equal(derivacion.motivo, MOTIVO_EMERGENCIA);
    const consulta = llamadas.find((l) => l.clave === 'GET /rest/v1/telefonos_de_emergencia');
    assert.ok(consulta.url.includes('jurisdiccion=eq.AR'), consulta.url);
  });

  it('sin número configurado no se inventa ninguno, y queda dicho el motivo', async () => {
    const derivacion = await avisarAlServicioDeEmergencias({ prestadoraId: PRESTADORA });

    assert.equal(derivacion.telefono, null);
    assert.equal(derivacion.motivo, MOTIVO_SIN_TELEFONO_DE_EMERGENCIA);
  });
});

describe('lo que queda registrado', () => {
  it('lleva identificadores y motivo, y ningún contenido', async () => {
    await registrarRespuestaAutomatica({
      prestadoraId: PRESTADORA,
      conversacionId: '55555555-5555-5555-5555-555555555555',
      mensajeEntranteId: '66666666-6666-6666-6666-666666666666',
      resultado: RESULTADO_DERIVADA,
      motivo: MOTIVO_TEMA_DE_SALUD,
    });

    const anotacion = llamadas.find(
      (l) => l.clave === 'POST /rest/v1/auditoria_respuesta_automatica_whatsapp',
    );
    assert.equal(anotacion.cuerpo.prestadora_id, PRESTADORA);
    assert.equal(anotacion.cuerpo.resultado, RESULTADO_DERIVADA);
    assert.equal(anotacion.cuerpo.motivo, MOTIVO_TEMA_DE_SALUD);

    // Lo que no puede estar: nada que se parezca a un texto ni a un teléfono.
    const escrito = JSON.stringify(anotacion.cuerpo);
    for (const prohibido of ['texto', 'mensaje_texto', 'telefono', 'contenido', 'cuerpo']) {
      assert.equal(escrito.includes(`"${prohibido}"`), false, `no puede ir ${prohibido}`);
    }
  });

  it('sin resultado o sin motivo no se anota nada a medias', async () => {
    await registrarRespuestaAutomatica({ prestadoraId: PRESTADORA, resultado: RESULTADO_DERIVADA });

    assert.equal(llamadas.length, 0);
  });
});

describe('el texto que se compara', () => {
  it('queda con un espacio en cada punta para poder buscar la palabra entera', () => {
    assert.equal(textoComparable('Hola'), ' hola ');
  });

  it('un texto sin letras ni números queda vacío', () => {
    assert.equal(textoComparable('¿¡...!?'), '');
  });

  it('las dos palabras de un término siguen separadas por un espacio', () => {
    assert.equal(textoComparable('No  Respira!'), ' no respira ');
  });
});

describe('con qué credencial', () => {
  /** Cada pedido a la base fue con la credencial del trabajo de la Prestadora del mensaje. */
  function todasDentroDeLaPrestadora() {
    assert.ok(llamadas.length > 0, 'tendría que haber consultado la base');
    for (const llamada of llamadas) {
      assert.equal(llamada.credencial?.role, 'trabajo_sin_persona', `${llamada.clave} fue con otra credencial`);
      assert.equal(llamada.credencial.prestadora_id, PRESTADORA, `${llamada.clave} fue fuera de la Prestadora`);
    }
  }

  it('contestar lee la lista, el banco y el idioma adentro de la Prestadora', async () => {
    respuestas.set('GET /rest/v1/respuestas_preparadas_whatsapp', () => [respuestaPreparada()]);

    const resultado = await resolverRespuestaAutomatica({ prestadoraId: PRESTADORA, texto: 'consulto horarios' });

    assert.equal(resultado.motivo, MOTIVO_RESPUESTA_APROBADA);
    const consultadas = llamadas.map((l) => l.clave);
    for (const clave of [
      'GET /rest/v1/terminos_de_salud_y_emergencia',
      'GET /rest/v1/respuestas_preparadas_whatsapp',
      'GET /rest/v1/prestadoras',
    ]) {
      assert.ok(consultadas.includes(clave), `tendría que haber pedido ${clave}`);
    }
    todasDentroDeLaPrestadora();
  });

  it('el teléfono de emergencias y el registro, también', async () => {
    respuestas.set('GET /rest/v1/telefonos_de_emergencia', () => [{ telefono: '911' }]);

    await avisarAlServicioDeEmergencias({ prestadoraId: PRESTADORA });
    await registrarRespuestaAutomatica({
      prestadoraId: PRESTADORA,
      resultado: RESULTADO_DERIVADA,
      motivo: MOTIVO_EMERGENCIA,
    });

    assert.ok(llamadas.some((l) => l.clave === 'POST /rest/v1/auditoria_respuesta_automatica_whatsapp'));
    todasDentroDeLaPrestadora();
  });

  it('sin Prestadora no se lee nada y no se contesta', async () => {
    const resultado = await resolverRespuestaAutomatica({ prestadoraId: null, texto: 'consulto horarios' });

    assert.equal(resultado.accion, 'derivar');
    assert.equal(resultado.motivo, MOTIVO_NO_SE_PUDO_CLASIFICAR);
    assert.equal(llamadas.length, 0);
  });
});
