// ---------------------------------------------------------------------------
// probar_cierre_de_turnos_guardia.mjs — ¿un turno de guardia empezado se cierra sólo por su camino?
//
// Uso, desde la raíz del producto:
//   node scripts/probar_cierre_de_turnos_guardia.mjs            (contra la base enlazada)
//   node scripts/probar_cierre_de_turnos_guardia.mjs --local    (contra la base local levantada)
//
// Devuelve 0 si todo dio lo esperado y 1 si no.
//
// QUÉ PRUEBA. Que la base, y no la interfaz, haga cumplir el cierre de un turno de guardia:
//
//   - nadie con sesión escribe la salida o el cierre directo en la tabla: ni el Asistente ni el
//     Administrador; el turno sigue abierto;
//   - una persona del Panel cierra sólo con un motivo de la lista, nunca con el que escribe el
//     sistema, y con el detalle cuando el motivo lo pide;
//   - la hora de salida no puede estar en el futuro, ni ser anterior a la llegada, ni posterior a
//     la llegada del Asistente del turno siguiente del mismo Paciente;
//   - el Reporte pendiente nunca traba: el turno queda en Salida sin Reporte; lo que la base no
//     acepta es un cierre que diga que no falta ninguno cuando falta;
//   - un cierre válido anota quién cerró, cuándo y con qué motivo, y un segundo cierre se rechaza;
//   - el backend cierra la salida del Asistente sin motivo, y la autorización de una salida en
//     nombre de quien la autorizó, que tiene que ser del Panel de esa misma Prestadora;
//   - el permiso para que el Paciente quede solo guarda el permiso y cierra el turno en la misma
//     operación, y el Asistente no puede darlo;
//   - y otra Prestadora no alcanza el turno: ni su Administrador ni su trabajo sin persona.
//
// Lo que hace que la prueba pueda fallar: una base que rechazara todo falla los cierres válidos, y
// una que dejara pasar todo falla los rechazos. Cada rechazo se compara con su motivo exacto, y
// después de cada rechazo se comprueba que el turno siguió abierto.
//
// CON QUÉ DATOS. Uno de los turnos de guardia ya cargados de la Prestadora de prueba, puesto como
// empezado hace tres horas, su Administrador y su Asistente. La segunda Prestadora, con su
// Administrador, se inventa adentro de la prueba. Todo adentro de una transacción que termina en
// ROLLBACK, y cada caso se deshace antes del siguiente: al terminar no queda nada cambiado.
// ---------------------------------------------------------------------------

import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DESTINO = process.argv.includes('--local') ? '--local' : '--linked';

