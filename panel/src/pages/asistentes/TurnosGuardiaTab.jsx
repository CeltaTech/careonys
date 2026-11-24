import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { mensajeDeError } from '../../lib/errores';
import { TONO, claseBadgeTono } from '../../lib/tonos';
import { hoyISO, horaDelMomento } from '../../lib/horarios';
import { fechaDelMomento, textoDelDia, textoDelHorario } from '../../lib/horarioDeTurnoGuardia';
import { textoDePacientes } from '../../lib/pacientesDeTurnoGuardia';
import { TRAMOS, cargarPaginaDeTurnosGuardia } from '../../lib/turnosGuardiaDelAsistente';
import { cargarFaltasDelAsistente } from '../../lib/faltasDelAsistente';
import { fechaVisible } from '../../lib/fechaVisible';
import { EstadoLista } from '../../components/layout/EstadoLista';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { useUmbrales } from '../../context/UmbralesContext';
import '../tarjetas.css';

/* Los turnos de guardia de este Asistente, mirados desde la persona.
   ==========================================================================

   Dos listas separadas: la de hoy en adelante y la de antes de hoy. Van separadas para que un
   turno todavía no trabajado no se lea como un antecedente. Las dos se piden de a páginas y sin
   tope: «Ver más» trae la siguiente mientras haya.

   No se decide nada acá: la situación de cada turno sale del semáforo, a quiénes atiende sale de
   `lib/pacientesDeTurnoGuardia.js`, y el horario escrito, de `lib/horarioDeTurnoGuardia.js`, el
   mismo que usa la pantalla de Turnos de guardia. */

