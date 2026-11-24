// ---------------------------------------------------------------------------
// probar_cambio_de_responsable_de_pagos.mjs — ¿la base sigue la regla de los Responsables de pagos?
//
// Uso, desde la raíz del producto, con la base local levantada y sembrada:
//   node scripts/probar_cambio_de_responsable_de_pagos.mjs
//
// Devuelve 0 si la base se comportó como debe y 1 si no.
//
// LA REGLA. Un Servicio puede tener varios Responsables de pagos a la vez. Cada uno rige desde un
// día y, cuando deja de serlo, hasta otro, y cada uno firma su propio documento. Con la opción de
// la Prestadora encendida, para programar turnos de guardia tienen que haber firmado todos los que rigen
// hoy. La factura sale a nombre del Contratante, salvo los días en que un Responsable de pagos
// lleva la marca de que se le facture a él; la marca la lleva uno solo por día.
//
// QUÉ PRUEBA, en orden, sobre el Servicio de la siembra que ya tiene un Responsable de pagos y una
// factura de agosto sin mandar, con una corrección:
//   1. Sin ninguna marca, toda la factura sale a nombre del Contratante.
//   2. Agregar un segundo Responsable de pagos desde el 16 de agosto con la marca se rechaza,
//      porque la factura pasaría a otro nombre y tiene una corrección. La factura sigue estando.
//   3. Sin la corrección, el mismo pedido se acepta y la factura se borra para volver a armarse
//      partida. Sin este paso, una base que rechaza todo pasaría el segundo.
//   4. Los dos rigen hoy a la vez, y desde el 16 de agosto la factura sale a nombre del segundo.
//   5. La misma persona dos veces en los mismos días se rechaza.
//   6. La marca en el primero, mientras la lleva el segundo, se rechaza.
//   7. Cada uno tiene su documento pendiente de firmar a la vez, y la misma persona no tiene dos.
//   8. Con la opción encendida y la firma de uno solo, faltan firmas; con la de los dos, no.
//   9. Un hasta anterior al desde se rechaza. Con el fin del que no firmó puesto ayer, alcanza la
//      firma del que queda.
//  10. El Administrador de la otra Prestadora, que tiene su propio Responsable de pagos cargado,
//      ve el suyo, no ve ninguno de este Servicio y no los puede agregar, terminar ni marcar.
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

// Los de la siembra: la Prestadora de prueba, su Administrador, un Servicio con su Cliente y su
// Responsable de pagos, y otra persona; y la otra Prestadora, con su Administrador, un Servicio y
// una persona.
const PRESTADORA = '11111111-1111-4111-8111-111111111111';
const ADMINISTRADOR = '20000000-0000-4000-8000-000000000002';
const SERVICIO = '60000000-0000-4000-8000-000000000002';
const CLIENTE = '40000000-0000-4000-8000-000000000002';
const PRIMERO = 'c0000000-0000-4000-8000-000000000003';
const SEGUNDO = 'c0000000-0000-4000-8000-000000000001';
const OTRA_PRESTADORA = '22222222-2222-4222-8222-222222222222';
const ADMINISTRADOR_DE_LA_OTRA = '50000000-0000-4000-8000-000000000001';
const SERVICIO_DE_LA_OTRA = '70000000-0000-4000-8000-000000000001';
const PERSONA_DE_LA_OTRA = 'c0000000-0000-4000-8000-000000000013';

// Un documento de un Responsable de pagos, pendiente o firmado.
const documento = (persona, estado) => `
  INSERT INTO public.consentimientos_pagador
    (prestadora_id, cliente_id, servicio_id, pagador_persona_id, pagador_nombre, documento_texto,
     documento_verificador, documento_idioma, estado, cerrado_como, cerrado_en, cargado_por)
  VALUES ('${PRESTADORA}', '${CLIENTE}', '${SERVICIO}', '${persona}', 'Responsable inventado',
          'Texto inventado', 'verificador-inventado', 'es-AR', '${estado}',
          ${estado === 'cerrado' ? "'documento_firmado', now()" : 'NULL, NULL'}, '${ADMINISTRADOR}');`;

const comoAdministrador = (usuario) => `
  PERFORM set_config('request.jwt.claims', '{"sub":"${usuario}","role":"authenticated"}', true);
  PERFORM set_config('request.jwt.claim.sub', '${usuario}', true);`;

