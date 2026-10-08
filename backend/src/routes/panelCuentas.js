import { Router } from 'express';
import multer from 'multer';
import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import { acotarAPrestadora, exigirOrganizacionActiva } from '../middleware/alcancePrestadora.js';
import { clienteDelPedido, supabase } from '../db/connection.js';
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
import { responderError } from '../utils/errorConMotivo.js';
import { APROBADAS, filasDeIncorporacion } from '../utils/etapasDeIncorporacion.js';
import { RESULTADO_PENDIENTE } from '../utils/referenciasLaborales.js';
import { reenviarActivacionCuenta } from '../utils/activacionCuenta.js';
import { requierePermiso, permisosEfectivos } from '../utils/permisos.js';
import { exigirAdministracion } from '../middleware/exigirAdministracion.js';
import { extensionDeArchivo } from '../utils/archivosSubidos.js';
import {
  personasAutorizadasConSusAccesos,
  crearInstruccion,
  instruccionPendiente,
  ultimaInstruccionCerrada,
  cerrarConPapelFirmado,
} from '../utils/instruccionesPersonasAutorizadas.js';
import {
  DEPOSITO_PAGADOR,
  anularPendiente,
  cerrarConPapelFirmado as cerrarConsentimientoPagador,
  crearConsentimiento,
  estadoDelPagador,
  guardarPapel,
  rutaDelArchivo,
} from '../utils/consentimientoPagador.js';

// CON LA CREDENCIAL DE QUIEN PIDE. Lo que estas rutas leen y escriben en tablas entra con
// `clienteDelPedido(req)`: la base sabe quién pide y le contesta sólo lo de su Prestadora, así que
// ninguna consulta lleva el filtro de la Prestadora de la sesión. Cuando una fila nueva nombra a la
// Prestadora, la toma de la fila que la base ya dejó ver —la postulación, el Cliente—.
// Las pocas que siguen con la llave maestra dicen por qué, cada una en su lugar.

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
    // Con la maestra: la base no le da a una persona con sesión permiso para llamar a
    // `permisos_efectivos_de`.
    res.json({ permisos: await permisosEfectivos(supabase, req.usuarioPanel.id) });
  } catch (e) {
    responderError(res, e);
  }
});

