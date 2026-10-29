import { Router } from 'express';
import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import { exigirOrganizacionActiva } from '../middleware/alcancePrestadora.js';
import { enLaPrestadora, clienteDelPedido } from '../db/connection.js';
import { marcarAusenteYCrearIncidente } from '../utils/marcarAusente.js';
import { cubrirGuardiaConSustituto } from '../utils/cubrirGuardia.js';
import { avisarCambioDeAsistente } from '../utils/avisoCambioDeAsistente.js';
import { avisarAsignacionDeTurno, avisarAsignacionDeSerie } from '../utils/avisoAsignacionDeTurno.js';
import { sugerirMotivoDelAviso } from '../utils/motivoSugeridoDelAviso.js';
import { responderError } from '../utils/errorConMotivo.js';
import { documentosDelBloqueo } from '../utils/erroresDeDocumentos.js';

export const panelGuardiasRouter = Router();

/* CON LA CREDENCIAL DE QUIEN PIDE. La guardia se lee siempre así: al Coordinador la base le deja
   ver sólo las de los Servicios que coordina, más la de una alarma que tenga tomada
   (`coordinador_gestiona_guardias_de_sus_servicios`), que son las que el Panel le muestra, y una
   guardia que no ve no aparece.

   Lo que la persona no puede escribir por sí misma va con el trabajo de la Prestadora de esa
   guardia, después de que la base le dejó verla: abrir el incidente de una ausencia, que busca al
   Asistente saliente aunque sea de otra zona; pasar la guardia al sustituto, que puede ser de
   otra zona porque el Coordinador ve el padrón entero (`coordinador_lee_el_padron_de_asistentes`)
   y elige entre todos; y anotar un descanso, que la base le deja cargar sólo a la administración.
   Si quien coordina puede elegir un sustituto de otra zona se decide aparte. */

/* Las guardias las escribe el Panel directo contra la base, con el pase de la persona, y así
   sigue siendo: reasignar, cancelar, registrar la llegada. Acá vive la excepción.

   POR QUÉ ESTA RUTA. Marcar una ausencia no es un cambio de estado: es un cambio de estado más
   la apertura de un incidente de relevo, y el incidente tiene que decir quién se quedó esperando.
   Averiguar eso lleva su propia consulta y su propia regla, y esa regla ya la tenía escrita el
   backend para la detección automática. Escrita otra vez del lado del navegador quedaron dos, y
   dieron distinto: la del Panel miraba un solo Paciente y un solo día. El detalle de las dos
   diferencias está en `utils/marcarAusente.js`.

   Así que la decisión se mudó entera al backend y el Panel la pide. La Prestadora la pone la
   base, nunca el pedido: la guardia se lee con la credencial de quien llama, y si no la ve, no
   aparece. Un identificador de otra Prestadora no distingue de uno que no existe, que es lo que
   pide CLAUDE.md §6.

   Marcar una ausencia es trabajo operativo, así que también es del Coordinador: alcanza con
   `requiereRolPanel`. */
panelGuardiasRouter.post('/:id/ausente', requiereRolPanel, exigirOrganizacionActiva, async (req, res) => {
  const { data: guardia, error } = await clienteDelPedido(req)
    .from('guardias')
    .select('id, prestadora_id, paciente_id, fecha, hora_inicio, estado, asistente_id')
    .eq('id', req.params.id)
    .maybeSingle();

  if (error) return responderError(res, error);
  if (!guardia) return res.status(404).json({ error: 'No se encontró esa guardia' });

  // Sin Asistente asignado no hay ausencia: nadie faltó. Es el mismo filtro que aplica la
  // detección automática, y por el mismo motivo — un hueco de la agenda marcado como ausencia
  // dispara la alerta más grave del sistema contra nadie.
  if (!guardia.asistente_id) {
    return res.status(400).json({ error: 'La guardia no tiene Asistente asignado' });
  }
  if (guardia.estado !== 'programada') {
    return res.status(400).json({ error: 'Solo una guardia programada puede marcarse como ausente' });
  }

  // Con el trabajo de la Prestadora, porque quien se queda esperando puede ser de otra zona: ver
  // el encabezado.
  const resultado = await enLaPrestadora(guardia.prestadora_id, 'marcar la ausencia', (db) =>
    marcarAusenteYCrearIncidente({ db, guardia, prestadoraId: guardia.prestadora_id }));
  if (!resultado.ok) return res.status(500).json({ error: resultado.motivo });

  res.json({ ok: true });
});

