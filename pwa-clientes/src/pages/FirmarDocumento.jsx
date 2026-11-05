import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLocale } from '../i18n/LocaleContext';
import { errorDeLaRespuesta, mensajeDeError } from '../lib/errores';

const API_URL = import.meta.env.VITE_API_URL;

// Adonde lleva el enlace del email. Quien llega no tiene cuenta: lee el documento y lo firma y, con
// el mismo enlace, vuelve a verlo y lo descarga. No hay nada más para hacer acá.
//
// El texto se muestra tal cual se guardó: el primer renglón es el título y el resto va sin reacomodar.

export default function FirmarDocumento() {
  const { t, locale } = useLocale();
  const [searchParams] = useSearchParams();
  // El enlace sirve sólo si trae las dos cosas: la Prestadora dice en cuál se busca.
  const prestadora = searchParams.get('prestadora');
  const token = prestadora ? searchParams.get('token') : null;
  const [documento, setDocumento] = useState(null);
  const [estado, setEstado] = useState(token ? 'cargando' : 'error');
  const [error, setError] = useState(token ? '' : mensajeDeError({ motivo: 'token_invalido' }, t));
  const [errorDelBoton, setErrorDelBoton] = useState('');
  const [trabajando, setTrabajando] = useState(false);

  const pedir = useCallback(async (tramo) => {
    const respuesta = await fetch(`${API_URL}/api/documento-para-firmar/${encodeURIComponent(prestadora)}${tramo}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, idioma: locale }),
    });
    const resultado = await respuesta.json();
    if (!respuesta.ok) throw errorDeLaRespuesta(respuesta, resultado);
    return resultado;
  }, [prestadora, token, locale]);

  useEffect(() => {
    if (!token) return undefined;
    let vigente = true;
    pedir('')
      .then((leido) => {
        if (!vigente) return;
        setDocumento(leido);
        setEstado('listo');
      })
      .catch((err) => {
        if (!vigente) return;
        setError(mensajeDeError(err, t, 'abrir el documento'));
        setEstado('error');
      });
    return () => {
      vigente = false;
    };
    // `t` cambia junto con el idioma, que ya está en `pedir`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedir, token]);

  async function firmar() {
    setTrabajando(true);
    setErrorDelBoton('');
    try {
      setDocumento(await pedir('/firmar'));
    } catch (err) {
      setErrorDelBoton(mensajeDeError(err, t, 'firmar el documento'));
    } finally {
      setTrabajando(false);
    }
  }

  // Firmado a mano, se baja el archivo que se subió. Firmado acá, se baja el texto que se firmó.
  async function descargar() {
    setTrabajando(true);
    setErrorDelBoton('');
    // La pestaña se abre antes de esperar: después de una espera, el navegador la bloquea.
    const pestana = documento.tieneArchivo ? window.open('', '_blank') : null;
    try {
      if (documento.tieneArchivo) {
        const { url } = await pedir('/descargar');
        if (pestana) {
          pestana.opener = null;
          pestana.location.href = url;
        }
      } else {
        const direccion = URL.createObjectURL(new Blob([documento.texto], { type: 'text/plain;charset=utf-8' }));
        const enlace = document.createElement('a');
        enlace.href = direccion;
        enlace.download = `${String(documento.texto ?? '').split('\n')[0].trim()}.txt`;
        enlace.click();
        URL.revokeObjectURL(direccion);
      }
    } catch (err) {
      pestana?.close();
      setErrorDelBoton(mensajeDeError(err, t, 'descargar el documento'));
    } finally {
      setTrabajando(false);
    }
  }

  if (estado === 'cargando') {
    return <div className="pantalla-cargando estado-cargando" role="status">{t.comun.cargando}</div>;
  }

  if (estado === 'error') {
    return (
      <div className="login-pantalla">
        <div className="login-card">
          <div className="alert alert-error" role="alert">{error}</div>
        </div>
      </div>
    );
  }

  const { marca, textos } = documento;
  const [titulo, ...resto] = String(documento.texto ?? '').split('\n');
  const cuerpo = resto.join('\n').replace(/^\n+/, '');

  return (
    <main className="pwa-body">
      <article className="pwa-card documento-autorizacion">
        <div className="documento-marca">
          {marca.logoUrl && <img className="logo-prestadora" src={marca.logoUrl} alt="" />}
          {marca.nombre && <p className="nombre-prestadora">{marca.nombre}</p>}
        </div>
        <h1 className="documento-titulo">{titulo}</h1>
        <pre className="documento-instruccion">{cuerpo}</pre>
      </article>

      {errorDelBoton && <div className="alert alert-error" role="alert">{errorDelBoton}</div>}
      <button
        type="button"
        className="btn btn-primary btn-full btn-abajo"
        disabled={trabajando}
        onClick={documento.firmado ? descargar : firmar}
      >
        {documento.firmado ? textos.descargar : textos.firmar}
      </button>

      <p className="marca-del-producto">{t.marca.con_tecnologia_de}</p>
    </main>
  );
}
