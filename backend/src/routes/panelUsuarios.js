import { Router } from 'express';
import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import {
  acotarAUsuariosDelPanel,
  alcanceDelPanel,
  laCuentaDelPanelEstaAlAlcance,
} from '../middleware/alcancePrestadora.js';
import { clienteDelPedido, enLaPrestadora } from '../db/connection.js';
import { crearCuentaConPerfil, borrarCuentaDeUnAltaCortada, desactivarCuenta } from '../utils/cuentasPanel.js';
import { guardarLugaresDe } from '../utils/lugaresDeCadaPersona.js';
import { exigirAdministracion, exigirAdminDePrestadora } from '../middleware/exigirAdministracion.js';
import { esIdentificador } from '../utils/intercambioDeFacturacion.js';
import { ROLES_PANEL } from '../utils/roles.js';
import { ErrorConMotivo, responderError } from '../utils/errorConMotivo.js';
import { parteBienEscrita, parteComparable, sufijoDeLaPrestadora } from '../utils/nombreDeUsuario.js';
import { exigirQueElCelularSeaDeUnaSolaPersona } from '../utils/celularDeUnaSolaPersona.js';
import {
  ACCION_ALTA_DE_CUENTA,
  ACCION_DESACTIVACION_DE_CUENTA,
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

// La lista y el alcance de cada cuenta van CON LA CREDENCIAL DE QUIEN PIDE: la base le deja a la
// administración de la Prestadora activa ver las cuentas del Panel de esa Prestadora, y las del
// soporte técnico de CeltaTech no se las muestra nunca. Las cuentas de coordinación se corrigen y
// se dan de baja con el trabajo de la Prestadora activa, que alcanza las cuentas de esa Prestadora
// y ninguna otra.

// Las cuentas que muestra la lista. Las del soporte técnico son de CeltaTech y no aparecen.
const ROLES_DE_LA_LISTA = ROLES_PANEL.filter((rol) => rol !== 'superadmin');

panelUsuariosRouter.get('/', requiereRolPanel, soloAdministracion, async (req, res) => {
  // Sin Organización activa no hay cuentas de ninguna Prestadora que mostrar.
  if (!req.usuarioPanel.prestadoraId) return res.json({ usuarios: [] });

  const { data, error } = await clienteDelPedido(req)
    .from('usuarios')
    .select('id, rol, nombre, telefono, nombre_de_usuario, created_at')
    .in('rol', ROLES_DE_LA_LISTA)
    .eq('prestadora_id', req.usuarioPanel.prestadoraId)
    .is('desactivada_en', null)
    .order('created_at', { ascending: false });

  if (error) return responderError(res, error);

  // Hasta dónde llega cada cuenta, en cuántos lugares. La lista muestra el número y no los
  // nombres: doscientas localidades no entran en una celda, y lo que se necesita de un vistazo es
  // si el alcance está puesto o quedó vacío. Los nombres se ven al abrir la cuenta.
  // La base devuelve sólo el alcance de su Organización: un identificador de cuenta no dice de qué
  // Prestadora es.
  const cuentas = data ?? [];
  const { data: cruces, error: errorLugares } = cuentas.length
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

  // El sufijo va aparte: es el mismo para todas las cuentas de la Prestadora, y el alta lo muestra
  // al lado de la parte que escribe el Administrador.
  const sufijo = await sufijoDeLaPrestadora(req.usuarioPanel.prestadoraId);
  res.json({
    sufijo,
    usuarios: cuentas.map((cuenta) => ({ ...cuenta, lugares: cuantos.get(cuenta.id) ?? 0 })),
  });
});

// LAS CUENTAS DESACTIVADAS. Las ve, las abre y las reactiva el Administrador de la Prestadora y
// nadie más. Este candado es el primero; el segundo es la base, que no le muestra una desactivada a
// nadie más y cuya función de reactivar contesta falso a cualquier otro.
const soloAdminDePrestadora = exigirAdminDePrestadora('Solo el Administrador de la Prestadora ve y reactiva las cuentas desactivadas');

// Una cuenta desactivada se abre por su rol: coordinación o Asistente. La fila de un Asistente en
// `usuarios` no la ve la administración con su sesión, así que esa se lee con el trabajo de la
// Prestadora activa, que alcanza las de esa Prestadora y ninguna otra.
const ROLES_DESACTIVABLES = ['coordinador', 'asistente'];

function rolPedido(req) {
  const rol = req.query?.rol ?? 'coordinador';
  return ROLES_DESACTIVABLES.includes(rol) ? rol : null;
}

function lecturaDeCuentas(req, rol, trabajo, leer) {
  return rol === 'asistente'
    ? enLaPrestadora(req.usuarioPanel.prestadoraId, trabajo, leer)
    : leer(clienteDelPedido(req));
}

// La lista de los Asistentes desactivados la lee el Padrón de la tabla de Asistentes; ésta es la de
// coordinación.
panelUsuariosRouter.get('/desactivadas', requiereRolPanel, soloAdminDePrestadora, async (req, res) => {
  if (!req.usuarioPanel.prestadoraId) return res.json({ usuarios: [] });

  const { data, error } = await clienteDelPedido(req)
    .from('usuarios')
    .select('id, rol, nombre, desactivada_en')
    .in('rol', ROLES_GESTIONABLES)
    .eq('prestadora_id', req.usuarioPanel.prestadoraId)
    .not('desactivada_en', 'is', null)
    .order('desactivada_en', { ascending: false });

  if (error) return responderError(res, error);
  res.json({ usuarios: data ?? [] });
});

// Los datos y el historial de una cuenta desactivada, para leer. El historial son los renglones del
// registro de actividad sobre esa cuenta y los que hizo ella.
const RENGLONES_DEL_HISTORIAL = 200;

panelUsuariosRouter.get('/desactivadas/:id', requiereRolPanel, soloAdminDePrestadora, async (req, res) => {
  const prestadoraId = req.usuarioPanel.prestadoraId;
  const rol = rolPedido(req);
  if (!prestadoraId || !rol || !esIdentificador(req.params.id)) {
    return responderError(res, new ErrorConMotivo('no_encontrado'));
  }

  const db = clienteDelPedido(req);
  const { data: cuenta, error } = await lecturaDeCuentas(req, rol, 'cuenta desactivada', (conexion) => conexion
    .from('usuarios')
    .select('id, rol, nombre, telefono, email, nombre_de_usuario, created_at, desactivada_en, motivo_de_la_desactivacion')
    .eq('id', req.params.id)
    .eq('prestadora_id', prestadoraId)
    .eq('rol', rol)
    .not('desactivada_en', 'is', null)
    .maybeSingle());

  if (error) return responderError(res, error);
  // La que no existe, la activa y la de otra Prestadora se contestan igual.
  if (!cuenta) return responderError(res, new ErrorConMotivo('no_encontrado'));

  const { data: historial, error: errorHistorial } = await db
    .from('registro_actividad')
    .select('id, usuario_id, accion, detalle, created_at, usuarios(nombre)')
    .eq('prestadora_id', prestadoraId)
    .or(`registro_id.eq.${cuenta.id},usuario_id.eq.${cuenta.id}`)
    .order('created_at', { ascending: false })
    .limit(RENGLONES_DEL_HISTORIAL);

  if (errorHistorial) return responderError(res, errorHistorial);
  res.json({ cuenta, historial: historial ?? [] });
});

// Reactivar la hace la base con la sesión de quien la pide: limpia la desactivación, levanta el
// bloqueo de la cuenta de ingreso y deja el renglón en el registro de actividad, todo junto.
const MOTIVOS_DE_LA_REACTIVACION = ['reactivacion_usuario_en_uso', 'reactivacion_correo_en_uso'];

panelUsuariosRouter.post('/:id/reactivar', requiereRolPanel, soloAdminDePrestadora, async (req, res) => {
  if (!req.usuarioPanel.prestadoraId || !esIdentificador(req.params.id)) {
    return responderError(res, new ErrorConMotivo('no_encontrado'));
  }

  const { data: reactivada, error } = await clienteDelPedido(req)
    .rpc('reactivar_la_cuenta', { p_usuario: req.params.id });

  if (error) {
    if (MOTIVOS_DE_LA_REACTIVACION.includes(error.message)) {
      return responderError(res, new ErrorConMotivo(error.message));
    }
    return responderError(res, error);
  }
  if (reactivada !== true) return responderError(res, new ErrorConMotivo('no_encontrado'));

  yaQuedoRegistrado(res);
  res.json({ ok: true });
});

panelUsuariosRouter.post('/', requiereRolPanel, soloAdministracion, async (req, res) => {
  const { email, nombre, telefono, lugares, usuario } = req.body;
  const parte = parteComparable(usuario);
  if (!email || !nombre || !parte) {
    return responderError(res, new ErrorConMotivo('faltan_datos'));
  }
  if (!parteBienEscrita(parte)) {
    return responderError(res, new ErrorConMotivo('usuario_mal_escrito'));
  }

  const rolNuevo = 'coordinador';

  // La cuenta nueva nace SIEMPRE en la Organización activa de quien la crea. Nadie elige el
  // destino a mano: un destino que viniera en el pedido lo falsifica quien llama.
  const prestadoraDestino = req.usuarioPanel.prestadoraId;
  if (!prestadoraDestino) {
    return responderError(res, new ErrorConMotivo('sin_permiso'), 403);
  }

  try {
    // Sin código de la Prestadora la cuenta no tendría nombre completo con el que entrar.
    const sufijo = await sufijoDeLaPrestadora(prestadoraDestino);
    if (!sufijo) throw new Error('panelUsuarios: la Prestadora no tiene código');

    // Que el celular no esté ya en otra cuenta lo comprueba `crearCuentaConPerfil`, que es por
    // donde pasan todas las altas. Acá no se repite: el rechazo llega igual como motivo.
    const { userId, passwordTemporal } = await crearCuentaConPerfil({
      email, nombre, telefono, rol: rolNuevo,
      prestadoraId: prestadoraDestino,
      nombreDeUsuario: parte,
    });

    // Hasta dónde llega esta cuenta, cuando el alta ya lo dice. Se guarda adentro del mismo pedido
    // porque el alcance es parte de la cuenta: una cuenta creada y un alcance que no se llegó a
    // escribir dejarían a alguien con acceso a algo que nadie decidió. Si la escritura falla, se
    // deshace el alta: la cuenta recién creada se borra y el alta no ocurrió.
    if (Array.isArray(lugares) && lugares.length > 0) {
      try {
        // Con la credencial de quien da el alta: la administración escribe los lugares de su gente.
        await guardarLugaresDe(clienteDelPedido(req), 'usuario_lugares', 'usuario_id', userId, prestadoraDestino, lugares);
      } catch (error) {
        await borrarCuentaDeUnAltaCortada(userId, { prestadoraId: prestadoraDestino });
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

    res.json({ ok: true, id: userId, passwordTemporal, usuario: `${parte}${sufijo}` });
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

  // Con el trabajo de la Prestadora activa: la base no deja a nadie tocar la fila de `usuarios` de
  // otra cuenta. Sin Prestadora activa no hay cuenta de coordinación que corregir.
  //
  // Sin el .select('id') la base contesta que salió bien aunque no haya tocado ninguna fila, y
  // entonces se le avisa "guardado" a alguien que no guardó nada. Si no volvió ninguna fila, la
  // cuenta no existe o es de otra Prestadora: desde afuera es el mismo caso y se contesta igual,
  // para que la respuesta no permita averiguar qué cuentas tienen las demás Prestadoras.
  const prestadoraId = req.usuarioPanel.prestadoraId;
  const { data: modificada, error } = prestadoraId
    ? await enLaPrestadora(prestadoraId, 'Corregir una cuenta del Panel', (db) => acotarAUsuariosDelPanel(
      db
        .from('usuarios')
        .update({ nombre, telefono })
        .eq('id', req.params.id)
        .in('rol', ROLES_GESTIONABLES),
      req.usuarioPanel,
    ).select('id'))
    : { data: [], error: null };

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

  // La consulta nombra la Organización, con la misma regla que la lista. La comprobación en
  // memoria de abajo se queda igual — filtrar y preguntar son las dos formas de la misma regla, y
  // las dos hacen falta. Va con el trabajo de la Prestadora activa porque la base sólo deja ver la
  // propia fila de `usuarios`; las cuentas del equipo técnico no le quedan a la vista, y no hace
  // falta: no se dan de baja desde acá.
  const { data: usuario } = alcance.prestadoraId
    ? await enLaPrestadora(alcance.prestadoraId, 'Cuenta del Panel a dar de baja', (db) => acotarAUsuariosDelPanel(
      db
        .from('usuarios')
        .select('rol, prestadora_id')
        .eq('id', req.params.id),
      req.usuarioPanel,
    ).maybeSingle())
    : { data: null };

  // Cuenta que no existe, de otra Prestadora, o de un rol que este solicitante no gestiona:
  // desde afuera son el mismo caso y se contestan igual, para que la respuesta no permita
  // averiguar qué cuentas tienen las demás Prestadoras.
  if (!laCuentaDelPanelEstaAlAlcance(usuario, alcance)
    || !ROLES_GESTIONABLES.includes(usuario.rol)) {
    return res.status(400).json({ error: 'No hay permiso para dar de baja esa cuenta' });
  }

  // La baja desactiva la cuenta, que no se borra: queda con su historia y sin poder entrar. La hace
  // la base, adentro de la Prestadora de la cuenta que se acaba de comprobar, y guarda el motivo.
  try {
    await desactivarCuenta(req.params.id, { prestadoraId: usuario.prestadora_id, motivo: req.body?.motivo });
  } catch (error) {
    return responderError(res, error);
  }

  // Es un cambio de membresía. El motivo no entra en el registro: es contenido, y queda en la cuenta.
  await registrarActividad(req.usuarioPanel, ACCION_DESACTIVACION_DE_CUENTA, {
    tablaAfectada: 'usuarios',
    registroId: req.params.id,
    detalle: { rol_anterior: usuario.rol },
  });
  yaQuedoRegistrado(res);

  res.json({ ok: true });
});

// DESACTIVAR LA CUENTA DE UN ASISTENTE, desde su Legajo. El Legajo no se borra: la cuenta deja de
// entrar y el Asistente deja de aparecer para elegirlo. Se nombra al Asistente, y la cuenta se busca
// adentro de la Prestadora activa: uno de otra Prestadora o sin cuenta se contesta igual que uno que
// no existe. Con turnos sin terminar no se desactiva, y la respuesta dice cuáles son.
panelUsuariosRouter.post('/asistentes/:asistenteId/desactivar', requiereRolPanel, soloAdministracion, async (req, res) => {
  const prestadoraId = req.usuarioPanel.prestadoraId;
  if (!prestadoraId || !esIdentificador(req.params.asistenteId)) {
    return responderError(res, new ErrorConMotivo('no_encontrado'));
  }

  const { data: asistente, error } = await enLaPrestadora(prestadoraId, 'Asistente a desactivar', (db) => db
    .from('asistentes')
    .select('usuario_id')
    .eq('id', req.params.asistenteId)
    .eq('prestadora_id', prestadoraId)
    .maybeSingle());
  if (error) return responderError(res, error);
  if (!asistente?.usuario_id) return responderError(res, new ErrorConMotivo('no_encontrado'));

  try {
    await desactivarCuenta(asistente.usuario_id, { prestadoraId, motivo: req.body?.motivo });
  } catch (fallo) {
    return responderError(res, fallo);
  }

  await registrarActividad(req.usuarioPanel, ACCION_DESACTIVACION_DE_CUENTA, {
    tablaAfectada: 'usuarios',
    registroId: asistente.usuario_id,
    detalle: { rol_anterior: 'asistente' },
  });
  yaQuedoRegistrado(res);

  res.json({ ok: true });
});
