import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLocale } from '../../i18n/LocaleContext';
import { traducirValor } from '../../i18n/valores';
import { supabase } from '../../lib/supabaseClient';
import { formatearImporte } from '../../lib/dinero';
import { claseBadge } from '../../lib/tonos';
import { con } from '../../lib/textos';
import { usePrestadoraActual } from '../../hooks/usePrestadoraActual';
import { armarBuscadorDeRangos, tieneSignoFueraDeRango } from '../../lib/signosVitales';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Cabecera } from '../../components/ui/Cabecera';
import { mensajeDeError } from '../../lib/errores';
import { clienteDelServicio, contactosDeClientes } from '../../lib/clienteDelServicio';
import { claseDeResponsable, modalidadesDeGuardias, nombreDeModalidad } from './modalidadesDelServicio';
import './servicios.css';

// Cuántas guardias se listan en la pestaña. Un Servicio de meses puede tener cientos, y esta
// pantalla no es la grilla de guardias: quien quiera verlas todas va a Guardias. Las modalidades y
// las incidencias sí se calculan sobre todas.
const GUARDIAS_A_MOSTRAR = 20;

// Tope de reportes en Seguimiento, por la misma razón.
const REPORTES_A_MOSTRAR = 50;

const ESTADO_ACTIVO = 'vigente';

function fecha(valor, locale) {
  return valor ? new Date(valor).toLocaleDateString(locale) : '—';
}

