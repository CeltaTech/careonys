import { describe, it, expect } from 'vitest';
import { cambiaElResponsableDePagos, facturaAlResponsable } from '../responsableDePagosDelServicio';

const PERSONA = '00000000-0000-0000-0000-0000000000a1';
const OTRA = '00000000-0000-0000-0000-0000000000a2';

describe('a nombre de quién sale la factura, según la pantalla', () => {
  it('sin indicación la factura no va al Responsable de pagos', () => {
    expect(facturaAlResponsable({ pagador_persona_id: PERSONA })).toBe(false);
  });

  it('con indicación y persona, va al Responsable de pagos', () => {
    expect(facturaAlResponsable({ pagador_persona_id: PERSONA, factura_al_responsable: true })).toBe(true);
  });

  it('la indicación sin persona no vale', () => {
    expect(facturaAlResponsable({ pagador_persona_id: null, factura_al_responsable: true })).toBe(false);
  });
});

describe('cuándo cambia el Responsable de pagos', () => {
  const deHoy = { pagador_persona_id: PERSONA, pagador_tipo: 'otro', factura_al_responsable: false };

  it('lo mismo que rige hoy no es un cambio', () => {
    expect(cambiaElResponsableDePagos({ ...deHoy }, deHoy)).toBe(false);
  });

  it('otra persona es un cambio', () => {
    expect(cambiaElResponsableDePagos({ ...deHoy, pagador_persona_id: OTRA }, deHoy)).toBe(true);
  });

  it('otro tipo es un cambio', () => {
    expect(cambiaElResponsableDePagos({ ...deHoy, pagador_tipo: 'obra_social' }, deHoy)).toBe(true);
  });

  it('encender la indicación es un cambio', () => {
    expect(cambiaElResponsableDePagos({ ...deHoy, factura_al_responsable: true }, deHoy)).toBe(true);
  });

  it('apagar la indicación es un cambio', () => {
    const conIndicacion = { ...deHoy, factura_al_responsable: true };
    expect(cambiaElResponsableDePagos({ ...deHoy }, conIndicacion)).toBe(true);
  });

  it('sin Responsable de pagos hoy ni elegido no hay cambio', () => {
    expect(cambiaElResponsableDePagos({ pagador_persona_id: null, pagador_tipo: '' }, null)).toBe(false);
  });
});
