import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import { exigirOrganizacionActiva } from '../middleware/alcancePrestadora.js';
import { clienteDelPedido, enLaPrestadora } from '../db/connection.js';
import {
  crearCuentaConPerfil,
  crearAsistenteDirecto,
  invitarPersonaAutorizada,
  revocarPersonaAutorizada,
  validarTipoAsistente,
  deshacerAlta,
  filasDeUnAsistente,
  identidadDelAsistente,
  errorDeLaIdentidad,
} from '../utils/cuentasPanel.js';
import { ErrorConMotivo, responderError } from '../utils/errorConMotivo.js';
import { configuracionInicialDe, exigirConfiguracionInicial } from '../utils/configuracionInicial.js';
import {
  ACCION_DESACTIVACION_DE_CUENTA,
  registrarActividad,
  yaQuedoRegistrado,
} from '../utils/registroDeActividad.js';
import { APROBADAS, filasDeIncorporacion } from '../utils/etapasDeIncorporacion.js';
import { RESULTADO_PENDIENTE } from '../utils/referenciasLaborales.js';
import { requierePermiso, permisosEfectivos, tienePermiso } from '../utils/permisos.js';
import { exigirAdministracion } from '../middleware/exigirAdministracion.js';
import { extensionDeArchivo } from '../utils/archivosSubidos.js';
import {
  personasAutorizadasConSusAccesos,
  crearInstruccion,
  instruccionPendiente,
  cerrarConPapelFirmado,
} from '../utils/instruccionesPersonasAutorizadas.js';
import {
  DEPOSITO_PAGADOR,
  anularPendiente,
  cerrarConPapelFirmado as cerrarConsentimientoPagador,
  consentimientoDelPagador,
  crearConsentimiento,
  estadoDelPagador,
  guardarPapel,
  rutaDelArchivo,
} from '../utils/consentimientoPagador.js';

// CON LA CREDENCIAL DE QUIEN PIDE. Lo que estas rutas leen y escriben en tablas entra con
// `clienteDelPedido(req)`: la base sabe quién pide y le contesta sólo lo de su Prestadora, así que
// ninguna consulta lleva el filtro de la Prestadora de la sesión. Cuando una fila nueva nombra a la
// Prestadora, la toma de la fila que la base ya dejó ver —la postulación, el Cliente—.
// Lo que quien pide no puede hacer con su propio acceso va con el trabajo de la Prestadora, y
// cada lugar dice por qué.

export const panelCuentasRouter = Router();

// La hoja firmada de las personas autorizadas. Mismo trato que el resto de los archivos del producto:
// depósito privado, tope de tamaño comprobado acá y no sólo en el depósito, y sólo los tres tipos
// que sirven para una hoja firmada.
const DEPOSITO_INSTRUCCIONES = 'instrucciones-acceso-personas-autorizadas';
const TIPOS_DE_PAPEL_FIRMADO = ['application/pdf', 'image/jpeg', 'image/png'];

const subirPapelFirmado = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    cb(null, TIPOS_DE_PAPEL_FIRMADO.includes(file.mimetype));
  },
});

function manejarErrorDeArchivo(err, req, res, next) {
  if (err) {
    return res.status(400).json({ error: 'Archivo no permitido (solo PDF, JPG o PNG, hasta 10 MB)' });
  }
  next();
}

// Crear una cuenta real (Auth + perfil) es una acción sensible y difícil de revertir —
// se restringe a Admin/Superadmin, a diferencia del resto del panel que también admite Coordinador.
const soloAdministracion = exigirAdministracion('Solo Admin puede crear cuentas');

// Alta desde Postulación (ruta /asistente, más abajo) se queda admin-only sin cambios — el motor
// de permisos de la Fase 2 (docs/PLAN_HASTA_PRODUCCION.md, plan aprobado) solo cubre el alta
// manual (/asistente-directo), que es lo que el plan pidió hacer configurable para Coordinador.

