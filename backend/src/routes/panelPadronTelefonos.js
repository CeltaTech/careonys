import { Router } from 'express';
import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import { acotarAPrestadora, exigirOrganizacionActiva } from '../middleware/alcancePrestadora.js';
import { requierePermiso } from '../utils/permisos.js';
import { supabase } from '../db/connection.js';
import { responderError } from '../utils/errorConMotivo.js';
import { conElPreferidoMarcado, telefonoLimpio } from '../utils/telefonosDelLegajo.js';

// Los teléfonos de contacto de una ficha del Padrón.
//
// QUÉ RESUELVE. La ficha guardaba un teléfono solo. Una Familia tiene el fijo de la casa y los
// celulares de los dos o tres que atienden; un Asistente tiene el suyo y el de la casa. Ahora se
// cargan todos, y todos quedan habilitados.
//
// SE PUEDEN REPETIR. Dos hermanos que viven juntos dan el mismo número, y acá no hay nada que lo
// impida ni que lo avise: un teléfono del Padrón es un dato de contacto, no una llave para entrar.
// La regla del celular único es de las cuentas y no llega hasta acá.
//
// CUÁL ES EL PREFERIDO NO SE GUARDA: se deduce comparando contra el teléfono de la cuenta de esa
// Persona, y se deduce en un solo lugar (`utils/telefonosDelLegajo.js`).
//
// EL NÚMERO NO VIAJA EN NINGUNA DIRECCIÓN. Entra y sale en el cuerpo del pedido, nunca en la
// dirección ni en un parámetro, y no se escribe en ningún registro ni en ningún mensaje de error:
// es dato sensible (`celtatech/docs/REGLAS_PRODUCTOS_CAREONYS.md` §4). Por eso corregir un teléfono
// es un pedido con cuerpo y no una dirección con el número adentro.
//
// LA ORGANIZACIÓN SALE SIEMPRE DE LA SESIÓN. El motor entra a la base con la llave de servicio, que
// se saltea las reglas de acceso, así que el filtro lo pone este código con `acotarAPrestadora` y
// nunca un valor que venga en el pedido. El Legajo se comprueba primero: quien pide uno de otra
// Prestadora recibe lo mismo que quien pide uno que no existe.

export const panelPadronTelefonosRouter = Router();

const COLUMNAS = 'id, legajo_id, telefono, created_at, updated_at';

const veElPadron = requierePermiso('ver_padron');
const escribeElPadron = requierePermiso('editar_padron');

/** La ficha, si es de la Organización de esta sesión. Si no, nada, y desde afuera se ve igual. */
async function legajoDeLaPrestadora(legajoId, usuarioPanel) {
  if (!legajoId) return null;
  let query = supabase.from('legajos').select('id, prestadora_id').eq('id', legajoId);
  query = acotarAPrestadora(query, usuarioPanel);
  const { data } = await query.maybeSingle();
  return data ?? null;
}

function noEncontrado(res) {
  return res.status(404).json({ error: 'legajo_no_encontrado', motivo: 'legajo_no_encontrado' });
}

// Todos los teléfonos del Padrón de esta Organización, de una sola vez. La pantalla muestra una
// lista de fichas y cada una con los suyos: pedirlos ficha por ficha sería un pedido por renglón.
panelPadronTelefonosRouter.get(
  '/',
  requiereRolPanel,
  exigirOrganizacionActiva,
  veElPadron,
  async (req, res) => {
    let query = supabase.from('telefonos_del_legajo').select(COLUMNAS).order('created_at');
    query = acotarAPrestadora(query, req.usuarioPanel);
    const { data, error } = await query;
    if (error) return responderError(res, error);

    res.json({ telefonos: await conElPreferidoMarcado(data ?? [], req.usuarioPanel.prestadoraId) });
  },
);

