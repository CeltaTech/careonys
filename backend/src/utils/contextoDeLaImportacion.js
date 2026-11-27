/*
 * Lo que la importación necesita para crear personas y Servicios y para contestar sus pedidos de
 * dato, armado en un solo lugar. Lo usan la confirmación de una planilla y la respuesta a un
 * pedido: escrito dos veces, una de las dos terminaría creando distinto que la otra.
 *
 * Todo trabaja con la conexión de la importación de una sola Prestadora, y cada función nombra esa
 * Prestadora.
 */

import {
  crearAsistenteDirecto, crearClienteImportado, crearServicioDelCliente, activarVerificacionAltaAsistente,
} from './cuentasPanel.js';
import { lectorDeGeneros, reescritorDeLocalidades } from './importacionIA.js';
import { lectorDeHorarios } from './lectorDeHorarios.js';
import { resolverGeneros } from './generosDeLaImportacion.js';
import {
  catalogoDeLugares, paisDeLaPrestadora, agregarLugar, lugaresDeLaPrestadora, nombreDelLugar,
} from './catalogoDeLugares.js';
import { obtenerGeocodificador, coordenadasDeDomicilio } from '../geocodificacion/index.js';
import { resolverLocalidades } from './localidadesDeLaImportacion.js';
import { hoyEnLaPrestadora } from './relojDeLaPrestadora.js';
import { motivoDeLaAsignacion } from '../routes/panelTurnosGuardia.js';

/**
 * Lee las localidades de varios domicilios juntos, contra la lista de la Prestadora y el servicio
 * oficial de direcciones. Lo que se reconoce sin duda y no estaba en la lista se agrega.
 *
 * @param {{ domicilio: object|string, lugaresDeTrabajo: string[] }[]} filas
 */
export async function leerLocalidades(db, prestadoraId, filas) {
  const [{ lugares, zonas }, pais] = await Promise.all([
    catalogoDeLugares(db, prestadoraId),
    paisDeLaPrestadora(db, prestadoraId),
  ]);
  return resolverLocalidades({
    filas,
    lugares,
    zonas,
    herramientas: obtenerGeocodificador(pais),
    proponer: reescritorDeLocalidades({ pais, prestadoraId }),
    agregar: (lugar) => agregarLugar(db, {
      prestadoraId,
      pais,
      nombre: lugar.nombre,
      provincia: lugar.provincia,
      municipio: lugar.municipio ?? lugar.departamento,
      idOficial: lugar.idOficial,
      localidadCensal: lugar.localidadCensal,
      lat: lugar.lat,
      lng: lugar.lng,
    }),
  });
}

/** Deja operable a un Asistente que entró en un lote que ya se conformó. */
async function conformarAsistente(db, prestadoraId, usuarioPanelId, asistenteId) {
  const { error } = await db
    .from('asistentes')
    .update({ pendiente_conformidad: false })
    .eq('id', asistenteId)
    .eq('prestadora_id', prestadoraId);
  if (error) throw new Error(error.message);
  await activarVerificacionAltaAsistente(db, asistenteId, prestadoraId, usuarioPanelId);
}

/**
 * Los Coordinadores que la base sugiere para un Servicio, en su orden. La función de la base
 * contesta sólo a quien administra la Prestadora: se la llama con la sesión de la persona que
 * importa, nunca con la de la importación. Si no contesta, no hay sugerencias y se ofrecen todos.
 */
async function coordinadoresSugeridos(conexionDeQuienPide, servicioId) {
  if (!conexionDeQuienPide) return [];
  const { data, error } = await conexionDeQuienPide.rpc('coordinadores_sugeridos_para_el_servicio', { p_servicio: servicioId });
  if (error) {
    console.error(`Servicio importado ${servicioId}, Coordinadores sugeridos:`, error.message);
    return [];
  }
  return (data ?? []).map((fila) => fila.coordinador_id).filter(Boolean);
}

/**
 * El contexto que esperan `pedidosDeImportacion.js` y `servicioImportado.js`.
 *
 * `conexionDeQuienPide` es la sesión de la persona que importa. Sólo se usa para preguntarle a la
 * base qué Coordinadores sugiere para un Servicio.
 */
export async function contextoDeLaImportacion({
  db, prestadoraId, importacionId = null, usuarioPanelId, conexionDeQuienPide = null,
}) {
  const leerHorariosDeLaIA = lectorDeHorarios({ prestadoraId });
  const proponerGenero = lectorDeGeneros({ prestadoraId });
  let pais;
  const paisDeEsta = async () => {
    pais ??= await paisDeLaPrestadora(db, prestadoraId);
    return pais;
  };
  return {
    db,
    prestadoraId,
    importacionId,
    usuarioPanelId,
    hoy: await hoyEnLaPrestadora(db, prestadoraId),
    crear: {
      asistente: (datos) => crearAsistenteDirecto(datos),
      cliente: (datos) => crearClienteImportado(datos),
      servicio: (conexion, datos) => crearServicioDelCliente(conexion, datos),
    },
    leerGeneros: (textos) => resolverGeneros({ valores: textos, proponer: proponerGenero }),
    leerHorarios: (textos) => leerHorariosDeLaIA(textos),
    listarLugares: () => lugaresDeLaPrestadora(db, prestadoraId),
    nombreDelLugar: (id) => nombreDelLugar(db, id, prestadoraId),
    agregarLugar: async (lugar) => agregarLugar(db, {
      prestadoraId,
      pais: await paisDeEsta(),
      nombre: lugar.nombre,
      provincia: lugar.provincia,
      municipio: lugar.municipio ?? lugar.departamento,
      idOficial: lugar.idOficial,
      localidadCensal: lugar.localidadCensal,
      lat: lugar.lat,
      lng: lugar.lng,
    }),
    ubicar: async (texto) => {
      const [leido] = await leerLocalidades(db, prestadoraId, [{ domicilio: { renglon: texto }, lugaresDeTrabajo: [] }]);
      return leido;
    },
    coordenadas: ({ direccion, localidad }) => coordenadasDeDomicilio({ prestadoraId, direccion, localidad }),
    conformarAsistente: (asistenteId) => conformarAsistente(db, prestadoraId, usuarioPanelId, asistenteId),
    motivoDeLaAsignacion,
    coordinadoresSugeridos: (servicioId) => coordinadoresSugeridos(conexionDeQuienPide, servicioId),
  };
}
