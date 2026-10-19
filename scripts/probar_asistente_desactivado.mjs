// ---------------------------------------------------------------------------
// probar_asistente_desactivado.mjs — ¿un Asistente desactivado deja de ofrecerse y de entrar?
//
// Uso, desde la raíz del producto:
//   node scripts/probar_asistente_desactivado.mjs            (contra la base enlazada)
//   node scripts/probar_asistente_desactivado.mjs --local    (contra la base local levantada)
//
// Devuelve 0 si todo dio lo esperado y 1 si no.
//
// QUÉ PRUEBA. Que la base, y no la interfaz, haga cumplir lo que pasa con un Asistente desactivado:
//
//   - Un Coordinador no lo ve en `asistentes_coordinador`, ni lo encuentra en `asistentes` pidiendo
//     los no desactivados, que es como el Panel arma cada desplegable; y `reactivar_la_cuenta` le
//     contesta falso. Para que la prueba pueda fallar, el mismo Coordinador sí ve al Asistente
//     activo por los dos caminos: una base que negara todo daría «no lo ve» sin probar nada.
//   - El Administrador lo ve con `cuenta_desactivada` en verdadero, y el filtro de los no
//     desactivados lo deja afuera y deja adentro al activo.
//   - No se le puede asignar una guardia: el disparador la rechaza. Al activo, sí.
//   - Al desactivarlo como lo hace el backend, su cuenta de ingreso queda bloqueada y sus sesiones
//     abiertas se cierran: no vuelve a entrar.
//   - El Administrador lo reactiva: vuelve a ofrecerse y la cuenta de ingreso queda sin bloqueo.
//
// CON QUÉ DATOS. Dos Asistentes inventados ya cargados en una Prestadora de prueba con guardias,
// una guardia ya asignada de esa Prestadora, y un Administrador y un Coordinador que crea la
// prueba. Todo adentro de una transacción que termina en ROLLBACK: al terminar no queda nada. Las sesiones se simulan como las arma la base:
// el rol `authenticated` con la credencial de la persona, y el trabajo sin persona para la baja.
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
  v_prestadora uuid;
  v_admin uuid := gen_random_uuid();
  v_coord uuid := gen_random_uuid();
  v_cuenta_activo uuid;
  v_cuenta_des uuid;
  v_activo uuid;
  v_des uuid;
  v_marca text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
  v_guardia uuid;
  v_fallas text[] := '{}';
  v_n int;
  v_ok boolean;
  v_motivo text;
  v_cuenta uuid;