/* La segunda excepción, y por el mismo motivo: cubrir una ausencia con un sustituto tampoco es un
   cambio de estado. Son dos escrituras que valen juntas o no valen —la constancia de a quién le
   tocaba ese turno y por qué lo hace otro, y la guardia que pasa a nombre de quien lo hace— y el
   orden entre ellas importa. Está escrito una sola vez en `utils/cubrirGuardia.js`, con el porqué
   de cada paso.

   La Prestadora la pone la base, nunca el pedido: la guardia se lee con la credencial de quien
   llama, y si no la ve, no aparece. Y el sustituto se busca igual, en esa misma Prestadora, antes
   de escribir nada: un identificador de otra Organización no puede terminar haciendo una guardia
   acá.

   Cubrir una ausencia es trabajo operativo, así que también es del Coordinador. */
panelGuardiasRouter.post('/:id/cubrir', requiereRolPanel, exigirOrganizacionActiva, async (req, res) => {
  const {
    asistente_sustituto_id: asistenteSustitutoId,
    ausencia_id: ausenciaId = null,
    motivo = null,
    motivo_detalle: motivoDetalle = null,
    costo_adicional: costoAdicional = null,
  } = req.body ?? {};

  if (!asistenteSustitutoId) return res.status(400).json({ error: 'Falta el Asistente que cubre' });

  const db = clienteDelPedido(req);
  const { data: guardia, error } = await db
    .from('guardias')
    .select('id, prestadora_id, asistente_id, estado')
    .eq('id', req.params.id)
    .maybeSingle();

  if (error) return responderError(res, error);
  if (!guardia) return res.status(404).json({ error: 'No se encontró esa guardia' });

  // Sin Asistente asignado nadie faltó: esa guardia está sin cubrir, y asignarla es otra cosa.
  if (!guardia.asistente_id) {
    return res.status(400).json({ error: 'La guardia no tiene Asistente asignado' });
  }
  if (guardia.estado !== 'programada') {
    return res.status(400).json({ error: 'Solo una guardia programada puede cubrirse con un sustituto' });
  }
  if (guardia.asistente_id === asistenteSustitutoId) {
    return res.status(400).json({ error: 'El sustituto no puede ser el mismo Asistente de la guardia' });
  }

  const { data: sustituto } = await db
    .from('asistentes')
    .select('id')
    .eq('id', asistenteSustitutoId)
    .eq('prestadora_id', guardia.prestadora_id)
    // Uno con la cuenta desactivada se contesta como inexistente.
    .eq('cuenta_desactivada', false)
    .maybeSingle();
  if (!sustituto) return res.status(404).json({ error: 'No se encontró ese Asistente' });

  // Con el trabajo de la Prestadora, porque el sustituto puede ser de otra zona: ver el encabezado.
  const resultado = await enLaPrestadora(guardia.prestadora_id, 'cubrir la guardia', (dbTrabajo) =>
    cubrirGuardiaConSustituto({
      db: dbTrabajo,
      guardia,
      asistenteSustitutoId,
      ausenciaId,
      motivo,
      motivoDetalle,
      costoAdicional,
    }));
  if (!resultado.ok) return res.status(500).json({ error: resultado.motivo });

  res.json({ ok: true });
});

/* La tercera excepción, y por el mismo motivo que la primera: el Panel cambia el Asistente de una
   guardia contra la base, pero avisarlo no lo puede hacer él. El mensaje sale por WhatsApp, por
   correo y por el celular del Cliente, y ninguno de los tres pasa por el navegador.

   La guardia ya se cambió cuando llega este pedido. Así que el mensaje no puede voltear nada: si
   falla un canal queda registrado adentro de `avisarCambioDeAsistente` y la respuesta sigue
   siendo buena, porque lo que la pantalla informa es la reasignación, que salió bien.

   El Asistente nuevo viaja en el pedido y no se deduce de la guardia, porque este mensaje también
   lo usa la reasignación, donde la guardia todavía puede estar contando al anterior. La
   Prestadora, en cambio, nunca viaja: sale de las guardias, que se leen con la credencial de
   quien llama. */
