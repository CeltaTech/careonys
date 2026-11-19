import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useLocale } from '../../i18n/LocaleContext';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { useConfirmarDestructivo } from '../../context/ConfirmacionContext';
import { EstadoLista } from '../../components/layout/EstadoLista';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';
import { Alert } from '../../components/ui/Alert';
import { ESTADO_EN_CURSO, turnosGuardiaSinCerrar } from '../../lib/turnoGuardiaSinCerrar';
import { diasDeEspera, hoyISO } from '../../lib/horarios';
import { cargarPacientesDeTurnosGuardia, conPacientes, textoDePacientes } from '../../lib/pacientesDeTurnoGuardia';
import { mensajeDeError } from '../../lib/errores';
import { useModalAccesible } from '../../hooks/useModalAccesible';
import { useAlarmasTomadas } from '../../hooks/useAlarmasTomadas';
import { LaTomoYo } from '../../components/continuidad/LaTomoYo';
import { TIPOS_DE_ALARMA } from '../../lib/alarmasTomadas';
import { usePrestadoraActual } from '../../hooks/usePrestadoraActual';

import { FICHA_NOMBRE, conSusFichas } from '../../lib/fichaDelPaciente';

// Los turnos de guardia que nadie cerró: el Coordinador (y el Admin de la Prestadora) las ve acá y las
// cierra él.
//
// POR QUÉ ES UNA SECCIÓN APARTE Y NO PARTE DE LA GRILLA
// La pantalla de Guardias muestra un rango de fechas que arranca en hoy, y el Estado actual mira
// unos pocos días para atrás. Un turno de guardia olvidado el mes pasado no aparece en ninguna de las
// dos: envejece justo fuera de la vista. Esta sección hace la pregunta contraria —todo lo que
// quedó abierto, sin importar cuándo— y por eso trae sus propios datos y no mira los filtros de
// arriba. Es un componente cerrado sobre sí mismo: si más adelante se decide que su lugar es el
// Estado actual, se mueve la etiqueta y ya está.
//
// QUÉ HACE EL CIERRE, Y SOBRE TODO QUÉ NO HACE
// Deja el turno de guardia en `completada` y anota quién la cerró, cuándo y que fue desde el Panel. No
// escribe hora ni lugar de salida: el check-out dice que el Asistente se fue de la casa, y eso
// nadie lo vio. Poner una hora inventada la volvería indistinguible de una salida marcada de
// verdad, y el informe a la Obra Social necesita poder diferenciarlas.
//
// Y no cierra nada por su cuenta: cada turno de guardia se cierra de a una, con una persona apretando el
// botón, escribiendo por qué y confirmando.

const ID_DE_LA_SECCION = 'turnos-guardia-sin-cerrar';

