import { Router } from 'express';
import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import { acotarAPrestadora, exigirOrganizacionActiva } from '../middleware/alcancePrestadora.js';
import { clienteDelPedido, supabase } from '../db/connection.js';
import { responderError, ErrorConMotivo } from '../utils/errorConMotivo.js';
import { anotarConsultaAHce, origenDelPedido } from '../utils/registroDeConsultas.js';
import { FICHA_NOMBRE, conSusFichas } from '../utils/fichaDelPaciente.js';

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

   LA LISTA SE LEE CON LA CREDENCIAL DE QUIEN PIDE, y la base decide cuáles ve: el Administrador,
   todas las de su Prestadora; el Coordinador, las de su zona, las que llegaron a todos los
   Coordinadores y las que tiene tomadas. La anotación también va con esa credencial: el detalle es
   información de salud, y antes de entregarlo queda anotado quién lo vio, paciente por paciente, y
   si no se puede anotar no se entrega. Los nombres todavía se buscan con la llave maestra (ver
   `conNombres`).

   ATENDER SIGUE CON LA LLAVE MAESTRA. La tabla no le da a nadie del Panel permiso para
   modificarla, ni tiene una política que lo deje; mientras eso no exista, marcarla atendida se
   hace con la llave maestra y con la Prestadora de la sesión escrita en cada consulta. Quién puede
   atenderla lo decide igual la base, con quien figura en `atendida_por`: si otra persona la tiene
   tomada, la rechaza. */

export const panelEmergenciasRouter = Router();

/* Quién y dónde se buscan aparte, en vez de pedirlos anidados en la misma consulta. Entre
   `guardias` y `asistentes` la clave foránea es compuesta —el identificador y la Prestadora
   juntos—, y una consulta anidada sobre una clave así depende de que PostgREST la resuelva; dos
   consultas más no cuestan nada acá, donde el tope es de doscientas filas, y no se rompen el día
   que alguien agregue otra relación entre esas dos tablas. */
async function conNombres(emergencias, usuarioPanel) {
  const guardiaIds = [...new Set(emergencias.map((e) => e.guardia_id))];
  if (guardiaIds.length === 0) return [];

  // Con la llave maestra, acotada a las guardias de las emergencias que la base ya dejó ver.
  const { data: guardias } = await acotarAPrestadora(
    supabase.from('guardias').select('id, fecha, hora_inicio, hora_fin, dias_hasta_el_fin, asistente_id, paciente_id').in('id', guardiaIds),
    usuarioPanel,
  );

  const porGuardia = new Map((guardias ?? []).map((g) => [g.id, g]));

  const asistenteIds = [...new Set((guardias ?? []).map((g) => g.asistente_id).filter(Boolean))];
  const pacienteIds = [...new Set((guardias ?? []).map((g) => g.paciente_id).filter(Boolean))];

  // Los nombres, también con la llave maestra: `oculta_pendientes_de_conformidad` (RESTRICTIVE,
  // NOT pendiente_conformidad) esconde a todos los roles el Asistente y el Paciente pendientes, y
  // `coordinador_lee_asistentes_de_su_zona` le deja al Coordinador sólo los de su zona; la
  // pantalla mostraba el nombre igual. Si se acota o no se decide aparte.
  const [{ data: asistentes }, { data: pacientes }] = await Promise.all([
    asistenteIds.length
      ? acotarAPrestadora(supabase.from('asistentes').select('id, nombre').in('id', asistenteIds), usuarioPanel)
      : Promise.resolve({ data: [] }),
    pacienteIds.length
      ? acotarAPrestadora(supabase.from('pacientes').select(`id, ${FICHA_NOMBRE}`).in('id', pacienteIds), usuarioPanel)
      : Promise.resolve({ data: [] }),
  ]);

  const nombreAsistente = new Map((asistentes ?? []).map((a) => [a.id, a.nombre]));
  const nombrePaciente = new Map(conSusFichas(pacientes).map((p) => [p.id, p.nombre]));

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
      },
    };
  });
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
  let consulta = acotarAPrestadora(
    db
      .from('emergencias_guardia')
      .select('id, guardia_id, reportado_por, reportado_at, detalle, atendida_at, atendida_por, atendida_nota')
      .order('reportado_at', { ascending: false })
      .limit(200),
    req.usuarioPanel,
  );

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
    res.json({ emergencias: await conNombres(emergencias, req.usuarioPanel) });
  } catch (e) {
    responderError(res, e);
  }
});

/* Atenderla es decir qué se hizo, y queda con nombre y hora. Un aviso que nadie marcó no se
   distingue de uno que quedó sin leer, y eso es justamente lo que hay que poder mirar después.
   No se puede volver atrás desde acá: lo que ya se atendió, se atendió.

   Va con la llave maestra: ver el encabezado. */
panelEmergenciasRouter.post('/:id/atencion', requiereRolPanel, exigirOrganizacionActiva, async (req, res) => {
  const nota = typeof req.body?.nota === 'string' ? req.body.nota.trim() : '';

  const { data: emergencia } = await acotarAPrestadora(
    supabase.from('emergencias_guardia').select('id, atendida_at').eq('id', req.params.id),
    req.usuarioPanel,
  ).maybeSingle();

  // La que no existe y la que es de otra Prestadora contestan lo mismo: desde afuera se tienen
  // que ver iguales.
  if (!emergencia) {
    return responderError(res, new ErrorConMotivo('no_encontrado'));
  }
  if (emergencia.atendida_at) {
    return responderError(res, new ErrorConMotivo('ya_resuelta'));
  }

  const { error } = await acotarAPrestadora(
    supabase
      .from('emergencias_guardia')
      .update({
        atendida_at: new Date().toISOString(),
        atendida_por: req.usuarioPanel.id,
        atendida_nota: nota ? nota.slice(0, 2000) : null,
      })
      .eq('id', emergencia.id),
    req.usuarioPanel,
  );

  // La base no deja atenderla si otra persona la tiene tomada, ni a quien coordina otra zona sin
  // haberla tomado. Eso es falta de permiso, no una falla.
  if (error) {
    return responderError(res, error, error.code === '42501' ? 403 : 500);
  }

  res.json({ ok: true });
});