function ListaDeTurnosGuardia({ asistenteId, tramo, titulo, mensajeVacio }) {
  const { t, locale } = useLocale();
  const umbrales = useUmbrales();
  const [filas, setFilas] = useState([]);
  const [hayMas, setHayMas] = useState(false);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [trayendoMas, setTrayendoMas] = useState(false);
  const [errorMas, setErrorMas] = useState(null);

  const pedir = useCallback(
    (yaCargados) => cargarPaginaDeTurnosGuardia({ asistenteId, tramo, yaCargados, hoy: hoyISO(), umbrales }),
    [asistenteId, tramo, umbrales],
  );

  const cargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    setErrorMas(null);
    try {
      const pagina = await pedir(0);
      setFilas(pagina.filas);
      setHayMas(pagina.hayMas);
      setEstado('listo');
    } catch (err) {
      setError(mensajeDeError(err, t));
      setEstado('error');
    }
  }, [pedir, t]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function verMas() {
    setTrayendoMas(true);
    setErrorMas(null);
    try {
      const pagina = await pedir(filas.length);
      setFilas((actuales) => [...actuales, ...pagina.filas]);
      setHayMas(pagina.hayMas);
    } catch (err) {
      setErrorMas(mensajeDeError(err, t));
    } finally {
      setTrayendoMas(false);
    }
  }

  const th = t.asistentes.historial;
  const opcionesDelHorario = {
    locale,
    hoy: hoyISO(),
    textos: { hoy: t.turnos_guardia.dia_hoy, manana: t.turnos_guardia.listado.dia_manana, duracion: t.turnos_guardia.duracion_horas },
  };

  return (
    <section className="panel-tarjeta tarjeta-desplazable">
      <div className="panel-tarjeta-titulo">
        <h2>{titulo}</h2>
      </div>
      <EstadoLista
        estado={estado}
        error={error}
        vacio={estado === 'listo' && filas.length === 0}
        mensajeVacio={mensajeVacio}
        recargar={cargar}
      >
        <table className="panel-tabla">
          <thead>
            <tr>
              <th>{th.col_fecha}</th>
              <th>{th.col_horario}</th>
              <th>{th.col_paciente}</th>
              <th>{th.col_registro}</th>
              <th>{th.col_situacion}</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((g) => (
              <tr key={g.id}>
                <td><b>{textoDelDia(g.fecha, opcionesDelHorario)}</b></td>
                <td>{textoDelHorario(g, { ...opcionesDelHorario, conDia: false })}</td>
                <td>{textoDePacientes(g.pacientes_nombres, t.turnos_guardia.pacientes_y_mas)}</td>
                {/* La llegada y la salida que quedaron registradas. Cuando falta alguna de las
                    dos se dice que no quedó registro, que no es lo mismo que decir que no
                    trabajó: el turno pudo cumplirse y el registro no haberse hecho. */}
                <td>
                  {g.checkin_at || g.checkout_at
                    ? `${horaDelMomento(g.checkin_at, locale) || '—'} – ${horaDelMomento(g.checkout_at, locale) || '—'}`
                    : th.sin_registro}
                </td>
                <td>
                  <span className={claseBadgeTono(g.tono)}>{t.turnos_guardia.situacion[g.situacion]}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {errorMas && <Alert variant="error">{errorMas}</Alert>}
        {hayMas && (
          <Button variant="secondary" onClick={verMas} disabled={trayendoMas}>
            {trayendoMas ? t.comun.cargando : th.ver_mas}
          </Button>
        )}
      </EstadoLista>
    </section>
  );
}

/* Los Reportes Diarios atrasados del Asistente. Se llenan solos: cada turno de guardia en el que
   dejó la guardia al relevo sin presentar el Reporte Diario. El renglón queda aunque el reporte
   llegue después, con la fecha en que llegó; mientras no llega, dice «Pendiente». Sin ninguno, el
   bloque no se dibuja: un recuadro que dice que no hay nada no le sirve a nadie. */
export function FaltasDelAsistente({ asistenteId }) {
  const { t, locale } = useLocale();
  const [filas, setFilas] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);

  const cargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    try {
      setFilas(await cargarFaltasDelAsistente(asistenteId));
      setEstado('listo');
    } catch (err) {
      setError(mensajeDeError(err, t));
      setEstado('error');
    }
  }, [asistenteId, t]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const tf = t.asistentes.faltas;
  if (estado === 'cargando' || (estado === 'listo' && filas.length === 0)) return null;
  const opcionesDelHorario = {
    locale,
    hoy: hoyISO(),
    textos: { hoy: t.turnos_guardia.dia_hoy, manana: t.turnos_guardia.listado.dia_manana, duracion: t.turnos_guardia.duracion_horas },
  };

  return (
    <section className="panel-tarjeta tarjeta-desplazable">
      <div className="panel-tarjeta-titulo">
        <h2>{tf.titulo}</h2>
      </div>
      <EstadoLista
        estado={estado}
        error={error}
        recargar={cargar}
      >
        <table className="panel-tabla">
          <thead>
            <tr>
              <th>{tf.col_fecha}</th>
              <th>{tf.col_paciente}</th>
              <th>{tf.col_falta}</th>
              <th>{tf.col_reporte}</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.id}>
                <td><b>{textoDelDia(f.fecha, opcionesDelHorario)}</b></td>
                <td>{textoDePacientes(f.pacientes_nombres, t.turnos_guardia.pacientes_y_mas)}</td>
                <td>{tf[f.falta]}</td>
                <td>
                  {f.reporteLlegoAt
                    ? fechaVisible(fechaDelMomento(f.reporteLlegoAt), locale)
                    : <span className={claseBadgeTono(TONO.ATENCION)}>{tf.pendiente}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </EstadoLista>
    </section>
  );
}

export function TurnosGuardiaTab({ asistente }) {
  const { t } = useLocale();
  const th = t.asistentes.historial;
  return (
    <>
      <ListaDeTurnosGuardia
        asistenteId={asistente.id}
        tramo={TRAMOS.PROXIMOS}
        titulo={th.titulo_proximos}
        mensajeVacio={th.sin_proximos}
      />
      <ListaDeTurnosGuardia
        asistenteId={asistente.id}
        tramo={TRAMOS.ANTERIORES}
        titulo={th.titulo_anteriores}
        mensajeVacio={th.sin_anteriores}
      />
      <FaltasDelAsistente asistenteId={asistente.id} />
    </>
  );
}
