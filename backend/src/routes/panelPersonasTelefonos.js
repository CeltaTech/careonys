import { Router } from 'express';
import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import { acotarAPrestadora, exigirOrganizacionActiva } from '../middleware/alcancePrestadora.js';
import { requierePermiso } from '../utils/permisos.js';
import { clienteDelPedido, supabase } from '../db/connection.js';
import { responderError } from '../utils/errorConMotivo.js';
import { conElPreferidoMarcado, telefonoLimpio } from '../utils/telefonosDeLaPersona.js';

// Los teléfonos de contacto de una Ficha del Directorio de Personas.
//
// QUÉ RESUELVE. La Ficha guardaba un teléfono solo. Un Cliente tiene el fijo de la casa y los
// celulares de los dos o tres que atienden. Ahora se cargan todos, y todos quedan habilitados.
//
// SE PUEDEN REPETIR. Dos hermanos que viven juntos dan el mismo número, y acá no hay nada que lo
// impida ni que lo avise: un teléfono del Directorio es un dato de contacto, no una llave para
// entrar. La regla del celular único es de las cuentas y no llega hasta acá.
//
// CUÁL ES EL PREFERIDO NO SE GUARDA: se deduce comparando contra el teléfono de la cuenta de esa
// Persona, y se deduce en un solo lugar (`utils/telefonosDeLaPersona.js`).
//
// EL NÚMERO NO VIAJA EN NINGUNA DIRECCIÓN. Entra y sale en el cuerpo del pedido, nunca en la
// dirección ni en un parámetro, y no se escribe en ningún registro ni en ningún mensaje de error:
// es dato sensible (`celtatech/docs/REGLAS_PRODUCTOS_CAREONYS.md` §4). Por eso corregir un teléfono
// es un pedido con cuerpo y no una dirección con el número adentro.
//
// LEER VA CON LA CREDENCIAL DE QUIEN PIDE. Las dos lecturas entran a la base con
// `clienteDelPedido(req)`, no con la llave maestra: la base sabe quién pide y le contesta sólo lo de
// su Prestadora, y sólo si tiene el permiso de ver el Directorio de Personas. Por eso esas
// consultas no llevan el filtro de la Prestadora de la sesión.
//
// EL PREFERIDO SE RESUELVE CON LA LLAVE MAESTRA. Hay que mirar el teléfono de las cuentas de la
// Prestadora, y la política de `usuarios` sólo le deja ver a cada persona su propia fila.
//
// ESCRIBIR SIGUE CON LA LLAVE MAESTRA, con la Prestadora de la sesión puesta por este código con
// `acotarAPrestadora` y nunca un valor que venga en el pedido (ver el comentario de cada consulta).
//
// La Ficha se comprueba primero: quien pide una de otra Prestadora recibe lo mismo que quien pide
// una que no existe.

export const panelPersonasTelefonosRouter = Router();

const COLUMNAS = 'id, persona_id, telefono, fuera_de_uso_at, created_at, updated_at';

const veLasPersonas = requierePermiso('ver_personas');
const escribeLasPersonas = requierePermiso('editar_personas');

/** La Ficha, si la base la deja ver a quien pide. Si no, nada, y desde afuera se ve igual. */
async function personaVisible(db, personaId) {
  if (!personaId) return null;
  const { data } = await db.from('personas').select('id, prestadora_id').eq('id', personaId).maybeSingle();
  return data ?? null;
}

/** La Ficha, si es de la Organización de esta sesión. Si no, nada, y desde afuera se ve igual.
    La usan las escrituras, que siguen con la llave maestra (ver el encabezado). */
async function personaDeLaPrestadora(personaId, usuarioPanel) {
  if (!personaId) return null;
  // Con la llave maestra: las políticas de escritura (`los_telefonos_los_carga_quien_puede`,
  // `los_telefonos_los_corrige_quien_puede`, `los_telefonos_los_saca_quien_puede`) piden
  // `editar_personas`, pero la Ficha (`personas_las_lee_su_organizacion`) y el renglón que la
  // escritura devuelve (`los_telefonos_los_lee_su_organizacion`) piden además `ver_personas`. Son
  // dos permisos que cada Prestadora configura por separado, y un Coordinador con el primero y
  // sin el segundo recibiría 404. Si escribir exige también ver se decide aparte.
  let query = supabase.from('personas').select('id, prestadora_id').eq('id', personaId);
  query = acotarAPrestadora(query, usuarioPanel);
  const { data } = await query.maybeSingle();
  return data ?? null;
}