panelGuardiasRouter.post('/aviso-cambio-asistente', requiereRolPanel, exigirOrganizacionActiva, async (req, res) => {
  const { guardia_ids: guardiaIds, asistente_nuevo_id: asistenteNuevoId, asistente_anterior_id: asistenteAnteriorId } = req.body ?? {};

  if (!Array.isArray(guardiaIds) || guardiaIds.length === 0) {
    return res.status(400).json({ error: 'No se indicó ninguna guardia' });
  }
  if (!asistenteNuevoId) {
    return res.status(400).json({ error: 'No se indicó el Asistente nuevo' });
  }

  const { data: guardias, error } = await clienteDelPedido(req)
    .from('guardias')
    .select('id, prestadora_id, paciente_id, fecha, hora_inicio, hora_fin, dias_hasta_el_fin')
    .in('id', guardiaIds);

  if (error) return responderError(res, error);
  if (!guardias?.length) return res.status(404).json({ error: 'No se encontró esa guardia' });

  await avisarCambioDeAsistente({
    guardias,
    prestadoraId: guardias[0].prestadora_id,
    asistenteNuevoId,
    asistenteAnteriorId: asistenteAnteriorId ?? null,
  });

  res.json({ ok: true });
});

/* Asignar un turno, o dejarlo sin asignar. Lo hace `asignar_turno` en la base, con la credencial de
   quien pide: el turno queda esperando la respuesta del Asistente, y quien lo tenía lo pierde. Pasa
   por el backend sólo por los avisos —al Asistente nuevo y a quien deja de tenerlo—, que salen por
   el celular y el Panel no los puede mandar. Al Cliente no se le avisa acá: el turno cambia de
   manos cuando el nuevo acepta.

   Lo que la base rechaza vuelve como motivo, nunca con su texto: los documentos pendientes y la
   modalidad llevan el mismo código que el Panel ya sabe convertir en frase, y los documentos además
   la lista de cuáles faltan. */
const LO_QUE_RECHAZA_LA_BASE = [
  { patron: /guardia_no_encontrada/, estado: 404, motivo: 'guardia_no_encontrada' },
  { patron: /asistente_no_encontrado/, estado: 404, motivo: 'asistente_no_encontrado' },
  { patron: /guardia_no_se_asigna/, estado: 409, motivo: 'guardia_no_se_asigna' },
  { patron: /guardia_sin_asistente/, estado: 409, motivo: 'guardia_sin_asistente' },
  { patron: /paciente_no_encontrado/, estado: 404, motivo: 'paciente_no_encontrado' },
  { patron: /serie_no_encontrada/, estado: 404, motivo: 'serie_no_encontrada' },
  { patron: /serie_no_se_asigna/, estado: 409, motivo: 'serie_no_se_asigna' },
];

export function motivoDeLaAsignacion(error) {
  const texto = String(error?.message ?? '');
  const documentos = documentosDelBloqueo(error);
  if (documentos) return { estado: 409, motivo: 'documentos_bloquean', documentos };
  if (texto.includes('sin_permiso_para_asignar_con_documentos_pendientes')) {
    return { estado: 403, motivo: 'sin_permiso_para_asignar_con_documentos_pendientes' };
  }
  const modalidad = /modalidad_bloquea:([a-z_]+)/.exec(texto);
  if (modalidad) return { estado: 409, motivo: `modalidad_bloquea:${modalidad[1]}` };
  return LO_QUE_RECHAZA_LA_BASE.find((r) => r.patron.test(texto)) ?? null;
}

