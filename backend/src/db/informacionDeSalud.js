/* La información de salud, con la sesión de una persona, pasa por el registro de accesos.
   ======================================================================================

   La base no deja leer una tabla de salud directo con la sesión de una persona: sólo entrega lo que
   pasa por `leer_informacion_de_salud`, `modificar_informacion_de_salud` o
   `agregar_informacion_de_salud`, que anotan en `consultas_a_hce` a qué Pacientes alcanzó la
   operación, en la misma operación. Si la anotación falla, no sale nada.

   Este archivo hace que las rutas no tengan que saberlo. `clienteDelPedido(req)` devuelve la
   conexión envuelta: una consulta a `reportes` se arma como siempre —`.select()`, `.eq()`,
   `.order()`…— y al ejecutarla la manda por esas funciones, con el origen del pedido. Para lo que
   no es de salud, la conexión es la de siempre.

   Lo que no sabe hacer, lo rechaza: falla cerrado, nunca cae a una consulta directa.

   El trabajo sin persona no pasa por acá. La regla de la base no es para él, y lo que lee para una
   persona lo anota la ruta con `anotarConsultaAHce`. */

// Las tablas de salud. La lista original es la de la base, `interno.tablas_de_salud()`; ésta es la
// copia que el backend necesita para saber qué consulta desviar, y `scripts/probar_aislamiento.mjs`
// rompe si se despegan.
export const TABLAS_DE_SALUD = new Set([
  'alertas', 'cargas_sujetas_a_aprobacion', 'emergencias_guardia', 'hospitalizaciones_paciente',
  'indicaciones_medicacion', 'informacion_de_salud_del_paciente', 'informes_obra_social',
  'rangos_referencia_vitales', 'reportes', 'versiones_registro_clinico',
]);

// Lo que una consulta de salud puede traer pegado, y por qué columna de la fila se lo encuentra.
// Se lee aparte, con la misma sesión de la persona: la base aplica sus reglas igual que al pegarlo.
const AGREGADOS = {
  vias_administracion: 'via_administracion_id',
  pacientes: 'paciente_id',
  clientes: 'cliente_id',
  guardias: 'guardia_id',
};

// Lo que se pega nombrando la relación, cuando hay más de una entre las dos tablas: la relación dice
// qué tabla y por qué columna.
const RELACIONES = {
  cargas_sujetas_a_aprobacion_cargado_por_fkey: { tabla: 'usuarios', columna: 'cargado_por' },
  cargas_sujetas_a_aprobacion_del_paciente: { tabla: 'pacientes', columna: 'paciente_id' },
};

class PedidoInvalido extends Error {
  constructor(detalle) {
    super(`consulta de salud: ${detalle}`);
    this.code = '22023';
  }
}

// Parte una lista separada por comas sin cortar adentro de los paréntesis.
function partir(texto) {
  const partes = [];
  let nivel = 0;
  let actual = '';
  for (const c of String(texto)) {
    if (c === '(') nivel++;
    if (c === ')') nivel--;
    if (c === ',' && nivel === 0) {
      partes.push(actual.trim());
      actual = '';
    } else {
      actual += c;
    }
  }
  if (actual.trim()) partes.push(actual.trim());
  return partes;
}

// `id, medicamento, via:vias_administracion(clave), guardias!inner(fecha)` → columnas y agregados.
function leerColumnas(seleccion) {
  const columnas = [];
  const agregados = [];
  for (const parte of partir(seleccion ?? '*')) {
    const agregado = parte.match(/^(?:(\w+):)?(\w+)(?:!(\w+))?(!inner)?\((.*)\)$/s);
    if (agregado) {
      const [, alias, tabla, marca, innerAparte, interior] = agregado;
      const inner = marca === 'inner' || Boolean(innerAparte);
      const relacion = marca && marca !== 'inner' ? RELACIONES[marca] : null;
      if (marca && marca !== 'inner' && relacion?.tabla !== tabla) throw new PedidoInvalido(`no sabe pegar ${tabla}!${marca}`);
      const columna = relacion?.columna ?? AGREGADOS[tabla];
      if (!columna || TABLAS_DE_SALUD.has(tabla)) throw new PedidoInvalido(`no sabe pegar ${tabla}`);
      agregados.push({ nombre: alias || tabla, tabla, columna, interior: interior.trim() || '*', inner });
    } else if (parte === '*' || /^\w+$/.test(parte)) {
      columnas.push(parte);
    } else {
      throw new PedidoInvalido(`no entiende la columna ${parte}`);
    }
  }
  return { columnas, agregados };
}

const OPERADORES = { eq: 'eq', neq: 'neq', gt: 'gt', gte: 'gte', lt: 'lt', lte: 'lte' };

