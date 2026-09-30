import { Router } from 'express';
import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import {
  acotarAUsuariosDelPanel,
  alcanceDelPanel,
  laCuentaDelPanelEstaAlAlcance,
} from '../middleware/alcancePrestadora.js';
import { clienteDelPedido, supabase } from '../db/connection.js';
import { crearCuentaConPerfil, borrarCuenta } from '../utils/cuentasPanel.js';
import { guardarLugaresDe } from '../utils/lugaresDeCadaPersona.js';
import { exigirAdministracion } from '../middleware/exigirAdministracion.js';
import { ROLES_PANEL } from '../utils/roles.js';
import { responderError } from '../utils/errorConMotivo.js';
import { exigirQueElCelularSeaDeUnaSolaPersona } from '../utils/celularDeUnaSolaPersona.js';
import {
  ACCION_ALTA_DE_CUENTA,
  ACCION_BAJA_DE_CUENTA,
  ACCION_CAMBIO_DE_CUENTA,
  camposQueCambiaron,
  registrarActividad,
  yaQuedoRegistrado,
} from '../utils/registroDeActividad.js';

export const panelUsuariosRouter = Router();

// Ver y gestionar otros usuarios del panel es sensible (alta/baja de acceso). Desde acá se
// gestiona la coordinación de la Prestadora y nada más: la cuenta del Administrador y la del
// equipo técnico las hace CeltaTech, no el producto (CLAUDE.md §5). La lista sigue mostrando todas
// las cuentas del Panel, pero sólo las de coordinación se crean, se corrigen y se dan de baja.
const soloAdministracion = exigirAdministracion('Solo Admin o Superadmin puede gestionar usuarios del panel');

// Los roles que se crean, se corrigen y se dan de baja desde acá.
const ROLES_GESTIONABLES = ['coordinador'];

// CON LA CREDENCIAL DE QUIEN PIDE va sólo el alcance de cada cuenta. Las cuentas en sí se leen,
// se corrigen y se dan de baja con la llave maestra: en `usuarios` la base le deja a cada persona
// ver su propia fila y nada más, y desde acá el Administrador trabaja sobre las de los demás.

panelUsuariosRouter.get('/', requiereRolPanel, soloAdministracion, async (req, res) => {
  // Llave maestra: `usuarios` sólo deja ver la propia fila (ver arriba).
  let query = supabase
    .from('usuarios')
    .select('id, rol, nombre, telefono, created_at')
    .in('rol', ROLES_PANEL)
    .order('created_at', { ascending: false });

  query = acotarAUsuariosDelPanel(query, req.usuarioPanel);

  const { data, error } = await query;

  if (error) return responderError(res, error);

  // Hasta dónde llega cada cuenta, en cuántos lugares. La lista muestra el número y no los
  // nombres: doscientas localidades no entran en una celda, y lo que se necesita de un vistazo es
  // si el alcance está puesto o quedó vacío. Los nombres se ven al abrir la cuenta.
  // El alcance se lee con la credencial de quien pide, y la base devuelve sólo el de su
  // Organización: un identificador de cuenta no dice de qué Prestadora es. Sin Organización activa
  // no se pregunta nada, y está bien: ahí las únicas cuentas a la vista son las del soporte técnico
  // de CeltaTech, que no cuelgan de ninguna Prestadora y por eso no tienen ningún lugar asignado.
  const cuentas = data ?? [];
  const { data: cruces, error: errorLugares } = cuentas.length && req.usuarioPanel.prestadoraId
    ? await clienteDelPedido(req)
      .from('usuario_lugares')
      .select('usuario_id')
      .in('usuario_id', cuentas.map((cuenta) => cuenta.id))
    : { data: [], error: null };
  if (errorLugares) return responderError(res, errorLugares);

  const cuantos = new Map();
  for (const cruce of cruces ?? []) {
    cuantos.set(cruce.usuario_id, (cuantos.get(cruce.usuario_id) ?? 0) + 1);
  }

  res.json({ usuarios: cuentas.map((cuenta) => ({ ...cuenta, lugares: cuantos.get(cuenta.id) ?? 0 })) });
});

panelUsuariosRouter.post('/', requiereRolPanel, soloAdministracion, async (req, res) => {
  const { email, nombre, telefono, lugares } = req.body;
  if (!email || !nombre) {
    return res.status(400).json({ error: 'Faltan email o nombre' });
  }

  const rolNuevo = 'coordinador';

  // La cuenta nueva nace SIEMPRE en la Organización activa de quien la crea. Nadie elige el
  // destino a mano: un destino que viniera en el pedido lo falsifica quien llama.
  const prestadoraDestino = req.usuarioPanel.prestadoraId;
  if (!prestadoraDestino) {
    return res.status(400).json({ error: 'Hace falta entrar a una prestadora antes de dar de alta la cuenta' });
  }

  try {
    // Que el celular no esté ya en otra cuenta lo comprueba `crearCuentaConPerfil`, que es por
    // donde pasan todas las altas. Acá no se repite: el rechazo llega igual como motivo.
    const { userId, passwordTemporal } = await crearCuentaConPerfil({
      email, nombre, telefono, rol: rolNuevo,
      prestadoraId: prestadoraDestino,
    });

    // Hasta dónde llega esta cuenta, cuando el alta ya lo dice. Se guarda adentro del mismo pedido
    // porque el alcance es parte de la cuenta: una cuenta creada y un alcance que no se llegó a
    // escribir dejarían a alguien con acceso a algo que nadie decidió. Si la escritura falla, se
    // borra la cuenta recién creada y el alta no ocurrió.
    if (Array.isArray(lugares) && lugares.length > 0) {
      try {
        await guardarLugaresDe('usuario_lugares', 'usuario_id', userId, prestadoraDestino, lugares);
      } catch (error) {
        await borrarCuenta(userId, { prestadoraId: prestadoraDestino });
        throw error;
      }
    }

    // Un alta de cuenta del Panel es un cambio de membresía: alguien que antes no entraba, ahora
    // entra, y con un rol. Se anota el rol, que es una clave opaca; la clave temporal no, que es
    // justamente lo que nunca entra en un registro de auditoría.
    await registrarActividad(req.usuarioPanel, ACCION_ALTA_DE_CUENTA, {
      tablaAfectada: 'usuarios',
      registroId: userId,
      detalle: { rol_nuevo: rolNuevo },
    });

    res.json({ ok: true, id: userId, passwordTemporal });
  } catch (error) {
    responderError(res, error);
  }
});