export function TurnosGuardiaSinCerrar({ onCerrada }) {
  const { t } = useLocale();
  const prestadoraId = usePrestadoraActual();
  const { usuario } = useAuth();
  const confirmarDestructivo = useConfirmarDestructivo();
  const [filas, setFilas] = useState([]);
  const [estadoCarga, setEstadoCarga] = useState('cargando');
  const [error, setError] = useState(null);
  const [aCerrar, setACerrar] = useState(null);
  const tomas = useAlarmasTomadas();
  const { hash } = useLocation();

  const cargar = useCallback(async () => {
    if (!prestadoraId) return;
    setEstadoCarga('cargando');
    setError(null);

    const hoy = hoyISO();
    const [{ data: turnosGuardiaData, error: errorTurnosGuardia }, { data: asistentesData }, { data: pacientesData }] =
      await Promise.all([
        // Las tres condiciones son las de `lib/turnoGuardiaSinCerrar.js`, preguntadas a la base para
        // no traerse la tabla entera. El filtro se vuelve a aplicar en memoria más abajo, así la
        // regla se cumple una sola vez aunque la consulta y la comprobación vivan separadas.
        supabase
          .from('turnos_guardia')
          .select('*')
          .eq('prestadora_id', prestadoraId)
          .eq('estado', ESTADO_EN_CURSO)
          .is('checkout_at', null)
          .lt('fecha', hoy)
          .order('fecha', { ascending: true })
          .order('hora_inicio', { ascending: true }),
        supabase.from('asistentes').select('id, nombre').eq('prestadora_id', prestadoraId),
        supabase.from('pacientes').select(`id, ${FICHA_NOMBRE}`).eq('prestadora_id', prestadoraId),
      ]);

    if (errorTurnosGuardia) {
      setError(mensajeDeError(errorTurnosGuardia, t));
      setEstadoCarga('error');
      return;
    }

    const asistentesPorId = Object.fromEntries((asistentesData ?? []).map((a) => [a.id, a.nombre]));
    const pacientesPorId = Object.fromEntries(conSusFichas(pacientesData).map((p) => [p.id, p.nombre]));
    const pacientesPorTurnoGuardia = await cargarPacientesDeTurnosGuardia((turnosGuardiaData ?? []).map((g) => g.id));

    const sinCerrar = turnosGuardiaSinCerrar(turnosGuardiaData ?? [], hoy);
    setFilas(
      conPacientes(sinCerrar, pacientesPorTurnoGuardia, pacientesPorId).map((g) => ({
        ...g,
        asistente_nombre: asistentesPorId[g.asistente_id] || '—',
        dias: diasDeEspera(g.fecha, hoy),
      }))
    );
    setEstadoCarga('listo');
  }, [prestadoraId, t]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // El enlace de un turno que hay que cerrar llega con `#turnos-guardia-sin-cerrar`: con la lista ya
  // cargada, se baja hasta acá.
  useEffect(() => {
    if (hash === `#${ID_DE_LA_SECCION}` && estadoCarga === 'listo') {
      document.getElementById(ID_DE_LA_SECCION)?.scrollIntoView();
    }
  }, [hash, estadoCarga]);

  async function alCerrarUna() {
    await cargar();
    if (onCerrada) await onCerrada();
  }

  return (
    <div className="dashboard-seccion" id={ID_DE_LA_SECCION}>
      <div className="dashboard-seccion-header">
        <h2 className="dashboard-seccion-titulo">{t.turnos_guardia_sin_cerrar.titulo}</h2>
      </div>

      {/* `vacio` va en falso a propósito: el cartel de vacío que trae EstadoLista invita a crear
          el primer dato, y acá que la lista esté vacía es la buena noticia —no hay nada que
          cerrar—. Los estados de cargando y de error sí salen de ahí, que es donde tienen que
          estar escritos una sola vez. */}
      <EstadoLista estado={estadoCarga} error={error} vacio={false} recargar={cargar}>
        {filas.length === 0 ? (
          <div className="estado-vacio-bloque">
            <p className="estado-vacio-titulo">{t.turnos_guardia_sin_cerrar.vacio_titulo}</p>
            <p className="estado-vacio">{t.turnos_guardia_sin_cerrar.vacio_ayuda}</p>
          </div>
        ) : (
          <table className="panel-tabla">
            <thead>
              <tr>
                <th>{t.turnos_guardia_sin_cerrar.col_fecha}</th>
                <th>{t.turnos_guardia_sin_cerrar.col_horario}</th>
                <th>{t.turnos_guardia_sin_cerrar.col_asistente}</th>
                <th>{t.turnos_guardia_sin_cerrar.col_paciente}</th>
                <th>{t.turnos_guardia_sin_cerrar.col_espera}</th>
                <th>{t.turnos_guardia_sin_cerrar.col_accion}</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((g) => (
                <tr key={g.id}>
                  <td>{g.fecha}</td>
                  <td>{g.hora_inicio} – {g.hora_fin}</td>
                  <td>{g.asistente_nombre}</td>
                  <td>{textoDePacientes(g.pacientes_nombres, t.turnos_guardia.pacientes_y_mas)}</td>
                  <td>
                    <span className="badge badge-atencion">
                      {g.dias === 1
                        ? t.turnos_guardia_sin_cerrar.espera_un_dia
                        : t.turnos_guardia_sin_cerrar.espera_dias.replace('{n}', String(g.dias))}
                    </span>
                  </td>
                  <td>
                    {!tomas.laTieneOtraPersona(TIPOS_DE_ALARMA.TURNO_GUARDIA_SIN_CERRAR, g.id) && (
                      <Button variant="secondary" onClick={() => setACerrar(g)}>
                        {t.turnos_guardia_sin_cerrar.cerrar}
                      </Button>
                    )}
                    {/* Cerrarla es el final; tomarla es decir que alguien la está averiguando
                        ahora, para que el mensaje no siga llegándole a los demás mientras tanto. */}
                    <LaTomoYo
                      tipo={TIPOS_DE_ALARMA.TURNO_GUARDIA_SIN_CERRAR}
                      referenciaId={g.id}
                      {...tomas}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </EstadoLista>

      {aCerrar && (
        <CerrarTurnoGuardiaModal
          turno_guardia={aCerrar}
          usuario={usuario}
          confirmarDestructivo={confirmarDestructivo}
          onClose={() => setACerrar(null)}
          onCerrada={alCerrarUna}
        />
      )}
    </div>
  );
}

// El cierre se hace en su propia ventana y no con un botón suelto en la fila, porque hay que
// escribir por qué se cierra y hay que dejar leído que no se va a anotar ninguna hora de salida.
function CerrarTurnoGuardiaModal({ turno_guardia, usuario, confirmarDestructivo, onClose, onCerrada }) {
  const modal = useModalAccesible(onClose);
  const { t } = useLocale();
  const [motivo, setMotivo] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState(null);

  async function handleCerrar() {
    if (!(await confirmarDestructivo(t.turnos_guardia_sin_cerrar.confirmar))) return;

    setError(null);
    setProcesando(true);

    // Las cuatro columnas del rastro, y ninguna más. `checkout_at`, `checkout_lat` y
    // `checkout_lng` ni se nombran: quedan vacías, que es exactamente lo que hace falta para
    // que después se sepa que este turno de guardia se cerró sin que nadie marcara la salida.
    const { error: errorUpdate } = await supabase
      .from('turnos_guardia')
      .update({
        estado: 'completada',
        cerrada_at: new Date().toISOString(),
        cerrada_por: usuario.id,
        cerrada_origen: 'panel',
        cerrada_motivo: motivo.trim(),
      })
      .eq('id', turno_guardia.id);

    if (errorUpdate) {
      setProcesando(false);
      setError(mensajeDeError(errorUpdate, t));
      return;
    }

    await onCerrada();
    setProcesando(false);
    onClose();
  }

  return (
    <div className="panel-modal-fondo" onClick={onClose}>
      <div className="panel-modal" onClick={(e) => e.stopPropagation()} {...modal.props}>
        <h2 id={modal.idTitulo}>{t.turnos_guardia_sin_cerrar.modal_titulo}</h2>

        {error && <Alert variant="error">{error}</Alert>}

        <dl className="panel-detalle-lista">
          <dt>{t.turnos_guardia_sin_cerrar.col_fecha}</dt>
          <dd>{turno_guardia.fecha}</dd>
          <dt>{t.turnos_guardia_sin_cerrar.col_horario}</dt>
          <dd>{turno_guardia.hora_inicio} – {turno_guardia.hora_fin}</dd>
          <dt>{t.turnos_guardia_sin_cerrar.col_asistente}</dt>
          <dd>{turno_guardia.asistente_nombre}</dd>
          <dt>{t.turnos_guardia_sin_cerrar.col_paciente}</dt>
          <dd>{textoDePacientes(turno_guardia.pacientes_nombres, t.turnos_guardia.pacientes_y_mas)}</dd>
        </dl>


        <FormField
          label={t.turnos_guardia_sin_cerrar.motivo_label}
          name="cerrada_motivo"
          type="textarea"
          required
          rows={3}
          value={motivo}
          placeholder={t.turnos_guardia_sin_cerrar.motivo_placeholder}
          onChange={(e) => setMotivo(e.target.value)}
        />

        <div className="panel-modal-acciones">
          <Button onClick={handleCerrar} disabled={procesando || motivo.trim() === ''}>
            {procesando ? t.turnos_guardia_sin_cerrar.cerrando : t.turnos_guardia_sin_cerrar.cerrar_confirmar}
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={procesando}>
            {t.comun.cerrar}
          </Button>
        </div>
      </div>
    </div>
  );
}
