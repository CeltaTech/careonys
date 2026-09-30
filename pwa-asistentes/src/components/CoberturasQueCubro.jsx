import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useLocale } from '../i18n/LocaleContext';
import { con } from '../lib/textos';
import { mensajeDeError } from '../lib/errores';

// Los turnos fijos de un compañero ausente que esta persona cubre mientras dure la ausencia. Las
// guardias ya aparecen en su lista como propias; esto dice de dónde salieron y le deja decir que
// no puede. Al decirlo, las guardias vuelven al titular y se le avisa al Coordinador.
//
// Es su propia zona: si falla, la lista de guardias sigue en pie. Vacía no ocupa lugar.

export default function CoberturasQueCubro() {
  const { t, locale } = useLocale();
  const [coberturas, setCoberturas] = useState(null);
  const [error, setError] = useState('');
  const [pidiendo, setPidiendo] = useState(false);
  const [objetando, setObjetando] = useState(null);
  const [enviada, setEnviada] = useState(false);

  const pedir = useCallback(() => {
    setError('');
    setPidiendo(true);
    return api
      .misCoberturas()
      .then(({ coberturas: data }) => setCoberturas(data ?? []))
      .catch((e) => setError(mensajeDeError(e, t, 'cargar las coberturas')))
      .finally(() => setPidiendo(false));
  }, [t]);

  useEffect(() => { pedir(); }, [pedir]);

  async function objetar(id) {
    if (!window.confirm(t.guardias.confirmar_objecion)) return;
    setObjetando(id);
    setError('');
    try {
      await api.objetarCobertura(id);
      setEnviada(true);
      await pedir();
    } catch (e) {
      setError(mensajeDeError(e, t, 'objetar una cobertura'));
    } finally {
      setObjetando(null);
    }
  }

  const fecha = (valor) => new Date(`${valor}T00:00:00`).toLocaleDateString(locale);

  if (coberturas === null && !error) {
    return <div className="estado-cargando" role="status">{t.comun.cargando}</div>;
  }

  return (
    <>
      {error && (
        <div className="alert alert-error" role="alert">
          {error}
          <button type="button" className="btn btn-secondary" onClick={pedir} disabled={pidiendo}>
            {t.comun.reintentar}
          </button>
        </div>
      )}
      {enviada && <div className="alert alert-success" role="status">{t.guardias.objecion_enviada}</div>}
      {coberturas?.length > 0 && (
        <section>
          <h2>{t.guardias.coberturas_titulo}</h2>
          {coberturas.map((c) => (
            <div key={c.id} className="guardia-card">
              <div className="guardia-card-paciente">
                {c.dias_semana.map((d) => t.guardias.dias[d] ?? d).join(', ')} · {c.hora_inicio?.slice(0, 5)} - {c.hora_fin?.slice(0, 5)}
              </div>
              <div className="guardia-card-detalle">
                {con(t.guardias.cobertura_desde_hasta, { desde: fecha(c.desde), hasta: fecha(c.hasta) })}
              </div>
              <button type="button" className="btn btn-secondary" onClick={() => objetar(c.id)} disabled={objetando !== null}>
                {objetando === c.id ? t.comun.guardando : t.guardias.no_puedo_cubrirlo}
              </button>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
