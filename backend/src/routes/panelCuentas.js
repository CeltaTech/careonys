import { Router } from 'express';
import multer from 'multer';
import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import { acotarAPrestadora, exigirOrganizacionActiva } from '../middleware/alcancePrestadora.js';
import { supabase } from '../db/connection.js';
import {
  crearCuentaConPerfil,
  crearAsistenteDirecto,
  crearClienteDirecta,
  invitarMiembroPersonasAutorizadas,
  revocarMiembroPersonasAutorizadas,
  validarTipoAsistente,
  deshacerAlta,
  FILAS_DE_UN_ASISTENTE,
  FILAS_DE_UNA_CLIENTE,
} from '../utils/cuentasPanel.js';
import { responderError } from '../utils/errorConMotivo.js';
import { APROBADAS, filasDeIncorporacion } from '../utils/etapasDeIncorporacion.js';
import { RESULTADO_PENDIENTE } from '../utils/referenciasLaborales.js';
import { coordenadasDeDomicilio } from '../geocodificacion/index.js';
import { nombreDelLugar } from '../utils/catalogoDeLugares.js';
import { reenviarActivacionCuenta } from '../utils/activacionCuenta.js';
import { requierePermiso, permisosEfectivos } from '../utils/permisos.js';
import { exigirAdministracion } from '../middleware/exigirAdministracion.js';
import { extensionDeArchivo } from '../utils/archivosSubidos.js';
import {
  personas autorizadasConSusAccesos,
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

export const panelCuentasRouter = Router();

// La hoja firmada de las personas autorizadas. Mismo trato que el resto de los archivos del producto:
// depósito privado, tope de tamaño comprobado acá y no sólo en el depósito, y sólo los tres tipos
// que sirven para una hoja firmada.
const DEPOSITO_INSTRUCCIONES = 'instrucciones-acceso-personas autorizadas';
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

// Alta desde Postulación/Solicitud (rutas /cliente y /asistente, más abajo) se queda
// admin-only sin cambios — el motor de permisos de la Fase 2 (docs/PLAN_HASTA_PRODUCCION.md, plan
// aprobado) solo cubre el alta manual (/cliente-directa y /asistente-directo), que es lo
// que el plan pidió hacer configurable para Coordinador.

// Usado por el frontend (botones "Nuevo Asistente"/"Nueva Cliente", campos de edición de
// Fase 1) para saber qué mostrar sin duplicar la lógica de permisos en el cliente — la
// única fuente de verdad sigue siendo este chequeo del lado del servidor.
panelCuentasRouter.get('/permisos-efectivos', requiereRolPanel, async (req, res) => {
  try {
    res.json({ permisos: await permisosEfectivos(req.usuarioPanel.id) });
  } catch (e) {
    responderError(res, e);
  }
});

// PRD_08 (docs/PRD_08_Dashboard_Modalidades.md, aprobado 2026-07-24): qué modalidades de
// negocio (directa/match/subcontratacion) tiene activas la Prestadora, para que el menú
// del Panel muestre solo los grupos que correspondan. Lectura disponible para cualquier rol
// logueado (igual que permisos-efectivos) — activar/desactivar sigue siendo exclusivo de
// admin_prestadora vía PATCH /api/panel/configuracion/modalidades (panelConfiguracion.js).
panelCuentasRouter.get('/modalidades-activas', requiereRolPanel, async (req, res) => {
  if (!req.usuarioPanel.prestadoraId) {
    return res.json({ modalidades: [] });
  }
  const { data, error } = await supabase
    .from('prestadora_modalidades')
    .select('modalidad')
    .eq('prestadora_id', req.usuarioPanel.prestadoraId)
    .eq('activa', true);
  if (error) return responderError(res, error);
  res.json({ modalidades: (data || []).map((f) => f.modalidad) });
});

panelCuentasRouter.post('/cliente', requiereRolPanel, exigirOrganizacionActiva, soloAdministracion, async (req, res) => {
  const { solicitudId } = req.body;
  if (!solicitudId) {
    return res.status(400).json({ error: 'Falta solicitudId' });
  }

  let querySolicitud = supabase.from('solicitudes').select('*').eq('id', solicitudId);
  querySolicitud = acotarAPrestadora(querySolicitud, req.usuarioPanel);
  const { data: solicitud, error: errorSolicitud } = await querySolicitud.single();

  if (errorSolicitud || !solicitud) {
    return res.status(404).json({ error: 'Solicitud no encontrada' });
  }
  if (solicitud.cliente_id) {
    return res.status(409).json({ error: 'Esta solicitud ya tiene un Cliente asociada' });
  }

  const prestadoraId = req.usuarioPanel.prestadoraId;

  // El lugar que quien atendió señaló en la lista, si lo señaló. Es lo que hace que el Cliente
  // recién creada se pueda encontrar por su localidad: el texto de la solicitud lo escribió quien
  // llamó y no es ninguna de las fichas de la Prestadora. Va filtrado por Prestadora, como
  // cualquier lectura de un lugar, para que un identificador ajeno no conteste nada.
  const nombreDeSuLugar = await nombreDelLugar(solicitud.lugar_id, prestadoraId);

  // La solicitud trae una localidad y no una dirección con altura, así que casi siempre esto
  // vuelve sin coordenadas — y está bien: lo que se guarda en `pacientes.domicilio` es ese
  // texto, y lo que se manda a ubicar es exactamente lo que se guarda. El día que la solicitud
  // pida la dirección completa, esto ya funciona sin tocar nada (ver `geocodificacion/`).
  const ubicacion = await coordenadasDeDomicilio({
    prestadoraId,
    direccion: solicitud.localidad,
    localidad: nombreDeSuLugar || solicitud.localidad,
  });

  let clienteId;
  try {
    ({ userId: clienteId } = await crearCuentaConPerfil({
      email: solicitud.email,
      nombre: solicitud.nombre,
      telefono: solicitud.telefono,
      rol: 'cliente',
      prestadoraId,
      enviarActivacion: true,
    }));

    const { error: errorCliente } = await supabase
      .from('clientes')
      .insert({ id: clienteId, solicitud_id: solicitudId, prestadora_id: prestadoraId });
    if (errorCliente) throw new Error(errorCliente.message);

    const { data: paciente, error: errorPaciente } = await supabase
      .from('pacientes')
      .insert({
        cliente_id: clienteId,
        nombre: solicitud.nombre_paciente || solicitud.nombre,
        domicilio: solicitud.localidad,
        lugar_id: solicitud.lugar_id || null,
        ...ubicacion,
        prestadora_id: prestadoraId,
      })
      .select()
      .single();
    if (errorPaciente) throw new Error(errorPaciente.message);

    // SEGURIDAD: depende de que el SELECT de arriba (línea ~23) ya haya validado que
    // `solicitudId` pertenece al tenant del solicitante — no llamar este UPDATE con un
    // id que no haya pasado por ese filtro.
    const { error: errorUpdate } = await supabase
      .from('solicitudes')
      .update({ cliente_id: clienteId })
      .eq('id', solicitudId);
    if (errorUpdate) throw new Error(errorUpdate.message);

    res.json({ ok: true, clienteId, pacienteId: paciente.id });
  } catch (error) {
    await deshacerAlta(clienteId, { prestadoraId, filas: FILAS_DE_UNA_CLIENTE });
    responderError(res, error);
  }
});

// Alta manual de Cliente+Paciente (sin Solicitud previa) — cubre el caso de una
// Prestadora que llega a Careonys con una cartera de clientes ya en atención.
// Se crea igual una fila de `solicitudes` (canal 'alta_manual') para que el contacto
// del Cliente siga viviendo en un único lugar (evita reproducir el bug de contacto
// en blanco que tenían los Clientes sembradas sin solicitud vinculada).
panelCuentasRouter.post('/cliente-directa', requiereRolPanel, exigirOrganizacionActiva, requierePermiso('alta_manual_cliente'), async (req, res) => {
  const { nombreContacto, telefono, email, localidad, nombrePaciente, domicilioPaciente, domicilioDelPacientePartido } = req.body;
  try {
    const { clienteId, pacienteId } = await crearClienteDirecta({
      nombreContacto, telefono, email, localidad, nombrePaciente, domicilioPaciente, domicilioDelPacientePartido,
      prestadoraId: req.usuarioPanel.prestadoraId,
    });
    res.json({ ok: true, clienteId, pacienteId });
  } catch (error) {
    responderError(res, error);
  }
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

  let queryPostulacion = supabase.from('postulaciones').select('*').eq('id', postulacionId);
  queryPostulacion = acotarAPrestadora(queryPostulacion, req.usuarioPanel);
  const { data: postulacion, error: errorPostulacion } = await queryPostulacion.single();

  if (errorPostulacion || !postulacion) {
    return res.status(404).json({ error: 'Postulación no encontrada' });
  }
  if (postulacion.asistente_id) {
    return res.status(409).json({ error: 'Esta postulación ya tiene un Asistente asociado' });
  }

  const prestadoraId = req.usuarioPanel.prestadoraId;

  let asistenteId;
  try {
    const tipoAsistenteId = await validarTipoAsistente(tipo_asistente_id, prestadoraId);

    ({ userId: asistenteId } = await crearCuentaConPerfil({
      email: postulacion.email,
      nombre: postulacion.nombre,
      telefono: postulacion.telefono,
      rol: 'asistente',
      prestadoraId,
      enviarActivacion: true,
    }));

    const { error: errorAsistente } = await supabase.from('asistentes').insert({
      id: asistenteId,
      nombre: postulacion.nombre,
      dni: postulacion.dni,
      telefono: postulacion.telefono,
      email: postulacion.email,
      tipo_asistente_id: tipoAsistenteId,
      // Dónde acepta trabajar no se copia de la postulación. Ahí la persona escribió sus zonas a
      // mano, y lo escrito a mano no es ninguno de los lugares de la Prestadora: casarlos por
      // parecido crearía una coincidencia que nadie decidió. Se eligen en su ficha, de la lista.
      estado: 'inactivo',
      prestadora_id: prestadoraId,
    });
    if (errorAsistente) throw new Error(errorAsistente.message);

    const filasVerificacion = await filasDeIncorporacion(asistenteId, prestadoraId, {
      aprobadas: APROBADAS.LA_PRIMERA,
      revisadoPor: req.usuarioPanel.id,
    });
    const { error: errorVerificaciones } = await supabase.from('verificaciones_asistente').insert(filasVerificacion);
    if (errorVerificaciones) throw new Error(errorVerificaciones.message);

    // Las referencias que la persona escribió en el formulario pasan a ser una fila cada una, para
    // que se las pueda llamar y quede constancia de qué contestaron. Se copian acá y no se vuelven
    // a tipear. Las que vengan mal formadas se descartan en silencio: la postulación ya las
    // comprobó al entrar (`utils/postulacionCompleta.js`), y una fila sin teléfono no se puede
    // llamar, así que no hay nada que avisar.
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
      const { error: errorReferencias } = await supabase
        .from('referencias_laborales_asistente')
        .insert(referenciasDeLaPostulacion);
      if (errorReferencias) throw new Error(errorReferencias.message);
    }

    // SEGURIDAD: depende de que el SELECT de arriba (línea ~100) ya haya validado que
    // `postulacionId` pertenece al tenant del solicitante — no llamar este UPDATE con un
    // id que no haya pasado por ese filtro.
    const { error: errorUpdate } = await supabase
      .from('postulaciones')
      .update({ asistente_id: asistenteId })
      .eq('id', postulacionId);
    if (errorUpdate) throw new Error(errorUpdate.message);

    res.json({ ok: true, asistenteId });
  } catch (error) {
    // `deshacerAlta` nunca falla: si tropieza lo anota en el registro del servidor y sigue.
    // Así el error que llega a la pantalla es siempre el problema de verdad, y la respuesta
    // se manda siempre — antes, un tropiezo del deshacer dejaba a la pantalla esperando.
    await deshacerAlta(asistenteId, { prestadoraId, filas: FILAS_DE_UN_ASISTENTE });
    responderError(res, error);
  }
});