// Usado por el frontend (botón "Nuevo Asistente", campos de edición de
// Fase 1) para saber qué mostrar sin duplicar la lógica de permisos en el cliente — la
// única fuente de verdad sigue siendo este chequeo del lado del servidor.
panelCuentasRouter.get('/permisos-efectivos', requiereRolPanel, async (req, res) => {
  try {
    res.json({ permisos: await permisosEfectivos(clienteDelPedido(req)) });
  } catch (e) {
    responderError(res, e);
  }
});

// Qué modalidades de trabajo (directa/intermediacion) tiene activas la Prestadora, para que el
// menú del Panel muestre solo los grupos que correspondan. Lectura disponible para cualquier rol
// logueado (igual que permisos-efectivos). El Panel no las cambia: las habilita CeltaTech en
// `prestadora_modalidades` según el plan, y acá sólo se leen.
// Cuánto le falta a la configuración inicial de la Prestadora de la sesión. Lo pide el Panel para
// la guía de primeros pasos y para apagar los botones de alta, y contesta con la misma función que
// el candado de las rutas que crean gente (`utils/configuracionInicial.js`). Cualquier rol del
// Panel lo puede leer: un Coordinador con el alta habilitada necesita saber por qué no puede.
panelCuentasRouter.get('/configuracion-inicial', requiereRolPanel, exigirOrganizacionActiva, async (req, res) => {
  try {
    res.json(await configuracionInicialDe(req));
  } catch (e) {
    responderError(res, e);
  }
});

panelCuentasRouter.get('/modalidades-activas', requiereRolPanel, async (req, res) => {
  if (!req.usuarioPanel.prestadoraId) {
    return res.json({ modalidades: [] });
  }
  const { data, error } = await clienteDelPedido(req)
    .from('prestadora_modalidades')
    .select('modalidad')
    .eq('activa', true);
  if (error) return responderError(res, error);
  res.json({ modalidades: (data || []).map((f) => f.modalidad) });
});

