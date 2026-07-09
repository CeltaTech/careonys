import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';
import { Alert } from '../../components/ui/Alert';
import { EstadoLista } from '../../components/layout/EstadoLista';

const ETAPAS = ['postulacion', 'verificacion_identidad', 'antecedentes_penales', 'entrevista', 'capacitacion'];
const ESTADOS = ['pendiente', 'aprobada', 'rechazada'];

export function VerificacionTab({ asistente }) {
  const { t } = useLocale();
  const { usuario } = useAuth();
  const [verificaciones, setVerificaciones] = useState([]);
  const [estadoCarga, setEstadoCarga] = useState('cargando');
  const [error, setError] = useState(null);
  const [guardandoEtapa, setGuardandoEtapa] = useState(null);

  const recargar = useCallback(async () => {
    setEstadoCarga('cargando');
    setError(null);
    const { data, error: errorConsulta } = await supabase
      .from('verificaciones_asistente')
      .select('*')
      .eq('asistente_id', asistente.id);
    if (errorConsulta) {
      setError(errorConsulta.message);
      setEstadoCarga('error');
      return;
    }
    setVerificaciones(data ?? []);
    setEstadoCarga('listo');
  }, [asistente.id]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  async function actualizarEtapa(fila, cambios) {
    setGuardandoEtapa(fila.etapa);
    setError(null);
    const completaAhora = cambios.estado && cambios.estado !== 'pendiente' && fila.estado === 'pendiente';
    const { error: errorUpdate } = await supabase
      .from('verificaciones_asistente')
      .update({
        ...cambios,
        revisado_por: completaAhora ? usuario?.id : fila.revisado_por,
        completado_en: completaAhora ? new Date().toISOString() : fila.completado_en,
      })
      .eq('id', fila.id);
    setGuardandoEtapa(null);
    if (errorUpdate) {
      setError(t.comun.error_generico);
      return;
    }
    recargar();
  }

  const todasAprobadas = verificaciones.length === ETAPAS.length && verificaciones.every((v) => v.estado === 'aprobada');

  return (
    <div>
      <h2>{t.asistentes.verificacion.titulo}</h2>
      <p className="panel-explicacion">{t.asistentes.verificacion.explicacion}</p>
      {error && <Alert variant="error">{error}</Alert>}
      {todasAprobadas && <Alert variant="info">{t.asistentes.verificacion.proceso_completo}</Alert>}

      <EstadoLista estado={estadoCarga} error={error} vacio={estadoCarga === 'listo' && verificaciones.length === 0} recargar={recargar}>
        {ETAPAS.map((etapa) => {
          const fila = verificaciones.find((v) => v.etapa === etapa);
          if (!fila) return null;
          return (
            <div key={etapa} className="panel-card-verificacion">
              <h3>{t.asistentes.verificacion.etapas[etapa]}</h3>
              <FormField
                label={t.asistentes.verificacion.col_estado}
                name={`estado-${etapa}`}
                type="select"
                value={fila.estado}
                onChange={(e) => actualizarEtapa(fila, { estado: e.target.value })}
                disabled={guardandoEtapa === etapa}
              >
                {ESTADOS.map((estadoOpcion) => (
                  <option key={estadoOpcion} value={estadoOpcion}>{t.asistentes.verificacion[`estado_${estadoOpcion}`]}</option>
                ))}
              </FormField>
              <FormField
                label={t.comun.nota_interna}
                name={`notas-${etapa}`}
                type="textarea"
                value={fila.notas || ''}
                onChange={(e) => setVerificaciones((prev) => prev.map((v) => (v.id === fila.id ? { ...v, notas: e.target.value } : v)))}
                onBlur={() => actualizarEtapa(fila, { notas: fila.notas || '' })}
                disabled={guardandoEtapa === etapa}
              />
              {fila.completado_en && (
                <p className="panel-explicacion">
                  {t.asistentes.verificacion.completado_en} {new Date(fila.completado_en).toLocaleDateString()}
                </p>
              )}
              {guardandoEtapa === etapa && <p className="panel-explicacion">{t.comun.guardando}</p>}
            </div>
          );
        })}
      </EstadoLista>
    </div>
  );
}
