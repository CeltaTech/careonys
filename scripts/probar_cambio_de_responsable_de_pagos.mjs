// ---------------------------------------------------------------------------
// probar_cambio_de_responsable_de_pagos.mjs — ¿la base sigue la regla de a nombre de quién sale la factura?
//
// Uso, desde la raíz del producto, con la base local levantada y sembrada:
//   node scripts/probar_cambio_de_responsable_de_pagos.mjs
//
// Devuelve 0 si la base se comportó como debe y 1 si no.
//
// LA REGLA. La factura sale siempre a nombre del Contratante, salvo que la Prestadora indique,
// para un Servicio puntual, que sale a nombre del Responsable de pagos. Entonces un cambio de
// Responsable de pagos sólo parte la factura, o se rechaza sobre una ya emitida, cuando cambia la
// persona a cuyo nombre sale.
//
// QUÉ PRUEBA, en orden, sobre una misma factura de agosto sin mandar y con una corrección:
//   1. Sin la indicación, cambiar el Responsable de pagos desde el 16 se acepta, y no se borra ni
//      la factura ni su corrección: la factura sigue a nombre del Contratante.
//   2. Con la indicación, el mismo cambio se rechaza, porque la factura pasaría a otro nombre y
//      tiene una corrección. La factura y la corrección siguen estando.
//   3. Sin la corrección, el mismo cambio con la indicación se acepta y la factura se borra para
//      volver a armarse partida. Sin este paso, una base que rechaza todo pasaría el segundo.
//   4. La indicación sin Responsable de pagos se rechaza.
//   5. El Administrador de otra Prestadora no ve los tramos de este Servicio ni lo puede cambiar.
//
// CÓMO ENTRA. Adentro de la base local, con el rol `authenticated` y los datos de sesión de los
// Administradores de las Prestadoras de prueba que siembra `supabase/seed.sql`. Los datos son
// inventados, y todo corre adentro de una transacción que se deshace al final: no deja nada escrito.
// ---------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

// El contenedor sale de `supabase/config.toml`, como en `probar_aislamiento_en_la_base.mjs`.
const CONTENEDOR = process.env.CONTENEDOR_BASE || (() => {
  const toml = readFileSync(join(RAIZ, 'supabase', 'config.toml'), 'utf8');
  const id = toml.match(/^\s*project_id\s*=\s*"([^"]+)"/m);
  if (!id) throw new Error('No encontré project_id en supabase/config.toml.');
  return `supabase_db_${id[1]}`;
})();

// Los de la siembra: la Prestadora de prueba, su Administrador, un Servicio, su Cliente y una
// persona; y el Administrador de la otra Prestadora.
const PRESTADORA = '11111111-1111-4111-8111-111111111111';
const ADMINISTRADOR = '20000000-0000-4000-8000-000000000002';
const SERVICIO = '60000000-0000-4000-8000-000000000002';
const CLIENTE = '40000000-0000-4000-8000-000000000002';
const PERSONA = 'c0000000-0000-4000-8000-000000000001';
const ADMINISTRADOR_DE_LA_OTRA = '50000000-0000-4000-8000-000000000001';

