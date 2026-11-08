/**
 * La frase de la firma del documento firmado con el enlace.
 *
 *   npm test --prefix backend
 *
 * Lo que tiene que cumplir: sale sólo cuando se firmó con el enlace y quedó guardado el Email al
 * que se mandó; dice ese Email, y la fecha y la hora en la zona de quien mira, no en la del
 * servidor. Las frases son las que siembra la base.
 */
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { sembrarMensajesDelSistema } from '../../i18n/mensajesDelSistema.js';
import { filasSembradas } from '../../i18n/__tests__/mensajesSembrados.js';
import { fraseDeLaFirma } from '../fraseDeLaFirma.js';

sembrarMensajesDelSistema(filasSembradas());

const FIRMADO = {
  cerrado_como: 'firmado_con_el_enlace',
  cerrado_en: '2026-11-08T19:09:00Z',
  firmado_con_email: 'pagador@ejemplo.test',
};

describe('fraseDeLaFirma', () => {
  it('dice el Email, la fecha y la hora en la zona de quien mira', () => {
    const texto = fraseDeLaFirma({ consentimiento: FIRMADO, idioma: 'es-AR', zona: 'America/Argentina/Buenos_Aires' });
    assert.equal(
      texto,
      'Firmado electrónicamente mediante el enlace enviado a su cuenta de correo pagador@ejemplo.test el 08/11/2026 a las 16:09.',
    );
  });

  it('cambia la hora con la zona', () => {
    const texto = fraseDeLaFirma({ consentimiento: FIRMADO, idioma: 'es-AR', zona: 'Europe/Madrid' });
    assert.match(texto, /el 08\/11\/2026 a las 20:09\.$/);
  });

  it('una zona inválida no rompe', () => {
    assert.ok(fraseDeLaFirma({ consentimiento: FIRMADO, idioma: 'es-AR', zona: 'No/Existe' }).includes('pagador@ejemplo.test'));
  });

  it('sale en el idioma del documento', () => {
    const texto = fraseDeLaFirma({ consentimiento: FIRMADO, idioma: 'pt-BR', zona: 'America/Sao_Paulo' });
    assert.match(texto, /^Assinado eletronicamente .* pagador@ejemplo\.test em 08\/11\/2026 às 16:09\.$/);
  });

  it('no sale si se cerró de otra forma', () => {
    assert.equal(fraseDeLaFirma({ consentimiento: { ...FIRMADO, cerrado_como: 'documento_firmado' }, idioma: 'es-AR' }), null);
  });

  it('no inventa el Email si no quedó guardado', () => {
    assert.equal(fraseDeLaFirma({ consentimiento: { ...FIRMADO, firmado_con_email: null }, idioma: 'es-AR' }), null);
  });
});
