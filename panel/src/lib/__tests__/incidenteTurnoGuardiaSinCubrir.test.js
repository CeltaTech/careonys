/**
 * Que un turno vacío se vuelva grave cuando tiene que volverse grave, y no antes ni en silencio.
 *
 *   npx vitest run src/lib/__tests__/incidenteTurnoGuardiaSinCubrir.test.js
 *
 * POR QUÉ EXISTE. De esta cuenta sale si queda o no constancia de un turno que nadie cubrió.
 * Equivocarla hacia arriba abre expedientes de turnos que todavía tienen margen y los vuelve
 * ruido; equivocarla hacia abajo deja un turno sin nadie sin que nadie tenga que dar cuenta de él,
 * que es exactamente lo que pasaba antes de que esto existiera.
 */
import { describe, expect, it } from 'vitest';
import {
  CIERRES,
  CIERRES_HISTORICOS,
  CIERRES_POSIBLES,
  REGLA_DEL_INCIDENTE,
  REGLA_QUE_SE_PUEDE_TOCAR,
  elTurnoGuardiaYaEsGrave,
  esDefectoGrave,
  esDefectoGraveDeFabrica,
  finalesQueSeOfrecen,
  horasHastaElTurnoGuardia,
  reglaDelIncidenteDe,
  revisarCierre,
  revisarRegla,
  soloLoQueCorreDeLaRegla,
  valorDelFinal,
} from '../incidenteTurnoGuardiaSinCubrir';

// Las 08:00 del 10 de marzo en Buenos Aires, que está tres horas atrás de la hora universal.
const ZONA = 'America/Argentina/Buenos_Aires';
const AHORA = new Date('2026-03-10T11:00:00Z');

/** Un turno programado que empieza a la hora indicada y todavía no tiene a nadie. */
function nuevoTurnoGuardia({ fecha = '2026-03-10', hora = '20:00', ...resto } = {}) {
  return { asistente_id: null, estado: 'programada', fecha, hora_inicio: hora, ...resto };
}

describe('cuántas horas faltan', () => {
  it('cuenta hacia adelante y hacia atrás', () => {
    expect(horasHastaElTurnoGuardia(nuevoTurnoGuardia({ hora: '20:00' }), AHORA, ZONA)).toBe(12);
    expect(horasHastaElTurnoGuardia(nuevoTurnoGuardia({ hora: '06:00' }), AHORA, ZONA)).toBe(-2);
  });

  // Cerca de la medianoche la hora universal ya es otro día que la de Argentina. A las 22:00 del
  // 20 de noviembre de Buenos Aires —la 01:00 del 21 en hora universal— faltan dos horas y media
  // para el turno de las 00:30 del 21. Leída en hora universal, esa hora ya habría pasado.
  // El aparato se pone en hora universal, como el servidor, para que la cuenta vieja no acierte
  // por casualidad en un aparato que está en Argentina.
  it('cerca de la medianoche cuenta con el día de la Prestadora, no con el de la hora universal', () => {
    const zonaDelAparato = process.env.TZ;
    process.env.TZ = 'UTC';
    try {
      const turno_guardia = nuevoTurnoGuardia({ fecha: '2026-11-21', hora: '00:30' });
      expect(horasHastaElTurnoGuardia(turno_guardia, new Date('2026-11-21T01:00:00Z'), ZONA)).toBe(2.5);
    } finally {
      if (zonaDelAparato === undefined) delete process.env.TZ;
      else process.env.TZ = zonaDelAparato;
    }
  });

  // El aparato que corre la prueba está en una sola zona, y no puede coincidir con dos que están
  // a 25 horas una de la otra. Una cuenta hecha con el reloj del aparato falla en al menos una.
  it('la misma hora de reloj da otra cuenta en otra zona', () => {
    const turno_guardia = nuevoTurnoGuardia({ fecha: '2026-11-21', hora: '00:30' });
    const ahora = new Date('2026-11-20T10:00:00Z');
    expect(horasHastaElTurnoGuardia(turno_guardia, ahora, 'Pacific/Kiritimati')).toBe(0.5);
    expect(horasHastaElTurnoGuardia(turno_guardia, ahora, 'Pacific/Pago_Pago')).toBe(25.5);
  });

  // Sin la zona de la Prestadora no hay cuenta: caer al reloj del aparato sería contar mal sin avisar.
  it('sin zona, o con una que no existe, contesta que no se sabe', () => {
    expect(horasHastaElTurnoGuardia(nuevoTurnoGuardia(), AHORA)).toBe(null);
    expect(horasHastaElTurnoGuardia(nuevoTurnoGuardia(), AHORA, '')).toBe(null);
    expect(horasHastaElTurnoGuardia(nuevoTurnoGuardia(), AHORA, 'Marte/Olympus_Mons')).toBe(null);
    // Con zona este mismo turno es grave (faltan 12 horas); sin zona, no se puede decir que lo sea.
    expect(elTurnoGuardiaYaEsGrave({ turno_guardia: nuevoTurnoGuardia(), ahora: AHORA, zona: ZONA })).toBe(true);
    expect(elTurnoGuardiaYaEsGrave({ turno_guardia: nuevoTurnoGuardia(), ahora: AHORA })).toBe(false);
  });

  // Sin fecha o sin hora no hay cuenta posible, y un cero parecería un dato: diría que el turno
  // empieza ahora mismo.
  it('sin fecha o sin hora contesta que no se sabe, no cero', () => {
    expect(horasHastaElTurnoGuardia(nuevoTurnoGuardia({ fecha: null }), AHORA, ZONA)).toBe(null);
    expect(horasHastaElTurnoGuardia(nuevoTurnoGuardia({ hora: null }), AHORA, ZONA)).toBe(null);
    expect(horasHastaElTurnoGuardia(null, AHORA, ZONA)).toBe(null);
  });
});

