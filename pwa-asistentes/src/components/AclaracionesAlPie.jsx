import { useState } from 'react';
import { api } from '../lib/api';
import { con } from '../lib/textos';
import { mensajeDeError } from '../lib/errores';

// El mismo tope que la base pone al texto.
const LARGO_MAXIMO = 5000;

/**
 * Las aclaraciones al pie de un Reporte, y el botón para agregar una.
 *
 * El Reporte presentado no se modifica nunca: lo que hay que corregir se agrega acá abajo, firmado
 * con el nombre de quien lo escribió, la fecha y la hora. La aclaración tampoco se modifica ni se
 * borra. El botón aparece sólo en el Reporte que presentó esta persona; igual quien decide es la
 * base.
 */
export default function AclaracionesAlPie({ reporteId, aclaraciones: iniciales, puedeAclarar, t, locale }) {
  const [aclaraciones, setAclaraciones] = useState(iniciales ?? []);
  const [escribiendo, setEscribiendo] = useState(false);
  const [texto, setTexto] = useState('');
  const [faltaTexto, setFaltaTexto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const idCampo = `aclaracion-${reporteId}`;

  async function guardar(e) {
    e.preventDefault();
    if (!texto.trim()) {
      setFaltaTexto(true);
      return;
    }
    setGuardando(true);
    setError('');
    try {
      const { aclaracion } = await api.agregarAclaracion(reporteId, texto.trim());
      setAclaraciones((anteriores) => [...anteriores, aclaracion]);
      setEscribiendo(false);
      setTexto('');
    } catch (fallo) {
      setError(mensajeDeError(fallo, t));
    } finally {
      setGuardando(false);
    }
  }

  function cancelar() {
    setEscribiendo(false);
    setTexto('');
    setFaltaTexto(false);
    setError('');
  }

  if (aclaraciones.length === 0 && !puedeAclarar) return null;

  return (
    <div>
      {aclaraciones.length > 0 && <h4>{t.aclaraciones.titulo}</h4>}
      {aclaraciones.map((a) => (
        <div key={a.id}>
          <div className="mini">
            {con(t.aclaraciones.firma, { nombre: a.escrita_por_nombre, fecha: new Date(a.escrita_at).toLocaleString(locale) })}
          </div>
          <p style={{ whiteSpace: 'pre-wrap' }}>{a.texto}</p>
        </div>
      ))}

      {puedeAclarar && !escribiendo && (
        <button type="button" className="btn btn-secondary" onClick={() => setEscribiendo(true)}>
          {t.aclaraciones.agregar}
        </button>
      )}

      {puedeAclarar && escribiendo && (
        <form onSubmit={guardar} noValidate>
          <div className="form-field">
            <label htmlFor={idCampo}>{t.aclaraciones.campo}</label>
            <textarea
              id={idCampo}
              value={texto}
              maxLength={LARGO_MAXIMO}
              aria-invalid={faltaTexto ? 'true' : undefined}
              aria-describedby={faltaTexto ? `${idCampo}-error` : undefined}
              onChange={(e) => {
                setTexto(e.target.value);
                if (e.target.value.trim()) setFaltaTexto(false);
              }}
              autoFocus
            />
            {faltaTexto && (
              <span className="form-error" id={`${idCampo}-error`}>
                {t.aclaraciones.sin_texto}
              </span>
            )}
          </div>
          {error && <div className="alert alert-error" role="alert">{error}</div>}
          <button type="submit" className="btn btn-exito" disabled={guardando}>
            {guardando ? t.comun.guardando : t.aclaraciones.agregar}
          </button>{' '}
          <button type="button" className="btn btn-secondary" onClick={cancelar} disabled={guardando}>
            {t.comun.cancelar}
          </button>
        </form>
      )}
    </div>
  );
}