function noEncontrado(res) {
  return res.status(404).json({ error: 'persona_no_encontrada', motivo: 'persona_no_encontrada' });
}

// Todos los teléfonos del Directorio de esta Organización, de una sola vez. La pantalla muestra una
// lista de Fichas y cada una con los suyos: pedirlos Ficha por Ficha sería un pedido por renglón.
panelPersonasTelefonosRouter.get(
  '/',
  requiereRolPanel,
  exigirOrganizacionActiva,
  veLasPersonas,
  async (req, res) => {
    const db = clienteDelPedido(req);
    const { data, error } = await db.from('telefonos_de_la_persona').select(COLUMNAS).order('created_at');
    if (error) return responderError(res, error);

    res.json({ telefonos: await conElPreferidoMarcado(supabase, data ?? [], req.usuarioPanel.prestadoraId) });
  },
);

// Los de una Ficha sola, para cuando se está mirando ésa.
panelPersonasTelefonosRouter.get(
  '/:personaId',
  requiereRolPanel,
  exigirOrganizacionActiva,
  veLasPersonas,
  async (req, res) => {
    const db = clienteDelPedido(req);
    const persona = await personaVisible(db, req.params.personaId);
    if (!persona) return noEncontrado(res);

    const { data, error } = await db
      .from('telefonos_de_la_persona')
      .select(COLUMNAS)
      .eq('persona_id', persona.id)
      .order('created_at');
    if (error) return responderError(res, error);

    res.json({ telefonos: await conElPreferidoMarcado(supabase, data ?? [], persona.prestadora_id) });
  },
);

// Cargar uno más.
panelPersonasTelefonosRouter.post(
  '/:personaId',
  requiereRolPanel,
  exigirOrganizacionActiva,
  escribeLasPersonas,
  async (req, res) => {
    const telefono = telefonoLimpio(req.body?.telefono);
    if (!telefono) return res.status(400).json({ error: 'faltan_datos', motivo: 'faltan_datos' });

    const persona = await personaDeLaPrestadora(req.params.personaId, req.usuarioPanel);
    if (!persona) return noEncontrado(res);

    // Acá no se comprueba si el número ya está cargado en otra Ficha, y es a propósito: se puede
    // repetir. Ver el encabezado.
    // Con la llave maestra: las políticas de escritura (`los_telefonos_los_carga_quien_puede`,
    // `los_telefonos_los_corrige_quien_puede`, `los_telefonos_los_saca_quien_puede`) piden
    // `editar_personas`, pero la Ficha (`personas_las_lee_su_organizacion`) y el renglón que la
    // escritura devuelve (`los_telefonos_los_lee_su_organizacion`) piden además `ver_personas`. Son
    // dos permisos que cada Prestadora configura por separado, y un Coordinador con el primero y
    // sin el segundo recibiría 404. Si escribir exige también ver se decide aparte.
    const { data, error } = await supabase
      .from('telefonos_de_la_persona')
      .insert({ prestadora_id: persona.prestadora_id, persona_id: persona.id, telefono })
      .select(COLUMNAS)
      .single();
    if (error) return responderError(res, error);

    const [conPreferido] = await conElPreferidoMarcado(supabase, [data], persona.prestadora_id);
    res.json({ ok: true, telefono: conPreferido });
  },
);