// PRD_08 (docs/PRD_08_Dashboard_Modalidades.md, aprobado 2026-07-24): qué modalidades de
// trabajo (directa/intermediacion) tiene activas la Prestadora, para que el menú
// del Panel muestre solo los grupos que correspondan. Lectura disponible para cualquier rol
// logueado (igual que permisos-efectivos) — activar/desactivar sigue siendo exclusivo de
// admin_prestadora vía PATCH /api/panel/configuracion/modalidades (panelConfiguracion.js).
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
panelCuentasRouter.post('/asistente', requiereRolPanel, exigirOrganizacionActiva, soloAdministracion, async (req, res) => {
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

    const filasVerificacion = await filasDeIncorporacion(asistenteId, prestadoraId, {
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
    // Con la llave maestra, por lo mismo que en el alta del Cliente: la fila de `usuarios` de
    // la cuenta nueva no la ve quien da el alta.
    await deshacerAlta(supabase, cuentaId, { prestadoraId, filas: filasDeUnAsistente(asistenteId) });
    responderError(res, error);
  }
});

// Alta manual de Asistente (sin Postulación previa) — cubre el caso de una Prestadora
// que llega a Careonys con un equipo que ya venía trabajando desde antes. Entra activo
// por defecto y, a diferencia de /asistente, no genera filas en `verificaciones_asistente`
// (equivalente al default 'omitir' del pendiente #18 — política de verificación por
// prestadora; la Fase 2 de este trabajo suma la configuración para cambiar este comportamiento).
panelCuentasRouter.post('/asistente-directo', requiereRolPanel, exigirOrganizacionActiva, requierePermiso('alta_manual_asistente'), async (req, res) => {
  const { nombre, telefono, email, documento_tipo, documento_numero, documento_pais, dni, genero, domicilio, domicilioPartido, tipo_asistente_id, lugares, estado, tipo_vinculo, categoria_cct, valor_hora, sueldo_basico, horas_semanales, modalidades } = req.body;
  try {
    // Con la llave maestra: el permiso se le puede dar a quien coordina, y `asistentes` y
    // `remuneraciones_asistente` sólo aceptan altas de la administración.
    const { asistenteId } = await crearAsistenteDirecto({
      nombre, telefono, email, documento_tipo, documento_numero, documento_pais, dni, genero, domicilio, domicilioPartido, tipo_asistente_id, lugares, estado,
      tipo_vinculo, categoria_cct, valor_hora, sueldo_basico, horas_semanales, modalidades,
      prestadoraId: req.usuarioPanel.prestadoraId,
      usuarioPanelId: req.usuarioPanel.id,
      db: supabase,
    });
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
// porque no es un dato que se corrige: es una instrucción que el titular dio y firmó, y cada
// Prestadora decide quién de los suyos la puede cargar. De fábrica, sólo el Admin.
// ============================================================================

// El Cliente de este pedido, acotado a la Prestadora de quien pregunta. Si es de otra, para él no
// existe.
// Con la llave maestra: la política restrictiva `oculta_pendientes_de_conformidad` de `clientes`
// (NOT pendiente_conformidad) le esconde a Admin, a Superadmin y al Coordinador el Cliente
// pendiente de conformidad, y la ruta contestaría «no encontrada» donde antes respondía. Se decide
// aparte.
async function clienteContratanteDelPedido(req) {
  let query = supabase.from('clientes').select('id, prestadora_id').eq('id', req.params.clienteId);
  query = acotarAPrestadora(query, req.usuarioPanel);
  const { data } = await query.maybeSingle();
  return data ?? null;
}

panelCuentasRouter.get('/cliente/:clienteId/personas_autorizadas', requiereRolPanel, exigirOrganizacionActiva, requierePermiso('editar_datos_cliente'), async (req, res) => {
  const cliente = await clienteContratanteDelPedido(req);
  if (!cliente) {
    return res.status(404).json({ error: 'Cliente no encontrado' });
  }

  try {
    const [miembros, pendiente, ultima] = await Promise.all([
      personasAutorizadasConSusAccesos({ clienteId: cliente.id, prestadoraId: cliente.prestadora_id }),
      instruccionPendiente(cliente.id, cliente.prestadora_id),
      ultimaInstruccionCerrada(cliente.id, cliente.prestadora_id),
    ]);
    // `pendiente` es un estado normal, no un error: los accesos ya rigen y lo que falta es la
    // firma. La pantalla lo muestra para que nadie se olvide de cerrarlo. Y cuando no hay ninguna
    // pendiente, muestra la última que sí se firmó, que es lo que rige hoy.
    res.json({ miembros, instruccionPendiente: pendiente, ultimaInstruccion: ultima });
  } catch (error) {
    responderError(res, error);
  }
});

// Carga la instrucción que el titular pidió. Los accesos rigen desde acá; la firma viene después,
// por la aplicación o en papel.
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

    // Con la llave maestra: la subida pisa la hoja si ya había una (`upsert`), y el depósito no
    // tiene política para modificar un archivo, sólo para crearlo y leerlo. La ruta sale del
    // Cliente que la base ya dejó ver.
    const ruta = `${cliente.prestadora_id}/${cliente.id}/${req.params.instruccionId}.${extensionDeArchivo(req.file.mimetype)}`;
    const { error: errorSubida } = await supabase.storage
      .from(DEPOSITO_INSTRUCCIONES)
      .upload(ruta, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
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
panelCuentasRouter.get('/cliente/:clienteId/personas_autorizadas/instruccion/:instruccionId/papel', requiereRolPanel, exigirOrganizacionActiva, requierePermiso('editar_datos_cliente'), async (req, res) => {
  const cliente = await clienteContratanteDelPedido(req);
  if (!cliente) {
    return res.status(404).json({ error: 'Cliente no encontrado' });
  }

  // Con la llave maestra, filtrada por el Cliente que la base ya dejó ver: la tabla y el depósito
  // de la hoja firmada piden 'configurar_accesos_de_personas_autorizadas', y esta ruta se abre con
  // 'editar_datos_cliente'. Con la credencial de quien pide, quien edita el Cliente sin cargar
  // instrucciones dejaría de ver la hoja.
  const { data: instruccion } = await supabase
    .from('instrucciones_acceso_personas_autorizadas')
    .select('archivo_firmado_url')
    .eq('id', req.params.instruccionId)
    .eq('prestadora_id', cliente.prestadora_id)
    .eq('cliente_id', cliente.id)
    .maybeSingle();

  if (!instruccion?.archivo_firmado_url) {
    return res.status(404).json({ error: 'No hay hoja firmada guardada' });
  }

  const { data, error } = await supabase.storage
    .from(DEPOSITO_INSTRUCCIONES)
    .createSignedUrl(instruccion.archivo_firmado_url, 60);
  if (error) {
    return responderError(res, error);
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
      await cerrarConsentimientoPagador({
        consentimientoId: req.params.consentimientoId,
        prestadoraId: cliente.prestadora_id,
        archivoUrl: ruta,
      });
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

  // El enlace temporal va con la llave maestra: el depósito pide 'registrar_consentimiento_pagador'
  // y esta ruta se abre con 'editar_datos_cliente'. El archivo es el de una fila que la base ya
  // dejó ver a quien pide.
  const { data, error } = await supabase.storage
    .from(DEPOSITO_DEL_PAGADOR)
    .createSignedUrl(consentimiento.archivo_firmado_url, 60);
  if (error) return responderError(res, error);

  res.json({ url: data.signedUrl });
});

// Los papeles que exige el financiador. Son aparte de la firma: que falte uno no invalida lo
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

  // Con la llave maestra, por lo mismo que la hoja firmada de arriba.
  const { data, error } = await supabase.storage
    .from(DEPOSITO_DEL_PAGADOR)
    .createSignedUrl(documento.archivo_url, 60);
  if (error) return responderError(res, error);

  res.json({ url: data.signedUrl });
});

panelCuentasRouter.post('/cliente/:clienteId/personas_autorizadas', requiereRolPanel, exigirOrganizacionActiva, requierePermiso('editar_datos_cliente'), async (req, res) => {
  const { nombre, email, telefono } = req.body || {};

  const cliente = await clienteContratanteDelPedido(req);
  if (!cliente) {
    return res.status(404).json({ error: 'Cliente no encontrado' });
  }

  try {
    // Con la llave maestra: la ruta pide 'editar_datos_cliente', y `permisos_personas_autorizadas`
    // sólo deja escribir a quien tiene 'configurar_accesos_de_personas_autorizadas'.
    const { miembroId } = await invitarPersonaAutorizada({
      db: supabase,
      email,
      nombre,
      telefono,
      clienteId: cliente.id,
      prestadoraId: cliente.prestadora_id,
      invitadoPor: req.usuarioPanel.id,
    });
    res.json({ ok: true, usuarioId: miembroId });
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
    // Con la llave maestra, por lo mismo que al invitar.
    await revocarPersonaAutorizada(supabase, req.params.usuarioId, { prestadoraId: cliente.prestadora_id, clienteId: cliente.id });
    res.json({ ok: true });
  } catch (error) {
    responderError(res, error, 400);
  }
});

// Reenviar el email de activación (pendiente #75) — cubre el token vencido (7 días) o
// simplemente extraviado. Solo para Cliente/Asistente/Personas autorizadas (mismo alcance que el envío
// automático de crearCuentaConPerfil); Coordinador/Admin/Superadmin siguen con el flujo
// manual de panelUsuarios.js y no tienen esta ruta disponible.
panelCuentasRouter.post('/:usuarioId/reenviar-activacion', requiereRolPanel, exigirOrganizacionActiva, soloAdministracion, async (req, res) => {
  // Con la llave maestra y acotada a mano: en `usuarios` la base sólo le deja ver a cada persona su
  // propia fila, y acá se busca la cuenta de otra.
  let queryUsuario = supabase.from('usuarios').select('id, rol, prestadora_id').eq('id', req.params.usuarioId);
  queryUsuario = acotarAPrestadora(queryUsuario, req.usuarioPanel);
  const { data: usuario } = await queryUsuario.maybeSingle();

  if (!usuario) {
    return res.status(404).json({ error: 'Cuenta no encontrada' });
  }
  if (!['cliente', 'asistente'].includes(usuario.rol)) {
    return res.status(400).json({ error: 'Esta cuenta no usa el flujo de activación por email' });
  }

  try {
    await reenviarActivacionCuenta(usuario.id, req.usuarioPanel.prestadoraId);
    res.json({ ok: true });
  } catch (error) {
    responderError(res, error);
  }
});
