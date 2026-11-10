import { Router } from 'express';
import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import { enLaPrestadora, clienteDelPedido } from '../db/connection.js';
import { esAdminOSuperior } from '../utils/roles.js';
import { responderError } from '../utils/errorConMotivo.js';

// Ítem G del pendiente #30 — lectura del registro de auditoría de los permisos de acceso
// técnico (tabla auditoria_de_accesos) y del registro de actividad de la Prestadora.
//
// Los dos se leen con la credencial del trabajo de la Prestadora sobre la que la persona está
// parada, y la base los acota a ella. No con la credencial de la persona: cada renglón trae de
// `usuarios` el nombre de quien hizo cada cosa, y ahí cada persona lee sólo su propia fila
// (`usuario_ve_su_propia_fila`), así que el registro saldría sin nombres.
export const panelAuditoriaRouter = Router();

panelAuditoriaRouter.get('/', requiereRolPanel, async (req, res) => {
  const { rol, prestadoraId } = req.usuarioPanel;

  if (!esAdminOSuperior(rol)) {
    return res.status(403).json({ error: 'Sin permiso para ver el registro de auditoría' });
  }

  // POR QUÉ ESTE ES EL ALCANCE, Y NO EL REGISTRO ENTERO.
  //
  // Hasta el 2026-09-08 esta ruta le entregaba al Superadmin el registro de todas las
  // Prestadoras, y la base decía otra cosa: la política
  // `superadmin_lee_auditoria_de_su_permiso_vigente` compara
  // `prestadora_id` contra `interno.prestadora_actual()`, o sea que sólo deja leer el registro de
  // la Prestadora donde haya un permiso de acceso abierto. Los dos lados decían cosas
  // distintas; era el pendiente #158. **Manda el alcance de la base** (Desarrollador,
  // 2026-09-08), y este filtro es el que lo hace cumplir de este lado.
  //
  // El motivo, que es el que importa y no la coincidencia entre los dos lados:
  //
  //   · `CLAUDE.md` §5 dice que fuera de un permiso de acceso el Superadmin no llega a datos
  //     de ninguna Prestadora real: sólo alcanza la Organización ficticia de pruebas (Sandbox).
  //     Un registro de auditoría no es una excepción a esa regla.
  //   · El campo `detalle` de cada fila puede traer datos de la Prestadora adentro —qué ruta se
  //     tocó, sobre qué tabla, sobre qué fila—, así que entregar el registro entero es entregar
  //     esos datos de todas las Prestadoras a la vez.
  //   · Para mirar el registro de otra Prestadora el camino es abrir un permiso de acceso sobre
  //     esa otra: de a una por vez y dejando constancia, que es exactamente la puerta única que
  //     define `CLAUDE.md` §6. No hay ningún mecanismo para ver varias a la vez y no se
  //     construye ninguno.
  //
  // Por eso el filtro es uno solo y vale para todo rol: la Prestadora sobre la que la persona
  // está parada, y ninguna otra. `prestadoraId` sale de `requiereRolPanel`, que resuelve la
  // precedencia —permiso de acceso primero, Organización propia después— con el mismo orden que
  // la función SQL `prestadora_actual()`, que es el punto único de verdad. Para el
  // Admin_prestadora eso es siempre la suya, igual que la política
  // `admin_prestadora_lee_auditoria_de_su_prestadora`.
  //
  // Falla cerrado: si no se pudo resolver ninguna Prestadora no se entrega nada (§5).
  if (!prestadoraId) {
    return res.status(403).json({ error: 'Sin prestadora asociada' });
  }

  const { data, error } = await enLaPrestadora(prestadoraId, 'registro de auditoría', (db) => db
    .from('auditoria_de_accesos')
    .select('id, admin_id, prestadora_id, tipo_evento, tabla_afectada, operacion, registro_id, detalle, created_at, usuarios(nombre), prestadoras(nombre_fantasia)')
    .eq('prestadora_id', prestadoraId)
    .order('created_at', { ascending: false })
    .limit(500));

  if (error) return responderError(res, error);
  res.json({ eventos: data });
});

