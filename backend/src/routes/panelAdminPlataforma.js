import { Router } from 'express';
import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import { supabase } from '../db/connection.js';

// Etapa 2 del plan de panel Admin_plataforma (2026-07-18, aprobado por el Desarrollador):
// planes/módulos/facturación de licencias — configuración administrativa de negocio de
// la plataforma. Exclusivamente admin_plataforma (CLAUDE.md §5: "gestiona... procesos
// comerciales del SaaS"); superadmin es un rol puramente técnico sin alcance de negocio
// y queda afuera a propósito, a diferencia de panelPrestadoras.js (que sí lo incluye,
// por la necesidad puntual del onboarding del pendiente #26).
export const panelAdminPlataformaRouter = Router();

function requiereAdminPlataforma(req, res, next) {
  if (req.usuarioPanel?.rol !== 'admin_plataforma') {
    return res.status(403).json({ error: 'Solo admin_plataforma puede acceder a esta sección' });
  }
  next();
}

panelAdminPlataformaRouter.use(requiereRolPanel, requiereAdminPlataforma);

async function planVigenteDe(prestadoraId) {
  const { data } = await supabase
    .from('prestadora_planes')
    .select('plan_id, vigente_desde, planes(id, nombre, precio, moneda)')
    .eq('prestadora_id', prestadoraId)
    .is('vigente_hasta', null)
    .maybeSingle();
  return data?.planes ?? null;
}

// ============================================================================
// Resumen (KPIs)
// ============================================================================
panelAdminPlataformaRouter.get('/resumen', async (req, res) => {
  const { data: prestadoras, error: errorPrestadoras } = await supabase
    .from('prestadoras')
    .select('id, estado, fecha_alta');
  if (errorPrestadoras) return res.status(500).json({ error: errorPrestadoras.message });

  const { data: planesVigentes, error: errorPlanes } = await supabase
    .from('prestadora_planes')
    .select('prestadora_id, planes(precio)')
    .is('vigente_hasta', null);
  if (errorPlanes) return res.status(500).json({ error: errorPlanes.message });

  const { count: addonsCount, error: errorAddons } = await supabase
    .from('prestadora_modulos')
    .select('id', { count: 'exact', head: true })
    .eq('origen', 'addon')
    .eq('activo', true);
  if (errorAddons) return res.status(500).json({ error: errorAddons.message });

  const inicioMes = new Date();
  inicioMes.setDate(1);
  inicioMes.setHours(0, 0, 0, 0);

  const mrrTotal = planesVigentes.reduce((acc, fila) => acc + Number(fila.planes?.precio ?? 0), 0);
  const activas = prestadoras.filter((p) => p.estado === 'certificada').length;
  const nuevasEsteMes = prestadoras.filter((p) => p.fecha_alta && new Date(p.fecha_alta) >= inicioMes).length;

  res.json({
    mrrTotal,
    prestadorasActivas: activas,
    prestadorasTotal: prestadoras.length,
    nuevasEsteMes,
    addonsContratados: addonsCount ?? 0,
  });
});

// ============================================================================
// Licenciatarias (lista con su plan vigente)
// ============================================================================
panelAdminPlataformaRouter.get('/tenants', async (req, res) => {
  const { data: prestadoras, error } = await supabase
    .from('prestadoras')
    .select('id, nombre_fantasia, pais, estado')
    .order('nombre_fantasia', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });

  const { data: planesVigentes, error: errorPlanes } = await supabase
    .from('prestadora_planes')
    .select('prestadora_id, planes(id, nombre, precio, moneda)')
    .is('vigente_hasta', null);
  if (errorPlanes) return res.status(500).json({ error: errorPlanes.message });

  const planPorPrestadora = new Map(planesVigentes.map((f) => [f.prestadora_id, f.planes]));

  res.json({
    tenants: prestadoras.map((p) => ({
      ...p,
      plan: planPorPrestadora.get(p.id) ?? null,
    })),
  });
});