describe('cuándo el turno ya es grave', () => {
  it('lo es cuando entra en las horas configuradas y sigue sin nadie', () => {
    expect(elTurnoGuardiaYaEsGrave({ turno_guardia: nuevoTurnoGuardia({ hora: '20:00' }), ahora: AHORA, zona: ZONA })).toBe(true);
  });

  it('no lo es mientras falte más que eso', () => {
    expect(elTurnoGuardiaYaEsGrave({ turno_guardia: nuevoTurnoGuardia({ fecha: '2026-03-12' }), ahora: AHORA, zona: ZONA })).toBe(false);
  });

  // Que se haya hecho tarde no lo arregla: el expediente tiene que quedar abierto para que alguien
  // diga cómo terminó.
  it('sigue siendo grave después de la hora de inicio', () => {
    expect(elTurnoGuardiaYaEsGrave({ turno_guardia: nuevoTurnoGuardia({ hora: '06:00' }), ahora: AHORA, zona: ZONA })).toBe(true);
  });

  it('un turno con Asistente asignada no es grave', () => {
    const turno_guardia = nuevoTurnoGuardia({ asistente_id: 'a-1' });
    expect(elTurnoGuardiaYaEsGrave({ turno_guardia, ahora: AHORA, zona: ZONA })).toBe(false);
  });

  // Un turno cancelado no deja a nadie sin atender.
  it('un turno que ya no está en pie no es grave', () => {
    const turno_guardia = nuevoTurnoGuardia({ estado: 'cancelada' });
    expect(elTurnoGuardiaYaEsGrave({ turno_guardia, ahora: AHORA, zona: ZONA })).toBe(false);
  });

  // La comprobación tiene que poder fallar: con el borde de fábrica este turno no es grave, y con
  // el que corrió esta Prestadora sí. Si no mirara la configuración, las dos darían lo mismo.
  it('obedece el número que corrió la Prestadora', () => {
    const turno_guardia = nuevoTurnoGuardia({ fecha: '2026-03-12', hora: '08:00' });
    expect(elTurnoGuardiaYaEsGrave({ turno_guardia, ahora: AHORA, zona: ZONA })).toBe(false);
    expect(elTurnoGuardiaYaEsGrave({ turno_guardia, regla: { horas_para_abrirlo: 72 }, ahora: AHORA, zona: ZONA })).toBe(true);
  });

  it('sin turno no inventa nada', () => {
    expect(elTurnoGuardiaYaEsGrave()).toBe(false);
  });
});

describe('los números de cada Prestadora', () => {
  it('sin configuración rigen los de fábrica', () => {
    expect(reglaDelIncidenteDe(null)).toEqual(REGLA_DEL_INCIDENTE);
    expect(reglaDelIncidenteDe({})).toEqual(REGLA_DEL_INCIDENTE);
  });

  it('un valor fuera de los bordes no entra: rige el de fábrica', () => {
    const fuera = REGLA_QUE_SE_PUEDE_TOCAR.horas_para_abrirlo.maximo + 1;
    expect(reglaDelIncidenteDe({ horas_para_abrirlo: fuera }).horas_para_abrirlo)
      .toBe(REGLA_DEL_INCIDENTE.horas_para_abrirlo);
    expect(reglaDelIncidenteDe({ horas_para_abrirlo: 0 }).horas_para_abrirlo)
      .toBe(REGLA_DEL_INCIDENTE.horas_para_abrirlo);
  });

  it('avisa qué valor está mal antes de guardarlo', () => {
    expect(revisarRegla({ horas_entre_recordatorios: 4 })).toEqual({ ok: true });
    expect(revisarRegla({ horas_entre_recordatorios: 0 }))
      .toEqual({ ok: false, clave: 'horas_entre_recordatorios' });
    expect(revisarRegla({ una_clave_que_no_existe: 1 }))
      .toEqual({ ok: false, clave: 'una_clave_que_no_existe' });
  });

  // Guardar lo que coincide con fábrica congelaría a esa Prestadora el día que el valor de fábrica
  // cambie: quedaría con el viejo sin haber decidido nada.
  it('sólo se guarda lo que difiere de fábrica', () => {
    const corridos = soloLoQueCorreDeLaRegla({
      horas_para_abrirlo: REGLA_DEL_INCIDENTE.horas_para_abrirlo,
      horas_entre_recordatorios: 6,
    });
    expect(corridos).toEqual({ horas_entre_recordatorios: 6 });
  });
});

