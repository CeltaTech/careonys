import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useLocale } from '../i18n/LocaleContext';
import { mensajeDeError } from '../lib/errores';
import { con } from '../lib/textos';
import { avisar } from '../lib/mensajeEmergente';
import {
  agregarPersona,
  agregarPersonaNueva,
  bajar,
  cambio,
  cuerpoDelPedido,
  deLaRespuesta,
  faltantesDeLaPersonaNueva,
  nombreDe,
  personasParaElegir,
  quitar,
  rolesDe,
  sePuedeAgregar,
  subir,
  textoDelError,
} from '../lib/contactosDeEmergencia';

const PERSONA_NUEVA = 'nueva';
const VACIOS = { persona: '', nombre: '', apellido: '', telefono: '' };

/* A quién se llama si al Paciente le pasa algo: hasta el máximo que fija el backend, en orden de
   prioridad. La arma y la guarda sólo el titular: el backend no se la contesta a nadie más. El título
   y el lugar de cada persona en el Cliente llegan del backend, porque viven en la base. */
export default function ContactosDeEmergencia() {
  const { t, locale } = useLocale();
  const textos = t.contactos_de_emergencia;
  const [estado, setEstado] = useState('cargando');
  const [datos, setDatos] = useState(null);
  const [lista, setLista] = useState([]);
  const [agregando, setAgregando] = useState(false);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const proximaClave = useRef(0);

  const tomar = useCallback((respuesta) => {
    setDatos(respuesta);
    setLista(deLaRespuesta(respuesta.contactos));
  }, []);

  const recargar = useCallback(async () => {
    setError('');
    setEstado('cargando');
    try {
      tomar(await api.contactosDeEmergencia(locale));
      setEstado('listo');
    } catch (fallo) {
      setError(mensajeDeError(fallo, t, 'contactos de emergencia'));
      setEstado('error');
    }
  }, [locale, t, tomar]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  const textosDeLaBase = datos?.textos ?? {};
  const maximo = datos?.maximo ?? 0;
  const guardada = deLaRespuesta(datos?.contactos);
  const hayCambios = cambio(lista, guardada);

  function cambiarLista(nueva) {
    setError('');
    setLista(nueva);
  }

  function alAgregar(valores) {
    if (valores.persona === PERSONA_NUEVA) {
      proximaClave.current += 1;
      cambiarLista(agregarPersonaNueva(lista, valores, `nueva-${proximaClave.current}`, maximo));
    } else {
      const persona = datos.personas.find((p) => p.personaId === valores.persona);
      cambiarLista(agregarPersona(lista, persona, maximo));
    }
    setAgregando(false);
  }

  async function guardar() {
    setOcupado(true);
    setError('');
    try {
      tomar(await api.guardarContactosDeEmergencia(cuerpoDelPedido(lista).contactos, locale));
      avisar(textos.guardado);
    } catch (fallo) {
      setError(textoDelError(fallo, textosDeLaBase) ?? mensajeDeError(fallo, t, 'guardar los contactos de emergencia'));
    } finally {
      setOcupado(false);
    }
  }

  function descartar() {
    setError('');
    setAgregando(false);
    setLista(guardada);
  }

  return (
    <section className="pwa-card">
      {estado === 'listo' && <h2>{textosDeLaBase.titulo}</h2>}
      {estado === 'cargando' && <div className="estado-cargando" role="status">{t.comun.cargando}</div>}
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {estado === 'error' && (
        <div className="pwa-acciones pwa-acciones-sola">
          <button type="button" className="btn" onClick={recargar}>{t.comun.reintentar}</button>
        </div>
      )}

      {estado === 'listo' && (
        <>
          {lista.length === 0 ? (
            <p className="tarjeta-detalle">{textos.lista_vacia}</p>
          ) : (
            <ol className="lista-tareas">
              {lista.map((contacto, indice) => {
                const nombre = nombreDe(contacto);
                const roles = rolesDe(contacto, textosDeLaBase);
                return (
                  <li key={contacto.clave}>
                    <div className="pwa-card-dato">{nombre}</div>
                    {roles.length > 0 && <div className="mini">{roles.join(' · ')}</div>}
                    {contacto.telefonos?.length > 0 && <div className="mini">{contacto.telefonos.join(' · ')}</div>}
                    <div className="pwa-acciones">
                      <button
                        type="button"
                        className="btn"
                        onClick={() => cambiarLista(subir(lista, indice))}
                        disabled={ocupado || indice === 0}
                        aria-label={con(textos.subir_a, { nombre })}
                      >
                        {textos.subir}
                      </button>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => cambiarLista(bajar(lista, indice))}
                        disabled={ocupado || indice === lista.length - 1}
                        aria-label={con(textos.bajar_a, { nombre })}
                      >
                        {textos.bajar}
                      </button>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => cambiarLista(quitar(lista, indice))}
                        disabled={ocupado}
                        aria-label={con(textos.quitar_a, { nombre })}
                      >
                        {textos.quitar}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          {agregando ? (
            <AgregarContacto
              personas={personasParaElegir(datos.personas, lista)}
              textos={textos}
              textosDeLaBase={textosDeLaBase}
              onCerrar={() => setAgregando(false)}
              onAgregar={alAgregar}
            />
          ) : (
            <div className="pwa-acciones">
              {sePuedeAgregar(lista, maximo) && (
                <button type="button" className="btn" onClick={() => setAgregando(true)} disabled={ocupado}>
                  {textos.agregar}
                </button>
              )}
              {hayCambios && (
                <>
                  <button type="button" className="btn" onClick={descartar} disabled={ocupado}>{t.comun.cancelar}</button>
                  <button type="button" className="btn btn-primary" onClick={guardar} disabled={ocupado}>
                    {ocupado ? textos.guardando : textos.guardar}
                  </button>
                </>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function AgregarContacto({ personas, textos, textosDeLaBase, onCerrar, onAgregar }) {
  const { t } = useLocale();
  const [valores, setValores] = useState(VACIOS);
  const [errores, setErrores] = useState({});

  const idDe = (campo) => `contacto-de-emergencia-${campo}`;
  const esNueva = valores.persona === PERSONA_NUEVA;

  function faltantes(v) {
    if (!v.persona) return ['persona'];
    return v.persona === PERSONA_NUEVA ? faltantesDeLaPersonaNueva(v) : [];
  }

  function cambiar(campo, valor) {
    const nuevos = { ...valores, [campo]: valor };
    setValores(nuevos);
    // El aviso se va en cuanto el dato se completa, sin esperar a que se vuelva a apretar.
    const siguenFaltando = faltantes(nuevos);
    setErrores((previos) => Object.fromEntries(Object.entries(previos).filter(([c]) => siguenFaltando.includes(c))));
  }

  function agregar(e) {
    e.preventDefault();
    const lista = faltantes(valores);
    setErrores(Object.fromEntries(lista.map((campo) => [campo, textos.falta[campo]])));
    if (lista.length > 0) {
      document.getElementById(idDe(lista[0]))?.focus();
      return;
    }
    onAgregar(valores);
  }

  function propiosDe(nombre) {
    const idError = `${idDe(nombre)}-error`;
    return {
      id: idDe(nombre),
      required: true,
      'aria-invalid': errores[nombre] ? 'true' : undefined,
      'aria-describedby': errores[nombre] ? idError : undefined,
    };
  }

  const aviso = (nombre) =>
    errores[nombre] && <span className="form-error" id={`${idDe(nombre)}-error`}>{errores[nombre]}</span>;

  function campo(nombre, tipo = 'text') {
    return (
      <div className="form-field">
        <label htmlFor={idDe(nombre)}>{textos[nombre]}</label>
        <input
          {...propiosDe(nombre)}
          type={tipo}
          inputMode={tipo === 'tel' ? 'tel' : undefined}
          value={valores[nombre]}
          onChange={(e) => cambiar(nombre, e.target.value)}
        />
        {aviso(nombre)}
      </div>
    );
  }

  return (
    <form onSubmit={agregar} noValidate>
      <div className="form-field">
        <label htmlFor={idDe('persona')}>{textos.persona}</label>
        <select {...propiosDe('persona')} value={valores.persona} onChange={(e) => cambiar('persona', e.target.value)}>
          <option value="">{textos.elegir}</option>
          {personas.map((p) => {
            const roles = rolesDe(p, textosDeLaBase);
            return (
              <option key={p.personaId} value={p.personaId}>
                {roles.length > 0 ? `${p.nombre} (${roles.join(', ')})` : p.nombre}
              </option>
            );
          })}
          <option value={PERSONA_NUEVA}>{textos.persona_nueva}</option>
        </select>
        {aviso('persona')}
      </div>
      {esNueva && (
        <>
          {campo('nombre')}
          {campo('apellido')}
          {campo('telefono', 'tel')}
        </>
      )}
      <div className="pwa-acciones">
        <button type="button" className="btn" onClick={onCerrar}>{t.comun.cancelar}</button>
        <button type="submit" className="btn btn-primary">{textos.agregar_a_la_lista}</button>
      </div>
    </form>
  );
}
