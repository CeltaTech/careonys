import { describe, expect, it, vi } from 'vitest';

vi.mock('../supabaseClient', () => ({ supabase: {} }));

import {
  DIAS_DE_LA_CUADRICULA,
  desdeDeLaConsulta,
  diasDelRango,
  horarioSoltadoEnLaHora,
  leerPreferencia,
  lunesDeLaSemana,
  moverAncla,
  rangoDeVista,
  sinCubrirPorDia,
  tocaElRango,
  tramosDelTurno,
  ultimoDelMes,
} from '../agendaTurnosGuardia';
import {
  diaEnQueTermina,
  horaCorta,
  terminaOtroDia,
  textoDeLaDuracion,
  textoDelDia,
  textoDelHorario,
} from '../horarioDeTurnoGuardia';
import {
  correspondeLaAccion,
  fechaDuplicada,
  horarioCorrido,
  vistaPreviaDelHorarioCorrido,
} from '../accionesMasivasTurnosGuardia';

const turno = (extra) => ({
  id: 'g1',
  fecha: '2026-11-02',
  hora_inicio: '08:00:00',
  hora_fin: '16:00:00',
  dias_hasta_el_fin: 0,
  estado: 'programada',
  asistente_id: 'a1',
  ...extra,
});

describe('el rango de cada acercamiento', () => {
  it('la semana va de lunes a domingo, aunque se mire un miércoles o un domingo', () => {
    expect(rangoDeVista('semana', '2026-11-04')).toEqual({ desde: '2026-11-02', hasta: '2026-11-08' });
    expect(rangoDeVista('semana', '2026-11-08')).toEqual({ desde: '2026-11-02', hasta: '2026-11-08' });
    expect(lunesDeLaSemana('2026-11-02')).toBe('2026-11-02');
  });

  it('el mes es la cuadrícula entera: del lunes de la semana del 1 al domingo de la del último día', () => {
    // Noviembre de 2026 empieza un domingo y termina un lunes: seis semanas.
    const { desde, hasta } = rangoDeVista('mes', '2026-11-17');
    expect(desde).toBe('2026-10-26');
    expect(hasta).toBe('2026-12-06');
    expect(diasDelRango(desde, hasta)).toHaveLength(42);
    expect(DIAS_DE_LA_CUADRICULA).toBe(42);
  });

  it('un mes que empieza el lunes y termina el domingo son cuatro semanas justas', () => {
    // Febrero de 2027 empieza un lunes y tiene 28 días.
    const { desde, hasta } = rangoDeVista('mes', '2027-02-10');
    expect(desde).toBe('2027-02-01');
    expect(hasta).toBe('2027-02-28');
    expect(diasDelRango(desde, hasta)).toHaveLength(28);
  });

  it('el último día del mes respeta los bisiestos y diciembre', () => {
    expect(ultimoDelMes('2028-02-03')).toBe('2028-02-29');
    expect(ultimoDelMes('2026-12-15')).toBe('2026-12-31');
  });

  it('día y línea de tiempo miran un día solo', () => {
    expect(rangoDeVista('dia', '2026-11-04')).toEqual({ desde: '2026-11-04', hasta: '2026-11-04' });
    expect(rangoDeVista('linea', '2026-11-04')).toEqual({ desde: '2026-11-04', hasta: '2026-11-04' });
  });

  it('anterior y siguiente avanzan lo que mira cada acercamiento, sin tope', () => {
    expect(moverAncla('dia', '2026-11-30', 1)).toBe('2026-12-01');
    expect(moverAncla('semana', '2026-11-04', -1)).toBe('2026-10-28');
    // Desde un 31 no se saltean dos meses.
    expect(moverAncla('mes', '2027-01-31', 1)).toBe('2027-02-01');
    expect(moverAncla('mes', '2027-01-15', -1)).toBe('2026-12-01');
    expect(moverAncla('mes', '2026-12-15', 1)).toBe('2027-01-01');
  });

  it('la consulta empieza tantos días antes como dura el turno más largo, sin tope', () => {
    expect(desdeDeLaConsulta('2026-11-02', 10)).toBe('2026-10-23');
    expect(desdeDeLaConsulta('2026-11-02', 1)).toBe('2026-11-01');
  });

  it('sin turnos largos, o con un dato que no se entiende, la consulta arranca el mismo día', () => {
    expect(desdeDeLaConsulta('2026-11-02')).toBe('2026-11-02');
    expect(desdeDeLaConsulta('2026-11-02', 0)).toBe('2026-11-02');
    expect(desdeDeLaConsulta('2026-11-02', -2)).toBe('2026-11-02');
    expect(desdeDeLaConsulta('2026-11-02', null)).toBe('2026-11-02');
  });
});

