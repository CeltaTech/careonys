// La localidad de cada fila de una planilla importada, y los lugares donde acepta trabajar cada
// Asistente, resueltos contra la lista de lugares de la Prestadora.
//
// **Por qué hace falta.** Una planilla trae la localidad escrita como cada uno la escribe: «Cap.
// Fed.», «V. Ballester», el domicilio entero en una celda, el nombre de una zona. El producto guarda
// cuál de los lugares de la lista es, nunca el texto (careonys/CLAUDE.md §6, «un casillero que
// nombra algo que existe en otro lado es una lista»).
//
// **En qué orden se pregunta.** Primero la lista de la Prestadora; después el servicio de
// direcciones del país, por lotes; la letra del código postal dice la provincia cuando no viene
// escrita; y lo que ninguno reconoce se le muestra a la IA, que sólo reescribe lo que está escrito.
// **La IA propone y nunca confirma**: lo que devuelve vuelve a pasar por la lista y por el servicio
// de direcciones, como si lo hubiera escrito la Prestadora.
//
// **No hay paso de revisión.** Lo dudoso no se le deja decidir a nadie: vuelve en el archivo de las
// filas no cargadas, con su motivo, y si es ambiguo, con las opciones. Lo que se reconoce sin duda
// y todavía no estaba en la lista se agrega solo: si la cartera que se está migrando vive ahí, la
// Prestadora ya trabaja ahí.
//
// Las dependencias entran por parámetro —el servicio de direcciones, la IA y la escritura del lugar
// nuevo— para que las pruebas las reemplacen y se vea qué decide esta pieza sin depender de ellas.
//
// El domicilio es dato sensible: no se escribe en registros ni en mensajes de error (celtatech/CLAUDE.md §6).

import { partesDeUnRenglon } from './domicilioEscrito.js';

/** Cuántas opciones se muestran de una localidad ambigua. Las que sobran se anuncian con «…». */
export const OPCIONES_A_MOSTRAR = 5;

/** Texto comparable conservando los números: sin mayúsculas, tildes, espacios ni puntuación.
 *  Los números quedan porque hay localidades que los llevan —«25 de Mayo»— y zonas también. */
