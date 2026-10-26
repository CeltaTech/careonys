// El titular anota a una persona autorizada. Al guardar, la autorización de acceso aparece ahí
// mismo con el botón para firmarla: no hace falta ningún aviso, porque la tiene delante.
//
// GUARDAR NO DA NINGÚN ACCESO. Arma la autorización; los accesos rigen recién cuando la firma, y
// hasta entonces sigue rigiendo lo anterior.
//
// EL CUIL LO VALIDA EL BACKEND, que es el que sabe de qué país es la Prestadora. Acá sólo se mira
// que nada quede vacío; lo que el backend rechaza vuelve como motivo y se cuelga del campo que
// corresponde.

import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useLocale } from '../i18n/LocaleContext';
import { traducirValor } from '../i18n/valores';
import { usePersonasAutorizadas } from '../context/PersonasAutorizadasContext';
import { mensajeDeError } from '../lib/errores';
import DocumentoParaFirmar from '../components/DocumentoParaFirmar';
import { MS_ANTES_DE_VOLVER } from './FirmarInstruccion';

const CAMPOS = ['nombre', 'apellido', 'cuil', 'genero', 'email'];

// Qué campo tiene la culpa de cada rechazo del backend. Lo que no está acá va como alerta general.
const CAMPO_DEL_MOTIVO = {
  falta_el_documento: 'cuil',
  numero_no_valido: 'cuil',
  documento_repetido: 'cuil',
  falta_el_dni: 'cuil',
  dni_no_coincide: 'cuil',
  correo_de_otra_cuenta: 'email',
  ya_es_persona_autorizada: 'email',
  falta_el_genero: 'genero',
  genero_no_reconocido: 'genero',
};

function Campo({ nombre, etiqueta, tipo = 'text', valor, alCambiar, error, inputMode, children }) {
  const idCampo = `persona-${nombre}`;
  const idError = `${idCampo}-error`;
  const comunes = {
    id: idCampo,
    value: valor,
    onChange: alCambiar,
    'aria-invalid': error ? 'true' : undefined,
    'aria-describedby': error ? idError : undefined,
  };
  return (
    <div className="form-field">
      <label htmlFor={idCampo}>{etiqueta}</label>
      {children ? <select {...comunes}>{children}</select> : <input {...comunes} type={tipo} inputMode={inputMode} />}
      {error && <span className="form-error" id={idError}>{error}</span>}
    </div>
  );
}