panelUsuariosRouter.patch('/:id', requiereRolPanel, soloAdministracion, async (req, res) => {
  const { nombre, telefono } = req.body;

  // Lo mismo que en el alta, antes de escribir: un celular es de una sola persona. Se excluye la
  // propia cuenta, porque volver a guardar el número que ya tiene no es repetirlo.
  try {
    await exigirQueElCelularSeaDeUnaSolaPersona({
      telefono,
      prestadoraId: req.usuarioPanel.prestadoraId,
      usuarioId: req.params.id,
    });
  } catch (error) {
    return responderError(res, error);
  }

  // Llave maestra: la base no deja a nadie tocar la fila de `usuarios` de otra cuenta.
  let query = supabase
    .from('usuarios')
    .update({ nombre, telefono })
    .eq('id', req.params.id)
    .in('rol', ROLES_GESTIONABLES);

  query = acotarAUsuariosDelPanel(query, req.usuarioPanel);

  // Sin el .select('id') la base contesta que salió bien aunque no haya tocado ninguna fila, y
  // entonces se le avisa "guardado" a alguien que no guardó nada. Si no volvió ninguna fila, la
  // cuenta no existe o es de otra Prestadora: desde afuera es el mismo caso y se contesta igual,
  // para que la respuesta no permita averiguar qué cuentas tienen las demás Prestadoras.
  const { data: modificada, error } = await query.select('id');

  if (error) return responderError(res, error);
  if (!modificada?.length) {
    return res.status(404).json({ error: 'No se encontró esa cuenta' });
  }

  // Qué cambió son los nombres de las columnas que se tocaron, nunca sus valores: el nombre y el
  // teléfono de una persona son dato de contenido y no entran en un registro de auditoría. Para
  // verlos se mira la cuenta.
  await registrarActividad(req.usuarioPanel, ACCION_CAMBIO_DE_CUENTA, {
    tablaAfectada: 'usuarios',
    registroId: req.params.id,
    camposCambiados: camposQueCambiaron({ nombre, telefono }),
  });

  res.json({ ok: true });
});

panelUsuariosRouter.delete('/:id', requiereRolPanel, soloAdministracion, async (req, res) => {
  if (req.params.id === req.usuarioPanel.id) {
    return res.status(400).json({ error: 'La cuenta propia no se da de baja desde acá' });
  }

  const alcance = alcanceDelPanel(req.usuarioPanel);

  // La consulta nombra la Organización, con la misma regla que la lista: la Organización activa
  // más las cuentas del equipo técnico. La comprobación en memoria de abajo se queda igual —
  // filtrar y preguntar son las dos formas de la misma regla, y las dos hacen falta. Va con la
  // llave maestra porque la base sólo deja ver la propia fila de `usuarios`.
  const { data: usuario } = await acotarAUsuariosDelPanel(
    supabase
      .from('usuarios')
      .select('rol, prestadora_id')
      .eq('id', req.params.id),
    req.usuarioPanel,
  ).maybeSingle();

  // Cuenta que no existe, de otra Prestadora, o de un rol que este solicitante no gestiona:
  // desde afuera son el mismo caso y se contestan igual, para que la respuesta no permita
  // averiguar qué cuentas tienen las demás Prestadoras.
  if (!laCuentaDelPanelEstaAlAlcance(usuario, alcance)
    || !ROLES_GESTIONABLES.includes(usuario.rol)) {
    return res.status(400).json({ error: 'No hay permiso para dar de baja esa cuenta' });
  }

  // La baja la hace la base, adentro de la Prestadora de la cuenta que se acaba de comprobar.
  try {
    await borrarCuenta(req.params.id, { prestadoraId: usuario.prestadora_id });
  } catch (error) {
    return responderError(res, error);
  }

  // Una baja de cuenta es a la vez cambio de membresía y borrado de datos, y se anota con el
  // nombre que más dice de los dos. El renglón queda aunque la cuenta ya no exista: el registro
  // tiene que sobrevivir a lo que registra.
  await registrarActividad(req.usuarioPanel, ACCION_BAJA_DE_CUENTA, {
    tablaAfectada: 'usuarios',
    registroId: req.params.id,
    detalle: { rol_anterior: usuario.rol },
  });
  yaQuedoRegistrado(res);

  res.json({ ok: true });
});
