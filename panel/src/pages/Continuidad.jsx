import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale } from '../i18n/LocaleContext';
import { Cabecera } from '../components/ui/Cabecera';
import { useAuth } from '../context/AuthContext';
import { useConfirmarDestructivo } from '../context/ConfirmacionContext';
import { supabase } from '../lib/supabaseClient';
import { EstadoLista } from '../components/layout/EstadoLista';
import { Button } from '../components/ui/Button';
import { FormField } from '../components/ui/FormField';
import { Alert } from '../components/ui/Alert';
import { cargarPacientesDeGuardias, conPacientes, pacientesDeGuardia, textoDePacientes } from '../lib/pacientesDeGuardia';
import { estaEnElPadron } from '../lib/candidatos';
import { reasignarGuardia } from '../lib/reasignarGuardia';
import { esAdminOSuperior } from '../lib/roles';
import { usePermisos } from '../context/PermisosContext';
import { AsignarConDocumentosModal } from './guardias/AsignarConDocumentosModal';
import { laDioUnaPersona } from '../lib/fuentesAlertaTemprana';
import { diaDelMomento, diasDeEspera, horaDelMomento } from '../lib/horarios';
import { nombreMotivoGuardado } from '../lib/motivoDeCierre';
import { con } from '../lib/textos';
import { mensajeDeError } from '../lib/errores';
import { useModalAccesible } from '../hooks/useModalAccesible';
import { TurnosSinCubrirAbiertos } from '../components/continuidad/TurnosSinCubrirAbiertos';
import { ConsentimientosVigentes } from '../components/continuidad/ConsentimientosVigentes';
import { LaTomoYo } from '../components/continuidad/LaTomoYo';
import { useAlarmasTomadas } from '../hooks/useAlarmasTomadas';
import { TIPOS_DE_ALARMA } from '../lib/alarmasTomadas';
import { ORIGENES } from '../lib/pacienteSolo';
import { RegistrarConsentimiento, RegistrarFamiliarQueSeQuedo } from '../components/continuidad/LoQuePasoEnLaCasa';
import '../styles/molde-paginas.css';
import './seguimientoDeGuardias.css';
import { FICHA_NOMBRE, conSusFichas } from '../lib/fichaDelPaciente';

/* QUIÉN RESUELVE UN INCIDENTE DE RELEVO
   Resolverlo es mandar a alguien a una casa, o dejar escrito que el Paciente quedó con un familiar
   o solo. Lo decide quien responde por ese Servicio: su Coordinador, el Administrador, o quien
   tomó la alarma y la está atendiendo. Los demás Coordinadores ven el incidente y pueden tomarlo,
   pero no resolverlo por encima de quien corresponde. */
function puedeResolver(incidente, usuario, serviciosQueCoordino, tomas) {
  if (!usuario?.id) return false;
  if (tomas.laTieneOtraPersona(TIPOS_DE_ALARMA.INCIDENTE_RELEVO, incidente.id)) return false;
  if (esAdminOSuperior(usuario.rol)) return true;
  if (incidente.servicio_id && serviciosQueCoordino.includes(incidente.servicio_id)) return true;
  return tomas.tomaDe(TIPOS_DE_ALARMA.INCIDENTE_RELEVO, incidente.id)?.tomada_por === usuario.id;
}

const hhmm = (hora) => String(hora ?? '').slice(0, 5);

function diaCorto(fecha, locale) {
  if (!fecha) return '—';
  return new Date(`${fecha}T00:00:00`).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });
}

/** Cuánto hace que se abrió: en minutos la primera hora, después en horas. */
function haceCuanto(momento, t) {
  if (!momento) return '';
  const minutos = Math.max(0, Math.round((Date.now() - new Date(momento).getTime()) / 60000));
  return minutos < 60
    ? con(t.continuidad.hace_minutos, { n: minutos })
    : con(t.continuidad.hace_horas, { n: Math.floor(minutos / 60) });
}

