import { useCallback, useEffect, useState } from 'react';
import { con } from '../../lib/textos';
import { useLocale } from '../../i18n/LocaleContext';
import { useConfirmarDestructivo } from '../../context/ConfirmacionContext';
import { llamarApiConfiguracion as llamarApi } from '../../lib/apiConfiguracion';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';
import { Alert } from '../../components/ui/Alert';
import { EstadoLista } from '../../components/layout/EstadoLista';
import { mensajeDeError } from '../../lib/errores';
import { useModalAccesible } from '../../hooks/useModalAccesible';
import { FacturacionClientesTab } from './FacturacionClientesTab';
import { IndicesDeActualizacion } from './IndicesDeActualizacion';
import { ConsentimientoPagadorTab } from './ConsentimientoPagadorTab';
import { ConsentimientoMedicacionTab } from './ConsentimientoMedicacionTab';
import { TabLugares } from './LosLugares';
import { LaMoneda } from './LaMoneda';
import '../../styles/molde-paginas.css';

/* Quién es la Prestadora y cómo trabaja: su nombre y sus datos, en qué moneda
   trabaja, las zonas donde presta y a qué plazo le pagan los Clientes. */
export function ConfiguracionPrestadora() {
  return (
    <div className="molde-pila">
      <TabEmpresa />
      <LaMoneda />
      <TabZonas />
      <TabLugares />
      <FacturacionClientesTab />
      <IndicesDeActualizacion />
      <ConsentimientoPagadorTab />
      <ConsentimientoMedicacionTab />
    </div>
  );
}

function TabEmpresa() {
  const { t } = useLocale();
  const [form, setForm] = useState(null);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    try {
      const { empresa } = await llamarApi('/empresa');
      setForm(empresa);
      setEstado('listo');
    } catch (err) {
      setError(mensajeDeError(err, t));
      setEstado('error');
    }
  }, [t]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  function set(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }));
    setGuardado(false);
  }

  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      await llamarApi('/empresa', { method: 'PATCH', body: JSON.stringify(form) });
      setGuardado(true);
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="panel-tarjeta">
      <div className="panel-tarjeta-titulo">
        <h2>{t.configuracion.tab_empresa}</h2>
      </div>
      <EstadoLista estado={estado} error={error} vacio={false} recargar={recargar}>
        {form && (
          <>
            {error && <Alert variant="error">{error}</Alert>}
            {guardado && <Alert variant="info">{t.comun.guardar} <span aria-hidden="true">✓</span></Alert>}
            <div className="molde-formgrid">
              <FormField label={t.configuracion.empresa_nombre} name="nombre" value={form.nombre || ''} onChange={(e) => set('nombre', e.target.value)} />
              <FormField label={t.configuracion.empresa_telefono} name="telefono" value={form.telefono || ''} onChange={(e) => set('telefono', e.target.value)} />
              <FormField label={t.configuracion.empresa_telefono_emergencias} name="telefono_emergencias" type="tel" value={form.telefono_emergencias || ''} onChange={(e) => set('telefono_emergencias', e.target.value)} />
              <FormField label={t.configuracion.empresa_whatsapp} name="whatsapp_numero" value={form.whatsapp_numero || ''} onChange={(e) => set('whatsapp_numero', e.target.value)} />
              <FormField label={t.configuracion.empresa_email} name="email" type="email" value={form.email || ''} onChange={(e) => set('email', e.target.value)} />
              <FormField label={t.configuracion.empresa_dominio} name="dominio" value={form.dominio || ''} onChange={(e) => set('dominio', e.target.value)} />
              <FormField label={t.configuracion.empresa_zona_texto} name="zona_cobertura_texto" value={form.zona_cobertura_texto || ''} onChange={(e) => set('zona_cobertura_texto', e.target.value)} />
            </div>
            <div className="molde-acciones">
              <Button onClick={guardar} disabled={guardando}>{guardando ? t.comun.guardando : t.comun.guardar}</Button>
            </div>
          </>
        )}
      </EstadoLista>
    </section>
  );
}