// El registro de lo que hace la gente de la Prestadora, que es la otra pregunta y por eso es la
// otra tabla: aquella contesta qué hizo CeltaTech adentro de una Prestadora ajena, y ésta qué
// hizo la Prestadora en su propia Organización. Aquélla es `auditoria_de_accesos` y ésta,
// `registro_actividad`.
//
// El alcance es el mismo de siempre y por el mismo motivo: la Prestadora sobre la que la persona
// está parada, y ninguna otra. `prestadoraId` sale de `requiereRolPanel`, que resuelve la
// precedencia con el mismo orden que `interno.prestadora_actual()`. Falla cerrado: sin Prestadora
// resuelta no se entrega nada.
//
// Lo lee administración y nadie más. El registro dice qué hizo cada uno, y eso no es información
// de quien coordina turnos. Es el mismo alcance que la política
// `administracion_lee_el_registro_de_actividad` de la base.
panelAuditoriaRouter.get('/actividad', requiereRolPanel, async (req, res) => {
  const { rol, prestadoraId } = req.usuarioPanel;

  if (!esAdminOSuperior(rol)) {
    return res.status(403).json({ error: 'Sin permiso para ver el registro de actividad' });
  }
  if (!prestadoraId) {
    return res.status(403).json({ error: 'Sin prestadora asociada' });
  }

  const { data, error } = await enLaPrestadora(prestadoraId, 'registro de actividad', (db) => db
    .from('registro_actividad')
    .select('id, usuario_id, accion, tabla_afectada, registro_id, campos_cambiados, detalle, created_at, usuarios(nombre)')
    .eq('prestadora_id', prestadoraId)
    .order('created_at', { ascending: false })
    .limit(500));

  if (error) return responderError(res, error);
  res.json({ actividad: data });
});

