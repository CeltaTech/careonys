import { supabase, enLaPrestadora } from '../db/connection.js';
import { notificarCoordinador } from './whatsapp.js';
import { enviarPushCliente } from './push.js';
import { configuracionEvento } from './email.js';
import { pacientesDeTurnosGuardia } from './pacientesDeTurnoGuardia.js';
import { mensajeDelSistema } from '../i18n/avisos.js';
import { idiomaDeLaPrestadora } from '../i18n/idiomaDeLaPrestadora.js';
import { FICHA_NOMBRE } from './fichaDelPaciente.js';
import { notificaClientePorDefecto } from './catalogoAvisos.js';

// Mensaje del sistema que anuncia que una o varios turnos de guardia pasaron a manos de otro Asistente.
//
// Lo pide el Panel, que es donde se reasigna: ahí se cambia el Asistente de un turno de guardia, se la
// arrastra a otra fila del cuadro y se asigna la cobertura de una ausencia. El Panel no puede
// mandar este mensaje por su cuenta —habla con la base directo y no tiene push, ni WhatsApp, ni
// correo—, así que llama a `routes/panelTurnosGuardia.js` y ahí se entra por acá.
//
// **El Asistente nuevo llega explícito y no se lee de `turnos_guardia.asistente_id`.** Quien llama puede
// pedir el mensaje con los turnos de guardia tal como estaban antes de moverlas, y ahí esa columna todavía
// nombra al Asistente anterior: si el mensaje la mirara, anunciaría el cambio nombrando justamente
// a quien deja de tenerlas.
//
// **Un solo mensaje para todos los turnos de guardia, y no uno por turno de guardia.** Una ausencia puede dejar diez
// turnos descubiertos, y diez mensajes por una sola decisión serían diez correos al Coordinador por
// algo que se hizo de una vez.
export const EVENTO_CAMBIO_DE_ASISTENTE = 'cambio_de_asistente';

// Ordena por cuándo ocurre el turno, que es el orden en que le sirve a quien lee: primero lo que
// pasa antes. Función aparte para que las dos armadas de abajo ordenen igual.
function porCuandoOcurre(a, b) {
  return `${a.fecha} ${a.hora_inicio ?? ''}`.localeCompare(`${b.fecha} ${b.hora_inicio ?? ''}`);
}

function nombresDePacientes(pacientes) {
  return (pacientes ?? []).map((p) => p.nombre).filter(Boolean);
}

// Los turnos como los lee el Coordinador: todos juntos, con sus Pacientes.
export function turnosGuardiaDelMensaje(turnos_guardia, pacientesPorTurnoGuardia) {
  return [...(turnos_guardia ?? [])].sort(porCuandoOcurre).map((turno_guardia) => ({
    fecha: turno_guardia.fecha,
    horaInicio: turno_guardia.hora_inicio,
    horaFin: turno_guardia.hora_fin,
    pacientes: nombresDePacientes(pacientesPorTurnoGuardia?.get(turno_guardia.id)),
  }));
}

// Los mismos turnos, pero repartidos por Cliente: a cada uno le toca ver sólo los suyos.
//
// Un turno que cubre a dos Pacientes del mismo Cliente aparece una vez y no dos: es un solo
// turno, y contarlo dos veces le diría «2 turnos de guardia» a quien tiene una.
export function turnosGuardiaPorCliente(turnos_guardia, pacientesPorTurnoGuardia) {
  const porCliente = new Map();

  for (const turno_guardia of [...(turnos_guardia ?? [])].sort(porCuandoOcurre)) {
    const pacientes = pacientesPorTurnoGuardia?.get(turno_guardia.id) ?? [];
    const clientes = new Set(pacientes.map((p) => p.cliente_id).filter(Boolean));

    for (const clienteId of clientes) {
      const suyos = porCliente.get(clienteId) ?? [];
      suyos.push({
        fecha: turno_guardia.fecha,
        horaInicio: turno_guardia.hora_inicio,
        horaFin: turno_guardia.hora_fin,
        pacientes: nombresDePacientes(pacientes.filter((p) => p.cliente_id === clienteId)),
      });
      porCliente.set(clienteId, suyos);
    }
  }

  return porCliente;
}

