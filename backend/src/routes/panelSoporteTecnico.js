import { Router } from 'express';
import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import { exigirAdministracion } from '../middleware/exigirAdministracion.js';
import { exigirOrganizacionActiva } from '../middleware/alcancePrestadora.js';
import { supabase } from '../db/connection.js';
import { responderError } from '../utils/errorConMotivo.js';

/* El pedido de soporte técnico, visto desde el Panel de la Prestadora.
   ======================================================================================

   QUÉ SE HACE DESDE ACÁ. Abrir una solicitud describiendo el problema, agregarle algo más
   después, leer lo que contestaron y cerrarla. Eso es todo lo que el Panel puede hacer con el
   soporte técnico.

   QUÉ NO SE HACE, Y NO FALTA. Contestar. La respuesta entra por fuera del Panel, con la llave de
   servicio: acá no hay ninguna ruta que escriba un mensaje del lado del soporte, y la política de
   la tabla lo rechazaría igual. Tampoco se pasa una solicitud a `en_curso`: ese paso lo da quien
   la toma.

   EL AISLAMIENTO. La Prestadora sale de `req.usuarioPanel.prestadoraId` y se escribe en cada
   consulta, incluidas las que leen una solicitud por su identificador: sin ese filtro, un
   identificador ajeno alcanzaría el hilo de otra Prestadora. Es la primera red; las políticas de
   las dos tablas son la segunda.

   NADA DEL CONTENIDO SE REGISTRA. Lo que se describe puede nombrar a un Cliente o a una
   Asistente. El texto queda en su tabla y no se copia a ningún registro de actividad. */

export const panelSoporteTecnicoRouter = Router();

panelSoporteTecnicoRouter.use(
  requiereRolPanel,
  exigirAdministracion('Solo la administración de la Prestadora pide soporte técnico'),
  exigirOrganizacionActiva,
);

const COLUMNAS = 'id, asunto, problema, estado, created_at, updated_at, cerrada_at';
const COLUMNAS_MENSAJE = 'id, autor, texto, created_at';

panelSoporteTecnicoRouter.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('solicitudes_de_soporte_tecnico')
    .select(COLUMNAS)
    .eq('prestadora_id', req.usuarioPanel.prestadoraId)
    .order('created_at', { ascending: false });
  if (error) return responderError(res, error);
  // Una lista vacía es lo corriente y lo deseable: significa que no hubo nada que pedir.
  res.json({ solicitudes: data ?? [] });
});

panelSoporteTecnicoRouter.get('/:id', async (req, res) => {
  const { data: solicitud, error } = await supabase
    .from('solicitudes_de_soporte_tecnico')
    .select(COLUMNAS)
    .eq('id', req.params.id)
    .eq('prestadora_id', req.usuarioPanel.prestadoraId)
    .maybeSingle();
  if (error) return responderError(res, error);
  if (!solicitud) return res.status(404).json({ error: 'No se encontró esa solicitud' });

  const { data: mensajes, error: errorMensajes } = await supabase
    .from('mensajes_de_soporte_tecnico')
    .select(COLUMNAS_MENSAJE)
    .eq('solicitud_id', solicitud.id)
    .eq('prestadora_id', req.usuarioPanel.prestadoraId)
    .order('created_at', { ascending: true });
  if (errorMensajes) return responderError(res, errorMensajes);

  res.json({ solicitud, mensajes: mensajes ?? [] });
});

panelSoporteTecnicoRouter.post('/', async (req, res) => {
  const asunto = String(req.body?.asunto ?? '').trim();
  const problema = String(req.body?.problema ?? '').trim();

  if (!asunto) return res.status(400).json({ error: 'Falta de qué se trata' });
  if (!problema) return res.status(400).json({ error: 'Falta la descripción del problema' });

  // El estado no se acepta del pedido: una solicitud nace abierta y nada más.
  const { data, error } = await supabase
    .from('solicitudes_de_soporte_tecnico')
    .insert({
      prestadora_id: req.usuarioPanel.prestadoraId,
      abierta_por: req.usuarioPanel.id,
      asunto,
      problema,
    })
    .select(COLUMNAS)
    .maybeSingle();
  if (error) return responderError(res, error);
  res.json({ solicitud: data });
});

panelSoporteTecnicoRouter.post('/:id/mensajes', async (req, res) => {
  const texto = String(req.body?.texto ?? '').trim();
  if (!texto) return res.status(400).json({ error: 'Falta el texto' });

  const { data: solicitud, error: errorLectura } = await supabase
    .from('solicitudes_de_soporte_tecnico')
    .select('id, estado')
    .eq('id', req.params.id)
    .eq('prestadora_id', req.usuarioPanel.prestadoraId)
    .maybeSingle();
  if (errorLectura) return responderError(res, errorLectura);
  if (!solicitud) return res.status(404).json({ error: 'No se encontró esa solicitud' });
  // Una solicitud cerrada no sigue conversando: si hay algo más que contar, se abre otra.
  if (solicitud.estado === 'cerrada') {
    return res.status(400).json({ error: 'Esa solicitud ya está cerrada' });
  }

  // El autor lo pone el backend, nunca el pedido: del lado de la Prestadora y de nadie más.
  const { data, error } = await supabase
    .from('mensajes_de_soporte_tecnico')
    .insert({
      prestadora_id: req.usuarioPanel.prestadoraId,
      solicitud_id: solicitud.id,
      autor: 'prestadora',
      escrito_por: req.usuarioPanel.id,
      texto,
    })
    .select(COLUMNAS_MENSAJE)
    .maybeSingle();
  if (error) return responderError(res, error);

  await supabase
    .from('solicitudes_de_soporte_tecnico')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', solicitud.id)
    .eq('prestadora_id', req.usuarioPanel.prestadoraId);

  res.json({ mensaje: data });
});

// Cerrar es lo único que la Prestadora cambia de una solicitud. El estado no viene en el pedido:
// esta ruta hace una cosa sola, así que no hay forma de mandarla a `en_curso` desde acá.
panelSoporteTecnicoRouter.post('/:id/cerrar', async (req, res) => {
  const ahora = new Date().toISOString();
  const { data, error } = await supabase
    .from('solicitudes_de_soporte_tecnico')
    .update({ estado: 'cerrada', cerrada_at: ahora, updated_at: ahora })
    .eq('id', req.params.id)
    .eq('prestadora_id', req.usuarioPanel.prestadoraId)
    .neq('estado', 'cerrada')
    .select(COLUMNAS);
  if (error) return responderError(res, error);
  if (!data?.length) return res.status(404).json({ error: 'No se encontró esa solicitud abierta' });
  res.json({ solicitud: data[0] });
});
