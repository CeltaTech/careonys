// Grilla de turnos de guardia: tres vistas y cuatro acercamientos.
// ============================================================================
//
// Qué hace y qué NO hace.
//
// Esta grilla sólo dibuja. No consulta la base, no guarda nada y no sabe de sesiones: recibe
// los turnos de guardia ya filtrados y avisa hacia afuera cuando alguien abre, elige, mueve un
// turno o pide mirar otro período. Por eso acá no hay estado de «cargando» ni de «error»: esos
// dos los maneja la pantalla que la usa, que es la que pide los datos. La grilla pone vacío y
// listo.
//
// Los dos ejes.
//
// 1. La VISTA decide contra qué se agrupan las filas: por Asistente, por Paciente o por
//    Servicio. Es el mismo turno de guardia mirado desde otro lado.
// 2. El ACERCAMIENTO decide qué son las columnas: un día, siete días, la cuadrícula de un mes,
//    o las 24 horas de un día. La línea de tiempo existe para ver los turnos que se pisan y los
//    huecos de horario.
//
// Un turno de guardia que dura más de un día se dibuja en cada día que toca, de punta a punta:
// el de lunes 08:00 a jueves 08:00 aparece el lunes, el martes, el miércoles y el jueves, y no se
// corta a las 24. Qué pedazo de cada día ocupa lo dice `lib/agendaTurnosGuardia.js`.
//
// El período.
//
// Si la pantalla de arriba pasa `onNavegar`, la grilla avanza y retrocede sin tope: avisa qué día
// quiere mirar y la pantalla trae los turnos de ese período. Sin `onNavegar` —el banco de
// pruebas del Estado actual— se mueve sólo adentro del rango que recibió, porque un día del que
// no se trajeron turnos se vería vacío y parecería que no hay ninguno.
//
// Ningún color y ningún texto se decide acá: el color sale de `lib/semaforoTurnoGuardia.js` a
// través de `data-tono`, y todo lo que se lee sale de los archivos de traducción.

import { Fragment, useMemo, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { FILA_SIN_CUBRIR, estaSinCubrir, filaDeTurnoGuardia } from '../../lib/cobertura';
import { SIN_PACIENTES, filasPorPaciente, textoDePacientes } from '../../lib/pacientesDeTurnoGuardia';
import { seArrastra } from '../../lib/moverTurnoGuardia';
import { ordenPorUrgencia, situacionDeTurnoGuardia, tonoDeTurnoGuardia } from '../../lib/semaforoTurnoGuardia';
import { finDeTurnoGuardia, hoyISO, inicioDeTurnoGuardia, sumarDias } from '../../lib/horarios';
import {
  VISTAS,
  ZOOMS,
  diasDelRango,
  filaDeServicio,
  horarioSoltadoEnLaHora,
  lunesDeLaSemana,
  moverAncla,
  sinCubrirPorDia,
  tocaElDia,
  tramosDelTurno,
} from '../../lib/agendaTurnosGuardia';
import { diaEnQueTermina, horaCorta, textoDeLaDuracion, textoDelDia, textoDelHorario } from '../../lib/horarioDeTurnoGuardia';
import { con } from '../../lib/textos';

const HORAS_DEL_DIA = 24;
const DIAS_DE_LA_SEMANA = 7;

/* Un lunes cualquiera, para escribir los nombres de los días de la semana en el idioma de la
   persona con el calendario del navegador. Es una fecha de referencia, no un dato. */
const UN_LUNES = '2026-11-02';

// La primera columna de la grilla es siempre el nombre de la fila, y la primera hilera es
// siempre la de encabezados. Las cuentas de posición de la línea de tiempo arrancan después.
const COLUMNAS_ANTES_DE_LOS_DATOS = 1;
const HILERAS_ANTES_DE_LOS_DATOS = 1;

/** ¿El turno ya no cuenta como pendiente de cubrir? Un cancelado no se cubre. */
function cuentaComoHueco(turno_guardia) {
  return turno_guardia.estado !== 'cancelada' && estaSinCubrir(turno_guardia);
}

/**
 * A qué filas pertenece un turno de guardia, según la vista. Siempre devuelve una lista: por
 * Asistente y por Servicio tiene un solo elemento; por Paciente, tantos como personas cubra.
 */
function filasDeTurnoGuardiaSegunVista(turno_guardia, vista) {
  if (vista === 'paciente') return filasPorPaciente(turno_guardia);
  if (vista === 'servicio') return [filaDeServicio(turno_guardia)];
  return [filaDeTurnoGuardia(turno_guardia)];
}

/**
 * Las filas de la grilla, según la vista elegida.
 *
 * La fila de los huecos —sin Asistente en una vista, sin Paciente en la otra— va siempre arriba
 * de todo y lleva la cantidad: es el trabajo pendiente de la Prestadora, no un renglón más. La
 * vista por Servicio no tiene fila de huecos: todo turno de guardia tiene su Servicio.
 */
function filasDeTurnosGuardia(turnos_guardia, vista, t) {
  const porPaciente = vista === 'paciente';
  const porServicio = vista === 'servicio';
  const idHueco = porServicio ? null : porPaciente ? SIN_PACIENTES : FILA_SIN_CUBRIR;
  const nombreHueco = porPaciente ? t.turnos_guardia.fila_sin_paciente : t.turnos_guardia.fila_sin_cubrir;

  const porId = new Map();
  for (const g of turnos_guardia) {
    const entradas = porPaciente
      ? (g.pacientes?.length ? g.pacientes : [{ id: SIN_PACIENTES, nombre: null }])
      : porServicio
        ? [{ id: filaDeServicio(g), nombre: g.servicio_etiqueta }]
        : [{ id: filaDeTurnoGuardia(g), nombre: g.asistente_nombre }];

    for (const entrada of entradas) {
      if (porId.has(entrada.id)) {
        if (entrada.id === idHueco) porId.get(entrada.id).turnos.add(g.id);
        continue;
      }
      const hueco = idHueco !== null && entrada.id === idHueco;
      porId.set(entrada.id, {
        id: entrada.id,
        hueco,
        nombre: hueco ? nombreHueco : entrada.nombre ?? '',
        turnos: new Set(hueco ? [g.id] : []),
      });
    }
  }

  const conNombre = Array.from(porId.values())
    .filter((f) => !f.hueco)
    .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));
  const hueco = idHueco === null ? null : porId.get(idHueco);
  if (!hueco) return conNombre;

  // La cantidad de la fila de los huecos cuenta turnos, no pedazos de turno: uno de tres días
  // sin cubrir es un turno. Los cancelados no cuentan, porque ya no hay que cubrirlos.
  const cantidad = turnos_guardia.filter((g) => hueco.turnos.has(g.id) && g.estado !== 'cancelada').length;
  return [{ ...hueco, cantidad }, ...conNombre];
}

