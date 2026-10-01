import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale } from '../i18n/LocaleContext';
import { Cabecera } from '../components/ui/Cabecera';
import { useAuth } from '../context/AuthContext';
import { useConfirmarDestructivo } from '../context/ConfirmacionContext';
import { supabase } from '../lib/supabaseClient';
import { claseBadge } from '../lib/tonos';
import { useFiltros } from '../hooks/useFiltros';
import { EstadoLista } from '../components/layout/EstadoLista';
import { Button } from '../components/ui/Button';
import { mensajeDeError } from '../lib/errores';
import { sigueSinResolver, sigueSinResolverYEsCritica } from '../lib/alertaSinResolver';
import '../styles/molde-paginas.css';
import './hojaDeTarjetas.css';

// Alertas de la IA Nivel 2 (backend/src/utils/revisarAlertasIA.js): la IA lee los últimos
// reportes de cada Paciente y, si detecta un patrón preocupante, deja una alerta con dos
// textos — uno para la Familia (descripcion) y otro para el Coordinador
// (detalle_coordinador). Hasta esta pantalla el segundo no lo leía nadie: el mensaje de
// WhatsApp decía "ver detalle en el Panel" y el Panel no tenía dónde mostrarlo.

// Rojo primero, después amarillo: la lista se ordena por gravedad, no solo por fecha.
const ORDEN_NIVEL = { roja: 0, amarilla: 1, verde: 2 };

// Cada nivel se pinta por lo que significa, no por su color de origen.