// Inicia el Proceso de Incorporación de Asistentes (uso interno del Panel, ver glosario
// de CLAUDE.md): crea la cuenta real de Asistente a partir de una postulación aprobada,
// y registra las etapas de verificacion_asistente configuradas por esa Prestadora
// (pendiente #18 candidato 7, docs/PLAN_HASTA_PRODUCCION.md — cada Prestadora define su propio plan
// de incorporación en etapas_incorporacion_asistente, ya no hay 5 etapas fijas para todas).
// La primera etapa (menor "orden") queda aprobada de entrada porque ya se cumplió: es la
// postulación misma, que ya pasó.
panelCuentasRouter.post('/asistente', requiereRolPanel, exigirOrganizacionActiva, soloAdministracion, exigirConfiguracionInicial, async (req, res) => {
  // `tipo_asistente_id` es obligatorio: el tipo decide si a esta persona se le va a exigir
  // Matrícula vigente para poder atender. Lo elige quien aprueba, mirando la postulación —
  // no se adivina a partir del texto que la persona escribió en el formulario público.
  const { postulacionId, tipo_asistente_id } = req.body;
  if (!postulacionId) {
    return res.status(400).json({ error: 'Falta postulacionId' });
  }
  if (!tipo_asistente_id) {
    return res.status(400).json({ error: 'Falta indicar el tipo de Asistente' });
  }

  const db = clienteDelPedido(req);
  const { data: postulacion, error: errorPostulacion } = await db
    .from('postulaciones')
    .select('*')
    .eq('id', postulacionId)
    .single();

  if (errorPostulacion || !postulacion) {
    return res.status(404).json({ error: 'Postulación no encontrada' });
  }
  if (postulacion.asistente_id) {
    return res.status(409).json({ error: 'Esta postulación ya tiene un Asistente asociado' });
  }

  // La Prestadora es la de la postulación que la base dejó ver, no un dato de la sesión.
  const prestadoraId = postulacion.prestadora_id;

  // La cuenta es la persona; el Legajo del Asistente es lo suyo en esta Prestadora, y la numera la base.
  let cuentaId;
  let asistenteId;
  try {
    const tipoAsistenteId = await validarTipoAsistente(db, tipo_asistente_id, prestadoraId);
    const identidad = await identidadDelAsistente(db, {
      prestadoraId,
      documento: postulacion.cuil,
      dni: postulacion.dni,
      genero: postulacion.genero,
    });

    ({ userId: cuentaId } = await crearCuentaConPerfil({
      email: postulacion.email,
      nombre: postulacion.nombre,
      telefono: postulacion.telefono,
      rol: 'asistente',
      prestadoraId,
      enviarActivacion: true,
    }));

    const { data: asistenteNuevo, error: errorAsistente } = await db.from('asistentes').insert({
      usuario_id: cuentaId,
      nombre: postulacion.nombre,
      ...identidad,
      telefono: postulacion.telefono,
      email: postulacion.email,
      tipo_asistente_id: tipoAsistenteId,
      // Dónde acepta trabajar no se copia de la postulación. Ahí la persona escribió sus zonas a
      // mano, y lo escrito a mano no es ninguno de los lugares de la Prestadora: casarlos por
      // parecido crearía una coincidencia que nadie decidió. Se eligen en su Legajo, de la lista.
      estado: 'inactivo',
      prestadora_id: prestadoraId,
    }).select('id').single();
    if (errorAsistente) throw errorDeLaIdentidad(errorAsistente, 'asistente');
    asistenteId = asistenteNuevo.id;

    const filasVerificacion = await filasDeIncorporacion(db, asistenteId, prestadoraId, {
      aprobadas: APROBADAS.LA_PRIMERA,
      revisadoPor: req.usuarioPanel.id,
    });
    const { error: errorVerificaciones } = await db.from('verificaciones_asistente').insert(filasVerificacion);
    if (errorVerificaciones) throw new Error(errorVerificaciones.message);

    // Las referencias que la persona escribió en el formulario pasan a ser una fila cada una, para
    // que se las pueda llamar y quede constancia de qué contestaron. Se copian acá y no se vuelven
    // a tipear. Las que vengan sin nombre o sin teléfono se descartan en silencio: una fila
    // sin teléfono no se puede llamar, así que no hay nada que avisar.
    const referenciasDeLaPostulacion = (postulacion.referencias_laborales ?? [])
      .filter((una) => una?.nombre && una?.telefono)
      .map((una) => ({
        prestadora_id: prestadoraId,
        asistente_id: asistenteId,
        nombre: String(una.nombre).trim(),
        telefono: String(una.telefono).trim(),
        vinculo: una.vinculo ? String(una.vinculo).trim() : null,
        resultado: RESULTADO_PENDIENTE,
      }));
    if (referenciasDeLaPostulacion.length > 0) {
      const { error: errorReferencias } = await db
        .from('referencias_laborales_asistente')
        .insert(referenciasDeLaPostulacion);
      if (errorReferencias) throw new Error(errorReferencias.message);
    }

    const { error: errorUpdate } = await db
      .from('postulaciones')
      .update({ asistente_id: asistenteId })
      .eq('id', postulacionId);
    if (errorUpdate) throw new Error(errorUpdate.message);

    res.json({ ok: true, asistenteId });
  } catch (error) {
    // `deshacerAlta` nunca falla: si tropieza lo anota en el registro del servidor y sigue.
    // Así el error que llega a la pantalla es siempre el problema de verdad, y la respuesta
    // se manda siempre — antes, un tropiezo del deshacer dejaba a la pantalla esperando.
    // Con el trabajo de la Prestadora, porque la fila de `usuarios` de la cuenta nueva no la ve
    // quien da el alta. La Prestadora es la de la postulación que la base ya dejó ver.
    await enLaPrestadora(prestadoraId, 'alta de Asistente deshecha', (dbTrabajo) =>
      deshacerAlta(dbTrabajo, cuentaId, { prestadoraId, filas: filasDeUnAsistente(asistenteId) }));
    responderError(res, error);
  }
});

