import { Router } from 'express';
import { requiereRolAsistente } from '../middleware/requiereRolAsistente.js';
import { clienteDelPedido } from '../db/connection.js';

// ============================================================================
// Lo que el Asistente firmó sobre el registro de su ubicación, tal como lo firmó.
//
// Acá no se decide nada. La condición se firma en el reclutamiento, y el texto nuevo que trae el
// paso de «Sólo viaje» a «Viaje y turno» se firma de la misma manera. La aplicación sólo muestra
// lo firmado y deja retirarlo, porque la ley exige que se pueda.
//
// Con la credencial de quien pide: todo entra a la base con `clienteDelPedido(req)`, no con la
// llave maestra. La base sabe qué Asistente pide y le deja ver y escribir sólo lo de su propio
// Legajo, así que ninguna consulta lleva el filtro de la Prestadora de la sesión.
// ============================================================================

export const appAsistentesConsentimientosRouter = Router();

// Los temas sobre los que hoy se firma consentimiento. Cuando haya más, se agregan acá y en el
// catálogo de la base — no se repite la lista en otro lado.
const CLAVES = ['seguimiento_ubicacion'];

// Es la puerta de entrada de todo lo demás: lo que se actualiza después va por el identificador
// que sale de acá, y la base sólo deja ver las decisiones del propio Legajo.
async function decisionViva(db, asistenteId, clave) {
  const { data } = await db
    .from('consentimientos_asistente')
    .select('id, decision')
    .eq('asistente_id', asistenteId)
    .eq('clave', clave)
    .is('retirado_at', null)
    .maybeSingle();
  return data || null;
}

// ============================================================================
// GET / — lo firmado y vigente. El cuerpo es la fotografía guardada al firmar, no el texto del
// catálogo, que pudo cambiar después.
// ============================================================================
appAsistentesConsentimientosRouter.get('/', requiereRolAsistente, async (req, res) => {
  const db = clienteDelPedido(req);
  const { data, error } = await db
    .from('consentimientos_asistente')
    .select('clave, texto_mostrado, version_mostrada, idioma_mostrado, textos_consentimiento(titulo, es_borrador)')
    .eq('asistente_id', req.usuarioAsistente.asistenteId)
    .in('clave', CLAVES)
    .eq('decision', 'otorgado')
    .is('retirado_at', null);
  if (error) {
    return res.status(500).json({ error: 'No se pudo leer lo firmado' });
  }

  const items = (data || []).map((fila) => ({
    clave: fila.clave,
    texto: {
      version: fila.version_mostrada,
      idioma: fila.idioma_mostrado,
      titulo: fila.textos_consentimiento?.titulo || '',
      cuerpo: fila.texto_mostrado,
      es_borrador: Boolean(fila.textos_consentimiento?.es_borrador),
    },
  }));

  res.json({ consentimientos: items });
});

// ============================================================================
// POST /retirar — la ley exige que se pueda retirar, así que existe la ruta.
//
// No borra la fila: le pone fecha de retiro. Desde ese instante
// consentimiento_seguimiento_vigente() devuelve false para esta persona.
// ============================================================================
appAsistentesConsentimientosRouter.post('/retirar', requiereRolAsistente, async (req, res) => {
  const { clave, motivo } = req.body || {};
  if (!CLAVES.includes(clave)) {
    return res.status(400).json({ error: 'Consentimiento desconocido' });
  }

  const db = clienteDelPedido(req);
  const viva = await decisionViva(db, req.usuarioAsistente.asistenteId, clave);
  if (!viva || viva.decision !== 'otorgado') {
    return res.status(409).json({ error: 'No hay un consentimiento vigente para retirar' });
  }

  // Se comprueba que la fila se haya escrito de verdad. La lectura de arriba pasó hace un
  // instante, pero acá se contesta "listo, retirado" y eso es lo que la persona se lleva: si no
  // quedó escrito, no se le puede decir que sí. Un consentimiento que alguien cree retirado y
  // sigue vigente es exactamente lo que la ley no perdona.
  const { data: retirado, error } = await db
    .from('consentimientos_asistente')
    .update({
      retirado_at: new Date().toISOString(),
      motivo_retiro: typeof motivo === 'string' && motivo.trim() ? motivo.trim().slice(0, 500) : null,
    })
    .eq('id', viva.id)
    .is('retirado_at', null)
    .select('id');

  if (error) {
    return res.status(500).json({ error: 'No se pudo retirar el consentimiento' });
  }
  if (!retirado?.length) {
    return res.status(409).json({ error: 'No hay un consentimiento vigente para retirar' });
  }

  res.json({ ok: true });
});