// Alta manual de Asistente (sin Postulación previa) — cubre el caso de una Prestadora
// que llega a Careonys con un equipo que ya venía trabajando desde antes. Entra activo
// por defecto y, a diferencia de /asistente, no genera filas en `verificaciones_asistente`
// (equivalente al default 'omitir' del pendiente #18 — política de verificación por
// prestadora; la Fase 2 de este trabajo suma la configuración para cambiar este comportamiento).
panelCuentasRouter.post('/asistente-directo', requiereRolPanel, exigirOrganizacionActiva, requierePermiso('alta_manual_asistente'), async (req, res) => {
  const { nombre, telefono, email, dni, domicilio, domicilioPartido, tipo_asistente_id, lugares, estado, tipo_vinculo, categoria_cct, valor_hora, sueldo_basico, horas_semanales, modalidades } = req.body;
  try {
    const { asistenteId } = await crearAsistenteDirecto({
      nombre, telefono, email, dni, domicilio, domicilioPartido, tipo_asistente_id, lugares, estado,
      tipo_vinculo, categoria_cct, valor_hora, sueldo_basico, horas_semanales, modalidades,
      prestadoraId: req.usuarioPanel.prestadoraId,
      usuarioPanelId: req.usuarioPanel.id,
    });
    res.json({ ok: true, asistenteId });
  } catch (error) {
    responderError(res, error);
  }
});

