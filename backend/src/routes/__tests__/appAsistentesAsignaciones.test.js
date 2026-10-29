/**
 * `/api/app-asistentes/asignaciones` — los turnos que se le asignaron al Asistente y su respuesta.
 *
 *   npm test --prefix backend
 *
 * POR QUÉ EXISTE ESTA PRUEBA. Todo va con la credencial del Asistente: la lista y la aceptación
 * pasan por funciones de la base que resuelven la Prestadora y el Asistente con la sesión, y el
 * rechazo por `resolver`. Si algo volviera a la llave maestra, el aislamiento dependería otra vez
 * de un filtro escrito a mano.
 *
 * Qué daría con el sistema roto: la prueba arranca sin la llave maestra, así que una ruta que la
 * usara fallaría al pedirla; si la lista o la aceptación dejaran de pasar por su función, falla la
 * comprobación de qué se llamó. La base de mentira no aplica políticas: qué ve cada Asistente lo
 * prueba la base, no esta prueba.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { olvidarPedidos } from '../../middleware/topeDePedidos.js';
import { sesionDePrueba } from '../../__tests__/sesionDePrueba.js';
import { prepararCredencialDePrueba } from '../../__tests__/credencialDePrueba.js';

const PRESTADORA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USUARIO = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const LEGAJO = 'bbbbbbbb-bbbb-bbbb-bbbb-b0000000000b';
const GUARDIA = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const MOTIVO = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

/** Qué contesta la base a cada `MÉTODO /ruta`. Lo que no se preparó contesta vacío. */
const respuestas = new Map();
/** Todo lo que el backend le pidió a la base, con la dirección entera, la credencial y el cuerpo. */
let llamadas = [];

const baseFalsa = createServer((req, res) => {
  let cuerpo = '';
  req.on('data', (parte) => (cuerpo += parte));
  req.on('end', () => {
    const ruta = new URL(req.url, 'http://interno').pathname;
    const clave = `${req.method} ${ruta}`;
    llamadas.push({ clave, url: decodeURIComponent(req.url), credencial: req.headers.authorization, cuerpo });

    const preparada = respuestas.get(clave);
    const valor = typeof preparada === 'function' ? preparada({ url: req.url }) : preparada ?? [];
    // Lo que la base levanta con RAISE EXCEPTION llega así: un 400 con el texto en `message`.
    if (valor?.falla) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code: 'P0001', message: valor.falla }));
      return;
    }
    const unoSolo = (req.headers.accept || '').includes('vnd.pgrst.object+json');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(unoSolo && Array.isArray(valor) ? valor[0] ?? null : valor));
  });
});

await new Promise((listo) => baseFalsa.listen(0, '127.0.0.1', listo));
process.env.SUPABASE_URL = `http://127.0.0.1:${baseFalsa.address().port}`;
const SESION = sesionDePrueba(USUARIO);
prepararCredencialDePrueba();

const { default: express } = await import('express');
await import('express-async-errors');
const { appAsistentesAsignacionesRouter } = await import('../appAsistentesAsignaciones.js');

const app = express();
app.use(express.json());
app.use('/api/app-asistentes/asignaciones', appAsistentesAsignacionesRouter);
const backend = app.listen(0, '127.0.0.1');
await new Promise((listo) => backend.on('listening', listo));
const DIRECCION = `http://127.0.0.1:${backend.address().port}/api/app-asistentes/asignaciones`;

after(() => {
  backend.close();
  baseFalsa.close();
});

