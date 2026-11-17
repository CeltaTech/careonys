// Prueba de la puerta por la que el otro software de creditos y cobranzas avisa una restriccion.
// Se corre con la base local levantada, desde la raiz del producto:
//   node --env-file=backend/.env.local scripts/probar_aviso_de_cobranza.mjs
//
// Las Prestadoras y los Clientes son las de la semilla: datos inventados, nunca de personas
// reales. Lo que la prueba escribe lo borra al terminar.
import crypto from 'node:crypto';
const BACKEND = new URL('../backend/src/', import.meta.url).href;
const { enLaPrestadora } = await import(`${BACKEND}db/connection.js`);
const { USO, guardarSecretoDeTercero } = await import(`${BACKEND}utils/secretosDeTerceros.js`);

// Cada lectura va con el trabajo de la Prestadora que corresponde: no hay conexión que alcance a
// las dos.
const enA = (hacer) => enLaPrestadora(PRESTADORA_A, 'prueba del aviso de cobranza', hacer);
const enB = (hacer) => enLaPrestadora(PRESTADORA_B, 'prueba del aviso de cobranza', hacer);

const PRESTADORA_A = '11111111-1111-4111-8111-111111111111';
const PRESTADORA_B = '22222222-2222-4222-8222-222222222222';
const CLIENTE_DE_A = '40000000-0000-4000-8000-000000000001';
const CLIENTE_DE_B = '50000000-0000-4000-8000-000000000004';
const SECRETO = 'un-secreto-inventado-de-mas-de-treinta-y-dos-letras';


function firmar(cuerpo, secreto, instante = Math.floor(Date.now() / 1000)) {
  const hmac = crypto.createHmac('sha256', secreto).update(`${instante}.${cuerpo}`).digest('hex');
  return `ts=${instante},v1=${hmac}`;
}

let fallas = 0;
function comprobar(nombre, condicion, detalle) {
  if (condicion) {
    console.log(`  ok  ${nombre}`);
  } else {
    fallas += 1;
    console.log(`FALLA ${nombre} — ${detalle}`);
  }
}

async function avisar(prestadoraId, cuerpo, firma) {
  const respuesta = await fetch(`http://localhost:${process.env.PORT || 4000}/api/avisos-de-cobranza/${prestadoraId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-signature': firma },
    body: cuerpo,
  });
  return { estado: respuesta.status, cuerpo: await respuesta.json().catch(() => ({})) };
}

await import(`${BACKEND}server.js`);
await new Promise((r) => setTimeout(r, 2500));

// El secreto se guarda por la misma puerta que usa el Panel: cifrado con la clave de la
// Prestadora A, que tiene que estar en CLAVES_DE_LOS_SECRETOS_DE_TERCEROS. La B no tiene secreto.
await enA((db) => guardarSecretoDeTercero(db, PRESTADORA_A, USO.AVISO_DE_COBRANZA, SECRETO));

const numero = `prueba-${Date.now()}`;
const cuerpo = JSON.stringify({
  cliente_id: CLIENTE_DE_A, restringida: true, motivo: 'Prueba inventada', numero_del_aviso: numero,
});

console.log('1. Un aviso bien firmado entra');
const bueno = await avisar(PRESTADORA_A, cuerpo, firmar(cuerpo, SECRETO));
comprobar('contesta 200', bueno.estado === 200, `contesto ${bueno.estado}`);

const { data: guardado } = await enA((db) => db
  .from('restricciones_de_cobranza')
  .select('id, restringida, origen, numero_del_aviso')
  .eq('numero_del_aviso', numero));
comprobar('queda una sola fila', (guardado || []).length === 1, `quedaron ${(guardado || []).length}`);
comprobar('el origen dice que vino de afuera', guardado?.[0]?.origen === 'software_externo', guardado?.[0]?.origen);

console.log('2. El mismo aviso repetido no suma otra fila');
const repetido = await avisar(PRESTADORA_A, cuerpo, firmar(cuerpo, SECRETO));
comprobar('contesta 200 y avisa que estaba repetido', repetido.estado === 200 && repetido.cuerpo.repetido === true,
  `${repetido.estado} ${JSON.stringify(repetido.cuerpo)}`);
const { data: despues } = await enA((db) => db
  .from('restricciones_de_cobranza').select('id').eq('numero_del_aviso', numero));
comprobar('sigue habiendo una sola fila', (despues || []).length === 1, `quedaron ${(despues || []).length}`);

console.log('3. Un aviso firmado con otro secreto no entra');
const malFirmado = await avisar(PRESTADORA_A, cuerpo, firmar(cuerpo, 'otro-secreto-cualquiera-de-mas-de-treinta-y-dos'));
comprobar('contesta 401', malFirmado.estado === 401, `contesto ${malFirmado.estado}`);

console.log('4. Un aviso sin firma no entra');
const sinFirma = await avisar(PRESTADORA_A, cuerpo, '');
comprobar('contesta 401', sinFirma.estado === 401, `contesto ${sinFirma.estado}`);

console.log('5. Una Prestadora no puede avisar sobre el Cliente de otra');
const ajena = JSON.stringify({ cliente_id: CLIENTE_DE_B, restringida: true, numero_del_aviso: `${numero}-ajena` });
const cruzado = await avisar(PRESTADORA_A, ajena, firmar(ajena, SECRETO));
comprobar('contesta 404', cruzado.estado === 404, `contesto ${cruzado.estado}`);
// Se mira con el trabajo de B, que es quien ve sus propios Clientes.
const { data: nada } = await enB((db) => db
  .from('restricciones_de_cobranza').select('id').eq('cliente_id', CLIENTE_DE_B));
comprobar('no se escribio nada sobre el Cliente ajeno', (nada || []).length === 0, `quedaron ${(nada || []).length}`);

console.log('6. Una Prestadora sin secreto cargado no recibe avisos');
const deB = JSON.stringify({ cliente_id: CLIENTE_DE_B, restringida: true, numero_del_aviso: `${numero}-b` });
const sinSecreto = await avisar(PRESTADORA_B, deB, firmar(deB, SECRETO));
comprobar('contesta 401', sinSecreto.estado === 401, `contesto ${sinSecreto.estado}`);

// Se limpia lo que dejo la prueba.
await enA((db) => db.from('restricciones_de_cobranza').delete().eq('numero_del_aviso', numero));

console.log(fallas === 0 ? '\nTodo bien.' : `\n${fallas} comprobacion(es) fallaron.`);
process.exit(fallas === 0 ? 0 : 1);
