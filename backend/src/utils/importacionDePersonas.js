/*
 * La importación de una hoja de personas: Asistentes, Clientes o Servicios en curso.
 *
 * Recorre cada renglón de la hoja, ya con el mapeo corregido por la Prestadora, y crea con el mismo
 * camino que el alta a mano. Nada queda afuera: el dato que falta o es dudoso queda como pedido de
 * dato abierto, y las columnas que el mapeo no llevó a ningún dato se guardan en el Legajo del
 * Asistente o en la historia del Paciente.
 *
 * Una hoja por llamada. Los errores, las filas vinculadas y las que ya estaban llevan el número
 * de la hoja, para que la pantalla diga dónde está cada una.
 */

import {
  CAMPOS_IMPORTACION, CAMPOS_LISTA, CAMPOS_DOMICILIO, valorDesdeFila, domicilioDesdeFila,
} from './importacionIA.js';
import { leerLocalidades } from './contextoDeLaImportacion.js';
import { altaConPedidos, quienDelRenglon } from './pedidosDeImportacion.js';
import { agruparRenglones, procesarGrupo } from './servicioImportado.js';
import { columnasSinLugar, guardarColumnasSinLugar } from './historiaAnterior.js';

export const TIPOS_DE_PERSONAS = ['asistente', 'cliente', 'servicio'];

// El texto del domicilio tal como vino en la planilla, para mostrarle a la Prestadora qué decía.
function domicilioComoVino(domicilio) {
  if (!domicilio) return null;
  return domicilio.renglon
    ?? ([domicilio.calle, domicilio.numero, domicilio.localidad, domicilio.partido, domicilio.provincia]
      .filter(Boolean).join(', ') || null);
}

// Los datos de un renglón, listos para crear a la persona. No llevan la conexión ni la Prestadora:
// si el renglón queda esperando un dato se guarda entero en el pedido, y eso lo agrega el alta.
function datosDelRenglon({ tipo, fila, mapeo, camposDelDomicilio, lectura }) {
  const datos = {};
  for (const campo of CAMPOS_IMPORTACION[tipo]) {
    if (camposDelDomicilio.has(campo)) continue;
    datos[campo] = valorDesdeFila(fila, mapeo, campo, CAMPOS_LISTA[tipo].has(campo));
  }
  // La localidad dudosa no deja afuera a la persona: entra con la calle, y la localidad se pide.
  const partes = lectura.partes ?? lectura.domicilioQueEntra ?? null;
  if (tipo === 'asistente') {
    datos.domicilioPartido = partes;
    datos.lugares = lectura.lugares ?? [];
  } else {
    datos.domicilioDelPacientePartido = partes;
    datos.domicilioPaciente = valorDesdeFila(fila, mapeo, 'domicilioPaciente', false);
  }
  return datos;
}

/**
 * Importa una hoja de personas.
 *
 * @param {object} ctx el contexto de la importación, ya con el lote.
 * @param {{ tipo: string, hoja: { indice: number, nombre: string }, filas: object[], mapeo: object }} entrada
 * @returns {Promise<{ creadas: number, errores: object[], vinculadas: object[], yaEstaban: object[] }>}
 */