const SQL = String.raw`
BEGIN;

-- Entra con la sesión pedida: una persona con su cuenta, o el trabajo sin persona de una Prestadora.
CREATE FUNCTION pg_temp.entrar(p_persona uuid, p_prestadora uuid) RETURNS void
LANGUAGE plpgsql AS $f$
BEGIN
  IF p_persona IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims',
      jsonb_build_object('sub', p_persona, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
  ELSE
    PERFORM set_config('request.jwt.claims',
      jsonb_build_object('role', 'trabajo_sin_persona', 'prestadora_id', p_prestadora)::text, true);
    SET LOCAL ROLE trabajo_sin_persona;
  END IF;
END;
$f$;

-- Pide el cierre por la puerta pública y contesta el estado en que quedó o el motivo del rechazo.
CREATE FUNCTION pg_temp.cerrar(p_persona uuid, p_prestadora uuid, p_turno uuid, p_hora timestamptz,
                               p_atrasado boolean, p_motivo uuid, p_detalle text, p_cerrada_por uuid)
RETURNS text LANGUAGE plpgsql AS $f$
DECLARE
  v text;
BEGIN
  PERFORM pg_temp.entrar(p_persona, p_prestadora);
  BEGIN
    v := public.cerrar_turno_guardia(p_turno, p_hora, p_atrasado, p_motivo, p_detalle, p_cerrada_por);
  EXCEPTION WHEN OTHERS THEN v := SQLERRM;
  END;
  RESET ROLE;
  RETURN v;
END;
$f$;

-- Escribe la salida directo en la tabla, como lo haría quien se saltea el camino.
CREATE FUNCTION pg_temp.escribir_directo(p_persona uuid, p_turno uuid) RETURNS text
LANGUAGE plpgsql AS $f$
DECLARE
  v text;
  v_n int;
BEGIN
  PERFORM pg_temp.entrar(p_persona, NULL);
  BEGIN
    UPDATE turnos_guardia SET checkout_at = now(), estado = 'completada' WHERE id = p_turno;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v := CASE WHEN v_n = 0 THEN 'ninguna_fila' ELSE 'escrito' END;
  EXCEPTION WHEN OTHERS THEN v := SQLERRM;
  END;
  RESET ROLE;
  RETURN v;
END;
$f$;

-- Da el permiso para que el Paciente quede solo y contesta 'cerrado' o el motivo del rechazo.
CREATE FUNCTION pg_temp.paciente_solo(p_persona uuid, p_turno uuid, p_paciente uuid) RETURNS text
LANGUAGE plpgsql AS $f$
DECLARE
  v text;
BEGIN
  PERFORM pg_temp.entrar(p_persona, NULL);
  BEGIN
    PERFORM public.permitir_que_el_paciente_quede_solo(p_turno, p_paciente, 'Familiar inventado', 'telefono',
      now() - interval '1 hour', now() + interval '1 hour', NULL, true);
    v := 'cerrado';
  EXCEPTION WHEN OTHERS THEN v := SQLERRM;
  END;
  RESET ROLE;
  RETURN v;
END;
$f$;

-- Si el turno sigue empezado y sin salida ni cierre.
CREATE FUNCTION pg_temp.sigue_abierto(p_turno uuid) RETURNS boolean
LANGUAGE sql AS $f$
  SELECT estado = 'activa' AND checkout_at IS NULL AND cerrada_at IS NULL
    FROM turnos_guardia WHERE id = p_turno;
$f$;

DO $prueba$
DECLARE
  v_a uuid := '4e84b0e7-1729-4d07-9e70-56fdbd54cd89';
  v_b uuid;
  v_admin uuid;
  v_admin_b uuid := gen_random_uuid();
  v_asistente uuid;
  v_turno uuid;
  v_otro_turno uuid;
  v_paciente uuid;
  v_llegada timestamptz := now() - interval '3 hours';
  v_m_telefono uuid;
  v_m_otro uuid;
  v_m_solo uuid;
  v_fallas text[] := '{}';
  v_caso text;
  v_esperado text;
  v_r text;
  v_fila turnos_guardia%ROWTYPE;
  v_n int;
BEGIN
  -- La Prestadora de prueba, su Administrador y un turno de guardia de un Asistente con cuenta
  -- activa, con algún Paciente al que todavía no se le presentó el Reporte, y otro turno de ese
  -- mismo Paciente, que hará de relevo.
  SELECT id INTO v_admin FROM usuarios
   WHERE prestadora_id = v_a AND rol = 'admin_prestadora' AND desactivada_en IS NULL LIMIT 1;
  SELECT g.id, a.usuario_id, tp.paciente_id INTO v_turno, v_asistente, v_paciente
    FROM turnos_guardia g
    JOIN asistentes a ON a.id = g.asistente_id
    JOIN usuarios u ON u.id = a.usuario_id AND u.rol = 'asistente' AND u.desactivada_en IS NULL
    JOIN turno_guardia_pacientes tp ON tp.turno_guardia_id = g.id
   WHERE g.prestadora_id = v_a
     AND NOT EXISTS (SELECT 1 FROM reportes r WHERE r.turno_guardia_id = g.id)
     AND EXISTS (SELECT 1 FROM turno_guardia_pacientes t2
                  WHERE t2.paciente_id = tp.paciente_id AND t2.turno_guardia_id <> g.id)
   ORDER BY g.id LIMIT 1;
  SELECT t2.turno_guardia_id INTO v_otro_turno FROM turno_guardia_pacientes t2
   WHERE t2.paciente_id = v_paciente AND t2.turno_guardia_id <> v_turno ORDER BY 1 LIMIT 1;
  IF v_admin IS NULL OR v_turno IS NULL OR v_otro_turno IS NULL THEN
    RAISE EXCEPTION 'Faltan los datos de la Prestadora de prueba';
  END IF;
  SELECT id INTO v_m_telefono FROM motivos_cierre_turno_guardia WHERE prestadora_id = v_a AND clave = 'fallo_el_telefono_del_asistente';
  SELECT id INTO v_m_otro     FROM motivos_cierre_turno_guardia WHERE prestadora_id = v_a AND clave = 'otro';
  SELECT id INTO v_m_solo     FROM motivos_cierre_turno_guardia WHERE prestadora_id = v_a AND clave = 'paciente_solo_con_permiso';
  IF v_m_telefono IS NULL OR v_m_otro IS NULL OR v_m_solo IS NULL THEN
    RAISE EXCEPTION 'Faltan los motivos de cierre de la Prestadora de prueba';
  END IF;

  -- La segunda Prestadora, inventada, con su Administrador. Su configuración inicial se siembra con
  -- la sesión de su propio trabajo, porque la siembra sólo acepta la Prestadora de quien llama.
  v_b := gen_random_uuid();
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('role', 'trabajo_sin_persona', 'prestadora_id', v_b)::text, true);
  INSERT INTO prestadoras (id, razon_social, nombre_fantasia, moneda)
  VALUES (v_b, 'Prestadora inventada S.A.', 'Prestadora inventada', 'ARS');
  PERFORM set_config('request.jwt.claims', '', true);
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token)
  VALUES ('00000000-0000-0000-0000-000000000000', v_admin_b, 'authenticated', 'authenticated',
    v_admin_b::text || '@acceso.careonys.invalid', '', now(), now(), '', '', '', '', '', '', '', '');
  INSERT INTO usuarios (id, rol, nombre, prestadora_id, email)
  VALUES (v_admin_b, 'admin_prestadora', 'Admin inventado', v_b, v_admin_b::text || '@ejemplo.invalid');

  -- El turno, empezado hace tres horas, sin salida ni cierre, y con el Reporte pendiente.
  UPDATE turnos_guardia
     SET estado = 'activa', checkin_at = v_llegada,
         checkout_at = NULL, checkout_lat = NULL, checkout_lng = NULL,
         cerrada_at = NULL, cerrada_origen = NULL, cerrada_por = NULL, cerrada_motivo = NULL,
         cerrada_motivo_id = NULL, salio_sin_reporte = false, factura_espera_el_reporte = false,
         reporte_llego_at = NULL
   WHERE id = v_turno;

  -- Presenta los Reportes de todos los Pacientes del turno. Se usa adentro de los casos que cierran
  -- con el Reporte al día, y se deshace con ellos.

  -- Ningún otro turno del mismo Paciente puede tener una llegada posterior: sería el relevo.
  PERFORM pg_temp.entrar(NULL, v_a);
  IF interno.llegada_del_turno_siguiente(v_turno) IS NOT NULL THEN
    RESET ROLE;
    RAISE EXCEPTION 'El turno de prueba ya tiene un relevo registrado';
  END IF;
  RESET ROLE;

  -- LOS RECHAZOS. Cada uno se compara con su motivo exacto, y el turno tiene que seguir abierto.
  FOR v_caso, v_esperado IN
    SELECT * FROM (VALUES
      ('el Asistente escribe la salida directo', 'directo'),
      ('el Administrador escribe la salida directo', 'el_cierre_pasa_por_la_funcion'),
      ('el Administrador cierra sin motivo', 'falta_el_motivo'),
      ('el Asistente cierra con motivo', 'sin_permiso'),
      ('el Administrador usa el motivo que escribe el sistema', 'motivo_de_salida_inexistente'),
      ('el Administrador elige otro motivo sin detalle', 'motivo_de_salida_pide_detalle'),
      ('el Administrador no pone hora', 'hora_de_salida_obligatoria'),
      ('el Administrador pone una hora futura', 'hora_de_salida_futura'),
      ('el Administrador pone una hora anterior a la llegada', 'hora_de_salida_anterior_a_la_llegada'),
      ('el Administrador pone una hora posterior a la llegada del relevo', 'hora_de_salida_posterior_al_relevo'),
      ('el Administrador dice que no falta Reporte cuando falta', 'reporte_no_coincide'),
      ('el Administrador de otra Prestadora cierra', 'no_encontrado'),
      ('el trabajo de otra Prestadora autoriza en nombre de este Administrador', 'sin_permiso'),
      ('el trabajo de la Prestadora autoriza en nombre de alguien de otra', 'sin_permiso'),
      ('el Asistente da el permiso para que el Paciente quede solo', 'sin_permiso')
    ) AS casos(caso, esperado)
  LOOP
    v_r := NULL;
    BEGIN
      IF v_caso = 'el Asistente escribe la salida directo' THEN
        v_r := pg_temp.escribir_directo(v_asistente, v_turno);
        -- Al Asistente lo frena su propio límite o el del cierre, o la fila ni le corresponde.
        IF v_r IN ('el_cierre_pasa_por_la_funcion', 'la_persona_cambia_solo_lo_suyo', 'ninguna_fila') THEN
          v_r := 'directo';
        END IF;
      ELSIF v_caso = 'el Administrador escribe la salida directo' THEN
        v_r := pg_temp.escribir_directo(v_admin, v_turno);
      ELSIF v_caso = 'el Administrador cierra sin motivo' THEN
        v_r := pg_temp.cerrar(v_admin, NULL, v_turno, now(), true, NULL, NULL, NULL);
      ELSIF v_caso = 'el Asistente cierra con motivo' THEN
        v_r := pg_temp.cerrar(v_asistente, NULL, v_turno, now(), true, v_m_telefono, NULL, NULL);
      ELSIF v_caso = 'el Administrador usa el motivo que escribe el sistema' THEN
        v_r := pg_temp.cerrar(v_admin, NULL, v_turno, now(), true, v_m_solo, NULL, NULL);
      ELSIF v_caso = 'el Administrador elige otro motivo sin detalle' THEN
        v_r := pg_temp.cerrar(v_admin, NULL, v_turno, now(), true, v_m_otro, '   ', NULL);
      ELSIF v_caso = 'el Administrador no pone hora' THEN
        v_r := pg_temp.cerrar(v_admin, NULL, v_turno, NULL, true, v_m_telefono, NULL, NULL);
      ELSIF v_caso = 'el Administrador pone una hora futura' THEN
        v_r := pg_temp.cerrar(v_admin, NULL, v_turno, now() + interval '10 minutes', true, v_m_telefono, NULL, NULL);
      ELSIF v_caso = 'el Administrador pone una hora anterior a la llegada' THEN
        v_r := pg_temp.cerrar(v_admin, NULL, v_turno, v_llegada - interval '10 minutes', true, v_m_telefono, NULL, NULL);
      ELSIF v_caso = 'el Administrador pone una hora posterior a la llegada del relevo' THEN
        -- El relevo: el otro turno del mismo Paciente, con la llegada registrada hace una hora.
        UPDATE turnos_guardia SET checkin_at = now() - interval '1 hour' WHERE id = v_otro_turno;
        v_r := pg_temp.cerrar(v_admin, NULL, v_turno, now(), true, v_m_telefono, NULL, NULL);
        -- Antes de la llegada del relevo, en cambio, cierra.
        IF v_r = 'hora_de_salida_posterior_al_relevo' THEN
          IF pg_temp.cerrar(v_admin, NULL, v_turno, now() - interval '2 hours', true, v_m_telefono, NULL, NULL)
             IS DISTINCT FROM 'salida_sin_reporte' THEN
            v_r := 'antes de la llegada del relevo tampoco cerró';
          ELSE
            UPDATE turnos_guardia
               SET checkout_at = NULL, estado = 'activa', cerrada_at = NULL, cerrada_origen = NULL,
                   cerrada_por = NULL, cerrada_motivo = NULL, cerrada_motivo_id = NULL
             WHERE id = v_turno;
          END IF;
        END IF;
      ELSIF v_caso = 'el Administrador dice que no falta Reporte cuando falta' THEN
        v_r := pg_temp.cerrar(v_admin, NULL, v_turno, now(), false, v_m_telefono, NULL, NULL);
      ELSIF v_caso = 'el Administrador de otra Prestadora cierra' THEN
        v_r := pg_temp.cerrar(v_admin_b, NULL, v_turno, now(), true, v_m_telefono, NULL, NULL);
      ELSIF v_caso = 'el trabajo de otra Prestadora autoriza en nombre de este Administrador' THEN
        v_r := pg_temp.cerrar(NULL, v_b, v_turno, now(), true, v_m_telefono, NULL, v_admin);
      ELSIF v_caso = 'el trabajo de la Prestadora autoriza en nombre de alguien de otra' THEN
        v_r := pg_temp.cerrar(NULL, v_a, v_turno, now(), true, v_m_telefono, NULL, v_admin_b);
      ELSIF v_caso = 'el Asistente da el permiso para que el Paciente quede solo' THEN
        v_r := pg_temp.paciente_solo(v_asistente, v_turno, v_paciente);
        SELECT count(*) INTO v_n FROM consentimientos_paciente_solo WHERE turno_guardia_id = v_turno AND quien_consintio = 'Familiar inventado';
        IF v_n <> 0 THEN v_r := 'quedó guardado el permiso'; END IF;
      END IF;

      IF NOT pg_temp.sigue_abierto(v_turno) THEN
        v_r := coalesce(v_r, 'nada') || ', y el turno quedó cerrado';
      END IF;
      RAISE EXCEPTION 'deshacer';
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM <> 'deshacer' THEN v_r := SQLERRM; END IF;
    END;
    IF v_r IS DISTINCT FROM v_esperado THEN
      v_fallas := v_fallas || (v_caso || ': esperaba ' || v_esperado || ' y dio ' || coalesce(v_r, 'nada'));
    END IF;
  END LOOP;

  -- LOS CIERRES VÁLIDOS. Cada uno se deshace antes del siguiente.

  -- El Administrador, con motivo y hora: queda completado con quién, cuándo y por qué.
  BEGIN
    INSERT INTO reportes (prestadora_id, turno_guardia_id, paciente_id)
    SELECT tp.prestadora_id, tp.turno_guardia_id, tp.paciente_id
      FROM turno_guardia_pacientes tp WHERE tp.turno_guardia_id = v_turno;
    v_r := pg_temp.cerrar(v_admin, NULL, v_turno, now() - interval '30 minutes', false, v_m_telefono, NULL, NULL);
    SELECT * INTO v_fila FROM turnos_guardia WHERE id = v_turno;
    IF v_r IS DISTINCT FROM 'completada' OR v_fila.estado <> 'completada' THEN
      v_fallas := v_fallas || ('el cierre del Administrador dio ' || coalesce(v_r, 'nada'));
    ELSIF v_fila.cerrada_por IS DISTINCT FROM v_admin OR v_fila.cerrada_motivo_id IS DISTINCT FROM v_m_telefono
       OR v_fila.cerrada_at IS NULL OR v_fila.cerrada_origen IS DISTINCT FROM 'panel'
       OR v_fila.checkout_at NOT BETWEEN now() - interval '31 minutes' AND now() - interval '29 minutes' THEN
      v_fallas := v_fallas || text 'el cierre del Administrador no anotó quién, cuándo, por qué o a qué hora';
    END IF;
    v_r := pg_temp.cerrar(v_admin, NULL, v_turno, now(), false, v_m_telefono, NULL, NULL);
    IF v_r IS DISTINCT FROM 'turno_guardia_ya_cerrado' THEN
      v_fallas := v_fallas || ('el segundo cierre dio ' || coalesce(v_r, 'nada'));
    END IF;
    RAISE EXCEPTION 'deshacer';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'deshacer' THEN v_fallas := v_fallas || ('cierre del Administrador: ' || SQLERRM); END IF;
  END;

  -- Con un Reporte pendiente, el cierre no se traba: queda en Salida sin Reporte.
  BEGIN
    v_r := pg_temp.cerrar(v_admin, NULL, v_turno, now(), true, v_m_otro, 'Detalle inventado', NULL);
    SELECT * INTO v_fila FROM turnos_guardia WHERE id = v_turno;
    IF v_r IS DISTINCT FROM 'salida_sin_reporte' OR v_fila.estado <> 'salida_sin_reporte' OR NOT v_fila.salio_sin_reporte THEN
      v_fallas := v_fallas || ('con el Reporte pendiente dio ' || coalesce(v_r, 'nada'));
    ELSIF v_fila.cerrada_motivo NOT LIKE '%Detalle inventado' THEN
      v_fallas := v_fallas || text 'el motivo otro no guardó el detalle';
    END IF;
    RAISE EXCEPTION 'deshacer';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'deshacer' THEN v_fallas := v_fallas || ('Reporte pendiente: ' || SQLERRM); END IF;
  END;

  -- El backend cierra la salida del Asistente, sin motivo: el cierre queda a nombre del Asistente.
  BEGIN
    INSERT INTO reportes (prestadora_id, turno_guardia_id, paciente_id)
    SELECT tp.prestadora_id, tp.turno_guardia_id, tp.paciente_id
      FROM turno_guardia_pacientes tp WHERE tp.turno_guardia_id = v_turno;
    v_r := pg_temp.cerrar(NULL, v_a, v_turno, now(), false, NULL, NULL, NULL);
    SELECT * INTO v_fila FROM turnos_guardia WHERE id = v_turno;
    IF v_r IS DISTINCT FROM 'completada' OR v_fila.checkout_at IS NULL
       OR v_fila.cerrada_origen IS DISTINCT FROM 'asistente' OR v_fila.cerrada_motivo_id IS NOT NULL THEN
      v_fallas := v_fallas || ('la salida del Asistente dio ' || coalesce(v_r, 'nada'));
    END IF;
    RAISE EXCEPTION 'deshacer';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'deshacer' THEN v_fallas := v_fallas || ('salida del Asistente: ' || SQLERRM); END IF;
  END;

  -- El backend registra la autorización de una salida en nombre de quien la autorizó.
  BEGIN
    INSERT INTO reportes (prestadora_id, turno_guardia_id, paciente_id)
    SELECT tp.prestadora_id, tp.turno_guardia_id, tp.paciente_id
      FROM turno_guardia_pacientes tp WHERE tp.turno_guardia_id = v_turno;
    v_r := pg_temp.cerrar(NULL, v_a, v_turno, now() - interval '5 minutes', false, v_m_telefono, NULL, v_admin);
    SELECT * INTO v_fila FROM turnos_guardia WHERE id = v_turno;
    IF v_r IS DISTINCT FROM 'completada' OR v_fila.cerrada_por IS DISTINCT FROM v_admin
       OR v_fila.cerrada_motivo_id IS DISTINCT FROM v_m_telefono THEN
      v_fallas := v_fallas || ('la autorización de la salida dio ' || coalesce(v_r, 'nada'));
    END IF;
    RAISE EXCEPTION 'deshacer';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'deshacer' THEN v_fallas := v_fallas || ('autorización: ' || SQLERRM); END IF;
  END;

  -- El Administrador da el permiso para que el Paciente quede solo: permiso y cierre juntos.
  BEGIN
    v_r := pg_temp.paciente_solo(v_admin, v_turno, v_paciente);
    SELECT * INTO v_fila FROM turnos_guardia WHERE id = v_turno;
    SELECT count(*) INTO v_n FROM consentimientos_paciente_solo
     WHERE turno_guardia_id = v_turno AND quien_consintio = 'Familiar inventado' AND registrado_por = v_admin;
    IF v_r IS DISTINCT FROM 'cerrado' THEN
      v_fallas := v_fallas || ('el permiso del Administrador dio ' || coalesce(v_r, 'nada'));
    ELSIF v_n <> 1 OR v_fila.estado <> 'salida_sin_reporte' OR v_fila.cerrada_motivo_id IS DISTINCT FROM v_m_solo THEN
      v_fallas := v_fallas || text 'el permiso no guardó el permiso y el cierre juntos';
    END IF;
    RAISE EXCEPTION 'deshacer';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'deshacer' THEN v_fallas := v_fallas || ('Paciente solo: ' || SQLERRM); END IF;
  END;

  PERFORM set_config('prueba.fallas', array_to_string(v_fallas, ' | '), true);
END;
$prueba$;

SELECT current_setting('prueba.fallas', true) AS fallas;

ROLLBACK;
`;

const carpeta = mkdtempSync(join(tmpdir(), 'cierre-'));
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
console.log('El turno de guardia se cierra sólo por su camino, con motivo, hora válida y quién cerró; el Reporte pendiente no lo traba.');