// Por dónde llegó cada lectura, dicho por la parte del producto y no por la ruta interna.
export function lugarDelOrigen(origen) {
  const ruta = String(origen ?? '').split(' ').pop();
  if (ruta.startsWith('/api/panel/')) return 'panel';
  if (ruta.startsWith('/api/app-asistentes/')) return 'aplicacion_asistentes';
  if (ruta.startsWith('/api/app-clientes/')) return 'aplicacion_clientes';
  return 'sistema';
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Quién vio la información de salud de los Pacientes de un Cliente: lo que se muestra en su Ficha y
// lo que se le entrega a él cuando lo pide.
//
// El registro se lee con la sesión de quien pide: la base sólo se lo deja leer a la administración
// de su propia Prestadora (`lo_lee_la_administracion_de_la_prestadora`), y los Pacientes del Cliente
// salen de la misma sesión, así que un Cliente de otra Prestadora no trae ninguno. Los nombres de
// quienes leyeron salen con el trabajo de esa misma Prestadora, por el mismo motivo que el registro
// de actividad: con la sesión, cada persona ve sólo su propia cuenta.
panelAuditoriaRouter.get('/accesos-a-la-informacion-de-salud/:clienteId', requiereRolPanel, async (req, res) => {
  const { rol, prestadoraId } = req.usuarioPanel;
  if (!esAdminOSuperior(rol)) {
    return res.status(403).json({ error: 'sin_permiso', motivo: 'sin_permiso' });
  }
  if (!prestadoraId) {
    return res.status(403).json({ error: 'sin_permiso', motivo: 'sin_permiso' });
  }
  const { clienteId } = req.params;
  if (!UUID.test(clienteId)) {
    return res.status(400).json({ error: 'faltan_datos', motivo: 'faltan_datos' });
  }

  const db = clienteDelPedido(req);
  const { data: pacientes, error: errorPacientes } = await db
    .from('pacientes')
    .select('id, persona:personas!pacientes_persona_de_la_misma_prestadora(nombre_visible)')
    .eq('cliente_id', clienteId);
  if (errorPacientes) return responderError(res, errorPacientes);
  if (!pacientes?.length) return res.json({ accesos: [] });

  const { data: renglones, error: errorRegistro } = await db
    .from('consultas_a_hce')
    .select('id, usuario_id, paciente_id, categorias, momento, origen')
    .in('paciente_id', pacientes.map((p) => p.id))
    .order('momento', { ascending: false })
    .limit(5000);
  if (errorRegistro) return responderError(res, errorRegistro);

  const pacientePorId = new Map(pacientes.map((p) => [p.id, p.persona?.nombre_visible ?? null]));
  try {
    res.json({ accesos: await armarLosAccesos(prestadoraId, renglones ?? [], pacientePorId) });
  } catch (error) {
    return responderError(res, error);
  }
});

// Cómo se muestra cada renglón del registro de accesos, en la Ficha del Cliente y en la descarga
// del año que se va a borrar: las mismas columnas en los dos lados.
async function armarLosAccesos(prestadoraId, renglones, pacientePorId) {
  const ids = [...new Set(renglones.map((r) => r.usuario_id).filter(Boolean))];
  let nombres = new Map();
  if (ids.length) {
    const { data: usuarios, error } = await enLaPrestadora(prestadoraId, 'nombres del registro de accesos', (conexion) => conexion
      .from('usuarios')
      .select('id, nombre')
      .eq('prestadora_id', prestadoraId)
      .in('id', ids));
    if (error) throw error;
    nombres = new Map((usuarios ?? []).map((u) => [u.id, u.nombre]));
  }
  return renglones.map((r) => ({
    id: r.id,
    momento: r.momento,
    persona: r.usuario_id ? (nombres.get(r.usuario_id) ?? null) : null,
    paciente: pacientePorId.get(r.paciente_id) ?? null,
    categorias: r.categorias ?? [],
    lugar: lugarDelOrigen(r.origen),
  }));
}

// QUÉ AÑO DEL REGISTRO DE ACCESOS SE BORRA PRÓXIMAMENTE.
//
// El plazo lo fija el país de la Prestadora, y la base contesta qué año es el más viejo y cuándo
// vence (`consultas_a_hce_por_vencer`), con la sesión de quien pide: sólo la administración de la
// Prestadora lo puede preguntar. Se avisa desde el día del preaviso por correo, que también fija el
// país, hasta la víspera del borrado: es el tiempo que tiene la Prestadora para descargarlo si lo
// quiere guardar afuera. Fuera de ese tramo, o sin plazo para el país, no hay nada que decir.
async function elAnioPorBorrar(req) {
  const { data, error } = await clienteDelPedido(req).rpc('consultas_a_hce_por_vencer');
  if (error) throw error;
  const fila = Array.isArray(data) ? data[0] : data;
  if (!fila?.anio || !fila?.se_borra_el || !fila?.preaviso_el) return null;
  const hoy = new Date().toISOString().slice(0, 10);
  if (hoy < fila.preaviso_el || hoy >= fila.se_borra_el) return null;
  return fila;
}

function soloAdministracion(req, res) {
  const { rol, prestadoraId } = req.usuarioPanel;
  if (!esAdminOSuperior(rol) || !prestadoraId) {
    res.status(403).json({ error: 'sin_permiso', motivo: 'sin_permiso' });
    return false;
  }
  return true;
}

panelAuditoriaRouter.get('/registro-de-accesos-por-borrar', requiereRolPanel, async (req, res) => {
  if (!soloAdministracion(req, res)) return;
  try {
    const fila = await elAnioPorBorrar(req);
    res.json(fila ? { anio: fila.anio, se_borra_el: fila.se_borra_el } : {});
  } catch (error) {
    return responderError(res, error);
  }
});

// La descarga de ese año, entero. Se lee con la sesión de quien pide, de a tandas, y sólo dentro
// del año que la base dijo que vence: no es una puerta para bajar el registro de cualquier fecha.
const TANDA = 1000;

panelAuditoriaRouter.get('/registro-de-accesos-por-borrar/renglones', requiereRolPanel, async (req, res) => {
  if (!soloAdministracion(req, res)) return;
  const { prestadoraId } = req.usuarioPanel;
  try {
    const fila = await elAnioPorBorrar(req);
    if (!fila) return res.json({ anio: null, accesos: [] });

    const db = clienteDelPedido(req);
    const renglones = [];
    for (let desde = 0; ; desde += TANDA) {
      const { data, error } = await db
        .from('consultas_a_hce')
        .select('id, usuario_id, paciente_id, categorias, momento, origen')
        .eq('prestadora_id', prestadoraId)
        .gte('momento', fila.desde)
        .lt('momento', fila.hasta)
        .order('numero', { ascending: true })
        .range(desde, desde + TANDA - 1);
      if (error) throw error;
      renglones.push(...(data ?? []));
      if (!data || data.length < TANDA) break;
    }

    const idsPacientes = [...new Set(renglones.map((r) => r.paciente_id))];
    const pacientePorId = new Map();
    for (let i = 0; i < idsPacientes.length; i += 200) {
      const { data, error } = await db
        .from('pacientes')
        .select('id, persona:personas!pacientes_persona_de_la_misma_prestadora(nombre_visible)')
        .in('id', idsPacientes.slice(i, i + 200));
      if (error) throw error;
      for (const p of data ?? []) pacientePorId.set(p.id, p.persona?.nombre_visible ?? null);
    }

    res.json({ anio: fila.anio, accesos: await armarLosAccesos(prestadoraId, renglones, pacientePorId) });
  } catch (error) {
    return responderError(res, error);
  }
});
