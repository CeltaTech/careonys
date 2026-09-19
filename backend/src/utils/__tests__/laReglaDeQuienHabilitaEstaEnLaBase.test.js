/**
 * La regla de quién habilita a quién está escrita dos veces, y las dos tienen que decir lo mismo.
 *
 *   node --test "src/**\/__tests__/*.test.js"   (desde backend/)
 *
 * POR QUÉ ESTÁ ESCRITA DOS VECES. El motor entra a la base con la llave de servicio, así que sin el
 * control de este lado la regla de la base nunca se evaluaría con lo que el motor sabe; y sin la de
 * la base, cualquier camino nuevo que escriba en esas tablas nacería sin control. Dos copias de la
 * misma decisión son dos lugares donde corregirla, y basta con que alguien arregle una para que la
 * otra quede contestando otra cosa: eso es exactamente lo que había pasado.
 *
 * QUÉ SE PRUEBA ACÁ Y QUÉ NO. Sin base levantada nada de este archivo puede ejecutar una función de
 * Postgres ni un disparador. Lo que sí se puede comprobar es que la migración diga lo que tiene que
 * decir y que los escalones de los dos lados coincidan uno por uno. Que la migración corra bien se
 * comprueba al aplicarla: termina con su propio bloque de comprobación, que prueba los dos sentidos
 * —que el rol desconocido no habilite, y que los conocidos sigan habilitando—.
 *
 * Los datos son inventados.
 */
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

process.env.SUPABASE_URL ||= 'http://127.0.0.1:1';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'clave-de-mentira';

const { escalonDelRol, puedeHabilitar } = await import('../habilitarCambioDeClave.js');

function migracion(nombre) {
  return readFileSync(
    fileURLToPath(new URL(`../../../../supabase/migrations/${nombre}`, import.meta.url)),
    'utf8',
  );
}

const EL_ROL_QUE_NO_SE_ENTIENDE = migracion(
  '20261004120000_un_rol_que_no_se_entiende_no_habilita_a_nadie.sql',
);
const LA_COORDINACION_HABILITA = migracion(
  '20261004130000_la_coordinacion_habilita_el_cambio_de_clave_de_fabrica.sql',
);

const LOS_CINCO_ROLES = ['superadmin', 'admin_prestadora', 'coordinador', 'asistente', 'familia'];

describe('el motor: un rol que no se entiende no habilita a nadie', () => {
  it('no habilita a nadie, de ningún escalón', () => {
    for (const rol of LOS_CINCO_ROLES) {
      assert.equal(puedeHabilitar('lo_que_sea', rol), false);
    }
  });

  it('no lo habilita nadie, tampoco el rol técnico de la empresa', () => {
    for (const rol of LOS_CINCO_ROLES) {
      assert.equal(puedeHabilitar(rol, 'lo_que_sea'), false);
    }
  });

  // El control roto a propósito: los mismos escalones, con roles que sí se entienden, habilitan.
  it('los roles que sí se entienden siguen habilitando hacia abajo', () => {
    assert.equal(puedeHabilitar('coordinador', 'asistente'), true);
    assert.equal(puedeHabilitar('coordinador', 'familia'), true);
    assert.equal(puedeHabilitar('admin_prestadora', 'coordinador'), true);
    assert.equal(puedeHabilitar('superadmin', 'admin_prestadora'), true);
    assert.equal(puedeHabilitar('coordinador', 'coordinador'), false);
    assert.equal(puedeHabilitar('coordinador', 'admin_prestadora'), false);
  });
});