// Corregir uno que ya está.
panelPersonasTelefonosRouter.patch(
  '/:personaId/:telefonoId',
  requiereRolPanel,
  exigirOrganizacionActiva,
  escribeLasPersonas,
  async (req, res) => {
    const telefono = telefonoLimpio(req.body?.telefono);
    if (!telefono) return res.status(400).json({ error: 'faltan_datos', motivo: 'faltan_datos' });

    const persona = await personaDeLaPrestadora(req.params.personaId, req.usuarioPanel);
    if (!persona) return noEncontrado(res);

    // Los tres filtros van juntos. El de la Organización es el que impide corregir el teléfono de
    // una Ficha ajena aunque alguien conozca su identificador.
    // Con la llave maestra: las políticas de escritura (`los_telefonos_los_carga_quien_puede`,
    // `los_telefonos_los_corrige_quien_puede`, `los_telefonos_los_saca_quien_puede`) piden
    // `editar_personas`, pero la Ficha (`personas_las_lee_su_organizacion`) y el renglón que la
    // escritura devuelve (`los_telefonos_los_lee_su_organizacion`) piden además `ver_personas`. Son
    // dos permisos que cada Prestadora configura por separado, y un Coordinador con el primero y
    // sin el segundo recibiría 404. Si escribir exige también ver se decide aparte.
    const { data, error } = await supabase
      .from('telefonos_de_la_persona')
      .update({ telefono, updated_at: new Date().toISOString() })
      .eq('id', req.params.telefonoId)
      .eq('prestadora_id', persona.prestadora_id)
      .eq('persona_id', persona.id)
      .select(COLUMNAS)
      .maybeSingle();
    if (error) return responderError(res, error);
    if (!data) {
      return res.status(404).json({ error: 'telefono_no_encontrado', motivo: 'telefono_no_encontrado' });
    }

    const [conPreferido] = await conElPreferidoMarcado(supabase, [data], persona.prestadora_id);
    res.json({ ok: true, telefono: conPreferido });
  },
);

// Ponerlo fuera de uso, o restaurarlo. Que no atiendan no prueba que el número esté mal: queda en la
// Ficha, deja de ser el preferido y se lo puede restaurar.
function marcarElUso(fueraDeUso) {
  return async (req, res) => {
    const persona = await personaDeLaPrestadora(req.params.personaId, req.usuarioPanel);
    if (!persona) return noEncontrado(res);

    // Con la llave maestra, por lo mismo que corregir (ver el comentario de esa consulta).
    const ahora = new Date().toISOString();
    const { data, error } = await supabase
      .from('telefonos_de_la_persona')
      .update({ fuera_de_uso_at: fueraDeUso ? ahora : null, updated_at: ahora })
      .eq('id', req.params.telefonoId)
      .eq('prestadora_id', persona.prestadora_id)
      .eq('persona_id', persona.id)
      .select(COLUMNAS)
      .maybeSingle();
    if (error) return responderError(res, error);
    if (!data) {
      return res.status(404).json({ error: 'telefono_no_encontrado', motivo: 'telefono_no_encontrado' });
    }

    const [conPreferido] = await conElPreferidoMarcado(supabase, [data], persona.prestadora_id);
    res.json({ ok: true, telefono: conPreferido });
  };
}

panelPersonasTelefonosRouter.post(
  '/:personaId/:telefonoId/fuera-de-uso',
  requiereRolPanel,
  exigirOrganizacionActiva,
  escribeLasPersonas,
  marcarElUso(true),
);

panelPersonasTelefonosRouter.post(
  '/:personaId/:telefonoId/restaurar',
  requiereRolPanel,
  exigirOrganizacionActiva,
  escribeLasPersonas,
  marcarElUso(false),
);

// Borrar uno. La Ficha no se borra nunca. Un teléfono sí, a mano y sólo cuando hay certeza de que
// el número está mal; el que no atiende queda fuera de uso.
panelPersonasTelefonosRouter.delete(
  '/:personaId/:telefonoId',
  requiereRolPanel,
  exigirOrganizacionActiva,
  escribeLasPersonas,
  async (req, res) => {
    const persona = await personaDeLaPrestadora(req.params.personaId, req.usuarioPanel);
    if (!persona) return noEncontrado(res);

    // Con la llave maestra: las políticas de escritura (`los_telefonos_los_carga_quien_puede`,
    // `los_telefonos_los_corrige_quien_puede`, `los_telefonos_los_saca_quien_puede`) piden
    // `editar_personas`, pero la Ficha (`personas_las_lee_su_organizacion`) y el renglón que la
    // escritura devuelve (`los_telefonos_los_lee_su_organizacion`) piden además `ver_personas`. Son
    // dos permisos que cada Prestadora configura por separado, y un Coordinador con el primero y
    // sin el segundo recibiría 404. Si escribir exige también ver se decide aparte.
    const { data, error } = await supabase
      .from('telefonos_de_la_persona')
      .delete()
      .eq('id', req.params.telefonoId)
      .eq('prestadora_id', persona.prestadora_id)
      .eq('persona_id', persona.id)
      .select('id')
      .maybeSingle();
    if (error) return responderError(res, error);
    if (!data) {
      return res.status(404).json({ error: 'telefono_no_encontrado', motivo: 'telefono_no_encontrado' });
    }

    res.json({ ok: true });
  },
);
