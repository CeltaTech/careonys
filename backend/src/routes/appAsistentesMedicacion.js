import { Router } from 'express';
import { requiereRolAsistente } from '../middleware/requiereRolAsistente.js';
import { clienteDelPedido, supabase } from '../db/connection.js';
import { medicacionVigenteDelPaciente, asistentePuedeDarLaVia } from '../utils/medicacionIndicaciones.js';
import { asistenteAtiendeAlPaciente } from '../utils/pacientesDeGuardia.js';
import { exigeVisible } from '../utils/visibilidadPrestadora.js';
import { anotarConsultaAHce, origenDelPedido } from '../utils/registroDeConsultas.js';
import { responderError } from '../utils/errorConMotivo.js';

// Cierra pendiente #62 (docs/PLAN_HASTA_PRODUCCION.md): órdenes de medicación de solo lectura para el
// Asistente asignado — nunca muestra una vía que este Asistente en particular no está
// habilitado a administrar, ni siquiera de lectura (evita que "aparezca como orden" para
// quien no puede ejecutarla legalmente).

export const appAsistentesMedicacionRouter = Router();

appAsistentesMedicacionRouter.get('/:pacienteId', requiereRolAsistente, exigeVisible('asistente_medicacion_del_paciente'), async (req, res) => {
  // El permiso se pregunta contra la lista de Pacientes de la guardia, no contra la columna
  // vieja: el segundo Paciente de una guardia compartida también es un Paciente que este Asistente
  // atiende, y sus órdenes de medicación tienen que estar a la vista.
  if (!(await asistenteAtiendeAlPaciente(req.params.pacienteId, req.usuarioAsistente))) {
    return res.status(404).json({ error: 'Paciente no encontrado' });
  }

  // Con la llave maestra: con la restricción de la historia clínica activa, la base le muestra las
  // indicaciones sólo a quien atiende al Paciente con un Servicio vigente y una guardia no
  // cancelada, y la comprobación de arriba deja pasar cualquier guardia suya con ese Paciente.
  const indicaciones = await medicacionVigenteDelPaciente(
    supabase,
    req.usuarioAsistente.prestadoraId,
    req.params.pacienteId,
  );

  // Las prohibiciones de su tipo las lee el Asistente con su credencial.
  const db = clienteDelPedido(req);
  const ordenes = [];
  for (const indicacion of indicaciones) {
    const habilitado = await asistentePuedeDarLaVia(
      db,
      req.usuarioAsistente.prestadoraId,
      req.usuarioAsistente.asistenteId,
      indicacion.via_administracion_id
    );
    if (habilitado) ordenes.push(indicacion);
  }

  // Antes de entregar las ordenes queda anotado quien las vio. Si no se puede anotar, no se
  // entregan (docs/PLAN_HASTA_PRODUCCION.md, paso 9).
  try {
    await anotarConsultaAHce(req.usuarioAsistente, {
      pacienteId: req.params.pacienteId,
      categorias: ['indicaciones_medicacion'],
      origen: origenDelPedido(req),
    });
  } catch (error) {
    return responderError(res, error);
  }

  res.json({ ordenes });
});