function TabZonas() {
  const { t } = useLocale();
  const confirmarDestructivo = useConfirmarDestructivo();
  const [zonas, setZonas] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [creandoNueva, setCreandoNueva] = useState(false);
  const [actualizandoZona, setActualizandoZona] = useState(null);

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    try {
      const { zonas: filas } = await llamarApi('/zonas');
      setZonas(filas);
      setEstado('listo');
    } catch (err) {
      setError(mensajeDeError(err, t));
      setEstado('error');
    }
  }, [t]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  async function toggleActiva(zona) {
    setActualizandoZona(zona.id);
    try {
      await llamarApi(`/zonas/${zona.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ nombre: zona.nombre, categoria: zona.categoria, orden: zona.orden, activa: !zona.activa }),
      });
      recargar();
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setActualizandoZona(null);
    }
  }

  async function borrar(zona) {
    if (!(await confirmarDestructivo(t.configuracion.zonas_confirmar_borrar))) return;
    setActualizandoZona(zona.id);
    try {
      await llamarApi(`/zonas/${zona.id}`, { method: 'DELETE' });
      recargar();
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setActualizandoZona(null);
    }
  }

  return (
    <section className="panel-tarjeta">
      <div className="panel-tarjeta-titulo">
        <h2>{t.configuracion.tab_zonas}</h2>
        <Button onClick={() => setCreandoNueva(true)}>{t.configuracion.zonas_nueva}</Button>
      </div>
      {estado === 'listo' && error && <Alert variant="error">{error}</Alert>}
      <EstadoLista estado={estado} error={error} vacio={estado === 'listo' && zonas.length === 0} recargar={recargar}>
        <table className="panel-tabla">
          <thead>
            <tr>
              <th>{t.configuracion.zonas_col_codigo}</th>
              <th>{t.configuracion.zonas_col_nombre}</th>
              <th>{t.configuracion.zonas_col_categoria}</th>
              <th>{t.configuracion.zonas_col_activa}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {zonas.map((z) => (
              <tr key={z.id}>
                <td>{z.codigo}</td>
                <td><b>{z.nombre}</b></td>
                <td>{z.categoria}</td>
                <td>
                  <input
                    type="checkbox"
                    checked={z.activa}
                    onChange={() => toggleActiva(z)}
                    disabled={actualizandoZona === z.id}
                    aria-label={con(t.comun.campo_de_fila, { campo: t.configuracion.zonas_col_activa, nombre: z.nombre })}
                  />
                </td>
                <td>
                  <Button variant="secondary" onClick={() => borrar(z)} disabled={actualizandoZona === z.id}>{t.comun.borrar}</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </EstadoLista>

      {creandoNueva && (
        <NuevaZona onClose={() => setCreandoNueva(false)} onCreada={() => { setCreandoNueva(false); recargar(); }} />
      )}
    </section>
  );
}

function NuevaZona({ onClose, onCreada }) {
  const modal = useModalAccesible(onClose);
  const { t } = useLocale();
  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [categoria, setCategoria] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  async function handleGuardar() {
    setGuardando(true);
    setError(null);
    try {
      await llamarApi('/zonas', { method: 'POST', body: JSON.stringify({ codigo, nombre, categoria }) });
      onCreada();
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="panel-modal-fondo" onClick={onClose}>
      <div className="panel-modal" onClick={(e) => e.stopPropagation()} {...modal.props}>
        <h2 id={modal.idTitulo}>{t.configuracion.zonas_nueva}</h2>
        {error && <Alert variant="error">{error}</Alert>}
        <div className="molde-formgrid">
          <FormField label={t.configuracion.zonas_col_codigo} name="codigo" value={codigo} onChange={(e) => setCodigo(e.target.value)} required />
          <FormField label={t.configuracion.zonas_col_nombre} name="nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
          <FormField label={t.configuracion.zonas_col_categoria} name="categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)} required />
        </div>
        <div className="panel-modal-acciones">
          <Button variant="secondary" onClick={onClose} disabled={guardando}>{t.comun.cancelar}</Button>
          <Button onClick={handleGuardar} disabled={guardando || !codigo || !nombre}>
            {guardando ? t.comun.guardando : t.comun.guardar}
          </Button>
        </div>
      </div>
    </div>
  );
}
