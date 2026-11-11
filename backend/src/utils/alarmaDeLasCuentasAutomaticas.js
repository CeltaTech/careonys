import { sinPrestadora } from '../db/connection.js';
import { enviarEmail, hayMedioDeEnvio } from './email.js';
import { mensajeDelSistema, IDIOMA_POR_DEFECTO } from '../i18n/avisos.js';

// LA ALARMA DE LAS CUENTAS AUTOMÁTICAS.
//
// Cuando una cuenta automática entra demasiadas veces seguidas, la base la desactiva y anota la
// alarma (`interno.armar_el_pase`). Esta tarea le manda el correo a CeltaTech y la marca como
// avisada. La Prestadora no se entera.
//
// Corre con la cuenta automática que no es de ninguna Prestadora: es la única a la que la base le
// contesta las alarmas. Va cada minuto, aparte de las tareas por Prestadora (`server.js`).
//
// UNA ALARMA QUE NO SALIÓ NO SE MARCA. Sin medio de envío, o si el envío falla, queda pendiente y
// sale en la vuelta siguiente.
export async function avisarLasAlarmasDeLasCuentasAutomaticas() {
  const destino = process.env.CORREO_DE_LAS_ALARMAS;
  if (!destino) {
    console.error('alarma de las cuentas automáticas: falta CORREO_DE_LAS_ALARMAS.');
    return;
  }
  if (!hayMedioDeEnvio()) return;

  const db = sinPrestadora('alarma de las cuentas automáticas');

  const { data: alarmas, error } = await db.rpc('alarmas_de_cuentas_automaticas_a_avisar');
  if (error) {
    console.error('alarma de las cuentas automáticas: no se pudieron leer las alarmas:', error.message);
    throw new Error('No se pudieron leer las alarmas de las cuentas automáticas.');
  }

  for (const { id, cuenta, entradas, minutos } of alarmas ?? []) {
    const { asunto, texto } = mensajeDelSistema(
      'alarma_de_cuenta_automatica',
      IDIOMA_POR_DEFECTO,
      { cuenta, entradas, minutos },
    );
    await enviarEmail({ to: destino, asunto, texto, prestadoraId: null });

    const { error: errorAlMarcar } = await db.rpc('alarma_de_cuenta_automatica_avisada', { p_alarma: id });
    if (errorAlMarcar) {
      console.error('alarma de las cuentas automáticas: no se pudo marcar la alarma como avisada:', errorAlMarcar.message);
      throw new Error('No se pudo marcar como avisada una alarma de las cuentas automáticas.');
    }
  }
}
