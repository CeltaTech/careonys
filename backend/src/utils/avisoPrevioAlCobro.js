/* El preaviso del primer cobro, cuando se está por terminar el período gratuito.
   =================================================================================

   QUÉ RESUELVE. El §3.2 del `docs/PRD_07_Modalidad_Match.md` pide avisar antes de cualquier
   cobro por vencimiento del período gratuito: nunca un cobro silencioso. Hasta acá no había
   ninguno, y tampoco había período gratuito: `formas_de_cobro_intermediacion.dias_gratis` era un dato
   que la Prestadora cargaba y que no leía nadie. Ahora el alta lo escribe en
   `accesos_intermediacion.gratis_hasta` (`altaEnPasarela.js`) y este trabajo es el que avisa.

   POR QUÉ NO PASA POR EL CATÁLOGO DE MENSAJES. `catalogoAvisos.js` junta los mensajes que la
   Prestadora enciende y apaga según cómo trabaja. Éste no es de ésos: lo exige el §3.2 y es lo que
   separa un cobro anunciado de uno silencioso. Un mensaje obligatorio que se pueda apagar no es
   obligatorio.

   CUÁNDO AVISA. Con la anticipación que eligió la Prestadora, y también el mismo día si hasta
   entonces no se pudo. Después de esa fecha no avisa: el cobro ya salió, y decirle a alguien que
   «va a cobrarse» algo que ya se cobró no es un preaviso, es ruido.

   LA ANTICIPACIÓN ES DE CADA PRESTADORA (`plazosDeCobroIntermediacion.js`). Se recorre de a una,
   cada una con la credencial del trabajo de esa Prestadora, que la base acota a ella, y la ventana
   de cada una sale de su propio plazo.

   A QUIÉN NO LE AVISA. A quien ya se dio de baja durante el período gratuito. Ahí no viene ningún
   cobro, que es justamente lo que la baja consigue, y avisarle uno lo asustaría sin motivo.

   UNA VEZ SOLA, Y ANOTADA. `aviso_previo_en` guarda cuándo se avisó. Sin esa marca el mensaje
   saldría todos los días de la ventana, y a la quinta vez deja de leerse. Se anota **después** de
   que el envío salió: si no había a qué dispositivo mandarlo, el día siguiente se vuelve a intentar
   mientras la ventana dure, en vez de quedar anotado un mensaje que nadie recibió.

   UN MENSAJE QUE FALLA NO FRENA A LOS DEMÁS. Es el mismo criterio de `revisarVencimientos` y de
   `cortarLosAccesosDadosDeBaja`: lo de un Cliente no puede dejar sin avisar a los otros. */

import { enLaPrestadora } from '../db/connection.js';
import { prestadorasDeLaIntermediacion } from './prestadorasDeLaIntermediacion.js';
import { enviarPushCliente } from './push.js';
import { sumarDias } from './fechas.js';
import { enDia, importeConMoneda } from './comoSeDiceEnUnAviso.js';
import { mensajeDelSistema } from '../i18n/avisos.js';
import { idiomaDeLaPrestadora } from '../i18n/idiomaDeLaPrestadora.js';
import { plazosDeLaPrestadora } from './plazosDeCobroIntermediacion.js';

/**
 * Avisa a los Clientes cuyo período gratuito está por terminar. Corre una vez por día
 * (`backend/src/server.js`).
 *
 * @param {object} [argumentos]
 * @param {Function} [argumentos.avisar]  Por dónde sale el mensaje. Es el push al Cliente, y está
 *                                        como parámetro porque `web-push` sólo entrega contra una
 *                                        dirección segura: la prueba no puede levantar un servicio
 *                                        de push de mentira y necesita poder decir «salió» y «no
 *                                        salió», que es de lo que depende todo lo demás.
 * @returns {Promise<{avisados: number}>}
 */
