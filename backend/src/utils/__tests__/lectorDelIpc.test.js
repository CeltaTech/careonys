/**
 * El lector de la serie del IPC y la carga automática.
 *
 *   node --test src/utils/__tests__/lectorDelIpc.test.js
 *
 * El fragmento de CSV es inventado: tiene la forma del archivo del INDEC, no sus datos.
 */
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { decodificarLatin1, leerIpcNacional, numeroConComa, periodoDeAAAAMM } from '../lectorDelIpc.js';
import { cargarLosIndicesPublicos, CODIGO_DEL_IPC, FUENTE_DEL_IPC } from '../cargaDeLosIndices.js';

const ENCABEZADO = 'Codigo;Descripcion;Clasificador;Periodo;Indice_IPC;v_m_IPC;v_i_a_IPC;Region';

const FRAGMENTO = [
  ENCABEZADO,
  '0;NIVEL GENERAL;Nivel general y divisiones COICOP;202609;1000,5;2,1;30,0;Nacional',
  '0;NIVEL GENERAL;Nivel general y divisiones COICOP;202610;1100,25;10,0;31,0;Nacional',
  '0;NIVEL GENERAL;Nivel general y divisiones COICOP;202610;999,9;1,0;1,0;GBA',
  '01;Alimentos y bebidas no alcohólicas;Nivel general y divisiones COICOP;202610;5555,5;3,0;40,0;Nacional',
  '0;NIVEL GENERAL;Nivel general y divisiones COICOP;202611;NA;;;Nacional',
].join('\r\n');

describe('leerIpcNacional', () => {
  it('toma sólo el nivel general nacional, con la coma como decimal', () => {
    assert.deepEqual(leerIpcNacional(FRAGMENTO), [
      { periodo: '2026-09-01', valor: 1000.5 },
      { periodo: '2026-10-01', valor: 1100.25 },
    ]);
  });

  it('descarta un valor que no es un número en vez de guardarlo como cero', () => {
    const periodos = leerIpcNacional(FRAGMENTO).map((v) => v.periodo);
    assert.ok(!periodos.includes('2026-11-01'));
  });

  it('acepta comillas y la marca de comienzo del archivo', () => {
    const texto = `﻿"Codigo";"Descripcion";"Clasificador";"Periodo";"Indice_IPC";"v_m_IPC";"v_i_a_IPC";"Region"\n`
      + '"0";"NIVEL GENERAL";"x";"202610";"1100,25";"";"";"Nacional"\n';
    assert.deepEqual(leerIpcNacional(texto), [{ periodo: '2026-10-01', valor: 1100.25 }]);
  });

  it('falla cerrado si faltan columnas', () => {
    assert.throws(() => leerIpcNacional('Codigo;Periodo;Region\n0;202610;Nacional'), /Indice_IPC/);
  });

  it('falla si el archivo llega vacío', () => {
    assert.throws(() => leerIpcNacional(''));
  });

  it('lee el texto en Latin-1', () => {
    const bytes = Uint8Array.from([0x41, 0x6c, 0x69, 0x6d, 0x65, 0x6e, 0x74, 0x61, 0x63, 0x69, 0xf3, 0x6e]);
    assert.equal(decodificarLatin1(bytes), 'Alimentación');
  });
});

describe('numeroConComa y periodoDeAAAAMM', () => {
  it('entiende los números del archivo', () => {
    assert.equal(numeroConComa('12785,9321'), 12785.9321);
    assert.equal(numeroConComa('1.234,5'), 1234.5);
    assert.equal(numeroConComa('12785.9321'), 12785.9321);
    assert.equal(numeroConComa('NA'), null);
    assert.equal(numeroConComa(''), null);
  });

  it('entiende los períodos y rechaza un mes que no existe', () => {
    assert.equal(periodoDeAAAAMM('202610'), '2026-10-01');
    assert.equal(periodoDeAAAAMM('202613'), null);
    assert.equal(periodoDeAAAAMM('2026-10'), null);
  });
});

describe('cargarLosIndicesPublicos', () => {
  function fetchDe(texto, ok = true) {
    return async (url) => {
      assert.equal(url, FUENTE_DEL_IPC);
      return { ok, status: ok ? 200 : 503, arrayBuffer: async () => new TextEncoder().encode(texto).buffer };
    };
  }

  it('anota cada valor con la cuenta sin Prestadora, en cada región', async () => {
    const llamadas = [];
    const conexion = (trabajo, region) => ({
      rpc: async (funcion, argumentos) => {
        llamadas.push({ trabajo, region, funcion, argumentos });
        return { data: argumentos.p_periodo === '2026-10-01', error: null };
      },
    });
    const resultado = await cargarLosIndicesPublicos({
      fetchar: fetchDe(FRAGMENTO), conexion, regiones: () => ['sa', 'us'],
    });
    assert.deepEqual(resultado, { leidos: 2, anotados: 2 });
    assert.equal(llamadas.length, 4);
    assert.deepEqual(new Set(llamadas.map((l) => l.region)), new Set(['sa', 'us']));
    for (const l of llamadas) {
      assert.equal(l.funcion, 'anotar_valor_de_indice_publico');
      assert.equal(l.argumentos.p_indice, CODIGO_DEL_IPC);
    }
  });

  it('no anota nada si la fuente no contesta', async () => {
    let llamadas = 0;
    const conexion = () => ({ rpc: async () => { llamadas += 1; return { data: true, error: null }; } });
    await assert.rejects(() => cargarLosIndicesPublicos({ fetchar: fetchDe('', false), conexion, regiones: () => ['sa'] }));
    assert.equal(llamadas, 0);
  });

  it('corta si la base rechaza un valor', async () => {
    const conexion = () => ({ rpc: async () => ({ data: null, error: { message: 'sin permiso' } }) });
    await assert.rejects(() => cargarLosIndicesPublicos({ fetchar: fetchDe(FRAGMENTO), conexion, regiones: () => ['sa'] }));
  });
});
