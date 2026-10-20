import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { llamarApiConfiguracion as llamarApi } from '../../lib/apiConfiguracion';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';
import { Alert } from '../../components/ui/Alert';
import { EstadoLista } from '../../components/layout/EstadoLista';
import { mensajeDeError } from '../../lib/errores';
import { EtapasDeIncorporacion } from './EtapasDeIncorporacion';
import '../../styles/molde-paginas.css';

/* Quién lleva el reclutamiento de esta Prestadora.
   ==========================================================================

   QUÉ DECIDE. El Responsable del reclutamiento: la persona del Panel que agenda las entrevistas
   de los postulantes y elige quién las hace. La lista son las personas del Panel de esta
   Prestadora, y la trae el backend.

   QUÉ MUESTRA SIN ELECCIÓN. El backend contesta el Responsable que rige, no el guardado: si nadie
   eligió, es el Administrador, y así aparece elegido. La regla vive una sola vez, en
   `backend/src/utils/responsableDelReclutamiento.js`. */
export function ConfiguracionReclutamiento() {
  return (
    <div className="molde-pila">
      <ResponsableDelReclutamiento />
      <EtapasDeIncorporacion />
    </div>
  );
}

function ResponsableDelReclutamiento() {
  const { t } = useLocale();
  const [responsable, setResponsable] = useState('');
  const [personas, setPersonas] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    try {
      const datos = await llamarApi('/reclutamiento');
      setResponsable(datos.responsable_id ?? '');
      setPersonas(datos.personas ?? []);
      setEstado('listo');
    } catch (err) {
      setError(mensajeDeError(err, t, 'configuración del reclutamiento'));
      setEstado('error');
    }
  }, [t]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  async function guardar() {
    setGuardando(true);
    setError(null);
    setGuardado(false);
    try {
      const datos = await llamarApi('/reclutamiento', {
        method: 'PUT',
        body: JSON.stringify({ responsable_id: responsable }),
      });
      setResponsable(datos.responsable_id ?? '');
      setGuardado(true);
    } catch (err) {
      setError(mensajeDeError(err, t, 'configuración del reclutamiento'));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="panel-tarjeta">
      <div className="panel-tarjeta-titulo">
        <h2>{t.configuracion.seccion_reclutamiento}</h2>
      </div>
      {error && estado === 'listo' && <Alert variant="error">{error}</Alert>}
      {guardado && <Alert variant="info">{t.comun.guardar} <span aria-hidden="true">✓</span></Alert>}
      <EstadoLista
        estado={estado}
        error={error}
        vacio={estado === 'listo' && personas.length === 0}
        recargar={recargar}
      >
        <>
          <div className="molde-formgrid">
            <FormField
              label={t.configuracion.reclutamiento_responsable}
              name="responsable_reclutamiento"
              type="select"
              value={responsable}
              onChange={(e) => {
                setResponsable(e.target.value);
                setGuardado(false);
              }}
            >
              {!responsable && <option value="" disabled>—</option>}
              {personas.map((persona) => (
                <option key={persona.id} value={persona.id}>
                  {persona.nombre}
                </option>
              ))}
            </FormField>
          </div>
          <div className="molde-acciones">
            <Button onClick={guardar} disabled={guardando || !responsable}>
              {guardando ? t.comun.guardando : t.comun.guardar}
            </Button>
          </div>
        </>
      </EstadoLista>
    </section>
  );
}
