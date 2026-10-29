import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useLocale } from '../i18n/LocaleContext';
import { Cabecera } from '../components/ui/Cabecera';
import { documentosQueVencen } from '../lib/documentosQueVencen';
import { FILTRO_DOCUMENTOS_PENDIENTES, documentosQueImpidenTrabajar } from '../lib/documentosQueImpidenTrabajar';
import { claseBadge, claseBadgeTono, TONO } from '../lib/tonos';
import { useFiltros } from '../hooks/useFiltros';
import { usePrestadoraActual } from '../hooks/usePrestadoraActual';
import { EstadoLista } from '../components/layout/EstadoLista';
import { mensajeDeError } from '../lib/errores';
import { diasParaVencer, estadoDeVencimiento } from '../lib/reglaVencimientos';
import { diasDePreavisoDeLaPrestadora } from '../lib/plazoDeAviso';
import './hojaDeTarjetas.css';

export function Documentacion() {
  const { t } = useLocale();
  const prestadoraId = usePrestadoraActual();
  const { state } = useLocation();
  const [filas, setFilas] = useState([]);
  // Los que no dejan trabajar van aparte: no tienen vencimiento que contar, faltan o no sirven.
  const [pendientes, setPendientes] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  // La pantalla abre ya filtrada a lo vencido o por vencer, o a lo que pida el aviso que trajo
  // hasta acá: ese es el valor de arranque y el punto de comparación, así que dejarlo así no
  // cuenta como filtro puesto.
  const { f, set, limpiar, hayFiltros } = useFiltros({ filtro: state?.filtro ?? 'vencido_o_por_vencer' });

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);

    // Qué documentos entran lo decide `lib/documentosQueVencen.js`, el mismo que usan los avisos
    // que traen hasta acá: si contaran otra cosa, el aviso diría un número y la lista otro.
    const [{ documentos, error: errorDocs }, diasDePreaviso, { documentos: queImpiden, error: errorPendientes }] =
      await Promise.all([
        documentosQueVencen(),
        diasDePreavisoDeLaPrestadora(prestadoraId),
        documentosQueImpidenTrabajar(),
      ]);

    if (errorDocs || errorPendientes) {
      setError(mensajeDeError(errorDocs || errorPendientes, t));
      setEstado('error');
      return;
    }

    const filasConEstado = documentos
      .map((d) => {
        const dias = diasParaVencer(d.fecha_vencimiento);
        return {
          id: d.documento_id,
          asistente_nombre: d.asistente_nombre || '—',
          tipo_nombre: d.nombre || '—',
          fecha_vencimiento: d.fecha_vencimiento,
          dias,
          estado_documento: estadoDeVencimiento(dias, diasDePreaviso),
        };
      })
      .sort((a, b) => a.dias - b.dias);

    setFilas(filasConEstado);
    setPendientes(
      queImpiden
        .map((d) => ({
          id: `${d.asistente_id}-${d.tipo_documento_id}`,
          asistente_nombre: d.asistente_nombre || '—',
          tipo_nombre: d.nombre || '—',
          fecha_vencimiento: d.fecha_vencimiento,
          // Aprobado y aun así acá es que venció.
          estado_documento: d.estado === 'aprobado' ? 'vencido' : d.estado,
        }))
        .sort((a, b) => a.asistente_nombre.localeCompare(b.asistente_nombre)),
    );
    setEstado('listo');
  }, [prestadoraId, t]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  const filasFiltradas = useMemo(() => {
    if (f.filtro === FILTRO_DOCUMENTOS_PENDIENTES) return pendientes;
    if (f.filtro === 'todos') return filas;
    if (f.filtro === 'vencido_o_por_vencer') return filas.filter((d) => d.estado_documento !== 'vigente');
    return filas.filter((d) => d.estado_documento === f.filtro);
  }, [filas, pendientes, f]);

  return (
    <div>
      <Cabecera titulo={t.documentacion.titulo} />

      <section className="panel-tarjeta">
      <div className="panel-tarjeta-titulo">
        <h2>{t.documentacion.titulo}</h2>
        {estado === 'listo' && <span className="panel-mini">{filasFiltradas.length}</span>}
      </div>
      <div className="panel-filtros">
        <select value={f.filtro} onChange={(e) => set('filtro', e.target.value)} aria-label={t.comun.filtro_estado}>
          <option value="vencido_o_por_vencer">{t.documentacion.filtro_vencido_o_por_vencer}</option>
          <option value="vencido">{t.documentacion.estado_vencido}</option>
          <option value="por_vencer">{t.documentacion.estado_por_vencer}</option>
          <option value={FILTRO_DOCUMENTOS_PENDIENTES}>{t.asistentes.listado.documentacion_pendiente}</option>
          <option value="todos">{t.comun.todos}</option>
        </select>
      </div>

      <EstadoLista
        estado={estado}
        error={error}
        vacio={estado === 'listo' && filasFiltradas.length === 0}
        recargar={recargar}
        filtrado={hayFiltros}
        onLimpiarFiltros={limpiar}
      >
        <table className="panel-tabla">
          <thead>
            <tr>
              <th>{t.documentacion.col_asistente}</th>
              <th>{t.documentacion.col_documento}</th>
              <th>{t.documentacion.col_vencimiento}</th>
              <th>{t.documentacion.col_estado}</th>
            </tr>
          </thead>
          <tbody>
            {filasFiltradas.map((d) => (
              <tr key={d.id}>
                <td><b>{d.asistente_nombre}</b></td>
                <td>{d.tipo_nombre}</td>
                <td>{d.fecha_vencimiento ?? '—'}</td>
                <td>
                  {f.filtro === FILTRO_DOCUMENTOS_PENDIENTES ? (
                    <span className={claseBadgeTono(TONO.CRITICO)}>{t.documentos_asistente[`estado_${d.estado_documento}`]}</span>
                  ) : (
                    <span className={claseBadge(d.estado_documento)}>{t.documentacion[`estado_${d.estado_documento}`]}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </EstadoLista>
      </section>
    </div>
  );
}
