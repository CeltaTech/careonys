// ---------------------------------------------------------------------------
// probar_reactivar_cuentas.mjs — ¿quién ve y quién reactiva una cuenta desactivada?
//
// Uso, desde la raíz del producto:
//   node scripts/probar_reactivar_cuentas.mjs            (contra la base enlazada)
//   node scripts/probar_reactivar_cuentas.mjs --local    (contra la base local levantada)
//
// Devuelve 0 si todo dio lo esperado y 1 si no.
//
// QUÉ PRUEBA. Que la base, y no la interfaz, haga cumplir que una cuenta desactivada la ve y la
// reactiva el Administrador de la Prestadora y nadie más:
//
//   - Un Coordinador de la misma Prestadora no ve la fila desactivada ni su historial, y
//     `reactivar_la_cuenta` le contesta falso y no cambia nada. Para que la prueba pueda fallar,
//     se comprueba también que ese Coordinador sí ve su propia fila: una base que negara todo
//     daría «no ve la desactivada» sin probar nada.
//   - El Administrador ve la desactivada y su historial, y la reactiva: queda activa, la cuenta de
//     ingreso sin bloqueo y el renglón en el registro de actividad.
//   - El Administrador no ve ni reactiva la desactivada de otra Prestadora.
//   - Si otra cuenta activa tomó el nombre de usuario o el email, no se reactiva y el motivo dice
//     cuál de los dos choca.
//
// CON QUÉ DATOS. Cuentas inventadas que la prueba crea en la Organización ficticia (Sandbox) y en
// otra Prestadora de prueba, adentro de una transacción que termina en ROLLBACK: al terminar no
// queda nada. Las sesiones se simulan como las arma la base para una persona que entró: el rol
// `authenticated` y la credencial con su identificador.
// ---------------------------------------------------------------------------

import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DESTINO = process.argv.includes('--local') ? '--local' : '--linked';

