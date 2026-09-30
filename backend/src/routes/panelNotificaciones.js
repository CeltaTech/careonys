import { Router } from 'express';
import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import { enviarEmail } from '../utils/email.js';
import { supabase } from '../db/connection.js';
import { mensajeDelSistema } from '../i18n/avisos.js';

export const panelNotificacionesRouter = Router();

const ESTADOS = ['en_revision', 'aprobado', 'rechazado'];

// El Postulante recibe este email en el idioma en el que completó el formulario público
// (columna `postulaciones.idioma`) — no siempre en español. El nombre de la Prestadora se arma en
// el momento a partir de `configuracion_prestadora`, para que el mismo software sirva a cualquier
// Prestadora licenciataria.
//
// SIGUE CON LA LLAVE MAESTRA, y por eso la consulta lleva la Prestadora de la sesión. A la ruta
// entra cualquier rol del Panel, y `configuracion_prestadora` sólo la lee la administración
// (`prestadora_lee_su_configuracion`): con la credencial de quien coordina, el correo saldría sin el
// nombre de la Prestadora.
panelNotificacionesRouter.post('/postulante', requiereRolPanel, async (req, res) => {
  const { email, nombre, nuevoEstado, idioma } = req.body;

  if (!email || !ESTADOS.includes(nuevoEstado)) {
    return res.status(400).json({ error: 'Datos inválidos' });
  }

  const { data: configuracion } = await supabase
    .from('configuracion_prestadora')
    .select('nombre')
    .eq('prestadora_id', req.usuarioPanel.prestadoraId)
    .single();

  try {
    await enviarEmail({
      to: email,
      ...mensajeDelSistema('estado_postulacion', idioma, {
        empresa: configuracion?.nombre ?? '',
        nombre,
        estado: nuevoEstado,
      }),
      prestadoraId: req.usuarioPanel.prestadoraId,
    });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'No se pudo enviar el email' });
  }
});