// El «o» con el formato de texto de Supabase: `fecha_hasta.is.null,fecha_hasta.gte.2026-01-01`.
// Sólo condiciones simples: algo anidado no se entiende y se rechaza.
function leerO(texto) {
  return partir(texto).map((parte) => {
    const m = parte.match(/^(\w+)\.(eq|neq|gt|gte|lt|lte|is)\.(.*)$/s);
    if (!m) throw new PedidoInvalido(`no entiende el «o» ${parte}`);
    const [, columna, op, valor] = m;
    if (op === 'is') {
      if (valor === 'null') return { columna, op: 'is_null' };
      throw new PedidoInvalido(`no entiende el «o» ${parte}`);
    }
    return { columna, op, valor };
  });
}

class ConsultaDeSalud {
  constructor(conexion, tabla, origen) {
    this.conexion = conexion;
    this.tabla = tabla;
    this.origen = origen;
    this.operacion = 'leer';
    this.seleccion = null;
    this.conteo = false;
    this.soloConteo = false;
    this.filtros = [];
    this.deLaGuardia = [];
    this.orden = [];
    this.limite = null;
    this.uno = null;
    this.datos = null;
  }

  select(seleccion = '*', opciones = {}) {
    this.seleccion = seleccion;
    if (opciones?.count) {
      this.conteo = true;
      this.soloConteo = Boolean(opciones.head);
    }
    return this;
  }

  insert(fila) {
    if (!fila || typeof fila !== 'object' || Array.isArray(fila)) throw new PedidoInvalido('se agrega de a una fila');
    this.operacion = 'agregar';
    this.datos = fila;
    return this;
  }

  update(cambios) {
    if (!cambios || typeof cambios !== 'object' || Array.isArray(cambios)) throw new PedidoInvalido('cambios inválidos');
    this.operacion = 'modificar';
    this.datos = cambios;
    return this;
  }

  delete() { throw new PedidoInvalido('la información de salud no se borra'); }

  upsert() { throw new PedidoInvalido('no sabe hacer upsert'); }

