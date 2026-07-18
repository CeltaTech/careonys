import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '../i18n/LocaleContext';
import { supabase } from '../lib/supabaseClient';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import { EstadoLista } from '../components/layout/EstadoLista';

const API_URL = import.meta.env.VITE_API_URL;

async function llamarApi(path, opciones = {}) {
  const { data } = await supabase.auth.getSession();
  const respuesta = await fetch(`${API_URL}/api/panel/admin-plataforma${path}`, {
    ...opciones,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.session?.access_token}`,
      ...opciones.headers,
    },
  });
  const resultado = await respuesta.json();
  if (!respuesta.ok) throw new Error(resultado.error);
  return resultado;
}

const TABS = ['resumen', 'licenciatarias', 'planes', 'facturacion'];

export function AdminPlataforma() {
  const { t } = useLocale();
  const [tab, setTab] = useState('resumen');

  return (
    <div>
      <h1>{t.adminPlataforma.titulo}</h1>
      <p className="panel-explicacion">{t.adminPlataforma.explicacion}</p>

      <div className="panel-tabs">
        {TABS.map((tabId) => (
          <button
            key={tabId}
            className={`panel-tab ${tab === tabId ? 'panel-tab-activo' : ''}`}
            onClick={() => setTab(tabId)}
          >
            {t.adminPlataforma[`tab_${tabId}`]}
          </button>
        ))}
      </div>

      <div className="panel-tab-contenido">
        {tab === 'resumen' && <TabResumen />}
        {tab === 'licenciatarias' && <TabLicenciatarias />}
        {tab === 'planes' && <TabPlanes />}
        {tab === 'facturacion' && <TabFacturacion />}
      </div>
    </div>
  );
}

function TabResumen() {
  const { t } = useLocale();
  const [datos, setDatos] = useState(null);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    try {
      const resultado = await llamarApi('/resumen');
      setDatos(resultado);
      setEstado('listo');
    } catch (err) {
      setError(err.message);
      setEstado('error');
    }
  }, []);

  useEffect(() => {
    recargar();
  }, [recargar]);

  return (
    <EstadoLista estado={estado} error={error} vacio={false} recargar={recargar}>
      {datos && (
        <div className="panel-kpis">
          <div className="panel-kpi-card">
            <div className="panel-kpi-valor">${datos.mrrTotal.toLocaleString('es-AR')}</div>
            <div className="panel-kpi-etiqueta">{t.adminPlataforma.kpi_mrr}</div>
          </div>
          <div className="panel-kpi-card">
            <div className="panel-kpi-valor">{datos.prestadorasActivas}</div>
            <div className="panel-kpi-etiqueta">{t.adminPlataforma.kpi_activas}</div>
          </div>
          <div className="panel-kpi-card">
            <div className="panel-kpi-valor">{datos.nuevasEsteMes}</div>
            <div className="panel-kpi-etiqueta">{t.adminPlataforma.kpi_nuevas_mes}</div>
          </div>
          <div className="panel-kpi-card">
            <div className="panel-kpi-valor">{datos.addonsContratados}</div>
            <div className="panel-kpi-etiqueta">{t.adminPlataforma.kpi_addons}</div>
          </div>
        </div>
      )}
    </EstadoLista>
  );
}

function TabLicenciatarias() {
  const { t } = useLocale();
  const [tenants, setTenants] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [tenantAbierto, setTenantAbierto] = useState(null);

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    try {
      const { tenants: filas } = await llamarApi('/tenants');
      setTenants(filas);
      setEstado('listo');
    } catch (err) {
      setError(err.message);
      setEstado('error');
    }
  }, []);

  useEffect(() => {
    recargar();
  }, [recargar]);

  return (
    <>
      {error && <Alert variant="error">{error}</Alert>}
      <EstadoLista estado={estado} error={error} vacio={estado === 'listo' && tenants.length === 0} recargar={recargar}>
        <table className="panel-tabla">
          <thead>
            <tr>
              <th>{t.adminPlataforma.col_nombre}</th>
              <th>{t.adminPlataforma.col_pais}</th>
              <th>{t.adminPlataforma.col_estado}</th>
              <th>{t.adminPlataforma.col_plan}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((tenant) => (
              <tr key={tenant.id}>
                <td>{tenant.nombre_fantasia}</td>
                <td>{tenant.pais}</td>
                <td>
                  <span className={`badge badge-${tenant.estado}`}>{tenant.estado}</span>
                </td>
                <td>{tenant.plan?.nombre ?? t.adminPlataforma.sin_plan}</td>
                <td>
                  <Button variant="secondary" onClick={() => setTenantAbierto(tenant)}>
                    {t.adminPlataforma.ver_modulos}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </EstadoLista>

      {tenantAbierto && (
        <ModulosTenantModal tenant={tenantAbierto} onClose={() => setTenantAbierto(null)} />
      )}
    </>
  );
}

function ModulosTenantModal({ tenant, onClose }) {
  const { t } = useLocale();
  const [modulos, setModulos] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [cambiando, setCambiando] = useState(null);

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    try {
      const { modulos: filas } = await llamarApi(`/tenants/${tenant.id}/modulos`);
      setModulos(filas);
      setEstado('listo');
    } catch (err) {
      setError(err.message);
      setEstado('error');
    }
  }, [tenant.id]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  async function handleToggle(modulo) {
    setCambiando(modulo.key);
    setError(null);
    try {
      await llamarApi(`/tenants/${tenant.id}/modulos/${modulo.key}`, {
        method: 'PATCH',
        body: JSON.stringify({ activo: !modulo.activo }),
      });
      await recargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setCambiando(null);
    }
  }

  return (
    <div className="panel-modal-fondo" onClick={onClose}>
      <div className="panel-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t.adminPlataforma.modulos_titulo.replace('{prestadora}', tenant.nombre_fantasia)}</h2>
        <p className="panel-explicacion">{t.adminPlataforma.modulos_explicacion}</p>

        {error && <Alert variant="error">{error}</Alert>}

        <EstadoLista estado={estado} error={error} vacio={false} recargar={recargar}>
          <div className="panel-modulos-lista">
            {modulos.map((modulo) => (
              <div className="panel-modulo-fila" key={modulo.key}>
                <div className="panel-modulo-fila-info">
                  <strong>{modulo.nombre}</strong>
                  {modulo.origen && (
                    <span className="panel-modulo-fila-origen">
                      {modulo.origen === 'plan' ? t.adminPlataforma.origen_plan : t.adminPlataforma.origen_addon}
                    </span>
                  )}
                </div>
                <Button
                  variant={modulo.activo ? 'primary' : 'secondary'}
                  onClick={() => handleToggle(modulo)}
                  disabled={cambiando === modulo.key}
                >
                  {modulo.activo ? t.comun.si : t.comun.no}
                </Button>
              </div>
            ))}
          </div>
        </EstadoLista>

        <div className="panel-modal-acciones">
          <Button variant="secondary" onClick={onClose}>
            {t.comun.cerrar}
          </Button>
        </div>
      </div>
    </div>
  );
}

function TabPlanes() {
  const { t } = useLocale();
  const [planes, setPlanes] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    try {
      const { planes: filas } = await llamarApi('/planes');
      setPlanes(filas);
      setEstado('listo');
    } catch (err) {
      setError(err.message);
      setEstado('error');
    }
  }, []);

  useEffect(() => {
    recargar();
  }, [recargar]);

  return (
    <EstadoLista estado={estado} error={error} vacio={estado === 'listo' && planes.length === 0} recargar={recargar}>
      <table className="panel-tabla">
        <thead>
          <tr>
            <th>{t.adminPlataforma.col_plan_nombre}</th>
            <th>{t.adminPlataforma.col_plan_precio}</th>
            <th>{t.adminPlataforma.col_plan_modulos}</th>
          </tr>
        </thead>
        <tbody>
          {planes.map((plan) => (
            <tr key={plan.id}>
              <td>{plan.nombre}</td>
              <td>{plan.moneda} {Number(plan.precio).toLocaleString('es-AR')}</td>
              <td>{plan.modulos.join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EstadoLista>
  );
}

function TabFacturacion() {
  const { t } = useLocale();
  const [facturas, setFacturas] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    try {
      const { facturas: filas } = await llamarApi('/facturas');
      setFacturas(filas);
      setEstado('listo');
    } catch (err) {
      setError(err.message);
      setEstado('error');
    }
  }, []);

  useEffect(() => {
    recargar();
  }, [recargar]);

  return (
    <EstadoLista estado={estado} error={error} vacio={estado === 'listo' && facturas.length === 0} recargar={recargar}>
      <table className="panel-tabla">
        <thead>
          <tr>
            <th>{t.adminPlataforma.col_factura_prestadora}</th>
            <th>{t.adminPlataforma.col_factura_concepto}</th>
            <th>{t.adminPlataforma.col_factura_monto}</th>
            <th>{t.adminPlataforma.col_factura_estado}</th>
            <th>{t.adminPlataforma.col_factura_emision}</th>
            <th>{t.adminPlataforma.col_factura_vencimiento}</th>
          </tr>
        </thead>
        <tbody>
          {facturas.map((factura) => (
            <tr key={factura.id}>
              <td>{factura.prestadoras?.nombre_fantasia}</td>
              <td>{factura.concepto}</td>
              <td>{factura.moneda} {Number(factura.monto).toLocaleString('es-AR')}</td>
              <td>
                <span className={`badge badge-${factura.estado}`}>
                  {t.adminPlataforma[`factura_estado_${factura.estado}`]}
                </span>
              </td>
              <td>{factura.fecha_emision}</td>
              <td>{factura.fecha_vencimiento ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EstadoLista>
  );
}
