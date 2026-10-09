import { supabase } from '../db/connection.js';
import { IDIOMAS_SOPORTADOS, normalizarIdioma } from '../i18n/idiomas.js';
import { huellaDelDocumento } from './documentoConsentimientoPagador.js';

// El texto que acepta el Cliente cuando carga una medicación, y el interruptor que lo pide.
//
// DE QUIÉN ES EL TEXTO. Es un documento entre la Prestadora y su Cliente, así que es de ella: el
// producto trae un modelo y ella lo adopta, lo cambia o lo reemplaza desde Configuración. Lo de
// acá rige mientras no cargue ninguno, en el idioma en que el Cliente usa la aplicación.
//
// LO FIRMADO SE GUARDA ENTERO. Si mañana la Prestadora cambia su texto, lo que el Cliente aceptó
// fue el de aquel día: se guarda tal cual, con su huella y su idioma.
//
// SIN FILA DE CONFIGURACIÓN SE PIDE LA FIRMA. Es el valor que cierra, y la base decide igual: el
// disparador que acepta la indicación pregunta lo mismo con `la_prestadora_pide_la_firma_de_la_medicacion`.

export const MARCADORES = ['{{prestadora}}'];

export const MODELO_DE_FABRICA = {
  'es-AR': [
    'Declaro bajo juramento que los datos correspondientes a la prescripción médica —incluyendo el tratamiento, la medicación, la dosificación, la frecuencia, la vía de administración y la vigencia del período indicado— concuerdan fiel y exactamente con lo dispuesto por el profesional médico tratante.',
    '',
    'En virtud de ello, asumo plena y exclusiva responsabilidad por la correcta carga e ingreso de dicha información en el sistema.',
    '',
    'La entidad {{prestadora}} y el personal interviniente en la administración de la medicación actuarán sobre la base de la información registrada en el sistema, la cual reviste carácter de declaración jurada, quedando liberados de toda responsabilidad derivada de errores, omisiones o inexactitudes en la carga efectuada por el declarante.',
  ].join('\n'),
  en: [
    'I declare under oath that the data of the medical prescription —including the treatment, the medication, the dosage, the frequency, the route of administration and the validity of the indicated period— faithfully and exactly match what was ordered by the treating physician.',
    '',
    'Accordingly, I assume full and exclusive responsibility for the correct entry of this information into the system.',
    '',
    'The entity {{prestadora}} and the staff involved in administering the medication will act on the basis of the information recorded in the system, which has the nature of a sworn statement, and are released from all liability arising from errors, omissions or inaccuracies in the entry made by the declarant.',
  ].join('\n'),
  'pt-BR': [
    'Declaro sob juramento que os dados correspondentes à prescrição médica —incluindo o tratamento, a medicação, a dosagem, a frequência, a via de administração e a vigência do período indicado— correspondem fiel e exatamente ao disposto pelo profissional médico responsável.',
    '',
    'Em virtude disso, assumo plena e exclusiva responsabilidade pelo correto cadastro e inserção dessas informações no sistema.',
    '',
    'A entidade {{prestadora}} e o pessoal envolvido na administração da medicação atuarão com base nas informações registradas no sistema, as quais têm caráter de declaração juramentada, ficando isentos de toda responsabilidade decorrente de erros, omissões ou inexatidões no cadastro efetuado pelo declarante.',
  ].join('\n'),
};

// El texto que rige para esta Prestadora en este idioma: el suyo si lo cargó, el modelo si no.
export async function cuerpoVigente({ prestadoraId, idioma, db = supabase }) {
  const elIdioma = normalizarIdioma(idioma);
  const { data } = await db
    .from('textos_consentimiento_medicacion')
    .select('cuerpo, updated_at')
    .eq('prestadora_id', prestadoraId)
    .eq('idioma', elIdioma)
    .maybeSingle();

  return {
    cuerpo: data?.cuerpo ?? MODELO_DE_FABRICA[elIdioma],
    esDelProducto: !data,
    actualizadoEn: data?.updated_at ?? null,
    idioma: elIdioma,
  };
}

// ¿Esta Prestadora pide la firma? Sin fila, sí. Si no se pudo leer, también: falla cerrado.
export async function pideLaFirma({ prestadoraId, db = supabase }) {
  const { data, error } = await db
    .from('configuracion_medicacion')
    .select('pide_firma_del_cliente')
    .eq('prestadora_id', prestadoraId)
    .maybeSingle();
  if (error || !data) return true;
  return data.pide_firma_del_cliente !== false;
}

export function textoDelConsentimiento({ cuerpo, prestadora }) {
  return cuerpo.split('{{prestadora}}').join(prestadora || '—');
}

// El documento que acepta el Cliente, ya armado: texto, huella e idioma.
export async function documentoParaFirmar({ prestadoraId, idioma }) {
  const [{ cuerpo, idioma: elIdioma }, { data: prestadora }] = await Promise.all([
    cuerpoVigente({ prestadoraId, idioma }),
    supabase.from('prestadoras').select('nombre_fantasia').eq('id', prestadoraId).maybeSingle(),
  ]);
  const texto = textoDelConsentimiento({ cuerpo, prestadora: prestadora?.nombre_fantasia });
  return { texto, huella: huellaDelDocumento(texto), idioma: elIdioma };
}

export const IDIOMAS_DEL_TEXTO = IDIOMAS_SOPORTADOS;