/** Contesta lo que la base rechazó, con el motivo y, si son documentos, cuáles. */
function responderRechazo(req, res, error) {
  const previsto = motivoDeLaAsignacion(error);
  if (!previsto) return responderError(res, error);
  console.error(`[${previsto.estado}] POST ${req.originalUrl} — ${previsto.motivo}:`, error.message);
  const cuerpo = { error: previsto.motivo, motivo: previsto.motivo };
  if (previsto.documentos) cuerpo.documentos = previsto.documentos;
  return res.status(previsto.estado).json(cuerpo);
}

/* El motivo para asignar igual con documentos pendientes viaja sólo cuando la persona eligió
   hacerlo. La base decide si tiene permiso y deja la excepción anotada. */
panelGuardiasRouter.post('/:id/asignar', requiereRolPanel, exigirOrganizacionActiva, async (req, res) => {
  const asistenteId = req.body?.asistente_id ?? null;
  if (asistenteId !== null && typeof asistenteId !== 'string') {
    return res.status(400).json({ error: 'Asistente no reconocido' });
  }
  const motivoExcepcion = req.body?.motivo_excepcion;
  if (motivoExcepcion !== undefined && motivoExcepcion !== null
    && (typeof motivoExcepcion !== 'string' || !motivoExcepcion.trim())) {
    return res.status(400).json({ error: 'motivo_excepcion_invalido', motivo: 'motivo_excepcion_invalido' });
  }

  const db = clienteDelPedido(req);
  // Se lee antes de asignar lo que la asignación no cambia: después, si quedó en manos de un
  // Asistente de otra zona, quien coordina ya no la ve.
  const { data: guardia } = await db
    .from('guardias')
    .select('id, prestadora_id, fecha, hora_inicio, hora_fin')
    .eq('id', req.params.id)
    .maybeSingle();

  const parametros = { p_guardia_id: req.params.id, p_asistente_id: asistenteId };
  if (typeof motivoExcepcion === 'string') parametros.p_motivo_excepcion = motivoExcepcion.trim();
  const { data: resultado, error } = await db.rpc('asignar_turno', parametros);

  if (error) return responderRechazo(req, res, error);

  if (resultado?.sin_cambios) return res.json({ sinCambios: true });

  if (guardia) {
    await avisarAsignacionDeTurno(db, {
      prestadoraId: guardia.prestadora_id,
      guardia,
      asistenteNuevoId: asistenteId,
      retirados: [resultado?.titular_retirado, resultado?.pendiente_retirado],
    });
  }

  res.json({ sinCambios: false });
});

/* Asignar un turno fijo, o dejarlo sin asignar. Igual que el turno de un día, y lo hace
   `asignar_serie`: el Asistente lo contesta una sola vez para todos sus días, y hasta que acepta
   ninguno es suyo. La serie se lee con la credencial de quien asignó. */
panelGuardiasRouter.post('/series/:id/asignar', requiereRolPanel, exigirOrganizacionActiva, async (req, res) => {
  const asistenteId = req.body?.asistente_id ?? null;
  if (asistenteId !== null && typeof asistenteId !== 'string') {
    return res.status(400).json({ error: 'Asistente no reconocido' });
  }

  const db = clienteDelPedido(req);
  const { data: resultado, error } = await db.rpc('asignar_serie', {
    p_serie_id: req.params.id,
    p_asistente_id: asistenteId,
  });

  if (error) return responderRechazo(req, res, error);

  if (resultado?.sin_cambios) return res.json({ sinCambios: true });

  const { data: serie } = await db
    .from('series_guardias')
    .select('id, prestadora_id, dias_semana, hora_inicio, hora_fin')
    .eq('id', req.params.id)
    .maybeSingle();

  if (serie) {
    await avisarAsignacionDeSerie(db, {
      prestadoraId: serie.prestadora_id,
      serie,
      asistenteNuevoId: asistenteId,
      retirados: [resultado?.titular_retirado, resultado?.pendiente_retirado],
    });
  }

  res.json({ sinCambios: false });
});