// El nombre de un Asistente, acotado a la Prestadora: un identificador de otra nunca devuelve un
// nombre. Sin esto, mandar un identificador ajeno alcanzaría para leer a quién pertenece
// (CLAUDE.md §6).
async function nombreDelAsistente(asistenteId, prestadoraId) {
  if (!asistenteId) return null;
  const { data } = await supabase
    .from('asistentes')
    .select('id, nombre')
    .eq('id', asistenteId)
    .eq('prestadora_id', prestadoraId)
    .maybeSingle();
  return data?.nombre ?? null;
}

// El mensaje completo. Nunca tira: quien lo llama ya cambió el turno de guardia, y hacer fallar la operación
// por un canal que no salió mostraría como fallido algo que salió bien.
//
// Con el trabajo de la Prestadora, porque el mensaje lee datos que quien lo pide no siempre ve —el
// Coordinador, al Asistente de otra zona; el Asistente, a sus compañeros— y la Prestadora ya la
// resolvió quien llama, con la credencial de la persona.
export async function avisarCambioDeAsistente({ turnos_guardia, prestadoraId, asistenteNuevoId, asistenteAnteriorId }) {
  if (!turnos_guardia?.length || !prestadoraId) return;
  try {
    await enLaPrestadora(prestadoraId, 'aviso de cambio de Asistente', () =>
      armarYMandar({ turnos_guardia, prestadoraId, asistenteNuevoId, asistenteAnteriorId }));
  } catch (e) {
    console.error(`Error armando el aviso de cambio de Asistente (prestadora ${prestadoraId}):`, e.message);
  }
}

async function armarYMandar({ turnos_guardia, prestadoraId, asistenteNuevoId, asistenteAnteriorId }) {
  const idioma = await idiomaDeLaPrestadora(supabase, prestadoraId);

  let pacientesPorTurnoGuardia = new Map();
  try {
    pacientesPorTurnoGuardia = await pacientesDeTurnosGuardia(supabase, prestadoraId, turnos_guardia, `id, cliente_id, ${FICHA_NOMBRE}`);
  } catch (e) {
    console.error(`Error leyendo los Pacientes de las guardias que cambiaron de Asistente (prestadora ${prestadoraId}):`, e.message);
  }

  const [asistenteNuevo, asistenteAnterior] = await Promise.all([
    nombreDelAsistente(asistenteNuevoId, prestadoraId),
    nombreDelAsistente(asistenteAnteriorId, prestadoraId),
  ]);

  const datos = { asistenteNuevo, asistenteAnterior, turnos_guardia: turnosGuardiaDelMensaje(turnos_guardia, pacientesPorTurnoGuardia) };

  try {
    await notificarCoordinador({
      evento: EVENTO_CAMBIO_DE_ASISTENTE,
      prestadoraId,
      ...mensajeDelSistema(EVENTO_CAMBIO_DE_ASISTENTE, idioma, datos),
    });
  } catch (e) {
    console.error(`Error avisando al Coordinador el cambio de Asistente (prestadora ${prestadoraId}):`, e.message);
  }

  // Al Cliente le llega salvo que la Prestadora lo haya apagado: sin nada guardado vale lo que dice
  // el catálogo, que lo trae encendido.
  const config = await configuracionEvento(EVENTO_CAMBIO_DE_ASISTENTE, prestadoraId);
  if (!(config?.notificar_cliente ?? notificaClientePorDefecto(EVENTO_CAMBIO_DE_ASISTENTE))) return;

  for (const [clienteId, turnosDelCliente] of turnosGuardiaPorCliente(turnos_guardia, pacientesPorTurnoGuardia)) {
    try {
      await enviarPushCliente(prestadoraId, clienteId, {
        ...mensajeDelSistema(`${EVENTO_CAMBIO_DE_ASISTENTE}_cliente`, idioma, { asistenteNuevo, asistenteAnterior, turnos_guardia: turnosDelCliente }),
        url: '/',
      });
    } catch (e) {
      console.error(`Error avisando al Cliente ${clienteId} el cambio de Asistente:`, e.message);
    }
  }
}
