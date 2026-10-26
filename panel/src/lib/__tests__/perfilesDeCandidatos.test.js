/**
 * Las tres formas armadas de ordenar la lista de candidatos.
 *
 *   npx vitest run --dir src/lib   (desde `panel/`)
 *
 * POR QUÉ EXISTE ESTA PRUEBA. Acá se apilan tres capas —los valores de fábrica, lo que corre el
 * perfil elegido y lo que esa Prestadora cambió número por número— y el orden importa: si la capa
 * de abajo tapara a la de arriba, la Prestadora configuraría y no pasaría nada. Y se guarda
 * solamente lo que se corrió, nunca la tabla entera: guardar los cuarenta números congelaría los
 * valores de fábrica el día que alguien abra la pantalla y le dé a guardar sin tocar nada.
 */
import { describe, expect, it } from 'vitest';
import {
  NIVELES,
  bordeEnPantalla,
  topeEnPantalla,
  topeGuardado,
  NOMBRES_DE_PERFIL,
  PERFILES,
  PERFIL_POR_DEFECTO,
  PESOS,
  PESOS_QUE_SE_PUEDEN_TOCAR,
  TOPES,
  SITUACIONES_PONDERABLES,
  TOPES_QUE_SE_PUEDEN_TOCAR,
  nivelMasCercano,
  pesoDeNivel,
  pesosYTopesDe,
  revisarCambios,
  soloLoQueCorreDelPerfil,
} from '../perfilesDeCandidatos';

describe('las tres capas, y la última manda', () => {
  it('sin nada guardado salen los valores de fábrica', () => {
    const { perfil, pesos, topes } = pesosYTopesDe(null);
    expect(perfil).toBe(PERFIL_POR_DEFECTO);
    expect(pesos).toEqual(PESOS);
    expect(topes).toEqual(TOPES);
  });

  it('el perfil corre lo suyo y deja el resto de fábrica', () => {
    const { pesos, topes } = pesosYTopesDe({ perfil: 'descanso', pesos: {}, topes: {} });
    expect(pesos.descanso_corto).toBe(pesoDeNivel('descanso_corto', 'mucho'));
    expect(topes.horas_descanso_minimo).toBe(14);
    expect(pesos.cerca).toBe(PESOS.cerca);
  });

  it('lo que la Prestadora corrió tapa al perfil', () => {
    const { pesos } = pesosYTopesDe({ perfil: 'descanso', pesos: { descanso_corto: -20 }, topes: {} });
    expect(pesos.descanso_corto).toBe(-20);
  });

  it('un perfil que no existe cae en el que viene de fábrica', () => {
    const { perfil, pesos } = pesosYTopesDe({ perfil: 'lo_que_sea', pesos: {}, topes: {} });
    expect(perfil).toBe(PERFIL_POR_DEFECTO);
    expect(pesos).toEqual(PESOS);
  });

  it('los tres perfiles dejan la tabla completa, sin agujeros', () => {
    for (const nombre of NOMBRES_DE_PERFIL) {
      const { pesos, topes } = pesosYTopesDe({ perfil: nombre });
      expect(Object.keys(pesos).sort()).toEqual(Object.keys(PESOS).sort());
      expect(Object.keys(topes).sort()).toEqual(Object.keys(TOPES).sort());
    }
  });
});

describe('lo guardado que ya no sirve se ignora, no rompe', () => {
  it('una clave que no se puede tocar no entra', () => {
    // `ocupado` manda al fondo lo que ya está bloqueado. Si entrara, se podría subir a la cabeza
    // de la lista a alguien que no puede tomar la guardia.
    const { pesos } = pesosYTopesDe({ perfil: 'continuidad', pesos: { ocupado: 500 }, topes: {} });
    expect(pesos.ocupado).toBe(PESOS.ocupado);
  });

  it('un número fuera de borde tampoco', () => {
    const { pesos } = pesosYTopesDe({ perfil: 'continuidad', pesos: { cerca: -1000 }, topes: {} });
    expect(pesos.cerca).toBe(PESOS.cerca);
  });

  it('lo que no es un número tampoco', () => {
    const { topes } = pesosYTopesDe({ perfil: 'continuidad', pesos: {}, topes: { km_cerca: 'ocho' } });
    expect(topes.km_cerca).toBe(TOPES.km_cerca);
  });
});

