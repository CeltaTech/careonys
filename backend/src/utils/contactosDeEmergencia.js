import { ErrorConMotivo } from './errorConMotivo.js';
import { telefonoAceptable } from './codigoAlTelefono.js';
import { telefonoLimpio } from './telefonosDeLaPersona.js';
import { frase } from '../i18n/mensajesDelSistema.js';

// Los contactos de emergencia de un Cliente: a quién se llama si al Paciente le pasa algo.
//
// Los designa el Cliente. Puede ser cualquiera de las personas del Cliente, una Persona autorizada u
// otra persona. Son hasta tres, en orden de prioridad. Si la persona todavía no está en Contactos,
// se la da de alta al escribirla, sin documento, en la misma operación que guarda la lista.
//
// Lo usan el Panel, con la credencial de quien pide, y la aplicación del Cliente, con el trabajo de
// la Prestadora. La base vuelve a comprobar en las dos quién pide, guarda la lista entera de una
// vez y deja el cambio en el registro de actividad. Desde la aplicación, sólo el titular cambia la
// lista, y sólo elige entre las personas de su propio Cliente: cualquier otra la escribe como nueva.

export const MAXIMO_DE_CONTACTOS = 3;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CLAVES_DE_LOS_TEXTOS = [
  'titulo', 'contratante', 'paciente', 'responsable_de_pagos', 'persona_autorizada',
  'error.demasiados', 'error.repetido', 'error.inexistente', 'error.faltan_datos',
  'error.telefono_invalido',
];

const MOTIVOS_DE_LA_BASE = {
  sin_permiso: 'sin_permiso',
  no_encontrado: 'no_encontrado',
  dato_invalido: 'dato_invalido',
  faltan_datos: 'faltan_datos',
  telefono_invalido: 'telefono_invalido',
  demasiados_contactos_de_emergencia: 'demasiados_contactos_de_emergencia',
  contacto_de_emergencia_repetido: 'contacto_de_emergencia_repetido',
  contacto_de_emergencia_inexistente: 'contacto_de_emergencia_inexistente',
};

// El error de la base sale como motivo. El texto crudo queda sólo en el registro del servidor.
export function conMotivo(error) {
  const motivo = MOTIVOS_DE_LA_BASE[error?.message];
  if (motivo) return new ErrorConMotivo(motivo, error.message);
  return new Error(error?.message ?? 'contactos de emergencia');
}

// Los textos viven en la base: llegan en el idioma de quien mira y con los propios de la Prestadora.
function textosDeLosContactos({ idioma, prestadoraId }) {
  const textos = {};
  for (const clave of CLAVES_DE_LOS_TEXTOS) {
    const valor = frase(`contactos_de_emergencia.${clave}`, idioma, {}, prestadoraId);
    const [grupo, nombre] = clave.split('.');
    if (nombre) textos[grupo] = { ...(textos[grupo] ?? {}), [nombre]: valor };
    else textos[clave] = valor;
  }
  return textos;
}

function deLaBase(fila) {
  return {
    prioridad: fila.prioridad,
    personaId: fila.persona_id,
    nombre: fila.nombre,
    telefonos: fila.telefonos ?? [],
    esContratante: Boolean(fila.es_contratante),
    esPaciente: Boolean(fila.es_paciente),
    esResponsableDePagos: Boolean(fila.es_responsable_de_pagos),
    esPersonaAutorizada: Boolean(fila.es_persona_autorizada),
  };
}

/** La lista en orden de prioridad. La base decide si quien pide la puede ver. */
export async function contactosDelCliente({ db, clienteId }) {
  const { data, error } = await db.rpc('contactos_de_emergencia_del_cliente', { p_cliente: clienteId });
  if (error) throw conMotivo(error);
  return (data ?? []).map(deLaBase).sort((a, b) => a.prioridad - b.prioridad);
}

/** Lo que reciben el Panel y la aplicación del Cliente. */
export async function estadoDeLosContactos({ db, clienteId, prestadoraId, idioma }) {
  return {
    contactos: await contactosDelCliente({ db, clienteId }),
    maximo: MAXIMO_DE_CONTACTOS,
    textos: textosDeLosContactos({ idioma, prestadoraId }),
  };
}

