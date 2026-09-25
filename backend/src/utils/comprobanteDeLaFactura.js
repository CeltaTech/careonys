/* El comprobante que emitió el software de facturación: guardarlo y volver a buscarlo.
   ==========================================================================

   POR QUÉ EXISTE ESTE ARCHIVO. El comprobante entra por dos puertas —firmado, del software
   de facturación, y a mano desde el Panel— y las dos guardan exactamente lo mismo en el mismo
   lugar. Escrito dos veces, alcanza con que una se olvide de una columna para que la misma factura
   quede distinta según por dónde entró (`CLAUDE.md` §8, punto único de verdad).

   EL BACKEND SUBE, NO LA PANTALLA. Las dos puertas le entregan los bytes al backend y el backend los
   deja en el depósito. Así lo que entra del software de facturación —que no tiene sesión de nadie— y
   la carga a mano terminan en el mismo sitio, con la misma ruta y la misma comprobación.

   QUÉ SE COMPRUEBA ACÁ, ADEMÁS DE LO QUE COMPRUEBA EL DEPÓSITO. Que el archivo sea realmente un
   PDF, mirando sus primeros bytes y no lo que diga quien lo manda, y que no esté vacío. El tamaño
   y el tipo declarado los acota también la base, que es quien decide; esto avisa antes.

   LA FACTURA ANTERIOR NO SE PISA. Cada comprobante se guarda con un nombre nuevo, y la factura
   apunta al último. Un comprobante reemplazado queda en el depósito sin que nadie lo alcance:
   borrarlo sería tirar el papel que estuvo vigente. */

import { supabase } from '../db/connection.js';
import {
  DEPOSITO_DE_COMPROBANTES,
  TAMANO_MAXIMO_DEL_COMPROBANTE,
  TIPO_DEL_COMPROBANTE,
  entregaLaFactura,
  rutaDelComprobante,
} from './facturacionDeFamilias.js';

/**
 * Si esta Prestadora entrega la factura desde la aplicación.
 *
 * FALLA CERRADO: si la configuración no se puede leer, esto revienta y no contesta que sí. Quien
 * llama lo trata como un error, nunca como un permiso.
 */
export async function laPrestadoraEntregaLaFactura(prestadoraId) {
  const { data, error } = await supabase
    .from('configuracion_facturacion_familias')
    .select('regla')
    .eq('prestadora_id', prestadoraId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return entregaLaFactura(data?.regla);
}

/** Cuánto dura la dirección firmada con la que se baja un comprobante. Lo que dura una descarga. */
export const SEGUNDOS_DE_LA_DIRECCION_FIRMADA = 60;

/** Los cinco bytes con los que empieza todo PDF. No hay PDF que no los tenga. */
const FIRMA_DEL_PDF = Buffer.from('%PDF-', 'ascii');

/**
 * Qué está mal en lo que llegó, o `null` si no está mal nada.
 *
 * El tipo se mira en el archivo y no en lo que declara quien lo manda: un encabezado lo escribe
 * cualquiera, y lo que se le va a entregar a la Familia es el archivo.
 */
export function loQueEstaMalEnElComprobante(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) return 'el comprobante llegó vacío';
  if (bytes.length > TAMANO_MAXIMO_DEL_COMPROBANTE) return 'el comprobante pesa demasiado';
  if (!bytes.subarray(0, FIRMA_DEL_PDF.length).equals(FIRMA_DEL_PDF)) return 'el comprobante no es un PDF';
  return null;
}

/**
 * Deja el comprobante en el depósito y lo anota en la factura. Devuelve `{ error }`.
 *
 * El filtro de Prestadora va acá y no en quien llama: el backend entra a la base con la llave de
 * servicio, así que si falta ese filtro no lo detiene nadie.
 */
export async function guardarComprobante({ prestadoraId, facturaId, familiaId, bytes }) {
  const ruta = rutaDelComprobante({ prestadoraId, familiaId });

  const { error: errorAlSubir } = await supabase.storage
    .from(DEPOSITO_DE_COMPROBANTES)
    .upload(ruta, bytes, { contentType: TIPO_DEL_COMPROBANTE, upsert: false });
  if (errorAlSubir) return { error: errorAlSubir };

  const ahora = new Date().toISOString();
  const { error } = await supabase
    .from('facturas_familia')
    .update({ comprobante_archivo: ruta, comprobante_subido_at: ahora, updated_at: ahora })
    .eq('id', facturaId)
    .eq('prestadora_id', prestadoraId);
  return { error, ruta };
}

/**
 * Una dirección firmada para bajar el comprobante, o `null` si no se pudo.
 *
 * El depósito es privado: no hay dirección pública, y la firmada vence. Una dirección que no
 * venciera, reenviada una vez, sería el comprobante abierto para siempre.
 */
export async function direccionParaBajarElComprobante(ruta) {
  if (!ruta) return null;
  const { data, error } = await supabase.storage
    .from(DEPOSITO_DE_COMPROBANTES)
    .createSignedUrl(ruta, SEGUNDOS_DE_LA_DIRECCION_FIRMADA, { download: true });
  return error ? null : data.signedUrl;
}
