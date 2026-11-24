import { Router } from 'express';
import { requiereRolAsistente } from '../middleware/requiereRolAsistente.js';
import { clienteDelPedido } from '../db/connection.js';
import { responderError } from '../utils/errorConMotivo.js';
import { COLUMNAS_DE_LA_ACLARACION, conSusAclaraciones, textoDeLaAclaracion } from '../utils/aclaracionesDelReporte.js';

/* Las aclaraciones del Asistente al pie de un Reporte.
   ===================================================

   El Reporte presentado no se modifica: se corrige agregando una aclaración al pie. El Asistente
   la escribe sobre un Reporte que presentó él. Todo va con su sesión: la base decide si ese
   Reporte es suyo, firma la aclaración con su nombre, la fecha y la hora, y anota en el registro de
   accesos a qué Paciente alcanzó. Acá no se decide ningún permiso. */

export const appAsistentesAclaracionesRouter = Router();

// El Reporte que presentó en un turno de guardia, con sus aclaraciones. Es lo que ve después de
// presentarlo, para poder corregirlo.
appAsistentesAclaracionesRouter.get('/turnos-guardia/:turnoGuardiaId/pacientes/:pacienteId', requiereRolAsistente, async (req, res) => {
  const db = clienteDelPedido(req);
  try {
    const { data: reporte, error } = await db
      .from('reportes')
      .select('id, observaciones, created_at')
      .eq('turno_guardia_id', req.params.turnoGuardiaId)
      .eq('paciente_id', req.params.pacienteId)
      .maybeSingle();
    if (error) throw error;
    if (!reporte) return res.status(404).json({ error: 'no_encontrado', motivo: 'no_encontrado' });

    const [conAclaraciones] = await conSusAclaraciones(db, [reporte]);
    const { data: puedeAclarar, error: errorPermiso } = await db.rpc('puede_aclarar_el_reporte', { p_reporte: reporte.id });
    if (errorPermiso) throw errorPermiso;
    return res.json({ reporte: conAclaraciones, puedeAclarar: puedeAclarar === true });
  } catch (error) {
    return responderError(res, error);
  }
});

// Agrega una aclaración al pie de un Reporte. La base la rechaza si el Reporte no es de quien la
// manda.
appAsistentesAclaracionesRouter.post('/reportes/:reporteId', requiereRolAsistente, async (req, res) => {
  let texto;
  try {
    texto = textoDeLaAclaracion(req.body?.texto);
  } catch (error) {
    return responderError(res, error, 400);
  }

  try {
    const { data, error } = await clienteDelPedido(req)
      .from('aclaraciones_reporte')
      .insert({ reporte_id: req.params.reporteId, texto })
      .select(COLUMNAS_DE_LA_ACLARACION)
      .single();
    if (error) {
      if (error.code === '42501') return res.status(403).json({ error: 'sin_permiso', motivo: 'sin_permiso' });
      if (error.code === '22P02' || error.code === '23503') return res.status(404).json({ error: 'no_encontrado', motivo: 'no_encontrado' });
      throw error;
    }
    const { reporte_id: _reporte, ...aclaracion } = data;
    return res.status(201).json({ aclaracion });
  } catch (error) {
    return responderError(res, error);
  }
});
