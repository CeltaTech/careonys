import { Router } from 'express';
import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import { exigirOrganizacionActiva } from '../middleware/alcancePrestadora.js';
import { exigirAdministracion } from '../middleware/exigirAdministracion.js';
import { clienteDelPedido } from '../db/connection.js';
import { ErrorConMotivo, responderError } from '../utils/errorConMotivo.js';
import { prestadoraVisible } from '../utils/prestadoraVisible.js';
import {
  codigoDeIndiceValido,
  errorDeLaBase,
  pedidoDeActualizacionPorIndice,
  renglonDeLaActualizacion,
  valorDeIndiceDelPedido,
} from '../utils/actualizacionDePrecios.js';

/* La actualización de precios por índice.
   ==========================================================================

   Los índices (hoy, el IPC del INDEC), sus valores mes por mes, la carga a mano de un valor que la
   fuente todavía no publicó, y la actualización: la vista previa y la aplicación.

   CON LA CREDENCIAL DE QUIEN PIDE. Todo entra a la base con `clienteDelPedido(req)`. Los valores
   públicos los ve cualquiera con sesión; los manuales, sólo su Prestadora. La actualización la hace
   la base en una sola función (`actualizar_precios_por_indice`), que corre con los permisos de
   quien llama y exige la administración de la Prestadora: acá no se calcula ningún precio.

   Los valores públicos los anota la tarea diaria de `utils/cargaDeLosIndices.js`, no esta ruta. */

export const panelActualizacionRouter = Router();

const soloAdministracion = exigirAdministracion('Solo Admin o Superadmin puede actualizar los precios');

panelActualizacionRouter.use(requiereRolPanel, soloAdministracion, exigirOrganizacionActiva);

function contestarErrorDeLaBase(res, error) {
  const { error: conMotivo, estado } = errorDeLaBase(error);
  return responderError(res, conMotivo, estado);
}

// Los índices, cada uno con sus valores: el público y, si la Prestadora cargó uno a mano, el propio.
panelActualizacionRouter.get('/indices', async (req, res) => {
  try {
    const db = clienteDelPedido(req);
    const [indices, valores] = await Promise.all([
      db.from('indices_de_actualizacion').select('id, codigo, nombre, fuente, periodicidad').order('nombre'),
      db.from('valores_de_indice')
        .select('id, indice_id, periodo, valor, origen, prestadora_id, updated_at')
        .order('periodo', { ascending: false }),
    ]);
    if (indices.error) throw indices.error;
    if (valores.error) throw valores.error;

    res.json({
      indices: (indices.data ?? []).map((indice) => ({
        codigo: indice.codigo,
        nombre: indice.nombre,
        fuente: indice.fuente,
        periodicidad: indice.periodicidad,
        valores: (valores.data ?? [])
          .filter((v) => v.indice_id === indice.id)
          .map((v) => ({
            id: v.id,
            periodo: v.periodo,
            valor: Number(v.valor),
            origen: v.origen,
            actualizado: v.updated_at,
          })),
      })),
    });
  } catch (error) {
    responderError(res, error);
  }
});

// Un valor cargado a mano. Si la Prestadora ya cargó uno para ese mes, se corrige ése: hay uno solo
// por mes y por Prestadora (índice único parcial en la base, que el insert de supabase-js no puede
// usar como blanco de un upsert). El valor público del mismo mes no se toca: el propio le gana.
panelActualizacionRouter.post('/indices/:codigo/valores', async (req, res) => {
  try {
    if (!codigoDeIndiceValido(req.params.codigo)) throw new ErrorConMotivo('no_encontrado', 'código de índice mal escrito');
    const { periodo, valor } = valorDeIndiceDelPedido(req.body);
    const db = clienteDelPedido(req);

    const { data: indice, error: errorIndice } = await db
      .from('indices_de_actualizacion').select('id').eq('codigo', req.params.codigo).maybeSingle();
    if (errorIndice) throw errorIndice;
    if (!indice) throw new ErrorConMotivo('no_encontrado', 'el índice no existe');

    const { data: propio, error: errorPropio } = await db
      .from('valores_de_indice')
      .select('id')
      .eq('indice_id', indice.id)
      .eq('periodo', periodo)
      .eq('origen', 'manual')
      .maybeSingle();
    if (errorPropio) throw errorPropio;

    const consulta = propio
      ? db.from('valores_de_indice').update({ valor, updated_at: new Date().toISOString() }).eq('id', propio.id)
      : db.from('valores_de_indice').insert({
        indice_id: indice.id,
        periodo,
        valor,
        origen: 'manual',
        prestadora_id: await prestadoraVisible(db),
      });
    const { data, error } = await consulta.select('id, periodo, valor, origen').single();
    if (error) return contestarErrorDeLaBase(res, error);
    res.status(propio ? 200 : 201).json({ valor: { ...data, valor: Number(data.valor) } });
  } catch (error) {
    responderError(res, error, 400);
  }
});

// Borra un valor cargado a mano. La base sólo deja borrar los manuales de la propia Prestadora: un
// pedido sobre uno público o ajeno no encuentra nada que borrar.
panelActualizacionRouter.delete('/indices/valores/:id', async (req, res) => {
  try {
    const db = clienteDelPedido(req);
    const { data, error } = await db
      .from('valores_de_indice').delete().eq('id', req.params.id).eq('origen', 'manual').select('id');
    if (error) return contestarErrorDeLaBase(res, error);
    if (!data || data.length === 0) throw new ErrorConMotivo('no_encontrado', 'no hay valor propio con ese id');
    res.json({ ok: true });
  } catch (error) {
    responderError(res, error, 400);
  }
});

async function actualizar(req, res, aplicar) {
  try {
    const argumentos = pedidoDeActualizacionPorIndice(req.body, aplicar);
    const { data, error } = await clienteDelPedido(req).rpc('actualizar_precios_por_indice', argumentos);
    if (error) return contestarErrorDeLaBase(res, error);
    res.json({ aplicada: aplicar, renglones: (data ?? []).map(renglonDeLaActualizacion) });
  } catch (error) {
    responderError(res, error, 400);
  }
}

// Lo que haría la actualización, sin escribir nada.
panelActualizacionRouter.post('/vista-previa', (req, res) => actualizar(req, res, false));

// La actualización: todo o nada, en una sola operación de la base.
panelActualizacionRouter.post('/aplicar', (req, res) => actualizar(req, res, true));