export function ServicioDetalle() {
  const { t, locale } = useLocale();
  const { id } = useParams();
  const navigate = useNavigate();
  const prestadoraId = usePrestadoraActual();
  const [servicio, setServicio] = useState(null);
  const [contactos, setContactos] = useState(new Map());
  // Cómo se llama quien firmó la contratación. `null` es que el Servicio viene de antes del Padrón
  // y no lo dice.
  const [contratante, setContratante] = useState(null);
  const [prestaciones, setPrestaciones] = useState([]);
  const [guardias, setGuardias] = useState([]);
  const [reportes, setReportes] = useState([]);
  const [incidencias, setIncidencias] = useState([]);
  const [nombresPaciente, setNombresPaciente] = useState({});
  const [nombresAsistente, setNombresAsistente] = useState({});
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('resumen');

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);

    const { data: s, error: fallaServicio } = await supabase
      .from('servicios')
      // Quién contrató sale de `tipo_contratante` y `contratante_id`; sus datos de contacto vienen
      // en una consulta aparte, porque esas dos columnas no apuntan siempre a la misma tabla y sin
      // clave foránea la base no sabe anidarlos. De dónde salen lo decide `contactosDeClientes`.
      .select('id, etiqueta, estado, created_at, tipo_contratante, contratante_id, contratante_legajo_id')
      .eq('id', id)
      .single();

    if (fallaServicio) {
      // PGRST116 es "la consulta no devolvió ninguna fila": ese Servicio no existe.
      setError(fallaServicio.code === 'PGRST116' ? null : mensajeDeError(fallaServicio, t));
      setEstado(fallaServicio.code === 'PGRST116' ? 'no_encontrado' : 'error');
      return;
    }

    // La modalidad la lleva cada guardia, así que se traen todas las del Servicio: de ahí salen
    // las modalidades, y por sus ids se buscan las incidencias.
    const [pr, gu, rep, rangos] = await Promise.all([
      supabase
        .from('prestaciones')
        .select('id, tipo_servicio, precio_final, moneda, estado, nota, paciente_id, created_at')
        .eq('servicio_id', id)
        .order('created_at', { ascending: false }),
      supabase
        .from('guardias')
        .select('id, fecha, hora_inicio, hora_fin, estado, paciente_id, asistente_id, canal_modalidad')
        .eq('servicio_id', id)
        .order('fecha', { ascending: false }),
      supabase
        .from('reportes')
        .select(
          'id, created_at, estado_animo, incidentes, signos_vitales, confirmado_asistente, pacientes!inner(id, nombre), guardias!inner(fecha, servicio_id, asistentes(nombre))',
        )
        .eq('guardias.servicio_id', id)
        .order('created_at', { ascending: false })
        .limit(REPORTES_A_MOSTRAR),
      supabase
        .from('rangos_referencia_vitales')
        .select('signo, paciente_id, valor_min, valor_max, unidad')
        .eq('prestadora_id', prestadoraId),
    ]);

    const falla = pr.error ?? gu.error ?? rep.error;
    if (falla) {
      setError(mensajeDeError(falla, t));
      setEstado('error');
      return;
    }

    const listaGuardias = gu.data ?? [];
    const idsGuardia = listaGuardias.map((g) => g.id);
    const idsPaciente = [...new Set([...(pr.data ?? []), ...listaGuardias].map((r) => r.paciente_id).filter(Boolean))];
    const idsAsistente = [...new Set(listaGuardias.map((r) => r.asistente_id).filter(Boolean))];
    const vacio = Promise.resolve({ data: [], error: null });
    const listaIds = idsGuardia.join(',');

    const [pacientes, asistentes, { contactos: mapaContactos, error: fallaContactos }, relevos, sinCubrir, legajo] =
      await Promise.all([
        idsPaciente.length ? supabase.from('pacientes').select('id, nombre').in('id', idsPaciente) : vacio,
        idsAsistente.length ? supabase.from('asistentes').select('id, nombre').in('id', idsAsistente) : vacio,
        contactosDeClientes(supabase, [s]),
        idsGuardia.length
          ? supabase
              .from('incidentes_relevo')
              .select('id, guardia_saliente_id, guardia_entrante_id, iniciado_at, resuelto_at')
              .or(`guardia_entrante_id.in.(${listaIds}),guardia_saliente_id.in.(${listaIds})`)
          : vacio,
        idsGuardia.length
          ? supabase
              .from('incidentes_turno_sin_cubrir')
              .select('id, guardia_id, abierto_at, resuelto_at')
              .in('guardia_id', idsGuardia)
          : vacio,
        s.contratante_legajo_id
          ? supabase.from('legajos').select('nombre_visible').eq('id', s.contratante_legajo_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

    const fallaSegunda = pacientes.error ?? asistentes.error ?? fallaContactos ?? relevos.error ?? sinCubrir.error;
    if (fallaSegunda) {
      setError(mensajeDeError(fallaSegunda, t));
      setEstado('error');
      return;
    }

    const guardiaPorId = Object.fromEntries(listaGuardias.map((g) => [g.id, g]));
    const buscador = armarBuscadorDeRangos(rangos.data);

    setServicio(s);
    setContactos(mapaContactos);
    setContratante(legajo.data?.nombre_visible ?? null);
    setPrestaciones(pr.data ?? []);
    setGuardias(listaGuardias);
    setReportes(
      (rep.data ?? []).map((r) => ({
        ...r,
        fuera_de_rango: tieneSignoFueraDeRango(r.signos_vitales, r.pacientes?.id ?? null, buscador),
      })),
    );
    setIncidencias(
      [
        ...(relevos.data ?? []).map((i) => ({
          id: `relevo-${i.id}`,
          tipo: 'relevo',
          inicio: i.iniciado_at,
          resuelta: Boolean(i.resuelto_at),
          guardia: guardiaPorId[i.guardia_entrante_id] ?? guardiaPorId[i.guardia_saliente_id] ?? null,
        })),
        ...(sinCubrir.data ?? []).map((i) => ({
          id: `sin-cubrir-${i.id}`,
          tipo: 'sin_cubrir',
          inicio: i.abierto_at,
          resuelta: Boolean(i.resuelto_at),
          guardia: guardiaPorId[i.guardia_id] ?? null,
        })),
      ].sort((a, b) => String(b.inicio).localeCompare(String(a.inicio))),
    );
    setNombresPaciente(Object.fromEntries((pacientes.data ?? []).map((p) => [p.id, p.nombre])));
    setNombresAsistente(Object.fromEntries((asistentes.data ?? []).map((a) => [a.id, a.nombre])));
    setEstado('listo');
  }, [id, prestadoraId, t]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  // Los Pacientes del Servicio salen de sus prestaciones y sus guardias, que dicen de qué
  // Servicio son.
  const pacientesDelServicio = useMemo(() => {
    const ids = [...new Set([...prestaciones, ...guardias].map((r) => r.paciente_id).filter(Boolean))];
    return ids.map((idPaciente) => nombresPaciente[idPaciente] || '—');
  }, [prestaciones, guardias, nombresPaciente]);

  const modalidades = useMemo(() => modalidadesDeGuardias(guardias), [guardias]);

  if (estado === 'cargando') {
    return <p className="estado-cargando">{t.comun.cargando}</p>;
  }

  if (estado === 'no_encontrado' || estado === 'error') {
    return (
      <div>
        <Cabecera titulo={t.servicios.titulo}>
          <Button variant="secondary" onClick={() => navigate('/servicios')}>
            {t.servicios.detalle.volver}
          </Button>
        </Cabecera>
        {estado === 'no_encontrado' ? (
          <Alert variant="error">{t.servicios.detalle.no_encontrado}</Alert>
        ) : (
          <Alert variant="error">
            {error || t.comun.error_generico}{' '}
            <Button variant="secondary" onClick={recargar}>{t.comun.reintentar}</Button>
          </Alert>
        )}
      </div>
    );
  }

  const d = t.servicios.detalle;
  const cliente = clienteDelServicio(servicio, contactos);
  const contacto = cliente.contacto;
  const nombrePacientes = pacientesDelServicio.length ? pacientesDelServicio.join(', ') : '—';
  const nombreCliente = contacto?.nombre || contratante || '—';
  const puedeAgregarPrestacion = servicio.estado === ESTADO_ACTIVO && Boolean(cliente.ruta);
  const guardiasVisibles = guardias.slice(0, GUARDIAS_A_MOSTRAR);

  const pestanas = [
    ['resumen', d.tab_resumen],
    ['prestaciones', d.tab_prestaciones],
    ['guardias', d.tab_guardias],
    ['seguimiento', d.tab_seguimiento],
    ['incidencias', d.tab_incidencias],
  ];

  const vacio = (texto) => <p className="estado-vacio">{texto}</p>;

  return (
    <div>
      <Cabecera titulo={servicio.etiqueta || '—'}>
        <Button variant="secondary" onClick={() => navigate('/servicios')}>
          {d.volver}
        </Button>
      </Cabecera>
      <span className="panel-mini servicios-subtitulo">
        {[servicio.etiqueta, nombrePacientes, nombreCliente].filter(Boolean).join(' · ')}
      </span>

      <section className="panel-tarjeta servicios-tarjeta">
        <div className="panel-tabs" role="tablist">
          {pestanas.map(([tabId, titulo]) => (
            <button
              key={tabId}
              type="button"
              role="tab"
              aria-selected={tab === tabId}
              className={`panel-tab ${tab === tabId ? 'panel-tab-activo' : ''}`}
              onClick={() => setTab(tabId)}
            >
              {titulo}
            </button>
          ))}
        </div>

        {tab === 'resumen' && (
          <div className="panel-grilla panel-columnas-3">
            <div className="servicios-dato">
              <span className="panel-mini">{d.col_estado}</span>
              <span className={claseBadge(servicio.estado)}>
                {traducirValor(t.servicios, `estado_${servicio.estado}`)}
              </span>
            </div>
            <div className="servicios-dato">
              <span className="panel-mini">{t.servicios.col_paciente}</span>
              <b>{nombrePacientes}</b>
            </div>
            <div className="servicios-dato">
              <span className="panel-mini">{t.servicios.col_cliente}</span>
              <b>{nombreCliente}</b>
              {contacto && (
                <span className="panel-mini">
                  {[contacto.telefono, contacto.email, contacto.localidad].filter(Boolean).join(' · ')}
                </span>
              )}
              {contratante && contratante !== nombreCliente && (
                <span className="panel-mini">{d.contratado_por}: {contratante}</span>
              )}
            </div>
          </div>
        )}

        {tab === 'prestaciones' &&
          (prestaciones.length === 0 ? (
            vacio(d.sin_prestaciones)
          ) : (
            <div className="servicios-tabla-envoltura">
              <table className="panel-tabla">
                <thead>
                  <tr>
                    <th>{d.col_que}</th>
                    <th>{d.col_para_quien}</th>
                    <th>{d.col_precio}</th>
                    <th>{d.col_estado}</th>
                    <th>{d.col_nota}</th>
                  </tr>
                </thead>
                <tbody>
                  {prestaciones.map((p) => (
                    <tr key={p.id}>
                      <td>{p.tipo_servicio}</td>
                      <td>{nombresPaciente[p.paciente_id] || '—'}</td>
                      <td>{formatearImporte(p.precio_final, p.moneda, locale)}</td>
                      <td>
                        <span className={claseBadge(p.estado)}>{traducirValor(t.servicios, `estado_${p.estado}`)}</span>
                      </td>
                      <td>{p.nota || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

        {tab === 'guardias' &&
          (guardias.length === 0 ? (
            vacio(d.sin_guardias)
          ) : (
            <>
              {guardias.length > GUARDIAS_A_MOSTRAR && (
                <span className="panel-mini">{con(d.guardias_mostradas, { n: GUARDIAS_A_MOSTRAR })}</span>
              )}
              <div className="servicios-tabla-envoltura">
                <table className="panel-tabla">
                  <thead>
                    <tr>
                      <th>{d.col_fecha}</th>
                      <th>{d.col_horario}</th>
                      <th>{d.col_para_quien}</th>
                      <th>{d.col_asistente}</th>
                      <th>{t.servicios.col_modalidades}</th>
                      <th>{d.col_estado}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {guardiasVisibles.map((g) => (
                      <tr key={g.id}>
                        <td>{g.fecha}</td>
                        <td>{g.hora_inicio?.slice(0, 5)} – {g.hora_fin?.slice(0, 5)}</td>
                        <td>{nombresPaciente[g.paciente_id] || '—'}</td>
                        <td>{g.asistente_id ? nombresAsistente[g.asistente_id] || '—' : d.sin_cubrir}</td>
                        <td>{g.canal_modalidad ? nombreDeModalidad(g.canal_modalidad, t) : '—'}</td>
                        {/* El estado de la guardia se traduce con los textos de Guardias: es el
                            mismo estado, y no se nombra de dos maneras. */}
                        <td>
                          <span className={claseBadge(g.estado)}>{traducirValor(t.guardias, `estado_${g.estado}`)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ))}

        {tab === 'seguimiento' &&
          (reportes.length === 0 ? (
            vacio(d.sin_reportes)
          ) : (
            <div className="servicios-tabla-envoltura">
              <table className="panel-tabla">
                <thead>
                  <tr>
                    <th>{t.reportes.col_fecha}</th>
                    <th>{t.reportes.col_paciente}</th>
                    <th>{t.reportes.col_asistente}</th>
                    <th>{t.reportes.col_animo}</th>
                    <th>{t.reportes.col_senales}</th>
                  </tr>
                </thead>
                <tbody>
                  {reportes.map((r) => (
                    <tr key={r.id}>
                      <td>{r.guardias?.fecha ?? fecha(r.created_at, locale)}</td>
                      <td>{r.pacientes?.nombre || '—'}</td>
                      <td>{r.guardias?.asistentes?.nombre || '—'}</td>
                      <td>{r.estado_animo ? t.reportes[`animo_${r.estado_animo}`] ?? r.estado_animo : '—'}</td>
                      <td>
                        <div className="servicios-badges">
                          {r.incidentes && <span className="badge badge-critico">{t.reportes.senal_incidente}</span>}
                          {r.fuera_de_rango && <span className="badge badge-atencion">{t.reportes.senal_fuera_rango}</span>}
                          {!r.confirmado_asistente && <span className="badge badge-neutro">{t.reportes.senal_sin_confirmar}</span>}
                          {!r.incidentes && !r.fuera_de_rango && r.confirmado_asistente && (
                            <span className="panel-mini">{t.reportes.sin_novedades}</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

        {tab === 'incidencias' &&
          (incidencias.length === 0 ? (
            vacio(d.sin_incidencias)
          ) : (
            <div className="servicios-tabla-envoltura">
              <table className="panel-tabla">
                <thead>
                  <tr>
                    <th>{d.col_fecha}</th>
                    <th>{d.col_horario}</th>
                    <th>{d.col_para_quien}</th>
                    <th>{d.col_que_paso}</th>
                    <th>{d.col_estado}</th>
                  </tr>
                </thead>
                <tbody>
                  {incidencias.map((i) => (
                    <tr key={i.id}>
                      <td>{i.guardia?.fecha ?? fecha(i.inicio, locale)}</td>
                      <td>{i.guardia ? `${i.guardia.hora_inicio?.slice(0, 5)} – ${i.guardia.hora_fin?.slice(0, 5)}` : '—'}</td>
                      <td>{nombresPaciente[i.guardia?.paciente_id] || '—'}</td>
                      <td>{i.tipo === 'relevo' ? t.continuidad.incidentes_titulo : t.continuidad.turnos_vacios_titulo}</td>
                      <td>
                        <span className={i.resuelta ? 'badge badge-exito' : 'badge badge-critico'}>
                          {i.resuelta ? t.alertas.estado_resuelta : t.alertas.estado_pendiente}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
      </section>

      {tab === 'resumen' && (
        <div className="panel-grilla panel-columnas-2 servicios-resumen">
          <section className="panel-tarjeta">
            <div className="panel-tarjeta-titulo">
              <h2>{t.servicios.col_prestaciones}</h2>
              {puedeAgregarPrestacion && (
                <Button variant="primary" onClick={() => navigate(cliente.ruta)}>
                  {d.agregar_prestacion}
                </Button>
              )}
            </div>
            {prestaciones.length === 0
              ? vacio(d.sin_prestaciones)
              : prestaciones.map((p) => (
                  <div key={p.id} className="panel-fila-alerta">
                    <div>
                      <b>{p.tipo_servicio}</b>
                      <span className="panel-mini">{nombresPaciente[p.paciente_id] || '—'}</span>
                    </div>
                    <span className={claseBadge(p.estado)}>{traducirValor(t.servicios, `estado_${p.estado}`)}</span>
                  </div>
                ))}
          </section>

          <section className="panel-tarjeta">
            <div className="panel-tarjeta-titulo">
              <h2>{d.responsabilidad}</h2>
            </div>
            {modalidades.length === 0
              ? vacio(d.sin_modalidades)
              : modalidades.map((m) => (
                  <div key={m} className="panel-fila-alerta">
                    <b>{nombreDeModalidad(m, t)}</b>
                    <span className={claseDeResponsable(m)}>{d[`responsable_${m}`] ?? m}</span>
                  </div>
                ))}
          </section>
        </div>
      )}
    </div>
  );
}