// Alta manual de Asistente (sin Postulación previa) — cubre el caso de una Prestadora
// que llega a Careonys con un equipo que ya venía trabajando desde antes. Entra activo
// por defecto y, a diferencia de /asistente, no genera filas en `verificaciones_asistente`
// (equivalente al default 'omitir' del pendiente #18 — política de verificación por
// prestadora; la Fase 2 de este trabajo suma la configuración para cambiar este comportamiento).
panelCuentasRouter.post('/asistente-directo', requiereRolPanel, exigirOrganizacionActiva, requierePermiso('alta_manual_asistente'), exigirConfiguracionInicial, async (req, res) => {
  const { nombre, telefono, email, documento_tipo, documento_numero, documento_pais, dni, genero, domicilio, domicilioPartido, tipo_asistente_id, lugares, estado, valor_hora, horas_semanales, modalidades } = req.body;
  try {
    // Con el trabajo de la Prestadora, porque el permiso se le puede dar a quien coordina, y
    // `asistentes` y `remuneraciones_asistente` sólo aceptan altas de la administración. La
    // Prestadora es la de la sesión, que `exigirOrganizacionActiva` ya comprobó.
    const prestadoraId = req.usuarioPanel.prestadoraId;
    const { asistenteId } = await enLaPrestadora(prestadoraId, 'alta de Asistente', (dbTrabajo) =>
      crearAsistenteDirecto({
        nombre, telefono, email, documento_tipo, documento_numero, documento_pais, dni, genero, domicilio, domicilioPartido, tipo_asistente_id, lugares, estado,
        valor_hora, horas_semanales, modalidades,
        prestadoraId,
        usuarioPanelId: req.usuarioPanel.id,
        db: dbTrabajo,
      }));
    res.json({ ok: true, asistenteId });
  } catch (error) {
    responderError(res, error);
  }
});

// ============================================================================
// Personas autorizadas
//
// Quién entra como persona autorizada y quién sale sigue siendo del permiso 'editar_datos_cliente': es
// parte de administrar los datos de ese Cliente, como siempre.
//
// Qué ve cada uno es otra cosa, y tiene permiso propio —'configurar_accesos_de_personas_autorizadas'—
// porque no es un dato que se corrige: es una autorización que el titular firma, y cada
// Prestadora decide quién de los suyos la puede armar. De fábrica, sólo el Admin.
//
// Toda alta y todo retiro arman una autorización nueva con las personas que quedan. Nada de eso
// rige hasta que el titular la firma.
// ============================================================================

// El Cliente de este pedido, tal como la base se lo deja ver a quien pregunta. Si es de otra
// Prestadora, o todavía está pendiente de conformidad, para él no existe.
async function clienteContratanteDelPedido(req) {
  const { data } = await clienteDelPedido(req)
    .from('clientes')
    .select('id, prestadora_id')
    .eq('id', req.params.clienteId)
    .maybeSingle();
  return data ?? null;
}

panelCuentasRouter.get('/cliente/:clienteId/personas_autorizadas', requiereRolPanel, exigirOrganizacionActiva, requierePermiso('editar_datos_cliente'), async (req, res) => {
  const cliente = await clienteContratanteDelPedido(req);
  if (!cliente) {
    return res.status(404).json({ error: 'Cliente no encontrado' });
  }

  try {
    const [miembros, pendiente] = await Promise.all([
      personasAutorizadasConSusAccesos({ clienteId: cliente.id, prestadoraId: cliente.prestadora_id }),
      instruccionPendiente(cliente.id, cliente.prestadora_id),
    ]);
    // `pendiente` es un estado normal, no un error: hasta que el titular la firme sigue rigiendo
    // lo anterior. La pantalla lo muestra para que nadie se olvide de cerrarlo.
    res.json({ miembros, instruccionPendiente: pendiente });
  } catch (error) {
    responderError(res, error);
  }
});

