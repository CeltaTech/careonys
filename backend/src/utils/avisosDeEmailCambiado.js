import { enLaPrestadora } from '../db/connection.js';
import { avisarDeSeguridad, MENSAJE_EMAIL_CAMBIADO } from './avisoDeSeguridad.js';

// EL AVISO AL EMAIL ANTERIOR.
//
// Cuando el email de una cuenta cambia —desde el Legajo del Asistente, la Ficha del Cliente o la
// cuenta misma—, la base anota el email anterior en `avisos_de_email_cambiado`, en la misma
// operación que hace el cambio. Esta tarea le manda el aviso y borra el renglón: el email anterior
// es un dato personal y no queda guardado más tiempo que el que tarda en salir el mensaje.
//
// Corre de a una Prestadora por vez (`server.js`), con la credencial del trabajo de esa Prestadora,
// que sólo ve sus propios avisos.
//
// UN AVISO QUE NO SALIÓ SE BORRA IGUAL. `avisarDeSeguridad` no falla hacia afuera, y reintentar
// un correo a una casilla que ya no existe no lleva a ningún lado.
//
// @returns {Promise<{ avisados: number }>} Lo usa la prueba; la tarea programada no mira el número.
export async function avisarLosCambiosDeEmail(prestadoraId) {
  if (!prestadoraId) return { avisados: 0 };
  const TRABAJO = 'aviso del email cambiado';

  const { data: avisos, error } = await enLaPrestadora(prestadoraId, TRABAJO, (db) => db
    .from('avisos_de_email_cambiado')
    .select('id, usuario_id, email_anterior')
    .eq('prestadora_id', prestadoraId)
    .order('creado_en', { ascending: true }));
  if (error) throw new Error(error.message);
  if (!avisos?.length) return { avisados: 0 };

  const ids = [...new Set(avisos.map((a) => a.usuario_id))];
  const { data: cuentas, error: errorCuentas } = await enLaPrestadora(prestadoraId, TRABAJO, (db) => db
    .from('usuarios')
    .select('id, nombre')
    .eq('prestadora_id', prestadoraId)
    .in('id', ids));
  if (errorCuentas) throw new Error(errorCuentas.message);
  const nombrePorCuenta = new Map((cuentas ?? []).map((c) => [c.id, c.nombre]));

  let avisados = 0;
  for (const aviso of avisos) {
    // Se borra antes de mandar: dos vueltas encimadas no mandan el mismo aviso dos veces, porque la
    // segunda ya no lo encuentra.
    const { data: borrado, error: errorBorrado } = await enLaPrestadora(prestadoraId, TRABAJO, (db) => db
      .from('avisos_de_email_cambiado')
      .delete()
      .eq('id', aviso.id)
      .select('id'));
    if (errorBorrado) {
      console.error(`${TRABAJO}: no se pudo borrar el aviso:`, errorBorrado.message);
      continue;
    }
    if (!borrado?.length) continue;

    await avisarDeSeguridad(MENSAJE_EMAIL_CAMBIADO, {
      email: aviso.email_anterior,
      nombre: nombrePorCuenta.get(aviso.usuario_id) ?? '',
      prestadora_id: prestadoraId,
    });
    avisados += 1;
  }
  return { avisados };
}