// ============================================================================
// Módulos de una licenciataria puntual (para el drawer de toggles)
// ============================================================================
panelAdminPlataformaRouter.get('/tenants/:id/modulos', async (req, res) => {
  const { id } = req.params;

  const { data: catalogo, error: errorCatalogo } = await supabase
    .from('catalogo_modulos')
    .select('key, nombre')
    .order('key', { ascending: true });
  if (errorCatalogo) return res.status(500).json({ error: errorCatalogo.message });

  const { data: asignados, error: errorAsignados } = await supabase
    .from('prestadora_modulos')
    .select('modulo_key, origen, activo')
    .eq('prestadora_id', id);
  if (errorAsignados) return res.status(500).json({ error: errorAsignados.message });

  const asignadoPorKey = new Map(asignados.map((a) => [a.modulo_key, a]));

  res.json({
    modulos: catalogo.map((m) => ({
      key: m.key,
      nombre: m.nombre,
      activo: asignadoPorKey.get(m.key)?.activo ?? false,
      origen: asignadoPorKey.get(m.key)?.origen ?? null,
    })),
  });
});

// Prender/apagar un módulo de una licenciataria puntual — queda auditado por el mismo
// mecanismo genérico de mutaciones Express (requiereRolPanel.js), no hace falta duplicar
// el registro acá.
panelAdminPlataformaRouter.patch('/tenants/:id/modulos/:key', async (req, res) => {
  const { id, key } = req.params;
  const { activo } = req.body;

  if (typeof activo !== 'boolean') {
    return res.status(400).json({ error: 'Falta el campo "activo" (boolean)' });
  }

  const planVigente = await planVigenteDe(id);
  const { data: planModulo } = await supabase
    .from('plan_modulos')
    .select('modulo_key')
    .eq('plan_id', planVigente?.id ?? '00000000-0000-0000-0000-000000000000')
    .eq('modulo_key', key)
    .maybeSingle();

  const origen = planModulo ? 'plan' : 'addon';

  const { error } = await supabase
    .from('prestadora_modulos')
    .upsert(
      { prestadora_id: id, modulo_key: key, origen, activo, updated_at: new Date().toISOString() },
      { onConflict: 'prestadora_id,modulo_key' }
    );
  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true });
});

// ============================================================================
// Catálogo de planes (solo lectura por ahora — crear/editar planes queda para una
// siguiente etapa, ya señalado como fuera de alcance de esta tanda)
// ============================================================================
panelAdminPlataformaRouter.get('/planes', async (req, res) => {
  const { data: planes, error } = await supabase
    .from('planes')
    .select('id, nombre, precio, moneda, vigente_desde, vigente_hasta')
    .is('vigente_hasta', null)
    .order('precio', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });

  const { data: modulos, error: errorModulos } = await supabase
    .from('plan_modulos')
    .select('plan_id, catalogo_modulos(key, nombre)');
  if (errorModulos) return res.status(500).json({ error: errorModulos.message });

  const modulosPorPlan = new Map();
  for (const fila of modulos) {
    const lista = modulosPorPlan.get(fila.plan_id) ?? [];
    lista.push(fila.catalogo_modulos.nombre);
    modulosPorPlan.set(fila.plan_id, lista);
  }

  res.json({
    planes: planes.map((p) => ({ ...p, modulos: modulosPorPlan.get(p.id) ?? [] })),
  });
});

// ============================================================================
// Facturación de licencias (solo lectura por ahora — emitir/marcar pagada queda para
// una siguiente etapa)
// ============================================================================
panelAdminPlataformaRouter.get('/facturas', async (req, res) => {
  const { data, error } = await supabase
    .from('facturas_licencia')
    .select('id, concepto, monto, moneda, estado, fecha_emision, fecha_vencimiento, prestadoras(nombre_fantasia)')
    .order('fecha_emision', { ascending: false })
    .limit(200);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ facturas: data });
});
