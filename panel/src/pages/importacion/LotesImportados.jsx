import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { EstadoLista } from '../../components/layout/EstadoLista';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { mensajeDeError } from '../../lib/errores';
import { con } from '../../lib/textos';
import { llamarApiImportacion } from '../../lib/importacion';
import '../../styles/molde-paginas.css';
import '../importacion.css';

/* Las importaciones que hizo la Prestadora, con su archivo original.
   ==========================================================================

   Sólo la ve el Administrador de la Prestadora: la pantalla que la usa ya lo decide, y el
   backend lo vuelve a decidir. El original se descarga con un enlace temporal que el backend
   genera en el momento; se abre apenas llega, porque deja de servir a los pocos segundos. */

function fechaLegible(fecha, locale) {
  if (!fecha) return '—';
  const dia = new Date(fecha);
  return Number.isNaN(dia.getTime()) ? String(fecha) : dia.toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' });
}

export function LotesImportados() {
  const { t, locale } = useLocale();
  const textos = t.importacion.lotes;
  const [estado, setEstado] = useState('cargando');
  const [lotes, setLotes] = useState([]);
  const [error, setError] = useState(null);
  const [descargando, setDescargando] = useState(null);
  const [errorDescarga, setErrorDescarga] = useState(null);

  const cargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    try {
      const resultado = await llamarApiImportacion('/lotes');
      setLotes(Array.isArray(resultado?.lotes) ? resultado.lotes : []);
      setEstado('listo');
    } catch (err) {
      setError(mensajeDeError(err, t));
      setEstado('error');
    }
  }, [t]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function descargar(lote) {
    setDescargando(lote.id);
    setErrorDescarga(null);
    try {
      const { url } = await llamarApiImportacion(`/lotes/${encodeURIComponent(lote.id)}/original`);
      if (url) window.open(url, '_blank', 'noopener');
    } catch (err) {
      setErrorDescarga(mensajeDeError(err, t));
    } finally {
      setDescargando(null);
    }
  }

  if (estado === 'listo' && lotes.length === 0) return null;

  return (
    <section className="panel-tarjeta">
      <div className="panel-tarjeta-titulo">
        <h2>{textos.titulo}</h2>
        {estado === 'listo' && <span className="panel-mini">{lotes.length}</span>}
      </div>
      {errorDescarga && <Alert variant="error">{errorDescarga}</Alert>}
      <EstadoLista estado={estado} error={error} recargar={cargar} vacio={estado === 'listo' && lotes.length === 0}>
        <div className="importacion-desplazable">
          <table className="panel-tabla">
            <thead>
              <tr>
                <th>{textos.col_fecha}</th>
                <th>{textos.col_tipo}</th>
                <th>{textos.col_archivo}</th>
                <th>{textos.col_renglones}</th>
                <th>{textos.col_estado}</th>
                <th>{textos.col_original}</th>
              </tr>
            </thead>
            <tbody>
              {lotes.map((lote) => (
                <tr key={lote.id}>
                  <td>{fechaLegible(lote.creado, locale)}</td>
                  <td>{t.importacion[`tipo_${lote.tipo}`] || '—'}</td>
                  <td>{lote.archivoNombre || '—'}</td>
                  <td>
                    {con(textos.renglones_valor, {
                      creados: lote.filasCreadas ?? 0,
                      total: lote.filasTotales ?? 0,
                      errores: lote.filasError ?? 0,
                    })}
                  </td>
                  <td>{textos.estados[lote.estadoConformidad] ?? '—'}</td>
                  <td>
                    {lote.tieneOriginal ? (
                      <Button variant="secondary" onClick={() => descargar(lote)} disabled={descargando !== null}>
                        {descargando === lote.id ? textos.descargando : textos.descargar}
                      </Button>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </EstadoLista>
    </section>
  );
}
