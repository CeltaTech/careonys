import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { llamarApiPanel } from '../../lib/apiPanel';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';
import { Alert } from '../../components/ui/Alert';
import { mensajeDeError } from '../../lib/errores';
import { useModalAccesible } from '../../hooks/useModalAccesible';
import { TONO_DEL_ESTADO } from '../../lib/documentos';
import { claseBadgeTono } from '../../lib/tonos';
import '../../styles/molde-paginas.css';
import '../tarjetas.css';

const TIPOS_DEL_PODER = 'application/pdf,image/jpeg,image/png';
const CAMPOS = ['nombre', 'apellido', 'cuil', 'archivo'];

/* Quien firma por el que paga o por el Paciente. Se nombra una vez por Cliente y por función, y sólo
   firma con el poder aprobado. Los textos llegan del backend, porque viven en la base. `embebido` lo
   dibuja sin recuadro propio, para cuando va adentro de una ventana. */
export function ApoderadoDelCliente({ clienteId, funcion, puedeRegistrar, esAdmin, onCambio, embebido = false }) {
  const { t, locale } = useLocale();
  const [estado, setEstado] = useState('cargando');
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [nombrando, setNombrando] = useState(false);
  const [quitando, setQuitando] = useState(false);
  const [observando, setObservando] = useState(false);
  const elegirArchivo = useRef(null);

  const camino = `/apoderado/cliente/${clienteId}/${funcion}`;

  const recargar = useCallback(async () => {
    setError(null);
    try {
      setDatos(await llamarApiPanel(`${camino}?idioma=${locale}`));
      setEstado('listo');
    } catch (err) {
      setError(mensajeDeError(err, t));
      setEstado('error');
    }
  }, [camino, locale, t]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  async function alTerminar() {
    await recargar();
    onCambio?.();
  }

  async function ejecutar(accion) {
    setOcupado(true);
    setError(null);
    try {
      await accion();
      await alTerminar();
    } catch (err) {
      setError(mensajeDeError(err, t));
    } finally {
      setOcupado(false);
    }
  }

  async function verPoder() {
    // La pestaña se abre antes de esperar la respuesta: abierta después, el navegador la bloquea.
    const pestana = window.open('', '_blank');
    setError(null);
    try {
      const { url } = await llamarApiPanel(`${camino}/poder`);
      if (pestana) {
        pestana.opener = null;
        pestana.location.href = url;
      }
    } catch (err) {
      pestana?.close();
      setError(mensajeDeError(err, t));
    }
  }

  function subirPoder(e) {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    const cuerpo = new FormData();
    cuerpo.append('archivo', archivo);
    ejecutar(() => llamarApiPanel(`${camino}/poder`, { method: 'POST', body: cuerpo }));
  }

  const apoderado = datos?.apoderado ?? null;
  const textos = datos?.textos ?? {};

  // Sin Apoderado y sin permiso para nombrarlo no hay nada que mostrar, tampoco el recuadro.
  if (estado === 'listo' && !apoderado && !puedeRegistrar) return null;

  const contenido = (
    <>
      {estado === 'cargando' && <p className="molde-vacio">{t.comun.cargando}</p>}
      {error && <Alert variant="error">{error}</Alert>}

      {estado === 'listo' && (
        <>
          {apoderado && (
            <>
              <div className="panel-grilla panel-columnas-3">
                <div className="tarjeta-dato">
                  <div className="panel-mini">{textos.titulo}</div>
                  <b>{apoderado.nombre}</b>
                </div>
                <div className="tarjeta-dato">
                  <div className="panel-mini">{textos.poder}</div>
                  <span className={claseBadgeTono(TONO_DEL_ESTADO[apoderado.estado])}>
                    {textos[`estado_${apoderado.estado}`]}
                  </span>
                </div>
              </div>
              {apoderado.estado === 'observado' && apoderado.motivo && (
                <Alert variant="warning">{apoderado.motivo}</Alert>
              )}
            </>
          )}

          <div className="molde-acciones">
            {apoderado?.tienePoder && (
              <Button variant="secondary" onClick={verPoder} disabled={ocupado}>{textos.ver}</Button>
            )}
            {puedeRegistrar && apoderado && (
              <>
                <Button variant="secondary" onClick={() => elegirArchivo.current?.click()} disabled={ocupado}>
                  {apoderado.tienePoder ? textos.reemplazar : textos.cargar}
                </Button>
                <input ref={elegirArchivo} type="file" accept={TIPOS_DEL_PODER} hidden onChange={subirPoder} />
                <Button variant="secondary" onClick={() => setQuitando(true)} disabled={ocupado}>{textos.quitar}</Button>
              </>
            )}
            {puedeRegistrar && (
              <Button variant={apoderado ? 'secondary' : undefined} onClick={() => setNombrando(true)} disabled={ocupado}>
                {textos.nombrar}
              </Button>
            )}
            {esAdmin && apoderado?.estado === 'en_revision' && (
              <>
                <Button variant="secondary" onClick={() => setObservando(true)} disabled={ocupado}>{textos.observar}</Button>
                <Button
                  onClick={() => ejecutar(() => llamarApiPanel(`/apoderado/${apoderado.id}/aprobar`, { method: 'POST' }))}
                  disabled={ocupado}
                >
                  {textos.aprobar}
                </Button>
              </>
            )}
          </div>
        </>
      )}

      {nombrando && (
        <NombrarApoderado
          camino={camino}
          textos={textos}
          onCerrar={() => setNombrando(false)}
          onHecho={() => { setNombrando(false); alTerminar(); }}
        />
      )}
      {quitando && (
        <QuitarApoderado
          camino={camino}
          textos={textos}
          onCerrar={() => setQuitando(false)}
          onHecho={() => { setQuitando(false); alTerminar(); }}
        />
      )}
      {observando && (
        <ObservarPoder
          id={apoderado.id}
          textos={textos}
          onCerrar={() => setObservando(false)}
          onHecho={() => { setObservando(false); alTerminar(); }}
        />
      )}
    </>
  );

  if (embebido) {
    return (
      <div>
        {estado === 'listo' && !apoderado && <h3>{textos.titulo}</h3>}
        {contenido}
      </div>
    );
  }

  return (
    <section className="panel-tarjeta">
      {estado === 'listo' && <div className="panel-tarjeta-titulo"><h2>{textos.titulo}</h2></div>}
      {contenido}
    </section>
  );
}

function VentanaDelApoderado({ titulo, error, onCerrar, ocupado, cancelar, confirmar, alConfirmar, children }) {
  const modal = useModalAccesible(onCerrar);
  return (
    <div className="panel-modal-fondo" onClick={(e) => { e.stopPropagation(); onCerrar(); }}>
      <div className="panel-modal" onClick={(e) => e.stopPropagation()} {...modal.props}>
        <h2 id={modal.idTitulo}>{titulo}</h2>
        {error && <Alert variant="error">{error}</Alert>}
        {children}
        <div className="panel-modal-acciones">
          <Button variant="secondary" onClick={onCerrar} disabled={ocupado}>{cancelar}</Button>
          <Button onClick={alConfirmar} disabled={ocupado}>{confirmar}</Button>
        </div>
      </div>
    </div>
  );
}

function NombrarApoderado({ camino, textos, onCerrar, onHecho }) {
  const { t } = useLocale();
  const [valores, setValores] = useState({ nombre: '', apellido: '', cuil: '', archivo: null });
  const [errores, setErrores] = useState({});
  const [error, setError] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  function cambiar(campo, valor) {
    setValores((v) => ({ ...v, [campo]: valor }));
    setErrores((e) => ({ ...e, [campo]: undefined }));
  }

  const estaCompleto = (campo) => (campo === 'archivo' ? Boolean(valores.archivo) : Boolean(valores[campo].trim()));

  async function guardar() {
    const faltantes = CAMPOS.filter((campo) => !estaCompleto(campo));
    if (faltantes.length > 0) {
      setErrores(Object.fromEntries(faltantes.map((campo) => [campo, textos.campo_obligatorio])));
      document.getElementById(`field-apoderado-${faltantes[0]}`)?.focus();
      return;
    }
    const cuerpo = new FormData();
    cuerpo.append('nombre', valores.nombre.trim());
    cuerpo.append('apellido', valores.apellido.trim());
    cuerpo.append('cuil', valores.cuil.trim());
    cuerpo.append('archivo', valores.archivo);

    setOcupado(true);
    setError(null);
    try {
      await llamarApiPanel(camino, { method: 'POST', body: cuerpo });
      onHecho();
    } catch (err) {
      if (err.motivo === 'numero_no_valido') {
        setErrores((e) => ({ ...e, cuil: mensajeDeError(err, t) }));
        document.getElementById('field-apoderado-cuil')?.focus();
      } else {
        setError(mensajeDeError(err, t));
      }
      setOcupado(false);
    }
  }

  return (
    <VentanaDelApoderado
      titulo={textos.nombrar}
      error={error}
      onCerrar={onCerrar}
      ocupado={ocupado}
      cancelar={textos.cancelar}
      confirmar={textos.guardar}
      alConfirmar={guardar}
    >
      <div className="molde-formgrid">
        <FormField label={textos.nombre} name="apoderado-nombre" value={valores.nombre} onChange={(e) => cambiar('nombre', e.target.value)} error={errores.nombre} disabled={ocupado} required />
        <FormField label={textos.apellido} name="apoderado-apellido" value={valores.apellido} onChange={(e) => cambiar('apellido', e.target.value)} error={errores.apellido} disabled={ocupado} required />
        <FormField label={textos.cuil} name="apoderado-cuil" inputMode="numeric" value={valores.cuil} onChange={(e) => cambiar('cuil', e.target.value)} error={errores.cuil} disabled={ocupado} required />
        <FormField label={textos.poder} name="apoderado-archivo" type="file" accept={TIPOS_DEL_PODER} onChange={(e) => cambiar('archivo', e.target.files?.[0] || null)} error={errores.archivo} disabled={ocupado} required />
      </div>
    </VentanaDelApoderado>
  );
}

function QuitarApoderado({ camino, textos, onCerrar, onHecho }) {
  const { t } = useLocale();
  const [error, setError] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  async function quitar() {
    setOcupado(true);
    setError(null);
    try {
      await llamarApiPanel(`${camino}/quitar`, { method: 'POST' });
      onHecho();
    } catch (err) {
      setError(mensajeDeError(err, t));
      setOcupado(false);
    }
  }

  return (
    <VentanaDelApoderado
      titulo={textos.quitar_aviso}
      error={error}
      onCerrar={onCerrar}
      ocupado={ocupado}
      cancelar={textos.cancelar}
      confirmar={textos.quitar}
      alConfirmar={quitar}
    />
  );
}

function ObservarPoder({ id, textos, onCerrar, onHecho }) {
  const { t } = useLocale();
  const [motivo, setMotivo] = useState('');
  const [faltaMotivo, setFaltaMotivo] = useState(false);
  const [error, setError] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  async function observar() {
    if (!motivo.trim()) {
      setFaltaMotivo(true);
      document.getElementById('field-apoderado-motivo')?.focus();
      return;
    }
    setOcupado(true);
    setError(null);
    try {
      await llamarApiPanel(`/apoderado/${id}/observar`, { method: 'POST', body: JSON.stringify({ motivo: motivo.trim() }) });
      onHecho();
    } catch (err) {
      setError(mensajeDeError(err, t));
      setOcupado(false);
    }
  }

  return (
    <VentanaDelApoderado
      titulo={textos.observar}
      error={error}
      onCerrar={onCerrar}
      ocupado={ocupado}
      cancelar={textos.cancelar}
      confirmar={textos.observar}
      alConfirmar={observar}
    >
      <div className="molde-formgrid">
        <div className="molde-ancho">
          <FormField
            label={textos.motivo}
            name="apoderado-motivo"
            value={motivo}
            onChange={(e) => { setMotivo(e.target.value); setFaltaMotivo(false); }}
            error={faltaMotivo ? textos.campo_obligatorio : undefined}
            disabled={ocupado}
            required
          />
        </div>
      </div>
    </VentanaDelApoderado>
  );
}
