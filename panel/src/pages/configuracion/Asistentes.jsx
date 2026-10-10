import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { llamarApiConfiguracion as llamarApi } from '../../lib/apiConfiguracion';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';
import { Alert } from '../../components/ui/Alert';
import { EstadoLista } from '../../components/layout/EstadoLista';
import { TiposAsistenteTab } from './TiposAsistenteTab';
import { ControlDeMatricula } from './ControlDeMatricula';
import { AusenciasTab } from './AusenciasTab';
import { PagoAsistentesTab } from './PagoAsistentesTab';
import { mensajeDeError } from '../../lib/errores';
import { useModalAccesible } from '../../hooks/useModalAccesible';
import { con } from '../../lib/textos';
import '../../styles/molde-paginas.css';

/* Cómo es el Padrón: qué tipos de Asistente existen —con sus Ramas, sus tareas y su
   matrícula—, qué documentación se les exige y qué tan estricto es el control de la
   matrícula, con cuánta anticipación una falta se
   considera avisada con tiempo y cómo se le paga el período a quien cobra un monto fijo. */
export function ConfiguracionAsistentes() {
  return (
    <div className="molde-pila">
      <TiposAsistenteTab />
      <TabDocumentos />
      <ControlDeMatricula />
      <AusenciasTab />
      <PagoAsistentesTab />
    </div>
  );
}

function TabDocumentos() {
  const { t } = useLocale();
  const [tipos, setTipos] = useState([]);
  const [diasDePreaviso, setDiasDePreaviso] = useState('');
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [creandoNuevo, setCreandoNuevo] = useState(false);
  const [actualizandoId, setActualizandoId] = useState(null);
  const [guardandoPlazo, setGuardandoPlazo] = useState(false);
  const [plazoGuardado, setPlazoGuardado] = useState(false);

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    try {
      const { tipos: filas, dias_aviso_vencimiento_documentos } = await llamarApi('/documentos-tipo');
      setTipos(filas);
      setDiasDePreaviso(String(dias_aviso_vencimiento_documentos));
      setEstado('listo');
    } catch (err) {
      setError(mensajeDeError(err, t));
      setEstado('error');
    }
  }, [t]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  async function toggleActivo(fila) {
    setActualizandoId(fila.id);
    try {
      await llamarApi(`/documentos-tipo/${fila.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ nombre: fila.nombre, requiere_vencimiento: fila.requiere_vencimiento, activo: !fila.activo }),
      });
      recargar();
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setActualizandoId(null);
    }
  }

  async function guardarPlazo() {
    setGuardandoPlazo(true);
    setError(null);
    setPlazoGuardado(false);
    try {
      await llamarApi('/documentos-tipo/plazo-aviso', {
        method: 'PATCH',
        body: JSON.stringify({ dias: Number(diasDePreaviso) }),
      });
      setPlazoGuardado(true);
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setGuardandoPlazo(false);
    }
  }

  return (
    <>
      <section className="panel-tarjeta">
        <div className="panel-tarjeta-titulo">
          <h2>{t.configuracion.documentos_plazo_titulo}</h2>
        </div>
        {error && <Alert variant="error">{error}</Alert>}
        {plazoGuardado && <Alert variant="info">{t.comun.guardar} <span aria-hidden="true">✓</span></Alert>}
        <div className="molde-formgrid">
          <FormField
            label={t.configuracion.documentos_plazo_dias}
            name="dias_aviso"
            type="number"
            value={diasDePreaviso}
            onChange={(e) => { setDiasDePreaviso(e.target.value); setPlazoGuardado(false); }}
          />
        </div>
        <div className="molde-acciones">
          <Button onClick={guardarPlazo} disabled={guardandoPlazo || !diasDePreaviso}>
            {guardandoPlazo ? t.comun.guardando : t.comun.guardar}
          </Button>
        </div>
      </section>

      <section className="panel-tarjeta">
      <div className="panel-tarjeta-titulo">
        <h2>{t.configuracion.documentos_tipos_titulo}</h2>
        <Button onClick={() => setCreandoNuevo(true)}>{t.configuracion.documentos_tipos_nuevo}</Button>
      </div>
      <EstadoLista estado={estado} error={error} vacio={estado === 'listo' && tipos.length === 0} recargar={recargar}>
        <table className="panel-tabla">
          <thead>
            <tr>
              <th>{t.configuracion.documentos_tipos_col_nombre}</th>
              <th>{t.configuracion.documentos_tipos_col_requiere_vencimiento}</th>
              <th>{t.configuracion.documentos_tipos_col_activo}</th>
            </tr>
          </thead>
          <tbody>
            {tipos.map((tipo) => (
              <tr key={tipo.id}>
                <td><b>{tipo.nombre}</b></td>
                <td>{tipo.requiere_vencimiento ? t.comun.si : t.comun.no}</td>
                <td>
                  <input
                    type="checkbox"
                    checked={tipo.activo}
                    onChange={() => toggleActivo(tipo)}
                    disabled={actualizandoId === tipo.id}
                    aria-label={con(t.comun.campo_de_fila, { campo: t.configuracion.documentos_tipos_col_activo, nombre: tipo.nombre })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </EstadoLista>
      </section>

      {creandoNuevo && (
        <NuevoTipoDocumento onClose={() => setCreandoNuevo(false)} onCreado={() => { setCreandoNuevo(false); recargar(); }} />
      )}
    </>
  );
}

function NuevoTipoDocumento({ onClose, onCreado }) {
  const modal = useModalAccesible(onClose);
  const { t } = useLocale();
  const [nombre, setNombre] = useState('');
  const [requiereVencimiento, setRequiereVencimiento] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  async function handleGuardar() {
    setGuardando(true);
    setError(null);
    try {
      await llamarApi('/documentos-tipo', {
        method: 'POST',
        body: JSON.stringify({ nombre, requiere_vencimiento: requiereVencimiento }),
      });
      onCreado();
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="panel-modal-fondo" onClick={onClose}>
      <div className="panel-modal" onClick={(e) => e.stopPropagation()} {...modal.props}>
        <h2 id={modal.idTitulo}>{t.configuracion.documentos_tipos_nuevo}</h2>
        {error && <Alert variant="error">{error}</Alert>}
        <div className="molde-formgrid">
          <div className="molde-ancho">
            <FormField label={t.configuracion.documentos_tipos_col_nombre} name="nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
          </div>
          <div className="molde-ancho">
            <FormField
              label={t.configuracion.documentos_tipos_col_requiere_vencimiento}
              name="requiere_vencimiento"
              type="checkbox"
              checked={requiereVencimiento}
              onChange={(e) => setRequiereVencimiento(e.target.checked)}
            />
          </div>
        </div>
        <div className="panel-modal-acciones">
          <Button variant="secondary" onClick={onClose} disabled={guardando}>{t.comun.cancelar}</Button>
          <Button onClick={handleGuardar} disabled={guardando || !nombre}>
            {guardando ? t.comun.guardando : t.comun.guardar}
          </Button>
        </div>
      </div>
    </div>
  );
}