/* Los mensajes de cierre se leen de la vista y no de la tabla: es la misma tabla con una columna
   más, la del nombre de quien cerró. Ese nombre no se puede pedir consultando `usuarios`: esa
   tabla deja que cada persona lea su propia fila y ninguna otra, así que la consulta vuelve
   vacía y acá se dibuja un guión. La vista lo resuelve adentro de la base sin abrir nada de
   `usuarios` — ver la vista `notificaciones_cierre_servicio_quien_cerro`.
   Para marcar un mensaje como visto se sigue escribiendo en la tabla, que es lo único que se
   puede escribir. */
const VISTA_MENSAJES_DE_CIERRE = 'notificaciones_cierre_servicio_quien_cerro';

/* LOS FAMILIARES QUE SE QUEDARON CUIDANDO, Y POR QUÉ SE MIRAN ACÁ

   Cuando no va nadie y termina quedándose alguien de la casa, eso se anota con la fecha desde la
   que rige y sin fecha de fin. Mientras siga sin fin, en esa casa hay alguien cuidando que no es
   personal de la Prestadora: no está cubierto lo que se contrató. Sin esta sección se anotaba y
   no lo leía nadie.

   NO ES UN TURNO CUBIERTO Y NO ES UNA EXCEPCIÓN AUTORIZADA. El Cliente contrató para no tener
   que quedarse; que se haya quedado igual es un defecto grave del servicio que no se pudo
   solucionar, y puede costar el servicio. Nadie le pide a un familiar que se quede, así que acá
   no hay nada que autorizar: quien firma la fila deja escrito el hecho.

   Se cierra escribiendo la fecha de fin. Cerrarla no deshace nada ni borra el hecho: dice que ya
   volvió a haber personal en esa casa, y por eso la fila deja de pedir atención.

   NO SE MUESTRA QUIÉN LO REGISTRÓ. El dato se guarda —la tabla tiene la columna— pero traerlo a
   la pantalla exigiría una vista aparte, porque `usuarios` deja leer únicamente la fila propia.
   El mismo motivo por el que los avisos de cierre se leen de una vista. */
const TABLA_EXCEPCIONES = 'excepciones_familiar_relevo';