describe('se guarda lo que se corrió, y nada más', () => {
  it('la tabla igual al perfil no guarda nada', () => {
    const armado = pesosYTopesDe({ perfil: 'cercania' });
    const corridos = soloLoQueCorreDelPerfil('cercania', armado.pesos, armado.topes);
    expect(corridos).toEqual({ pesos: {}, topes: {} });
  });

  it('un número cambiado se guarda solo', () => {
    const armado = pesosYTopesDe({ perfil: 'descanso' });
    const corridos = soloLoQueCorreDelPerfil('descanso', { ...armado.pesos, cerca: 22 }, armado.topes);
    expect(corridos.pesos).toEqual({ cerca: 22 });
    expect(corridos.topes).toEqual({});
  });

  it('lo que el perfil ya corre no se vuelve a guardar', () => {
    // Si se guardara, esa Prestadora se quedaría con una copia vieja el día que el perfil cambie.
    const armado = pesosYTopesDe({ perfil: 'descanso' });
    const corridos = soloLoQueCorreDelPerfil('descanso', armado.pesos, armado.topes);
    expect(corridos.pesos.descanso_corto).toBeUndefined();
    expect(PERFILES.descanso.pesos.descanso_corto).toBe(pesoDeNivel('descanso_corto', 'mucho'));
  });

  it('lo guardado y lo leído dan la vuelta completa sin cambiar nada', () => {
    const elegido = { ...pesosYTopesDe({ perfil: 'cercania' }).pesos, lejos: -40 };
    const corridos = soloLoQueCorreDelPerfil('cercania', elegido, pesosYTopesDe({ perfil: 'cercania' }).topes);
    const vuelta = pesosYTopesDe({ perfil: 'cercania', ...corridos });
    expect(vuelta.pesos).toEqual(elegido);
  });
});

describe('lo que llega de afuera se revisa antes de guardarlo', () => {
  it('lo que está adentro del borde pasa', () => {
    expect(revisarCambios('descanso', { cerca: 22 }, { km_lejos: 30 })).toEqual({ ok: true });
  });

  it('un perfil que no existe no pasa, y se dice cuál falló', () => {
    expect(revisarCambios('lo_que_sea', {}, {})).toEqual({ ok: false, clave: 'perfil' });
  });

  it('un peso fuera de borde no pasa', () => {
    expect(revisarCambios('continuidad', { cerca: -1000 }, {})).toEqual({ ok: false, clave: 'cerca' });
  });

  it('un tope fuera de borde no pasa', () => {
    expect(revisarCambios('continuidad', {}, { horas_semanales: 400 })).toEqual({
      ok: false,
      clave: 'horas_semanales',
    });
  });

  it('una clave desconocida no pasa', () => {
    expect(revisarCambios('continuidad', { ocupado: 500 }, {})).toEqual({ ok: false, clave: 'ocupado' });
  });

  it('cada borde deja pasar sus dos extremos y rechaza lo de afuera', () => {
    for (const [clave, borde] of Object.entries(PESOS_QUE_SE_PUEDEN_TOCAR)) {
      expect(revisarCambios('continuidad', { [clave]: borde.minimo }, {}).ok).toBe(true);
      expect(revisarCambios('continuidad', { [clave]: borde.maximo }, {}).ok).toBe(true);
      expect(revisarCambios('continuidad', { [clave]: borde.minimo - 1 }, {}).ok).toBe(false);
      expect(revisarCambios('continuidad', { [clave]: borde.maximo + 1 }, {}).ok).toBe(false);
    }
    for (const [clave, borde] of Object.entries(TOPES_QUE_SE_PUEDEN_TOCAR)) {
      expect(revisarCambios('continuidad', {}, { [clave]: borde.minimo }).ok).toBe(true);
      expect(revisarCambios('continuidad', {}, { [clave]: borde.maximo }).ok).toBe(true);
      expect(revisarCambios('continuidad', {}, { [clave]: borde.maximo + 1 }).ok).toBe(false);
    }
  });

  it('ningún borde deja llegar al número con el que el sistema bloquea', () => {
    // Es el motivo por el que hay bordes: −1000 es lo que el sistema usa para mandar al fondo a
    // quien no puede tomar la guardia. Que nadie lo alcance desde la configuración.
    for (const borde of Object.values(PESOS_QUE_SE_PUEDEN_TOCAR)) {
      expect(borde.minimo).toBeGreaterThan(-1000);
      expect(borde.maximo).toBeLessThan(1000);
    }
  });
});

