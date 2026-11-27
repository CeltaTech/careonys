/**
 * Una base de mentira, en memoria, que contesta como el cliente de Supabase lo justo para probar la
 * importación: leer, agregar, cambiar y quitar filas con filtros de igualdad, y llamar funciones.
 *
 * No es una prueba: lo usan las pruebas de los pedidos de dato y del Servicio importado.
 *
 *   const base = baseEnMemoria({ pedidos_de_importacion: [...] });
 *   base.tablas.pedidos_de_importacion   // lo que quedó escrito
 *   base.rpcs.crear_turno_guardia_recurrente = (args) => ({ data: 'serie-1' });
 *   base.fallas.cronograma_de_guardias = { insert: { code: '23514', message: '...' } };
 */

let siguiente = 0;
function nuevoId() {
  siguiente += 1;
  return `00000000-0000-4000-8000-${String(siguiente).padStart(12, '0')}`;
}

function cumple(fila, filtros) {
  return filtros.every(({ op, columna, valor }) => {
    const actual = fila[columna];
    if (op === 'eq') return actual === valor;
    if (op === 'is') return (actual ?? null) === valor;
    if (op === 'lte') return actual <= valor;
    if (op === 'gte') return actual >= valor;
    if (op === 'in') return valor.includes(actual);
    return false;
  });
}

export function baseEnMemoria(inicial = {}) {
  const tablas = {};
  for (const [nombre, filas] of Object.entries(inicial)) tablas[nombre] = filas.map((f) => ({ ...f }));
  const rpcs = {};
  const fallas = {};
  const llamadas = [];

  function consulta(tabla) {
    const estado = { tabla, op: 'select', filtros: [], valores: null, devolver: false, opciones: {}, forma: 'lista', limite: null };
    const resolver = () => {
      tablas[tabla] ??= [];
      const falla = fallas[tabla]?.[estado.op];
      llamadas.push({ tabla, op: estado.op, filtros: estado.filtros, valores: estado.valores });
      if (falla) return { data: null, error: falla, count: null };
      let filas;
      if (estado.op === 'insert') {
        // Como la base: el pedido nace abierto y el lote nace pendiente si nadie dice otra cosa.
        const porOmision = {
          pedidos_de_importacion: { estado: 'abierto' },
          importaciones_prestadora: { estado_conformidad: 'pendiente', filas_creadas: 0, filas_error: 0 },
        }[tabla] ?? {};
        const nuevas = (Array.isArray(estado.valores) ? estado.valores : [estado.valores]).map((v) => {
          siguiente += 1;
          return { id: nuevoId(), created_at: new Date(1_800_000_000_000 + siguiente).toISOString(), ...porOmision, ...v };
        });
        tablas[tabla].push(...nuevas);
        filas = nuevas;
      } else if (estado.op === 'update') {
        filas = tablas[tabla].filter((f) => cumple(f, estado.filtros));
        for (const f of filas) Object.assign(f, estado.valores);
      } else if (estado.op === 'delete') {
        filas = tablas[tabla].filter((f) => cumple(f, estado.filtros));
        tablas[tabla] = tablas[tabla].filter((f) => !cumple(f, estado.filtros));
      } else {
        filas = tablas[tabla].filter((f) => cumple(f, estado.filtros));
        if (estado.orden) {
          const { columna, ascendente } = estado.orden;
          filas = [...filas].sort((a, b) => (a[columna] < b[columna] ? -1 : a[columna] > b[columna] ? 1 : 0) * (ascendente ? 1 : -1));
        }
        if (estado.limite !== null) filas = filas.slice(0, estado.limite);
        if (estado.opciones.head) return { data: null, error: null, count: filas.length };
      }
      const copia = filas.map((f) => ({ ...f }));
      if (estado.forma === 'una') {
        if (copia.length !== 1) return { data: null, error: { message: 'no es una sola fila' } };
        return { data: copia[0], error: null };
      }
      if (estado.forma === 'unaOninguna') return { data: copia[0] ?? null, error: null };
      return { data: estado.op === 'select' || estado.devolver ? copia : null, error: null };
    };
    const q = {
      select(_columnas, opciones = {}) {
        if (estado.op === 'select') estado.opciones = opciones;
        else estado.devolver = true;
        return q;
      },
      insert(valores) { estado.op = 'insert'; estado.valores = valores; return q; },
      update(valores) { estado.op = 'update'; estado.valores = valores; return q; },
      delete() { estado.op = 'delete'; return q; },
      eq(columna, valor) { estado.filtros.push({ op: 'eq', columna, valor }); return q; },
      is(columna, valor) { estado.filtros.push({ op: 'is', columna, valor }); return q; },
      lte(columna, valor) { estado.filtros.push({ op: 'lte', columna, valor }); return q; },
      gte(columna, valor) { estado.filtros.push({ op: 'gte', columna, valor }); return q; },
      in(columna, valor) { estado.filtros.push({ op: 'in', columna, valor }); return q; },
      order(columna, { ascending = true } = {}) { estado.orden = { columna, ascendente: ascending }; return q; },
      limit(n) { estado.limite = n; return q; },
      single() { estado.forma = 'una'; return q; },
      maybeSingle() { estado.forma = 'unaOninguna'; return q; },
      then(listo, fallo) { return Promise.resolve().then(resolver).then(listo, fallo); },
    };
    return q;
  }

  return {
    tablas,
    rpcs,
    fallas,
    llamadas,
    from: (tabla) => consulta(tabla),
    rpc: async (nombre, args) => {
      llamadas.push({ rpc: nombre, args });
      const f = rpcs[nombre];
      if (!f) return { data: null, error: { message: `la prueba no preparó ${nombre}` } };
      return f(args);
    },
  };
}