const SQL = `
BEGIN;
DO $prueba$
DECLARE
  v_factura uuid;
  v_sin_indicacion text := 'aceptado';
  v_con_indicacion text := 'aceptado';
  v_sin_correccion text := 'aceptado';
  v_sin_persona text := 'aceptado';
  v_de_la_otra text := 'aceptado';
  v_tramos_de_la_otra int;
  v_tramos_propios int;
  v_paso1 text;
  v_paso2 text;
  v_facturas_al_final int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.servicios WHERE id = '${SERVICIO}' AND prestadora_id = '${PRESTADORA}') THEN
    RAISE EXCEPTION 'La base local no tiene el Servicio de la siembra. Siémbrela con «supabase db reset --local».';
  END IF;

  -- Una factura de agosto sin mandar, con una corrección.
  INSERT INTO public.facturas_cliente (prestadora_id, cliente_id, servicio_id, periodo, periodo_hasta, moneda)
  VALUES ('${PRESTADORA}', '${CLIENTE}', '${SERVICIO}', '2026-08-01', '2026-08-31', 'ARS')
  RETURNING id INTO v_factura;
  INSERT INTO public.correcciones_factura_cliente
    (prestadora_id, factura_id, sentido, monto, comprobante_tipo, comprobante_numero, motivo, moneda)
  VALUES ('${PRESTADORA}', v_factura, 'resta', 100, 'Nota de crédito', '0001-00000001', 'Prueba', 'ARS');

  PERFORM set_config('request.jwt.claims', '{"sub":"${ADMINISTRADOR}","role":"authenticated"}', true);
  PERFORM set_config('request.jwt.claim.sub', '${ADMINISTRADOR}', true);

  -- 1. Sin la indicación: la factura sigue a nombre del Contratante.
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.cambiar_responsable_de_pagos('${SERVICIO}', '${PERSONA}', 'otro', '2026-08-16');
  EXCEPTION WHEN OTHERS THEN
    v_sin_indicacion := SQLERRM;
  END;
  RESET ROLE;
  SELECT (SELECT count(*) FROM public.facturas_cliente WHERE id = v_factura) || '/'
      || (SELECT count(*) FROM public.correcciones_factura_cliente WHERE factura_id = v_factura)
    INTO v_paso1;

  -- 2. Con la indicación: la factura pasaría a otro nombre, y tiene una corrección.
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.cambiar_responsable_de_pagos('${SERVICIO}', '${PERSONA}', 'otro', '2026-08-16', true);
  EXCEPTION WHEN OTHERS THEN
    v_con_indicacion := SQLERRM;
  END;
  RESET ROLE;
  SELECT (SELECT count(*) FROM public.facturas_cliente WHERE id = v_factura) || '/'
      || (SELECT count(*) FROM public.correcciones_factura_cliente WHERE factura_id = v_factura)
    INTO v_paso2;

  -- 3. El mismo cambio, sin la corrección.
  DELETE FROM public.correcciones_factura_cliente WHERE factura_id = v_factura;
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.cambiar_responsable_de_pagos('${SERVICIO}', '${PERSONA}', 'otro', '2026-08-16', true);
  EXCEPTION WHEN OTHERS THEN
    v_sin_correccion := SQLERRM;
  END;
  RESET ROLE;
  SELECT count(*) INTO v_facturas_al_final FROM public.facturas_cliente WHERE id = v_factura;

  -- 4. La indicación sin Responsable de pagos.
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.cambiar_responsable_de_pagos('${SERVICIO}', NULL, NULL, '2026-09-01', true);
  EXCEPTION WHEN OTHERS THEN
    v_sin_persona := SQLERRM;
  END;
  SELECT count(*) INTO v_tramos_propios FROM public.tramos_de_pagador_del_servicio WHERE servicio_id = '${SERVICIO}';
  RESET ROLE;

  -- 5. La otra Prestadora.
  PERFORM set_config('request.jwt.claims', '{"sub":"${ADMINISTRADOR_DE_LA_OTRA}","role":"authenticated"}', true);
  PERFORM set_config('request.jwt.claim.sub', '${ADMINISTRADOR_DE_LA_OTRA}', true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_tramos_de_la_otra FROM public.tramos_de_pagador_del_servicio WHERE servicio_id = '${SERVICIO}';
  BEGIN
    PERFORM public.cambiar_responsable_de_pagos('${SERVICIO}', NULL, NULL, '2026-10-01', false);
  EXCEPTION WHEN OTHERS THEN
    v_de_la_otra := SQLERRM;
  END;
  RESET ROLE;

  RAISE NOTICE '%|%|%|%|%|%|%|%|%|%', v_sin_indicacion, v_paso1, v_con_indicacion, v_paso2,
    v_sin_correccion, v_facturas_al_final, v_sin_persona, v_tramos_propios, v_tramos_de_la_otra, v_de_la_otra;
END
$prueba$;
ROLLBACK;
`;

const r = spawnSync(
  'docker',
  ['exec', '-i', CONTENEDOR, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-qtA'],
  { input: SQL, encoding: 'utf8' },
);
if (r.status !== 0) {
  console.error(`La base local no contestó:\n${r.stderr || r.error?.message}`);
  process.exit(1);
}

const aviso = (r.stderr || '').split('\n').map((l) => l.trim()).find((l) => l.startsWith('NOTICE:'));
if (!aviso) {
  console.error('La prueba no devolvió resultado.');
  process.exit(1);
}
const [
  sinIndicacion, paso1, conIndicacion, paso2, sinCorreccion, facturasAlFinal, sinPersona, tramosPropios,
  tramosDeLaOtra, deLaOtra,
] = aviso.replace(/^NOTICE:\s*/, '').split('|');

const fallas = [];
if (sinIndicacion !== 'aceptado') {
  fallas.push(`Sin la indicación, la factura no cambia de nombre y el cambio se tenía que aceptar. La base contestó: ${sinIndicacion}.`);
}
if (paso1 !== '1/1') fallas.push(`Sin la indicación, la factura y su corrección tenían que seguir estando (1/1) y quedaron ${paso1}.`);
if (conIndicacion !== 'cambio_de_pagador_con_factura_emitida') {
  fallas.push(`Con la indicación y una corrección, la base tenía que rechazar el cambio y contestó: ${conIndicacion}.`);
}
if (paso2 !== '1/1') fallas.push(`Con el cambio rechazado, la factura y su corrección tenían que seguir estando (1/1) y quedaron ${paso2}.`);
if (sinCorreccion !== 'aceptado') {
  fallas.push(`Sin la corrección, la base tenía que aceptar el cambio con la indicación y contestó: ${sinCorreccion}. La prueba no prueba nada.`);
}
if (facturasAlFinal !== '0') {
  fallas.push(`Con la factura pasando a otro nombre, la base tenía que borrarla para armarla partida, y quedaron ${facturasAlFinal}.`);
}
if (sinPersona !== 'dato_invalido') {
  fallas.push(`La indicación sin Responsable de pagos se tenía que rechazar y la base contestó: ${sinPersona}.`);
}
if (!(Number(tramosPropios) > 0)) {
  fallas.push('El Administrador de la Prestadora no vio los tramos de su propio Servicio: la prueba de la otra Prestadora no probaría nada.');
}
if (tramosDeLaOtra !== '0') fallas.push(`La otra Prestadora vio ${tramosDeLaOtra} tramos de un Servicio ajeno.`);
if (deLaOtra === 'aceptado') fallas.push('La otra Prestadora pudo cambiar el Responsable de pagos de un Servicio ajeno.');

if (fallas.length) {
  for (const f of fallas) console.error(f);
  process.exit(1);
}
console.log('La base sigue la regla: sin la indicación la factura sigue al Contratante y nada se parte; con la indicación el cambio se rechaza sobre una factura con correcciones y se acepta sin ellas; la otra Prestadora no ve ni cambia nada.');
