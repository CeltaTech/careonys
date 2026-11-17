import { Router } from 'express';
import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import { exigirOrganizacionActiva } from '../middleware/alcancePrestadora.js';
import { clienteDelPedido } from '../db/connection.js';
import { esIdentificador } from '../utils/intercambioDeFacturacion.js';
import { yaQuedoRegistrado } from '../utils/registroDeActividad.js';

/* El acceso de emergencia a la información de salud.
   ==================================================

   Alguien del personal de la Prestadora que no atiende a un Paciente necesita, por una urgencia,
   ver su información de salud. Lo pide acá, con el Paciente y el motivo, y la base le abre un
   acceso que vale los minutos que configuró la Prestadora.

   TODO LO DECIDE LA BASE, con la sesión de quien pide. La función `abrir_acceso_de_emergencia`
   comprueba que sea personal de la Prestadora, que el Paciente sea de ella y que el motivo diga
   algo, y en la misma operación guarda el acceso y deja la constancia en el registro de
   actividad. No hay acceso sin constancia, y nada de lo que viene en el pedido elige la
   Prestadora.

   LA LECTURA NO PASA POR ACÁ. Abierto el acceso, la información de salud se lee como siempre, por
   `/api/panel/informacion-de-salud`, y cada lectura queda anotada como cualquier otra.

   EL MOTIVO NO SE ESCRIBE EN EL REGISTRO DEL SERVIDOR: puede describir la salud del Paciente. */

export const panelAccesoDeEmergenciaRouter = Router();

// El código de la base, traducido a lo que la pantalla sabe leer. El detalle queda en el registro.
export function estadoDelError(error) {
  if (error?.code === '42501') return { estado: 403, motivo: 'sin_permiso' };
  if (error?.code === 'P0002') return { estado: 404, motivo: 'paciente_no_encontrado' };
  if (error?.code === 'P0001' && error?.message === 'ya_alcanza') return { estado: 409, motivo: 'ya_alcanza' };
  if (['22023', '23502', '23514', '22P02'].includes(error?.code)) return { estado: 400, motivo: 'faltan_datos' };
  return { estado: 500, motivo: 'falla_del_sistema' };
}

panelAccesoDeEmergenciaRouter.post('/', requiereRolPanel, exigirOrganizacionActiva, async (req, res) => {
  const { pacienteId, motivo } = req.body ?? {};
  if (!esIdentificador(pacienteId) || typeof motivo !== 'string' || !motivo.trim()) {
    console.error(`[400] ${req.method} ${req.originalUrl} — acceso de emergencia sin Paciente o sin motivo`);
    return res.status(400).json({ error: 'faltan_datos', motivo: 'faltan_datos' });
  }

  const { data, error } = await clienteDelPedido(req)
    .rpc('abrir_acceso_de_emergencia', { p_paciente: pacienteId, p_motivo: motivo })
    .maybeSingle();

  if (error || !data) {
    const { estado, motivo: codigo } = estadoDelError(error);
    console.error(`[${estado}] ${req.method} ${req.originalUrl} — ${codigo}:`, error?.code ?? 'sin respuesta');
    return res.status(estado).json({ error: codigo, motivo: codigo });
  }

  // La constancia ya la dejó la base, en la misma operación que abrió el acceso.
  yaQuedoRegistrado(res);
  return res.status(201).json({ id: data.id, hasta: data.hasta });
});