// ============================================================================
// Personas autorizadas
//
// Quién entra a las personas autorizadas y quién sale sigue siendo del permiso 'editar_datos_cliente': es
// parte de administrar los datos de esa Cliente, como siempre.
//
// Qué ve cada uno es otra cosa, y tiene permiso propio —'configurar_accesos_del_personas_autorizadas'—
// porque no es un dato que se corrige: es una instrucción que el titular dio y firmó, y cada
// Prestadora decide quién de los suyos la puede cargar. De fábrica, sólo el Admin.
// ============================================================================

panelCuentasRouter.get('/cliente/:clienteId/personas autorizadas', requiereRolPanel, exigirOrganizacionActiva, requierePermiso('editar_datos_cliente'), async (req, res) => {
  let queryCliente = supabase.from('clientes').select('id, prestadora_id').eq('id', req.params.clienteId);
  queryCliente = acotarAPrestadora(queryCliente, req.usuarioPanel);
  const { data: cliente } = await queryCliente.maybeSingle();
  if (!cliente) {
    return res.status(404).json({ error: 'Cliente no encontrada' });
  }

  try {
    const [miembros, pendiente, ultima] = await Promise.all([
      personas autorizadasConSusAccesos({ clienteId: cliente.id, prestadoraId: cliente.prestadora_id }),
      instruccionPendiente(cliente.id),
      ultimaInstruccionCerrada(cliente.id),
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
panelCuentasRouter.post('/cliente/:clienteId/personas autorizadas/instruccion', requiereRolPanel, exigirOrganizacionActiva, requierePermiso('configurar_accesos_del_personas_autorizadas'), async (req, res) => {
  let queryCliente = supabase.from('clientes').select('id, prestadora_id').eq('id', req.params.clienteId);
  queryCliente = acotarAPrestadora(queryCliente, req.usuarioPanel);
  const { data: cliente } = await queryCliente.maybeSingle();
  if (!cliente) {
    return res.status(404).json({ error: 'Cliente no encontrada' });
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
  '/cliente/:clienteId/personas autorizadas/instruccion/:instruccionId/papel',
  requiereRolPanel,
  exigirOrganizacionActiva,
  requierePermiso('configurar_accesos_del_personas_autorizadas'),
  subirPapelFirmado.single('archivo'),
  manejarErrorDeArchivo,
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'Archivo faltante o de tipo no permitido (solo PDF, JPG o PNG, hasta 10 MB)' });
    }

    let queryCliente = supabase.from('clientes').select('id, prestadora_id').eq('id', req.params.clienteId);
    queryCliente = acotarAPrestadora(queryCliente, req.usuarioPanel);
    const { data: cliente } = await queryCliente.maybeSingle();
    if (!cliente) {
      return res.status(404).json({ error: 'Cliente no encontrada' });
    }

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

// La hoja firmada, para volver a verla desde el Panel. Nunca dirección pública: se firma por un
// minuto, igual que el resto de los archivos del producto.
panelCuentasRouter.get('/cliente/:clienteId/personas autorizadas/instruccion/:instruccionId/papel', requiereRolPanel, exigirOrganizacionActiva, requierePermiso('editar_datos_cliente'), async (req, res) => {
  let queryCliente = supabase.from('clientes').select('id, prestadora_id').eq('id', req.params.clienteId);
  queryCliente = acotarAPrestadora(queryCliente, req.usuarioPanel);
  const { data: cliente } = await queryCliente.maybeSingle();
  if (!cliente) {
    return res.status(404).json({ error: 'Cliente no encontrada' });
  }

  const { data: instruccion } = await supabase
    .from('instrucciones_acceso_personas_autorizadas')
    .select('archivo_firmado_url')
    .eq('id', req.params.instruccionId)
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

// El Cliente de este pedido, ya acotada a la Prestadora de quien pregunta. Estaba escrito igual en
// cada ruta de las personas autorizadas; de acá para abajo va una sola vez.
async function clienteDelPedido(req) {
  let query = supabase.from('clientes').select('id, prestadora_id').eq('id', req.params.clienteId);
  query = acotarAPrestadora(query, req.usuarioPanel);
  const { data } = await query.maybeSingle();
  return data ?? null;
}

panelCuentasRouter.get('/cliente/:clienteId/pagador', requiereRolPanel, exigirOrganizacionActiva, requierePermiso('editar_datos_cliente'), async (req, res) => {
  const cliente = await clienteDelPedido(req);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrada' });

  try {
    res.json(await estadoDelPagador({ clienteId: cliente.id, prestadoraId: cliente.prestadora_id }));
  } catch (error) {
    responderError(res, error);
  }
});

// Arma el documento y lo deja esperando firma. El texto es el que la Prestadora configuró, o el
// modelo que trae el producto si no configuró ninguno.
panelCuentasRouter.post('/cliente/:clienteId/pagador/consentimiento', requiereRolPanel, exigirOrganizacionActiva, requierePermiso('registrar_consentimiento_pagador'), async (req, res) => {
  const cliente = await clienteDelPedido(req);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrada' });

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
  const cliente = await clienteDelPedido(req);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrada' });

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
    const cliente = await clienteDelPedido(req);
    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrada' });

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
      const { error: errorSubida } = await supabase.storage
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

// Volver a ver la hoja firmada. Nunca dirección pública: se firma por un minuto, igual que el resto
// de los archivos del producto.
panelCuentasRouter.get('/cliente/:clienteId/pagador/consentimiento/:consentimientoId/papel', requiereRolPanel, exigirOrganizacionActiva, requierePermiso('editar_datos_cliente'), async (req, res) => {
  const cliente = await clienteDelPedido(req);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrada' });

  const { data: consentimiento } = await supabase
    .from('consentimientos_pagador')
    .select('archivo_firmado_url')
    .eq('id', req.params.consentimientoId)
    .eq('cliente_id', cliente.id)
    .maybeSingle();

  if (!consentimiento?.archivo_firmado_url) {
    return res.status(404).json({ error: 'No hay hoja firmada guardada' });
  }

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

    const cliente = await clienteDelPedido(req);
    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrada' });

    const ruta = rutaDelArchivo({
      prestadoraId: cliente.prestadora_id,
      clienteId: cliente.id,
      nombre: `papel-${req.params.tipoDocumentoId}`,
      extension: extensionDeArchivo(req.file.mimetype),
    });
    const { error: errorSubida } = await supabase.storage
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
  const cliente = await clienteDelPedido(req);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrada' });

  const { data: documento } = await supabase
    .from('documentos_pagador')
    .select('archivo_url')
    .eq('id', req.params.documentoId)
    .eq('cliente_id', cliente.id)
    .maybeSingle();

  if (!documento?.archivo_url) {
    return res.status(404).json({ error: 'No hay archivo guardado' });
  }

  const { data, error } = await supabase.storage
    .from(DEPOSITO_DEL_PAGADOR)
    .createSignedUrl(documento.archivo_url, 60);
  if (error) return responderError(res, error);

  res.json({ url: data.signedUrl });
});

panelCuentasRouter.post('/cliente/:clienteId/personas autorizadas', requiereRolPanel, exigirOrganizacionActiva, requierePermiso('editar_datos_cliente'), async (req, res) => {
  const { nombre, email, telefono } = req.body || {};
  const prestadoraId = req.usuarioPanel.prestadoraId;

  let queryCliente = supabase.from('clientes').select('id').eq('id', req.params.clienteId);
  queryCliente = acotarAPrestadora(queryCliente, req.usuarioPanel);
  const { data: cliente } = await queryCliente.maybeSingle();
  if (!cliente) {
    return res.status(404).json({ error: 'Cliente no encontrada' });
  }

  try {
    const { miembroId } = await invitarMiembroPersonasAutorizadas({
      email,
      nombre,
      telefono,
      clienteId: req.params.clienteId,
      prestadoraId,
      invitadoPor: req.usuarioPanel.id,
    });
    res.json({ ok: true, usuarioId: miembroId });
  } catch (error) {
    responderError(res, error);
  }
});

panelCuentasRouter.delete('/cliente/:clienteId/personas autorizadas/:usuarioId', requiereRolPanel, exigirOrganizacionActiva, requierePermiso('editar_datos_cliente'), async (req, res) => {
  const prestadoraId = req.usuarioPanel.prestadoraId;

  let queryCliente = supabase.from('clientes').select('id').eq('id', req.params.clienteId);
  queryCliente = acotarAPrestadora(queryCliente, req.usuarioPanel);
  const { data: cliente } = await queryCliente.maybeSingle();
  if (!cliente) {
    return res.status(404).json({ error: 'Cliente no encontrada' });
  }

  try {
    await revocarMiembroPersonasAutorizadas(req.params.usuarioId, { prestadoraId, clienteId: req.params.clienteId });
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
    await reenviarActivacionCuenta(usuario.id);
    res.json({ ok: true });
  } catch (error) {
    responderError(res, error);
  }
});