const SQL = `
BEGIN;
DO $prueba$
DECLARE
  v_factura uuid;
  v_primero uuid;
  v_segundo uuid;
  v_r text;
  v_resultados text[] := '{}';
BEGIN
  SELECT id INTO v_primero FROM public.pagadores_del_servicio
   WHERE servicio_id = '${SERVICIO}' AND pagador_persona_id = '${PRIMERO}';
  IF v_primero IS NULL THEN
    RAISE EXCEPTION 'La base local no tiene el Responsable de pagos de la siembra. Siémbrela con «supabase db reset --local».';
  END IF;

  -- La otra Prestadora, con su propio Responsable de pagos cargado.
  INSERT INTO public.pagadores_del_servicio (prestadora_id, servicio_id, pagador_persona_id, vigente_desde)
  VALUES ('${OTRA_PRESTADORA}', '${SERVICIO_DE_LA_OTRA}', '${PERSONA_DE_LA_OTRA}', '2026-01-01');

  -- Una factura de agosto sin mandar, con una corrección.
  INSERT INTO public.facturas_cliente (prestadora_id, cliente_id, servicio_id, periodo, periodo_hasta, moneda)
  VALUES ('${PRESTADORA}', '${CLIENTE}', '${SERVICIO}', '2026-08-01', '2026-08-31', 'ARS')
  RETURNING id INTO v_factura;
  INSERT INTO public.correcciones_factura_cliente
    (prestadora_id, factura_id, sentido, monto, comprobante_tipo, comprobante_numero, motivo, moneda)
  VALUES ('${PRESTADORA}', v_factura, 'resta', 100, 'Nota de crédito', '0001-00000001', 'Prueba', 'ARS');

  ${comoAdministrador(ADMINISTRADOR)}
  SET LOCAL ROLE authenticated;

  -- 1. Sin ninguna marca, ningún tramo a nombre de nadie: todo sale a nombre del Contratante.
  SELECT count(*)::text INTO v_r FROM public.tramos_de_la_factura_del_servicio
   WHERE servicio_id = '${SERVICIO}' AND responsable_que_recibe_la_factura IS NOT NULL;
  v_resultados := v_resultados || v_r;

  -- 2. El segundo con la marca, sobre una factura con corrección.
  v_r := 'aceptado';
  BEGIN
    PERFORM public.agregar_responsable_de_pagos('${SERVICIO}', '${SEGUNDO}', 'otro', '2026-08-16', true);
  EXCEPTION WHEN OTHERS THEN v_r := SQLERRM;
  END;
  v_resultados := v_resultados || v_r
    || (SELECT count(*)::text FROM public.facturas_cliente WHERE id = v_factura);

  -- 3. Lo mismo, sin la corrección.
  RESET ROLE;
  DELETE FROM public.correcciones_factura_cliente WHERE factura_id = v_factura;
  SET LOCAL ROLE authenticated;
  v_r := 'aceptado';
  BEGIN
    SELECT string_agg(periodo || '/' || periodo_hasta, ',') INTO v_r
      FROM public.agregar_responsable_de_pagos('${SERVICIO}', '${SEGUNDO}', 'otro', '2026-08-16', true);
  EXCEPTION WHEN OTHERS THEN v_r := SQLERRM;
  END;
  v_resultados := v_resultados || coalesce(v_r, 'sin borradas')
    || (SELECT count(*)::text FROM public.facturas_cliente WHERE id = v_factura);
  SELECT id INTO v_segundo FROM public.pagadores_del_servicio
   WHERE servicio_id = '${SERVICIO}' AND pagador_persona_id = '${SEGUNDO}';

  -- 4. Los dos rigen hoy, y la factura desde el 16 de agosto sale a nombre del segundo.
  v_resultados := v_resultados
    || (SELECT count(*)::text FROM public.pagadores_del_servicio
         WHERE servicio_id = '${SERVICIO}' AND vigente_desde <= interno.hoy_de_la_sesion()
           AND (vigente_hasta IS NULL OR vigente_hasta >= interno.hoy_de_la_sesion()))
    || (SELECT coalesce(string_agg(coalesce(rige_desde::text, 'siempre') || '>' || coalesce(responsable_que_recibe_la_factura::text, 'contratante'), ',' ORDER BY rige_desde NULLS FIRST), '')
          FROM public.tramos_de_la_factura_del_servicio WHERE servicio_id = '${SERVICIO}');

  -- 5. El segundo otra vez, en días que se superponen.
  v_r := 'aceptado';
  BEGIN
    PERFORM public.agregar_responsable_de_pagos('${SERVICIO}', '${SEGUNDO}', 'otro', '2026-10-01');
  EXCEPTION WHEN OTHERS THEN v_r := SQLERRM;
  END;
  v_resultados := v_resultados || v_r;

  -- 6. La marca en el primero, mientras la lleva el segundo.
  v_r := 'aceptado';
  BEGIN
    PERFORM public.marcar_factura_al_responsable(v_primero, true);
  EXCEPTION WHEN OTHERS THEN v_r := SQLERRM;
  END;
  v_resultados := v_resultados || v_r;

  -- 7. Un documento pendiente para cada uno, a la vez; y un segundo pendiente para el mismo.
  RESET ROLE;
  ${documento(PRIMERO, 'pendiente_firma')}
  ${documento(SEGUNDO, 'pendiente_firma')}
  v_r := 'aceptado';
  BEGIN
    ${documento(SEGUNDO, 'pendiente_firma')}
  EXCEPTION WHEN unique_violation THEN v_r := 'rechazado';
  END;
  v_resultados := v_resultados
    || (SELECT count(*)::text FROM public.consentimientos_pagador
         WHERE servicio_id = '${SERVICIO}' AND estado = 'pendiente_firma')
    || v_r;

  -- 8. La opción encendida: con la firma del segundo solo faltan firmas; con las dos, no.
  UPDATE public.prestadoras SET turnos_guardia_solo_con_firma_del_pagador = true WHERE id = '${PRESTADORA}';
  ${documento(SEGUNDO, 'cerrado')}
  SET LOCAL ROLE authenticated;
  v_resultados := v_resultados || coalesce(public.falta_la_firma_del_pagador('${SERVICIO}')::text, 'nada');
  RESET ROLE;
  ${documento(PRIMERO, 'cerrado')}
  SET LOCAL ROLE authenticated;
  v_resultados := v_resultados || coalesce(public.falta_la_firma_del_pagador('${SERVICIO}')::text, 'nada');
  RESET ROLE;
  DELETE FROM public.consentimientos_pagador
   WHERE servicio_id = '${SERVICIO}' AND pagador_persona_id = '${PRIMERO}' AND estado = 'cerrado';
  SET LOCAL ROLE authenticated;

  -- 9. Un hasta antes del desde; y el fin del primero, que no firmó, ayer.
  v_r := 'aceptado';
  BEGIN
    PERFORM public.terminar_responsable_de_pagos(v_segundo, '2026-08-10');
  EXCEPTION WHEN OTHERS THEN v_r := SQLERRM;
  END;
  v_resultados := v_resultados || v_r
    || coalesce(public.falta_la_firma_del_pagador('${SERVICIO}')::text, 'nada');
  v_r := 'aceptado';
  BEGIN
    PERFORM public.terminar_responsable_de_pagos(v_primero, interno.hoy_de_la_sesion() - 1);
  EXCEPTION WHEN OTHERS THEN v_r := SQLERRM;
  END;
  v_resultados := v_resultados || v_r
    || coalesce(public.falta_la_firma_del_pagador('${SERVICIO}')::text, 'nada');
  RESET ROLE;

  -- 10. La otra Prestadora.
  ${comoAdministrador(ADMINISTRADOR_DE_LA_OTRA)}
  SET LOCAL ROLE authenticated;
  v_resultados := v_resultados
    || (SELECT count(*)::text FROM public.pagadores_del_servicio WHERE servicio_id = '${SERVICIO_DE_LA_OTRA}')
    || (SELECT count(*)::text FROM public.pagadores_del_servicio WHERE servicio_id = '${SERVICIO}')
    || (SELECT count(*)::text FROM public.tramos_de_la_factura_del_servicio WHERE servicio_id = '${SERVICIO}');
  v_r := 'aceptado';
  BEGIN
    PERFORM public.agregar_responsable_de_pagos('${SERVICIO}', '${SEGUNDO}', 'otro', '2027-01-01');
  EXCEPTION WHEN OTHERS THEN v_r := 'rechazado';
  END;
  v_resultados := v_resultados || v_r;
  v_r := 'aceptado';
  BEGIN
    PERFORM public.terminar_responsable_de_pagos(v_segundo, '2027-01-01');
  EXCEPTION WHEN OTHERS THEN v_r := 'rechazado';
  END;
  v_resultados := v_resultados || v_r;
  v_r := 'aceptado';
  BEGIN
    PERFORM public.marcar_factura_al_responsable(v_segundo, false);
  EXCEPTION WHEN OTHERS THEN v_r := 'rechazado';
  END;
  v_resultados := v_resultados || v_r;
  RESET ROLE;

  -- Del lado de esta Prestadora, el Responsable de pagos de la otra tampoco se ve.
  ${comoAdministrador(ADMINISTRADOR)}
  SET LOCAL ROLE authenticated;
  v_resultados := v_resultados
    || (SELECT count(*)::text FROM public.pagadores_del_servicio WHERE servicio_id = '${SERVICIO_DE_LA_OTRA}');
  RESET ROLE;

  RAISE NOTICE '%', array_to_string(v_resultados, '|');
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

// Lo que tiene que contestar cada paso, en el mismo orden en que la prueba lo anota.
const ESPERADO = [
  ['sin ninguna marca, los tramos a nombre de alguien', '0'],
  ['el segundo con la marca, sobre una factura con corrección', 'cambio_de_pagador_con_factura_emitida'],
  ['la factura con corrección, después del rechazo', '1'],
  ['el segundo con la marca, sin la corrección: las facturas borradas', '2026-08-01/2026-08-31'],
  ['la factura sin corrección, después del cambio', '0'],
  ['los Responsables de pagos que rigen hoy', '2'],
  ['a nombre de quién sale la factura en cada tramo', `siempre>contratante,2026-08-16>${SEGUNDO}`],
  ['la misma persona dos veces en los mismos días', 'responsable_de_pagos_repetido'],
  ['la marca en el primero mientras la lleva el segundo', 'responsable_de_pagos_con_otra_marca'],
  ['los documentos pendientes de firmar a la vez', '2'],
  ['un segundo pendiente para la misma persona', 'rechazado'],
  ['con la firma de uno solo, faltan firmas', 'true'],
  ['con la firma de los dos, faltan firmas', 'false'],
  ['un hasta antes del desde', 'responsable_de_pagos_hasta_antes_del_desde'],
  ['con el que no firmó todavía rigiendo, faltan firmas', 'true'],
  ['el fin del que no firmó, ayer', 'aceptado'],
  ['con el que no firmó terminado, faltan firmas', 'false'],
  ['la otra Prestadora ve su propio Responsable de pagos', '1'],
  ['la otra Prestadora ve Responsables de pagos de este Servicio', '0'],
  ['la otra Prestadora ve tramos de la factura de este Servicio', '0'],
  ['la otra Prestadora agrega un Responsable de pagos a este Servicio', 'rechazado'],
  ['la otra Prestadora termina un Responsable de pagos de este Servicio', 'rechazado'],
  ['la otra Prestadora cambia la marca de un Responsable de pagos de este Servicio', 'rechazado'],
  ['esta Prestadora ve el Responsable de pagos de la otra', '0'],
];

const obtenido = aviso.replace(/^NOTICE:\s*/, '').split('|');
const fallas = [];
if (obtenido.length !== ESPERADO.length) {
  fallas.push(`La prueba anotó ${obtenido.length} resultados y se esperaban ${ESPERADO.length}: ${obtenido.join(' | ')}`);
} else {
  ESPERADO.forEach(([que, valor], i) => {
    if (obtenido[i] !== valor) fallas.push(`${que}: se esperaba «${valor}» y la base contestó «${obtenido[i]}».`);
  });
}

if (fallas.length) {
  for (const f of fallas) console.error(f);
  process.exit(1);
}
console.log('La base sigue la regla: varios Responsables de pagos a la vez, cada uno con su documento; faltan firmas hasta que firman todos los que rigen hoy; la marca de la factura en uno solo por día y sin ella todo sale a nombre del Contratante; la otra Prestadora no ve ni cambia nada.');
