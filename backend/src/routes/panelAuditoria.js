import { Router } from 'express';
import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import { enLaPrestadora } from '../db/connection.js';
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