describe('cómo puede terminar', () => {
  it('quedar sin nadie es un defecto grave de fábrica, cubrirlo no', () => {
    expect(esDefectoGraveDeFabrica(CIERRES.NO_FUE_NADIE)).toBe(true);
    expect(esDefectoGraveDeFabrica(CIERRES.QUEDO_SOLO_CON_CONSENTIMIENTO)).toBe(true);
    expect(esDefectoGraveDeFabrica(CIERRES.LLEGO_UN_RELEVO)).toBe(false);
    expect(esDefectoGraveDeFabrica(CIERRES.YA_NO_HACIA_FALTA)).toBe(false);
  });

  it('los finales viejos se siguen leyendo como lo que fueron', () => {
    expect(esDefectoGraveDeFabrica('quedo_un_familiar')).toBe(true);
    expect(esDefectoGraveDeFabrica('cubierto')).toBe(false);
    expect(CIERRES_HISTORICOS).not.toContain(CIERRES.LLEGO_UN_RELEVO);
  });

  it('un final que no está en la lista no pasa por bueno', () => {
    expect(esDefectoGraveDeFabrica('cualquier_otra_cosa')).toBe(false);
    expect(CIERRES_POSIBLES).toEqual(Object.values(CIERRES));
  });
});

describe('lo que dice la fila del catálogo, y no el código', () => {
  it('si es una falla lo decide la fila, incluso para un final que inventó la Prestadora', () => {
    expect(esDefectoGrave({ nombre: 'Lo cubrió el vecino', es_defecto_grave: true })).toBe(true);
    // Y al revés: la Prestadora puede decidir que para ella quedar solo no es una falla.
    expect(
      esDefectoGrave({ clave: CIERRES.QUEDO_SOLO_CON_CONSENTIMIENTO, es_defecto_grave: false })
    ).toBe(false);
  });

  it('sin fila no se inventa una acusación', () => {
    expect(esDefectoGrave(null)).toBe(false);
    expect(esDefectoGrave(undefined)).toBe(false);
  });

  it('lo que se guarda es la clave del producto o el nombre que escribió la Prestadora', () => {
    expect(valorDelFinal({ clave: CIERRES.NO_FUE_NADIE, nombre: null })).toBe('no_fue_nadie');
    expect(valorDelFinal({ clave: null, nombre: 'Lo cubrió el vecino' })).toBe('Lo cubrió el vecino');
    expect(valorDelFinal(null)).toBe(null);
  });
});

describe('cuáles se le ofrecen a quien cierra', () => {
  const catalogo = [
    { clave: CIERRES.SE_RESOLVIO_DE_OTRA_MANERA, activo: true, lo_escribe_el_sistema: false, orden: 99 },
    { clave: CIERRES.LLEGO_UN_RELEVO, activo: true, lo_escribe_el_sistema: true, orden: 10 },
    { clave: CIERRES.NO_FUE_NADIE, activo: true, lo_escribe_el_sistema: false, orden: 60 },
    { clave: CIERRES.YA_NO_HACIA_FALTA, activo: true, lo_escribe_el_sistema: true, orden: 20 },
    { nombre: 'Apagado', activo: false, lo_escribe_el_sistema: false, orden: 5 },
  ];

  it('los dos que escribe el backend no se ofrecen, y los apagados tampoco', () => {
    const ofrecidos = finalesQueSeOfrecen(catalogo).map(valorDelFinal);
    expect(ofrecidos).toEqual([CIERRES.NO_FUE_NADIE, CIERRES.SE_RESOLVIO_DE_OTRA_MANERA]);
  });

  it('sin catálogo no revienta: contesta que no hay ninguno', () => {
    expect(finalesQueSeOfrecen(null)).toEqual([]);
    expect(finalesQueSeOfrecen(undefined)).toEqual([]);
  });
});

describe('el cierre antes de mandarlo', () => {
  it('sin elegir un final no se cierra nada', () => {
    expect(revisarCierre({ fila: null, detalle: 'algo' })).toEqual({ ok: false, campo: 'final' });
    expect(revisarCierre()).toEqual({ ok: false, campo: 'final' });
  });

  it('el final que pide detalle no se conforma con espacios en blanco', () => {
    const fila = { clave: CIERRES.SE_RESOLVIO_DE_OTRA_MANERA, pide_detalle: true };
    expect(revisarCierre({ fila, detalle: '   ' })).toEqual({ ok: false, campo: 'detalle' });
    expect(revisarCierre({ fila })).toEqual({ ok: false, campo: 'detalle' });
    expect(revisarCierre({ fila, detalle: 'Fue la sobrina, que es enfermera' })).toEqual({ ok: true });
  });

  it('el final que no pide detalle se cierra sin escribir nada', () => {
    const fila = { clave: CIERRES.NO_FUE_NADIE, pide_detalle: false };
    expect(revisarCierre({ fila })).toEqual({ ok: true });
  });
});