export function textoComparable(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const CODIGO_POSTAL = /^(?:c\.?\s*p\.?\s*)?([a-z]\d{4}[a-z]{3}|\d{4})$/i;

const limpio = (valor) => String(valor ?? '').trim();

/** La provincia de un lugar del organismo oficial: las dos primeras cifras de su identificador. */
function provinciaDelIdentificador(lugar) {
  const id = limpio(lugar?.id_oficial ?? lugar?.idOficial) || limpio(lugar?.localidad_censal ?? lugar?.localidadCensal);
  return /^\d{2}/.test(id) ? id.slice(0, 2) : null;
}

/** Si el partido escrito coincide con alguno de esos nombres. «San Martín» coincide con «General
 *  San Martín»; sin partido escrito, o sin nombre del otro lado, no descarta a nadie. */
function coincidePartido(partido, nombres) {
  const escrito = textoComparable(partido);
  if (!escrito) return true;
  const conocidos = nombres.map(textoComparable).filter(Boolean);
  if (!conocidos.length) return true;
  return conocidos.some((nombre) => nombre === escrito || nombre.endsWith(escrito));
}

/** Cómo se muestra una opción de una localidad ambigua. Sólo nombres propios: no hay nada que traducir. */
function textoDeOpcion(lugar) {
  const nombre = limpio(lugar.nombre);
  const donde = [lugar.municipio ?? lugar.departamento, lugar.provincia].map(limpio).filter(Boolean);
  const unicos = donde.filter((parte, i) => textoComparable(parte) !== textoComparable(nombre) && donde.indexOf(parte) === i);
  return unicos.length ? `${nombre} (${unicos.join(', ')})` : nombre;
}

function ambigua(candidatos) {
  const opciones = [...new Set(candidatos.map(textoDeOpcion))];
  return {
    codigo: 'localidad_ambigua',
    opciones: opciones.slice(0, OPCIONES_A_MOSTRAR),
    hayMas: opciones.length > OPCIONES_A_MOSTRAR,
  };
}

/**
 * Lo que dice la fila sobre su domicilio, con lo que viene en columnas propias por encima de lo que
 * se saca del renglón. Del renglón, después de la calle y el número, cada tramo se lee por posición
 * —localidad, partido, provincia—, salvo el código postal, que se reconoce por su forma, y el
 * último, que es la provincia si se llama como una.
 */
function leerDomicilio(domicilio, esProvincia) {
  const d = domicilio ?? {};
  const delRenglon = limpio(d.renglon) ? partesDeUnRenglon(d.renglon) : { calle: null, numero: null, piso: null, resto: [] };

  let codigoPostal = limpio(d.codigo_postal);
  const tramos = [];
  for (const tramo of delRenglon.resto ?? []) {
    const cp = tramo.match(CODIGO_POSTAL);
    if (cp && !codigoPostal) codigoPostal = cp[1].toUpperCase();
    else if (!cp) tramos.push(tramo);
  }
  let provinciaDelRenglon = '';
  if (tramos.length >= 2 && esProvincia(tramos[tramos.length - 1])) provinciaDelRenglon = tramos.pop();
  else if (tramos.length >= 3) provinciaDelRenglon = tramos.splice(2).join(', ');

  const usarColumnas = Boolean(limpio(d.calle));
  return {
    calle: usarColumnas ? limpio(d.calle) : limpio(delRenglon.calle),
    numero: usarColumnas ? limpio(d.numero) : limpio(d.numero) || limpio(delRenglon.numero),
    piso: limpio(d.piso) || (usarColumnas ? '' : limpio(delRenglon.piso)),
    unidad: limpio(d.unidad),
    localidad: limpio(d.localidad) || limpio(tramos[0]),
    partido: limpio(d.partido) || limpio(tramos[1]),
    provincia: limpio(d.provincia) || provinciaDelRenglon,
    codigoPostal,
    renglon: limpio(d.renglon),
  };
}

/**
 * @param {object} p
 * @param {{ domicilio?: object, lugaresDeTrabajo?: string[] }[]} p.filas
 *   `domicilio` trae las partes que vinieron en columnas propias —calle, numero, piso, unidad,
 *   localidad, partido, provincia, codigo_postal— y `renglon`, el domicilio en una sola celda.
 * @param {object[]} p.lugares La lista de la Prestadora, como la devuelve `lugaresDeLaPrestadora`.
 * @param {{ nombre: string, codigo?: string, lugares: string[] }[]} p.zonas
 * @param {object|null} p.herramientas El adaptador de direcciones del país, o nulo si no tiene.
 * @param {Function|null} p.proponer La IA: recibe lo que no se reconoció y devuelve lo reescrito.
 * @param {Function} p.agregar Agrega a la lista una localidad oficial y devuelve su identificador.
 * @returns {Promise<{ partes: object|null, lugares: string[], motivo: object|null }[]>}
 */
export async function resolverLocalidades({ filas, lugares, zonas, herramientas, proponer, agregar }) {
  const lista = [...(lugares ?? [])];
  const conDirecciones = Boolean(herramientas?.localidadesLlamadas);

  // Las provincias del país, para reconocer la escrita. Sin servicio de direcciones se compara el
  // texto contra la provincia guardada en cada lugar de la lista.
  let provincias = [];
  let servicioCaido = false;
  if (conDirecciones && herramientas.listarProvincias) {
    try {
      provincias = await herramientas.listarProvincias();
    } catch {
      servicioCaido = true;
    }
  }
  const provinciaPorTexto = new Map(provincias.map((p) => [textoComparable(p.nombre), p.idOficial]));
  const nombreDeProvincia = new Map(provincias.map((p) => [p.idOficial, p.nombre]));
  const esProvincia = (texto) => provinciaPorTexto.has(textoComparable(texto));

  const pedidos = filas.map((fila) => leerDomicilio(fila.domicilio, esProvincia));
  const resultados = filas.map(() => ({ partes: null, lugares: [], motivo: null }));

  // --- El domicilio ---

  const quedan = new Set();
  pedidos.forEach((pedido, i) => {
    if (!pedido.calle) resultados[i].motivo = { codigo: 'falta_domicilio' };
    else quedan.add(i);
  });

  if (servicioCaido) {
    for (const i of quedan) resultados[i].motivo = { codigo: 'servicio_de_direcciones_caido' };
    quedan.clear();
  }

  // Cada fila termina con un lugar de la lista, un lugar oficial que falta agregar, o un motivo.
  const encontrado = new Map();

  const resolverTanda = async (indices) => {
    const sinReconocer = [];
    try {
      const respuestas = await localidadesDeLaTanda(indices.map((i) => pedidos[i]), {
        lista, herramientas, conDirecciones, provinciaPorTexto, nombreDeProvincia,
      });
      respuestas.forEach((respuesta, k) => {
        const i = indices[k];
        if (respuesta.lugar) encontrado.set(i, respuesta.lugar);
        else if (respuesta.motivo) resultados[i].motivo = respuesta.motivo;
        else sinReconocer.push(i);
      });
    } catch {
      for (const i of indices) resultados[i].motivo = { codigo: 'servicio_de_direcciones_caido' };
    }
    return sinReconocer;
  };

  let sinReconocer = await resolverTanda([...quedan]);

  // Lo que nadie reconoció se le muestra a la IA, que sólo reescribe lo escrito, y vuelve a pasar
  // entero por la lista y el servicio de direcciones.
  // A la IA le llega sólo lo que dice dónde queda —nunca la calle ni el número—: alcanza para
  // reconocer la localidad y es lo menos que se puede mandar afuera de un domicilio.
  if (sinReconocer.length && proponer) {
    const reescritos = await pedirleALaIA(proponer, sinReconocer.map((i) => ({
      clave: String(i),
      localidad: pedidos[i].localidad,
      partido: pedidos[i].partido,
      provincia: pedidos[i].provincia,
      codigoPostal: pedidos[i].codigoPostal,
    })));
    const otraVez = [];
    for (const i of sinReconocer) {
      const propuesta = reescritos.get(String(i));
      if (!propuesta) continue;
      const pedido = pedidos[i];
      // Sin localidad escrita no hay nada que reescribir: lo que la IA devolviera ahí sería un
      // lugar inventado.
      pedidos[i] = {
        ...pedido,
        localidad: pedido.localidad ? limpio(propuesta.localidad) : '',
        partido: limpio(propuesta.partido),
        provincia: limpio(propuesta.provincia),
      };
      otraVez.push(i);
    }
    const siguenSinReconocer = new Set(await resolverTanda(otraVez));
    sinReconocer = sinReconocer.filter((i) => !otraVez.includes(i) || siguenSinReconocer.has(i));
  }
  for (const i of sinReconocer) {
    if (!resultados[i].motivo) resultados[i].motivo = { codigo: 'localidad_no_reconocida' };
  }

  // --- Dónde acepta trabajar ---

  const textosDeTrabajo = [];
  filas.forEach((fila, i) => {
    if (resultados[i].motivo) return;
    for (const texto of fila.lugaresDeTrabajo ?? []) {
      if (limpio(texto)) textosDeTrabajo.push({ fila: i, texto: limpio(texto), provincia: provinciaDe(encontrado.get(i)) });
    }
  });
  const trabajo = new Map();
  try {
    let pendientes = await lugaresDeTrabajo(textosDeTrabajo, trabajo, { lista, zonas, herramientas, conDirecciones });
    if (pendientes.length && proponer) {
      const reescritos = await pedirleALaIA(proponer, pendientes.map((k) => ({
        clave: `t${k}`, lugarDeTrabajo: textosDeTrabajo[k].texto,
      })));
      const otraVez = [];
      for (const k of pendientes) {
        const propuesta = limpio(reescritos.get(`t${k}`)?.lugarDeTrabajo);
        if (!propuesta) continue;
        textosDeTrabajo[k] = { ...textosDeTrabajo[k], texto: propuesta };
        otraVez.push(k);
      }
      const siguen = new Set(await lugaresDeTrabajo(otraVez.map((k) => textosDeTrabajo[k]), trabajo, {
        lista, zonas, herramientas, conDirecciones, indices: otraVez,
      }));
      pendientes = pendientes.filter((k) => !otraVez.includes(k) || siguen.has(k));
    }
    for (const k of pendientes) {
      resultados[textosDeTrabajo[k].fila].motivo = { codigo: 'lugar_de_trabajo_no_reconocido' };
    }
  } catch {
    for (const { fila } of textosDeTrabajo) {
      if (!resultados[fila].motivo) resultados[fila].motivo = { codigo: 'servicio_de_direcciones_caido' };
    }
  }

  // --- Lo oficial que falta se agrega a la lista, una sola vez cada uno ---

  const agregados = new Map(lista.filter((l) => l.id_oficial).map((l) => [l.id_oficial, l.id]));
  const idDe = async (lugar) => {
    if (lugar.id) return lugar.id;
    if (!agregados.has(lugar.idOficial)) agregados.set(lugar.idOficial, await agregar(lugar));
    return agregados.get(lugar.idOficial);
  };

  // Una fila que vuelve no agrega nada a la lista: lo que se agrega es porque se cargó alguien ahí.
  for (let i = 0; i < filas.length; i += 1) {
    if (resultados[i].motivo) continue;
    const lugar = encontrado.get(i);
    const pedido = pedidos[i];
    resultados[i].partes = {
      calle: pedido.calle,
      numero: pedido.numero || null,
      piso: pedido.piso || null,
      unidad: pedido.unidad || null,
      codigo_postal: pedido.codigoPostal || null,
      lugar_id: await idDe(lugar),
    };
    const ids = [];
    for (const lugarDeTrabajo of trabajo.get(i) ?? []) ids.push(...(Array.isArray(lugarDeTrabajo) ? lugarDeTrabajo : [await idDe(lugarDeTrabajo)]));
    resultados[i].lugares = [...new Set(ids)];
  }

  return resultados;
}

/** La provincia de un lugar ya resuelto, para acotar dónde acepta trabajar quien vive ahí. */
function provinciaDe(lugar) {
  if (!lugar) return null;
  return provinciaDelIdentificador(lugar);
}

/** Le pide a la IA y devuelve lo reescrito por clave. Si la IA falla, no hay reescritura: lo que no
 *  se reconoció vuelve con su motivo, que es lo mismo que pasaría sin IA. */
async function pedirleALaIA(proponer, pendientes) {
  try {
    const propuestas = await proponer(pendientes);
    return new Map((Array.isArray(propuestas) ? propuestas : [])
      .filter((p) => p && p.clave != null)
      .map((p) => [String(p.clave), p]));
  } catch {
    return new Map();
  }
}

/**
 * La localidad de cada domicilio de la tanda. Devuelve, por cada uno, `{ lugar }` —de la lista, con
 * su `id`, u oficial, sin él—, `{ motivo }`, o vacío si no se reconoció y vale la pena mostrárselo a
 * la IA. Las consultas al servicio de direcciones van en lote; si el servicio se cae, lanza.
 */
async function localidadesDeLaTanda(pedidos, { lista, herramientas, conDirecciones, provinciaPorTexto, nombreDeProvincia }) {
  const respuestas = pedidos.map(() => ({}));
  const provinciaDeLaLista = (lugar) => provinciaDelIdentificador(lugar)
    ?? provinciaPorTexto.get(textoComparable(lugar.provincia)) ?? null;

  // La provincia: la escrita, si se la reconoce; si no viene, la que dice el código postal.
  const provinciaDe = pedidos.map((pedido, k) => {
    if (pedido.provincia) {
      if (!conDirecciones) return { texto: textoComparable(pedido.provincia) };
      const id = provinciaPorTexto.get(textoComparable(pedido.provincia));
      if (!id) respuestas[k].sinProvincia = true;
      return id ? { id } : null;
    }
    const id = conDirecciones ? herramientas.provinciaDelCodigoPostal?.(pedido.codigoPostal) : null;
    return id ? { id } : null;
  });
  const enLaProvincia = (lugar, provincia) => {
    if (!provincia) return true;
    if (provincia.id) return provinciaDeLaLista(lugar) === provincia.id;
    return textoComparable(lugar.provincia) === provincia.texto;
  };

  const porNombre = [];
  const porCenso = [];
  pedidos.forEach((pedido, k) => {
    if (respuestas[k].sinProvincia) return;
    if (!pedido.localidad) {
      if (conDirecciones) porCenso.push({ k, candidatos: null });
      return;
    }
    const enLaLista = lista.filter((lugar) => textoComparable(lugar.nombre) === textoComparable(pedido.localidad)
      && enLaProvincia(lugar, provinciaDe[k])
      && coincidePartido(pedido.partido, [lugar.municipio]));
    if (enLaLista.length === 1) respuestas[k].lugar = enLaLista[0];
    else if (enLaLista.length > 1) {
      if (conDirecciones) porCenso.push({ k, candidatos: enLaLista });
      else respuestas[k].motivo = ambigua(enLaLista);
    } else if (conDirecciones) porNombre.push(k);
  });

  // Lo que no está en la lista se le pregunta al servicio de direcciones, por su nombre exacto.
  if (porNombre.length) {
    const encontradas = await herramientas.localidadesLlamadas(porNombre.map((k) => ({
      nombre: pedidos[k].localidad, provincia: provinciaDe[k]?.id,
    })));
    porNombre.forEach((k, n) => {
      const candidatos = (encontradas[n] ?? []).filter((lugar) => coincidePartido(pedidos[k].partido, [lugar.departamento, lugar.municipio]));
      if (candidatos.length === 1) respuestas[k].lugar = candidatos[0];
      else if (candidatos.length > 1) porCenso.push({ k, candidatos });
    });
  }

  // Lo que sigue en duda se desempata por dónde cae la dirección. Sólo cuenta una dirección que el
  // servicio reconoce en un solo lugar: la misma calle y el mismo número existen en cientos.
  if (porCenso.length) {
    const censos = await herramientas.localidadCensalDeDirecciones(porCenso.map(({ k }) => ({
      direccion: [pedidos[k].calle, pedidos[k].numero].filter(Boolean).join(' '),
      provincia: provinciaDe[k]?.id,
    })));
    const sinLocalidad = [];
    porCenso.forEach(({ k, candidatos }, n) => {
      const censal = censos[n]?.localidadCensal ?? null;
      if (candidatos) {
        const enEsaCensal = censal ? candidatos.filter((lugar) => String(lugar.localidad_censal ?? lugar.localidadCensal ?? '') === censal) : [];
        respuestas[k] = enEsaCensal.length === 1 ? { lugar: enEsaCensal[0] } : { motivo: ambigua(candidatos) };
      } else if (censal) sinLocalidad.push({ k, censal });
    });

    // Sin localidad escrita, la dirección sola alcanza si cae en una localidad censal que abarca
    // una única localidad. Si abarca varias —la de la Ciudad de Buenos Aires abarca todos sus
    // barrios—, la fila es ambigua.
    if (sinLocalidad.length) {
      const abarcadas = await herramientas.localidadesDeLaCensal(sinLocalidad.map(({ censal }) => censal));
      sinLocalidad.forEach(({ k }, n) => {
        const candidatas = abarcadas[n] ?? [];
        if (candidatas.length === 1) {
          const yaEnLaLista = lista.find((lugar) => lugar.id_oficial === candidatas[0].idOficial);
          respuestas[k] = { lugar: yaEnLaLista ?? candidatas[0] };
        } else if (candidatas.length > 1) respuestas[k] = { motivo: ambigua(candidatas) };
      });
    }
  }

  // Lo oficial que ya está en la lista se usa de la lista.
  return respuestas.map((respuesta) => {
    const lugar = respuesta.lugar;
    if (!lugar || lugar.id) return respuesta.lugar || respuesta.motivo ? respuesta : {};
    const yaEnLaLista = lista.find((l) => l.id_oficial && l.id_oficial === lugar.idOficial);
    return { lugar: yaEnLaLista ?? { ...lugar, provincia: lugar.provincia ?? nombreDeProvincia.get(provinciaDelIdentificador(lugar)) } };
  });
}

/**
 * Dónde acepta trabajar, texto por texto. Una zona de la Prestadora se convierte en sus lugares;
 * un nombre de la lista, en ese lugar; si no, el servicio de direcciones tiene que reconocerlo en un
 * único lugar —primero en la provincia donde vive, después en todo el país—. Anota en `trabajo` lo
 * reconocido de cada fila y devuelve los índices que no se reconocieron.
 */
async function lugaresDeTrabajo(textos, trabajo, { lista, zonas, herramientas, conDirecciones, indices }) {
  const sinReconocer = [];
  const anotar = (fila, valor) => {
    if (!trabajo.has(fila)) trabajo.set(fila, []);
    trabajo.get(fila).push(valor);
  };
  const preguntar = [];
  textos.forEach(({ fila, texto, provincia }, n) => {
    const k = indices ? indices[n] : n;
    const buscado = textoComparable(texto);
    const zona = (zonas ?? []).find((z) => textoComparable(z.nombre) === buscado || (z.codigo && textoComparable(z.codigo) === buscado));
    if (zona) return anotar(fila, zona.lugares ?? []);
    let enLaLista = lista.filter((lugar) => textoComparable(lugar.nombre) === buscado);
    if (enLaLista.length > 1 && provincia) enLaLista = enLaLista.filter((lugar) => provinciaDelIdentificador(lugar) === provincia);
    if (enLaLista.length === 1) return anotar(fila, [enLaLista[0].id]);
    if (enLaLista.length > 1 || !conDirecciones) return sinReconocer.push(k);
    preguntar.push({ k, fila, texto, provincia });
  });

  if (preguntar.length) {
    const enSuProvincia = await herramientas.localidadesLlamadas(preguntar.map(({ texto, provincia }) => ({ nombre: texto, provincia })));
    const enTodoElPais = [];
    preguntar.forEach((p, n) => {
      const encontradas = enSuProvincia[n] ?? [];
      if (encontradas.length === 1) anotar(p.fila, encontradas[0]);
      else if (!encontradas.length && p.provincia) enTodoElPais.push(p);
      else sinReconocer.push(p.k);
    });
    if (enTodoElPais.length) {
      const encontradas = await herramientas.localidadesLlamadas(enTodoElPais.map(({ texto }) => ({ nombre: texto })));
      enTodoElPais.forEach((p, n) => {
        if ((encontradas[n] ?? []).length === 1) anotar(p.fila, encontradas[n][0]);
        else sinReconocer.push(p.k);
      });
    }
  }

  // Lo oficial que ya está en la lista se usa de la lista.
  for (const [fila, valores] of trabajo) {
    trabajo.set(fila, valores.map((valor) => {
      if (Array.isArray(valor) || valor.id) return valor;
      const yaEnLaLista = lista.find((l) => l.id_oficial && l.id_oficial === valor.idOficial);
      return yaEnLaLista ? [yaEnLaLista.id] : valor;
    }));
  }
  return sinReconocer;
}
