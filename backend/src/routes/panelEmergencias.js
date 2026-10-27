import { Router } from 'express';
import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import { exigirOrganizacionActiva } from '../middleware/alcancePrestadora.js';
import { clienteDelPedido } from '../db/connection.js';
import { responderError, ErrorConMotivo } from '../utils/errorConMotivo.js';
import { anotarConsultaAHce, origenDelPedido } from '../utils/registroDeConsultas.js';
import { FICHA_NOMBRE, conSusFichas } from '../utils/fichaDelPaciente.js';
import { empujar, ASUNTOS } from '../avisosEnVivo/canal.js';

/* Las emergencias avisadas desde una guardia, del lado del Panel.
   ==============================================================

   QUÉ ES ESTO Y QUÉ NO. Son avisos que apretó una persona mientras estaba trabajando, no señales
   que dedujo un programa. Por eso no están en la bandeja de la revisión automática de reportes ni
   en la de las alertas tempranas de ausencia: las dos hablan de otra cosa, y mezclarlas haría que
   un aviso de alguien que está adentro de una casa se lea con el mismo peso que una estadística.

   EL DETALLE SE LEE ACÁ Y EN NINGÚN OTRO LADO. El mensaje inmediato que sale por WhatsApp o por
   correo dice que hay una emergencia y de qué guardia; el texto que escribió el Asistente es
   información sensible y no viaja por un canal público (`celtatech/CLAUDE.md` §6). Esta ruta es
   la puerta donde el permiso se comprueba.

   TODO ENTRA CON LA CREDENCIAL DE QUIEN PIDE, y la base decide cuáles ve: el Administrador,
   todas las de su Prestadora; el Coordinador, las de su zona, las que llegaron a todos los
   Coordinadores y las que tiene tomadas. La anotación también va con esa credencial: el detalle es
   información de salud, y antes de entregarlo queda anotado quién lo vio, paciente por paciente, y
   si no se puede anotar no se entrega.

   ATENDERLA TAMBIÉN. El Administrador atiende cualquiera de su Prestadora; el Coordinador, las de
   su zona y las que tiene tomadas. Si otra persona la tiene tomada, la base la rechaza. */

export const panelEmergenciasRouter = Router();

/* Quién y dónde se buscan aparte, en vez de pedirlos anidados en la misma consulta. Entre
   `guardias` y `asistentes` la clave foránea es compuesta —el identificador y la Prestadora
   juntos—, y una consulta anidada sobre una clave así depende de que PostgREST la resuelva; dos
   consultas más no cuestan nada acá, donde el tope es de doscientas filas, y no se rompen el día
   que alguien agregue otra relación entre esas dos tablas. */
async function conNombres(emergencias, db) {
  const guardiaIds = [...new Set(emergencias.map((e) => e.guardia_id))];
  if (guardiaIds.length === 0) return [];

  const { data: guardias } = await db
    .from('guardias')
    .select('id, fecha, hora_inicio, hora_fin, dias_hasta_el_fin, asistente_id, paciente_id')
    .in('id', guardiaIds);

  const porGuardia = new Map((guardias ?? []).map((g) => [g.id, g]));

  const asistenteIds = [...new Set((guardias ?? []).map((g) => g.asistente_id).filter(Boolean))];
  const pacienteIds = [...new Set((guardias ?? []).map((g) => g.paciente_id).filter(Boolean))];

  // Lo que está pendiente de conformidad la base no lo muestra, y entonces sale sin nombre.
  const [{ data: asistentes }, { data: pacientes }] = await Promise.all([
    asistenteIds.length
      ? db.from('asistentes').select('id, nombre').in('id', asistenteIds)
      : Promise.resolve({ data: [] }),
    pacienteIds.length
      ? db.from('pacientes').select(`id, cliente_id, ${FICHA_NOMBRE}`).in('id', pacienteIds)
      : Promise.resolve({ data: [] }),
  ]);

  const nombreAsistente = new Map((asistentes ?? []).map((a) => [a.id, a.nombre]));
  const nombrePaciente = new Map(conSusFichas(pacientes).map((p) => [p.id, p.nombre]));
  const clienteDelPaciente = new Map((pacientes ?? []).map((p) => [p.id, p.cliente_id]));
  const contratantes = await contratantesDeLosClientes(db, [...new Set(clienteDelPaciente.values())].filter(Boolean));

  return emergencias.map((emergencia) => {
    const guardia = porGuardia.get(emergencia.guardia_id) ?? null;
    return {
      ...emergencia,
      guardia: guardia && {
        fecha: guardia.fecha,
        hora_inicio: guardia.hora_inicio,
        hora_fin: guardia.hora_fin,
        asistente: nombreAsistente.get(guardia.asistente_id) ?? null,
        paciente: nombrePaciente.get(guardia.paciente_id) ?? null,
        contratante: contratantes.get(clienteDelPaciente.get(guardia.paciente_id)) ?? null,
      },
    };
  });
}

/* A quién llama Coordinación cuando entra una emergencia: el Contratante del Cliente, con los
   teléfonos de su Ficha de Persona que siguen en uso. Se lee con la credencial de quien pide, así
   que la base decide: quien no tiene permiso para ver Personas no recibe ni el nombre ni el
   número, y la emergencia se muestra igual. Un Contratante sin teléfono cargado viene con la
   lista vacía. */
