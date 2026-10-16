import { Router } from 'express';
import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import { enviarEmail } from '../utils/email.js';
import { enLaPrestadora } from '../db/connection.js';
import { mensajeDelSistema } from '../i18n/avisos.js';

export const panelNotificacionesRouter = Router();

const ESTADOS = ['en_revision', 'aprobado', 'rechazado'];

// El Postulante recibe este email en el idioma en el que completó el formulario público
// (columna `postulaciones.idioma`) — no siempre en español. El nombre de la Prestadora se arma en
// el momento a partir de `configuracion_prestadora`, para que el mismo software sirva a cualquier
// Prestadora licenciataria.
//
// CON LA CREDENCIAL DEL TRABAJO DE ESTA PRESTADORA. A la ruta entra cualquier rol del Panel, y
// `configuracion_prestadora` sólo la lee la administración (`prestadora_lee_su_configuracion`): con
// la credencial de quien coordina, el correo saldría sin el nombre de la Prestadora. La del trabajo
// no sale de la Prestadora de la sesión, y con ella sale también el correo.
panelNotificacionesRouter.post('/postulante', requiereRolPanel, async (req, res) => {
  const { email, nombre, nuevoEstado, idioma } = req.body;

  if (!email || !ESTADOS.includes(nuevoEstado)) {
    return res.status(400).json({ error: 'Datos inválidos' });
  }

  const prestadoraId = req.usuarioPanel.prestadoraId;
  try {
    await enLaPrestadora(prestadoraId, 'aviso al postulante', async (db) => {
      const { data: configuracion } = await db
        .from('configuracion_prestadora')
        .select('nombre')
        .maybeSingle();
      await enviarEmail({
        to: email,
        ...mensajeDelSistema('estado_postulacion', idioma, {
          empresa: configuracion?.nombre ?? '',
          nombre,
          estado: nuevoEstado,
        }),
        prestadoraId,
      });
    });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'No se pudo enviar el email' });
  }
});
