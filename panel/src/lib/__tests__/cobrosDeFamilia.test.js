/**
 * Qué se admite como cobro de una Familia.
 *
 * Lo que se mira acá es sobre todo una cosa: que con qué se pagó ya no esté escrito adentro del
 * código. La lista sale de la base, quien comprueba la recibe, y sin ella no se admite nada.
 *
 * Y una segunda, que es la que se rompe sola con el tiempo: que el catálogo guardado en el Panel
 * para cuando no hay con quién hablar diga exactamente lo mismo que siembra la migración. Si una
 * de las dos cambia y la otra no, esta prueba lo dice.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loQueEstaMalEnElCobro, primerDiaDelPeriodo, aDosDecimales } from '../cobrosDeFamilia';
import { LISTAS_DE_OPCIONES_DE_FABRICA, opcionesDeFabrica } from '../../datos/listasDeOpciones';

const ADMITIDOS = ['transferencia', 'efectivo'];

describe('con qué se admite que pagó la Familia', () => {
  it('cada medio de la lista que le pasan se admite', () => {
    for (const medio of ADMITIDOS) {
      expect(loQueEstaMalEnElCobro({ monto: 100, medio }, ADMITIDOS)).toBe(null);
    }
  });

  it('un medio que no está en esa lista se rechaza', () => {
    expect(loQueEstaMalEnElCobro({ monto: 100, medio: 'trueque' }, ADMITIDOS)).toBeTruthy();
  });

  it('una opción que agregó la Prestadora se admite igual que una del producto', () => {
    expect(loQueEstaMalEnElCobro({ monto: 100, medio: 'billetera_virtual' }, ADMITIDOS)).toBeTruthy();
    expect(
      loQueEstaMalEnElCobro({ monto: 100, medio: 'billetera_virtual' }, [...ADMITIDOS, 'billetera_virtual']),
    ).toBe(null);
  });

  it('sin lista no se admite ningún medio: lo que no supo contra qué comparar niega', () => {
    expect(loQueEstaMalEnElCobro({ monto: 100, medio: 'efectivo' })).toBeTruthy();
    expect(loQueEstaMalEnElCobro({ monto: 100, medio: 'efectivo' }, [])).toBeTruthy();
    expect(loQueEstaMalEnElCobro({ monto: 100, medio: 'efectivo' }, null)).toBeTruthy();
  });

  it('el monto y la fecha se siguen comprobando como antes', () => {
    expect(loQueEstaMalEnElCobro({ monto: 0, medio: 'efectivo' }, ADMITIDOS)).toBeTruthy();
    expect(loQueEstaMalEnElCobro({ monto: 100, medio: 'efectivo', fecha_cobro: '10/08/2026' }, ADMITIDOS)).toBeTruthy();
    expect(primerDiaDelPeriodo('2026-08')).toBe('2026-08-01');
    expect(aDosDecimales(10.005)).toBe(10.01);
  });
});

describe('el catálogo guardado dice lo mismo que siembra la migración', () => {
  const migracion = readFileSync(
    fileURLToPath(
      new URL(
        '../../../../supabase/migrations/20261003120000_el_medio_de_pago_sale_del_catalogo.sql',
        import.meta.url,
      ),
    ),
    'utf8',
  );

  /* Las claves que siembra la migración para una lista, en el orden en que las siembra. Lo que se
     busca es el renglón de la siembra —clave, y en seguida el texto en los tres idiomas—, y no
     cualquier aparición del nombre de la lista: más abajo la migración se nombra a sí misma para
     comprobarse, y eso no es una opción. */
  const sembradasDe = (lista) =>
    [...migracion.matchAll(new RegExp(`\\('${lista}', '([a-z_]+)',\\s*'\\{`, 'g'))].map((m) => m[1]);

  for (const lista of ['medios_de_pago_de_la_familia', 'medios_de_pago_al_asistente']) {
    it(`las claves sembradas de ${lista} son las mismas, y en el mismo orden`, () => {
      const guardadas = LISTAS_DE_OPCIONES_DE_FABRICA[lista].opciones.map((o) => o.clave);
      expect(sembradasDe(lista)).toEqual(guardadas);
    });

    it(`${lista} admite opciones propias de cada Prestadora`, () => {
      expect(LISTAS_DE_OPCIONES_DE_FABRICA[lista].admite_opciones_propias).toBe(true);
      expect(migracion).toContain(`(NULL, '${lista}',`);
    });

    it(`cada opción guardada de ${lista} trae los tres idiomas`, () => {
      for (const opcion of opcionesDeFabrica(lista)) {
        expect(Object.keys(opcion.i18n).sort()).toEqual(['en', 'es-AR', 'pt-BR']);
        for (const texto of Object.values(opcion.i18n)) expect(texto.trim().length).toBeGreaterThan(0);
      }
    });
  }

  /* Los dos lados del dinero no eligen de la misma lista, y ésa es la razón de que sean dos. La
     Prestadora tiene habilitadas todas las posibilidades de cobranza; a una persona no se le paga
     con tarjeta, ni con débito automático, ni con cheque, ni con un «otro» que anota un pago sin
     decir con qué se pagó. La tercera forma del lado del Asistente —la que se pacte— es la puerta
     de las opciones propias, no una opción más. */
  it('la cobranza ofrece las seis y el pago al Asistente sólo dos', () => {
    expect(LISTAS_DE_OPCIONES_DE_FABRICA.medios_de_pago_de_la_familia.opciones.map((o) => o.clave)).toEqual([
      'transferencia',
      'efectivo',
      'tarjeta',
      'debito_automatico',
      'cheque',
      'otro',
    ]);
    expect(LISTAS_DE_OPCIONES_DE_FABRICA.medios_de_pago_al_asistente.opciones.map((o) => o.clave)).toEqual([
      'transferencia',
      'efectivo',
    ]);
  });

  it('del lado del Asistente no hay tarjeta, ni débito automático, ni cheque, ni «otro»', () => {
    const guardadas = LISTAS_DE_OPCIONES_DE_FABRICA.medios_de_pago_al_asistente.opciones.map((o) => o.clave);
    const sembradas = sembradasDe('medios_de_pago_al_asistente');
    for (const laQueNoVa of ['tarjeta', 'debito_automatico', 'cheque', 'otro']) {
      expect(sembradas).not.toContain(laQueNoVa);
      expect(guardadas).not.toContain(laQueNoVa);
    }
  });

  /* Y que cada disparador mire la lista de su lado. Cruzados, la base admitiría pagarle a un
     Asistente con tarjeta, que es justo lo que esta separación impide. */
  it('cada disparador mira la lista de su lado del dinero', () => {
    expect(migracion).toMatch(
      /ON public\.cobros_familia\s*\n\s*FOR EACH ROW EXECUTE FUNCTION interno\.el_medio_de_pago_sale_del_catalogo\('medio', 'medios_de_pago_de_la_familia'\)/,
    );
    expect(migracion).toMatch(
      /ON public\.liquidaciones_asistente\s*\n\s*FOR EACH ROW EXECUTE FUNCTION interno\.el_medio_de_pago_sale_del_catalogo\('forma_pago', 'medios_de_pago_al_asistente'\)/,
    );
  });

  /* Lo que ya estaba escrito a mano en una liquidación no se pierde: se conserva como opción de
     esa Prestadora, con el texto tal cual. La migración lo comprueba ella misma; acá se comprueba
     que siga haciéndolo. */
  it('la migración no deja ninguna liquidación con un medio que el catálogo no nombre', () => {
    expect(migracion).toContain('lo_que_habia_escrito');
    expect(migracion).toContain('quedaron liquidaciones con un medio que el catalogo no nombra');
  });
});