const SQL = String.raw`
BEGIN;

DO $prueba$
DECLARE
  v_sandbox uuid;
  v_otra uuid;
  v_admin uuid := gen_random_uuid();
  v_coord uuid := gen_random_uuid();
  v_des uuid := gen_random_uuid();
  v_des_otra uuid := gen_random_uuid();
  v_des_usuario uuid := gen_random_uuid();
  v_activa_usuario uuid := gen_random_uuid();
  v_des_correo uuid := gen_random_uuid();
  v_activa_correo uuid := gen_random_uuid();
  v_marca text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
  v_fallas text[] := '{}';
  v_n int;
  v_ok boolean;
  v_motivo text;
  v_cuenta uuid;
BEGIN
  SELECT id INTO v_sandbox FROM prestadoras WHERE nombre_fantasia ILIKE 'Sandbox%' ORDER BY created_at LIMIT 1;
  SELECT id INTO v_otra FROM prestadoras WHERE id <> v_sandbox ORDER BY created_at LIMIT 1;
  IF v_sandbox IS NULL OR v_otra IS NULL THEN
    RAISE EXCEPTION 'Faltan dos Prestadoras de prueba';
  END IF;

  -- Las cuentas inventadas, con su cuenta de ingreso bloqueada si están desactivadas.
  FOREACH v_cuenta IN ARRAY ARRAY[v_admin, v_coord, v_des, v_des_otra, v_des_usuario, v_activa_usuario,
                                   v_des_correo, v_activa_correo] LOOP
    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token)
    VALUES ('00000000-0000-0000-0000-000000000000', v_cuenta, 'authenticated', 'authenticated',
      v_cuenta::text || '@acceso.careonys.invalid', '', now(), now(), '', '', '', '', '', '', '', '');
  END LOOP;

  INSERT INTO usuarios (id, rol, nombre, prestadora_id, email, nombre_de_usuario, desactivada_en, motivo_de_la_desactivacion) VALUES
    (v_admin, 'admin_prestadora', 'Admin inventado', v_sandbox, 'admin.' || v_marca || '@ejemplo.invalid', NULL, NULL, NULL),
    (v_coord, 'coordinador', 'Coordinador inventado', v_sandbox, 'coord.' || v_marca || '@ejemplo.invalid', 'coord' || v_marca || '_prueba', NULL, NULL),
    (v_des, 'coordinador', 'Desactivada inventada', v_sandbox, 'des.' || v_marca || '@ejemplo.invalid', 'des' || v_marca || '_prueba', now(), 'Motivo inventado'),
    (v_des_otra, 'coordinador', 'Desactivada de otra', v_otra, 'otra.' || v_marca || '@ejemplo.invalid', 'otra' || v_marca || '_prueba', now(), 'Motivo inventado'),
    (v_des_usuario, 'coordinador', 'Desactivada con usuario tomado', v_sandbox, 'du.' || v_marca || '@ejemplo.invalid', 'tomado' || v_marca || '_prueba', now(), 'Motivo inventado'),
    (v_activa_usuario, 'coordinador', 'Activa que tomó el usuario', v_sandbox, 'au.' || v_marca || '@ejemplo.invalid', 'tomado' || v_marca || '_prueba', NULL, NULL),
    (v_des_correo, 'coordinador', 'Desactivada con email tomado', v_sandbox, 'tomado.' || v_marca || '@ejemplo.invalid', 'dc' || v_marca || '_prueba', now(), 'Motivo inventado'),
    (v_activa_correo, 'coordinador', 'Activa que tomó el email', v_sandbox, 'tomado.' || v_marca || '@ejemplo.invalid', 'ac' || v_marca || '_prueba', NULL, NULL);

  UPDATE auth.users SET banned_until = now() + interval '100 years'
   WHERE id IN (v_des, v_des_otra, v_des_usuario, v_des_correo);

  INSERT INTO registro_actividad (prestadora_id, usuario_id, accion, tabla_afectada, registro_id, detalle)
  VALUES (v_sandbox, v_admin, 'desactivacion_de_cuenta', 'usuarios', v_des, jsonb_build_object('rol_anterior', 'coordinador'));

  -- EL COORDINADOR.
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_coord, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO v_n FROM usuarios WHERE id = v_coord;
  IF v_n <> 1 THEN v_fallas := v_fallas || text 'el Coordinador no ve su propia fila: la prueba no puede distinguir'; END IF;
  SELECT count(*) INTO v_n FROM usuarios WHERE id = v_des;
  IF v_n <> 0 THEN v_fallas := v_fallas || text 'el Coordinador ve la cuenta desactivada'; END IF;
  SELECT count(*) INTO v_n FROM registro_actividad WHERE registro_id = v_des;
  IF v_n <> 0 THEN v_fallas := v_fallas || text 'el Coordinador ve el historial de la desactivada'; END IF;
  v_ok := reactivar_la_cuenta(v_des);
  IF v_ok IS DISTINCT FROM false THEN v_fallas := v_fallas || text 'el Coordinador reactivó una cuenta'; END IF;

  RESET ROLE;
  SELECT count(*) INTO v_n FROM usuarios WHERE id = v_des AND desactivada_en IS NOT NULL;
  IF v_n <> 1 THEN v_fallas := v_fallas || text 'la cuenta quedó activa después del intento del Coordinador'; END IF;

  -- EL ADMINISTRADOR.
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO v_n FROM usuarios WHERE id = v_des AND desactivada_en IS NOT NULL;
  IF v_n <> 1 THEN v_fallas := v_fallas || text 'el Administrador no ve la cuenta desactivada'; END IF;
  SELECT count(*) INTO v_n FROM registro_actividad WHERE registro_id = v_des;
  IF v_n < 1 THEN v_fallas := v_fallas || text 'el Administrador no ve el historial de la desactivada'; END IF;
  SELECT count(*) INTO v_n FROM usuarios WHERE id = v_des_otra;
  IF v_n <> 0 THEN v_fallas := v_fallas || text 'el Administrador ve la desactivada de otra Prestadora'; END IF;
  v_ok := reactivar_la_cuenta(v_des_otra);
  IF v_ok IS DISTINCT FROM false THEN v_fallas := v_fallas || text 'el Administrador reactivó una cuenta de otra Prestadora'; END IF;

  v_ok := reactivar_la_cuenta(v_des);
  IF v_ok IS DISTINCT FROM true THEN v_fallas := v_fallas || text 'el Administrador no pudo reactivar'; END IF;

  v_motivo := NULL;
  BEGIN
    PERFORM reactivar_la_cuenta(v_des_usuario);
  EXCEPTION WHEN OTHERS THEN v_motivo := SQLERRM;
  END;
  IF v_motivo IS DISTINCT FROM 'reactivacion_usuario_en_uso' THEN
    v_fallas := v_fallas || ('el usuario tomado no se rechazó: ' || coalesce(v_motivo, 'se reactivó'));
  END IF;

  v_motivo := NULL;
  BEGIN
    PERFORM reactivar_la_cuenta(v_des_correo);
  EXCEPTION WHEN OTHERS THEN v_motivo := SQLERRM;
  END;
  IF v_motivo IS DISTINCT FROM 'reactivacion_correo_en_uso' THEN
    v_fallas := v_fallas || ('el email tomado no se rechazó: ' || coalesce(v_motivo, 'se reactivó'));
  END IF;

  RESET ROLE;
  SELECT count(*) INTO v_n FROM usuarios
   WHERE id = v_des AND desactivada_en IS NULL AND motivo_de_la_desactivacion IS NULL;
  IF v_n <> 1 THEN v_fallas := v_fallas || text 'la reactivación no limpió la desactivación'; END IF;
  SELECT count(*) INTO v_n FROM auth.users WHERE id = v_des AND banned_until IS NULL;
  IF v_n <> 1 THEN v_fallas := v_fallas || text 'la cuenta de ingreso sigue bloqueada'; END IF;
  SELECT count(*) INTO v_n FROM registro_actividad
   WHERE registro_id = v_des AND usuario_id = v_admin AND accion = 'reactivacion_de_cuenta';
  IF v_n <> 1 THEN v_fallas := v_fallas || text 'la reactivación no quedó en el registro de actividad'; END IF;
  SELECT count(*) INTO v_n FROM usuarios WHERE id IN (v_des_usuario, v_des_correo) AND desactivada_en IS NOT NULL;
  IF v_n <> 2 THEN v_fallas := v_fallas || text 'una cuenta con choque quedó reactivada'; END IF;
  SELECT count(*) INTO v_n FROM usuarios WHERE id = v_des_otra AND desactivada_en IS NOT NULL;
  IF v_n <> 1 THEN v_fallas := v_fallas || text 'la desactivada de otra Prestadora cambió'; END IF;

  PERFORM set_config('prueba.fallas', array_to_string(v_fallas, ' | '), true);
END;
$prueba$;

SELECT current_setting('prueba.fallas', true) AS fallas;

ROLLBACK;
`;

const carpeta = mkdtempSync(join(tmpdir(), 'reactivar-'));
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
console.log('Cuentas desactivadas: el Coordinador no las ve ni las reactiva; el Administrador sí.');
