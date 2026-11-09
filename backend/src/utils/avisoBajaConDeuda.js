import { enLaPrestadora } from '../db/connection.js';
import { notificarCoordinador } from './whatsapp.js';
import { mensajeDelSistema } from '../i18n/avisos.js';
import { idiomaDeLaPrestadora } from '../i18n/idiomaDeLaPrestadora.js';

// LA BAJA DE UN SERVICIO CON DEUDA.
//
// La deuda no frena la baja: la base la anota al darla (`avisos_baja_servicio_con_deuda`, escrito
// por `dar_de_baja_el_servicio`) y queda a la vista de créditos y cobranzas en el Panel. Esto le
// manda además el mismo aviso por WhatsApp o mensaje de texto. Nunca por correo.
//
// Se lee con el trabajo de la Prestadora porque quien da la baja puede no tener permiso para ver
// el estado de cuenta del Cliente. Una falla del envío no deshace la baja: sólo se registra.
export async function avisarLaBajaConDeuda(prestadoraId, bajaId) {
  if (!prestadoraId || !bajaId) return;
  const TRABAJO = 'aviso de baja de un Servicio con deuda';

  try {
    const { data: avisos, error } = await enLaPrestadora(prestadoraId, TRABAJO, (db) => db
      .from('avisos_baja_servicio_con_deuda')
      .select('importe, moneda, dias_de_atraso, servicios(etiqueta)')
      .eq('prestadora_id', prestadoraId)
      .eq('baja_id', bajaId));
    if (error) throw new Error(error.message);
    if (!avisos?.length) return;

    const idioma = await enLaPrestadora(prestadoraId, TRABAJO, (db) => idiomaDeLaPrestadora(db, prestadoraId));

    for (const aviso of avisos) {
      const importe = new Intl.NumberFormat(idioma, { style: 'currency', currency: aviso.moneda })
        .format(Number(aviso.importe));
      await notificarCoordinador({
        evento: 'baja_servicio_con_deuda',
        prestadoraId,
        sinCorreo: true,
        ...mensajeDelSistema('baja_servicio_con_deuda', idioma, {
          servicio: aviso.servicios?.etiqueta ?? '',
          importe,
          dias: aviso.dias_de_atraso ?? 0,
        }, prestadoraId),
      });
    }
  } catch (err) {
    console.error(`${TRABAJO}:`, err.message);
  }
}
