import { Router } from 'express';
import multer from 'multer';
import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import { exigirAdminDePrestadora } from '../middleware/exigirAdministracion.js';
import { clienteDelPedido, enLaPrestadora, TRABAJO_DE_LA_IMPORTACION } from '../db/connection.js';
import { requierePermiso, tienePermiso } from '../utils/permisos.js';
import {
  activarVerificacionAltaAsistente, revertirAsistenteImportado, revertirClienteImportada,
} from '../utils/cuentasPanel.js';
import { parsearArchivo } from '../utils/importacionIA.js';
import { contextoDeLaImportacion } from '../utils/contextoDeLaImportacion.js';
import {
  abrirPedido, cerrarPedido, cerrarPedidosDelLote, contarAbiertos, leerPedido, listarPedidos, responderPedido,
} from '../utils/pedidosDeImportacion.js';
import { continuarGrupo, responderDeServicio } from '../utils/servicioImportado.js';
import { responderAmpliado } from '../utils/pedidosAmpliados.js';
import { abrirLoteManual, anotarLote, esIdentificador, TIPOS_DE_CARGA_MANUAL } from '../utils/loteManual.js';
import { proponerConfiguracionInicial } from '../utils/propuestaConfiguracionInicial.js';
import { ErrorConMotivo, responderError } from '../utils/errorConMotivo.js';
import { exigirConfiguracionInicial } from '../utils/configuracionInicial.js';
import { FICHA_DOMICILIO, conSusFichas } from '../utils/fichaDelPaciente.js';
import {
  CAMPOS_DE_LA_LISTA_DE_PRECIOS, errorDeLaBase, esLoteDePersonas, fechaDelDia, mapeoPropuestoDeLaLista, renglonesDeLaLista,
} from '../utils/actualizacionDePrecios.js';
import {
  analizarLaImportacion, archivoDelPedido, esTipoDeImportacion, faltanRenglones, hojasConfirmadas, leerLaImportacion,
  tamanoMaximoDeImportacion, textoDeLasHojas,
} from '../utils/analisisDeLaImportacion.js';
import { importarHojaDePersonas, TIPOS_DE_PERSONAS } from '../utils/importacionDePersonas.js';
import { esDeLaPrestadora, importarDocumento, importarHojaDeHistoria } from '../utils/historiaAnterior.js';
import { importarHojaDeMedicacion, importarHojaDeRangos } from '../utils/medicacionImportada.js';
import { leerDocumentoIA } from '../utils/lecturaIA.js';
import { DEPOSITO_DE_ORIGINALES, enlaceTemporal, guardarOriginal } from '../utils/originalesDeImportacion.js';
import { esTipoAceptado, extensionDeArchivo, rutaDeLaReceta } from '../utils/archivosSubidos.js';

// La lista de precios es de la facturación del Cliente: la importa y la revisa la administración, o
// quien tenga esta acción del catálogo de permisos, además de la de importar.
const ACCION_FACTURACION = 'ver_facturacion_cliente';

// Las recetas de las indicaciones de medicación: el mismo depósito que usa el alta a mano.
const DEPOSITO_DE_RECETAS = 'prescripciones-medicacion';

export const panelImportacionRouter = Router();

// Con el trabajo de la Prestadora, porque las filas importadas nacen pendientes de conformidad, y
// eso es justo lo que la base les esconde a todos en `asistentes`, `clientes` y `pacientes`: con la
// credencial de quien pide, la revisión, la conformidad y el rechazo no verían ninguna fila del
// lote. La base hace una sola excepción, y es este trabajo por su nombre
// (`interno.es_la_importacion()`); cualquier otro sigue sin ver lo pendiente. El filtro por
// Prestadora queda escrito igual, que es lo que hace todo el backend.
//
// El nombre es el que la base compara: cambiarlo acá sin cambiarlo allá deja la importación sin
// ver lo que escribe.
export { TRABAJO_DE_LA_IMPORTACION };

// Ningún archivo se rechaza por su formato: lo que no es una tabla es un documento. El único tope es
// el tamaño, que se configura por variable de entorno.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: tamanoMaximoDeImportacion() },
});

function manejarErrorMulter(err, req, res, next) {
  if (!err) return next();
  const motivo = err.code === 'LIMIT_FILE_SIZE' ? 'archivo_demasiado_grande' : 'archivo_ilegible';
  return responderError(res, new ErrorConMotivo(motivo, err.message));
}

const soloAdminDePrestadora = exigirAdminDePrestadora('sin_permiso');

function exigirTipo(tipo) {
  if (!esTipoDeImportacion(tipo)) throw new ErrorConMotivo('tipo_de_importacion_invalido');
}