// Arma la autorización que el titular pidió. Los accesos rigen recién cuando la firma, por la
// aplicación o en papel.
panelCuentasRouter.post('/cliente/:clienteId/personas_autorizadas/instruccion', requiereRolPanel, exigirOrganizacionActiva, requierePermiso('configurar_accesos_de_personas_autorizadas'), async (req, res) => {
  const cliente = await clienteContratanteDelPedido(req);
  if (!cliente) {
    return res.status(404).json({ error: 'Cliente no encontrado' });
  }

  try {
    const instruccion = await crearInstruccion({
      clienteId: cliente.id,
      prestadoraId: cliente.prestadora_id,
      cargadaPor: req.usuarioPanel.id,
      accesosPedidos: req.body?.accesos,
    });
    res.json({ ok: true, instruccion });
  } catch (error) {
    responderError(res, error);
  }
});

// El camino de siempre: el titular firmó la hoja en papel y la Prestadora la guarda. El archivo
// va a un depósito privado y la ruta empieza por la Prestadora, que es lo que exige su política.
panelCuentasRouter.post(
  '/cliente/:clienteId/personas_autorizadas/instruccion/:instruccionId/papel',
  requiereRolPanel,
  exigirOrganizacionActiva,
  requierePermiso('configurar_accesos_de_personas_autorizadas'),
  subirPapelFirmado.single('archivo'),
  manejarErrorDeArchivo,
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'Archivo faltante o de tipo no permitido (solo PDF, JPG o PNG, hasta 10 MB)' });
    }

    const cliente = await clienteContratanteDelPedido(req);
    if (!cliente) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    // El depósito deja crear un archivo y no pisarlo, así que cada hoja lleva nombre propio: si se
    // vuelve a subir, la fila apunta a la última.
    const ruta = `${cliente.prestadora_id}/${cliente.id}/${req.params.instruccionId}-${randomUUID()}.${extensionDeArchivo(req.file.mimetype)}`;
    const { error: errorSubida } = await clienteDelPedido(req).storage
      .from(DEPOSITO_INSTRUCCIONES)
      .upload(ruta, req.file.buffer, { contentType: req.file.mimetype });
    if (errorSubida) {
      return responderError(res, errorSubida);
    }

    try {
      await cerrarConPapelFirmado({
        instruccionId: req.params.instruccionId,
        prestadoraId: cliente.prestadora_id,
        archivoUrl: ruta,
      });
      res.json({ ok: true });
    } catch (error) {
      responderError(res, error);
    }
  },
);

// La hoja firmada, para volver a verla desde el Panel. Nunca dirección pública: un enlace temporal
// que dura un minuto, igual que el resto de los archivos del producto.
panelCuentasRouter.get('/cliente/:clienteId/personas_autorizadas/instruccion/:instruccionId/papel', requiereRolPanel, exigirOrganizacionActiva, requierePermiso('configurar_accesos_de_personas_autorizadas'), async (req, res) => {
  const db = clienteDelPedido(req);
  const { data: instruccion } = await db
    .from('instrucciones_acceso_personas_autorizadas')
    .select('archivo_firmado_url')
    .eq('id', req.params.instruccionId)
    .eq('cliente_id', req.params.clienteId)
    .maybeSingle();

  if (!instruccion?.archivo_firmado_url) {
    return res.status(404).json({ error: 'No hay hoja firmada guardada' });
  }

  const { data, error } = await db.storage
    .from(DEPOSITO_INSTRUCCIONES)
    .createSignedUrl(instruccion.archivo_firmado_url, 60);
  if (error) {
    return responderError(res, error, 404);
  }

  res.json({ url: data.signedUrl });
});

// ============================================================================
// El Pagador firma su obligación de pagar
// ============================================================================
//
// Apuntar un Legajo como Pagador no lo convierte en Pagador: lo que lo convierte es que haya
// asumido la obligación y lo haya firmado. Estas rutas son lo que la pantalla del Cliente usa
// para mostrarlo ahí mismo, al lado de donde se lo elige, y para cargar la firma y los papeles.
//
// LEER NO ES ESCRIBIR. El estado lo alcanza quien edita el Cliente, porque saber si firmó hace
// falta para trabajar. Hacerlo firmar pide el permiso propio, que nace reservado al Admin.