export async function avisarElPrimerCobroQueViene({ avisar = enviarPushCliente } = {}) {
  const hoy = new Date().toISOString().slice(0, 10);
  let avisados = 0;
  for (const prestadoraId of await prestadorasDeLaIntermediacion()) {
    try {
      avisados += (await avisarElPrimerCobroDeUnaPrestadora(prestadoraId, hoy, { avisar })).avisados;
    } catch (falla) {
      console.error(`Error avisando el primer cobro (prestadora ${prestadoraId}):`, falla.message);
    }
  }
  return { avisados };
}

/**
 * Lo de una sola Prestadora, con la credencial del trabajo de esa Prestadora.
 *
 * @param {string} prestadoraId
 * @param {string} hoy  La fecha del día, `AAAA-MM-DD`.
 * @param {object} [argumentos]
 * @param {Function} [argumentos.avisar]  Igual que en `avisarElPrimerCobroQueViene`.
 * @returns {Promise<{avisados: number}>}
 */
export function avisarElPrimerCobroDeUnaPrestadora(prestadoraId, hoy, { avisar = enviarPushCliente } = {}) {
  return enLaPrestadora(prestadoraId, 'avisar el primer cobro', async (db) => {
    const plazos = await plazosDeLaPrestadora(prestadoraId, undefined, db);
    // Sin plazo no se inventa uno.
    if (!plazos) return { avisados: 0 };
    const hastaCuando = sumarDias(hoy, plazos.dias_de_aviso_antes_del_cobro);

    const { data: accesos, error } = await db
      .from('accesos_intermediacion')
      .select('id, cliente_id, paciente_id, prestadora_id, importe, moneda, gratis_hasta')
      .eq('prestadora_id', prestadoraId)
      .eq('estado', 'vigente')
      .is('cancelada_en', null)
      .is('aviso_previo_en', null)
      .not('gratis_hasta', 'is', null)
      .gte('gratis_hasta', hoy)
      .lte('gratis_hasta', hastaCuando);

    if (error) {
      console.error(`Error consultando los accesos por avisar del primer cobro (prestadora ${prestadoraId}):`, error.message);
      return { avisados: 0 };
    }
    if ((accesos ?? []).length === 0) return { avisados: 0 };

    const idioma = await idiomaDeLaPrestadora(db, prestadoraId);
    let avisados = 0;
    for (const acceso of accesos) {
      let salio = false;
      try {
        salio = await avisar(prestadoraId, acceso.cliente_id, textoDelMensaje(acceso, idioma));
      } catch (falla) {
        console.error('No se pudo avisar del primer cobro a un Cliente:', falla.message);
        continue;
      }
      // Sin dispositivo al que mandarlo no hay nada que anotar: mañana se vuelve a intentar.
      if (!salio) continue;

      const { error: errorAnotar } = await db
        .from('accesos_intermediacion')
        .update({ aviso_previo_en: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', acceso.id)
        .eq('prestadora_id', prestadoraId)
        .is('aviso_previo_en', null);

      if (errorAnotar) {
        // El mensaje salió y la marca no se guardó. Se anota fuerte porque el próximo día lo va a
        // mandar de nuevo: es preferible a no avisar, pero no es lo que tiene que pasar.
        console.error('Aviso del primer cobro enviado y no anotado:', acceso.id, errorAnotar.message);
        continue;
      }
      avisados += 1;
    }
    return { avisados };
  });
}

/** Qué lee el Cliente. Corto y neutro: qué día empieza a cobrarse, cuánto, y que puede darse de
 *  baja antes. El enlace lleva a la pantalla del acceso, que es donde está el botón de la baja.
 *  Se exporta porque el cuerpo del push viaja cifrado: es la única forma de comprobar qué dice. */
export function textoDelMensaje(acceso, idioma) {
  return {
    ...mensajeDelSistema('fin_periodo_sin_cargo', idioma, {
      dia: enDia(acceso.gratis_hasta),
      importe: importeConMoneda(acceso),
    }),
    url: acceso.paciente_id ? `/pacientes/${acceso.paciente_id}/acceso` : '/',
  };
}