describe('los turnos de guardia de varios días', () => {
  const largo = turno({ fecha: '2026-11-02', hora_inicio: '08:00', hora_fin: '08:00', dias_hasta_el_fin: 3 });

  it('un turno de 72 horas toca el rango de un día en que no empezó', () => {
    expect(tocaElRango(largo, '2026-11-04', '2026-11-04')).toBe(true);
    // Termina el jueves a las 08:00: el viernes ya no lo tiene.
    expect(tocaElRango(largo, '2026-11-06', '2026-11-06')).toBe(false);
    expect(tocaElRango(largo, '2026-11-01', '2026-11-01')).toBe(false);
  });

  it('se dibuja de punta a punta: cuatro tramos, sin cortarse a las 24', () => {
    const dias = diasDelRango('2026-11-02', '2026-11-08');
    const tramos = tramosDelTurno(largo, dias);
    expect(tramos.map((x) => x.fecha)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05']);
    expect(tramos[0]).toMatchObject({ desdeHora: 8, hastaHora: 24, empiezaAntes: false, sigueDespues: true });
    expect(tramos[1]).toMatchObject({ desdeHora: 0, hastaHora: 24, empiezaAntes: true, sigueDespues: true });
    expect(tramos[3]).toMatchObject({ desdeHora: 0, hastaHora: 8, empiezaAntes: true, sigueDespues: false });
  });

  it('el turno de noche ocupa dos días y el segundo termina a las 06:00', () => {
    const noche = turno({ hora_inicio: '22:00', hora_fin: '06:00', dias_hasta_el_fin: 1 });
    const tramos = tramosDelTurno(noche, ['2026-11-02', '2026-11-03']);
    expect(tramos).toHaveLength(2);
    expect(tramos[0]).toMatchObject({ desdeHora: 22, hastaHora: 24, sigueDespues: true });
    expect(tramos[1]).toMatchObject({ desdeHora: 0, hastaHora: 6, empiezaAntes: true });
  });

  it('un turno que termina justo a la medianoche no aparece en el día siguiente', () => {
    const hastaLas24 = turno({ hora_inicio: '16:00', hora_fin: '00:00', dias_hasta_el_fin: 1 });
    expect(tramosDelTurno(hastaLas24, ['2026-11-02', '2026-11-03']).map((x) => x.fecha)).toEqual(['2026-11-02']);
  });

  it('los sin cubrir se cuentan en cada día que tocan, y los cancelados no', () => {
    const dias = ['2026-11-02', '2026-11-03', '2026-11-04'];
    const cuenta = sinCubrirPorDia(
      [
        turno({ asistente_id: null, hora_inicio: '22:00', hora_fin: '06:00', dias_hasta_el_fin: 1 }),
        turno({ id: 'g2', asistente_id: null, estado: 'cancelada' }),
        turno({ id: 'g3' }),
      ],
      dias,
    );
    expect(cuenta.get('2026-11-02')).toBe(1);
    expect(cuenta.get('2026-11-03')).toBe(1);
    expect(cuenta.has('2026-11-04')).toBe(false);
  });
});

describe('soltar un turno en otra hora de la línea de tiempo', () => {
  it('si el fin cae al otro día, se suelta igual y cambian los días hasta el fin', () => {
    const tarde = turno({ hora_inicio: '20:00', hora_fin: '23:00', dias_hasta_el_fin: 0 });
    expect(horarioSoltadoEnLaHora(tarde, '2026-11-02', 23)).toEqual({ horaInicio: '23:00', horaFin: '02:00', diasHastaElFin: 1 });
  });

  it('el turno de noche soltado a la mañana pasa a terminar el mismo día', () => {
    const noche = turno({ hora_inicio: '22:00', hora_fin: '06:00', dias_hasta_el_fin: 1 });
    expect(horarioSoltadoEnLaHora(noche, '2026-11-03', 8)).toEqual({ horaInicio: '08:00', horaFin: '16:00', diasHastaElFin: 0 });
  });

  it('conserva los minutos y la duración de un turno de varios días', () => {
    const largo = turno({ hora_inicio: '08:30', hora_fin: '23:30', dias_hasta_el_fin: 3 });
    expect(horarioSoltadoEnLaHora(largo, '2026-11-02', 10)).toEqual({ horaInicio: '10:30', horaFin: '01:30', diasHastaElFin: 4 });
  });

  it('sin día o sin hora no hay dónde soltarlo', () => {
    expect(horarioSoltadoEnLaHora(turno(), null, 8)).toBeNull();
    expect(horarioSoltadoEnLaHora(turno(), '2026-11-02', undefined)).toBeNull();
  });
});

describe('el horario escrito', () => {
  const textos = { hoy: 'Hoy', manana: 'Mañana', duracion: '{horas} h' };
  const opciones = { locale: 'es-AR', hoy: '2026-11-02', textos };

  it('el mismo día: un solo día, las dos horas sin segundos y la duración', () => {
    expect(textoDelHorario(turno(), opciones)).toBe('Hoy 08:00–16:00 · 8 h');
    expect(horaCorta('08:00:00')).toBe('08:00');
  });

  it('el turno de noche dice el día en que termina', () => {
    const noche = turno({ hora_inicio: '22:00', hora_fin: '06:00', dias_hasta_el_fin: 1 });
    expect(terminaOtroDia(noche)).toBe(true);
    expect(diaEnQueTermina(noche)).toBe('2026-11-03');
    expect(textoDelHorario(noche, opciones)).toBe('Hoy 22:00 – Mañana 06:00 · 8 h');
  });

  it('el de 72 horas no se lee como 08:00–08:00', () => {
    const largo = turno({ hora_inicio: '08:00', hora_fin: '08:00', dias_hasta_el_fin: 3 });
    const texto = textoDelHorario(largo, opciones);
    expect(texto.startsWith('Hoy 08:00 – ')).toBe(true);
    expect(texto).toContain(textoDelDia('2026-11-05', opciones));
    expect(texto.endsWith('· 72 h')).toBe(true);
  });

  it('sin el día de inicio, donde el día ya está a la vista', () => {
    expect(textoDelHorario(turno(), { ...opciones, conDia: false })).toBe('08:00–16:00 · 8 h');
    expect(textoDelHorario(turno(), { ...opciones, conDia: false, conDuracion: false })).toBe('08:00–16:00');
  });

  it('la duración con decimales usa la coma del idioma', () => {
    const media = turno({ hora_inicio: '08:00', hora_fin: '15:30' });
    expect(textoDeLaDuracion(media, { locale: 'es-AR', plantilla: '{horas} h' })).toBe('7,5 h');
    expect(textoDeLaDuracion(media, { locale: 'en', plantilla: '{horas} h' })).toBe('7.5 h');
    expect(textoDeLaDuracion(media, { locale: 'es-AR', plantilla: undefined })).toBe('');
  });
});

describe('las acciones de a muchos', () => {
  it('correr el horario corre el día cuando cruza la medianoche, y la duración no cambia', () => {
    const noche = turno({ hora_inicio: '22:00', hora_fin: '06:00', dias_hasta_el_fin: 1 });
    expect(horarioCorrido(noche, 180)).toEqual({
      fecha: '2026-11-03',
      hora_inicio: '01:00',
      hora_fin: '09:00',
      dias_hasta_el_fin: 0,
    });
    expect(horarioCorrido(turno(), -60)).toEqual({
      fecha: '2026-11-02',
      hora_inicio: '07:00',
      hora_fin: '15:00',
      dias_hasta_el_fin: 0,
    });
  });

  it('correr el horario no tiene tope de días: un turno puede pasar a terminar cuatro días después', () => {
    // Lunes 08:00 a jueves 23:00, corrido dos horas: termina el viernes a la 01:00.
    const largo = turno({ hora_inicio: '08:00', hora_fin: '23:00', dias_hasta_el_fin: 3 });
    expect(horarioCorrido(largo, 120)).toEqual({
      fecha: '2026-11-02',
      hora_inicio: '10:00',
      hora_fin: '01:00',
      dias_hasta_el_fin: 4,
    });
    const semana = turno({ hora_inicio: '08:00', hora_fin: '08:00', dias_hasta_el_fin: 7 });
    expect(horarioCorrido(semana, 60)).toEqual({
      fecha: '2026-11-02',
      hora_inicio: '09:00',
      hora_fin: '09:00',
      dias_hasta_el_fin: 7,
    });
  });

  it('correr con minutos que no se entienden no devuelve nada para guardar', () => {
    expect(horarioCorrido(turno(), 'x')).toBeNull();
    expect(horarioCorrido(null, 60)).toBeNull();
  });

  it('el adelanto de correr el horario muestra el día del fin cuando cambia', () => {
    const textos = { hoy: 'Hoy', manana: 'Mañana', duracion: '{horas} h' };
    const opciones = { locale: 'es-AR', hoy: '2026-11-02', textos };
    const tarde = turno({ hora_inicio: '20:00', hora_fin: '23:00', dias_hasta_el_fin: 0 });
    expect(vistaPreviaDelHorarioCorrido(tarde, 180, opciones)).toBe('Hoy 20:00–23:00 → Hoy 23:00 – Mañana 02:00');
    expect(vistaPreviaDelHorarioCorrido(turno(), 60, opciones)).toBe('Hoy 08:00–16:00 → Hoy 09:00–17:00');
    expect(vistaPreviaDelHorarioCorrido(turno(), 'x', opciones)).toBeNull();
  });

  it('el adelanto de un turno de cuatro días escribe los dos días', () => {
    const textos = { hoy: 'Hoy', manana: 'Mañana', duracion: '{horas} h' };
    const opciones = { locale: 'es-AR', hoy: '2026-11-02', textos };
    const largo = turno({ hora_inicio: '08:00', hora_fin: '23:00', dias_hasta_el_fin: 3 });
    const texto = vistaPreviaDelHorarioCorrido(largo, 120, opciones);
    const [, despues] = texto.split(' → ');
    expect(despues).toBe(`Hoy 10:00 – ${textoDelDia('2026-11-06', opciones)} 01:00`);
  });

  it('duplicar a otra semana suma siete días por semana', () => {
    expect(fechaDuplicada(turno(), 2)).toBe('2026-11-16');
  });

  it('cada acción alcanza sólo a los turnos que admiten el cambio', () => {
    const enCurso = turno({ estado: 'activa', checkin_at: '2026-11-02T08:01:00Z' });
    const ausente = turno({ estado: 'ausente' });
    expect(correspondeLaAccion('reasignar', turno())).toBe(true);
    expect(correspondeLaAccion('reasignar', ausente)).toBe(false);
    expect(correspondeLaAccion('correr', enCurso)).toBe(false);
    expect(correspondeLaAccion('cancelar', enCurso)).toBe(true);
    expect(correspondeLaAccion('cancelar', ausente)).toBe(false);
    expect(correspondeLaAccion('duplicar', ausente)).toBe(true);
    expect(correspondeLaAccion('otra', turno())).toBe(false);
  });
});

describe('la preferencia recordada', () => {
  it('sin dónde leer, vuelve al valor de arranque sin romperse', () => {
    expect(leerPreferencia('vista', 'u1', ['lista', 'grilla'], 'grilla')).toBe('grilla');
  });
});
