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


// Las órdenes que este Asistente puede ver: las vigentes del Paciente, y de ésas sólo las de una vía
// que él está habilitado a dar. Null si no atiende a ese Paciente.
async function ordenesDelAsistente(req) {
  // El permiso se pregunta contra la lista de Pacientes de la guardia, no contra la columna
  // vieja: el segundo Paciente de una guardia compartida también es un Paciente que este Asistente
  // atiende, y sus órdenes de medicación tienen que estar a la vista.
  if (!(await asistenteAtiendeAlPaciente(req.params.pacienteId, req.usuarioAsistente))) return null;

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
  return ordenes;
}

// Dónde está guardada la receta de cada orden. La ruta se lee con la maestra, por lo mismo que la
// lista.
async function recetasDe(prestadoraId, ids) {
  if (!ids.length) return new Map();
  const { data } = await supabase
    .from('indicaciones_medicacion')
    .select('id, prescripcion_archivo_url')
    .eq('prestadora_id', prestadoraId)
    .in('id', ids)
    .not('prescripcion_archivo_url', 'is', null);
  return new Map((data || []).map((r) => [r.id, r.prescripcion_archivo_url]));
}

appAsistentesMedicacionRouter.get('/:pacienteId', requiereRolAsistente, exigeVisible('asistente_medicacion_del_paciente'), async (req, res) => {
  const ordenes = await ordenesDelAsistente(req);
  if (!ordenes) return res.status(404).json({ error: 'Paciente no encontrado' });
  const recetas = await recetasDe(req.usuarioAsistente.prestadoraId, ordenes.map((o) => o.id));

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

  res.json({ ordenes: ordenes.map((o) => ({ ...o, tiene_receta: recetas.has(o.id) })) });
});

// La receta de una orden, con un enlace temporal que se pide recién al tocar el botón: uno
// preparado al abrir la guardia se vence antes de que lo usen. Lo pide la credencial del
// Asistente, y el depósito sólo se lo da si atiende a ese Paciente.
appAsistentesMedicacionRouter.get('/:pacienteId/receta/:indicacionId', requiereRolAsistente, exigeVisible('asistente_medicacion_del_paciente'), async (req, res) => {
  const ordenes = await ordenesDelAsistente(req);
  const orden = ordenes?.find((o) => o.id === req.params.indicacionId);
  if (!orden) return res.status(404).json({ error: 'Receta no encontrada' });
  const ruta = (await recetasDe(req.usuarioAsistente.prestadoraId, [orden.id])).get(orden.id);
  if (!ruta) return res.status(404).json({ error: 'Receta no encontrada' });
  const { data, error } = await clienteDelPedido(req).storage.from('prescripciones-medicacion').createSignedUrl(ruta, 60);
  if (error || !data?.signedUrl) return responderError(res, error || new Error('sin enlace'));
  res.json({ url: data.signedUrl });
});
