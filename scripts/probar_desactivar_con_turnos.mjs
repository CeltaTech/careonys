// ---------------------------------------------------------------------------
// probar_desactivar_con_turnos.mjs — ¿qué turnos traban la desactivación de un Asistente?
//
// Uso, desde la raíz del producto:
//   node scripts/probar_desactivar_con_turnos.mjs            (contra la base enlazada)
//   node scripts/probar_desactivar_con_turnos.mjs --local    (contra la base local levantada)
//
// Devuelve 0 si todo dio lo esperado y 1 si no.
//
// QUÉ PRUEBA. Que la base, y no la interfaz, rechace desactivar la cuenta de un Asistente con un
// turno sin terminar. Un turno está terminado si tiene registrado el fin del turno (la salida del
// Asistente) o un cierre hecho desde el Panel; sólo traba el que no tiene ninguna de las dos cosas.
// Una guardia del mismo Asistente pasa por cada caso:
//
//   - programada para dentro de unos días                     → traba
//   - de hace dos días, con llegada y sin salida ni cierre   → traba
//   - la misma, con la salida registrada                      → no traba
//   - la misma, sin salida pero cerrada desde el Panel        → no traba
//   - cancelada, por delante                                  → no traba
//   - ausente, de hace dos días                               → no traba
//   - y aparte, una serie vigente asignada                    → traba
//
// En cada caso se pide la baja de verdad. En los que no traban, la baja se deshace enseguida, para
// que el caso siguiente encuentre la cuenta activa. Al final, sin nada que trabe, la cuenta se
// desactiva y queda desactivada. Lo que hace que la prueba pueda fallar: una función que rechazara
// todo falla los casos que no traban, y una que dejara pasar todo falla los que traban.
//
// CON QUÉ DATOS. Un Asistente inventado de una Prestadora de prueba que hoy no tiene nada que trabe,
// y una de sus guardias ya cargadas. Todo adentro de una transacción que termina en ROLLBACK: al
// terminar no queda nada cambiado. La baja se pide como la pide el backend: con la credencial del
// trabajo sin persona, para esa Prestadora.
// ---------------------------------------------------------------------------

import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DESTINO = process.argv.includes('--local') ? '--local' : '--linked';