export function Continuidad() {
  const { t, locale } = useLocale();
  const { usuario } = useAuth();
  const confirmarDestructivo = useConfirmarDestructivo();
  const [incidentes, setIncidentes] = useState([]);
  const [alertas, setAlertas] = useState([]);
  const [notificacionesCierre, setNotificacionesCierre] = useState([]);
  const [excepciones, setExcepciones] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [incidenteResolviendo, setIncidenteResolviendo] = useState(null);
  const [actualizandoId, setActualizandoId] = useState(null);
  const [asistentesDisponibles, setAsistentesDisponibles] = useState([]);
  const [serviciosQueCoordino, setServiciosQueCoordino] = useState([]);
  const tomas = useAlarmasTomadas();

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    try {
      const [
        { data: incidentesData, error: errorIncidentes },
        { data: alertasData, error: errorAlertas },
        { data: notificacionesData, error: errorNotificaciones },
        { data: excepcionesData, error: errorExcepciones },
      ] = await Promise.all([
        supabase.from('incidentes_relevo').select('*').is('resuelto_at', null).order('iniciado_at', { ascending: true }),
        supabase.from('alertas_tempranas_guardia').select('*').is('resuelto_at', null).order('detectado_at', { ascending: true }),
        supabase.from(VISTA_MENSAJES_DE_CIERRE).select('*').is('visto_at', null).order('created_at', { ascending: true }),
        supabase.from(TABLA_EXCEPCIONES).select('*').is('hasta_at', null).order('desde_at', { ascending: true }),
      ]);
      if (errorIncidentes) throw errorIncidentes;
      if (errorAlertas) throw errorAlertas;
      if (errorNotificaciones) throw errorNotificaciones;
      if (errorExcepciones) throw errorExcepciones;

      // El turno sale derecho de la fila. Antes se llegaba dando la vuelta por el incidente de
      // relevo, y esa vuelta dejó de servir cuando el hecho pasó a llegar también por los otros
      // dos caminos, que no abren ningún incidente.
      const idsGuardias = Array.from(
        new Set([
          ...(incidentesData ?? []).flatMap((i) => [i.guardia_entrante_id, i.guardia_saliente_id].filter(Boolean)),
          ...(alertasData ?? []).map((a) => a.guardia_id),
          ...(excepcionesData ?? []).map((e) => e.guardia_id).filter(Boolean),
        ]),
      );

      const [{ data: guardiasData }, { data: coordinados, error: errorCoordinados }, pacientesPorGuardia] = await Promise.all([
        idsGuardias.length
          ? supabase.from('guardias').select('id, paciente_id, asistente_id, servicio_id, estado, fecha, hora_inicio, hora_fin, dias_hasta_el_fin').in('id', idsGuardias)
          : Promise.resolve({ data: [] }),
        supabase.rpc('servicios_que_coordino'),
        cargarPacientesDeGuardias(idsGuardias),
      ]);
      if (errorCoordinados) throw errorCoordinados;

      // Un turno puede cubrir a más de un Paciente. Se piden los nombres de todos: quien mira
      // esta pantalla está decidiendo a quién manda a una casa donde faltó alguien, y saber si
      // se quedó sin atender una persona o dos cambia la urgencia del asunto.
      const idsPacientesGuardias = (guardiasData ?? []).flatMap((g) => pacientesDeGuardia(g, pacientesPorGuardia));
      const idsPacientesNotificaciones = (notificacionesData ?? []).map((n) => n.paciente_id);
      const idsPacientes = Array.from(new Set([...idsPacientesGuardias, ...idsPacientesNotificaciones]));

      // El familiar que se quedó es una Ficha de Persona del Directorio, y el nombre no está
      // copiado en la fila: se lo busca cada vez, que es lo que permite que cambiarlo en el
      // Directorio de Personas se vea en todos lados. `nombre_visible` lo arma la base.
      const idsPersonasFamiliares = Array.from(
        new Set((excepcionesData ?? []).map((e) => e.familiar_persona_id).filter(Boolean)),
      );

      const [{ data: pacientesData }, { data: asistentesData }, { data: personasData }] = await Promise.all([
        idsPacientes.length ? supabase.from('pacientes').select(`id, ${FICHA_NOMBRE}`).in('id', idsPacientes) : Promise.resolve({ data: [] }),
        // El Padrón entero, con su estado. Sin filtrar acá porque esta misma lista le pone el
        // nombre al Asistente que faltó en cada incidente y en cada alerta, y quien después se
        // fue de la Prestadora tiene que seguir teniendo nombre en un incidente de la semana
        // pasada. Quién puede tomar el reemplazo lo decide `ResolverIncidente`, más abajo.
        supabase.from('asistentes').select('id, nombre, estado, cuenta_desactivada').order('nombre'),
        idsPersonasFamiliares.length
          ? supabase.from('personas').select('id, nombre_visible').in('id', idsPersonasFamiliares)
          : Promise.resolve({ data: [] }),
      ]);

      const pacientesPorId = Object.fromEntries(conSusFichas(pacientesData).map((p) => [p.id, p.nombre]));
      const guardiasPorId = Object.fromEntries(
        conPacientes(guardiasData ?? [], pacientesPorGuardia, pacientesPorId).map((g) => [g.id, g]),
      );
      const nombresDelTurno = (g) => (g ? textoDePacientes(g.pacientes_nombres, t.guardias.pacientes_y_mas) : '—');
      const asistentesPorId = Object.fromEntries((asistentesData ?? []).map((a) => [a.id, a.nombre]));

      const filasNotificaciones = (notificacionesData ?? []).map((n) => ({
        ...n,
        paciente_nombre: pacientesPorId[n.paciente_id] || '—',
        asistente_nombre: asistentesPorId[n.asistente_id] || '—',
        cerrado_por_nombre: n.cerrado_por_nombre || '—',
      }));

      const nombresDePersonas = Object.fromEntries(
        (personasData ?? []).map((p) => [p.id, p.nombre_visible]),
      );

      const filasExcepciones = (excepcionesData ?? []).map((e) => {
        const g = guardiasPorId[e.guardia_id];
        return {
          ...e,
          paciente_nombre: nombresDelTurno(g),
          familiar_nombre_visible: nombresDePersonas[e.familiar_persona_id] ?? null,
          dias_abierta: diasDeEspera(e.desde_at),
        };
      });

      // Primero el turno que empezó antes: es la casa que lleva más rato esperando.
      const filas = (incidentesData ?? [])
        .map((i) => {
          const g = guardiasPorId[i.guardia_entrante_id] ?? null;
          return {
            ...i,
            guardia: g,
            servicio_id: g?.servicio_id ?? null,
            paciente_nombre: nombresDelTurno(g),
            pacientes: g?.pacientes ?? [],
            asistente_ausente_nombre: g ? asistentesPorId[g.asistente_id] || '—' : '—',
            orden: g ? `${g.fecha}T${g.hora_inicio}` : '',
          };
        })
        .sort((a, b) => a.orden.localeCompare(b.orden));

      const filasAlertas = (alertasData ?? []).map((a) => {
        const g = guardiasPorId[a.guardia_id];
        return {
          ...a,
          paciente_nombre: nombresDelTurno(g),
          asistente_nombre: g ? asistentesPorId[g.asistente_id] || '—' : '—',
          fecha: g?.fecha,
          horario: g ? `${g.hora_inicio} – ${g.hora_fin}` : '—',
        };
      });

      setIncidentes(filas);
      setAlertas(filasAlertas);
      setNotificacionesCierre(filasNotificaciones);
      setExcepciones(filasExcepciones);
      setAsistentesDisponibles(asistentesData ?? []);
      setServiciosQueCoordino(coordinados ?? []);
      setEstado('listo');
    } catch (err) {
      setError(mensajeDeError(err, t));
      setEstado('error');
    }
  }, [t]);

  async function resolverAlerta(alerta) {
    if (!(await confirmarDestructivo(t.continuidad.confirmar_resolver_alerta))) return;
    setActualizandoId(alerta.id);
    try {
      const { error: errorUpdate } = await supabase
        .from('alertas_tempranas_guardia')
        .update({ resuelto_at: new Date().toISOString() })
        .eq('id', alerta.id);
      if (errorUpdate) throw errorUpdate;
      recargar();
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setActualizandoId(null);
    }
  }

  useEffect(() => {
    recargar();
  }, [recargar]);

  async function marcarVistaNotificacion(notificacion) {
    setActualizandoId(notificacion.id);
    try {
      const { error: errorUpdate } = await supabase
        .from('notificaciones_cierre_servicio')
        .update({ visto_at: new Date().toISOString(), visto_por: usuario.id })
        .eq('id', notificacion.id);
      if (errorUpdate) throw errorUpdate;
      recargar();
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setActualizandoId(null);
    }
  }

  // Cerrar una excepción es escribirle la fecha de fin, y nada más. No toca el incidente, que ya
  // estaba resuelto, ni la guardia: dice que en esa casa volvió a haber personal de la
  // Prestadora, y a partir de ahí la excepción es historia y deja de pedir atención.
  async function cerrarExcepcion(excepcion) {
    if (!(await confirmarDestructivo(t.continuidad.excepciones_confirmar_cerrar))) return;
    setActualizandoId(excepcion.id);
    try {
      const { error: errorUpdate } = await supabase
        .from(TABLA_EXCEPCIONES)
        .update({ hasta_at: new Date().toISOString() })
        .eq('id', excepcion.id);
      if (errorUpdate) throw errorUpdate;
      recargar();
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setActualizandoId(null);
    }
  }

  return (
    <div>
      <Cabecera titulo={t.continuidad.titulo} />
      {estado === 'listo' && error && <Alert variant="error">{error}</Alert>}

      <div className="molde-pila">
      <section className="panel-tarjeta">
        <div className="panel-tarjeta-titulo">
          <h2>{t.continuidad.incidentes_titulo}</h2>
        </div>
      <EstadoLista
        estado={estado}
        error={error}
        vacio={estado === 'listo' && incidentes.length === 0}
        recargar={recargar}
        mensajeVacio={t.continuidad.vacio}
      >
        {incidentes.map((i) => (
          <div key={i.id} className="panel-fila-alerta seguimiento-fila">
            <div>
              <b>{i.paciente_nombre}</b>
              <span className="panel-mini">
                {con(t.continuidad.no_llego, {
                  asistente: i.asistente_ausente_nombre,
                  dia: diaCorto(i.guardia?.fecha, locale),
                  desde: hhmm(i.guardia?.hora_inicio),
                  hasta: hhmm(i.guardia?.hora_fin),
                })}
              </span>
              <span className="panel-mini">{haceCuanto(i.iniciado_at, t)}</span>
            </div>
            <div className="seguimiento-acciones">
              {i.guardia && puedeResolver(i, usuario, serviciosQueCoordino, tomas) && (
                <Button onClick={() => setIncidenteResolviendo(i)} disabled={actualizandoId === i.id}>
                  {t.continuidad.resolver}
                </Button>
              )}
              {/* Resolver dice que el problema terminó; tomarlo dice que alguien está en eso
                  ahora, y de paso le da a quien lo tomó la mano para resolverlo. */}
              <LaTomoYo tipo={TIPOS_DE_ALARMA.INCIDENTE_RELEVO} referenciaId={i.id} {...tomas} />
            </div>
          </div>
        ))}
      </EstadoLista>
      </section>

      <section className="panel-tarjeta">
        <div className="panel-tarjeta-titulo">
          <h2>{t.continuidad.alertas_tempranas_titulo}</h2>
        </div>
      <EstadoLista
        estado={estado}
        error={null}
        vacio={estado === 'listo' && alertas.length === 0}
        recargar={recargar}
        mensajeVacio={t.continuidad.alertas_tempranas_vacio}
      >
        {alertas.map((a) => (
          <div key={a.id} className="panel-fila-alerta seguimiento-fila">
            <div>
              <b>{a.fecha} · {a.horario}</b>
              <span className="panel-mini">{t.continuidad.col_paciente}: {a.paciente_nombre}</span>
              <span className="panel-mini">{t.continuidad.col_ausente}: {a.asistente_nombre}</span>
              {/* DE DÓNDE SALIÓ ESTA ALERTA, dicho en cada fila. Hay cuatro orígenes posibles:
                  el aviso que el Coordinador levantó por teléfono, el que dio el Asistente desde
                  su teléfono, la cuenta de la hora estimada de llegada, y la hora de inicio
                  alcanzada sin que nadie apretara nada. Decir «Aviso telefónico previo» en todas,
                  viniera de donde viniera, sería contar cuatro cosas distintas como una sola.

                  No se pueden mezclar. Apretar «voy demorado» es un acto de una persona y la
                  protege; que la cuenta diga que no llega es un hecho y no es mérito de nadie.
                  Por eso además del nombre del origen va el renglón de abajo, que dice cuál de
                  las dos cosas es, sin que haya que conocer los códigos.

                  Una fuente desconocida —una fila vieja, o una que escriba una versión
                  posterior— no se calla ni se inventa: se dice que no se sabe de dónde salió. */}
              <span className="panel-mini">
                {t.continuidad[`fuente_${a.fuente}`] ?? t.continuidad.fuente_desconocida}
                {a.detectado_at ? ` · ${con(t.continuidad.anotada_a_las, { hora: horaDelMomento(a.detectado_at, locale) })}` : ''}
              </span>
              <span className="panel-mini">
                {laDioUnaPersona(a.fuente) ? t.continuidad.la_dio_una_persona : t.continuidad.la_anoto_el_sistema}
              </span>
              {/* El motivo se guarda en la misma columna con dos vocabularios distintos: el aviso
                  telefónico guarda el texto del motivo que cargó la Prestadora, y el aviso del
                  Asistente guarda uno de los cinco códigos de `lib/motivosDemora.js`, que se lee
                  traducido. Se prueba el código primero y, si no es uno, se muestra tal cual
                  vino: cambiar el texto de la Prestadora por un guión sería perder el dato. */}
              {a.motivo && <span className="panel-mini">{t.continuidad.col_motivo}: {t.continuidad[`motivo_demora_${a.motivo}`] || a.motivo}</span>}
            </div>
            <div className="seguimiento-acciones">
              {!tomas.laTieneOtraPersona(TIPOS_DE_ALARMA.ALERTA_TEMPRANA, a.id) && (
                <Button onClick={() => resolverAlerta(a)} disabled={actualizandoId === a.id}>
                  {t.continuidad.resolver_alerta}
                </Button>
              )}
              <LaTomoYo tipo={TIPOS_DE_ALARMA.ALERTA_TEMPRANA} referenciaId={a.id} {...tomas} />
            </div>
          </div>
        ))}
      </EstadoLista>
      </section>

      <section className="panel-tarjeta">
        <div className="panel-tarjeta-titulo">
          <h2>{t.continuidad.notificaciones_cierre_titulo}</h2>
        </div>
      <EstadoLista
        estado={estado}
        error={null}
        vacio={estado === 'listo' && notificacionesCierre.length === 0}
        recargar={recargar}
        mensajeVacio={t.continuidad.notificaciones_cierre_vacio}
      >
        {notificacionesCierre.map((n) => (
          <div key={n.id} className="panel-fila-alerta seguimiento-fila">
            <div>
              <b>{t.continuidad.col_paciente}: {n.paciente_nombre}</b>
              <span className="panel-mini">{t.continuidad.col_ausente}: {n.asistente_nombre}</span>
              <span className="panel-mini">{t.continuidad.notificaciones_cierre_cerrado_por}: {n.cerrado_por_nombre}</span>
              <span className="panel-mini">{t.continuidad.col_motivo}: {nombreMotivoGuardado(n.motivo, t)}</span>
              {n.motivo_detalle && <p className="seguimiento-texto">{n.motivo_detalle}</p>}
            </div>
            <div className="seguimiento-acciones">
              <Button onClick={() => marcarVistaNotificacion(n)} disabled={actualizandoId === n.id}>
                {t.continuidad.notificaciones_cierre_marcar_visto}
              </Button>
            </div>
          </div>
        ))}
      </EstadoLista>
      </section>

      {/* Trae y recarga sus propios datos: no comparte ninguno con lo de arriba —mira los turnos
          sin nadie asignado, no las ausencias de quien sí lo estaba— y meterlo en la misma
          recarga ataría dos listas que no se enteran una de la otra. */}
      <TurnosSinCubrirAbiertos />

      <section className="panel-tarjeta">
        <div className="panel-tarjeta-titulo">
          <h2>{t.continuidad.excepciones_titulo}</h2>
        </div>
      <EstadoLista
        estado={estado}
        error={null}
        vacio={estado === 'listo' && excepciones.length === 0}
        recargar={recargar}
        mensajeVacio={t.continuidad.excepciones_vacio}
      >
        {excepciones.map((e) => (
          <div key={e.id} className="panel-fila-alerta seguimiento-fila">
            <div>
              <b>{t.continuidad.col_paciente}: {e.paciente_nombre}</b>
              <span className="panel-mini">{t.continuidad.excepciones_col_familiar}: {e.familiar_nombre_visible || '—'}</span>
              <span className="panel-mini">{t.continuidad.excepciones_col_desde}: {diaDelMomento(e.desde_at) || '—'}</span>
              {/* Por cuál de los tres caminos se llegó hasta acá. Un origen que esta versión no
                  conoce no se calla ni se inventa: se dice que no se sabe. */}
              <span className="panel-mini">
                {t.continuidad.excepciones_col_origen}:{' '}
                {t.continuidad[`excepciones_origen_${e.origen}`] ?? t.continuidad.excepciones_origen_desconocido}
              </span>
              {/* Cuánto lleva abierta, que es lo que dice cuál mirar primero. El día en que se
                  registró se dice aparte porque «hace tres días» y «el 12» contestan preguntas
                  distintas: una, si esto se está estirando; la otra, contra qué turno mirarlo. */}
              <div className="panel-guardia-alerta">
                {e.dias_abierta === 0
                  ? t.continuidad.excepciones_abierta_hoy
                  : e.dias_abierta === 1
                    ? t.continuidad.excepciones_abierta_un_dia
                    : con(t.continuidad.excepciones_abierta_dias, { n: e.dias_abierta })}
              </div>
              {e.motivo && <span className="panel-mini">{t.continuidad.col_motivo}: {e.motivo}</span>}
            </div>
            <div className="seguimiento-acciones">
              <Button onClick={() => cerrarExcepcion(e)} disabled={actualizandoId === e.id}>
                {t.continuidad.excepciones_cerrar}
              </Button>
            </div>
          </div>
        ))}
      </EstadoLista>
      </section>

      {/* Va debajo y aparte: son dos hechos distintos. Arriba, las casas donde quedó cuidando
          un familiar; acá, aquellas en las que el Cliente aceptó que la persona
          atendida quedara sola. Un mismo turno puede tener los dos, y ninguno explica al otro. */}
      <ConsentimientosVigentes />
      </div>

      {incidenteResolviendo && (
        <ResolverIncidente
          incidente={incidenteResolviendo}
          asistentes={asistentesDisponibles}
          onClose={() => setIncidenteResolviendo(null)}
          onResuelto={() => { setIncidenteResolviendo(null); recargar(); }}
        />
      )}
    </div>
  );
}

