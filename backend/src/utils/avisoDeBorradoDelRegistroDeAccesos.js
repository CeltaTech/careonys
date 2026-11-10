import { emailDeContactoDePrestadora, enviarEmail, hayMedioDeEnvio } from './email.js';
import { mensajeDelSistema } from '../i18n/avisos.js';
import { idiomaDeLaPrestadora } from '../i18n/idiomaDeLaPrestadora.js';
import { enLaPrestadora } from '../db/connection.js';
import { enDia } from './comoSeDiceEnUnAviso.js';

// LOS DOS CORREOS QUE AVISAN QUE SE VA A BORRAR UN AÑO DEL REGISTRO DE ACCESOS a la información de
// salud: el preaviso y la notificación. Cuántos días antes sale cada uno lo dice la regla de
// conservación del país, en la base; qué aviso toca hoy también lo decide la base.
//
// NO SE APAGA. Es la constancia de que a la Prestadora se le avisó antes de borrar, y por eso no
// pasa por la configuración de notificaciones, donde cada Prestadora enciende y apaga.
//
// PRIMERO SALE EL CORREO Y DESPUÉS SE ANOTA. La constancia queda en el registro de actividad, y es
// la que impide mandar dos veces el mismo aviso. Si el correo no salió, no se anota nada y se
// vuelve a intentar al día siguiente.
//
// Va al email de contacto de la Prestadora. En el registro del servidor nunca queda a quién ni qué.

const MENSAJES = {
  preaviso: 'borrado_del_registro_de_accesos_preaviso',
  notificacion: 'borrado_del_registro_de_accesos_notificacion',
};

/** El aviso que le toque hoy a esa Prestadora, si le toca alguno. Devuelve cuál salió, o null. */
export async function avisarElBorradoDelRegistroDeAccesos(prestadoraId) {
  if (!prestadoraId || !hayMedioDeEnvio()) return null;
  const trabajo = (motivo, consulta) => enLaPrestadora(prestadoraId, motivo, consulta);

  try {
    const { data, error } = await trabajo('aviso del borrado del registro de accesos pendiente', (db) =>
      db.rpc('aviso_de_borrado_de_consultas_a_hce_pendiente'));
    if (error) throw new Error(error.message);
    const pendiente = data?.[0];
    if (!pendiente || !MENSAJES[pendiente.aviso]) return null;

    const destino = await emailDeContactoDePrestadora(prestadoraId);
    if (!destino) return null;

    const idioma = await trabajo('leer el idioma de la Prestadora', (db) => idiomaDeLaPrestadora(db, prestadoraId));
    const textos = mensajeDelSistema(MENSAJES[pendiente.aviso], idioma, {
      anio: String(pendiente.anio),
      fecha: enDia(pendiente.se_borra_el),
      dias: String(pendiente.dias),
    });
    await enviarEmail({ to: destino, asunto: textos.asunto, texto: textos.texto, prestadoraId });

    const anotado = await trabajo('constancia del aviso del borrado del registro de accesos', (db) =>
      db.rpc('anotar_aviso_de_borrado_de_consultas_a_hce', { p_anio: pendiente.anio, p_aviso: pendiente.aviso }));
    if (anotado.error) throw new Error(anotado.error.message);
    return pendiente.aviso;
  } catch (e) {
    console.error('avisoDeBorradoDelRegistroDeAccesos: no se pudo avisar:', e.message);
    return null;
  }
}