/* Llevar un turno con Asistente al de otro Paciente, desde la vista por Paciente. Lo hace
   `mover_turno_a_otro_paciente` en la base, todo junto o nada: el turno original queda sin nadie y
   con la alarma abierta, y para el otro Paciente nace un turno nuevo que el mismo Asistente tiene
   que aceptar. Pasa por el backend por los dos avisos a ese Asistente: que perdió uno y que tiene
   otro para responder. */
panelGuardiasRouter.post('/:id/mover-a-paciente', requiereRolPanel, exigirOrganizacionActiva, async (req, res) => {
  const { paciente_id: pacienteId, fecha = null, hora_inicio: horaInicio = null, hora_fin: horaFin = null } = req.body ?? {};
  if (typeof pacienteId !== 'string' || !pacienteId) {
    return res.status(400).json({ error: 'Paciente no reconocido' });
  }

  const db = clienteDelPedido(req);
  const CAMPOS = 'id, prestadora_id, fecha, hora_inicio, hora_fin';
  // La original se lee antes de moverla, mientras quien coordina todavía la ve por su Asistente.
  const { data: original } = await db.from('guardias').select(CAMPOS).eq('id', req.params.id).maybeSingle();

  const { data: resultado, error } = await db.rpc('mover_turno_a_otro_paciente', {
    p_guardia_id: req.params.id,
    p_paciente_id: pacienteId,
    p_fecha: fecha,
    p_hora_inicio: horaInicio,
    p_hora_fin: horaFin,
  });

  if (error) return responderRechazo(req, res, error);

  // La nueva nace sin Asistente hasta que acepte, y así la ve quien coordina.
  const { data: nueva } = resultado?.guardia_nueva_id
    ? await db.from('guardias').select(CAMPOS).eq('id', resultado.guardia_nueva_id).maybeSingle()
    : { data: null };

  if (original) {
    await avisarAsignacionDeTurno(db, {
      prestadoraId: original.prestadora_id,
      guardia: original,
      asistenteNuevoId: null,
      retirados: [resultado?.titular_retirado, resultado?.pendiente_retirado],
    });
  }
  if (nueva) {
    await avisarAsignacionDeTurno(db, {
      prestadoraId: nueva.prestadora_id,
      guardia: nueva,
      asistenteNuevoId: resultado?.asistente_id ?? null,
      retirados: [],
    });
  }

  res.json({ ok: true });
});

/* La tercera excepción: quien atiende el teléfono cuenta lo que le dijeron y el backend sugiere
   cuál de los motivos de la Prestadora es. El aviso lo sigue guardando el Panel contra la base,
   con el pase de la persona, igual que antes — acá no se escribe nada.

   POR QUÉ PASA POR EL BACKEND. La clave de la API del modelo vive en el servidor y no puede salir
   al navegador (`celtatech/CLAUDE.md` §6). Es toda la razón: no hay ninguna decisión acá que el
   Panel no pudiera tomar.

   LA LISTA LA TRAE EL BACKEND, NO EL PEDIDO. El navegador manda lo que se contó y nada más. Los
   motivos se leen de la base acotados a la Organización activa de quien llama: mandados en el
   pedido, cualquiera podría hacer que la sugerencia salga de una lista que no es la suya, y una
   sugerencia de un motivo ajeno es una filtración de cómo trabaja otra Prestadora.

   LO QUE SE CONTÓ NO SE GUARDA. Entra, se usa para preguntar y se va con la respuesta. Lo que
   queda escrito es el motivo que elija la persona, como venía siendo. */
panelGuardiasRouter.post('/motivo-del-aviso', requiereRolPanel, exigirOrganizacionActiva, async (req, res) => {
  const texto = typeof req.body?.texto === 'string' ? req.body.texto.trim() : '';
  if (!texto) return res.status(400).json({ error: 'No se indicó lo que se avisó' });

  const { data: motivos, error } = await clienteDelPedido(req)
    .from('motivos_aviso_previo_guardia')
    .select('nombre, activo');

  if (error) return responderError(res, error);

  const { motivo } = await sugerirMotivoDelAviso({
    texto,
    motivos: motivos ?? [],
    prestadoraId: req.usuarioPanel.prestadoraId,
  });

  res.json({ motivo });
});