async function contratantesDeLosClientes(db, clienteIds) {
  const porCliente = new Map();
  if (clienteIds.length === 0) return porCliente;

  const { data: clientes } = await db.from('clientes').select('id, contratante_persona_id').in('id', clienteIds);
  const personaIds = [...new Set((clientes ?? []).map((c) => c.contratante_persona_id).filter(Boolean))];
  if (personaIds.length === 0) return porCliente;

  const [{ data: personas }, { data: telefonos }] = await Promise.all([
    db.from('personas').select('id, nombre_visible').in('id', personaIds),
    db
      .from('telefonos_de_la_persona')
      .select('persona_id, telefono')
      .in('persona_id', personaIds)
      .is('fuera_de_uso_at', null)
      .order('created_at', { ascending: true }),
  ]);

  const nombre = new Map((personas ?? []).map((p) => [p.id, p.nombre_visible]));
  for (const cliente of clientes ?? []) {
    if (!nombre.has(cliente.contratante_persona_id)) continue;
    porCliente.set(cliente.id, {
      nombre: nombre.get(cliente.contratante_persona_id),
      telefonos: (telefonos ?? [])
        .filter((t) => t.persona_id === cliente.contratante_persona_id)
        .map((t) => t.telefono),
    });
  }
  return porCliente;
}

/* De quién es la información de salud que se va a entregar: los pacientes de cada guardia con
   una emergencia en la lista. Son los mismos que mira la base para dejar ver el detalle. Si no se
   pueden saber, no se entrega nada: se lanza el error y la ruta contesta que falló. */
async function pacientesDeLasGuardias(db, emergencias) {
  const guardiaIds = [...new Set(emergencias.map((e) => e.guardia_id))];
  if (guardiaIds.length === 0) return [];

  const { data, error } = await db.from('guardia_pacientes').select('paciente_id').in('guardia_id', guardiaIds);
  if (error) throw error;
  return [...new Set((data ?? []).map((fila) => fila.paciente_id).filter(Boolean))];
}

/* La más nueva primero, y con un filtro para ver sólo las que están esperando: lo primero que hace
   quien abre esta pantalla es mirar si hay algo sin atender. El tope existe para que una Prestadora
   con años de historia no se traiga todo de una vez. */
panelEmergenciasRouter.get('/', requiereRolPanel, exigirOrganizacionActiva, async (req, res) => {
  const db = clienteDelPedido(req);
  let consulta = db
    .from('emergencias_guardia')
    .select('id, guardia_id, reportado_por, reportado_at, detalle, atendida_at, atendida_por, atendida_nota')
    .order('reportado_at', { ascending: false })
    .limit(200);

  if (req.query?.estado === 'sin_atender') {
    consulta = consulta.is('atendida_at', null);
  }

  const { data, error } = await consulta;
  if (error) {
    return responderError(res, error);
  }

  const emergencias = data ?? [];

  // Antes de entregar el detalle queda anotado quién lo vio. Si no se puede anotar, no se
  // entrega (docs/PLAN_HASTA_PRODUCCION.md, paso 9).
  try {
    for (const pacienteId of await pacientesDeLasGuardias(db, emergencias)) {
      await anotarConsultaAHce(
        req.usuarioPanel,
        { pacienteId, categorias: ['emergencias_guardia'], origen: origenDelPedido(req) },
        { cliente: db },
      );
    }
  } catch (errorAnotacion) {
    return responderError(res, errorAnotacion);
  }

  try {
    res.json({ emergencias: await conNombres(emergencias, db) });
  } catch (e) {
    responderError(res, e);
  }
});

/* Atenderla es decir qué se hizo, y queda con nombre y hora. Un aviso que nadie marcó no se
   distingue de uno que quedó sin leer, y eso es justamente lo que hay que poder mirar después.
   No se puede volver atrás desde acá: lo que ya se atendió, se atendió. */
panelEmergenciasRouter.post('/:id/atencion', requiereRolPanel, exigirOrganizacionActiva, async (req, res) => {
  const db = clienteDelPedido(req);
  const nota = typeof req.body?.nota === 'string' ? req.body.nota.trim() : '';

  const { data: emergencia } = await db
    .from('emergencias_guardia')
    .select('id, atendida_at')
    .eq('id', req.params.id)
    .maybeSingle();

  // La que no existe y la que la base no deja ver contestan lo mismo: desde afuera se tienen que
  // ver iguales.
  if (!emergencia) {
    return responderError(res, new ErrorConMotivo('no_encontrado'));
  }
  if (emergencia.atendida_at) {
    return responderError(res, new ErrorConMotivo('emergencia_ya_atendida'));
  }

  const { data: atendidas, error } = await db
    .from('emergencias_guardia')
    .update({
      atendida_at: new Date().toISOString(),
      atendida_por: req.usuarioPanel.id,
      atendida_nota: nota ? nota.slice(0, 2000) : null,
    })
    .eq('id', emergencia.id)
    .select('id');

  // La base no deja atenderla si otra persona la tiene tomada, ni a quien coordina otra zona sin
  // haberla tomado. Eso es falta de permiso, no una falla. Y cuando la política no la deja tocar,
  // la base no da error: no modifica ninguna fila.
  if (error) {
    return responderError(res, error, error.code === '42501' ? 403 : 500);
  }
  if (!atendidas?.length) {
    return responderError(res, new ErrorConMotivo('sin_permiso'));
  }

  empujar(req.usuarioPanel.prestadoraId, ASUNTOS.EMERGENCIAS_SIN_ATENDER);
  res.json({ ok: true });
});
