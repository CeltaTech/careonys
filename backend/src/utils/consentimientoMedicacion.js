import { enLaPrestadora } from '../db/connection.js';
import { IDIOMAS_SOPORTADOS, normalizarIdioma } from '../i18n/idiomas.js';
import { verificadorDelDocumento } from './documentoConsentimientoPagador.js';
import { textosDeFabrica } from './textosDeFabrica.js';

// El texto que acepta el Cliente cuando carga una medicación, y el interruptor que lo pide.
//
// DE QUIÉN ES EL TEXTO. Es un documento entre la Prestadora y su Cliente, así que es de ella: el
// producto trae un modelo y ella lo adopta, lo cambia o lo reemplaza desde Configuración. Lo de
// de fábrica rige mientras no cargue ninguno, en el idioma en que el Cliente usa la aplicación.
//
// LO FIRMADO SE GUARDA ENTERO. Si mañana la Prestadora cambia su texto, lo que el Cliente aceptó
// fue el de aquel día: se guarda tal cual, con su identificador de verificación y su idioma.
//
// SIN FILA DE CONFIGURACIÓN SE PIDE LA FIRMA. Es el valor que cierra, y la base decide igual: el
// disparador que acepta la indicación pregunta lo mismo con `la_prestadora_pide_la_firma_de_la_medicacion`.

export const MARCADORES = ['{{prestadora}}'];

// El texto de fábrica vive en la base (`textos_consentimiento`, esta clave), por país e idioma.
export const CLAVE_DEL_TEXTO = 'consentimiento_medicacion';

// Con la conexión que trae quien llama, o, si no trae ninguna, con el trabajo de esa Prestadora, que
// sólo alcanza lo suyo.
function conLaPrestadora(prestadoraId, db, trabajo, hacer) {
  return db ? hacer(db) : enLaPrestadora(prestadoraId, trabajo, hacer);
}

// El texto que rige para esta Prestadora en este idioma: el suyo si lo cargó, el modelo si no.
export async function cuerpoVigente({ prestadoraId, idioma, db }) {
  const elIdioma = normalizarIdioma(idioma);
  const [{ data }, deFabrica] = await conLaPrestadora(prestadoraId, db, 'leer el texto de la medicación', (con) =>
    Promise.all([
      con
        .from('textos_consentimiento_medicacion')
        .select('cuerpo, updated_at')
        .eq('prestadora_id', prestadoraId)
        .eq('idioma', elIdioma)
        .maybeSingle(),
      textosDeFabrica({ db: con, prestadoraId, clave: CLAVE_DEL_TEXTO }),
    ]),
  );

  const predeterminado = deFabrica[elIdioma] ?? null;
  return {
    cuerpo: data?.cuerpo ?? predeterminado,
    predeterminado,
    esDelProducto: !data,
    actualizadoEn: data?.updated_at ?? null,
    idioma: elIdioma,
  };
}

// ¿Esta Prestadora pide la firma? Sin fila, sí. Si no se pudo leer, también: falla cerrado.
export async function pideLaFirma({ prestadoraId, db }) {
  if (!prestadoraId) return true;
  const { data, error } = await conLaPrestadora(prestadoraId, db, 'leer si se pide la firma de la medicación', (con) =>
    con.from('configuracion_medicacion').select('pide_firma_del_cliente').eq('prestadora_id', prestadoraId).maybeSingle(),
  );
  if (error || !data) return true;
  return data.pide_firma_del_cliente !== false;
}

export function textoDelConsentimiento({ cuerpo, prestadora }) {
  return cuerpo.split('{{prestadora}}').join(prestadora || '—');
}

// El documento que acepta el Cliente, ya armado: texto, identificador de verificación e idioma.
export async function documentoParaFirmar({ prestadoraId, idioma }) {
  const [{ cuerpo, idioma: elIdioma }, { data: prestadora }] = await enLaPrestadora(
    prestadoraId,
    'armar el consentimiento de la medicación',
    (db) =>
      Promise.all([
        cuerpoVigente({ prestadoraId, idioma, db }),
        db.from('prestadoras').select('nombre_fantasia').eq('id', prestadoraId).maybeSingle(),
      ]),
  );
  const texto = textoDelConsentimiento({ cuerpo, prestadora: prestadora?.nombre_fantasia });
  return { texto, verificador: verificadorDelDocumento(texto), idioma: elIdioma };
}

export const IDIOMAS_DEL_TEXTO = IDIOMAS_SOPORTADOS;
