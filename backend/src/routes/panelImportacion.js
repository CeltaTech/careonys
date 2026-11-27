import { Router } from 'express';
import multer from 'multer';
import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import { clienteDelPedido, enLaPrestadora, TRABAJO_DE_LA_IMPORTACION } from '../db/connection.js';
import { negarSinPermiso, requierePermiso, tienePermiso } from '../utils/permisos.js';
import {
  activarVerificacionAltaAsistente, revertirAsistenteImportado, revertirClienteImportada,
} from '../utils/cuentasPanel.js';
import {
  parsearArchivo, intentarParsearSQL, evaluarViabilidadIA, proponerMapeoIA,
  CAMPOS_IMPORTACION, CAMPOS_OBLIGATORIOS, CAMPOS_LISTA, CAMPOS_DOMICILIO, valorDesdeFila, domicilioDesdeFila,
} from '../utils/importacionIA.js';
import { contextoDeLaImportacion, leerLocalidades } from '../utils/contextoDeLaImportacion.js';
import {
  altaConPedidos, quienDelRenglon, listarPedidos, contarAbiertos, cerrarPedidosDelLote, responderPedido,
} from '../utils/pedidosDeImportacion.js';
import { agruparRenglones, procesarGrupo, continuarGrupo, responderDeServicio } from '../utils/servicioImportado.js';
import { abrirLoteManual, anotarLote, esIdentificador, TIPOS_DE_CARGA_MANUAL } from '../utils/loteManual.js';
import { proponerConfiguracionInicial } from '../utils/propuestaConfiguracionInicial.js';
import { ErrorConMotivo, responderError } from '../utils/errorConMotivo.js';
import { exigirConfiguracionInicial } from '../utils/configuracionInicial.js';
import { FICHA_DOMICILIO, conSusFichas } from '../utils/fichaDelPaciente.js';
import {
  CAMPOS_DE_LA_LISTA_DE_PRECIOS, errorDeLaBase, esLoteDePersonas, fechaDelDia, mapeoPropuestoDeLaLista, renglonesDeLaLista,
} from '../utils/actualizacionDePrecios.js';

// La lista de precios es de la facturación del Cliente: la importa y la revisa la administración, o
// quien tenga esta acción del catálogo de permisos, además de la de importar.
const ACCION_FACTURACION = 'ver_facturacion_cliente';

export const panelImportacionRouter = Router();

// Con el trabajo de la Prestadora, porque las filas importadas nacen pendientes de conformidad, y
// eso es justo lo que la base les esconde a todos en `asistentes`, `clientes` y `pacientes`: con la
// credencial de quien pide, la revisión, la conformidad y el rechazo no verían ninguna fila del
// lote. La base hace una sola excepción, y es este trabajo por su nombre
// (`interno.es_la_importacion()`); cualquier otro sigue sin ver lo pendiente. El filtro por
// Prestadora queda escrito igual, que es lo que hace todo el backend. La propuesta de configuración
// inicial no pasa por acá: sólo lee el catálogo de tipos de Asistente, y lo lee con la credencial
// de quien pide.
//
// El nombre es el que la base compara: cambiarlo acá sin cambiarlo allá deja la importación sin
// ver lo que escribe.
export { TRABAJO_DE_LA_IMPORTACION };

// Capa 1 (formato conocido): toda extensión que `xlsx` sabe leer (spreadsheets comunes +
// texto delimitado) más `.sql` (dump estándar, ver intentarParsearSQL). Cualquier otra
// extensión no se rechaza de plano en el filtro — pasa a /analizar, que intenta la Capa 1
// y si no calza recién ahí cae a la Capa 2 (juicio de viabilidad de IA); el filtro de multer
// solo pone un techo de tamaño, no de formato, según lo acordado ("que se ocupe la IA" para
// el resto).
const TAMANO_MAXIMO = 5 * 1024 * 1024; // 5 MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TAMANO_MAXIMO },
});

function manejarErrorMulter(err, req, res, next) {
  if (err) {
    return res.status(400).json({ error: 'Archivo no permitido (hasta 5 MB)' });
  }
  next();
}

