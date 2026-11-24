import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { EstadoLista } from '../../components/layout/EstadoLista';
import { mensajeDeError } from '../../lib/errores';
import { avisar } from '../../lib/mensajeEmergente';
import { con } from '../../lib/textos';
import { pedirLosContactosDeEmergencia, guardarLosContactosDeEmergencia } from '../../lib/apiContactosDeEmergencia';
import {
  agregarPersona,
  agregarPersonaNueva,
  bajar,
  cuerpoDelPedido,
  deLaRespuesta,
  hayCambios,
  lugaresDe,
  quitar,
  sePuedeAgregar,
  subir,
  textoDelError,
} from '../../lib/contactosDeEmergencia';
import { AgregarContactoDeEmergenciaModal } from './AgregarContactoDeEmergenciaModal';

/* La pestaña «Contactos de emergencia» de la Ficha del Cliente.

   A quién se llama si al Paciente le pasa algo: hasta tres personas, en orden de prioridad. La
   lista se arma acá —agregar, subir, bajar, quitar— y se guarda entera de una vez. El lugar que
   cada persona ocupa en el Cliente y los rechazos del backend salen con los textos de la base, que
   llegan junto con la lista. */
export function ContactosDeEmergencia({ clienteId, puedeEditar }) {
  const { t, locale } = useLocale();
  const textos = t.clientes.contactos_de_emergencia;
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [guardada, setGuardada] = useState([]);
  const [lista, setLista] = useState([]);
  const [maximo, setMaximo] = useState(0);
  const [textosDeLaBase, setTextosDeLaBase] = useState({});
  const [agregando, setAgregando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorAlGuardar, setErrorAlGuardar] = useState(null);
  // Cada persona nueva lleva una clave propia mientras no se guarda, para separar su renglón.
  const siguienteClave = useRef(0);

  const aplicarRespuesta = useCallback((respuesta) => {
    const contactos = deLaRespuesta(respuesta?.contactos);
    setGuardada(contactos);
    setLista(contactos);
    setMaximo(respuesta?.maximo ?? 0);
    setTextosDeLaBase(respuesta?.textos ?? {});
  }, []);

  const cargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    setErrorAlGuardar(null);
    try {
      aplicarRespuesta(await pedirLosContactosDeEmergencia(clienteId, locale));
      setEstado('listo');
    } catch (err) {
      setError(mensajeDeError(err, t));
      setEstado('error');
    }
  }, [clienteId, locale, t, aplicarRespuesta]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  function agregar(persona) {
    setAgregando(false);
    setErrorAlGuardar(null);
    if (persona.nueva) {
      siguienteClave.current += 1;
      setLista((actual) => agregarPersonaNueva(actual, persona.nueva, `nueva-${siguienteClave.current}`, maximo));
      return;
    }
    setLista((actual) => agregarPersona(actual, persona, maximo));
  }

  function cambiarLista(cambio) {
    setErrorAlGuardar(null);
    setLista((actual) => cambio(actual));
  }

  async function guardar() {
    setGuardando(true);
    setErrorAlGuardar(null);
    try {
      aplicarRespuesta(await guardarLosContactosDeEmergencia(clienteId, locale, cuerpoDelPedido(lista)));
      avisar(textos.guardado);
    } catch (err) {
      setErrorAlGuardar(textoDelError(err, textosDeLaBase) ?? mensajeDeError(err, t));
    } finally {
      setGuardando(false);
    }
  }

  const cambiada = hayCambios(lista, guardada);

  return (
    <section className="panel-tarjeta tarjeta-desplazable">
      <div className="panel-tarjeta-titulo">
        <h2>{textos.titulo}</h2>
        {puedeEditar && estado === 'listo' && sePuedeAgregar(lista, maximo) && (
          <Button variant="secondary" onClick={() => setAgregando(true)} disabled={guardando}>
            {textos.agregar}
          </Button>
        )}
      </div>

      <EstadoLista
        estado={estado}
        error={error}
        recargar={cargar}
        vacio={lista.length === 0}
        mensajeVacio={textos.sin_contactos}
      >
        <table className="panel-tabla">
          <thead>
            <tr>
              <th>{textos.col_prioridad}</th>
              <th>{textos.col_nombre}</th>
              <th>{textos.col_lugar}</th>
              <th>{textos.col_telefonos}</th>
              {puedeEditar && <th></th>}
            </tr>
          </thead>
          <tbody>
            {lista.map((contacto, i) => (
              <tr key={contacto.clave}>
                <td>{i + 1}</td>
                <td><b>{contacto.nombre || '—'}</b></td>
                <td>{lugaresDe(contacto, textosDeLaBase).join(' · ') || '—'}</td>
                <td>{contacto.telefonos.join(' · ') || '—'}</td>
                {puedeEditar && (
                  <td>
                    <div className="molde-acciones">
                      <Button
                        variant="secondary"
                        onClick={() => cambiarLista((actual) => subir(actual, i))}
                        disabled={guardando || i === 0}
                        aria-label={con(t.comun.subir, { nombre: contacto.nombre })}
                      >
                        <span aria-hidden="true">↑</span>
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => cambiarLista((actual) => bajar(actual, i))}
                        disabled={guardando || i === lista.length - 1}
                        aria-label={con(t.comun.bajar, { nombre: contacto.nombre })}
                      >
                        <span aria-hidden="true">↓</span>
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => cambiarLista((actual) => quitar(actual, i))}
                        disabled={guardando}
                        aria-label={con(t.comun.campo_de_fila, { campo: textos.quitar, nombre: contacto.nombre })}
                      >
                        {textos.quitar}
                      </Button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </EstadoLista>

      {errorAlGuardar && <Alert variant="error">{errorAlGuardar}</Alert>}

      {puedeEditar && estado === 'listo' && cambiada && (
        <div className="molde-acciones">
          <Button variant="secondary" onClick={() => cambiarLista(() => guardada)} disabled={guardando}>
            {textos.descartar}
          </Button>
          <Button onClick={guardar} disabled={guardando}>
            {guardando ? t.comun.guardando : t.comun.guardar}
          </Button>
        </div>
      )}

      {agregando && (
        <AgregarContactoDeEmergenciaModal
          lista={lista}
          textosDeLaBase={textosDeLaBase}
          onAgregar={agregar}
          onClose={() => setAgregando(false)}
        />
      )}
    </section>
  );
}
