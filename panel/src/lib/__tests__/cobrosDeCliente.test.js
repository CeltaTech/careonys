/**
 * Qué se admite como cobro de un Cliente.
 *
 * Lo que se mira acá es sobre todo una cosa: que con qué se pagó ya no esté escrito adentro del
 * código. La lista sale de la base, quien comprueba la recibe, y sin ella no se admite nada.
 *
 * Y una segunda, que es la que se rompe sola con el tiempo: que el catálogo guardado en el Panel
 * para cuando no hay con quién hablar diga exactamente lo mismo que siembra la base. Si una
 * de las dos cambia y la otra no, esta prueba lo dice.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loQueEstaMalEnElCobro, primerDiaDelPeriodo, aDosDecimales } from '../cobrosDeCliente';
import { LISTAS_DE_OPCIONES_DE_FABRICA, opcionesDeFabrica } from '../../datos/listasDeOpciones';

const ADMITIDOS = ['transferencia', 'efectivo'];

describe('con qué se admite que pagó el Cliente', () => {
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

describe('el catálogo guardado dice lo mismo que siembra la base', () => {
  /* La foto de la base es la migración que arma la base entera. Las filas de fábrica van ahí como un
     arreglo JSON entre `jsonb_populate_recordset(NULL::public.<tabla>, $fila$[` y `]$fila$`. */
  const foto = readFileSync(
    fileURLToPath(
      new URL('../../../../supabase/migrations/20261016000000_foto_de_la_base.sql', import.meta.url),
    ),
    'utf8',
  );
  const filasDeFabrica = (tabla) => {
    const inicio = `jsonb_populate_recordset(NULL::public.${tabla}, $fila$[`;
    const desde = foto.indexOf(inicio);
    if (desde === -1) return [];
    return JSON.parse(foto.slice(desde + inicio.length - 1, foto.indexOf(']$fila$', desde) + 1));
  };
  const listas = filasDeFabrica('listas_de_opciones');
  const opciones = filasDeFabrica('opciones_de_lista');
  const listaDeFabrica = (clave) => listas.find((l) => l.clave === clave && l.prestadora_id === null);

  /* Las opciones que siembra la base para una lista, en su orden. */
  const sembradasDe = (lista) =>
    opciones
      .filter((o) => o.lista_id === listaDeFabrica(lista)?.id && o.prestadora_id === null)
      .sort((a, b) => a.orden - b.orden);

  it('la foto trae las dos listas, y la siembra sigue teniendo la forma que la prueba lee', () => {
    expect(listaDeFabrica('medios_de_pago_del_cliente')).toBeTruthy();
    expect(listaDeFabrica('medios_de_pago_al_asistente')).toBeTruthy();
  });

  for (const lista of ['medios_de_pago_del_cliente', 'medios_de_pago_al_asistente']) {
    it(`las claves sembradas de ${lista} son las mismas, y en el mismo orden`, () => {
      const guardadas = LISTAS_DE_OPCIONES_DE_FABRICA[lista].opciones.map((o) => o.clave);
      expect(sembradasDe(lista).map((o) => o.clave)).toEqual(guardadas);
    });

    it(`${lista} admite opciones propias de cada Prestadora`, () => {
      expect(LISTAS_DE_OPCIONES_DE_FABRICA[lista].admite_opciones_propias).toBe(true);
      expect(listaDeFabrica(lista).admite_opciones_propias).toBe(true);
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
  it('la cobranza ofrece las seis y el pago al Asistente tres', () => {
    expect(LISTAS_DE_OPCIONES_DE_FABRICA.medios_de_pago_del_cliente.opciones.map((o) => o.clave)).toEqual([
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
      'pago_en_bloque',
    ]);
  });

  /* Y el tercero no vale en todas partes: recibe el dinero en bloque y lo reparte, y eso en Match
     no existe. Quien centraliza esa plata queda pareciendo el que dirige el trabajo. Que sea
     imposible elegirlo ahí lo impone la base; acá se comprueba que la marca esté puesta. */
  it('el medio que reparte en bloque entra sólo en prestación directa', () => {
    const enBloque = LISTAS_DE_OPCIONES_DE_FABRICA.medios_de_pago_al_asistente.opciones.find(
      (o) => o.clave === 'pago_en_bloque',
    );
    expect(enBloque.modalidades).toEqual(['directa']);
    // La marca tiene que estar en la opción que siembra la base, no sólo en el archivo guardado.
    const sembrada = sembradasDe('medios_de_pago_al_asistente').find((o) => o.clave === 'pago_en_bloque');
    expect(sembrada.modalidades).toEqual(['directa']);
    // Y lo hace cumplir un disparador sobre las liquidaciones.
    expect(foto).toMatch(
      /ON public\.liquidaciones_asistente FOR EACH ROW EXECUTE FUNCTION interno\.el_medio_de_pago_alcanza_la_modalidad\(\);/,
    );
    // Que además no puede saltearse las reglas de acceso.
    const funcion = foto.slice(foto.indexOf('\nCREATE FUNCTION interno.el_medio_de_pago_alcanza_la_modalidad('));
    expect(funcion.slice(0, funcion.indexOf('AS $$'))).not.toMatch(/SECURITY DEFINER/);
  });

  /* Lo que ya estaba no cambia de alcance: sin marca, una opción vale en todas las modalidades. */
  it('los medios que ya estaban siguen valiendo en todas las modalidades', () => {
    for (const clave of ['transferencia', 'efectivo']) {
      const opcion = LISTAS_DE_OPCIONES_DE_FABRICA.medios_de_pago_al_asistente.opciones.find(
        (o) => o.clave === clave,
      );
      expect(opcion.modalidades).toBe(undefined);
    }
  });

  it('del lado del Asistente no hay tarjeta, ni débito automático, ni cheque, ni «otro»', () => {
    const guardadas = LISTAS_DE_OPCIONES_DE_FABRICA.medios_de_pago_al_asistente.opciones.map((o) => o.clave);
    const sembradas = sembradasDe('medios_de_pago_al_asistente').map((o) => o.clave);
    for (const laQueNoVa of ['tarjeta', 'debito_automatico', 'cheque', 'otro']) {
      expect(sembradas).not.toContain(laQueNoVa);
      expect(guardadas).not.toContain(laQueNoVa);
    }
  });

  /* Y que cada disparador mire la lista de su lado. Cruzados, la base admitiría pagarle a un
     Asistente con tarjeta, que es justo lo que esta separación impide. */
  it('cada disparador mira la lista de su lado del dinero', () => {
    expect(foto).toMatch(
      /ON public\.cobros_cliente FOR EACH ROW EXECUTE FUNCTION interno\.el_medio_de_pago_sale_del_catalogo\('medio', 'medios_de_pago_del_cliente'\);/,
    );
    expect(foto).toMatch(
      /ON public\.liquidaciones_asistente FOR EACH ROW EXECUTE FUNCTION interno\.el_medio_de_pago_sale_del_catalogo\('forma_pago', 'medios_de_pago_al_asistente'\);/,
    );
  });
});
