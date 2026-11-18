// ---------------------------------------------------------------------------
// probar_cambio_de_responsable_de_pagos.mjs — ¿la base protege las facturas con correcciones?
//
// Uso, desde la raíz del producto, con la base local levantada y sembrada:
//   node scripts/probar_cambio_de_responsable_de_pagos.mjs
//
// Devuelve 0 si la base se comportó como debe y 1 si no.
//
// QUÉ PRUEBA. Un cambio de Responsable de pagos borra las facturas sin mandar que el cambio parte,
// para volver a armarlas en dos. Una corrección de factura lleva su propio comprobante, y al borrar
// la factura se borraría con ella. Por eso la base tiene que rechazar el cambio cuando toca días de
// una factura sin mandar que tiene correcciones, y la corrección tiene que seguir estando.
//
// POR QUÉ PUEDE FALLAR. Una base que rechaza todo cambio pasaría la primera parte. Por eso, después,
// la prueba quita la corrección y repite el mismo cambio: ahí la base tiene que aceptarlo.
//
// CÓMO ENTRA. Adentro de la base local, con el rol `authenticated` y los datos de sesión del
// Administrador de la Prestadora de prueba que siembra `supabase/seed.sql`. Los datos son
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

// Los de la siembra: la Prestadora de prueba, su Administrador, un Servicio, su Cliente y una persona.
const PRESTADORA = '11111111-1111-4111-8111-111111111111';
const ADMINISTRADOR = '20000000-0000-4000-8000-000000000002';
const SERVICIO = '60000000-0000-4000-8000-000000000002';
const CLIENTE = '40000000-0000-4000-8000-000000000002';
const PERSONA = 'c0000000-0000-4000-8000-000000000001';

const SQL = `
BEGIN;
DO $prueba$
DECLARE
  v_factura uuid;
  v_con_correccion text := 'aceptado';
  v_correcciones int;
  v_facturas int;
  v_sin_correccion text := 'aceptado';
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

  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.cambiar_responsable_de_pagos('${SERVICIO}', '${PERSONA}', 'otro', '2026-08-16');
  EXCEPTION WHEN OTHERS THEN
    v_con_correccion := SQLERRM;
  END;
  RESET ROLE;

  SELECT count(*) INTO v_correcciones FROM public.correcciones_factura_cliente WHERE factura_id = v_factura;
  SELECT count(*) INTO v_facturas FROM public.facturas_cliente WHERE id = v_factura;

  -- El mismo cambio, sin la corrección.
  DELETE FROM public.correcciones_factura_cliente WHERE factura_id = v_factura;
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.cambiar_responsable_de_pagos('${SERVICIO}', '${PERSONA}', 'otro', '2026-08-16');
  EXCEPTION WHEN OTHERS THEN
    v_sin_correccion := SQLERRM;
  END;
  RESET ROLE;

  RAISE NOTICE '%|%|%|%', v_con_correccion, v_correcciones, v_facturas, v_sin_correccion;
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
const [conCorreccion, correcciones, facturas, sinCorreccion] = aviso.replace(/^NOTICE:\s*/, '').split('|');

const fallas = [];
if (conCorreccion !== 'cambio_de_pagador_con_factura_emitida') {
  fallas.push(`Con una corrección, la base tenía que rechazar el cambio y contestó: ${conCorreccion}.`);
}
if (correcciones !== '1') fallas.push(`La corrección tenía que seguir estando y quedaron ${correcciones}.`);
if (facturas !== '1') fallas.push(`La factura tenía que seguir estando y quedaron ${facturas}.`);
if (sinCorreccion !== 'aceptado') {
  fallas.push(`Sin la corrección, la base tenía que aceptar el cambio y contestó: ${sinCorreccion}. La prueba no prueba nada.`);
}

if (fallas.length) {
  for (const f of fallas) console.error(f);
  process.exit(1);
}
console.log('La base rechaza el cambio de Responsable de pagos sobre una factura con correcciones, y la corrección sigue estando.');