// Los de una ficha sola, para cuando se está mirando esa.
panelPadronTelefonosRouter.get(
  '/:legajoId',
  requiereRolPanel,
  exigirOrganizacionActiva,
  veElPadron,
  async (req, res) => {
    const legajo = await legajoDeLaPrestadora(req.params.legajoId, req.usuarioPanel);
    if (!legajo) return noEncontrado(res);

    const { data, error } = await supabase
      .from('telefonos_del_legajo')
      .select(COLUMNAS)
      .eq('prestadora_id', legajo.prestadora_id)
      .eq('legajo_id', legajo.id)
      .order('created_at');
    if (error) return responderError(res, error);

    res.json({ telefonos: await conElPreferidoMarcado(data ?? [], legajo.prestadora_id) });
  },
);

// Cargar uno más.
panelPadronTelefonosRouter.post(
  '/:legajoId',
  requiereRolPanel,
  exigirOrganizacionActiva,
  escribeElPadron,
  async (req, res) => {
    const telefono = telefonoLimpio(req.body?.telefono);
    if (!telefono) return res.status(400).json({ error: 'faltan_datos', motivo: 'faltan_datos' });

    const legajo = await legajoDeLaPrestadora(req.params.legajoId, req.usuarioPanel);
    if (!legajo) return noEncontrado(res);

    // Acá no se comprueba si el número ya está cargado en otra ficha, y es a propósito: se puede
    // repetir. Ver el encabezado.
    const { data, error } = await supabase
      .from('telefonos_del_legajo')
      .insert({ prestadora_id: legajo.prestadora_id, legajo_id: legajo.id, telefono })
      .select(COLUMNAS)
      .single();
    if (error) return responderError(res, error);

    const [conPreferido] = await conElPreferidoMarcado([data], legajo.prestadora_id);
    res.json({ ok: true, telefono: conPreferido });
  },
);

// Corregir uno que ya está.
panelPadronTelefonosRouter.patch(
  '/:legajoId/:telefonoId',
  requiereRolPanel,
  exigirOrganizacionActiva,
  escribeElPadron,
  async (req, res) => {
    const telefono = telefonoLimpio(req.body?.telefono);
    if (!telefono) return res.status(400).json({ error: 'faltan_datos', motivo: 'faltan_datos' });

    const legajo = await legajoDeLaPrestadora(req.params.legajoId, req.usuarioPanel);
    if (!legajo) return noEncontrado(res);

    // Los tres filtros van juntos. El de la Organización es el que impide corregir el teléfono de
    // una ficha ajena aunque alguien conozca su identificador.
    const { data, error } = await supabase
      .from('telefonos_del_legajo')
      .update({ telefono, updated_at: new Date().toISOString() })
      .eq('id', req.params.telefonoId)
      .eq('prestadora_id', legajo.prestadora_id)
      .eq('legajo_id', legajo.id)
      .select(COLUMNAS)
      .maybeSingle();
    if (error) return responderError(res, error);
    if (!data) {
      return res.status(404).json({ error: 'telefono_no_encontrado', motivo: 'telefono_no_encontrado' });
    }

    const [conPreferido] = await conElPreferidoMarcado([data], legajo.prestadora_id);
    res.json({ ok: true, telefono: conPreferido });
  },
);

// Sacar uno. El Legajo no se borra nunca; un teléfono al que ya no atiende nadie sí, porque dejarlo
// puesto hace que alguien lo llame.
panelPadronTelefonosRouter.delete(
  '/:legajoId/:telefonoId',
  requiereRolPanel,
  exigirOrganizacionActiva,
  escribeElPadron,
  async (req, res) => {
    const legajo = await legajoDeLaPrestadora(req.params.legajoId, req.usuarioPanel);
    if (!legajo) return noEncontrado(res);

    const { data, error } = await supabase
      .from('telefonos_del_legajo')
      .delete()
      .eq('id', req.params.telefonoId)
      .eq('prestadora_id', legajo.prestadora_id)
      .eq('legajo_id', legajo.id)
      .select('id')
      .maybeSingle();
    if (error) return responderError(res, error);
    if (!data) {
      return res.status(404).json({ error: 'telefono_no_encontrado', motivo: 'telefono_no_encontrado' });
    }

    res.json({ ok: true });
  },
);
