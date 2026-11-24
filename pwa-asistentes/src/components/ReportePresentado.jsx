import { useState } from 'react';
import { api } from '../lib/api';
import { con } from '../lib/textos';
import { mensajeDeError } from '../lib/errores';
import AclaracionesAlPie from './AclaracionesAlPie';

/**
 * El Reporte que esta persona ya presentó en este turno de guardia, con sus aclaraciones al pie.
 *
 * Está detrás de un botón, igual que los reportes anteriores: es para cuando hace falta corregir
 * algo, no para leerlo cada vez. No depende de que la Prestadora muestre los reportes anteriores,
 * porque corregir lo que uno mismo presentó tiene que poder hacerse siempre.
 */
export default function ReportePresentado({ turnoGuardiaId, paciente, mostrarNombre, t, locale }) {
  const [abierto, setAbierto] = useState(false);
  const [estado, setEstado] = useState('cerrado');
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const idBloque = `reporte-presentado-${paciente.id}`;

  async function cargar() {
    setEstado('cargando');
    setError('');
    try {
      const respuesta = await api.reportePresentado(turnoGuardiaId, paciente.id);
      setDatos(respuesta);
      setEstado('listo');
    } catch (fallo) {
      if (fallo?.status === 404) {
        setEstado('vacio');
        return;
      }
      setError(mensajeDeError(fallo, t));
      setEstado('error');
    }
  }

  function alternar() {
    const abrir = !abierto;
    setAbierto(abrir);
    if (abrir && estado !== 'listo') cargar();
  }

  return (
    <section className="pwa-card">
      <button
        type="button"
        className="btn btn-secondary btn-full"
        onClick={alternar}
        aria-expanded={abierto}
        aria-controls={idBloque}
      >
        {mostrarNombre ? con(t.aclaraciones.ver_reporte_de, { nombre: paciente.nombre }) : t.aclaraciones.ver_reporte}
      </button>
      <div id={idBloque} className={abierto ? 'pwa-card-pie' : undefined}>
        {abierto && estado === 'cargando' && <div className="estado-cargando" role="status">{t.comun.cargando}</div>}
        {abierto && estado === 'vacio' && <div className="estado-vacio" role="status">{t.comun.vacio}</div>}
        {abierto && estado === 'error' && (
          <div className="alert alert-error" role="alert">
            {error}{' '}
            <button type="button" className="btn btn-secondary" onClick={cargar}>
              {t.comun.reintentar}
            </button>
          </div>
        )}
        {abierto && estado === 'listo' && datos?.reporte && (
          <div className="tarjeta">
            <div className="tarjeta-detalle">{new Date(datos.reporte.created_at).toLocaleString(locale)}</div>
            {datos.reporte.observaciones && <p>{datos.reporte.observaciones}</p>}
            <AclaracionesAlPie
              reporteId={datos.reporte.id}
              aclaraciones={datos.reporte.aclaraciones}
              puedeAclarar={datos.puedeAclarar}
              t={t}
              locale={locale}
            />
          </div>
        )}
      </div>
    </section>
  );
}