async function pedir(camino = '', cuerpo) {
  const respuesta = await fetch(DIRECCION + camino, {
    method: cuerpo ? 'POST' : 'GET',
    headers: { Authorization: SESION, 'Content-Type': 'application/json' },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  return { estado: respuesta.status, cuerpo: await respuesta.json() };
}

// Lo que devuelve `turnos_asignados_sin_responder`: datos inventados.
const TURNO = {
  asignacion_id: 'asignacion-1', asignado_at: '2026-09-01T10:00:00Z', guardia_id: GUARDIA,
  fecha: '2099-01-01', hora_inicio: '08:00', hora_fin: '16:00', dias_hasta_el_fin: 0,
  modalidad: null, barrios: ['Barrio Inventado'], niveles_de_complejidad: ['II'],
  distancia_m: 1112,
  tareas: [{ id: 'tarea-1', prestadora_id: null, clave: 'tarea_inventada', texto: 'Tarea inventada', descripcion: null }],
};

beforeEach(() => {
  llamadas = [];
  respuestas.clear();
  olvidarPedidos();
  delete process.env.TOPE_PEDIDOS_POR_MINUTO;

  respuestas.set('GET /auth/v1/user', () => ({ id: USUARIO, aud: 'authenticated' }));
  respuestas.set('GET /rest/v1/usuarios', () => [{ rol: 'asistente', prestadora_id: PRESTADORA }]);
  respuestas.set('GET /rest/v1/asistentes', () => [{ id: LEGAJO, prestadora_id: PRESTADORA }]);
  respuestas.set('POST /rest/v1/rpc/turnos_asignados_sin_responder', () => [TURNO]);
  respuestas.set('POST /rest/v1/rpc/aceptar_asignacion', () => GUARDIA);
  respuestas.set('GET /rest/v1/asignaciones_de_turno', () => [{ id: 'asignacion-1', estado: 'sin_responder' }]);
  respuestas.set('GET /rest/v1/motivos_resolucion', () => [
    { id: MOTIVO, nombre_es_ar: 'Problema de salud', nombre_en: 'Health problem', nombre_pt_br: 'Problema de saúde', pide_detalle: false, orden: 10 },
  ]);
  respuestas.set('POST /rest/v1/rpc/resolver', () => ({ id: 'resolucion-1' }));
});

describe('la lista de asignaciones sin responder', () => {
  it('sale de la función de la base, con la credencial del Asistente', async () => {
    const { estado, cuerpo } = await pedir();
    assert.equal(estado, 200);
    const lecturas = llamadas.filter((l) => l.clave === 'POST /rest/v1/rpc/turnos_asignados_sin_responder');
    assert.equal(lecturas.length, 1);
    assert.equal(lecturas[0].credencial, SESION, 'la lista no fue con la sesión del Asistente');
    assert.equal(llamadas.filter((l) => l.clave === 'GET /rest/v1/guardias').length, 0, 'leyó el turno entero');
    assert.equal(cuerpo.asignaciones.length, 1);
    assert.equal(cuerpo.asignaciones[0].id, 'asignacion-1');
  });

  it('del turno muestra día, horario, barrio, complejidad, distancia y tareas, y nada del Paciente', async () => {
    const { cuerpo } = await pedir();
    const { guardia } = cuerpo.asignaciones[0];
    assert.equal(guardia.id, GUARDIA);
    assert.equal(guardia.fecha, '2099-01-01');
    assert.deepEqual(guardia.barrios, ['Barrio Inventado']);
    assert.deepEqual(guardia.niveles_de_complejidad, ['II']);
    assert.equal(guardia.distancia_m, 1112);
    assert.deepEqual(guardia.tareas.map((t) => t.id), ['tarea-1']);
    assert.equal(guardia.pacientes, undefined);
    assert.equal(guardia.paciente_id, undefined);
  });

  it('trae la lista de motivos de rechazo de la Prestadora, con la credencial del Asistente', async () => {
    const { cuerpo } = await pedir();
    const lecturas = llamadas.filter((l) => l.clave === 'GET /rest/v1/motivos_resolucion');
    assert.equal(lecturas.length, 1);
    assert.equal(lecturas[0].credencial, SESION);
    assert.ok(lecturas[0].url.includes('tabla=eq.asignaciones_de_turno'));
    assert.equal(cuerpo.motivos[0].id, MOTIVO);
  });

  it('quien no es Asistente no entra, aunque tenga sesión', async () => {
    respuestas.set('GET /rest/v1/usuarios', () => [{ rol: 'coordinador', prestadora_id: PRESTADORA }]);
    const { estado } = await pedir();
    assert.equal(estado, 403);
  });
});

describe('rechazar', () => {
  it('pasa por `resolver` con la credencial del Asistente y el motivo elegido', async () => {
    const { estado } = await pedir('/asignacion-1/responder', { respuesta: 'rechaza', motivoId: MOTIVO });
    assert.equal(estado, 200);
    const resoluciones = llamadas.filter((l) => l.clave === 'POST /rest/v1/rpc/resolver');
    assert.equal(resoluciones.length, 1);
    assert.equal(resoluciones[0].credencial, SESION, 'el rechazo no fue con la sesión del Asistente');
    const enviado = JSON.parse(resoluciones[0].cuerpo);
    assert.equal(enviado.p_tabla, 'asignaciones_de_turno');
    assert.equal(enviado.p_fila_id, 'asignacion-1');
    assert.equal(enviado.p_motivo_id, MOTIVO);
  });

  it('sin motivo no se rechaza', async () => {
    const { estado, cuerpo } = await pedir('/asignacion-1/responder', { respuesta: 'rechaza' });
    assert.equal(estado, 400);
    assert.equal(cuerpo.motivo, 'motivo_requerido');
    assert.equal(llamadas.filter((l) => l.clave === 'POST /rest/v1/rpc/resolver').length, 0);
  });

  it('una asignación ya respondida no se vuelve a responder', async () => {
    respuestas.set('GET /rest/v1/asignaciones_de_turno', () => [{ id: 'asignacion-1', estado: 'rechazada' }]);
    const { estado, cuerpo } = await pedir('/asignacion-1/responder', { respuesta: 'rechaza', motivoId: MOTIVO });
    assert.equal(estado, 409);
    assert.equal(cuerpo.motivo, 'asignacion_ya_respondida');
  });
});

describe('aceptar', () => {
  it('pasa por `aceptar_asignacion` con la credencial del Asistente, en un solo paso', async () => {
    const { estado, cuerpo } = await pedir('/asignacion-1/responder', { respuesta: 'acepta' });
    assert.equal(estado, 200);
    assert.equal(cuerpo.guardiaId, GUARDIA);
    const aceptaciones = llamadas.filter((l) => l.clave === 'POST /rest/v1/rpc/aceptar_asignacion');
    assert.equal(aceptaciones.length, 1);
    assert.equal(aceptaciones[0].credencial, SESION, 'aceptar no fue con la sesión del Asistente');
    assert.equal(JSON.parse(aceptaciones[0].cuerpo).p_asignacion_id, 'asignacion-1');
    assert.equal(llamadas.filter((l) => l.clave.startsWith('PATCH ')).length, 0, 'escribió por fuera de la función');
  });

  for (const [falla, estadoEsperado, motivo] of [
    ['asignacion_no_encontrada', 404, 'asignacion_no_encontrada'],
    ['asignacion_ya_respondida', 409, 'asignacion_ya_respondida'],
    ['guardia_ya_cubierta', 409, 'guardia_ya_cubierta'],
  ]) {
    it(`si la base dice «${falla}», contesta ${motivo} y no deja salir el texto de la base`, async () => {
      respuestas.set('POST /rest/v1/rpc/aceptar_asignacion', () => ({ falla }));
      const { estado, cuerpo } = await pedir('/asignacion-1/responder', { respuesta: 'acepta' });
      assert.equal(estado, estadoEsperado);
      assert.deepEqual(cuerpo, { error: motivo, motivo });
    });
  }

  it('si lo frenan documentos pendientes, contesta 409 con cuáles y sin el texto de la base', async () => {
    respuestas.set('POST /rest/v1/rpc/aceptar_asignacion', () => ({
      falla: 'documentos_bloquean:Seguro de mala praxis, Antecedentes penales: tabla interna',
    }));
    const { estado, cuerpo } = await pedir('/asignacion-1/responder', { respuesta: 'acepta' });
    assert.equal(estado, 409);
    assert.deepEqual(cuerpo, {
      error: 'documentos_bloquean',
      motivo: 'documentos_bloquean',
      documentos: ['Seguro de mala praxis', 'Antecedentes penales'],
    });
  });
});

// El aviso al Coordinador y al Cliente se arma con el trabajo de la Prestadora, porque nombra al
// Asistente anterior, que quien acepta no ve. Lo que se mira es que el aviso se arme —que pida el
// nombre del anterior con una credencial que no es la del Asistente— sin que la aceptación falle.
describe('al aceptar un turno que era de otro Asistente', () => {
  const ANTERIOR = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  const conAnterior = (anterior) => () => [{
    asistente_id: LEGAJO,
    asistente_anterior_id: anterior,
    guardias: { id: GUARDIA, prestadora_id: PRESTADORA, paciente_id: null, fecha: '2099-01-01', hora_inicio: '08:00', hora_fin: '16:00', dias_hasta_el_fin: 0 },
  }];

  /** Acepta y dice si el aviso del reemplazo llegó a armarse. */
  async function aceptarMirandoElRegistro() {
    const respuesta = await pedir('/asignacion-1/responder', { respuesta: 'acepta' });
    const intentoAvisar = llamadas.some((l) =>
      l.clave === 'GET /rest/v1/asistentes' && l.credencial !== SESION && l.url.includes(`id=eq.${ANTERIOR}`));
    return { ...respuesta, intentoAvisar };
  }

  it('recién al aceptar se intenta avisar el reemplazo, y la aceptación queda hecha igual', async () => {
    respuestas.set('GET /rest/v1/asignaciones_de_turno', conAnterior(ANTERIOR));
    const { estado, cuerpo, intentoAvisar } = await aceptarMirandoElRegistro();
    assert.equal(estado, 200);
    assert.equal(cuerpo.respuesta, 'acepta');
    assert.ok(intentoAvisar, 'no se intentó avisar el reemplazo');
    const lectura = llamadas.find((l) => l.clave === 'GET /rest/v1/asignaciones_de_turno');
    assert.equal(lectura.credencial, SESION, 'la asignación no se leyó con la sesión del Asistente');
  });

  it('sin Asistente anterior no hay reemplazo que avisar', async () => {
    respuestas.set('GET /rest/v1/asignaciones_de_turno', conAnterior(null));
    const { estado, intentoAvisar } = await aceptarMirandoElRegistro();
    assert.equal(estado, 200);
    assert.equal(intentoAvisar, false);
  });

  it('si el turno vuelve al mismo Asistente no hay reemplazo que avisar', async () => {
    respuestas.set('GET /rest/v1/asignaciones_de_turno', conAnterior(LEGAJO));
    const { intentoAvisar } = await aceptarMirandoElRegistro();
    assert.equal(intentoAvisar, false);
  });
});

/** De qué rol y de qué Prestadora es la credencial de una llamada a la base de mentira. */
function quienLlamo(llamada) {
  try {
    return JSON.parse(Buffer.from(llamada.credencial.replace('Bearer ', '').split('.')[1], 'base64url').toString());
  } catch {
    return null;
  }
}

// El turno fijo y el reemplazo se contestan una sola vez. La base devuelve sin turno al aceptarlos,
// porque no son de un día.
describe('el reemplazo durante una ausencia', () => {
  const AUSENCIA = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
  const TITULAR = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

  beforeEach(() => {
    respuestas.set('POST /rest/v1/rpc/aceptar_asignacion', () => null);
    respuestas.set('GET /rest/v1/asignaciones_de_turno', () => [
      { id: 'asignacion-1', estado: 'sin_responder', serie_id: null, ausencia_id: AUSENCIA, asistente_anterior_id: null },
    ]);
  });

  it('la lista lo trae con sus fechas y cuántos turnos son', async () => {
    respuestas.set('POST /rest/v1/rpc/turnos_asignados_sin_responder', () => [{
      ...TURNO, tipo: 'ausencia', guardia_id: null, ausencia_id: AUSENCIA, desde: '2099-11-03', hasta: '2099-11-14', cantidad: 8,
    }]);
    const { cuerpo } = await pedir();
    const [asignacion] = cuerpo.asignaciones;
    assert.equal(asignacion.tipo, 'ausencia');
    assert.equal(asignacion.desde, '2099-11-03');
    assert.equal(asignacion.hasta, '2099-11-14');
    assert.equal(asignacion.cantidad, 8);
  });

  it('al aceptarlo, los turnos del ausente se pasan con el trabajo de su Prestadora', async () => {
    respuestas.set('GET /rest/v1/coberturas_de_ausencia', () => [{
      id: 'cobertura-1', prestadora_id: PRESTADORA, ausencia_id: AUSENCIA, serie_id: null, asistente_sustituto_id: LEGAJO,
      ausencias: { id: AUSENCIA, asistente_id: TITULAR, fecha_inicio: '2099-11-03', fecha_fin: '2099-11-14', fecha_vuelta_real: null },
    }]);
    const { estado, cuerpo } = await pedir('/asignacion-1/responder', { respuesta: 'acepta' });
    assert.equal(estado, 200);
    assert.equal(cuerpo.guardiaId, null);
    const lecturas = llamadas.filter((l) => l.clave === 'GET /rest/v1/coberturas_de_ausencia');
    assert.ok(lecturas.length > 0, 'no se leyeron las coberturas aceptadas');
    for (const lectura of lecturas) {
      assert.equal(quienLlamo(lectura)?.role, 'trabajo_sin_persona', 'las coberturas no se leyeron con el trabajo');
      assert.equal(quienLlamo(lectura)?.prestadora_id, PRESTADORA, 'las coberturas se leyeron fuera de la Prestadora');
      assert.ok(lectura.url.includes(`ausencia_id=eq.${AUSENCIA}`));
      assert.ok(lectura.url.includes('aceptada_at=not.is.null'), 'se aplicaron coberturas sin aceptar');
    }
  });

  it('al rechazarlo, sus coberturas sin aceptar quedan objetadas con el trabajo de su Prestadora', async () => {
    const { estado } = await pedir('/asignacion-1/responder', { respuesta: 'rechaza', motivoId: MOTIVO });
    assert.equal(estado, 200);
    const marcas = llamadas.filter((l) => l.clave === 'PATCH /rest/v1/coberturas_de_ausencia');
    assert.equal(marcas.length, 1, 'las coberturas no quedaron objetadas');
    assert.equal(quienLlamo(marcas[0])?.role, 'trabajo_sin_persona');
    assert.equal(quienLlamo(marcas[0])?.prestadora_id, PRESTADORA);
    assert.ok(marcas[0].url.includes(`ausencia_id=eq.${AUSENCIA}`));
    assert.ok(marcas[0].url.includes(`asistente_sustituto_id=eq.${LEGAJO}`));
    assert.ok(marcas[0].url.includes('aceptada_at=is.null'), 'objetó coberturas ya aceptadas');
    assert.ok(JSON.parse(marcas[0].cuerpo).objetada_at);
  });

  it('el rechazo de un turno de un día no toca ninguna cobertura', async () => {
    respuestas.set('GET /rest/v1/asignaciones_de_turno', () => [{ id: 'asignacion-1', estado: 'sin_responder', ausencia_id: null }]);
    await pedir('/asignacion-1/responder', { respuesta: 'rechaza', motivoId: MOTIVO });
    assert.equal(llamadas.filter((l) => l.clave === 'PATCH /rest/v1/coberturas_de_ausencia').length, 0);
  });
});

describe('el turno fijo', () => {
  it('la lista lo trae con sus días de la semana', async () => {
    respuestas.set('POST /rest/v1/rpc/turnos_asignados_sin_responder', () => [{
      ...TURNO, tipo: 'serie', guardia_id: null, serie_id: 'serie-1', dias_semana: ['lunes', 'miercoles'],
    }]);
    const { cuerpo } = await pedir();
    assert.equal(cuerpo.asignaciones[0].tipo, 'serie');
    assert.deepEqual(cuerpo.asignaciones[0].dias_semana, ['lunes', 'miercoles']);
  });

  it('al aceptarlo no se escribe nada con el trabajo: la base ya lo puso a su nombre', async () => {
    respuestas.set('POST /rest/v1/rpc/aceptar_asignacion', () => null);
    respuestas.set('GET /rest/v1/asignaciones_de_turno', () => [{ serie_id: 'serie-1', ausencia_id: null, asistente_anterior_id: null }]);
    const { estado } = await pedir('/asignacion-1/responder', { respuesta: 'acepta' });
    assert.equal(estado, 200);
    assert.equal(llamadas.filter((l) => quienLlamo(l)?.role === 'trabajo_sin_persona').length, 0);
  });
});