const DEPOSITO_DEL_PAGADOR = DEPOSITO_PAGADOR;

panelCuentasRouter.get('/cliente/:clienteId/pagador', requiereRolPanel, exigirOrganizacionActiva, requierePermiso('editar_datos_cliente'), async (req, res) => {
  const cliente = await clienteContratanteDelPedido(req);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

  try {
    res.json(await estadoDelPagador({ clienteId: cliente.id, prestadoraId: cliente.prestadora_id }));
  } catch (error) {
    responderError(res, error);
  }
});

// Arma el documento y lo deja esperando firma. El texto es el que la Prestadora configuró, o el
// modelo que trae el producto si no configuró ninguno.
panelCuentasRouter.post('/cliente/:clienteId/pagador/consentimiento', requiereRolPanel, exigirOrganizacionActiva, requierePermiso('registrar_consentimiento_pagador'), async (req, res) => {
  const cliente = await clienteContratanteDelPedido(req);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

  try {
    const consentimiento = await crearConsentimiento({
      clienteId: cliente.id,
      prestadoraId: cliente.prestadora_id,
      cargadoPor: req.usuarioPanel.id,
    });
    res.json({ ok: true, consentimiento });
  } catch (error) {
    responderError(res, error);
  }
});

// Se cargó por error, o cambió el Pagador y todavía no se sabe cuál es el nuevo. Lo cerrado no se
// anula nunca: ya lo firmó alguien.
panelCuentasRouter.post('/cliente/:clienteId/pagador/consentimiento/:consentimientoId/anular', requiereRolPanel, exigirOrganizacionActiva, requierePermiso('registrar_consentimiento_pagador'), async (req, res) => {
  const cliente = await clienteContratanteDelPedido(req);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

  try {
    await anularPendiente({
      consentimientoId: req.params.consentimientoId,
      prestadoraId: cliente.prestadora_id,
    });
    res.json({ ok: true });
  } catch (error) {
    responderError(res, error);
  }
});