/* RESOLVER UN INCIDENTE: TRES FORMAS DE TERMINAR, EN UNA SOLA VENTANA
   Mandar a un Asistente, dejar escrito que se quedó cuidando un familiar, o que el Cliente aceptó
   que el Paciente quede solo. El tipo de reemplazo no se elige: la base lo deduce de a quién se
   mandó, y anota sola quién resolvió y cuándo.
   La lista es la misma del turno vacante en Guardias —el Padrón, sin quien ya se fue—, y la
   reasignación es la misma función: `lib/reasignarGuardia.js`. A quien ya está en otro turno a esa
   hora lo rechaza la base. */
function ResolverIncidente({ incidente, asistentes, onClose, onResuelto }) {
  const modal = useModalAccesible(onClose);
  const { t } = useLocale();
  const { usuario } = useAuth();
  const { puede } = usePermisos();
  const puedeAsignarIgual = esAdminOSuperior(usuario?.rol) || puede('asignar_con_documentos_pendientes');
  const [forma, setForma] = useState(null);
  const [asistenteId, setAsistenteId] = useState('');
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const [documentosPendientes, setDocumentosPendientes] = useState(null);
  const [asignandoIgual, setAsignandoIgual] = useState(false);

  const guardia = incidente.guardia;
  const asistentesAsignables = useMemo(
    () => (asistentes ?? []).filter((a) => estaEnElPadron(a) && a.id !== guardia?.asistente_id),
    [asistentes, guardia?.asistente_id]
  );

  const reasignar = (motivoExcepcion = null) =>
    reasignarGuardia(guardia, asistenteId, guardia.fecha, t, motivo.trim(), motivoExcepcion);

  async function mandarAsistente() {
    setGuardando(true);
    setError(null);
    setDocumentosPendientes(null);
    const resultado = await reasignar();
    setGuardando(false);
    if (resultado.error) {
      setError(resultado.error);
      setDocumentosPendientes(resultado.documentosPendientes);
      return;
    }
    onResuelto();
  }

  // Cerrar el incidente con lo que se acaba de anotar en la casa. Sin Asistente: la base exige
  // que estas dos formas no nombren a nadie.
  const cerrarComo = (tipo) => async () => {
    const { error: errorIncidente } = await supabase
      .from('incidentes_relevo')
      .update({ resuelto_at: new Date().toISOString(), resuelto_por_tipo: tipo, resuelto_por_id: null })
      .eq('id', incidente.id);
    if (errorIncidente) throw errorIncidente;
  };

  if (forma === 'familiar') {
    return (
      <RegistrarFamiliarQueSeQuedo
        guardiaId={guardia.id}
        origen={ORIGENES.RELEVO}
        incidenteId={incidente.id}
        onClose={onClose}
        onGuardado={onResuelto}
        alGuardar={cerrarComo('familiar')}
      />
    );
  }

  if (forma === 'solo') {
    return (
      <RegistrarConsentimiento
        guardiaId={guardia.id}
        pacientes={incidente.pacientes.filter((p) => p?.id)}
        onClose={onClose}
        onGuardado={onResuelto}
        alGuardar={cerrarComo('paciente_solo')}
      />
    );
  }

  if (asignandoIgual && documentosPendientes) {
    return (
      <AsignarConDocumentosModal
        documentos={documentosPendientes}
        reintentar={reasignar}
        onClose={() => setAsignandoIgual(false)}
        onAsignado={onResuelto}
      />
    );
  }

  return (
    <div className="panel-modal-fondo" onClick={onClose}>
      <div className="panel-modal" onClick={(e) => e.stopPropagation()} {...modal.props}>
        <h2 id={modal.idTitulo}>{t.continuidad.resolver}</h2>
        <p className="panel-mini">{incidente.paciente_nombre}</p>

        <FormField
          label={t.continuidad.resolver_asistente}
          name="asistente_id"
          type="select"
          required
          value={asistenteId}
          onChange={(e) => setAsistenteId(e.target.value)}
        >
          <option value="">{t.guardias.nueva_guardia.elegir}</option>
          {asistentesAsignables.map((a) => (
            <option key={a.id} value={a.id}>{a.nombre}</option>
          ))}
        </FormField>
        <FormField
          label={t.comun.motivo}
          name="motivo"
          type="textarea"
          required
          maxLength={500}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
        />

        {error && (
          <Alert variant="error">
            {error}
            {documentosPendientes && puedeAsignarIgual && (
              <>
                {' '}
                <Button variant="secondary" onClick={() => setAsignandoIgual(true)}>
                  {t.documentos_asistente.asignar_igual}
                </Button>
              </>
            )}
          </Alert>
        )}

        <div className="panel-modal-acciones">
          <Button variant="secondary" onClick={onClose} disabled={guardando}>{t.comun.cancelar}</Button>
          <Button onClick={mandarAsistente} disabled={guardando || !asistenteId || !motivo.trim()}>
            {guardando ? t.comun.guardando : t.continuidad.resolver_mandar}
          </Button>
        </div>

        <div className="seguimiento-otras-formas">
          <Button variant="secondary" onClick={() => setForma('familiar')} disabled={guardando}>
            {t.continuidad.familiar_se_quedo_boton}
          </Button>
          {incidente.pacientes.some((p) => p?.id) && (
            <Button variant="secondary" onClick={() => setForma('solo')} disabled={guardando}>
              {t.continuidad.paciente_solo_boton}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