/* EL DESCANSO ADENTRO DE LA GUARDIA, MIRADO DESDE EL PANEL.

   En una guardia de 24, 48 o 72 horas la Asistente descansa adentro del turno, y ese rato queda
   anotado. Descansar disponible no se descuenta de lo que se le paga, no interrumpe el turno y no
   la saca de la guardia: la constancia existe para saber qué pasó, no para restar nada.

   POR QUÉ ESTAS DOS RUTAS. La que estuvo cuarenta y ocho horas adentro puede haberse olvidado de
   marcarlo, y ese rato igual existió: la Coordinadora lo anota después. No puede hacerlo contra la
   base desde el navegador porque la base le deja cargar un descanso sólo a la administración
   (`la_administracion_carga_un_descanso`): el alta la hace el trabajo de la Prestadora.

   ACÁ SE ANOTA UN DESCANSO YA TERMINADO, con su principio y su fin. Empezar uno abierto es de la
   Asistente, que es la que está adentro; la Coordinadora registra lo que ya pasó.

   La Prestadora la pone la base, nunca el pedido: la guardia se lee con la credencial de quien
   llama, y si no la ve, no aparece.

   Anotar un descanso es trabajo operativo, así que también es del Coordinador. */
function guardiaDelPanel(req) {
  return clienteDelPedido(req)
    .from('guardias')
    .select('id, prestadora_id')
    .eq('id', req.params.id)
    .maybeSingle();
}

panelGuardiasRouter.get('/:id/descansos', requiereRolPanel, exigirOrganizacionActiva, async (req, res) => {
  const { data: guardia, error } = await guardiaDelPanel(req);
  if (error) return responderError(res, error);
  if (!guardia) return res.status(404).json({ error: 'No se encontró esa guardia' });

  const { data, error: errorDescansos } = await clienteDelPedido(req)
    .from('descansos_guardia')
    .select('id, inicio_at, fin_at, nota, registrado_por')
    .eq('guardia_id', guardia.id)
    .eq('prestadora_id', guardia.prestadora_id)
    .order('inicio_at', { ascending: false });

  if (errorDescansos) return responderError(res, errorDescansos);

  res.json({ descansos: data ?? [] });
});

panelGuardiasRouter.post('/:id/descansos', requiereRolPanel, exigirOrganizacionActiva, async (req, res) => {
  const { inicio_at: inicioAt, fin_at: finAt, nota = null } = req.body ?? {};

  if (!inicioAt || !finAt) return res.status(400).json({ error: 'Falta el principio o el fin del descanso' });

  const inicio = new Date(inicioAt);
  const fin = new Date(finAt);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) {
    return res.status(400).json({ error: 'El principio o el fin del descanso no es una fecha válida' });
  }
  // La misma comprobación que hace la base. Acá está para que el motivo llegue entendible: el
  // texto crudo de una restricción nombra tablas y columnas, y eso no sale a la pantalla.
  if (fin <= inicio) {
    return res.status(400).json({ error: 'El descanso no puede terminar antes de empezar' });
  }
  // Un descanso que todavía no pasó no se anota: esto registra lo que ya ocurrió.
  if (fin > new Date()) {
    return res.status(400).json({ error: 'El descanso no puede terminar en el futuro' });
  }

  const { data: guardia, error } = await guardiaDelPanel(req);
  if (error) return responderError(res, error);
  if (!guardia) return res.status(404).json({ error: 'No se encontró esa guardia' });

  const { data, error: errorAlta } = await enLaPrestadora(guardia.prestadora_id, 'anotar un descanso', (db) => db
    .from('descansos_guardia')
    .insert({
      prestadora_id: guardia.prestadora_id,
      guardia_id: guardia.id,
      inicio_at: inicio.toISOString(),
      fin_at: fin.toISOString(),
      registrado_por: req.usuarioPanel.id,
      nota: typeof nota === 'string' && nota.trim() ? nota.trim() : null,
    })
    .select('id, inicio_at, fin_at, nota, registrado_por')
    .single());

  if (errorAlta) return responderError(res, errorAlta);

  res.status(201).json({ descanso: data });
});