/**
 * Las personas del propio Cliente entre las que elige el titular desde su aplicación: el
 * Contratante, los Pacientes, los Responsables de pagos, las Personas autorizadas y los contactos
 * que ya designó. Cualquier otra la escribe como nueva.
 */
export async function personasParaElegir({ db, clienteId }) {
  const { data, error } = await db.rpc('personas_para_contacto_de_emergencia', { p_cliente: clienteId });
  if (error) throw conMotivo(error);
  return (data ?? []).map((fila) => ({
    personaId: fila.persona_id,
    nombre: fila.nombre,
    esContratante: Boolean(fila.es_contratante),
    esPaciente: Boolean(fila.es_paciente),
    esResponsableDePagos: Boolean(fila.es_responsable_de_pagos),
    esPersonaAutorizada: Boolean(fila.es_persona_autorizada),
  }));
}

function textoLimpio(valor) {
  return typeof valor === 'string' && valor.trim() ? valor.trim() : null;
}

/**
 * Lo que llega del pedido, ya revisado, en el formato que recibe la base. Cada contacto, en orden
 * de prioridad, es una persona que ya está en Contactos (`personaId`) o una persona
 * nueva (`nombre`, `apellido` y `telefono`). Falla cerrado: lo que no es ninguna de las dos cosas
 * no pasa.
 */
export function contactosDelPedido(cuerpo) {
  const lista = cuerpo?.contactos;
  if (!Array.isArray(lista)) throw new ErrorConMotivo('dato_invalido');
  if (lista.length > MAXIMO_DE_CONTACTOS) throw new ErrorConMotivo('demasiados_contactos_de_emergencia');

  const revisados = lista.map((contacto) => {
    if (!contacto || typeof contacto !== 'object') throw new ErrorConMotivo('dato_invalido');
    if (contacto.personaId !== undefined && contacto.personaId !== null) {
      if (typeof contacto.personaId !== 'string' || !UUID.test(contacto.personaId)) {
        throw new ErrorConMotivo('dato_invalido');
      }
      return { persona_id: contacto.personaId };
    }
    const nombre = textoLimpio(contacto.nombre);
    const apellido = textoLimpio(contacto.apellido);
    const telefono = telefonoLimpio(contacto.telefono);
    if (!nombre || !apellido || !telefono) throw new ErrorConMotivo('faltan_datos');
    if (!telefonoAceptable(telefono)) throw new ErrorConMotivo('telefono_invalido');
    return { nombre, apellido, telefono };
  });

  const elegidas = revisados.map((c) => c.persona_id).filter(Boolean);
  if (new Set(elegidas).size !== elegidas.length) throw new ErrorConMotivo('contacto_de_emergencia_repetido');
  return revisados;
}

/**
 * Reemplaza la lista entera. `pUsuario` es el titular en nombre de quien trabaja la aplicación del
 * Cliente, y va nulo desde el Panel, donde la base ya sabe quién pide.
 */
export async function reemplazarContactos({ db, clienteId, contactos, pUsuario = null }) {
  const { error } = await db.rpc('reemplazar_contactos_de_emergencia', {
    p_cliente: clienteId,
    p_contactos: contactos,
    p_usuario: pUsuario,
  });
  if (error) throw conMotivo(error);
}

/**
 * Lo que ve el Asistente durante el turno de guardia: por cada Paciente, sus contactos en orden de
 * prioridad, con el nombre y los teléfonos en uso. Nada más: el lugar que ocupa cada persona en el
 * Cliente no le hace falta para llamar.
 */
export async function contactosParaElAsistente({ db, pacientes }) {
  const porCliente = new Map();
  const resultado = {};
  for (const paciente of pacientes ?? []) {
    if (!paciente?.id || !paciente?.cliente_id) continue;
    if (!porCliente.has(paciente.cliente_id)) {
      const contactos = await contactosDelCliente({ db, clienteId: paciente.cliente_id });
      porCliente.set(paciente.cliente_id, contactos.map(({ prioridad, nombre, telefonos }) => ({ prioridad, nombre, telefonos })));
    }
    resultado[paciente.id] = porCliente.get(paciente.cliente_id);
  }
  return resultado;
}
