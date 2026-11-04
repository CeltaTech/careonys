import crypto from 'node:crypto';

// Arma el documento que firma el Pagador, y su identificador de verificación.
//
// QUÉ ES ESTE TEXTO Y DE QUIÉN ES. Es un documento entre la Prestadora y un tercero de ella, así
// que es de ella: el producto trae un modelo y ella lo adopta, lo cambia o lo reemplaza por el
// suyo desde Configuración. El de fábrica está en la base y rige mientras no cargue ninguno. Que es un modelo,
// que no es asesoramiento legal y que adoptarlo es decisión suya se lo dice la pantalla donde lo
// ve, no este texto: adentro del documento que firma el Pagador esa aclaración no tiene sentido.
//
// POR QUÉ EL DOCUMENTO SE GUARDA Y NO SE VUELVE A ARMAR. Si mañana la Prestadora cambia su modelo,
// esta función devolvería otro texto. Lo que el Pagador firmó fue el de aquel día: se guarda
// entero, tal cual, y lo que se muestra después es lo guardado.
//
// POR QUÉ EL IDENTIFICADOR DE VERIFICACIÓN. Sin él el registro dice que firmó y no dice QUÉ
// firmó. Con él, si alguien le mueve una coma al texto guardado, deja de coincidir. No es firma digital —eso se evaluó y se
// descartó para la instrucción de las personas autorizadas, y acá vale lo mismo—: es la constancia de que
// el texto no cambió desde que se firmó.
//
// EL DOCUMENTO VA EN CASTELLANO, y así queda anotado en `documento_idioma`. El día que una
// Prestadora cargue el suyo en otro idioma, el campo ya está puesto para distinguirlos.
export const IDIOMA_DEL_DOCUMENTO = 'es-AR';

// Los marcadores que se reemplazan en el cuerpo, sea el modelo de fábrica o el que cargó la
// Prestadora. Están acá, en un solo lugar, porque la pantalla de Configuración los tiene que
// mostrar para que quien escriba su propio texto sepa cuáles puede usar.
export const MARCADORES = ['{{prestadora}}', '{{pagador}}', '{{documento}}', '{{cliente}}', '{{apoderado}}', '{{fecha}}'];

// `{{apoderado}}` no se comporta como los demás, y por eso está nombrado aparte. Una entidad no
// firma con la mano: firma por ella su Apoderado, que es quien tiene poder legal para obligarla.
// Cuando quien paga es una persona física no hay nadie en el medio, y entonces el renglón donde
// está el marcador se saca entero. Dejarlo con una raya diría que falta un dato, cuando lo que
// pasa es que ahí no corresponde ninguno.
const MARCADOR_APODERADO = '{{apoderado}}';

function fechaLegible(fecha) {
  return new Intl.DateTimeFormat(IDIOMA_DEL_DOCUMENTO, {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(fecha);
}

/**
 * Reemplaza los marcadores del cuerpo con lo de esta contratación.
 *
 * `cuerpo` es el que cargó la Prestadora, o el de fábrica si no cargó ninguno. Lo que falte
 * queda como raya: un marcador sin dato se ve, y verlo es lo que hace que alguien lo complete. Un
 * marcador desconocido se deja como está, porque borrarlo escondería el error de quien lo escribió.
 *
 * `apoderado` es la excepción: sin él, el renglón entero desaparece. Ver arriba.
 */
export function textoDelConsentimiento({ cuerpo, prestadora, pagador, cliente, apoderado, fecha }) {
  const valores = {
    '{{prestadora}}': prestadora?.nombre || '—',
    '{{pagador}}': pagador?.nombre || '—',
    '{{documento}}': pagador?.documento || '—',
    '{{cliente}}': cliente?.nombre || '—',
    '{{fecha}}': fechaLegible(fecha ?? new Date()),
  };

  let texto = cuerpo;

  if (apoderado?.nombre) {
    valores[MARCADOR_APODERADO] = apoderado.nombre;
  } else {
    texto = texto
      .split('\n')
      .filter((renglon) => !renglon.includes(MARCADOR_APODERADO))
      .join('\n');
  }

  for (const [marcador, valor] of Object.entries(valores)) {
    texto = texto.split(marcador).join(valor);
  }
  return texto;
}

export function verificadorDelDocumento(texto) {
  return crypto.createHash('sha256').update(texto, 'utf8').digest('hex');
}