const ADVERTENCIA_ESTRUCTURA_VIA_IA =
  'La estructura de este archivo fue interpretada por IA — conviene revisar el mapeo con especial atención antes de confirmar';

// Las tres capas de lectura, en un solo lugar. Están escritas acá y no adentro de una ruta
// porque las usan dos: la que analiza para importar y la que propone la configuración inicial
// desde la guía de primeros pasos. Copiar la cadena habría dejado dos lecturas que se separan
// (celtatech/CLAUDE.md §8, punto único de verdad).
//
// Devuelve `{ ok: false, motivo }` cuando ninguna capa pudo interpretar el archivo; ese motivo
// ya está escrito para mostrarse en pantalla.
async function leerPlanillaSubida({ tipo, archivo, prestadoraId }) {
  try {
    return { ok: true, viaIA: false, ...parsearArchivo(archivo.buffer, archivo.originalname) };
  } catch {
    const resultadoSQL = intentarParsearSQL(archivo.buffer);
    if (resultadoSQL) return { ok: true, viaIA: false, ...resultadoSQL };

    const viabilidad = await evaluarViabilidadIA({
      tipo, nombreArchivo: archivo.originalname, buffer: archivo.buffer, prestadoraId,
    });
    if (!viabilidad.viable) return { ok: false, motivo: viabilidad.motivo };
    return { ok: true, viaIA: true, headers: viabilidad.headers, filas: viabilidad.filas };
  }
}

// Lo anterior más el mapeo propuesto por IA: exactamente lo que devuelve `/analizar`, para que
// la guía de primeros pasos pueda pasarle su lectura a la pantalla de importación sin que el
// archivo se lea —ni se le pregunte a la IA— dos veces.
async function analizarPlanillaSubida({ tipo, archivo, prestadoraId }) {
  const lectura = await leerPlanillaSubida({ tipo, archivo, prestadoraId });
  if (!lectura.ok) return lectura;

  const { mapeo, advertencias } = await proponerMapeoIA({
    tipo, headers: lectura.headers, filasMuestra: lectura.filas, prestadoraId,
  });

  return {
    ok: true,
    analisis: {
      headers: lectura.headers,
      filas: lectura.filas,
      mapeoPropuesto: mapeo,
      advertencias: lectura.viaIA ? [ADVERTENCIA_ESTRUCTURA_VIA_IA, ...advertencias] : advertencias,
      camposDisponibles: CAMPOS_IMPORTACION[tipo],
      camposObligatorios: CAMPOS_OBLIGATORIOS[tipo],
      archivoNombre: archivo.originalname,
    },
  };
}

function tipoValido(tipo) {
  return ['asistente', 'cliente', 'servicio'].includes(tipo);
}