const SQL = String.raw`
BEGIN;

-- Pide la baja como el backend y contesta qué pasó: 'desactivada', 'falso' o el motivo del rechazo.
CREATE FUNCTION pg_temp.pedir_la_baja(p_usuario uuid, p_prestadora uuid) RETURNS text
LANGUAGE plpgsql AS $f$
DECLARE
  v_ok boolean;
  v_resultado text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('role', 'trabajo_sin_persona', 'prestadora_id', p_prestadora)::text, true);
  SET LOCAL ROLE trabajo_sin_persona;
  BEGIN
    v_ok := public.desactivar_la_cuenta(p_usuario, 'Motivo inventado');
    v_resultado := CASE WHEN v_ok THEN 'desactivada' ELSE 'falso' END;
  EXCEPTION WHEN OTHERS THEN v_resultado := SQLERRM;
  END;
  RESET ROLE;
  RETURN v_resultado;
END;
$f$;

-- Deja la guardia sin llegada, sin salida y sin cierre, en el estado y la fecha pedidos.
CREATE FUNCTION pg_temp.guardia_en(p_guardia uuid, p_estado text, p_fecha date) RETURNS void
LANGUAGE sql AS $f$
  UPDATE guardias
     SET fecha = p_fecha, estado = p_estado,
         salida_checkin_at = NULL, checkin_at = NULL, checkout_at = NULL, checkout_bloqueado = false,
         cerrada_at = NULL, cerrada_origen = NULL, cerrada_por = NULL, cerrada_motivo = NULL,
         cancelacion_origen = NULL, cancelacion_alcance = NULL
   WHERE id = p_guardia;
$f$;

DO $prueba$
DECLARE
  v_asistente uuid;
  v_usuario uuid;
  v_prestadora uuid;
  v_guardia uuid;
  v_paciente uuid;
  v_modalidad text;
  v_servicio uuid;
  v_admin uuid;
  v_fallas text[] := '{}';
  v_caso text;
  v_espera_traba boolean;
  v_resultado text;
  v_n int;
BEGIN
  -- Un Asistente con cuenta activa, sin nada que trabe y con alguna guardia cargada.
  SELECT a.id, a.usuario_id, a.prestadora_id, g.id, g.paciente_id, g.modalidad, g.servicio_id
    INTO v_asistente, v_usuario, v_prestadora, v_guardia, v_paciente, v_modalidad, v_servicio
    FROM asistentes a
    JOIN usuarios u ON u.id = a.usuario_id AND u.rol = 'asistente' AND u.desactivada_en IS NULL
    JOIN guardias g ON g.asistente_id = a.id AND g.prestadora_id = a.prestadora_id
   WHERE NOT EXISTS (SELECT 1 FROM interno.turnos_que_traban_la_desactivacion(a.usuario_id, a.prestadora_id))
   ORDER BY a.id, g.fecha
   LIMIT 1;
  IF v_asistente IS NULL THEN
    RAISE EXCEPTION 'Falta un Asistente de prueba con alguna guardia cargada';
  END IF;
  SELECT id INTO v_admin FROM usuarios
   WHERE prestadora_id = v_prestadora AND rol = 'admin_prestadora' LIMIT 1;
  IF v_admin IS NULL THEN RAISE EXCEPTION 'Falta el Administrador de la Prestadora de prueba'; END IF;

  FOR v_caso, v_espera_traba IN
    SELECT * FROM (VALUES
      ('programada por delante', true),
      ('pasada con llegada, sin salida ni cierre', true),
      ('pasada con la salida registrada', false),
      ('pasada sin salida, cerrada desde el Panel', false),
      ('cancelada por delante', false),
      ('ausente, pasada', false),
      ('serie vigente asignada', true)
    ) AS casos(caso, traba)
  LOOP
    -- La guardia en el estado del caso.
    IF v_caso = 'programada por delante' THEN
      PERFORM pg_temp.guardia_en(v_guardia, 'programada', current_date + 3);
    ELSIF v_caso = 'pasada con llegada, sin salida ni cierre' THEN
      PERFORM pg_temp.guardia_en(v_guardia, 'activa', current_date - 2);
      UPDATE guardias SET checkin_at = now() - interval '2 days' WHERE id = v_guardia;
    ELSIF v_caso = 'pasada con la salida registrada' THEN
      PERFORM pg_temp.guardia_en(v_guardia, 'activa', current_date - 2);
      UPDATE guardias SET checkin_at = now() - interval '2 days',
                          checkout_at = now() - interval '2 days' + interval '8 hours'
       WHERE id = v_guardia;
    ELSIF v_caso = 'pasada sin salida, cerrada desde el Panel' THEN
      PERFORM pg_temp.guardia_en(v_guardia, 'activa', current_date - 2);
      UPDATE guardias SET checkin_at = now() - interval '2 days',
                          cerrada_at = now(), cerrada_origen = 'panel', cerrada_por = v_admin,
                          cerrada_motivo = 'Motivo inventado'
       WHERE id = v_guardia;
    ELSIF v_caso = 'cancelada por delante' THEN
      PERFORM pg_temp.guardia_en(v_guardia, 'cancelada', current_date + 3);
    ELSIF v_caso = 'ausente, pasada' THEN
      PERFORM pg_temp.guardia_en(v_guardia, 'ausente', current_date - 2);
    ELSIF v_caso = 'serie vigente asignada' THEN
      -- La guardia queda terminada: lo único que traba es la serie.
      PERFORM pg_temp.guardia_en(v_guardia, 'completada', current_date - 2);
      UPDATE guardias SET checkin_at = now() - interval '2 days',
                          checkout_at = now() - interval '2 days' + interval '8 hours'
       WHERE id = v_guardia;
      INSERT INTO series_guardias (prestadora_id, asistente_id, paciente_id, dias_semana, hora_inicio, hora_fin,
                                   modalidad, vigente_desde, servicio_id)
      VALUES (v_prestadora, v_asistente, v_paciente, ARRAY[1], '08:00', '12:00', v_modalidad, current_date, v_servicio);
    END IF;

    -- La baja. Si pasa, se deshace con el bloque, para que el caso siguiente la encuentre activa.
    v_resultado := NULL;
    BEGIN
      v_resultado := pg_temp.pedir_la_baja(v_usuario, v_prestadora);
      SELECT count(*) INTO v_n FROM usuarios WHERE id = v_usuario AND desactivada_en IS NULL;
      IF v_resultado = 'desactivada' AND v_n <> 0 THEN v_resultado := 'contestó que sí y la cuenta sigue activa'; END IF;
      IF v_resultado <> 'desactivada' AND v_n <> 1 THEN v_resultado := 'rechazó y la cuenta quedó desactivada'; END IF;
      RAISE EXCEPTION 'deshacer';
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM <> 'deshacer' THEN v_resultado := SQLERRM; END IF;
    END;

    IF v_espera_traba AND v_resultado IS DISTINCT FROM 'desactivacion_con_turnos_por_delante' THEN
      v_fallas := v_fallas || (v_caso || ' tenía que trabar y dio: ' || coalesce(v_resultado, 'nada'));
    ELSIF NOT v_espera_traba AND v_resultado IS DISTINCT FROM 'desactivada' THEN
      v_fallas := v_fallas || (v_caso || ' no tenía que trabar y dio: ' || coalesce(v_resultado, 'nada'));
    END IF;
  END LOOP;

  -- Sin la serie y con la guardia cerrada desde el Panel: la baja queda hecha.
  DELETE FROM series_guardias WHERE asistente_id = v_asistente AND vigente_desde = current_date;
  v_resultado := pg_temp.pedir_la_baja(v_usuario, v_prestadora);
  IF v_resultado IS DISTINCT FROM 'desactivada' THEN
    v_fallas := v_fallas || ('sin nada que trabe no se desactivó: ' || coalesce(v_resultado, 'nada'));
  END IF;
  SELECT count(*) INTO v_n FROM usuarios WHERE id = v_usuario AND desactivada_en IS NOT NULL;
  IF v_n <> 1 THEN v_fallas := v_fallas || text 'sin nada que trabe la cuenta sigue activa'; END IF;
  SELECT count(*) INTO v_n FROM auth.users WHERE id = v_usuario AND banned_until > now();
  IF v_n <> 1 THEN v_fallas := v_fallas || text 'la cuenta desactivada todavía puede entrar'; END IF;

  PERFORM set_config('prueba.fallas', array_to_string(v_fallas, ' | '), true);
END;
$prueba$;

SELECT current_setting('prueba.fallas', true) AS fallas;

ROLLBACK;
`;

const carpeta = mkdtempSync(join(tmpdir(), 'desactivar-'));
const archivo = join(carpeta, 'prueba.sql');
writeFileSync(archivo, SQL);

let salida;
try {
  salida = execFileSync('supabase', ['db', 'query', DESTINO, '-o', 'json', '-f', archivo], {
    encoding: 'utf8',
    timeout: 120_000,
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
} catch (error) {
  console.error('La prueba no pudo correr:', error.stderr || error.message);
  process.exit(1);
} finally {
  rmSync(carpeta, { recursive: true, force: true });
}

const encontrado = salida.match(/"fallas"\s*:\s*"([^"]*)"/);
if (!encontrado) {
  console.error('La prueba no devolvió resultado:', salida);
  process.exit(1);
}
if (encontrado[1]) {
  console.error('FALLA:', encontrado[1]);
  process.exit(1);
}
console.log('Traban sólo los turnos sin salida ni cierre del Panel, y las series vigentes; sin ellos, la cuenta se desactiva.');
