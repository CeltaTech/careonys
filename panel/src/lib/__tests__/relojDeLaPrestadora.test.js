import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  anotarZonaHoraria,
  diaDelMomento,
  finDeTurnoGuardia,
  horaDeReloj,
  horaDelMomento,
  hoyISO,
  inicioDeTurnoGuardia,
  momentoDelCampo,
  momentoEnLaZona,
  momentoParaElCampo,
  zonaHorariaAnotada,
} from '../horarios';
import { diasParaVencer, fechaLimiteDeAviso } from '../reglaVencimientos';
import { fechaDelMomento } from '../horarioDeTurnoGuardia';
import { desdeElCampo, paraElCampo } from '../momentoDeLaEntrevista';

/* «Hoy» y los turnos de guardia se cuentan con la zona horaria de la Prestadora, nunca con el
   reloj del aparato. Las pruebas no fijan la zona del aparato, así que usan dos zonas que están
   a 25 horas una de la otra: Kiritimati, catorce horas adelante de la hora universal, y Pago Pago,
   once horas atrás. En el mismo instante son días distintos, y el aparato, esté donde esté, no
   puede coincidir con las dos. Contar con el reloj del aparato falla en al menos una. */

const KIRITIMATI = 'Pacific/Kiritimati';
const PAGO_PAGO = 'Pacific/Pago_Pago';
const BUENOS_AIRES = 'America/Argentina/Buenos_Aires';

afterEach(() => {
  anotarZonaHoraria(null);
  vi.useRealTimers();
});

describe('hoy es el día de la Prestadora', () => {
  it('a las 12 de la hora universal, en Kiritimati ya es mañana y en Pago Pago todavía es hoy', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-20T12:00:00Z'));
    anotarZonaHoraria(KIRITIMATI);
    expect(hoyISO()).toBe('2026-11-21');
    anotarZonaHoraria(PAGO_PAGO);
    expect(hoyISO()).toBe('2026-11-20');
  });

  it('a las 22 de Buenos Aires sigue siendo hoy, aunque en hora universal ya sea mañana', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-21T01:00:00Z'));
    anotarZonaHoraria(BUENOS_AIRES);
    expect(hoyISO()).toBe('2026-11-20');
  });

  it('el día de un momento guardado también sale del reloj de la Prestadora', () => {
    anotarZonaHoraria(KIRITIMATI);
    expect(diaDelMomento('2026-11-20T12:00:00Z')).toBe('2026-11-21');
    expect(fechaDelMomento(new Date('2026-11-20T12:00:00Z'))).toBe('2026-11-21');
    anotarZonaHoraria(PAGO_PAGO);
    expect(diaDelMomento('2026-11-20T12:00:00Z')).toBe('2026-11-20');
    // Una fecha sin hora no tiene zona que aplicarle: se devuelve tal cual.
    expect(diaDelMomento('2026-11-20')).toBe('2026-11-20');
  });

  it('los vencimientos cuentan desde el hoy de la Prestadora', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-20T12:00:00Z'));
    anotarZonaHoraria(KIRITIMATI);
    expect(diasParaVencer('2026-11-21')).toBe(0);
    expect(fechaLimiteDeAviso(30)).toBe('2026-12-21');
    anotarZonaHoraria(PAGO_PAGO);
    expect(diasParaVencer('2026-11-21')).toBe(1);
  });
});