// La hoja firmada. Depósito privado y ruta empezando por la Prestadora, que es lo que exige su
// política.
panelCuentasRouter.post(
  '/cliente/:clienteId/pagador/consentimiento/:consentimientoId/papel',
  requiereRolPanel,
  exigirOrganizacionActiva,
  requierePermiso('registrar_consentimiento_pagador'),
  subirPapelFirmado.single('archivo'),
  manejarErrorDeArchivo,
  async (req, res) => {
    const db = clienteDelPedido(req);
    const cliente = await clienteContratanteDelPedido(req);
    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

    // Si otra persona ya lo cerró o lo anuló, no queda nada por hacer: se contesta bien sin subir
    // nada, y la pantalla vuelve a leer y muestra cómo quedó.
    const consentimientoPedido = { consentimientoId: req.params.consentimientoId, prestadoraId: cliente.prestadora_id };
    try {
      const consentimiento = await consentimientoDelPagador(consentimientoPedido);
      if (!consentimiento) throw new ErrorConMotivo('no_encontrado', 'Consentimiento no encontrado');
      if (consentimiento.estado !== 'pendiente_firma') return res.json({ ok: true });
    } catch (error) {
      return responderError(res, error);
    }

    // El archivo es opcional, igual que en la instrucción de las personas autorizadas: lo que cierra esto es que
    // la Prestadora declare que se firmó, y hay Prestadoras que archivan el papel afuera del
    // sistema. Exigirlo dejaría firmas reales sin poder registrarse, que es peor.
    let ruta = null;
    if (req.file) {
      ruta = rutaDelArchivo({
        prestadoraId: cliente.prestadora_id,
        clienteId: cliente.id,
        nombre: `consentimiento-${req.params.consentimientoId}`,
        extension: extensionDeArchivo(req.file.mimetype),
      });
      const { error: errorSubida } = await db.storage
        .from(DEPOSITO_DEL_PAGADOR)
        .upload(ruta, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
      if (errorSubida) return responderError(res, errorSubida);
    }

    try {
      const cerrado = await cerrarConsentimientoPagador({ ...consentimientoPedido, archivoUrl: ruta });
      // Otra persona lo cerró mientras se subía el archivo. El archivo subido no quedó en ningún
      // consentimiento y se borra, salvo que esté en la misma ruta que el que sí quedó guardado.
      if (!cerrado && ruta) {
        const actual = await consentimientoDelPagador(consentimientoPedido);
        if (actual?.archivo_firmado_url !== ruta) {
          const { error: errorBorrado } = await db.storage.from(DEPOSITO_DEL_PAGADOR).remove([ruta]);
          if (errorBorrado) console.error('[cuentas] no se pudo borrar el archivo que quedó sin consentimiento:', errorBorrado.message);
        }
      }
      res.json({ ok: true });
    } catch (error) {
      responderError(res, error);
    }
  },
);

// Volver a ver la hoja firmada. Nunca dirección pública: un enlace temporal que dura un minuto,
// igual que el resto de los archivos del producto.
panelCuentasRouter.get('/cliente/:clienteId/pagador/consentimiento/:consentimientoId/papel', requiereRolPanel, exigirOrganizacionActiva, requierePermiso('editar_datos_cliente'), async (req, res) => {
  const db = clienteDelPedido(req);
  const cliente = await clienteContratanteDelPedido(req);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

  const { data: consentimiento } = await db
    .from('consentimientos_pagador')
    .select('archivo_firmado_url')
    .eq('id', req.params.consentimientoId)
    .eq('cliente_id', cliente.id)
    .maybeSingle();

  if (!consentimiento?.archivo_firmado_url) {
    return res.status(404).json({ error: 'No hay hoja firmada guardada' });
  }

  const { data, error } = await db.storage
    .from(DEPOSITO_DEL_PAGADOR)
    .createSignedUrl(consentimiento.archivo_firmado_url, 60);
  if (error) return responderError(res, error, 404);

  res.json({ url: data.signedUrl });
});

// Los papeles que exige el Pagador. Son aparte de la firma: que falte uno no invalida lo
// firmado, y que esté la firma no completa los papeles.
panelCuentasRouter.post(
  '/cliente/:clienteId/pagador/papel/:tipoDocumentoId',
  requiereRolPanel,
  exigirOrganizacionActiva,
  requierePermiso('registrar_consentimiento_pagador'),
  subirPapelFirmado.single('archivo'),
  manejarErrorDeArchivo,
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'Archivo faltante o de tipo no permitido (solo PDF, JPG o PNG, hasta 10 MB)' });
    }

    const db = clienteDelPedido(req);
    const cliente = await clienteContratanteDelPedido(req);
    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

    const ruta = rutaDelArchivo({
      prestadoraId: cliente.prestadora_id,
      clienteId: cliente.id,
      nombre: `papel-${req.params.tipoDocumentoId}`,
      extension: extensionDeArchivo(req.file.mimetype),
    });
    const { error: errorSubida } = await db.storage
      .from(DEPOSITO_DEL_PAGADOR)
      .upload(ruta, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
    if (errorSubida) return responderError(res, errorSubida);

    try {
      await guardarPapel({
        clienteId: cliente.id,
        prestadoraId: cliente.prestadora_id,
        tipoDocumentoId: req.params.tipoDocumentoId,
        archivoUrl: ruta,
        fechaVencimiento: req.body?.fechaVencimiento,
        cargadoPor: req.usuarioPanel.id,
      });
      res.json({ ok: true });
    } catch (error) {
      responderError(res, error);
    }
  },
);

