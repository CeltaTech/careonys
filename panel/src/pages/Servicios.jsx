import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocale } from '../i18n/LocaleContext';
import { traducirValor } from '../i18n/valores';
import { supabase } from '../lib/supabaseClient';
import { claseBadge } from '../lib/tonos';
import { con } from '../lib/textos';
import { useFiltros } from '../hooks/useFiltros';
import { EstadoLista } from '../components/layout/EstadoLista';
import { Button } from '../components/ui/Button';
import { Cabecera } from '../components/ui/Cabecera';
import { mensajeDeError } from '../lib/errores';
import { armarCsv, bajarCsv } from '../lib/exportarCsv';
import { clienteDelServicio, contactosDeClientes } from '../lib/clienteDelServicio';
import { modalidadesDeGuardias, nombreDeModalidad } from './servicios/modalidadesDelServicio';
import './servicios/servicios.css';

// De las prestaciones salen qué incluye el Servicio y a quién cuida; de las guardias, a quién cuida
// también y en qué modalidades trabaja, porque la modalidad la lleva cada guardia.
//
// Quién contrató sale de `tipo_contratante` y `contratante_id`, que es lo que la base guarda: el
// Cliente puede no ser un Cliente. Sus datos de contacto vienen en una consulta aparte —esas dos
// columnas no apuntan siempre a la misma tabla, así que no hay clave foránea que permita anidarlos—
// y quien decide de dónde salen es `contactosDeClientes`, no esta pantalla.
const CONSULTA =
  'id, etiqueta, estado, created_at, tipo_contratante, contratante_id, ' +
  'prestaciones(id, tipo_servicio, paciente_id), guardias(paciente_id, canal_modalidad)';

const ESTADO_ACTIVO = 'vigente';