export function Alertas() {
  const { t } = useLocale();
  const { usuario } = useAuth();
  const confirmarDestructivo = useConfirmarDestructivo();
  const [filas, setFilas] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const { f, set, limpiar, hayFiltros } = useFiltros({ estado: 'pendientes', nivel: 'todos' });
  const [abierta, setAbierta] = useState(null);
  const [resolviendoId, setResolviendoId] = useState(null);

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);

    const { data, error: errorConsulta } = await supabase
      .from('alertas')
      .select(
        'id, created_at, nivel, descripcion, detalle_coordinador, campos_preocupantes, reportes_relacionados, resuelta, resuelta_at, paciente_id, pacientes(nombre)',
      )
      .order('created_at', { ascending: false });

    if (errorConsulta) {
      setError(mensajeDeError(errorConsulta, t));
      setEstado('error');
      return;
    }

    setFilas(
      (data ?? []).map((a) => ({
        ...a,
        paciente_nombre: a.pacientes?.nombre || '—',
      })),
    );
    setEstado('listo');
  }, [t]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  async function resolver(alerta) {
    if (!(await confirmarDestructivo(t.alertas.confirmar_resolver))) return;
    setResolviendoId(alerta.id);
    try {
      const { error: errorUpdate } = await supabase
        .from('alertas')
        .update({ resuelta: true, resuelta_por: usuario.id, resuelta_at: new Date().toISOString() })
        .eq('id', alerta.id);
      if (errorUpdate) throw errorUpdate;
      setAbierta(null);
      recargar();
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setResolviendoId(null);
    }
  }

  const filasFiltradas = useMemo(() => {
    return filas
      .filter((a) => {
        if (f.estado === 'pendientes' && !sigueSinResolver(a)) return false;
        if (f.estado === 'resueltas' && sigueSinResolver(a)) return false;
        if (f.nivel !== 'todos' && a.nivel !== f.nivel) return false;
        return true;
      })
      .sort((a, b) => {
        const porNivel = (ORDEN_NIVEL[a.nivel] ?? 9) - (ORDEN_NIVEL[b.nivel] ?? 9);
        if (porNivel !== 0) return porNivel;
        return (b.created_at ?? '').localeCompare(a.created_at ?? '');
      });
  }, [filas, f]);

  const pendientesRojas = useMemo(
    () => filas.filter(sigueSinResolverYEsCritica).length,
    [filas],
  );

  return (
    <div>
      <Cabecera titulo={t.alertas.titulo} />
      <div className="molde-pila">
        <section className="panel-tarjeta hoja-desplazable">
          <div className="panel-tarjeta-titulo">
            <h2>{t.alertas.titulo}</h2>
            {pendientesRojas > 0 && (
              <span className="badge badge-critico">
                {t.alertas.resumen_rojas.replace('{cantidad}', pendientesRojas)}
              </span>
            )}
          </div>

          <div className="panel-filtros">
            <select value={f.estado} onChange={(e) => set('estado', e.target.value)} aria-label={t.comun.filtro_estado}>
              <option value="pendientes">{t.alertas.filtro_pendientes}</option>
              <option value="resueltas">{t.alertas.filtro_resueltas}</option>
              <option value="todas">{t.comun.todos}</option>
            </select>
            <select value={f.nivel} onChange={(e) => set('nivel', e.target.value)} aria-label={t.comun.filtro_nivel}>
              <option value="todos">{t.alertas.filtro_todos_los_niveles}</option>
              <option value="roja">{t.alertas.nivel_roja}</option>
              <option value="amarilla">{t.alertas.nivel_amarilla}</option>
            </select>
          </div>

          <EstadoLista
            estado={estado}
            error={error}
            vacio={estado === 'listo' && filasFiltradas.length === 0}
            recargar={recargar}
            filtrado={hayFiltros}
            onLimpiarFiltros={limpiar}
            mensajeVacio={t.alertas.vacio}
          >
            <>
              <table className="panel-tabla">
                <thead>
                  <tr>
                    <th>{t.alertas.col_fecha}</th>
                    <th>{t.alertas.col_paciente}</th>
                    <th>{t.alertas.col_nivel}</th>
                    <th>{t.alertas.col_descripcion}</th>
                    <th>{t.alertas.col_estado}</th>
                    <th>{t.alertas.col_detalle}</th>
                  </tr>
                </thead>
                <tbody>
                  {filasFiltradas.map((a) => (
                    <tr key={a.id}>
                      <td>{a.created_at?.slice(0, 10)}</td>
                      <td>
                        <b>{a.paciente_nombre}</b>
                      </td>
                      <td>
                        <span className={claseBadge(a.nivel)}>
                          {t.alertas[`nivel_${a.nivel}`] ?? a.nivel}
                        </span>
                      </td>
                      <td>{a.descripcion || '—'}</td>
                      <td>
                        <span className={claseBadge(sigueSinResolver(a) ? 'pendiente' : 'atendida')}>
                          {sigueSinResolver(a) ? t.alertas.estado_pendiente : t.alertas.estado_resuelta}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="panel-enlace"
                          onClick={() => setAbierta(abierta === a.id ? null : a.id)}
                        >
                          {abierta === a.id ? t.alertas.ocultar_detalle : t.alertas.ver_detalle}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          </EstadoLista>
        </section>

        {estado === 'listo' && abierta && (
          <DetalleAlerta
            alerta={filasFiltradas.find((a) => a.id === abierta)}
            resolviendo={resolviendoId === abierta}
            onResolver={resolver}
            onCerrar={() => setAbierta(null)}
          />
        )}
      </div>
    </div>
  );
}

function DetalleAlerta({ alerta, resolviendo, onResolver, onCerrar }) {
  const { t } = useLocale();
  if (!alerta) return null;

  const cantidadReportes = alerta.reportes_relacionados?.length ?? 0;

  return (
    <section className="panel-tarjeta">
      <div className="panel-tarjeta-titulo">
        <h2>{t.alertas.detalle_titulo}</h2>
        <Button variant="secondary" onClick={onCerrar}>
          {t.comun.cerrar}
        </Button>
      </div>
      <div className="panel-mini hoja-ficha-datos">
        {alerta.created_at?.slice(0, 10)} · {alerta.paciente_nombre}
      </div>

      <div className="panel-grilla panel-columnas-2">
        <div className="hoja-dato">
          <div className="panel-mini">{t.alertas.campo_detalle_coordinador}</div>
          <b>{alerta.detalle_coordinador || t.alertas.sin_datos}</b>
        </div>

        <div className="hoja-dato">
          <div className="panel-mini">{t.alertas.campo_descripcion_familia}</div>
          <b>{alerta.descripcion || t.alertas.sin_datos}</b>
        </div>

        <div className="hoja-dato">
          <div className="panel-mini">{t.alertas.campo_campos_preocupantes}</div>
          <b>
            {alerta.campos_preocupantes?.length > 0
              ? alerta.campos_preocupantes.join(' · ')
              : t.alertas.sin_datos}
          </b>
        </div>

        <div className="hoja-dato">
          <div className="panel-mini">{t.alertas.campo_reportes_analizados}</div>
          <b>{t.alertas.reportes_analizados_texto.replace('{cantidad}', cantidadReportes)}</b>
        </div>
      </div>

      {sigueSinResolver(alerta) && (
        <div className="molde-acciones">
          <Button onClick={() => onResolver(alerta)} disabled={resolviendo}>
            {t.alertas.marcar_resuelta}
          </Button>
        </div>
      )}
    </section>
  );
}