BEGIN
  SELECT id, prestadora_id INTO v_guardia, v_prestadora FROM guardias
   WHERE asistente_id IS NOT NULL
   ORDER BY fecha DESC LIMIT 1;
  IF v_guardia IS NULL THEN RAISE EXCEPTION 'Falta una Prestadora de prueba con alguna guardia asignada'; END IF;

  -- Dos Asistentes de esa Prestadora con la cuenta activa: uno sin nada que trabe su baja, que es
  -- el que se desactiva, y otro cualquiera.
  SELECT a.id, a.usuario_id INTO v_des, v_cuenta_des
    FROM asistentes a JOIN usuarios u ON u.id = a.usuario_id AND u.rol = 'asistente' AND u.desactivada_en IS NULL
   WHERE a.prestadora_id = v_prestadora AND a.estado = 'activo'
     AND NOT EXISTS (SELECT 1 FROM interno.turnos_que_traban_la_desactivacion(a.usuario_id, a.prestadora_id))
   ORDER BY a.id LIMIT 1;
  SELECT a.id, a.usuario_id INTO v_activo, v_cuenta_activo
    FROM asistentes a JOIN usuarios u ON u.id = a.usuario_id AND u.rol = 'asistente' AND u.desactivada_en IS NULL
   WHERE a.prestadora_id = v_prestadora AND a.estado = 'activo' AND a.id <> v_des
   ORDER BY a.id LIMIT 1;
  IF v_des IS NULL OR v_activo IS NULL THEN RAISE EXCEPTION 'Faltan dos Asistentes de prueba con la cuenta activa'; END IF;

  FOREACH v_cuenta IN ARRAY ARRAY[v_admin, v_coord] LOOP
    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token)
    VALUES ('00000000-0000-0000-0000-000000000000', v_cuenta, 'authenticated', 'authenticated',
      v_cuenta::text || '@acceso.careonys.invalid', '', now(), now(), '', '', '', '', '', '', '', '');
  END LOOP;

  INSERT INTO usuarios (id, rol, nombre, prestadora_id, email, nombre_de_usuario) VALUES
    (v_admin, 'admin_prestadora', 'Admin inventado', v_prestadora, 'admin.' || v_marca || '@ejemplo.invalid', NULL),
    (v_coord, 'coordinador', 'Coordinador inventado', v_prestadora, 'coord.' || v_marca || '@ejemplo.invalid', 'coord' || v_marca || '_prueba');

  -- Una sesión abierta del que se va a desactivar, para ver que se cierra.
  INSERT INTO auth.sessions (id, user_id, created_at, updated_at, aal)
  VALUES (gen_random_uuid(), v_cuenta_des, now(), now(), 'aal1');

  -- LA BAJA, como la pide el backend.
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('role', 'trabajo_sin_persona', 'prestadora_id', v_prestadora)::text, true);
  SET LOCAL ROLE trabajo_sin_persona;
  v_ok := desactivar_la_cuenta(v_cuenta_des, 'Motivo inventado');
  RESET ROLE;
  IF v_ok IS DISTINCT FROM true THEN v_fallas := v_fallas || text 'la baja no se hizo'; END IF;

  -- NO ENTRA MÁS.
  SELECT count(*) INTO v_n FROM auth.users WHERE id = v_cuenta_des AND banned_until > now();
  IF v_n <> 1 THEN v_fallas := v_fallas || text 'la cuenta de ingreso del desactivado no quedó bloqueada'; END IF;
  SELECT count(*) INTO v_n FROM auth.sessions WHERE user_id = v_cuenta_des;
  IF v_n <> 0 THEN v_fallas := v_fallas || text 'la sesión abierta del desactivado sigue viva'; END IF;
  SELECT count(*) INTO v_n FROM usuarios WHERE id = v_cuenta_activo AND desactivada_en IS NULL;
  IF v_n <> 1 THEN v_fallas := v_fallas || text 'quedó desactivada la cuenta del otro Asistente'; END IF;

  -- NO SE LE ASIGNA UNA GUARDIA. Cada intento se deshace con su bloque.
  v_motivo := NULL;
  BEGIN
    UPDATE guardias SET asistente_id = v_des WHERE id = v_guardia;
    RAISE EXCEPTION 'deshacer';
  EXCEPTION WHEN OTHERS THEN v_motivo := SQLERRM;
  END;
  IF v_motivo IS DISTINCT FROM 'asistente_no_encontrado' THEN
    v_fallas := v_fallas || ('al desactivado se le asignó la guardia: ' || coalesce(v_motivo, 'nada'));
  END IF;
  v_motivo := NULL;
  BEGIN
    UPDATE guardias SET asistente_id = v_activo WHERE id = v_guardia;
    RAISE EXCEPTION 'deshacer';
  EXCEPTION WHEN OTHERS THEN v_motivo := SQLERRM;
  END;
  IF v_motivo IS DISTINCT FROM 'deshacer' THEN
    v_fallas := v_fallas || ('al activo no se le pudo asignar la guardia: ' || coalesce(v_motivo, 'nada'));
  END IF;

  -- EL COORDINADOR.
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_coord, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO v_n FROM asistentes_coordinador WHERE id = v_activo;
  IF v_n <> 1 THEN v_fallas := v_fallas || text 'el Coordinador no ve al activo en su vista: la prueba no puede distinguir'; END IF;
  SELECT count(*) INTO v_n FROM asistentes_coordinador WHERE id = v_des;
  IF v_n <> 0 THEN v_fallas := v_fallas || text 'el Coordinador ve al desactivado en su vista'; END IF;
  SELECT count(*) INTO v_n FROM asistentes a WHERE a.id = v_activo AND NOT a.cuenta_desactivada;
  IF v_n <> 1 THEN v_fallas := v_fallas || text 'el Coordinador no encuentra al activo en los desplegables'; END IF;
  SELECT count(*) INTO v_n FROM asistentes a WHERE a.id = v_des AND NOT a.cuenta_desactivada;
  IF v_n <> 0 THEN v_fallas := v_fallas || text 'al Coordinador se le ofrece el desactivado'; END IF;
  v_ok := reactivar_la_cuenta(v_cuenta_des);
  IF v_ok IS DISTINCT FROM false THEN v_fallas := v_fallas || text 'el Coordinador reactivó al Asistente'; END IF;

  RESET ROLE;
  SELECT count(*) INTO v_n FROM usuarios WHERE id = v_cuenta_des AND desactivada_en IS NOT NULL;
  IF v_n <> 1 THEN v_fallas := v_fallas || text 'el Asistente quedó activo después del intento del Coordinador'; END IF;

  -- EL ADMINISTRADOR.
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO v_n FROM asistentes a WHERE a.id = v_des AND a.cuenta_desactivada;
  IF v_n <> 1 THEN v_fallas := v_fallas || text 'el Administrador no ve al desactivado entre los desactivados'; END IF;
  SELECT count(*) INTO v_n FROM asistentes a WHERE a.id IN (v_activo, v_des) AND NOT a.cuenta_desactivada;
  IF v_n <> 1 THEN v_fallas := v_fallas || ('el filtro de los no desactivados trajo ' || v_n || ' de 1'); END IF;

  v_ok := reactivar_la_cuenta(v_cuenta_des);
  IF v_ok IS DISTINCT FROM true THEN v_fallas := v_fallas || text 'el Administrador no pudo reactivar al Asistente'; END IF;
  SELECT count(*) INTO v_n FROM asistentes a WHERE a.id = v_des AND NOT a.cuenta_desactivada;
  IF v_n <> 1 THEN v_fallas := v_fallas || text 'el reactivado no vuelve a ofrecerse'; END IF;

  RESET ROLE;
  SELECT count(*) INTO v_n FROM auth.users WHERE id = v_cuenta_des AND banned_until IS NULL;
  IF v_n <> 1 THEN v_fallas := v_fallas || text 'el reactivado sigue sin poder entrar'; END IF;
  SELECT count(*) INTO v_n FROM registro_actividad
   WHERE registro_id = v_cuenta_des AND accion = 'reactivacion_de_cuenta' AND usuario_id = v_admin;
  IF v_n <> 1 THEN v_fallas := v_fallas || text 'la reactivación no quedó registrada'; END IF;

  PERFORM set_config('prueba.fallas', array_to_string(v_fallas, ' | '), true);
END;
$prueba$;

SELECT current_setting('prueba.fallas', true) AS fallas;

ROLLBACK;
`;

const carpeta = mkdtempSync(join(tmpdir(), 'asistente-desactivado-'));
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
console.log('Un Asistente desactivado no entra, no se ofrece, no se asigna y sólo lo reactiva el Administrador.');