export function Servicios() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const [filas, setFilas] = useState([]);
  const [contactos, setContactos] = useState(new Map());
  const [nombresPaciente, setNombresPaciente] = useState({});
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const { f, set, limpiar, hayFiltros } = useFiltros({ busqueda: '', estado: 'todos' });

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    const { data, error: errorConsulta } = await supabase
      .from('servicios')
      .select(CONSULTA)
      .order('created_at', { ascending: false });

    if (errorConsulta) {
      setError(mensajeDeError(errorConsulta, t));
      setEstado('error');
      return;
    }

    const idsPaciente = [
      ...new Set(
        (data ?? [])
          .flatMap((s) => [...(s.prestaciones ?? []), ...(s.guardias ?? [])])
          .map((r) => r.paciente_id)
          .filter(Boolean),
      ),
    ];

    const [{ contactos: mapa, error: errorContactos }, pacientes] = await Promise.all([
      contactosDeClientes(supabase, data),
      idsPaciente.length
        ? supabase.from('pacientes').select('id, nombre').in('id', idsPaciente)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (errorContactos || pacientes.error) {
      setError(mensajeDeError(errorContactos ?? pacientes.error, t));
      setEstado('error');
      return;
    }

    setFilas(data ?? []);
    setContactos(mapa);
    setNombresPaciente(Object.fromEntries((pacientes.data ?? []).map((p) => [p.id, p.nombre])));
    setEstado('listo');
  }, [t]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  // Cada renglón ya armado con lo que se muestra, para que la tabla y el archivo exportado digan
  // exactamente lo mismo.
  const renglones = useMemo(
    () =>
      filas.map((s) => {
        const prestaciones = s.prestaciones ?? [];
        const guardias = s.guardias ?? [];
        const idsPaciente = [
          ...new Set([...prestaciones, ...guardias].map((r) => r.paciente_id).filter(Boolean)),
        ];
        return {
          id: s.id,
          estado: s.estado,
          servicio: s.etiqueta || '—',
          pacientes: idsPaciente.map((idPaciente) => nombresPaciente[idPaciente] || '—'),
          cliente: clienteDelServicio(s, contactos).contacto?.nombre || '—',
          prestaciones: prestaciones.map((p) => p.tipo_servicio).filter(Boolean),
          modalidades: modalidadesDeGuardias(guardias).map((m) => nombreDeModalidad(m, t)),
        };
      }),
    [filas, contactos, nombresPaciente, t],
  );

  const renglonesFiltrados = useMemo(() => {
    return renglones.filter((r) => {
      if (f.estado !== 'todos' && r.estado !== f.estado) return false;
      if (!f.busqueda) return true;
      const b = f.busqueda.toLowerCase();
      return r.servicio.toLowerCase().includes(b) || r.cliente.toLowerCase().includes(b);
    });
  }, [renglones, f]);

  const activos = filas.filter((s) => s.estado === ESTADO_ACTIVO).length;

  const exportar = () => {
    const encabezados = [
      t.servicios.col_servicio,
      t.servicios.col_paciente,
      t.servicios.col_cliente,
      t.servicios.col_prestaciones,
      t.servicios.col_modalidades,
      t.servicios.filtro_estado,
    ];
    const contenido = armarCsv(
      encabezados,
      renglonesFiltrados.map((r) => [
        r.servicio,
        r.pacientes.join(' / '),
        r.cliente,
        r.prestaciones.join(' / '),
        r.modalidades.join(' / '),
        traducirValor(t.servicios, `estado_${r.estado}`),
      ]),
    );
    bajarCsv(`${t.servicios.titulo}.csv`, contenido);
  };

  return (
    <div>
      <Cabecera titulo={t.servicios.titulo}>
        <Button
          variant="secondary"
          onClick={exportar}
          disabled={estado !== 'listo' || renglonesFiltrados.length === 0}
        >
          {t.servicios.exportar}
        </Button>
      </Cabecera>

      <section className="panel-tarjeta servicios-tarjeta">
        <div className="panel-tarjeta-titulo">
          <h2>{t.servicios.registrados}</h2>
          {estado === 'listo' && <span className="panel-mini">{con(t.servicios.activos, { n: activos })}</span>}
        </div>

        <div className="panel-filtros">
          <input
            type="text"
            placeholder={t.servicios.buscar}
            aria-label={t.servicios.buscar}
            value={f.busqueda}
            onChange={(e) => set('busqueda', e.target.value)}
          />
          <select aria-label={t.servicios.filtro_estado} value={f.estado} onChange={(e) => set('estado', e.target.value)}>
            <option value="todos">{t.servicios.filtro_todos}</option>
            <option value="vigente">{t.servicios.estado_vigente}</option>
            <option value="de_baja">{t.servicios.estado_de_baja}</option>
          </select>
        </div>

        <EstadoLista
          estado={estado}
          error={error}
          vacio={estado === 'listo' && renglonesFiltrados.length === 0}
          recargar={recargar}
          filtrado={hayFiltros}
          onLimpiarFiltros={limpiar}
          mensajeVacio={filas.length === 0 ? t.servicios.vacio_texto : undefined}
        >
          <div className="servicios-tabla-envoltura">
            <table className="panel-tabla servicios-tabla">
              <thead>
                <tr>
                  <th>{t.servicios.col_servicio}</th>
                  <th>{t.servicios.col_paciente}</th>
                  <th>{t.servicios.col_cliente}</th>
                  <th>{t.servicios.col_prestaciones}</th>
                  <th>{t.servicios.col_modalidades}</th>
                  <th>{t.servicios.filtro_estado}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {renglonesFiltrados.map((r) => (
                  <tr key={r.id}>
                    <td><b>{r.servicio}</b></td>
                    <td>{r.pacientes.length ? r.pacientes.map((p, i) => <div key={i}>{p}</div>) : '—'}</td>
                    <td>{r.cliente}</td>
                    <td>{r.prestaciones.length ? r.prestaciones.map((p, i) => <div key={i}>{p}</div>) : '—'}</td>
                    <td>
                      {r.modalidades.length ? (
                        <div className="servicios-badges">
                          {r.modalidades.map((m) => (
                            <span key={m} className="badge badge-info">{m}</span>
                          ))}
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <span className={claseBadge(r.estado)}>
                        {traducirValor(t.servicios, `estado_${r.estado}`)}
                      </span>
                    </td>
                    <td>
                      <Button variant="secondary" onClick={() => navigate(`/servicios/${r.id}`)}>
                        {t.servicios.abrir}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </EstadoLista>
      </section>
    </div>
  );
}
