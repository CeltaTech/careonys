/* El catálogo de listas de opciones que trae el producto, guardado en un archivo.
 *
 * Esto NO es la fuente: la fuente es la base, y es de ahí de donde lo lee toda pantalla. Esto es
 * lo que queda cuando no hay con quién hablar —el aparato se quedó sin internet o el servidor no
 * contesta—, para que un desplegable de fábrica se siga dibujando en vez de quedar vacío.
 *
 * Tiene sólo lo general: lo que agrega cada Prestadora no puede estar acá, porque se carga
 * después y es de ella. Y no tiene identificadores, porque los pone la base: quien lo consume
 * junta por la clave de la lista.
 *
 * Lo que dice este archivo es exactamente lo que la base trae sembrado sin Prestadora en
 * `listas_de_opciones` y `opciones_de_lista`. Si eso cambia, cambia este archivo.
 *
 * `modalidades` ausente quiere decir lo mismo que en la base: esta opción alcanza a todas las
 * modalidades de trabajo. */
export const LISTAS_DE_OPCIONES_DE_FABRICA = {
  disponibilidad: {
    i18n: { 'es-AR': 'Disponibilidad', en: 'Availability', 'pt-BR': 'Disponibilidade' },
    admite_opciones_propias: true,
    opciones: [
      { clave: 'manana', i18n: { 'es-AR': 'Mañana', en: 'Morning', 'pt-BR': 'Manhã' }, orden: 10 },
      { clave: 'tarde', i18n: { 'es-AR': 'Tarde', en: 'Afternoon', 'pt-BR': 'Tarde' }, orden: 20 },
      { clave: 'noche', i18n: { 'es-AR': 'Noche', en: 'Night', 'pt-BR': 'Noite' }, orden: 30 },
      {
        clave: 'fines_semana',
        i18n: { 'es-AR': 'Fines de semana', en: 'Weekends', 'pt-BR': 'Fins de semana' },
        orden: 40,
      },
    ],
  },
  situacion_fiscal: {
    i18n: { 'es-AR': 'Situación fiscal', en: 'Tax status', 'pt-BR': 'Situação fiscal' },
    admite_opciones_propias: false,
    opciones: [
      {
        clave: 'monotributo',
        i18n: {
          'es-AR': 'Monotributo',
          en: 'Monotributo (self-employed)',
          'pt-BR': 'Monotributo (autônomo)',
        },
        orden: 10,
      },
    ],
  },
  medios_de_pago_del_cliente: {
    i18n: {
      'es-AR': 'Medios de pago del Cliente',
      en: 'Client payment methods',
      'pt-BR': 'Meios de pagamento do Cliente',
    },
    admite_opciones_propias: true,
    opciones: [
      {
        clave: 'transferencia',
        i18n: { 'es-AR': 'Transferencia', en: 'Bank transfer', 'pt-BR': 'Transferência' },
        orden: 10,
      },
      { clave: 'efectivo', i18n: { 'es-AR': 'Efectivo', en: 'Cash', 'pt-BR': 'Dinheiro' }, orden: 20 },
      { clave: 'tarjeta', i18n: { 'es-AR': 'Tarjeta', en: 'Card', 'pt-BR': 'Cartão' }, orden: 30 },
      {
        clave: 'debito_automatico',
        i18n: { 'es-AR': 'Débito automático', en: 'Direct debit', 'pt-BR': 'Débito automático' },
        orden: 40,
      },
      { clave: 'cheque', i18n: { 'es-AR': 'Cheque', en: 'Cheque', 'pt-BR': 'Cheque' }, orden: 50 },
      { clave: 'otro', i18n: { 'es-AR': 'Otro', en: 'Other', 'pt-BR': 'Outro' }, orden: 60 },
    ],
  },
  medios_de_pago_al_asistente: {
    i18n: {
      'es-AR': 'Medios de pago al Asistente',
      en: 'Assistant payment methods',
      'pt-BR': 'Meios de pagamento ao Assistente',
    },
    admite_opciones_propias: true,
    opciones: [
      {
        clave: 'transferencia',
        i18n: { 'es-AR': 'Transferencia', en: 'Bank transfer', 'pt-BR': 'Transferência' },
        orden: 10,
      },
      { clave: 'efectivo', i18n: { 'es-AR': 'Efectivo', en: 'Cash', 'pt-BR': 'Dinheiro' }, orden: 20 },
      {
        clave: 'pago_en_bloque',
        i18n: { 'es-AR': 'Pago en bloque', en: 'Bulk payment', 'pt-BR': 'Pagamento em bloco' },
        orden: 30,
        modalidades: ['directa'],
      },
    ],
  },
};

/* Las opciones de una lista, con la misma forma que devuelve la base, para que quien las reciba
   no tenga que distinguir de dónde salieron. */
export function opcionesDeFabrica(claveDeLaLista) {
  const laLista = LISTAS_DE_OPCIONES_DE_FABRICA[claveDeLaLista];
  if (!laLista) return [];
  return laLista.opciones.map((opcion) => ({
    id: `de_fabrica:${claveDeLaLista}:${opcion.clave}`,
    prestadora_id: null,
    clave: opcion.clave,
    i18n: opcion.i18n,
    orden: opcion.orden,
    activa: true,
    modalidades: opcion.modalidades ?? null,
  }));
}
