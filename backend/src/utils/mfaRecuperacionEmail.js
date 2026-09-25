import { supabase } from '../db/connection.js';
import { enviarEmail } from './email.js';
import { correoDe } from './correoDeUnaPersona.js';
import { IDENTIDAD } from '../config/identidadProducto.js';
import { codigoNuevo, huellaDelCodigo, estaVencido, vencimientoEnMinutos } from './codigoDeUnSoloUso.js';
import { mensajeDelSistema } from '../i18n/avisos.js';
import { idiomaDeLaPrestadora } from '../i18n/idiomaDeLaPrestadora.js';

// Pendiente #37 — recuperación de acceso por email cuando se pierde el dispositivo TOTP.
// Cómo se arma el código de seis dígitos y cómo se guarda su huella está en
// `codigoDeUnSoloUso.js`, que es el mismo mecanismo que usan la firma de la instrucción del
// círculo familiar y el pase de guardia.
const VIGENCIA_MINUTOS = 10;

export async function solicitarCodigoRecuperacion(usuarioId) {
  // Quien pide este código es alguien del Panel, y el Panel es de una Prestadora: de acá sale
  // tanto la Prestadora con la que se busca el correo como el idioma en el que se manda.
  //
  // SIN PRESTADORA A PROPÓSITO
  // Ésta es la consulta que averigua la Prestadora, así que no puede nombrarla: es el dato que
  // va a buscar. Quien llega acá perdió su segundo factor y no tiene sesión del Panel de la cual
  // sacarlo —la ruta `routes/panelMfaRecuperacion.js` sólo comprobó el pase y el rol—, y la
  // cuenta que ese pase identifica es la de soporte técnico, que por la restricción
  // `usuarios_prestadora_id_solo_superadmin_null` tiene la Prestadora vacía: un filtro por esa
  // columna la dejaría siempre afuera. Lee una sola fila, la de su propio identificador, y la
  // única columna que trae es la que después acota todo lo que sigue.
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('prestadora_id')
    .eq('id', usuarioId)
    .maybeSingle();

  const correo = await correoDe({ prestadoraId: usuario?.prestadora_id, usuarioId });
  if (!correo) {
    throw new Error('No se pudo resolver el email registrado del usuario');
  }

  // Invalida cualquier código anterior sin usar — solo el último pedido sirve.
  await supabase
    .from('mfa_codigos_recuperacion')
    .update({ usado: true, usado_en: new Date().toISOString() })
    .eq('usuario_id', usuarioId)
    .eq('usado', false);

  const codigo = codigoNuevo();
  const { error: errorInsert } = await supabase.from('mfa_codigos_recuperacion').insert({
    usuario_id: usuarioId,
    codigo_hash: huellaDelCodigo(codigo),
    expira_at: vencimientoEnMinutos(VIGENCIA_MINUTOS),
  });
  if (errorInsert) throw new Error(errorInsert.message);

  await enviarEmail({
    to: correo,
    ...mensajeDelSistema('mfa_codigo_recuperacion', await idiomaDeLaPrestadora(usuario?.prestadora_id), {
      codigo,
      minutos: VIGENCIA_MINUTOS,
      producto: IDENTIDAD.nombre,
    }),
  });
}

// Verifica el código y, si es válido, da de baja el/los factor/es TOTP del usuario —
// misma acción que hoy se hacía a mano por SQL (DELETE FROM auth.mfa_factors), pero
// autoservicio. El usuario vuelve a entrar sin MFA y queda en estado "requiere
// enrolamiento" para configurar un dispositivo nuevo en el momento.
export async function confirmarCodigoRecuperacion(usuarioId, codigo) {
  const hash = huellaDelCodigo(String(codigo || '').trim());

  const { data: fila } = await supabase
    .from('mfa_codigos_recuperacion')
    .select('id, expira_at')
    .eq('usuario_id', usuarioId)
    .eq('codigo_hash', hash)
    .eq('usado', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!fila || estaVencido(fila.expira_at)) return false;

  await supabase
    .from('mfa_codigos_recuperacion')
    .update({ usado: true, usado_en: new Date().toISOString() })
    .eq('id', fila.id);

  const { data: factoresData } = await supabase.auth.admin.mfa.listFactors({ userId: usuarioId });
  const factoresTotp = (factoresData?.factors ?? []).filter((f) => f.factor_type === 'totp');
  for (const factor of factoresTotp) {
    await supabase.auth.admin.mfa.deleteFactor({ id: factor.id, userId: usuarioId });
  }

  return true;
}
