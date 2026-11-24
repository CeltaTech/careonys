import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';
import { mensajeDeError } from '../../lib/errores';
import { avisar } from '../../lib/mensajeEmergente';
import {
  LARGO_MAXIMO_DE_LA_ACLARACION,
  agregarAclaracion,
  leerAclaraciones,
  puedeAclarar,
} from '../../lib/aclaracionesDelReporte';

// Las aclaraciones al pie de un Reporte. El Reporte de arriba no cambia nunca: lo que se corrige
// se agrega acá abajo, firmado con el nombre de quien lo escribió, la fecha y la hora.
export function AclaracionesDelReporte({ reporteId }) {
  const { t, locale } = useLocale();
  const [aclaraciones, setAclaraciones] = useState([]);
  const [habilitado, setHabilitado] = useState(false);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [escribiendo, setEscribiendo] = useState(false);
  const [texto, setTexto] = useState('');
  const [faltaTexto, setFaltaTexto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorAlGuardar, setErrorAlGuardar] = useState(null);

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    try {
      const [lista, permitido] = await Promise.all([leerAclaraciones(reporteId), puedeAclarar(reporteId)]);
      setAclaraciones(lista);
      setHabilitado(permitido);
      setEstado('listo');
    } catch (e) {
      setError(mensajeDeError(e, t));
      setEstado('error');
    }
  }, [reporteId, t]);

  useEffect(() => {
    setEscribiendo(false);
    setTexto('');
    setFaltaTexto(false);
    setErrorAlGuardar(null);
    recargar();
  }, [recargar]);

  async function guardar(e) {
    e.preventDefault();
    if (!texto.trim()) {
      setFaltaTexto(true);
      return;
    }
    setGuardando(true);
    setErrorAlGuardar(null);
    try {
      const nueva = await agregarAclaracion(reporteId, texto);
      setAclaraciones((anteriores) => [...anteriores, nueva]);
      setEscribiendo(false);
      setTexto('');
      avisar(t.reportes.aclaracion_agregada);
    } catch (err) {
      setErrorAlGuardar(mensajeDeError(err, t));
    } finally {
      setGuardando(false);
    }
  }

  if (estado === 'cargando') return <p className="panel-mini">{t.comun.cargando}</p>;

  if (estado === 'error') {
    return (
      <Alert variant="error">
        {error}{' '}
        <Button variant="secondary" onClick={recargar}>
          {t.comun.reintentar}
        </Button>
      </Alert>
    );
  }

  // Sin aclaraciones y sin permiso para agregar, no queda nada que mostrar.
  if (aclaraciones.length === 0 && !habilitado) return null;

  return (
    <div className="molde-pila">
      <h3>{t.reportes.aclaraciones_titulo}</h3>

      {aclaraciones.map((a) => (
        <div key={a.id} className="tarjeta-dato">
          <div className="panel-mini">
            {t.reportes.aclaracion_firma
              .replace('{nombre}', a.escrita_por_nombre)
              .replace('{fecha}', new Date(a.escrita_at).toLocaleString(locale))}
          </div>
          <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{a.texto}</p>
        </div>
      ))}

      {habilitado && !escribiendo && (
        <Button variant="secondary" onClick={() => setEscribiendo(true)}>
          {t.reportes.aclaracion_agregar}
        </Button>
      )}

      {habilitado && escribiendo && (
        <form onSubmit={guardar} noValidate>
          <FormField
            label={t.reportes.aclaracion_campo}
            name="aclaracion"
            type="textarea"
            required
            rows={4}
            maxLength={LARGO_MAXIMO_DE_LA_ACLARACION}
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              if (e.target.value.trim()) setFaltaTexto(false);
            }}
            error={faltaTexto ? t.reportes.aclaracion_sin_texto : null}
            autoFocus
          />
          {errorAlGuardar && <Alert variant="error">{errorAlGuardar}</Alert>}
          <div className="molde-acciones">
            <Button type="submit" disabled={guardando}>
              {guardando ? t.comun.guardando : t.reportes.aclaracion_agregar}
            </Button>
            <Button
              variant="secondary"
              disabled={guardando}
              onClick={() => {
                setEscribiendo(false);
                setTexto('');
                setFaltaTexto(false);
                setErrorAlGuardar(null);
              }}
            >
              {t.comun.cancelar}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