export async function importarHojaDePersonas(ctx, { tipo, hoja, filas, mapeo }) {
  const { db, prestadoraId } = ctx;
  const errores = [];
  // Las filas cuya persona ya estaba en Contactos: no se cargó de nuevo, se usó la que había.
  const vinculadas = [];
  // Las filas que ya habían entrado en una importación anterior: no se volvieron a crear.
  const yaEstaban = [];
  let creadas = 0;

  // Las localidades se resuelven antes de crear a nadie y todas juntas, para consultar el servicio
  // de direcciones por tandas y no fila por fila. Lo que no se reconoce sin duda queda como pedido.
  const domicilios = filas.map((fila) => domicilioDesdeFila(fila, mapeo, tipo));
  const trabajos = filas.map((fila) => (tipo === 'asistente' ? valorDesdeFila(fila, mapeo, 'dondeAceptaTrabajar', true) : []));
  let localidades;
  try {
    localidades = await leerLocalidades(db, prestadoraId, filas.map((_, i) => ({
      domicilio: domicilios[i],
      lugaresDeTrabajo: trabajos[i],
    })));
  } catch (error) {
    console.error(`Importación ${ctx.importacionId}, hoja ${hoja.indice}, localidades:`, error?.message ?? error);
    localidades = filas.map(() => ({ partes: null, lugares: [], motivo: { codigo: 'falla_del_sistema' } }));
  }

  // Lo que ya resolvió la lectura de localidades no se vuelve a pasar como texto suelto.
  const base = CAMPOS_DOMICILIO[tipo];
  const camposDelDomicilio = new Set(CAMPOS_IMPORTACION[tipo].filter((campo) => campo.startsWith(base)));
  camposDelDomicilio.add('dondeAceptaTrabajar');

  // El género mal escrito se corrige antes de crear a nadie y todo junto: cada forma distinta una
  // sola vez. Lo que no se resuelve con certeza queda como estaba y vuelve como pedido de dato.
  const camposDeGenero = tipo === 'asistente' ? ['genero'] : ['generoContacto', 'generoPaciente'];
  const generos = await ctx.leerGeneros(
    filas.flatMap((fila) => camposDeGenero.map((campo) => valorDesdeFila(fila, mapeo, campo, false))),
  );

  const renglones = filas.map((fila, i) => {
    const lectura = localidades[i];
    const datos = datosDelRenglon({ tipo, fila, mapeo, camposDelDomicilio, lectura });
    for (const campo of camposDeGenero) {
      const leido = generos.get(String(datos[campo] ?? ''));
      if (leido) datos[campo] = leido;
    }
    const localidad = {
      motivo: lectura.motivo ?? null,
      domicilioQueEntra: lectura.domicilioQueEntra ?? null,
      trabajoNoReconocido: lectura.trabajoNoReconocido ?? null,
      valorOriginal: domicilioComoVino(domicilios[i]),
      valorTrabajo: trabajos[i]?.length ? trabajos[i].join(', ') : null,
    };
    return { fila: i + 1, datos, localidad };
  });
  const sobrantesDe = (numero) => columnasSinLugar(filas[numero - 1], mapeo);

  // Un error que no tiene pedido —una falla de este lado— no corta la hoja: queda con su hoja, su
  // fila y su motivo, que la pantalla traduce. El texto crudo va sólo al registro del servidor.
  const anotarFalla = (filasAfectadas, error) => {
    console.error(`Importación ${ctx.importacionId}, hoja ${hoja.indice}, fila ${filasAfectadas[0]}:`, error?.message ?? error);
    for (const fila of filasAfectadas) errores.push({ hoja: hoja.indice, fila, motivo: error?.motivo ?? 'falla_del_sistema' });
  };
  const anotarResultado = (resultado, renglon, cuantas) => {
    if (resultado.estado === 'yaEstaba') {
      yaEstaban.push({ hoja: hoja.indice, fila: renglon.fila, numeroCliente: resultado.alta?.numeroCliente });
      return;
    }
    if (resultado.estado !== 'creada') return;
    creadas += cuantas;
    if (resultado.alta?.fichaQueYaExistia) {
      vinculadas.push({
        hoja: hoja.indice,
        fila: renglon.fila,
        documento: String(renglon.datos.documentoContacto ?? '').replace(/[\s.-]/g, ''),
        numeroCliente: resultado.alta.numeroCliente,
      });
    }
  };
  // Las columnas sin lugar de cada renglón. Si la persona todavía no entró, quedan en un pedido.
  const guardarSobrantes = async (numeros, alta) => {
    for (const numero of numeros) {
      try {
        await guardarColumnasSinLugar(ctx, { tipo, hoja, fila: numero, sobrantes: sobrantesDe(numero), alta });
      } catch (error) {
        anotarFalla([numero], error);
      }
    }
  };

  if (tipo === 'servicio') {
    // Varios renglones del mismo Cliente con el mismo Paciente son un solo Servicio, con una
    // guardia por renglón.
    for (const grupo of agruparRenglones(renglones)) {
      const filasDelGrupo = grupo.guardias.map((g) => g.fila);
      let resultado;
      try {
        resultado = await procesarGrupo(ctx, grupo);
        anotarResultado(resultado, grupo, filasDelGrupo.length);
      } catch (error) {
        anotarFalla(filasDelGrupo, error);
        continue;
      }
      await guardarSobrantes(filasDelGrupo, resultado.alta ?? null);
    }
  } else {
    for (const renglon of renglones) {
      let resultado;
      try {
        resultado = await altaConPedidos(ctx, { tipo, ...renglon, quien: quienDelRenglon(tipo, renglon.datos) });
        anotarResultado(resultado, renglon, 1);
      } catch (error) {
        anotarFalla([renglon.fila], error);
        continue;
      }
      await guardarSobrantes([renglon.fila], resultado.alta ?? null);
    }
  }

  return { creadas, errores, vinculadas, yaEstaban };
}
