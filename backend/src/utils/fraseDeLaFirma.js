import { frase } from '../i18n/mensajesDelSistema.js';

// La frase que va al pie del documento firmado con el enlace, en lugar de los renglones para firmar a
// mano. Una sola para todos los que la muestran: el Panel, la página del enlace y lo que se descarga.
//
// La base guarda el instante, y la fecha y la hora se escriben en la zona que pasa quien la llama: el
// Panel pasa la de la Prestadora, leída de la base; la página del enlace, la del navegador de quien mira.
//
// Sin Email guardado no hay frase: un documento firmado antes de que se guardara no la inventa.
export function fraseDeLaFirma({ consentimiento, idioma, zona, prestadoraId }) {
  if (consentimiento?.cerrado_como !== 'firmado_con_el_enlace') return null;
  if (!consentimiento.firmado_con_email || !consentimiento.cerrado_en) return null;

  const instante = new Date(consentimiento.cerrado_en);
  const timeZone = zonaValida(zona, idioma);
  const fecha = instante.toLocaleDateString(idioma, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone });
  const hora = instante.toLocaleTimeString(idioma, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone });

  return frase(
    'documento_para_firmar.firmado_electronicamente',
    idioma,
    { email: consentimiento.firmado_con_email, fecha, hora },
    prestadoraId,
  );
}

// Una zona que el navegador mandó mal no rompe la página: se escribe en la del servidor.
function zonaValida(zona, idioma) {
  if (typeof zona !== 'string' || !zona) return undefined;
  try {
    new Intl.DateTimeFormat(idioma, { timeZone: zona });
    return zona;
  } catch {
    return undefined;
  }
}