describe('el turno de guardia se lee en el reloj de la Prestadora', () => {
  const turno = { fecha: '2026-11-20', hora_inicio: '08:00:00', hora_fin: '16:00:00', dias_hasta_el_fin: 0 };

  it('las 08:00 de Kiritimati son las 18:00 del día anterior en hora universal', () => {
    anotarZonaHoraria(KIRITIMATI);
    expect(inicioDeTurnoGuardia(turno).toISOString()).toBe('2026-11-19T18:00:00.000Z');
    expect(finDeTurnoGuardia(turno).toISOString()).toBe('2026-11-20T02:00:00.000Z');
  });

  it('las 08:00 de Pago Pago son las 19:00 del mismo día en hora universal', () => {
    anotarZonaHoraria(PAGO_PAGO);
    expect(inicioDeTurnoGuardia(turno).toISOString()).toBe('2026-11-20T19:00:00.000Z');
  });

  it('el turno de noche termina al día siguiente, con o sin los días hasta el fin', () => {
    anotarZonaHoraria(BUENOS_AIRES);
    const noche = { fecha: '2026-11-20', hora_inicio: '22:00', hora_fin: '06:00' };
    expect(finDeTurnoGuardia(noche).toISOString()).toBe('2026-11-21T09:00:00.000Z');
    expect(finDeTurnoGuardia({ ...noche, dias_hasta_el_fin: 1 }).toISOString()).toBe('2026-11-21T09:00:00.000Z');
    expect(finDeTurnoGuardia({ ...noche, dias_hasta_el_fin: 3 }).toISOString()).toBe('2026-11-23T09:00:00.000Z');
  });

  it('respeta el cambio de horario de verano de la zona', () => {
    // Nueva York pasa a horario de invierno el 1 de noviembre de 2026: las 08:00 del 31 de octubre
    // son las 12:00 universales y las del 2 de noviembre, las 13:00.
    expect(momentoEnLaZona('2026-10-31', '08:00', 'America/New_York').toISOString()).toBe('2026-10-31T12:00:00.000Z');
    expect(momentoEnLaZona('2026-11-02', '08:00', 'America/New_York').toISOString()).toBe('2026-11-02T13:00:00.000Z');
  });

  it('la hora de un momento guardado es la del reloj de la Prestadora', () => {
    anotarZonaHoraria(KIRITIMATI);
    expect(horaDeReloj(new Date('2026-11-19T18:05:00Z'))).toBe('08:05');
    expect(horaDelMomento('2026-11-19T18:05:00Z', 'es-AR')).toBe('08:05');
    anotarZonaHoraria(PAGO_PAGO);
    expect(horaDeReloj(new Date('2026-11-19T18:05:00Z'))).toBe('07:05');
  });
});

describe('las cajas de fecha y hora hablan en el reloj de la Prestadora', () => {
  it('lo escrito en la caja se guarda como el momento de la Prestadora, y vuelve igual', () => {
    anotarZonaHoraria(KIRITIMATI);
    expect(momentoDelCampo('2026-11-20T08:00').toISOString()).toBe('2026-11-19T18:00:00.000Z');
    expect(momentoParaElCampo('2026-11-19T18:00:00Z')).toBe('2026-11-20T08:00');
    expect(desdeElCampo('2026-11-20T08:00')).toBe('2026-11-19T18:00:00.000Z');
    expect(paraElCampo(desdeElCampo('2026-11-20T08:00'))).toBe('2026-11-20T08:00');
  });

  it('una fecha que no existe no se convierte en otra', () => {
    anotarZonaHoraria(KIRITIMATI);
    expect(momentoDelCampo('2026-13-45T99:99')).toBeNull();
    expect(momentoDelCampo('2026-02-30T08:00')).toBeNull();
    expect(momentoDelCampo('')).toBeNull();
    expect(momentoParaElCampo('cualquier cosa')).toBe('');
  });
});

describe('la zona anotada', () => {
  it('una zona desconocida o vacía no queda anotada', () => {
    anotarZonaHoraria(BUENOS_AIRES);
    expect(zonaHorariaAnotada()).toBe(BUENOS_AIRES);
    anotarZonaHoraria('Marte/Olympus');
    expect(zonaHorariaAnotada()).toBeNull();
    anotarZonaHoraria(BUENOS_AIRES);
    anotarZonaHoraria('');
    expect(zonaHorariaAnotada()).toBeNull();
  });
});