describe('la base dice lo mismo que el motor', () => {
  it('el rol que no se entiende no tiene escalón: la base devuelve nulo, no un número', () => {
    assert.match(EL_ROL_QUE_NO_SE_ENTIENDE, /ELSE NULL::smallint/);
    const conNumero = /ELSE\s+\d+::smallint/.exec(EL_ROL_QUE_NO_SE_ENTIENDE);
    assert.equal(conNumero, null, 'el rol desconocido volvió a tener un número de escalón');
  });

  it('los cinco escalones son los mismos de los dos lados', () => {
    for (const rol of LOS_CINCO_ROLES) {
      const renglon = new RegExp(`WHEN '${rol}' THEN (\\d+)::smallint`).exec(
        EL_ROL_QUE_NO_SE_ENTIENDE,
      );
      assert.ok(renglon, `la migración no define el escalón de ${rol}`);
      assert.equal(Number(renglon[1]), escalonDelRol(rol), `el escalón de ${rol} no coincide`);
    }
  });

  it('la comparación falla cerrada: el nulo se resuelve negando, no comparando', () => {
    assert.match(
      EL_ROL_QUE_NO_SE_ENTIENDE,
      /CREATE OR REPLACE FUNCTION interno\.puede_habilitar\(/,
    );
    assert.match(EL_ROL_QUE_NO_SE_ENTIENDE, /COALESCE\(\s*\n?\s*interno\.escalon_del_rol/);
    assert.match(EL_ROL_QUE_NO_SE_ENTIENDE, /false\s*\n?\s*\)/);
  });

  it('el disparador ya no compara escalones por su cuenta', () => {
    assert.match(
      EL_ROL_QUE_NO_SE_ENTIENDE,
      /IF NOT interno\.puede_habilitar\(v_quien\.rol, v_destinatario\.rol\) THEN/,
    );
    assert.ok(
      !/escalon_del_rol\(v_quien\.rol\)\s*<=/.test(EL_ROL_QUE_NO_SE_ENTIENDE),
      'el disparador volvió a comparar los escalones por su cuenta',
    );
  });

  it('las funciones viven en el esquema de adentro y pierden el alcance anónimo', () => {
    assert.ok(!/CREATE OR REPLACE FUNCTION public\./.test(EL_ROL_QUE_NO_SE_ENTIENDE));
    assert.match(
      EL_ROL_QUE_NO_SE_ENTIENDE,
      /REVOKE ALL ON FUNCTION interno\.puede_habilitar\(text, text\) FROM PUBLIC;/,
    );
    assert.match(
      EL_ROL_QUE_NO_SE_ENTIENDE,
      /REVOKE ALL ON FUNCTION interno\.puede_habilitar\(text, text\) FROM anon;/,
    );
  });

  it('ningún disparador se saltea la protección por fila', () => {
    const declarada = EL_ROL_QUE_NO_SE_ENTIENDE
      .split('\n')
      .filter((linea) => /^\s*SECURITY\s+DEFINER\s*$/i.test(linea));
    assert.deepEqual(declarada, []);
  });
});

describe('la coordinación habilita el cambio de clave de fábrica', () => {
  it('el valor de fábrica deja de estar reservado a la administración', () => {
    assert.match(
      LA_COORDINACION_HABILITA,
      /UPDATE public\.catalogo_acciones_permisos\s*\n\s*SET default_solo_admin = false\s*\n\s*WHERE accion = 'habilitar_cambio_de_clave';/,
    );
  });

  it('lo que cada Prestadora ya configuró no se toca', () => {
    assert.ok(
      !/UPDATE public\.permisos_prestadora|INSERT INTO public\.permisos_prestadora|DELETE FROM public\.permisos_prestadora/
        .test(LA_COORDINACION_HABILITA),
      'la migración le pisó a alguna Prestadora lo que había elegido',
    );
  });

  it('el escalón no se toca: sigue viviendo donde vivía', () => {
    assert.ok(!/escalon_del_rol|se_habilita_hacia_abajo_y_nunca_a_uno_mismo\(\)\s*\nRETURNS/
      .test(LA_COORDINACION_HABILITA));
  });
});

describe('las dos migraciones cierran como corresponde', () => {
  for (const [nombre, texto] of [
    ['el rol que no se entiende', EL_ROL_QUE_NO_SE_ENTIENDE],
    ['la coordinación habilita', LA_COORDINACION_HABILITA],
  ]) {
    it(`${nombre}: corre entera o no corre, y avisa del cambio de esquema`, () => {
      assert.match(texto, /^BEGIN;$/m);
      assert.match(texto, /^COMMIT;$/m);
      assert.match(texto, /NOTIFY pgrst, 'reload schema';\s*$/);
      // El bloque de comprobación es lo que hace que la migración falle si no quedó completa.
      assert.match(texto, /RAISE EXCEPTION/);
    });
  }
});