export default function AgregarPersonaAutorizada() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const { recargar } = usePersonasAutorizadas();
  const textos = t.alta_persona;

  const [opciones, setOpciones] = useState(null);
  const [errorDeCarga, setErrorDeCarga] = useState('');
  const [datos, setDatos] = useState({ nombre: '', apellido: '', cuil: '', genero: '', email: '' });
  const [accesos, setAccesos] = useState({});
  const [errores, setErrores] = useState({});
  const [errorGeneral, setErrorGeneral] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [instruccion, setInstruccion] = useState(null);
  const reloj = useRef(null);

  useEffect(() => {
    let activo = true;
    api
      .personasAutorizadas()
      .then(({ catalogo, generos }) => {
        if (!activo) return;
        // Lo que la Prestadora apagó para toda su aplicación no se ofrece.
        const ofrecidos = catalogo.filter((a) => !a.topado);
        setOpciones({ catalogo: ofrecidos, generos });
        setAccesos(Object.fromEntries(ofrecidos.map((a) => [a.clave, Boolean(a.de_fabrica)])));
      })
      .catch((e) => {
        if (activo) setErrorDeCarga(mensajeDeError(e, t, 'personas autorizadas'));
      });
    return () => {
      activo = false;
      if (reloj.current) clearTimeout(reloj.current);
    };
  }, []);

  function cambiar(campo) {
    return (e) => {
      const valor = e.target.value;
      setDatos((d) => ({ ...d, [campo]: valor }));
      // El aviso se va en cuanto el dato se completa, sin esperar a que se vuelva a guardar.
      if (errores[campo] && valor.trim()) setErrores(({ [campo]: _, ...resto }) => resto);
    };
  }

  function enfocar(campo) {
    document.getElementById(`persona-${campo}`)?.focus();
  }

  async function guardar(e) {
    e.preventDefault();
    setErrorGeneral('');
    const faltan = Object.fromEntries(
      CAMPOS.filter((c) => !datos[c].trim()).map((c) => [c, textos.campo_obligatorio]),
    );
    setErrores(faltan);
    const primero = CAMPOS.find((c) => faltan[c]);
    if (primero) {
      enfocar(primero);
      return;
    }

    setEnviando(true);
    try {
      const respuesta = await api.agregarPersonaAutorizada({
        nombre: datos.nombre.trim(),
        apellido: datos.apellido.trim(),
        documento: datos.cuil.trim(),
        genero: datos.genero,
        email: datos.email.trim(),
        accesos,
      });
      setInstruccion(respuesta.instruccion);
    } catch (error) {
      const mensaje = mensajeDeError(error, t, 'agregar persona autorizada');
      const campo = CAMPO_DEL_MOTIVO[error?.motivo];
      if (campo) {
        setErrores({ [campo]: mensaje });
        enfocar(campo);
      } else {
        setErrorGeneral(mensaje);
      }
    } finally {
      setEnviando(false);
    }
  }

  function alFirmar() {
    recargar();
    reloj.current = setTimeout(() => navigate('/perfil', { replace: true }), MS_ANTES_DE_VOLVER);
  }

  const volver = (
    <Link to="/perfil" className="btn btn-volver">
      <span aria-hidden="true">←</span> {t.comun.volver}
    </Link>
  );

  if (errorDeCarga) {
    return (
      <>
        {volver}
        <div className="alert alert-error" role="alert">{errorDeCarga}</div>
      </>
    );
  }

  if (!opciones) return <div className="estado-cargando" role="status">{t.comun.cargando}</div>;

  if (instruccion) {
    return (
      <>
        {volver}
        <DocumentoParaFirmar instruccion={instruccion} onFirmada={alFirmar} />
      </>
    );
  }

  return (
    <>
      {volver}
      <h1>{textos.titulo}</h1>
      <form className="pwa-card" onSubmit={guardar} noValidate>
        <Campo nombre="nombre" etiqueta={textos.nombre} valor={datos.nombre} alCambiar={cambiar('nombre')} error={errores.nombre} />
        <Campo nombre="apellido" etiqueta={textos.apellido} valor={datos.apellido} alCambiar={cambiar('apellido')} error={errores.apellido} />
        <Campo nombre="cuil" etiqueta={textos.cuil} inputMode="numeric" valor={datos.cuil} alCambiar={cambiar('cuil')} error={errores.cuil} />
        <Campo nombre="genero" etiqueta={textos.genero} valor={datos.genero} alCambiar={cambiar('genero')} error={errores.genero}>
          <option value="">{textos.elegir}</option>
          {opciones.generos.map((codigo) => (
            <option key={codigo} value={codigo}>{traducirValor(t.generos, codigo)}</option>
          ))}
        </Campo>
        <Campo nombre="email" etiqueta={textos.email} tipo="email" valor={datos.email} alCambiar={cambiar('email')} error={errores.email} />

        {opciones.catalogo.length > 0 && (
          <fieldset className="form-field">
            <legend>{textos.permisos}</legend>
            {opciones.catalogo.map(({ clave }) => (
              <label key={clave} className="casilla">
                <input
                  type="checkbox"
                  checked={Boolean(accesos[clave])}
                  onChange={(e) => setAccesos((a) => ({ ...a, [clave]: e.target.checked }))}
                  disabled={enviando}
                />
                <span>{traducirValor(t.personas_autorizadas, clave)}</span>
              </label>
            ))}
          </fieldset>
        )}

        {errorGeneral && <div className="alert alert-error" role="alert">{errorGeneral}</div>}

        <button type="submit" className="btn btn-primary btn-full" disabled={enviando}>
          {enviando ? textos.guardando : textos.guardar}
        </button>
      </form>
    </>
  );
}
