/**
 * La regla de quién habilita a quién está escrita dos veces, y las dos tienen que decir lo mismo.
 *
 *   node --test "src/**\/__tests__/*.test.js"   (desde backend/)
 *
 * POR QUÉ ESTÁ ESCRITA DOS VECES. El backend entra a la base con la llave de servicio, así que sin el
 * control de este lado la regla de la base nunca se evaluaría con lo que el backend sabe; y sin la de
 * la base, cualquier camino nuevo que escriba en esas tablas nacería sin control. Dos copias de la
 * misma decisión son dos lugares donde corregirla, y basta con que alguien arregle una para que la
 * otra quede contestando otra cosa: eso es exactamente lo que había pasado.
 *
 * QUÉ SE PRUEBA ACÁ Y QUÉ NO. Sin base levantada nada de este archivo puede ejecutar una función de
 * Postgres ni un disparador. Lo que sí se puede comprobar es que la foto de la base diga lo que tiene
 * que decir y que los escalones de los dos lados coincidan uno por uno. Que el disparador ataje de
 * verdad no está probado acá: hace falta la base levantada.
 *
 * Los datos son inventados.
 */
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { definicionDeFuncion, filasDeFabrica, laFoto, permisosDeFuncion } from '../../__tests__/laFotoDeLaBase.js';

process.env.SUPABASE_URL ||= 'http://127.0.0.1:1';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'clave-de-mentira';

const { escalonDelRol, puedeHabilitar } = await import('../habilitarCambioDeClave.js');

const EL_ESCALON = definicionDeFuncion('interno.escalon_del_rol');
const PUEDE_HABILITAR = definicionDeFuncion('interno.puede_habilitar');
const EL_DISPARADOR = definicionDeFuncion('interno.se_habilita_hacia_abajo_y_nunca_a_uno_mismo');

const LOS_CINCO_ROLES = ['superadmin', 'admin_prestadora', 'coordinador', 'asistente', 'cliente'];

describe('el backend: un rol que no se entiende no habilita a nadie', () => {
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
    assert.equal(puedeHabilitar('coordinador', 'cliente'), true);
    assert.equal(puedeHabilitar('admin_prestadora', 'coordinador'), true);
    assert.equal(puedeHabilitar('superadmin', 'admin_prestadora'), true);
    assert.equal(puedeHabilitar('coordinador', 'coordinador'), false);
    assert.equal(puedeHabilitar('coordinador', 'admin_prestadora'), false);
  });
});

describe('la base dice lo mismo que el backend', () => {
  it('la foto trae las tres funciones', () => {
    for (const definicion of [EL_ESCALON, PUEDE_HABILITAR, EL_DISPARADOR]) {
      assert.notEqual(definicion, '', 'la foto de la base no trae una de las funciones de la regla');
    }
  });

  it('el rol que no se entiende no tiene escalón: la base devuelve nulo, no un número', () => {
    assert.match(EL_ESCALON, /ELSE NULL::smallint/);
    const conNumero = /ELSE\s+\d+::smallint/.exec(EL_ESCALON);
    assert.equal(conNumero, null, 'el rol desconocido volvió a tener un número de escalón');
  });

  it('los cinco escalones son los mismos de los dos lados', () => {
    for (const rol of LOS_CINCO_ROLES) {
      const renglon = new RegExp(`WHEN '${rol}' THEN (\\d+)::smallint`).exec(EL_ESCALON);
      assert.ok(renglon, `la base no define el escalón de ${rol}`);
      assert.equal(Number(renglon[1]), escalonDelRol(rol), `el escalón de ${rol} no coincide`);
    }
  });

  it('la comparación falla cerrada: el nulo se resuelve negando, no comparando', () => {
    assert.match(PUEDE_HABILITAR, /COALESCE\(\s*interno\.escalon_del_rol/);
    assert.match(PUEDE_HABILITAR, /false\s*\)/);
  });

  it('el disparador no compara escalones por su cuenta', () => {
    assert.match(
      EL_DISPARADOR,
      /IF NOT interno\.puede_habilitar\(v_quien\.rol, v_destinatario\.rol\) THEN/,
    );
    assert.ok(
      !/escalon_del_rol\(v_quien\.rol\)\s*<=/.test(EL_DISPARADOR),
      'el disparador volvió a comparar los escalones por su cuenta',
    );
  });

  it('las funciones viven en el esquema de adentro y no las alcanza nadie sin sesión', () => {
    assert.ok(!/CREATE FUNCTION public\.(puede_habilitar|escalon_del_rol)\(/.test(laFoto()));
    const permisos = permisosDeFuncion('interno.puede_habilitar');
    assert.ok(permisos.some((p) => /^REVOKE ALL .* FROM PUBLIC;$/.test(p)));
    assert.ok(!permisos.some((p) => /^GRANT .* TO anon;$/.test(p)), 'puede_habilitar quedó al alcance anónimo');
  });

  it('ninguna de las tres se saltea la protección por fila', () => {
    for (const definicion of [EL_ESCALON, PUEDE_HABILITAR, EL_DISPARADOR]) {
      assert.ok(!/SECURITY DEFINER/.test(definicion.split('AS $$')[0]));
    }
  });
});

describe('la coordinación habilita el cambio de clave de fábrica', () => {
  it('el valor de fábrica no está reservado a la administración', () => {
    const accion = filasDeFabrica('catalogo_acciones_permisos').find(
      (fila) => fila.accion === 'habilitar_cambio_de_clave',
    );
    assert.ok(accion, 'la foto de la base no siembra la acción');
    assert.equal(accion.default_solo_admin, false);
  });
});
