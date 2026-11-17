import { Router } from 'express';
import { requiereRolCliente } from '../middleware/requiereRolCliente.js';
import { clienteDelPedido } from '../db/connection.js';
import { ErrorConMotivo, responderError } from '../utils/errorConMotivo.js';
import { ACCION_EXPORTACION, registrarActividadSinFalta } from '../utils/registroDeActividad.js';
import {
  datosDeLaPersona,
  personaDeQuienUsaLaAplicacion,
  personasDeLosPacientesDelCliente,
} from '../utils/datosDeLaPersona.js';

// LOS DERECHOS DE LA PERSONA, desde la aplicación del Cliente. Dos cosas:
//
//   - Bajar sus propios datos. Quien usa la aplicación se lleva su ficha; el titular, además, la de
//     cada Paciente de su Cliente. La bajada queda en el registro de actividad, y si no se pudo
//     anotar no se entrega nada.
//
//   - Ver quién accedió a la información de salud de un Paciente. La contesta una función de la
//     base que sólo responde al titular del Cliente de ese Paciente, o a la persona autorizada a la
//     que le dieron ver los datos del Paciente.
//
// Todo va con la credencial de quien pide.

export const appClientesDerechosRouter = Router();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function quienPide(req) {
  return { id: req.usuarioCliente.id, prestadoraId: req.usuarioCliente.prestadoraId };
}

appClientesDerechosRouter.get('/mis-datos', requiereRolCliente, async (req, res) => {
  try {
    const { id: usuarioId, clienteId, esTitular, prestadoraId } = req.usuarioCliente;
    const db = clienteDelPedido(req);

    const personaId = await personaDeQuienUsaLaAplicacion(db, { usuarioId, clienteId, esTitular, prestadoraId });
    if (!personaId) throw new ErrorConMotivo('no_encontrado');
    const propios = await datosDeLaPersona(db, personaId, prestadoraId);
    if (!propios) throw new ErrorConMotivo('no_encontrado');

    const pacientes = [];
    if (esTitular) {
      const personas = await personasDeLosPacientesDelCliente(db, { clienteId, prestadoraId });
      for (const personaDelPaciente of personas.filter((p) => p !== personaId)) {
        const datos = await datosDeLaPersona(db, personaDelPaciente, prestadoraId);
        if (datos) pacientes.push(datos);
      }
    }

    await registrarActividadSinFalta(quienPide(req), ACCION_EXPORTACION, {
      tablaAfectada: 'personas',
      registroId: personaId,
      detalle: { metodo: req.method, ruta: String(req.originalUrl ?? '').split('?')[0] },
    });

    res.setHeader('Content-Disposition', 'attachment; filename="mis-datos.json"');
    res.json({ ...propios, pacientes_del_cliente: pacientes });
  } catch (err) {
    responderError(res, err);
  }
});

appClientesDerechosRouter.get('/pacientes/:pacienteId/accesos', requiereRolCliente, async (req, res) => {
  try {
    if (!UUID.test(req.params.pacienteId)) throw new ErrorConMotivo('paciente_no_encontrado');
    const { data, error } = await clienteDelPedido(req)
      .rpc('accesos_a_la_informacion_de_salud_del_paciente', { p_paciente: req.params.pacienteId });
    if (error) {
      if (error.message === 'paciente_no_encontrado') throw new ErrorConMotivo('paciente_no_encontrado', error.message);
      if (error.code === '42501') throw new ErrorConMotivo('sin_permiso', error.message);
      throw new Error(error.message);
    }
    res.json(data ?? []);
  } catch (err) {
    responderError(res, err);
  }
});
