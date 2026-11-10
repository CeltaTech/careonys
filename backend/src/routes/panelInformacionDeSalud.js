import { Router } from 'express';
import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import { exigirOrganizacionActiva } from '../middleware/alcancePrestadora.js';
import { clienteDelPedido } from '../db/connection.js';
import { TABLAS_DE_SALUD } from '../db/informacionDeSalud.js';

/* La información de salud que lee y escribe el Panel.
   ==================================================

   La base no le entrega información de salud a nadie que vaya directo: sólo por las funciones que
   anotan, en la misma operación, a qué Pacientes alcanzó. Las pantallas del Panel la piden acá, y
   acá se arma la consulta sobre la conexión de quien pide, que la manda por esas funciones.

   LO QUE MANDA LA PANTALLA ES LA CONSULTA, PASO POR PASO —`select`, `eq`, `order`…—, y se repite
   sobre esa conexión. Nada de lo que viene en el pedido elige la Prestadora: la conexión es la de
   la sesión, y la base resuelve con ella qué filas ve y cuáles puede tocar, con las mismas reglas
   de siempre. Lo que no está en la lista de pasos permitidos se rechaza antes de llegar a la base.

   Hay una ruta por tabla, y no una sola con la tabla como dato, para que el origen anotado diga de
   qué tabla se trató: `POST /api/panel/informacion-de-salud/reportes`. */

export const panelInformacionDeSaludRouter = Router();

const nombre = (v) => typeof v === 'string' && /^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$/.test(v);
const escalar = (v) => v === null || ['string', 'number', 'boolean'].includes(typeof v);
const objeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const sinMas = (o, permitidas) => objeto(o) && Object.keys(o).every((k) => permitidas.includes(k));

// Qué pasos se aceptan, y con qué argumentos. Cualquier otro pedido, con cualquier otra forma, no se
// repite.
const COMPARAR = (a) => a.length === 2 && nombre(a[0]) && escalar(a[1]);
const PASOS = {
  select: (a) => a.length <= 2
    && (a[0] === undefined || typeof a[0] === 'string')
    && (a[1] === undefined || (sinMas(a[1], ['count', 'head']) && (a[1].count === undefined || a[1].count === 'exact')
      && (a[1].head === undefined || typeof a[1].head === 'boolean'))),
  insert: (a) => a.length === 1 && objeto(a[0]) && Object.keys(a[0]).every(nombre),
  update: (a) => a.length === 1 && objeto(a[0]) && Object.keys(a[0]).every(nombre),
  eq: COMPARAR,
  neq: COMPARAR,
  gt: COMPARAR,
  gte: COMPARAR,
  lt: COMPARAR,
  lte: COMPARAR,
  in: (a) => a.length === 2 && nombre(a[0]) && Array.isArray(a[1]) && a[1].every(escalar),
  is: (a) => a.length === 2 && nombre(a[0]) && a[1] === null,
  not: (a) => a.length === 3 && nombre(a[0]) && typeof a[1] === 'string' && escalar(a[2]),
  or: (a) => a.length === 1 && typeof a[0] === 'string',
  order: (a) => a.length <= 2 && nombre(a[0])
    && (a[1] === undefined || (sinMas(a[1], ['ascending']) && typeof (a[1].ascending ?? true) === 'boolean')),
  limit: (a) => a.length === 1 && Number.isInteger(a[0]) && a[0] > 0 && a[0] <= 1000,
  maybeSingle: (a) => a.length === 0,
  single: (a) => a.length === 0,
};

// Un pedido bien armado: una lista de pasos conocidos, cada uno con argumentos que le sirven.
export function pasosValidos(pasos) {
  if (!Array.isArray(pasos) || pasos.length === 0 || pasos.length > 30) return false;
  return pasos.every((p) => objeto(p)
    && sinMas(p, ['m', 'a'])
    && Object.hasOwn(PASOS, p.m)
    && (p.a === undefined || Array.isArray(p.a))
    && PASOS[p.m](p.a ?? []));
}

// El código de la base, traducido a lo que la pantalla sabe leer. El detalle queda en el registro.
function estadoDelError(error) {
  if (error?.code === '42501') return { estado: 403, motivo: 'sin_permiso' };
  if (error?.code === 'PGRST116') return { estado: 404, motivo: 'no_encontrado' };
  if (error?.code === '22023' || error?.code === '23502' || error?.code === '23514' || error?.code === '22P02') {
    return { estado: 400, motivo: 'faltan_datos' };
  }
  return { estado: 500, motivo: 'falla_del_sistema' };
}

for (const tabla of TABLAS_DE_SALUD) {
  panelInformacionDeSaludRouter.post(`/${tabla}`, requiereRolPanel, exigirOrganizacionActiva, async (req, res) => {
    const pasos = req.body?.pasos;
    if (!pasosValidos(pasos)) {
      console.error(`[400] ${req.method} ${req.originalUrl} — pedido de salud mal armado`);
      return res.status(400).json({ error: 'faltan_datos', motivo: 'faltan_datos' });
    }

    // Lo que la envoltura no sabe hacer lo rechaza al armarlo: eso también es un pedido mal armado.
    let resultado;
    try {
      let consulta = clienteDelPedido(req).from(tabla);
      for (const { m, a = [] } of pasos) consulta = consulta[m](...a);
      resultado = await consulta;
    } catch (e) {
      resultado = { data: null, error: { message: e?.message, code: e?.code ?? 'XX000' }, count: null };
    }

    const { data, error, count } = resultado;
    if (error) {
      const { estado, motivo } = estadoDelError(error);
      console.error(`[${estado}] ${req.method} ${req.originalUrl} — ${motivo}:`, error?.message ?? error);
      return res.status(estado).json({ error: motivo, motivo });
    }
    return res.json({ data: data ?? null, count: count ?? null });
  });
}