panelCuentasRouter.get('/cliente/:clienteId/pagador/papel/:documentoId/archivo', requiereRolPanel, exigirOrganizacionActiva, requierePermiso('editar_datos_cliente'), async (req, res) => {
  const db = clienteDelPedido(req);
  const cliente = await clienteContratanteDelPedido(req);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

  const { data: documento } = await db
    .from('documentos_pagador')
    .select('archivo_url')
    .eq('id', req.params.documentoId)
    .eq('cliente_id', cliente.id)
    .maybeSingle();

  if (!documento?.archivo_url) {
    return res.status(404).json({ error: 'No hay archivo guardado' });
  }

  const { data, error } = await db.storage
    .from(DEPOSITO_DEL_PAGADOR)
    .createSignedUrl(documento.archivo_url, 60);
  if (error) return responderError(res, error, 404);

  res.json({ url: data.signedUrl });
});

panelCuentasRouter.post('/cliente/:clienteId/personas_autorizadas', requiereRolPanel, exigirOrganizacionActiva, requierePermiso('editar_datos_cliente'), async (req, res) => {
  const { nombre, apellido, documento, genero, email, telefono, accesos } = req.body || {};

  const cliente = await clienteContratanteDelPedido(req);
  if (!cliente) {
    return res.status(404).json({ error: 'Cliente no encontrado' });
  }

  try {
    // Con el trabajo de la Prestadora, como el resto de las personas autorizadas.
    const { miembroId } = await enLaPrestadora(cliente.prestadora_id, 'alta de persona autorizada', (dbTrabajo) =>
      invitarPersonaAutorizada({
        db: dbTrabajo,
        email,
        nombre,
        apellido,
        documento,
        genero,
        telefono,
        clienteId: cliente.id,
        prestadoraId: cliente.prestadora_id,
        invitadoPor: req.usuarioPanel.id,
      }));

    // La autorización que la nombra, para que el titular la firme. Qué puede ver lo elige sólo
    // quien tiene el permiso de configurar accesos; para cualquier otro sale con lo de fábrica.
    const puedeElegirAccesos = await tienePermiso({
      db: clienteDelPedido(req),
      accion: 'configurar_accesos_de_personas_autorizadas',
    });
    const instruccion = await crearInstruccion({
      clienteId: cliente.id,
      prestadoraId: cliente.prestadora_id,
      cargadaPor: req.usuarioPanel.id,
      accesosPedidos: puedeElegirAccesos && accesos ? { [miembroId]: accesos } : undefined,
    });
    res.json({ ok: true, usuarioId: miembroId, instruccion });
  } catch (error) {
    responderError(res, error);
  }
});

panelCuentasRouter.delete('/cliente/:clienteId/personas_autorizadas/:usuarioId', requiereRolPanel, exigirOrganizacionActiva, requierePermiso('editar_datos_cliente'), async (req, res) => {
  const cliente = await clienteContratanteDelPedido(req);
  if (!cliente) {
    return res.status(404).json({ error: 'Cliente no encontrado' });
  }

  try {
    // Con el trabajo de la Prestadora, por lo mismo que al invitar. La cuenta se desactiva, no se
    // borra, y el motivo queda guardado en ella.
    const desactivada = await enLaPrestadora(cliente.prestadora_id, 'baja de persona autorizada', (dbTrabajo) =>
      revocarPersonaAutorizada(dbTrabajo, req.params.usuarioId, {
        prestadoraId: cliente.prestadora_id,
        clienteId: cliente.id,
        motivo: req.body?.motivo,
      }));
    // Es un cambio de membresía y se anota con su nombre. El motivo no entra: es contenido.
    if (desactivada) {
      // Sin ella, la autorización vigente ya no dice la verdad: se arma una nueva con las que
      // quedan, para que el titular la firme.
      await crearInstruccion({
        clienteId: cliente.id,
        prestadoraId: cliente.prestadora_id,
        cargadaPor: req.usuarioPanel.id,
      });
      await registrarActividad(req.usuarioPanel, ACCION_DESACTIVACION_DE_CUENTA, {
        tablaAfectada: 'usuarios',
        registroId: req.params.usuarioId,
        detalle: { rol_anterior: 'cliente' },
      });
      yaQuedoRegistrado(res);
    }
    res.json({ ok: true });
  } catch (error) {
    responderError(res, error, 400);
  }
});
