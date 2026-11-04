import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useLocale } from '../i18n/LocaleContext';
import { mensajeDeError } from '../lib/errores';

const TIPOS_DEL_PODER = 'application/pdf,image/jpeg,image/png';
const CAMPOS = ['nombre', 'apellido', 'cuil', 'archivo'];

/* Quien firma por el que paga o por el Paciente. Lo ve y lo maneja sólo el titular. Los textos llegan
   del backend, porque viven en la base. La revisión del poder no está acá: es de la Prestadora, en el
   Panel. `embebido` lo dibuja sin recuadro propio, para cuando va adentro de otra tarjeta, y `onCambio`
   le avisa a esa tarjeta, porque quién firma cambia lo que ella ofrece. */
export default function ApoderadoDelCliente({ funcion, embebido = false, onCambio }) {
  const { t, locale } = useLocale();
  const [estado, setEstado] = useState('cargando');
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [nombrando, setNombrando] = useState(false);
  const elegirArchivo = useRef(null);

  const recargar = useCallback(async () => {
    setError('');
    try {
      setDatos(await api.apoderado(funcion, locale));
      setEstado('listo');
    } catch (fallo) {
      setError(mensajeDeError(fallo, t, 'apoderado'));
      setEstado('error');
    }
  }, [funcion, locale, t]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  const alCambiar = onCambio ?? recargar;

  async function ejecutar(accion, contexto) {
    setOcupado(true);
    setError('');
    try {
      await accion();
      await alCambiar();
    } catch (fallo) {
      setError(mensajeDeError(fallo, t, contexto));
    } finally {
      setOcupado(false);
    }
  }

  async function verPoder() {
    // La pestaña se abre antes de esperar la respuesta: abierta después, el navegador la bloquea.
    const pestana = window.open('', '_blank');
    setError('');
    try {
      const { url } = await api.verPoder(funcion);
      if (pestana) {
        pestana.opener = null;
        pestana.location.href = url;
      }
    } catch (fallo) {
      pestana?.close();
      setError(mensajeDeError(fallo, t, 'ver el poder'));
    }
  }

  function subirPoder(e) {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    const cuerpo = new FormData();
    cuerpo.append('archivo', archivo);
    ejecutar(() => api.reemplazarPoder(funcion, cuerpo), 'cargar el poder');
  }

  function quitar() {
    if (!window.confirm(datos.textos.quitar_aviso)) return;
    ejecutar(() => api.quitarApoderado(funcion), 'quitar al apoderado');
  }

  const apoderado = datos?.apoderado ?? null;
  const textos = datos?.textos ?? {};

  const contenido = (
    <>
      {estado === 'cargando' && <div className="estado-cargando" role="status">{t.comun.cargando}</div>}
      {error && <div className="alert alert-error" role="alert">{error}</div>}

      {estado === 'listo' && (
        <>
          {apoderado && (
            <>
              <div className="pwa-card-dato">{apoderado.nombre}</div>
              <div className="pwa-card-dato">{textos.poder}: {textos[`estado_${apoderado.estado}`]}</div>
              {apoderado.estado === 'observado' && apoderado.motivo && (
                <div className="alert alert-error" role="alert">{apoderado.motivo}</div>
              )}
            </>
          )}

          {nombrando ? (
            <NombrarApoderado
              funcion={funcion}
              textos={textos}
              onCerrar={() => setNombrando(false)}
              onHecho={() => { setNombrando(false); alCambiar(); }}
            />
          ) : (
            <div className="pwa-acciones">
              {apoderado?.tienePoder && (
                <button type="button" className="btn" onClick={verPoder} disabled={ocupado}>{textos.ver}</button>
              )}
              {apoderado && (
                <>
                  <button type="button" className="btn" onClick={() => elegirArchivo.current?.click()} disabled={ocupado}>
                    {apoderado.tienePoder ? textos.reemplazar : textos.cargar}
                  </button>
                  <input ref={elegirArchivo} type="file" accept={TIPOS_DEL_PODER} hidden onChange={subirPoder} />
                  <button type="button" className="btn" onClick={quitar} disabled={ocupado}>{textos.quitar}</button>
                </>
              )}
              <button type="button" className={apoderado ? 'btn' : 'btn btn-primary'} onClick={() => setNombrando(true)} disabled={ocupado}>
                {textos.nombrar}
              </button>
            </div>
          )}
        </>
      )}
    </>
  );

  if (embebido) {
    return (
      <div>
        {estado === 'listo' && <h2>{textos.titulo}</h2>}
        {contenido}
      </div>
    );
  }

  return (
    <section className="pwa-card">
      {estado === 'listo' && <h2>{textos.titulo}</h2>}
      {contenido}
    </section>
  );
}

function NombrarApoderado({ funcion, textos, onCerrar, onHecho }) {
  const { t } = useLocale();
  const [valores, setValores] = useState({ nombre: '', apellido: '', cuil: '', archivo: null });
  const [errores, setErrores] = useState({});
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  // Hay dos en la misma página cuando el titular abre los dos a la vez: la función separa los casilleros.
  const idDe = (campo) => `apoderado-${funcion}-${campo}`;

  function cambiar(campo, valor) {
    setValores((v) => ({ ...v, [campo]: valor }));
    setErrores((e) => ({ ...e, [campo]: undefined }));
  }

  const estaCompleto = (campo) => (campo === 'archivo' ? Boolean(valores.archivo) : Boolean(valores[campo].trim()));

  async function guardar(e) {
    e.preventDefault();
    const faltantes = CAMPOS.filter((campo) => !estaCompleto(campo));
    if (faltantes.length > 0) {
      setErrores(Object.fromEntries(faltantes.map((campo) => [campo, textos.campo_obligatorio])));
      document.getElementById(idDe(faltantes[0]))?.focus();
      return;
    }
    const cuerpo = new FormData();
    cuerpo.append('nombre', valores.nombre.trim());
    cuerpo.append('apellido', valores.apellido.trim());
    cuerpo.append('cuil', valores.cuil.trim());
    cuerpo.append('archivo', valores.archivo);

    setOcupado(true);
    setError('');
    try {
      await api.nombrarApoderado(funcion, cuerpo);
      onHecho();
    } catch (fallo) {
      if (fallo.motivo === 'numero_no_valido') {
        setErrores((previos) => ({ ...previos, cuil: mensajeDeError(fallo, t, 'nombrar al apoderado') }));
        document.getElementById(idDe('cuil'))?.focus();
      } else {
        setError(mensajeDeError(fallo, t, 'nombrar al apoderado'));
      }
      setOcupado(false);
    }
  }

  function campo(nombre, etiqueta, propios) {
    const id = idDe(nombre);
    const idError = `${id}-error`;
    return (
      <div className="form-field">
        <label htmlFor={id}>{etiqueta}</label>
        <input
          id={id}
          disabled={ocupado}
          aria-invalid={errores[nombre] ? 'true' : undefined}
          aria-describedby={errores[nombre] ? idError : undefined}
          {...propios}
        />
        {errores[nombre] && <span className="form-error" id={idError}>{errores[nombre]}</span>}
      </div>
    );
  }

  const deTexto = (nombre) => ({ value: valores[nombre], onChange: (e) => cambiar(nombre, e.target.value) });

  return (
    <form onSubmit={guardar} noValidate>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {campo('nombre', textos.nombre, deTexto('nombre'))}
      {campo('apellido', textos.apellido, deTexto('apellido'))}
      {campo('cuil', textos.cuil, { ...deTexto('cuil'), inputMode: 'numeric' })}
      {campo('archivo', textos.poder, {
        type: 'file',
        accept: TIPOS_DEL_PODER,
        onChange: (e) => cambiar('archivo', e.target.files?.[0] || null),
      })}
      <div className="pwa-acciones">
        <button type="button" className="btn" onClick={onCerrar} disabled={ocupado}>{textos.cancelar}</button>
        <button type="submit" className="btn btn-primary" disabled={ocupado}>{textos.guardar}</button>
      </div>
    </form>
  );
}