// Sube un archivo (Excel/CSV), lo interpreta y devuelve un mapeo propuesto por IA para que
// el Admin_prestadora lo revise/corrija antes de confirmar nada (ver Fase 3 del plan
// aprobado — no se crea ningún dato todavía en este paso).
panelImportacionRouter.post(
  '/analizar',
  requiereRolPanel,
  requierePermiso('importar_datos_masivos'),
  upload.single('archivo'),
  manejarErrorMulter,
  async (req, res) => {
    const { tipo } = req.body;
    if (!tipoValido(tipo)) {
      return res.status(400).json({ error: 'Tipo de importación inválido' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Falta el archivo' });
    }

    try {
      const resultado = await analizarPlanillaSubida({
        tipo, archivo: req.file, prestadoraId: req.usuarioPanel?.prestadoraId,
      });
      if (!resultado.ok) {
        return res.status(400).json({ error: resultado.motivo });
      }
      res.json(resultado.analisis);
    } catch (error) {
      responderError(res, error, 400);
    }
  }
);

// La guía de primeros pasos, con una planilla que la Prestadora ya tiene.
//
// Lee el archivo con la misma cadena de arriba y contesta qué configuración inicial traería:
// cuántas filas, y —para una planilla de Asistentes— qué zonas de cobertura y qué tipos de
// Asistente nombra que todavía no estén configurados. Eso último es lo que la importación no
// crea sola, y descubrirlo antes evita tener que corregir Legajo por Legajo después.
//
// No crea nada. Devuelve además el análisis entero para que la pantalla de importación siga
// desde donde quedó, sin volver a leer el archivo.
panelImportacionRouter.post(
  '/propuesta-inicial',
  requiereRolPanel,
  requierePermiso('importar_datos_masivos'),
  upload.single('archivo'),
  manejarErrorMulter,
  async (req, res) => {
    const { tipo } = req.body;
    if (!tipoValido(tipo)) {
      return res.status(400).json({ error: 'Tipo de importación inválido' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Falta el archivo' });
    }

    const prestadoraId = req.usuarioPanel?.prestadoraId;

    try {
      const resultado = await analizarPlanillaSubida({ tipo, archivo: req.file, prestadoraId });
      if (!resultado.ok) {
        return res.status(400).json({ error: resultado.motivo });
      }

      const propuesta = await proponerConfiguracionInicial({
        db: clienteDelPedido(req),
        tipo,
        filas: resultado.analisis.filas,
        mapeo: resultado.analisis.mapeoPropuesto,
        prestadoraId,
      });

      res.json({
        tipo,
        archivoNombre: resultado.analisis.archivoNombre,
        ...propuesta,
        advertencias: resultado.analisis.advertencias,
        analisis: resultado.analisis,
      });
    } catch (error) {
      responderError(res, error, 400);
    }
  }
);

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

// Confirma la importación: recorre cada fila del archivo, ya con el mapeo corregido por la
// Prestadora, y crea con el mismo camino que el alta a mano. En una importación nada queda afuera:
// el dato que falta o es dudoso queda como pedido de dato abierto, que la Prestadora contesta en
// pantalla apenas termina, y lo que esperaba ese dato se completa al contestarlo.
//
// Los Asistentes y Clientes creados acá quedan con `pendiente_conformidad=true` (ocultos por la
// política RESTRICTIVE de RLS) hasta que la Prestadora revise el resultado real y lo conforme o lo
// rechace vía /conformar o /rechazar. El lote de Servicios en curso es la excepción: son personas
// que ya se están atendiendo, y entran visibles, con el lote confirmado y sin rechazo.
panelImportacionRouter.post(
  '/confirmar',
  requiereRolPanel,
  requierePermiso('importar_datos_masivos'),
  // Nadie entra por planilla mientras la Prestadora no completó su configuración inicial: es el
  // mismo candado que el alta a mano.
  exigirConfiguracionInicial,
  async (req, res) => {
    const { tipo, filas, mapeo, archivoNombre } = req.body;
    if (!tipoValido(tipo) || !Array.isArray(filas) || !mapeo) {
      return res.status(400).json({ error: 'Datos de importación incompletos' });
    }

    const prestadoraId = req.usuarioPanel.prestadoraId;
    const usuarioPanelId = req.usuarioPanel.id;

    await enLaPrestadora(prestadoraId, TRABAJO_DE_LA_IMPORTACION, async (db) => {
      let lote;
      try {
        lote = { id: await anotarLote(db, { prestadoraId, usuarioPanelId, tipo, archivoNombre, filasTotales: filas.length }) };
      } catch (errorLote) {
        console.error('Importación, anotación del lote:', errorLote.message);
        return res.status(500).json({ error: 'No se pudo registrar el lote de importación' });
      }

      const ctx = await contextoDeLaImportacion({
        db, prestadoraId, importacionId: lote.id, usuarioPanelId, conexionDeQuienPide: clienteDelPedido(req),
      });
      const errores = [];
      // Las filas cuya persona ya estaba en Contactos: no se cargó de nuevo, se usó la que
      // había. Viaja sólo el documento y el número de cliente, que la pantalla arma en una frase.
      const vinculadas = [];
      // Las filas que ya habían entrado en una importación anterior: no se volvieron a crear. Es lo
      // que deja volver a importar la planilla corregida sin duplicar lo que sí se cargó.
      const yaEstaban = [];
      let creadas = 0;

      // Las localidades se resuelven antes de crear a nadie y todas juntas, para consultar el
      // servicio de direcciones por tandas y no fila por fila. Lo que no se reconoce sin duda queda
      // como pedido de dato con las opciones: nadie elige a ojo cuál de dos localidades era.
      const domicilios = filas.map((fila) => domicilioDesdeFila(fila, mapeo, tipo));
      const trabajos = filas.map((fila) => (tipo === 'asistente' ? valorDesdeFila(fila, mapeo, 'dondeAceptaTrabajar', true) : []));
      let localidades;
      try {
        localidades = await leerLocalidades(db, prestadoraId, filas.map((_, i) => ({
          domicilio: domicilios[i],
          lugaresDeTrabajo: trabajos[i],
        })));
      } catch (error) {
        console.error(`Importación ${lote.id}, localidades:`, error?.message ?? error);
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

      // Un error que no tiene pedido —una falla de este lado— no corta el lote: queda con su fila y
      // su motivo, que la pantalla traduce. El texto crudo va sólo al registro del servidor, porque
      // este arreglo viaja al navegador y se guarda en `importaciones_prestadora.errores`.
      const anotarFalla = (filasAfectadas, error) => {
        console.error(`Importación ${lote.id}, fila ${filasAfectadas[0]}:`, error?.message ?? error);
        for (const fila of filasAfectadas) errores.push({ fila, motivo: error?.motivo ?? 'falla_del_sistema' });
      };
      const anotarResultado = (resultado, renglon, cuantas) => {
        if (resultado.estado === 'yaEstaba') {
          yaEstaban.push({ fila: renglon.fila, numeroCliente: resultado.alta?.numeroCliente });
          return;
        }
        if (resultado.estado !== 'creada') return;
        creadas += cuantas;
        if (resultado.alta?.fichaQueYaExistia) {
          vinculadas.push({
            fila: renglon.fila,
            documento: String(renglon.datos.documentoContacto ?? '').replace(/[\s.-]/g, ''),
            numeroCliente: resultado.alta.numeroCliente,
          });
        }
      };

      if (tipo === 'servicio') {
        // Varios renglones del mismo Cliente con el mismo Paciente son un solo Servicio, con una
        // guardia por renglón.
        for (const grupo of agruparRenglones(renglones)) {
          const filasDelGrupo = grupo.guardias.map((g) => g.fila);
          try {
            anotarResultado(await procesarGrupo(ctx, grupo), grupo, filasDelGrupo.length);
          } catch (error) {
            anotarFalla(filasDelGrupo, error);
          }
        }
      } else {
        for (const renglon of renglones) {
          try {
            const resultado = await altaConPedidos(ctx, {
              tipo, ...renglon, quien: quienDelRenglon(tipo, renglon.datos),
            });
            anotarResultado(resultado, renglon, 1);
          } catch (error) {
            anotarFalla([renglon.fila], error);
          }
        }
      }

      // El lote se cierra nombrando la Organización, no sólo con su identificador: una escritura
      // que sólo dice el número de la fila alcanza a cualquier Prestadora. El de Servicios en curso
      // queda además confirmado: no espera revisión.
      const cierre = { filas_creadas: creadas, filas_error: errores.length, errores };
      if (tipo === 'servicio') {
        Object.assign(cierre, {
          estado_conformidad: 'confirmada', revisada_en: new Date().toISOString(), revisada_por: usuarioPanelId,
        });
      }
      const { error: errorCierre } = await db
        .from('importaciones_prestadora')
        .update(cierre)
        .eq('id', lote.id)
        .eq('prestadora_id', prestadoraId);
      if (errorCierre) console.error(`Importación ${lote.id}, cierre del lote:`, errorCierre.message);

      res.json({
        ok: true,
        importacionId: lote.id,
        filasTotales: filas.length,
        filasCreadas: creadas,
        filasError: errores.length,
        errores,
        vinculadas,
        yaEstaban,
        pedidosAbiertos: await contarAbiertos(db, { prestadoraId, importacionId: lote.id }),
      });
    });
  }
);

// Los pedidos de dato abiertos de la Prestadora, o sólo los de un lote. Los ve quien puede
// importar, igual que la revisión del lote.
panelImportacionRouter.get(
  '/pedidos',
  requiereRolPanel,
  requierePermiso('importar_datos_masivos'),
  async (req, res) => {
    const { importacionId } = req.query;
    if (importacionId !== undefined && !esIdentificador(importacionId)) {
      return responderError(res, new ErrorConMotivo('dato_invalido'), 400);
    }
    const prestadoraId = req.usuarioPanel.prestadoraId;
    try {
      const pedidos = await enLaPrestadora(prestadoraId, TRABAJO_DE_LA_IMPORTACION, (db) =>
        listarPedidos(db, { prestadoraId, importacionId: importacionId ?? null }));
      res.json({ pedidos });
    } catch (error) {
      responderError(res, error);
    }
  }
);

// Contesta un pedido de dato: aplica la respuesta y completa lo que esperaba —crea la persona, la
// serie de turnos de guardia, asigna al Asistente—. Si la respuesta no sirve, el pedido queda
// abierto y vuelve el motivo.
panelImportacionRouter.post(
  '/pedidos/:id/responder',
  requiereRolPanel,
  requierePermiso('importar_datos_masivos'),
  async (req, res) => {
    if (!esIdentificador(req.params.id)) {
      return responderError(res, new ErrorConMotivo('pedido_inexistente'));
    }
    const prestadoraId = req.usuarioPanel.prestadoraId;
    try {
      const resultado = await enLaPrestadora(prestadoraId, TRABAJO_DE_LA_IMPORTACION, async (db) => {
        const ctx = await contextoDeLaImportacion({
          db, prestadoraId, usuarioPanelId: req.usuarioPanel.id, conexionDeQuienPide: clienteDelPedido(req),
        });
        return responderPedido(ctx, req.params.id, req.body?.valor, { responderDeServicio, continuarGrupo });
      });
      res.json(resultado);
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
    const { tipo } = req.body ?? {};
    if (!TIPOS_DE_CARGA_MANUAL.includes(tipo)) {
      return res.status(400).json({ error: 'Tipo de importación inválido' });
    }
    const prestadoraId = req.usuarioPanel.prestadoraId;
    try {
      const importacionId = await enLaPrestadora(prestadoraId, TRABAJO_DE_LA_IMPORTACION, (db) =>
        abrirLoteManual(db, { prestadoraId, usuarioPanelId: req.usuarioPanel.id, tipo }));
      res.json({ importacionId });
    } catch (error) {
      responderError(res, error);
    }
  }
);

// Trae el lote y las filas efectivamente creadas para que la Prestadora revise el resultado
// real (no la propuesta) antes de conformarlo — segundo freno humano de la capa de importación.
panelImportacionRouter.get(
  '/revision/:importacionId',
  requiereRolPanel,
  requierePermiso('importar_datos_masivos'),
  async (req, res) => {
    const prestadoraId = req.usuarioPanel.prestadoraId;
    await enLaPrestadora(prestadoraId, TRABAJO_DE_LA_IMPORTACION, async (db) => {
      const { data: lote, error: errorLote } = await db
        .from('importaciones_prestadora')
        .select('*')
        .eq('id', req.params.importacionId)
        .eq('prestadora_id', prestadoraId)
        .single();
      if (errorLote || !lote) {
        return res.status(404).json({ error: 'Lote de importación no encontrado' });
      }
      // El lote de una lista de precios trae precios en sus renglones dudosos: sólo lo abre quien
      // tiene la facturación del Cliente. La pregunta va con la sesión de quien pide. El de Servicios
      // en curso no trae precios: lo abre quien puede importar.
      if (!esLoteDePersonas(lote) && lote.tipo !== 'servicio' && !(await tienePermiso({ db: clienteDelPedido(req), accion: ACCION_FACTURACION }))) {
        return negarSinPermiso(res);
      }

      const tabla = lote.tipo === 'asistente' ? 'asistentes' : 'clientes';
      const { data: filas, error: errorFilas } = await db
        .from(tabla)
        .select(lote.tipo === 'asistente'
          ? 'id, nombre, dni, email, telefono'
          : `id, pacientes(id, ${FICHA_DOMICILIO})`)
        .eq('importacion_id', lote.id)
        .eq('prestadora_id', prestadoraId);
      if (errorFilas) {
        return res.status(500).json({ error: 'No se pudieron leer las filas del lote' });
      }

      res.json({
        lote,
        filas: lote.tipo === 'asistente'
          ? filas
          : (filas ?? []).map((fila) => ({ ...fila, pacientes: conSusFichas(fila.pacientes) })),
      });
    });
  }
);

// Conforma el lote: recién acá las filas dejan de estar `pendiente_conformidad` y pasan a
// ser operables (visibles por RLS). Para Asistentes, corre además la política de
// verificación de alta que había quedado en espera desde la creación (mismo camino que el
// alta manual — activarVerificacionAltaAsistente).
panelImportacionRouter.post(
  '/conformar/:importacionId',
  requiereRolPanel,
  requierePermiso('importar_datos_masivos'),
  async (req, res) => {
    const prestadoraId = req.usuarioPanel.prestadoraId;
    await enLaPrestadora(prestadoraId, TRABAJO_DE_LA_IMPORTACION, async (db) => {
      const { data: lote, error: errorLote } = await db
        .from('importaciones_prestadora')
        .select('*')
        .eq('id', req.params.importacionId)
        .eq('prestadora_id', prestadoraId)
        .single();
      if (errorLote || !lote) {
        return res.status(404).json({ error: 'Lote de importación no encontrado' });
      }
      if (lote.estado_conformidad !== 'pendiente') {
        return res.status(409).json({ error: 'Este lote ya fue revisado' });
      }
      // Una lista de precios no se conforma ni se rechaza: entra entera, con el precio viejo
      // guardado con su fecha de fin, y nace confirmada.
      if (!esLoteDePersonas(lote)) {
        return res.status(409).json({ error: 'Este lote ya fue revisado' });
      }

      const tabla = lote.tipo === 'asistente' ? 'asistentes' : 'clientes';
      const { data: filas, error: errorFilas } = await db
        .from(tabla)
        .select('id')
        .eq('importacion_id', lote.id)
        .eq('prestadora_id', prestadoraId);
      if (errorFilas) {
        return res.status(500).json({ error: 'No se pudieron leer las filas del lote' });
      }

      const { error: errorUpdate } = await db
        .from(tabla)
        .update({ pendiente_conformidad: false })
        .eq('importacion_id', lote.id)
        .eq('prestadora_id', prestadoraId);
      if (errorUpdate) {
        return res.status(500).json({ error: 'No se pudo conformar el lote' });
      }

      // Cada Cliente del lote entró con su Paciente, también pendiente: se conforman juntos.
      if (tabla === 'clientes') {
        const { error: errorPacientes } = await db
          .from('pacientes')
          .update({ pendiente_conformidad: false })
          .eq('importacion_id', lote.id)
          .eq('prestadora_id', prestadoraId);
        if (errorPacientes) {
          return res.status(500).json({ error: 'No se pudo conformar el lote' });
        }
      }

      if (lote.tipo === 'asistente') {
        for (const fila of filas) {
          try {
            await activarVerificacionAltaAsistente(db, fila.id, prestadoraId, req.usuarioPanel.id);
          } catch (error) {
            console.error('Error activando verificación de alta tras conformar importación:', error.message);
          }
        }
      }

      await db
        .from('importaciones_prestadora')
        .update({ estado_conformidad: 'confirmada', revisada_en: new Date().toISOString(), revisada_por: req.usuarioPanel.id })
        .eq('id', lote.id)
        .eq('prestadora_id', prestadoraId);

      res.json({ ok: true, filasConfirmadas: filas.length });
    });
  }
);

// Rechaza el lote: revierte cada fila creada (cuenta + registro) usando el mismo desarmado
// que el alta manual ante un error a mitad de camino — nunca deja huérfanas ni cuentas ni
// filas a medio crear.
panelImportacionRouter.post(
  '/rechazar/:importacionId',
  requiereRolPanel,
  requierePermiso('importar_datos_masivos'),
  async (req, res) => {
    const prestadoraId = req.usuarioPanel.prestadoraId;
    await enLaPrestadora(prestadoraId, TRABAJO_DE_LA_IMPORTACION, async (db) => {
      const { data: lote, error: errorLote } = await db
        .from('importaciones_prestadora')
        .select('*')
        .eq('id', req.params.importacionId)
        .eq('prestadora_id', prestadoraId)
        .single();
      if (errorLote || !lote) {
        return res.status(404).json({ error: 'Lote de importación no encontrado' });
      }
      if (lote.estado_conformidad !== 'pendiente') {
        return res.status(409).json({ error: 'Este lote ya fue revisado' });
      }
      // Una lista de precios no se conforma ni se rechaza: entra entera, con el precio viejo
      // guardado con su fecha de fin, y nace confirmada.
      if (!esLoteDePersonas(lote)) {
        return res.status(409).json({ error: 'Este lote ya fue revisado' });
      }

      const tabla = lote.tipo === 'asistente' ? 'asistentes' : 'clientes';
      const { data: filas, error: errorFilas } = await db
        .from(tabla)
        .select('id')
        .eq('importacion_id', lote.id)
        .eq('prestadora_id', prestadoraId);
      if (errorFilas) {
        return res.status(500).json({ error: 'No se pudieron leer las filas del lote' });
      }

      // Las dos funciones nunca fallan: si algo queda sin limpiar lo anotan en el registro del
      // servidor y devuelven `false`. Por eso el número que se cuenta acá es el de filas que se
      // revirtieron **enteras**, no el de intentos que no explotaron.
      let revertidas = 0;
      for (const fila of filas) {
        const limpia = lote.tipo === 'asistente'
          ? await revertirAsistenteImportado(db, fila.id, prestadoraId)
          : await revertirClienteImportada(db, fila.id, prestadoraId);
        if (limpia) revertidas += 1;
      }

      // Lo que el lote todavía esperaba ya no se va a cargar: sus pedidos de dato se cierran.
      await cerrarPedidosDelLote(db, { prestadoraId, importacionId: lote.id, usuarioPanelId: req.usuarioPanel.id });

      await db
        .from('importaciones_prestadora')
        .update({ estado_conformidad: 'rechazada', revisada_en: new Date().toISOString(), revisada_por: req.usuarioPanel.id })
        .eq('id', lote.id)
        .eq('prestadora_id', prestadoraId);

      res.json({ ok: true, filasRevertidas: revertidas });
    });
  }
);

/* La importación de una lista de precios.
   ==========================================================================

   Sigue el mismo camino que la de Asistentes y Clientes —se sube la planilla, se revisa qué
   columna es cuál, se confirma—, con dos diferencias:

   · No se le pregunta a la IA: la planilla tiene tres columnas (tipo de servicio, modalidad y
     precio) y se reconocen por el nombre del encabezado. Lo que no se reconoce lo elige la persona.
   · No queda pendiente de conformidad. El precio viejo no se pisa: el nuevo se guarda con su fecha
     de comienzo y el viejo queda con su fecha de fin. Lo hace la base en una sola operación
     (`importar_lista_de_precios`), con la sesión de quien pide y sólo para la administración de
     la Prestadora. Lo que la base no carga sin duda —un renglón repetido en la lista, un precio que
     no se entiende, una fecha anterior a la del precio vigente— vuelve con su fila y su motivo.

   El lote se anota en `importaciones_prestadora` como los demás, ya confirmado. */
panelImportacionRouter.post(
  '/precios/analizar',
  requiereRolPanel,
  requierePermiso('importar_datos_masivos'),
  requierePermiso(ACCION_FACTURACION),
  upload.single('archivo'),
  manejarErrorMulter,
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'Falta el archivo' });
    }
    let lectura;
    try {
      lectura = parsearArchivo(req.file.buffer, req.file.originalname);
    } catch (error) {
      console.error('Importación de lista de precios, lectura:', error?.message ?? error);
      return res.status(400).json({ error: 'dato_invalido', motivo: 'archivo_ilegible' });
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
      return res.status(400).json({ error: 'faltan_datos', motivo: 'faltan_datos' });
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