// Lo que mandó la pantalla por cada hoja. En un envío con archivo llega como texto JSON.
function hojasDelCuerpo(valor) {
  if (valor === undefined || valor === null || valor === '') return [];
  if (Array.isArray(valor)) return valor;
  try {
    const leido = JSON.parse(String(valor));
    if (Array.isArray(leido)) return leido;
  } catch {
    // Cae abajo: no es una lista.
  }
  throw new ErrorConMotivo('dato_invalido');
}

// Lee el lote de la Prestadora o falla con `lote_no_encontrado`.
async function leerLote(db, prestadoraId, importacionId, columnas = '*') {
  if (!esIdentificador(importacionId)) throw new ErrorConMotivo('lote_no_encontrado');
  const { data, error } = await db
    .from('importaciones_prestadora')
    .select(columnas)
    .eq('id', importacionId)
    .eq('prestadora_id', prestadoraId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new ErrorConMotivo('lote_no_encontrado');
  return data;
}

// Lee el archivo, lo analiza y propone qué columna es cuál en cada hoja. No crea nada todavía.
// Llega un archivo de cualquier formato, o el texto pegado en el campo `texto`.
panelImportacionRouter.post(
  '/analizar',
  requiereRolPanel,
  requierePermiso('importar_datos_masivos'),
  upload.single('archivo'),
  manejarErrorMulter,
  async (req, res) => {
    try {
      const tipo = req.body?.tipo;
      exigirTipo(tipo);
      const archivo = archivoDelPedido({ archivo: req.file, texto: req.body?.texto });
      res.json(await analizarLaImportacion({ tipo, archivo, prestadoraId: req.usuarioPanel.prestadoraId }));
    } catch (error) {
      responderError(res, error, 400);
    }
  }
);

// La guía de primeros pasos, con una planilla que la Prestadora ya tiene.
//
// Lee el archivo como la ruta de arriba y contesta qué configuración inicial traería, sumando todas
// las hojas: cuántas filas y, para Asistentes, qué tipos de Asistente nombra que todavía no estén
// configurados. No crea nada. Devuelve además el análisis entero para que la pantalla de
// importación siga desde donde quedó, sin volver a leer el archivo.
panelImportacionRouter.post(
  '/propuesta-inicial',
  requiereRolPanel,
  requierePermiso('importar_datos_masivos'),
  upload.single('archivo'),
  manejarErrorMulter,
  async (req, res) => {
    try {
      const tipo = req.body?.tipo;
      exigirTipo(tipo);
      const archivo = archivoDelPedido({ archivo: req.file, texto: req.body?.texto });
      const prestadoraId = req.usuarioPanel.prestadoraId;
      const analisis = await analizarLaImportacion({ tipo, archivo, prestadoraId });

      let filasTotales = 0;
      const tiposNuevos = new Set();
      const advertencias = new Set(analisis.advertencias);
      for (const hoja of analisis.hojas) {
        const propuesta = await proponerConfiguracionInicial({
          db: clienteDelPedido(req), tipo, filas: hoja.filas, mapeo: hoja.mapeoPropuesto, prestadoraId,
        });
        filasTotales += propuesta.filasTotales;
        for (const nombre of propuesta.tiposNuevos) tiposNuevos.add(nombre);
        for (const a of hoja.advertencias) advertencias.add(a);
      }

      res.json({
        tipo,
        archivoNombre: analisis.archivoNombre,
        filasTotales,
        tiposNuevos: [...tiposNuevos],
        advertencias: [...advertencias],
        analisis,
      });
    } catch (error) {
      responderError(res, error, 400);
    }
  }
);

// Una hoja, según lo que se importa. Devuelve siempre la misma forma.
async function importarUnaHoja(ctx, { tipo, hoja, mapeo, clase }) {
  const vacio = { creadas: 0, pedidos: 0, errores: [], vinculadas: [], yaEstaban: [] };
  const entrada = { hoja, filas: hoja.filas, mapeo };
  if (TIPOS_DE_PERSONAS.includes(tipo)) return { ...vacio, ...(await importarHojaDePersonas(ctx, { tipo, ...entrada })) };
  if (tipo === 'historia') return { ...vacio, ...(await importarHojaDeHistoria(ctx, { ...entrada, clase })) };
  if (tipo === 'medicacion') return { ...vacio, ...(await importarHojaDeMedicacion(ctx, entrada)) };
  if (tipo === 'rangos_vitales') return { ...vacio, ...(await importarHojaDeRangos(ctx, entrada)) };
  throw new ErrorConMotivo('tipo_de_importacion_invalido');
}

// El documento de la historia de un Paciente: se guarda entero, y lo encontrado en él queda como
// pedido para que la Prestadora lo confirme o lo descarte.
async function importarElDocumento(ctx, { archivo, lectura, pacienteId }) {
  if (lectura.esDocumento) {
    const { hallazgos, advertencias } = await leerDocumentoIA({
      documento: lectura.documento, buffer: archivo.buffer, prestadoraId: ctx.prestadoraId,
    });
    const { pedidos } = await importarDocumento(ctx, {
      pacienteId, archivo, texto: lectura.documento?.texto || null, hallazgos,
    });
    return { pedidos, advertencias };
  }
  // Un archivo que se leyó como tabla y se importa como documento: queda con su texto.
  const { pedidos } = await importarDocumento(ctx, { pacienteId, archivo, texto: textoDeLasHojas(lectura.hojas) });
  return { pedidos, advertencias: [] };
}

// Confirma la importación. El archivo vuelve a llegar —o el texto pegado— y se vuelve a leer acá:
// no se confía en filas mandadas por el navegador. Cada hoja entra con el mapeo que corrigió la
// Prestadora; la que no mandó entra igual, sin mapeo. En una importación nada queda afuera: el dato
// que falta o es dudoso queda como pedido de dato abierto, y el original se guarda entero.
//
// Los Asistentes y Clientes creados acá quedan pendientes de conformidad hasta que la Prestadora
// revise el resultado real y lo conforme o lo rechace. Los demás lotes nacen confirmados: no se
// rechazan, y lo dudoso quedó en sus pedidos.
panelImportacionRouter.post(
  '/confirmar',
  requiereRolPanel,
  requierePermiso('importar_datos_masivos'),
  upload.single('archivo'),
  manejarErrorMulter,
  // Nadie entra por planilla mientras la Prestadora no completó su configuración inicial: es el
  // mismo candado que el alta a mano.
  exigirConfiguracionInicial,
  async (req, res) => {
    const prestadoraId = req.usuarioPanel.prestadoraId;
    const usuarioPanelId = req.usuarioPanel.id;
    try {
      const tipo = req.body?.tipo;
      exigirTipo(tipo);
      const archivo = archivoDelPedido({ archivo: req.file, texto: req.body?.texto });
      const hojasMandadas = hojasDelCuerpo(req.body?.hojas);
      const lectura = await leerLaImportacion({ archivo, prestadoraId });
      const esDocumento = tipo === 'documento' || lectura.esDocumento;

      const pacienteId = typeof req.body?.pacienteId === 'string' ? req.body.pacienteId.trim() : '';
      if (esDocumento && !esIdentificador(pacienteId)) throw new ErrorConMotivo('importacion_incompleta');
      const hojas = esDocumento ? [] : hojasConfirmadas({ tipo, hojasLeidas: lectura.hojas, hojasMandadas });

      const resultado = await enLaPrestadora(prestadoraId, TRABAJO_DE_LA_IMPORTACION, async (db) => {
        if (esDocumento && !(await esDeLaPrestadora(db, prestadoraId, 'pacientes', pacienteId))) {
          throw new ErrorConMotivo('persona_no_encontrada');
        }
        const filasTotales = esDocumento ? 1 : hojas.reduce((suma, h) => suma + h.hoja.filas.length, 0);
        const loteId = await anotarLote(db, {
          prestadoraId,
          usuarioPanelId,
          tipo: esDocumento ? 'documento' : tipo,
          archivoNombre: archivo.originalname,
          filasTotales,
          archivoTipo: archivo.mimetype || null,
          archivoTamano: archivo.buffer.length,
          hojas: lectura.hojas.map((h) => ({
            indice: h.indice, nombre: h.nombre, renglonesContados: h.renglonesContados ?? null, renglonesLeidos: h.filas.length,
          })),
        });

        // El original, entero. Si no se pudo guardar, la importación sigue: lo leído entra igual,
        // y el lote queda sin original.
        try {
          await guardarOriginal(db, { prestadoraId, loteId, archivo });
        } catch (error) {
          console.error(`Importación ${loteId}, original:`, error?.message ?? error);
        }

        const ctx = await contextoDeLaImportacion({
          db, prestadoraId, importacionId: loteId, usuarioPanelId, conexionDeQuienPide: clienteDelPedido(req),
        });
        const advertencias = new Set(lectura.advertencias);
        const errores = [];
        const vinculadas = [];
        const yaEstaban = [];
        let creadas = 0;

        if (esDocumento) {
          try {
            const documento = await importarElDocumento(ctx, { archivo, lectura, pacienteId });
            creadas = 1;
            for (const a of documento.advertencias) advertencias.add(a);
          } catch (error) {
            console.error(`Importación ${loteId}, documento:`, error?.message ?? error);
            errores.push({ hoja: null, fila: 1, motivo: error?.motivo ?? 'falla_del_sistema' });
          }
        }

        for (const { hoja, mapeo, clase } of hojas) {
          // Los renglones contados que no se leyeron no se pierden en silencio: quedan pedidos.
          if (faltanRenglones(hoja)) {
            advertencias.add('renglones_no_coinciden');
            await abrirPedido(db, {
              prestadoraId,
              importacionId: loteId,
              fila: 1,
              dato: 'renglones',
              motivo: 'renglones_no_coinciden',
              valorOriginal: String(hoja.renglonesContados),
              renglon: { para: 'renglones', hoja: hoja.indice },
            });
          }
          try {
            const deLaHoja = await importarUnaHoja(ctx, { tipo, hoja, mapeo, clase });
            creadas += deLaHoja.creadas;
            errores.push(...deLaHoja.errores);
            vinculadas.push(...deLaHoja.vinculadas);
            yaEstaban.push(...deLaHoja.yaEstaban);
          } catch (error) {
            console.error(`Importación ${loteId}, hoja ${hoja.indice}:`, error?.message ?? error);
            errores.push({ hoja: hoja.indice, fila: null, motivo: error?.motivo ?? 'falla_del_sistema' });
          }
        }

        // El lote se cierra nombrando la Organización, no sólo con su identificador. Los que no son
        // de personas quedan además confirmados: no esperan revisión.
        const cierre = { filas_creadas: creadas, filas_error: errores.length, errores };
        if (!esLoteDePersonas({ tipo: esDocumento ? 'documento' : tipo })) {
          Object.assign(cierre, {
            estado_conformidad: 'confirmada', revisada_en: new Date().toISOString(), revisada_por: usuarioPanelId,
          });
        }
        const { error: errorCierre } = await db
          .from('importaciones_prestadora')
          .update(cierre)
          .eq('id', loteId)
          .eq('prestadora_id', prestadoraId);
        if (errorCierre) console.error(`Importación ${loteId}, cierre del lote:`, errorCierre.message);

        return {
          ok: true,
          importacionId: loteId,
          loteId,
          filasTotales,
          filasCreadas: creadas,
          filasError: errores.length,
          errores,
          vinculadas,
          yaEstaban,
          pedidosAbiertos: await contarAbiertos(db, { prestadoraId, importacionId: loteId }),
          advertencias: [...advertencias],
        };
      });
      res.json(resultado);
    } catch (error) {
      responderError(res, error, error instanceof ErrorConMotivo ? 400 : 500);
    }
  }
);

// Los lotes de la Prestadora, con el original guardado de cada uno. Sólo para su Administrador.
panelImportacionRouter.get(
  '/lotes',
  requiereRolPanel,
  soloAdminDePrestadora,
  async (req, res) => {
    const prestadoraId = req.usuarioPanel.prestadoraId;
    try {
      const lotes = await enLaPrestadora(prestadoraId, TRABAJO_DE_LA_IMPORTACION, async (db) => {
        const { data, error } = await db
          .from('importaciones_prestadora')
          .select('id, tipo, archivo_nombre, filas_totales, filas_creadas, filas_error, estado_conformidad, created_at, archivo_ruta, hojas')
          .eq('prestadora_id', prestadoraId)
          .order('created_at', { ascending: false });
        if (error) throw new Error(error.message);
        return data ?? [];
      });
      res.json({
        lotes: lotes.map((lote) => ({
          id: lote.id,
          tipo: lote.tipo,
          archivoNombre: lote.archivo_nombre ?? null,
          filasTotales: lote.filas_totales ?? 0,
          filasCreadas: lote.filas_creadas ?? 0,
          filasError: lote.filas_error ?? 0,
          estadoConformidad: lote.estado_conformidad,
          creado: lote.created_at,
          tieneOriginal: Boolean(lote.archivo_ruta),
          hojas: Array.isArray(lote.hojas) ? lote.hojas : [],
        })),
      });
    } catch (error) {
      responderError(res, error);
    }
  }
);

// El original de un lote, por un enlace temporal de 60 segundos pedido con la sesión de quien pide:
// el depósito decide si lo alcanza.
panelImportacionRouter.get(
  '/lotes/:id/original',
  requiereRolPanel,
  soloAdminDePrestadora,
  async (req, res) => {
    const prestadoraId = req.usuarioPanel.prestadoraId;
    try {
      const lote = await enLaPrestadora(prestadoraId, TRABAJO_DE_LA_IMPORTACION, (db) =>
        leerLote(db, prestadoraId, req.params.id, 'id, archivo_nombre, archivo_tipo, archivo_ruta'));
      const url = await enlaceTemporal(clienteDelPedido(req), DEPOSITO_DE_ORIGINALES, lote.archivo_ruta);
      if (!url) throw new ErrorConMotivo('sin_original');
      res.json({ url, nombre: lote.archivo_nombre ?? null, tipo: lote.archivo_tipo ?? null });
    } catch (error) {
      responderError(res, error);
    }
  }
);

// Lo encontrado en un documento, leído con la sesión de quien pide: la regla de la información de
// salud decide si lo alcanza, y la lectura queda registrada. Si no lo alcanza, va vacío.
async function hallazgoParaLaPantalla(dbDeQuienPide, hallazgoId) {
  try {
    const { data, error } = await dbDeQuienPide
      .from('historia_anterior_del_paciente')
      .select('id, datos')
      .eq('id', hallazgoId)
      .eq('clase', 'hallazgo')
      .maybeSingle();
    if (error || !data) return null;
    return {
      valores: data.datos?.valores ?? {},
      donde: { pagina: data.datos?.donde?.pagina ?? null, fragmento: data.datos?.donde?.fragmento ?? null },
    };
  } catch (error) {
    console.error('Importación, lectura de un hallazgo:', error?.message ?? error);
    return null;
  }
}

// Los pedidos de dato abiertos de la Prestadora, o sólo los de un lote. Los ve quien puede
// importar, igual que la revisión del lote.
panelImportacionRouter.get(
  '/pedidos',
  requiereRolPanel,
  requierePermiso('importar_datos_masivos'),
  async (req, res) => {
    const { importacionId } = req.query;
    try {
      if (importacionId !== undefined && !esIdentificador(importacionId)) throw new ErrorConMotivo('dato_invalido');
      const prestadoraId = req.usuarioPanel.prestadoraId;
      const pedidos = await enLaPrestadora(prestadoraId, TRABAJO_DE_LA_IMPORTACION, (db) =>
        listarPedidos(db, { prestadoraId, importacionId: importacionId ?? null }));
      const dbDeQuienPide = clienteDelPedido(req);
      for (const pedido of pedidos) {
        if (pedido.hallazgoId) pedido.hallazgo = await hallazgoParaLaPantalla(dbDeQuienPide, pedido.hallazgoId);
      }
      res.json({ pedidos });
    } catch (error) {
      responderError(res, error);
    }
  }
);

// Contesta un pedido de dato: aplica la respuesta y completa lo que esperaba. Si la respuesta no
// sirve, el pedido queda abierto y vuelve el motivo. La respuesta llega dentro de `valor` o suelta
// en el cuerpo: las dos formas valen.
panelImportacionRouter.post(
  '/pedidos/:id/responder',
  requiereRolPanel,
  requierePermiso('importar_datos_masivos'),
  async (req, res) => {
    const prestadoraId = req.usuarioPanel.prestadoraId;
    try {
      if (!esIdentificador(req.params.id)) throw new ErrorConMotivo('pedido_inexistente');
      const cuerpo = req.body ?? {};
      const valor = Object.hasOwn(cuerpo, 'valor') ? cuerpo.valor : cuerpo;
      const resultado = await enLaPrestadora(prestadoraId, TRABAJO_DE_LA_IMPORTACION, async (db) => {
        const ctx = await contextoDeLaImportacion({
          db, prestadoraId, usuarioPanelId: req.usuarioPanel.id, conexionDeQuienPide: clienteDelPedido(req),
        });
        return responderPedido(ctx, req.params.id, valor, { responderDeServicio, continuarGrupo, responderAmpliado });
      });
      res.json(resultado);
    } catch (error) {
      responderError(res, error, error instanceof ErrorConMotivo ? 400 : 500);
    }
  }
);

// La receta de una medicación importada: se contesta subiendo el archivo. Se sube con la sesión de
// quien pide, en una ruta nueva —nadie reemplaza una receta guardada—, y se anota en la indicación.
panelImportacionRouter.post(
  '/pedidos/:id/archivo',
  requiereRolPanel,
  requierePermiso('importar_datos_masivos'),
  soloAdminDePrestadora,
  upload.single('archivo'),
  manejarErrorMulter,
  async (req, res) => {
    const prestadoraId = req.usuarioPanel.prestadoraId;
    try {
      if (!esIdentificador(req.params.id)) throw new ErrorConMotivo('pedido_inexistente');
      if (!req.file?.buffer?.length) throw new ErrorConMotivo('falta_el_archivo');
      if (!esTipoAceptado(req.file.mimetype)) throw new ErrorConMotivo('archivo_ilegible');

      const pedido = await enLaPrestadora(prestadoraId, TRABAJO_DE_LA_IMPORTACION, (db) =>
        leerPedido(db, prestadoraId, req.params.id));
      if (!pedido || pedido.renglon?.para !== 'receta' || !esIdentificador(pedido.renglon?.indicacion_id) || !pedido.paciente_id) {
        throw new ErrorConMotivo('pedido_inexistente');
      }
      if (pedido.estado !== 'abierto') throw new ErrorConMotivo('pedido_ya_resuelto');

      const sesion = clienteDelPedido(req);
      const ruta = rutaDeLaReceta(prestadoraId, pedido.paciente_id, extensionDeArchivo(req.file.mimetype));
      const { error: errorSubida } = await sesion.storage
        .from(DEPOSITO_DE_RECETAS)
        .upload(ruta, req.file.buffer, { contentType: req.file.mimetype, upsert: false });
      if (errorSubida) throw new Error(errorSubida.message);

      const { data: anotada, error } = await sesion
        .from('indicaciones_medicacion')
        .update({ prescripcion_archivo_url: ruta })
        .eq('id', pedido.renglon.indicacion_id)
        .eq('prestadora_id', prestadoraId)
        .select('id');
      if (error) throw new Error(error.message);
      if (!anotada?.length) throw new ErrorConMotivo('pedido_inexistente');

      const pendientes = await enLaPrestadora(prestadoraId, TRABAJO_DE_LA_IMPORTACION, async (db) => {
        await cerrarPedido(db, { prestadoraId, id: pedido.id, respuesta: { ruta }, usuarioPanelId: req.usuarioPanel.id });
        return contarAbiertos(db, { prestadoraId });
      });
      res.json({ ok: true, pendientes });
    } catch (error) {
      responderError(res, error, error instanceof ErrorConMotivo ? 400 : 500);
    }
  }
);

// Abre el lote de la carga uno por uno, o devuelve el que la persona abrió hoy y todavía no se
// revisó. Lo cargado con los formularios de alta entra ahí y pasa por la misma revisión.
panelImportacionRouter.post(
  '/lote-manual',
  requiereRolPanel,
  requierePermiso('importar_datos_masivos'),
  exigirConfiguracionInicial,
  async (req, res) => {
    const prestadoraId = req.usuarioPanel.prestadoraId;
    try {
      const { tipo } = req.body ?? {};
      if (!TIPOS_DE_CARGA_MANUAL.includes(tipo)) throw new ErrorConMotivo('tipo_de_importacion_invalido');
      const importacionId = await enLaPrestadora(prestadoraId, TRABAJO_DE_LA_IMPORTACION, (db) =>
        abrirLoteManual(db, { prestadoraId, usuarioPanelId: req.usuarioPanel.id, tipo }));
      res.json({ importacionId });
    } catch (error) {
      responderError(res, error);
    }
  }
);

// Trae el lote y las filas efectivamente creadas para que la Prestadora revise el resultado real
// antes de conformarlo. Los lotes que no son de personas no tienen filas que revisar acá: lo que
// cargaron está en la historia, en la medicación o en los valores normales del Paciente.
panelImportacionRouter.get(
  '/revision/:importacionId',
  requiereRolPanel,
  requierePermiso('importar_datos_masivos'),
  async (req, res) => {
    const prestadoraId = req.usuarioPanel.prestadoraId;
    try {
      const lote = await enLaPrestadora(prestadoraId, TRABAJO_DE_LA_IMPORTACION, (db) =>
        leerLote(db, prestadoraId, req.params.importacionId));
      // El lote de una lista de precios trae precios en sus renglones dudosos: sólo lo abre quien
      // tiene la facturación del Cliente. La pregunta va con la sesión de quien pide.
      if (lote.tipo === 'lista_precios' && !(await tienePermiso({ db: clienteDelPedido(req), accion: ACCION_FACTURACION }))) {
        throw new ErrorConMotivo('sin_permiso');
      }
      if (!esLoteDePersonas(lote)) return res.json({ lote, filas: [] });

      const filas = await enLaPrestadora(prestadoraId, TRABAJO_DE_LA_IMPORTACION, async (db) => {
        const { data, error } = await db
          .from(lote.tipo === 'asistente' ? 'asistentes' : 'clientes')
          .select(lote.tipo === 'asistente'
            ? 'id, nombre, dni, email, telefono'
            : `id, pacientes(id, ${FICHA_DOMICILIO})`)
          .eq('importacion_id', lote.id)
          .eq('prestadora_id', prestadoraId);
        if (error) throw new Error(error.message);
        return data ?? [];
      });
      res.json({
        lote,
        filas: lote.tipo === 'asistente' ? filas : filas.map((fila) => ({ ...fila, pacientes: conSusFichas(fila.pacientes) })),
      });
    } catch (error) {
      responderError(res, error);
    }
  }
);

// Lee el lote que se va a conformar o rechazar, con sus filas. Sólo un lote de personas todavía
// pendiente: los demás nacen confirmados.
async function loteDePersonasPendiente(db, prestadoraId, importacionId) {
  const lote = await leerLote(db, prestadoraId, importacionId);
  if (lote.estado_conformidad !== 'pendiente' || !esLoteDePersonas(lote)) throw new ErrorConMotivo('lote_ya_revisado');
  const tabla = lote.tipo === 'asistente' ? 'asistentes' : 'clientes';
  const { data: filas, error } = await db
    .from(tabla)
    .select('id')
    .eq('importacion_id', lote.id)
    .eq('prestadora_id', prestadoraId);
  if (error) throw new Error(error.message);
  return { lote, tabla, filas: filas ?? [] };
}

// Conforma el lote: recién acá las filas dejan de estar pendientes de conformidad y pasan a ser
// operables. Para Asistentes, corre además la verificación de alta que había quedado en espera.
panelImportacionRouter.post(
  '/conformar/:importacionId',
  requiereRolPanel,
  requierePermiso('importar_datos_masivos'),
  async (req, res) => {
    const prestadoraId = req.usuarioPanel.prestadoraId;
    try {
      const filasConfirmadas = await enLaPrestadora(prestadoraId, TRABAJO_DE_LA_IMPORTACION, async (db) => {
        const { lote, tabla, filas } = await loteDePersonasPendiente(db, prestadoraId, req.params.importacionId);

        const { error: errorUpdate } = await db
          .from(tabla)
          .update({ pendiente_conformidad: false })
          .eq('importacion_id', lote.id)
          .eq('prestadora_id', prestadoraId);
        if (errorUpdate) throw new Error(errorUpdate.message);

        // Cada Cliente del lote entró con su Paciente, también pendiente: se conforman juntos.
        if (tabla === 'clientes') {
          const { error: errorPacientes } = await db
            .from('pacientes')
            .update({ pendiente_conformidad: false })
            .eq('importacion_id', lote.id)
            .eq('prestadora_id', prestadoraId);
          if (errorPacientes) throw new Error(errorPacientes.message);
        }

        if (lote.tipo === 'asistente') {
          for (const fila of filas) {
            try {
              await activarVerificacionAltaAsistente(db, fila.id, prestadoraId, req.usuarioPanel.id);
            } catch (error) {
              console.error('Importación, verificación de alta tras conformar:', error.message);
            }
          }
        }

        const { error: errorLote } = await db
          .from('importaciones_prestadora')
          .update({ estado_conformidad: 'confirmada', revisada_en: new Date().toISOString(), revisada_por: req.usuarioPanel.id })
          .eq('id', lote.id)
          .eq('prestadora_id', prestadoraId);
        if (errorLote) console.error(`Importación ${lote.id}, conformidad del lote:`, errorLote.message);
        return filas.length;
      });
      res.json({ ok: true, filasConfirmadas });
    } catch (error) {
      responderError(res, error);
    }
  }
);

// Rechaza el lote: revierte cada fila creada (cuenta y registro) con el mismo desarmado que el alta
// a mano ante un error a mitad de camino.
panelImportacionRouter.post(
  '/rechazar/:importacionId',
  requiereRolPanel,
  requierePermiso('importar_datos_masivos'),
  async (req, res) => {
    const prestadoraId = req.usuarioPanel.prestadoraId;
    try {
      const filasRevertidas = await enLaPrestadora(prestadoraId, TRABAJO_DE_LA_IMPORTACION, async (db) => {
        const { lote, filas } = await loteDePersonasPendiente(db, prestadoraId, req.params.importacionId);

        // Las dos funciones nunca fallan: si algo queda sin limpiar lo anotan en el registro del
        // servidor y devuelven `false`. Se cuentan las filas que se revirtieron enteras.
        let revertidas = 0;
        for (const fila of filas) {
          const limpia = lote.tipo === 'asistente'
            ? await revertirAsistenteImportado(db, fila.id, prestadoraId)
            : await revertirClienteImportada(db, fila.id, prestadoraId);
          if (limpia) revertidas += 1;
        }

        // Lo que el lote todavía esperaba ya no se va a cargar: sus pedidos de dato se cierran.
        await cerrarPedidosDelLote(db, { prestadoraId, importacionId: lote.id, usuarioPanelId: req.usuarioPanel.id });

        const { error: errorLote } = await db
          .from('importaciones_prestadora')
          .update({ estado_conformidad: 'rechazada', revisada_en: new Date().toISOString(), revisada_por: req.usuarioPanel.id })
          .eq('id', lote.id)
          .eq('prestadora_id', prestadoraId);
        if (errorLote) console.error(`Importación ${lote.id}, rechazo del lote:`, errorLote.message);
        return revertidas;
      });
      res.json({ ok: true, filasRevertidas });
    } catch (error) {
      responderError(res, error);
    }
  }
);

/* La importación de una lista de precios.
   ==========================================================================

   Sigue el mismo camino —se sube la planilla, se revisa qué columna es cuál, se confirma—, con dos
   diferencias:

   · No se le pregunta a la IA: la planilla tiene tres columnas (tipo de servicio, modalidad y
     precio) y se reconocen por el nombre del encabezado. Lo que no se reconoce lo elige la persona.
   · No queda pendiente de conformidad. El precio viejo no se pisa: el nuevo se guarda con su fecha
     de comienzo y el viejo queda con su fecha de fin. Lo hace la base en una sola operación
     (`importar_lista_de_precios`), con la sesión de quien pide y sólo para la administración de
     la Prestadora. Lo que la base no carga sin duda vuelve con su fila y su motivo.

   El lote se anota en `importaciones_prestadora` como los demás, ya confirmado. */
panelImportacionRouter.post(
  '/precios/analizar',
  requiereRolPanel,
  requierePermiso('importar_datos_masivos'),
  requierePermiso(ACCION_FACTURACION),
  upload.single('archivo'),
  manejarErrorMulter,
  async (req, res) => {
    if (!req.file) return responderError(res, new ErrorConMotivo('falta_el_archivo'));
    let lectura;
    try {
      lectura = parsearArchivo(req.file.buffer, req.file.originalname);
    } catch (error) {
      return responderError(res, new ErrorConMotivo('archivo_ilegible', error?.message));
    }
    res.json({
      headers: lectura.headers,
      filas: lectura.filas,
      mapeoPropuesto: mapeoPropuestoDeLaLista(lectura.headers),
      camposDisponibles: CAMPOS_DE_LA_LISTA_DE_PRECIOS,
      camposObligatorios: CAMPOS_DE_LA_LISTA_DE_PRECIOS,
      archivoNombre: req.file.originalname,
    });
  }
);

panelImportacionRouter.post(
  '/precios/confirmar',
  requiereRolPanel,
  requierePermiso('importar_datos_masivos'),
  requierePermiso(ACCION_FACTURACION),
  async (req, res) => {
    const { filas, mapeo, archivoNombre, desde } = req.body ?? {};
    const pDesde = fechaDelDia(desde);
    if (!Array.isArray(filas) || filas.length === 0 || !mapeo || !pDesde) {
      return responderError(res, new ErrorConMotivo('faltan_datos'));
    }

    let renglones;
    try {
      renglones = renglonesDeLaLista(filas, mapeo);
    } catch (error) {
      return responderError(res, error, 400);
    }

    const { data: resultado, error } = await clienteDelPedido(req)
      .rpc('importar_lista_de_precios', { p_renglones: renglones, p_desde: pDesde });
    if (error) {
      const { error: conMotivo, estado } = errorDeLaBase(error);
      return responderError(res, conMotivo, estado);
    }

    const dudosos = Array.isArray(resultado?.dudosos) ? resultado.dudosos : [];
    const prestadoraId = req.usuarioPanel.prestadoraId;
    let loteId = null;
    try {
      loteId = await enLaPrestadora(prestadoraId, TRABAJO_DE_LA_IMPORTACION, async (db) => {
        const id = await anotarLote(db, {
          prestadoraId,
          usuarioPanelId: req.usuarioPanel.id,
          tipo: 'lista_precios',
          archivoNombre,
          filasTotales: renglones.length,
        });
        const { error: errorResultado } = await db
          .from('importaciones_prestadora')
          .update({
            filas_creadas: (resultado?.agregados ?? 0) + (resultado?.cambiados ?? 0),
            filas_error: dudosos.length,
            errores: dudosos,
            estado_conformidad: 'confirmada',
            revisada_en: new Date().toISOString(),
            revisada_por: req.usuarioPanel.id,
          })
          .eq('id', id)
          .eq('prestadora_id', prestadoraId);
        if (errorResultado) throw errorResultado;
        return id;
      });
    } catch (errorLote) {
      // Los precios ya entraron: lo que falló es la anotación del lote, y eso no se le cobra a
      // quien importó. Queda en el registro del servidor.
      console.error('Importación de lista de precios, anotación del lote:', errorLote?.message ?? errorLote);
    }

    res.json({
      loteId,
      agregados: resultado?.agregados ?? 0,
      cambiados: resultado?.cambiados ?? 0,
      sinCambio: resultado?.sin_cambio ?? 0,
      dudosos,
    });
  }
);