  #filtro(columna, op, valor) {
    const [delante, detras] = String(columna).split('.');
    if (detras !== undefined) {
      // Una condición sobre lo pegado: sólo la guardia, que la base sabe resolver.
      if (delante !== 'guardias') throw new PedidoInvalido(`no sabe filtrar por ${columna}`);
      this.deLaGuardia.push({ columna: detras, op, valor });
    } else {
      this.filtros.push(op === 'is_null' || op === 'not_null' ? { columna, op } : { columna, op, valor });
    }
    return this;
  }

  eq(c, v) { return this.#filtro(c, 'eq', v); }

  neq(c, v) { return this.#filtro(c, 'neq', v); }

  gt(c, v) { return this.#filtro(c, 'gt', v); }

  gte(c, v) { return this.#filtro(c, 'gte', v); }

  lt(c, v) { return this.#filtro(c, 'lt', v); }

  lte(c, v) { return this.#filtro(c, 'lte', v); }

  in(c, v) {
    if (!Array.isArray(v)) throw new PedidoInvalido('in sin lista');
    return this.#filtro(c, 'in', v);
  }

  is(c, v) {
    if (v !== null) throw new PedidoInvalido('is sólo con null');
    return this.#filtro(c, 'is_null');
  }

  not(c, op, v) {
    if (op === 'is' && v === null) return this.#filtro(c, 'not_null');
    if (OPERADORES[op] === 'eq') return this.#filtro(c, 'neq', v);
    throw new PedidoInvalido(`no sabe negar ${op}`);
  }

  or(texto) {
    this.filtros.push({ o: leerO(texto) });
    return this;
  }

  order(columna, { ascending = true } = {}) {
    this.orden.push({ columna, desc: !ascending });
    return this;
  }

  limit(n) {
    this.limite = n;
    return this;
  }

  maybeSingle() {
    this.uno = 'quizas';
    return this;
  }

  single() {
    this.uno = 'exacto';
    return this;
  }

  then(cumplir, rechazar) {
    return this.#ejecutar().then(cumplir, rechazar);
  }

  async #ejecutar() {
    try {
      return await this.#hacer();
    } catch (e) {
      // El detalle queda en el registro del servidor; la ruta recibe un error como el de Supabase.
      console.error(`Consulta de salud en ${this.tabla}:`, e?.message ?? e);
      return { data: null, error: { message: e?.message ?? 'consulta de salud fallida', code: e?.code ?? 'XX000' }, count: null };
    }
  }

  async #hacer() {
    const origen = typeof this.origen === 'function' ? this.origen() : this.origen;
    const devolver = this.seleccion !== null;
    const { columnas, agregados } = leerColumnas(this.seleccion ?? 'id');

    // Lo que se pega se busca por una columna de la fila: se la pide aunque no se la haya pedido.
    const pedidas = columnas.includes('*') ? null : [...new Set([...columnas, ...agregados.map((a) => a.columna)])];
    // Al agregar o modificar, sin columnas la base devuelve sólo el identificador: la fila entera se
    // pide con `*`.
    const devueltas = devolver ? (pedidas ?? ['*']) : null;
    const filtros = this.deLaGuardia.length ? [...this.filtros, { guardia: this.deLaGuardia }] : this.filtros;

    let filas;
    let conteo = null;
    if (this.operacion === 'leer') {
      if (this.conteo) {
        const { data, error } = await this.conexion.rpc('leer_informacion_de_salud', {
          p_tabla: this.tabla, p_origen: origen, p_filtros: filtros, p_contar: true,
        });
        if (error) throw error;
        conteo = data;
        if (this.soloConteo) return { data: null, error: null, count: conteo };
      }
      const { data, error } = await this.conexion.rpc('leer_informacion_de_salud', {
        p_tabla: this.tabla,
        p_origen: origen,
        p_columnas: pedidas,
        p_filtros: filtros,
        p_orden: this.orden,
        p_limite: this.limite,
      });
      if (error) throw error;
      filas = data ?? [];
    } else if (this.operacion === 'agregar') {
      const { data, error } = await this.conexion.rpc('agregar_informacion_de_salud', {
        p_tabla: this.tabla, p_origen: origen, p_fila: this.datos, p_columnas_devueltas: devueltas,
      });
      if (error) throw error;
      filas = data ?? [];
    } else {
      if (!filtros.length) throw new PedidoInvalido('modificar sin filtro');
      const { data, error } = await this.conexion.rpc('modificar_informacion_de_salud', {
        p_tabla: this.tabla, p_origen: origen, p_cambios: this.datos, p_filtros: filtros,
        p_columnas_devueltas: devueltas,
      });
      if (error) throw error;
      filas = data ?? [];
    }

    if (agregados.length && filas.length) {
      filas = await this.#pegar(filas, agregados, columnas);
    }

    // Sin `.select()`, un alta o una modificación no devuelve filas, como en Supabase.
    if (this.operacion !== 'leer' && !devolver) return { data: null, error: null, count: null };

    if (this.uno) {
      if (filas.length > 1) throw new PedidoInvalido('se esperaba una sola fila');
      if (this.uno === 'exacto' && filas.length === 0) {
        return { data: null, error: { message: 'no se encontró la fila', code: 'PGRST116' }, count: null };
      }
      return { data: filas[0] ?? null, error: null, count: conteo };
    }
    return { data: filas, error: null, count: conteo };
  }

  async #pegar(filas, agregados, columnas) {
    let resultado = filas.map((f) => ({ ...f }));
    for (const a of agregados) {
      const ids = [...new Set(resultado.map((f) => f[a.columna]).filter(Boolean))];
      let porId = new Map();
      if (ids.length) {
        const pideId = a.interior === '*' || partir(a.interior).includes('id');
        // SIN PRESTADORA A PROPÓSITO
        // `this.conexion` es siempre la de quien pide, y la Prestadora la pone la protección por
        // fila de la tabla. Se leen sólo los identificadores que vinieron en las filas de salud,
        // que la función ya acotó a la Prestadora de la sesión.
        const { data, error } = await this.conexion.from(a.tabla)
          .select(pideId ? a.interior : `id, ${a.interior}`)
          .in('id', ids);
        if (error) throw error;
        porId = new Map((data ?? []).map((r) => {
          if (pideId) return [r.id, r];
          const { id, ...resto } = r;
          return [id, resto];
        }));
      }
      resultado = resultado.map((f) => ({ ...f, [a.nombre]: porId.get(f[a.columna]) ?? null }));
      if (a.inner) resultado = resultado.filter((f) => f[a.nombre] !== null);
    }
    // Lo que se pidió sólo para pegar no sale.
    if (!columnas.includes('*')) {
      const sobran = agregados.map((a) => a.columna).filter((c) => !columnas.includes(c));
      resultado = resultado.map((f) => {
        const copia = { ...f };
        for (const c of sobran) delete copia[c];
        return copia;
      });
    }
    return resultado;
  }
}

/** La conexión de la persona, con la información de salud desviada al registro. */
export function conRegistroDeSalud(conexion, origen) {
  return new Proxy(conexion, {
    get(objeto, propiedad) {
      if (propiedad === 'from') {
        return (tabla) => {
          if (TABLAS_DE_SALUD.has(tabla)) return new ConsultaDeSalud(objeto, tabla, origen);
          // SIN PRESTADORA A PROPÓSITO
          // Es el paso de largo de la conexión de quien pide: la consulta de cada ruta se mira
          // donde está escrita, y la Prestadora la pone la protección por fila de la tabla.
          return objeto.from(tabla);
        };
      }
      const valor = objeto[propiedad];
      return typeof valor === 'function' ? valor.bind(objeto) : valor;
    },
  });
}
