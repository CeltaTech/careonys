/* Qué datos de una persona del Directorio salen hacia el software de facturación.
   ==========================================================================

   Una sola lista para todo lo que se manda a facturar —la prestación directa y los accesos del
   Match—, para que el software de facturación reciba a la persona siempre con el mismo formato.
   Es la selección de columnas de `personas` que se lee antes de armar lo que sale. */

export const DATOS_PARA_FACTURAR =
  'id, nombre_visible, nombre, apellido, documento_tipo, documento_numero, documento_pais, calle, numero, piso, unidad, codigo_postal, email';