describe('la ponderación por niveles', () => {
  it('«Bastante» es el valor de fábrica de cada situación', () => {
    for (const clave of SITUACIONES_PONDERABLES) {
      expect(pesoDeNivel(clave, 'bastante')).toBe(PESOS[clave]);
    }
  });

  it('«Poco» es la mitad, «Mucho» dos veces y media y «No importa» cero, redondeado con el signo de fábrica', () => {
    expect(pesoDeNivel('continuidad_por_vez', 'poco')).toBe(6);
    expect(pesoDeNivel('continuidad_por_vez', 'mucho')).toBe(30);
    expect(pesoDeNivel('sin_continuidad', 'poco')).toBe(-3);
    expect(pesoDeNivel('sin_continuidad', 'mucho')).toBe(-13);
    expect(pesoDeNivel('documentos_al_dia', 'mucho')).toBe(13);
    expect(pesoDeNivel('descanso_corto', 'mucho')).toBe(-63);
    expect(Object.is(pesoDeNivel('lejos', 'no_importa'), 0)).toBe(true);
  });

  it('ningún nivel cambia de signo ni se sale del borde', () => {
    for (const clave of SITUACIONES_PONDERABLES) {
      const borde = PESOS_QUE_SE_PUEDEN_TOCAR[clave];
      for (const nivel of NIVELES) {
        const valor = pesoDeNivel(clave, nivel);
        expect(Number.isInteger(valor)).toBe(true);
        expect(valor).toBeGreaterThanOrEqual(borde.minimo);
        expect(valor).toBeLessThanOrEqual(borde.maximo);
        expect(valor * PESOS[clave]).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('los bloqueos y el techo de la continuidad no se ponderan', () => {
    expect(SITUACIONES_PONDERABLES).not.toContain('continuidad_maxima');
    expect(SITUACIONES_PONDERABLES).not.toContain('ocupado');
    expect(SITUACIONES_PONDERABLES).toHaveLength(11);
  });

  it('cada nivel se reconoce a sí mismo', () => {
    for (const clave of SITUACIONES_PONDERABLES) {
      for (const nivel of NIVELES) {
        expect(nivelMasCercano(clave, pesoDeNivel(clave, nivel))).toBe(nivel);
      }
    }
  });

  it('un número que no es de ningún nivel muestra el más cercano', () => {
    // descanso_ok: No importa 0, Poco 3, Bastante 6, Mucho 15.
    expect(nivelMasCercano('descanso_ok', 14)).toBe('mucho');
    expect(nivelMasCercano('descanso_ok', 9)).toBe('bastante');
    expect(nivelMasCercano('descanso_ok', 1)).toBe('no_importa');
    // lejos: 0, −6, −12, −30.
    expect(nivelMasCercano('lejos', -8)).toBe('poco');
    expect(nivelMasCercano('lejos', -25)).toBe('mucho');
  });

  it('sin número guardado muestra el de fábrica', () => {
    expect(nivelMasCercano('cerca', undefined)).toBe('bastante');
    expect(nivelMasCercano('cerca', '')).toBe('bastante');
  });

  it('los perfiles armados ponen en «Mucho» lo que suben', () => {
    for (const clave of ['descanso_ok', 'descanso_corto', 'horas_cerca_del_tope', 'horas_pasa_el_tope']) {
      expect(PERFILES.descanso.pesos[clave]).toBe(pesoDeNivel(clave, 'mucho'));
    }
    for (const clave of ['cerca', 'lejos']) {
      expect(PERFILES.cercania.pesos[clave]).toBe(pesoDeNivel(clave, 'mucho'));
    }
  });
});

describe('el techo de la continuidad se cuenta en veces', () => {
  it('de fábrica cuentan cinco veces, y el techo es cinco por lo que suma cada una', () => {
    const { pesos, topes } = pesosYTopesDe(null);
    expect(topes.continuidad_veces_maxima).toBe(5);
    expect(pesos.continuidad_maxima).toBe(60);
    expect(PESOS.continuidad_maxima).toBe(TOPES.continuidad_veces_maxima * PESOS.continuidad_por_vez);
  });

  it('en «descanso» y «cercanía» cuentan tres', () => {
    for (const nombre of ['descanso', 'cercania']) {
      const { pesos, topes } = pesosYTopesDe({ perfil: nombre });
      expect(topes.continuidad_veces_maxima).toBe(3);
      expect(pesos.continuidad_maxima).toBe(36);
    }
  });

  it('el techo sigue a lo que suma cada vez', () => {
    const { pesos } = pesosYTopesDe({
      perfil: 'continuidad',
      pesos: { continuidad_por_vez: pesoDeNivel('continuidad_por_vez', 'mucho') },
      topes: { continuidad_veces_maxima: 4 },
    });
    expect(pesos.continuidad_maxima).toBe(4 * 30);
  });

  it('un techo guardado como puntaje ya no se toma', () => {
    const { pesos } = pesosYTopesDe({ perfil: 'continuidad', pesos: { continuidad_maxima: 200 }, topes: {} });
    expect(pesos.continuidad_maxima).toBe(60);
  });
});

describe('el aviso de horas se ve en porcentaje y se guarda en proporción', () => {
  const clave = 'proporcion_horas_para_avisar';

  it('de fábrica se ve 75, entre 10 y 100, de a uno', () => {
    expect(topeEnPantalla(clave, TOPES[clave])).toBe(75);
    expect(bordeEnPantalla(clave, TOPES_QUE_SE_PUEDEN_TOCAR[clave])).toEqual({ minimo: 10, maximo: 100, paso: 1 });
  });

  it('lo escrito vuelve a proporción, entero, y pasa la revisión del Backend', () => {
    expect(topeGuardado(clave, 60)).toBe(0.6);
    expect(topeGuardado(clave, 60.4)).toBe(0.6);
    expect(revisarCambios('continuidad', {}, { [clave]: topeGuardado(clave, 10) }).ok).toBe(true);
    expect(revisarCambios('continuidad', {}, { [clave]: topeGuardado(clave, 5) }).ok).toBe(false);
  });

  it('la Prestadora que lo cambia lo guarda para sí, y la que no, sigue con el de fábrica', () => {
    const propia = soloLoQueCorreDelPerfil('continuidad', {}, { ...TOPES, [clave]: topeGuardado(clave, 60) });
    expect(propia.topes).toEqual({ [clave]: 0.6 });
    expect(pesosYTopesDe({ perfil: 'continuidad', topes: propia.topes }).topes[clave]).toBe(0.6);
    expect(pesosYTopesDe({ perfil: 'continuidad', topes: {} }).topes[clave]).toBe(0.75);
  });

  it('los demás topes no se convierten', () => {
    expect(topeEnPantalla('km_cerca', 15)).toBe(15);
    expect(topeGuardado('km_cerca', 15)).toBe(15);
    expect(bordeEnPantalla('km_cerca', TOPES_QUE_SE_PUEDEN_TOCAR.km_cerca).paso).toBe('any');
  });
});