/**
 * Reparte los turnos de guardia de una fila en carriles para que dos que se pisan no queden
 * dibujados uno encima del otro.
 */
function carrilesDeLaFila(turnosGuardiaDeLaFila) {
  const ordenados = [...turnosGuardiaDeLaFila].sort((a, b) => inicioDeTurnoGuardia(a) - inicioDeTurnoGuardia(b));
  const finDeCadaCarril = [];
  const ubicados = [];

  for (const g of ordenados) {
    const arranca = inicioDeTurnoGuardia(g).getTime();
    const termina = finDeTurnoGuardia(g).getTime();
    // Tocarse por el borde no es pisarse: uno que termina a las 14 y otro que empieza a las 14
    // van en el mismo carril.
    let carril = finDeCadaCarril.findIndex((fin) => fin <= arranca);
    if (carril === -1) {
      finDeCadaCarril.push(termina);
      carril = finDeCadaCarril.length - 1;
    } else {
      finDeCadaCarril[carril] = termina;
    }
    ubicados.push({ turno_guardia: g, carril });
  }

  return { ubicados, cantidadDeCarriles: Math.max(1, finDeCadaCarril.length) };
}

export function GrillaTurnosGuardia({
  turnos_guardia = [],    // ya vienen filtrados por la pantalla de arriba
  desde,
  hasta,                  // rango 'AAAA-MM-DD'
  vista,
  onVista,                // 'asistente' | 'paciente' | 'servicio'
  zoom,
  onZoom,                 // 'dia' | 'semana' | 'mes' | 'linea'
  diaElegido,
  onDiaElegido,           // 'AAAA-MM-DD': el día que se mira, y el mes que se mira en Mes
  onNavegar,              // opcional: pedir otro período, sin tope
  ctx,                    // contexto del semáforo: { ahora, umbrales }
  seleccionadas,          // Set de ids
  onAlternarSeleccion,
  onAbrir,
  onMover,
}) {
  const { t, locale } = useLocale();
  const tg = t.turnos_guardia;

  // La grilla funciona con o sin quien la controle desde afuera. Si `vista` y `zoom` llegan,
  // manda la pantalla de arriba; si no, la grilla se acuerda sola de lo que eligió la persona.
  const [vistaLocal, setVistaLocal] = useState('asistente');
  const [zoomLocal, setZoomLocal] = useState('semana');
  const [diaLocal, setDiaLocal] = useState(null);

  const vistaActiva = VISTAS.includes(vista) ? vista : vistaLocal;
  const zoomActivo = ZOOMS.includes(zoom) ? zoom : zoomLocal;
  const navegaSinTope = typeof onNavegar === 'function';

  const hoy = hoyISO();
  const primerDia = desde ?? hoy;
  const dias = useMemo(
    () => diasDelRango(primerDia, hasta ?? sumarDias(primerDia, DIAS_DE_LA_SEMANA - 1)),
    [primerDia, hasta],
  );
  const diaActivo = diaElegido ?? diaLocal ?? dias[0];

  const contexto = useMemo(() => ctx ?? {}, [ctx]);
  const elegidas = seleccionadas ?? new Set();
  const opcionesDelHorario = useMemo(
    () => ({ locale, hoy, textos: { hoy: tg.dia_hoy, manana: tg.listado.dia_manana, duracion: tg.duracion_horas } }),
    [locale, hoy, tg, tg.listado],
  );

  // Qué días se ven: el rango entero en Semana y en Mes, uno solo en Día y en Línea de tiempo.
  const unDiaSolo = zoomActivo === 'dia' || zoomActivo === 'linea';
  const diasVisibles = useMemo(() => (unDiaSolo ? [diaActivo] : dias), [unDiaSolo, diaActivo, dias]);
  const claveDias = diasVisibles.join('|');
  const horas = useMemo(() => Array.from({ length: HORAS_DEL_DIA }, (_, h) => h), []);

  // Un turno se ve si toca algún día visible, aunque haya empezado antes.
  const visibles = useMemo(
    () => turnos_guardia.filter((g) => diasVisibles.some((d) => tocaElDia(g, d))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [turnos_guardia, claveDias],
  );

  const ordenar = (lista) =>
    lista.sort(
      (a, b) =>
        ordenPorUrgencia(a, contexto) - ordenPorUrgencia(b, contexto) ||
        inicioDeTurnoGuardia(a) - inicioDeTurnoGuardia(b),
    );

  const filas = useMemo(() => filasDeTurnosGuardia(visibles, vistaActiva, t), [visibles, vistaActiva, t]);

  // Los pedazos de cada turno en cada día visible, calculados una vez.
  const tramosPorTurno = useMemo(() => {
    const mapa = new Map();
    for (const g of visibles) mapa.set(g.id, tramosDelTurno(g, diasVisibles));
    return mapa;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibles, claveDias]);

  // Los turnos de guardia de cada cruce fila × día, ordenados por urgencia. Uno de varios días
  // está en cada día que toca.
  const porCelda = useMemo(() => {
    const mapa = new Map();
    for (const g of visibles) {
      for (const tramo of tramosPorTurno.get(g.id) ?? []) {
        for (const idFila of filasDeTurnoGuardiaSegunVista(g, vistaActiva)) {
          const clave = `${idFila}__${tramo.fecha}`;
          if (!mapa.has(clave)) mapa.set(clave, []);
          mapa.get(clave).push({ turno_guardia: g, tramo });
        }
      }
    }
    for (const lista of mapa.values()) {
      lista.sort(
        (a, b) =>
          ordenPorUrgencia(a.turno_guardia, contexto) - ordenPorUrgencia(b.turno_guardia, contexto) ||
          inicioDeTurnoGuardia(a.turno_guardia) - inicioDeTurnoGuardia(b.turno_guardia),
      );
    }
    return mapa;
  }, [visibles, tramosPorTurno, vistaActiva, contexto]);

  // Los turnos de cada día de la cuadrícula del mes, sin filas.
  const porDia = useMemo(() => {
    const mapa = new Map();
    for (const g of visibles) {
      for (const tramo of tramosPorTurno.get(g.id) ?? []) {
        if (!mapa.has(tramo.fecha)) mapa.set(tramo.fecha, []);
        mapa.get(tramo.fecha).push({ turno_guardia: g, tramo });
      }
    }
    for (const lista of mapa.values()) {
      lista.sort(
        (a, b) =>
          ordenPorUrgencia(a.turno_guardia, contexto) - ordenPorUrgencia(b.turno_guardia, contexto) ||
          inicioDeTurnoGuardia(a.turno_guardia) - inicioDeTurnoGuardia(b.turno_guardia),
      );
    }
    return mapa;
  }, [visibles, tramosPorTurno, contexto]);

  const huecosPorDia = useMemo(
    () => sinCubrirPorDia(visibles, diasVisibles),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibles, claveDias],
  );

  // La línea de tiempo necesita saber en qué hilera arranca cada fila y cuántos carriles ocupa.
  const filasDeLinea = useMemo(() => {
    let hilera = HILERAS_ANTES_DE_LOS_DATOS + 1;
    return filas.map((fila) => {
      const suyos = visibles.filter((g) => filasDeTurnoGuardiaSegunVista(g, vistaActiva).includes(fila.id));
      const { ubicados, cantidadDeCarriles } = carrilesDeLaFila(ordenar(suyos));
      const desdeHilera = hilera;
      hilera += cantidadDeCarriles;
      return { fila, ubicados, cantidadDeCarriles, desdeHilera };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas, visibles, vistaActiva]);

  // Qué celda está iluminada mientras se arrastra algo por encima, y qué turno se arrastra.
  const [celdaDestino, setCeldaDestino] = useState(null);
  const [arrastrado, setArrastrado] = useState(null);

  function cambiarVista(v) {
    setVistaLocal(v);
    onVista?.(v);
  }

  function cambiarZoom(z) {
    setZoomLocal(z);
    onZoom?.(z);
    // Día y Línea de tiempo miran un día solo. Si nadie eligió cuál, se avisa hacia afuera cuál
    // se está mostrando, para que la pantalla de arriba no quede pensando en otro.
    if ((z === 'dia' || z === 'linea') && !diaElegido) {
      setDiaLocal(diaActivo);
      onDiaElegido?.(diaActivo);
    }
  }

  /* Mirar otro día. Con `onNavegar` no hay tope: la pantalla de arriba trae lo de ese período.
     Sin `onNavegar` no se sale del rango recibido. */
  function cambiarDia(nuevo) {
    if (navegaSinTope) {
      setDiaLocal(nuevo);
      onNavegar(nuevo);
      return;
    }
    if (nuevo < dias[0] || nuevo > dias[dias.length - 1]) return;
    setDiaLocal(nuevo);
    onDiaElegido?.(nuevo);
  }

  /** Desde la cuadrícula del mes, abrir un día en el acercamiento Día. */
  function verElDia(fecha) {
    if (navegaSinTope) {
      setDiaLocal(fecha);
      onNavegar(fecha);
    } else {
      setDiaLocal(fecha);
      onDiaElegido?.(fecha);
    }
    setZoomLocal('dia');
    onZoom?.('dia');
  }

  // ---------------------------------------------------------------------------------------
  // Arrastrar y soltar: qué cambia al soltar depende del acercamiento, y es a propósito.
  //
  // En Día, Semana y Mes, soltar cambia la fecha —y en Día y Semana, la fila—, pero NO la hora.
  // Quien arrastra un turno de un Asistente a otro está reasignándolo, no reprogramándolo.
  //
  // En la Línea de tiempo sí cambia la hora, porque ahí la posición horizontal es la hora. La
  // duración se conserva.
  //
  // En la vista por Servicio y en el Mes sólo cambia la fecha: el turno se suelta en su misma
  // fila, y la pantalla de arriba lo recibe como un cambio de día del mismo Asistente.
  // ---------------------------------------------------------------------------------------
  function admiteSoltar(fila, columna, datos = arrastrado) {
    if (!datos) return false;
    if (zoomActivo === 'mes') return true;
    if (vistaActiva === 'servicio') {
      if (fila.id !== datos.filaOrigen) return false;
    } else if (fila.hueco && vistaActiva !== 'asistente') {
      // Del lado de los Pacientes, quitarle el Paciente a un turno es otra operación.
      return false;
    }
    if (zoomActivo === 'linea') {
      const g = turnos_guardia.find((x) => String(x.id) === String(datos.id));
      return Boolean(g && horarioSoltadoEnLaHora(g, columna.fecha, columna.hora));
    }
    return true;
  }

  function handleDrop(e, fila, columna) {
    e.preventDefault();
    setCeldaDestino(null);
    const datos = arrastrado;
    setArrastrado(null);
    // El estado ya se limpió: se pasa explícito qué se soltó.
    if (!admiteSoltar(fila, columna, datos)) return;

    const turno_guardia = turnos_guardia.find((g) => String(g.id) === String(datos.id));
    if (!turno_guardia) return;

    // En la vista por Servicio y en el Mes, el turno no cambia de fila: se manda como un cambio
    // de día del mismo Asistente.
    const soloLaFecha = zoomActivo === 'mes' || vistaActiva === 'servicio';
    const filaDelAsistente = filaDeTurnoGuardia(turno_guardia);
    const movimiento = {
      turnoGuardiaId: turno_guardia.id,
      fila: soloLaFecha ? filaDelAsistente : fila.id,
      // De qué fila se lo sacó. En la vista por Paciente hace toda la diferencia: un turno que
      // cubre a dos personas está dibujado en dos filas.
      filaOrigen: soloLaFecha ? filaDelAsistente : datos.filaOrigen,
      fecha: columna.fecha,
      vista: soloLaFecha ? 'asistente' : vistaActiva,
    };

    if (zoomActivo === 'linea') {
      const nuevo = horarioSoltadoEnLaHora(turno_guardia, columna.fecha, columna.hora);
      if (!nuevo) return;
      movimiento.horaInicio = nuevo.horaInicio;
      movimiento.horaFin = nuevo.horaFin;
      movimiento.diasHastaElFin = nuevo.diasHastaElFin;
    }

    onMover?.(movimiento);
  }

  function marcarDestino(e, fila, columna, clave) {
    if (!admiteSoltar(fila, columna)) return;
    e.preventDefault();
    setCeldaDestino(clave);
  }

  function propiedadesDeDestino(fila, columna, clave) {
    return {
      onDragOver: (e) => marcarDestino(e, fila, columna, clave),
      onDragLeave: () => setCeldaDestino((actual) => (actual === clave ? null : actual)),
      onDrop: (e) => handleDrop(e, fila, columna),
    };
  }

  function abrirOElegir(e, turno_guardia) {
    // Clic con Ctrl (o Cmd en Mac) suma o saca de la selección; el clic solo abre.
    if (e.ctrlKey || e.metaKey) {
      onAlternarSeleccion?.(turno_guardia);
      return;
    }
    onAbrir?.(turno_guardia);
  }

  function teclaEnChip(e, turno_guardia) {
    if (e.key === 'Enter') {
      e.preventDefault();
      onAbrir?.(turno_guardia);
      return;
    }
    if (e.key === ' ') {
      e.preventDefault();
      onAlternarSeleccion?.(turno_guardia);
    }
  }

  /** El texto que aparece al dejar el puntero sobre un turno: todo lo del turno, en renglones. */
  function resumenDelTurno(turno_guardia, textoEstado) {
    const r = tg.resumen;
    const pacientes = textoDePacientes(
      (turno_guardia.pacientes ?? []).map((p) => p.nombre).filter(Boolean),
      tg.pacientes_y_mas,
      turno_guardia.paciente_nombre || '—',
    );
    const asistente = turno_guardia.asistente_nombre || turno_guardia.pendiente_nombre || tg.fila_sin_cubrir;
    return [
      con(r.horario, { valor: textoDelHorario(turno_guardia, { ...opcionesDelHorario, conDuracion: false }) }),
      con(r.duracion, { valor: textoDeLaDuracion(turno_guardia, { locale, plantilla: tg.duracion_horas }) }),
      con(r.estado, { valor: textoEstado }),
      con(r.asistente, { valor: asistente }),
      con(r.pacientes, { valor: pacientes }),
      turno_guardia.servicio_etiqueta ? con(r.servicio, { valor: turno_guardia.servicio_etiqueta }) : null,
    ]
      .filter(Boolean)
      .join('\n');
  }

  /**
   * Un chip de turno de guardia. `tramo` es el pedazo del día donde se dibuja; `estilo` sólo
   * llega en la línea de tiempo y sólo lleva medidas de posición dentro de la grilla.
   */
  function chipDeTurnoGuardia(turno_guardia, { tramo, estilo, filaOrigen, compacto = false, clave }) {
    const elegida = typeof elegidas.has === 'function' && elegidas.has(turno_guardia.id);
    // Asignado y sin responder todavía: el turno sigue sin cubrir, pero se ve a quién se espera.
    const pendiente = Boolean(turno_guardia.pendiente_nombre);
    const espejo =
      vistaActiva === 'paciente'
        ? turno_guardia.asistente_nombre ?? turno_guardia.pendiente_nombre
        : vistaActiva === 'servicio'
          ? turno_guardia.asistente_nombre ?? turno_guardia.paciente_nombre
          : turno_guardia.paciente_nombre;
    const cuantos = turno_guardia.pacientes?.length ?? 0;
    // La palabra del chip es la SITUACIÓN, no el estado guardado: dos turnos «programados»
    // pueden estar uno en curso y el otro sin marca de llegada. La palabra y el color dicen
    // siempre lo mismo.
    const textoEstado = pendiente
      ? tg.pendiente_de_respuesta
      : tg.situacion[situacionDeTurnoGuardia(turno_guardia, contexto)];
    const horario = textoDelHorario(turno_guardia, { ...opcionesDelHorario, conDia: false, conDuracion: !compacto });
    const continuacion = Boolean(tramo?.empiezaAntes);
    const sigue = Boolean(tramo?.sigueDespues);
    // Sólo se arrastra desde el día en que empieza: los demás pedazos son el mismo turno.
    const arrastrable = seArrastra(turno_guardia) && !continuacion;
    const sinCubrirEnElMes = compacto && vistaActiva !== 'paciente' && cuentaComoHueco(turno_guardia);
    const clases = [
      'grilla-chip',
      elegida && 'grilla-chip-elegida',
      compacto && 'grilla-chip-compacta',
      !arrastrable && 'grilla-chip-fija',
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div
        key={clave ?? turno_guardia.id}
        className={clases}
        data-tono={tonoDeTurnoGuardia(turno_guardia, contexto)}
        data-empieza-antes={continuacion ? 'true' : undefined}
        data-sigue-despues={sigue ? 'true' : undefined}
        style={estilo}
        title={resumenDelTurno(turno_guardia, textoEstado)}
        draggable={arrastrable}
        onDragStart={(e) => {
          if (!arrastrable) {
            e.preventDefault();
            return;
          }
          e.dataTransfer.setData('turnoGuardiaId', String(turno_guardia.id));
          e.dataTransfer.effectAllowed = 'move';
          setArrastrado({ id: turno_guardia.id, filaOrigen: filaOrigen ?? null });
        }}
        onDragEnd={() => {
          setArrastrado(null);
          setCeldaDestino(null);
        }}
        onClick={(e) => abrirOElegir(e, turno_guardia)}
        onKeyDown={(e) => teclaEnChip(e, turno_guardia)}
        role="button"
        tabIndex={0}
        aria-pressed={elegida}
        aria-label={[
          tg.elegir_turno_guardia,
          espejo,
          textoDelHorario(turno_guardia, opcionesDelHorario),
          textoEstado,
        ]
          .filter(Boolean)
          .join(' · ')}
      >
        <div className="grilla-chip-cabecera">
          <span className="grilla-chip-horario">{horario}</span>
          {!compacto && textoEstado && <span className="grilla-chip-detalle">{textoEstado}</span>}
        </div>
        {espejo && <div className="grilla-chip-detalle">{espejo}</div>}
        {pendiente && vistaActiva === 'asistente' && !compacto && (
          <div className="grilla-chip-detalle">{turno_guardia.pendiente_nombre}</div>
        )}
        {sinCubrirEnElMes && <div className="grilla-chip-nota">{tg.fila_sin_cubrir}</div>}
        {cuantos > 1 && !compacto && (
          <div className="grilla-chip-nota">{con(tg.cubre_a_varios, { n: cuantos })}</div>
        )}
        {sigue && !compacto && (
          <div className="grilla-chip-detalle">
            {con(tg.continuacion, {
              fin: `${textoDelDia(diaEnQueTermina(turno_guardia), opcionesDelHorario)} ${horaCorta(turno_guardia.hora_fin)}`,
            })}
          </div>
        )}
      </div>
    );
  }

  /** «3 turnos sin cubrir», o «1 turno sin cubrir». */
  function textoSinCubrir(n) {
    return n === 1 ? tg.sin_cubrir_una : con(tg.sin_cubrir_cantidad, { n });
  }

  // ---------------------------------------------------------------------------------------
  // El período que se mira, escrito, y cómo cambiarlo.
  // ---------------------------------------------------------------------------------------
  const fechaLarga = (f, opciones) => new Date(`${f}T00:00:00`).toLocaleDateString(locale, opciones);
  const textoDelPeriodo =
    zoomActivo === 'mes'
      ? fechaLarga(diaActivo, { month: 'long', year: 'numeric' })
      : zoomActivo === 'semana'
        ? `${fechaLarga(dias[0], { day: 'numeric', month: 'short' })} – ${fechaLarga(dias[dias.length - 1], {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })}`
        : fechaLarga(diaActivo, { weekday: 'long', day: 'numeric', month: 'long' });

  const nombreDelPaso = zoomActivo === 'semana' ? 'semana' : zoomActivo === 'mes' ? 'mes' : 'dia';
  const hoyEstaALaVista = zoomActivo === 'semana' || zoomActivo === 'mes' ? dias.includes(hoy) : diaActivo === hoy;

  // Sin `onNavegar`, Semana y Mes muestran el rango entero recibido y no se mueven.
  const muestraNavegacion = navegaSinTope || unDiaSolo;
  const navegacion = muestraNavegacion && (
    <div className="grilla-dia">
      <div className="grilla-interruptor">
        <button
          type="button"
          onClick={() => cambiarDia(navegaSinTope ? moverAncla(zoomActivo, diaActivo, -1) : sumarDias(diaActivo, -1))}
          disabled={!navegaSinTope && diaActivo <= dias[0]}
        >
          <span aria-hidden="true">‹</span> {tg[`${nombreDelPaso}_anterior`]}
        </button>
        <button
          type="button"
          onClick={() => cambiarDia(navegaSinTope && zoomActivo === 'semana' ? lunesDeLaSemana(hoy) : hoy)}
          disabled={hoyEstaALaVista || (!navegaSinTope && (hoy < dias[0] || hoy > dias[dias.length - 1]))}
        >
          {tg.dia_hoy}
        </button>
        <button
          type="button"
          onClick={() => cambiarDia(navegaSinTope ? moverAncla(zoomActivo, diaActivo, 1) : sumarDias(diaActivo, 1))}
          disabled={!navegaSinTope && diaActivo >= dias[dias.length - 1]}
        >
          {tg[`${nombreDelPaso}_siguiente`]} <span aria-hidden="true">›</span>
        </button>
      </div>
      {/* Qué período se está mirando, escrito. En Línea de tiempo las columnas son horas y la
          fecha no aparece en ningún otro lado. */}
      <span className="grilla-dia-actual">{textoDelPeriodo}</span>
    </div>
  );

  const controles = (
    <div className="grilla-controles">
      <div className="grilla-interruptor">
        {VISTAS.map((v) => (
          <button key={v} type="button" aria-pressed={vistaActiva === v} onClick={() => cambiarVista(v)}>
            {tg[`vista_por_${v}`]}
          </button>
        ))}
      </div>

      <div className="grilla-interruptor">
        {ZOOMS.map((z) => (
          <button key={z} type="button" aria-pressed={zoomActivo === z} onClick={() => cambiarZoom(z)}>
            {tg[`zoom_${z}`]}
          </button>
        ))}
      </div>

      {navegacion}
    </div>
  );

  // ---------------------------------------------------------------------------------------
  // Mes: una cuadrícula de siete columnas, de lunes a domingo. Se dibuja aunque no haya ningún
  // turno, porque los días vacíos también son información.
  // ---------------------------------------------------------------------------------------
  if (zoomActivo === 'mes') {
    const mesQueSeMira = diaActivo.slice(0, 7);
    const blancos = (new Date(`${dias[0]}T12:00:00`).getDay() + 6) % DIAS_DE_LA_SEMANA;
    const nombresDeLosDias = Array.from({ length: DIAS_DE_LA_SEMANA }, (_, i) =>
      fechaLarga(sumarDias(UN_LUNES, i), { weekday: 'short' }),
    );
    return (
      <>
        {controles}
        <div className="grilla-mes">
          {nombresDeLosDias.map((nombre) => (
            <div key={nombre} className="grilla-cabecera grilla-mes-dia-semana">
              {nombre}
            </div>
          ))}
          {Array.from({ length: blancos }, (_, i) => (
            <div key={`blanco-${i}`} className="grilla-mes-blanco" aria-hidden="true" />
          ))}
          {dias.map((fecha) => {
            const clave = `mes__${fecha}`;
            const huecos = huecosPorDia.get(fecha) ?? 0;
            const fila = { id: 'mes', hueco: false };
            const clases = [
              'grilla-celda',
              'grilla-mes-celda',
              fecha.slice(0, 7) !== mesQueSeMira && 'grilla-mes-celda-fuera',
              fecha === hoy && 'grilla-mes-celda-hoy',
              celdaDestino === clave && 'grilla-celda-destino',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <div key={fecha} className={clases} {...propiedadesDeDestino(fila, { fecha }, clave)}>
                <div className="grilla-mes-encabezado">
                  <button
                    type="button"
                    className="grilla-mes-numero"
                    onClick={() => verElDia(fecha)}
                    aria-label={con(tg.ver_dia, { dia: fechaLarga(fecha, { weekday: 'long', day: 'numeric', month: 'long' }) })}
                  >
                    <span className="grilla-mes-nombre-del-dia">{fechaLarga(fecha, { weekday: 'short' })}</span>{' '}
                    {Number(fecha.slice(8, 10))}
                  </button>
                  {huecos > 0 && (
                    <span className="grilla-cantidad" title={textoSinCubrir(huecos)} aria-label={textoSinCubrir(huecos)}>
                      {huecos}
                    </span>
                  )}
                </div>
                {(porDia.get(fecha) ?? []).map(({ turno_guardia, tramo }) =>
                  chipDeTurnoGuardia(turno_guardia, {
                    tramo,
                    filaOrigen: filaDeTurnoGuardia(turno_guardia),
                    compacto: true,
                    clave: `${turno_guardia.id}__${fecha}`,
                  }),
                )}
              </div>
            );
          })}
        </div>
      </>
    );
  }

  // Vacío: no hay ningún turno de guardia que dibujar. Los interruptores y la navegación quedan
  // visibles: si desaparecieran, no habría forma de mirar otro período ni desde otro lado.
  if (filas.length === 0) {
    return (
      <>
        {controles}
        <p className="estado-vacio">{tg.sin_turnos_guardia_rango}</p>
      </>
    );
  }

  const columnas =
    zoomActivo === 'linea'
      ? `12rem repeat(${HORAS_DEL_DIA}, minmax(2.5rem, 1fr))`
      : `12rem repeat(${diasVisibles.length}, minmax(9rem, 1fr))`;

  /** El título de una fila. La de los huecos lleva la cantidad de turnos que tiene. */
  function tituloDeFila(fila, estilo) {
    const etiqueta =
      fila.id === FILA_SIN_CUBRIR ? textoSinCubrir(fila.cantidad) : con(tg.cantidad_turnos, { n: fila.cantidad });
    return (
      <div className={`grilla-fila-titulo${fila.hueco ? ' grilla-fila-titulo-hueco' : ''}`} style={estilo}>
        <span>{fila.nombre}</span>
        {fila.hueco && fila.cantidad > 0 && (
          <span className="grilla-cantidad" title={etiqueta} aria-label={etiqueta}>
            {fila.cantidad}
          </span>
        )}
      </div>
    );
  }

  return (
    <>
      {controles}
      <div className="grilla-wrap">
        <div className="grilla" style={{ gridTemplateColumns: columnas }}>
          <div className="grilla-cabecera grilla-esquina" />

          {zoomActivo === 'linea'
            ? horas.map((h) => (
                <div key={h} className="grilla-cabecera">
                  {con(tg.hora_columna, { hora: String(h).padStart(2, '0') })}
                </div>
              ))
            : diasVisibles.map((fecha) => (
                <div key={fecha} className="grilla-cabecera">
                  {fechaLarga(fecha, { weekday: 'short', day: 'numeric', month: 'short' })}
                </div>
              ))}

          {zoomActivo === 'linea'
            ? filasDeLinea.map(({ fila, ubicados, cantidadDeCarriles, desdeHilera }) => (
                <Fragment key={fila.id}>
                  {tituloDeFila(fila, {
                    gridColumn: COLUMNAS_ANTES_DE_LOS_DATOS,
                    gridRow: `${desdeHilera} / span ${cantidadDeCarriles}`,
                  })}

                  {/* Una celda por hora, alta como todos los carriles de la fila. Son los
                      lugares donde se puede soltar; los turnos se dibujan encima. */}
                  {horas.map((h) => {
                    const clave = `${fila.id}__${h}`;
                    return (
                      <div
                        key={clave}
                        className={`grilla-celda${celdaDestino === clave ? ' grilla-celda-destino' : ''}`}
                        style={{
                          gridColumn: COLUMNAS_ANTES_DE_LOS_DATOS + 1 + h,
                          gridRow: `${desdeHilera} / span ${cantidadDeCarriles}`,
                        }}
                        {...propiedadesDeDestino(fila, { fecha: diaActivo, hora: h }, clave)}
                      />
                    );
                  })}

                  {ubicados.map(({ turno_guardia, carril }) => {
                    const tramo = (tramosPorTurno.get(turno_guardia.id) ?? [])[0];
                    if (!tramo) return null;
                    const primeraHora = Math.max(0, Math.min(HORAS_DEL_DIA - 1, Math.floor(tramo.desdeHora)));
                    const lineaFinal = Math.min(HORAS_DEL_DIA, Math.max(primeraHora + 1, Math.ceil(tramo.hastaHora)));
                    return chipDeTurnoGuardia(turno_guardia, {
                      tramo,
                      estilo: {
                        gridColumn: `${COLUMNAS_ANTES_DE_LOS_DATOS + 1 + primeraHora} / ${COLUMNAS_ANTES_DE_LOS_DATOS + 1 + lineaFinal}`,
                        gridRow: desdeHilera + carril,
                      },
                      filaOrigen: fila.id,
                      clave: `${turno_guardia.id}__${fila.id}`,
                    });
                  })}
                </Fragment>
              ))
            : filas.map((fila) => (
                <Fragment key={fila.id}>
                  {tituloDeFila(fila)}
                  {diasVisibles.map((fecha) => {
                    const clave = `${fila.id}__${fecha}`;
                    return (
                      <div
                        key={clave}
                        className={`grilla-celda${celdaDestino === clave ? ' grilla-celda-destino' : ''}`}
                        {...propiedadesDeDestino(fila, { fecha }, clave)}
                      >
                        {(porCelda.get(clave) ?? []).map(({ turno_guardia, tramo }) =>
                          chipDeTurnoGuardia(turno_guardia, {
                            tramo,
                            filaOrigen: fila.id,
                            clave: `${turno_guardia.id}__${clave}`,
                          }),
                        )}
                      </div>
                    );
                  })}
                </Fragment>
              ))}
        </div>
      </div>
    </>
  );
}
