import { useState } from 'react';
import { useLocale } from '../i18n/LocaleContext';
import { Cabecera } from '../components/ui/Cabecera';
import { llamarApiPanel } from '../lib/apiPanel';
import { mensajeDeError } from '../lib/errores';
import { EstadoLista } from '../components/layout/EstadoLista';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { FormField } from '../components/ui/FormField';
import '../styles/molde-paginas.css';
import './habilitar-clave.css';

/* HABILITAR UN CAMBIO DE CLAVE.
   ==========================================================================

   Alguien llama porque no puede entrar. Acá se le abre una puerta que dura poco y sirve una vez:
   la clave la elige esa persona, sola, en su pantalla. Desde acá no se elige ninguna clave y no se
   ve ninguna.

   SE HABILITA HACIA ABAJO Y NUNCA A UNO MISMO. La lista ya llega filtrada por el backend, así que lo
   que se ve es lo que se puede hacer.

   NO SE MUESTRA NINGÚN NÚMERO DE TELÉFONO. Lo que hay es la foto de la ficha y el correo, que es
   con lo que se reconoce a quien llama. */
export function HabilitarClave() {
  const { t } = useLocale();
  const [texto, setTexto] = useState('');
  const [estado, setEstado] = useState('inicial');
  const [error, setError] = useState(null);
  const [cuentas, setCuentas] = useState([]);
  const [minutos, setMinutos] = useState(null);
  const [trabajando, setTrabajando] = useState(null);
  const [mensaje, setMensaje] = useState(null);

  async function buscar(evento) {
    evento.preventDefault();
    setError(null);
    setMensaje(null);
    setEstado('cargando');
    try {
      const respuesta = await llamarApiPanel('/habilitar-clave/buscar', {
        method: 'POST',
        body: JSON.stringify({ texto }),
      });
      setCuentas(respuesta.cuentas ?? []);
      setMinutos(respuesta.minutos ?? null);
      setEstado('listo');
    } catch (err) {
      setError(mensajeDeError(err, t, 'HabilitarClave'));
      setEstado('error');
    }
  }

  async function habilitar(cuenta) {
    setError(null);
    setMensaje(null);
    setTrabajando(`habilitar:${cuenta.id}`);
    try {
      const respuesta = await llamarApiPanel('/habilitar-clave', {
        method: 'POST',
        body: JSON.stringify({ usuarioId: cuenta.id }),
      });
      const minutosHabilitados = respuesta.minutos ?? minutos ?? '';
      setMensaje(
        (Number(minutosHabilitados) === 1 ? t.habilitar_clave.habilitado_uno : t.habilitar_clave.habilitado)
          .replace('{{nombre}}', cuenta.nombre)
          .replace('{{minutos}}', String(minutosHabilitados)),
      );
    } catch (err) {
      setError(mensajeDeError(err, t, 'HabilitarClave'));
    } finally {
      setTrabajando(null);
    }
  }

  return (
    <div>
      <Cabecera titulo={t.habilitar_clave.titulo} />

      <div className="molde-pila">
        <section className="panel-tarjeta">
          <div className="panel-tarjeta-titulo">
            <h2>{t.habilitar_clave.buscar_boton}</h2>
            {estado === 'listo' && <span className="panel-mini">{cuentas.length}</span>}
          </div>
          <form onSubmit={buscar}>
            <div className="molde-formgrid">
              <FormField
                label={t.habilitar_clave.buscar}
                name="texto"
                required
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
              />
            </div>
            <div className="molde-acciones">
              <Button type="submit" disabled={estado === 'cargando' || texto.trim().length < 3}>
                {estado === 'cargando' ? t.comun.cargando : t.habilitar_clave.buscar_boton}
              </Button>
            </div>
          </form>

          {error && <Alert variant="error">{error}</Alert>}
          {mensaje && <Alert variant="success">{mensaje}</Alert>}

          {estado !== 'inicial' && (
            <EstadoLista
              estado={estado === 'inicial' ? 'listo' : estado}
              error={error}
              recargar={() => setEstado('inicial')}
              vacio={cuentas.length === 0}
              filtrado
              onLimpiarFiltros={() => {
                setTexto('');
                setCuentas([]);
                setEstado('inicial');
              }}
            >
              <table className="panel-tabla">
                <thead>
                  <tr>
                    <th>{t.habilitar_clave.columna_persona}</th>
                    <th>{t.habilitar_clave.columna_telefono}</th>
                    <th>{t.habilitar_clave.columna_acciones}</th>
                  </tr>
                </thead>
                <tbody>
                  {cuentas.map((cuenta) => (
                    <tr key={cuenta.id}>
                      <td>
                        <div className="habilitar-clave-persona">
                          {cuenta.foto && <img src={cuenta.foto} alt="" width="40" height="40" />}
                          <div>
                            <b>{cuenta.nombre}</b>
                            <div className="panel-mini">{cuenta.email}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        {!cuenta.telefonoCargado ? (
                          <span className="badge badge-neutro">{t.cuenta_segura.sin_telefono}</span>
                        ) : cuenta.telefonoVerificado ? (
                          <span className="badge badge-exito">{t.cuenta_segura.telefono_verificado}</span>
                        ) : (
                          <span className="badge badge-atencion">{t.cuenta_segura.telefono_sin_verificar}</span>
                        )}
                      </td>
                      <td>
                        <div className="habilitar-clave-acciones">
                          <Button
                            onClick={() => habilitar(cuenta)}
                            disabled={trabajando !== null}
                          >
                            {trabajando === `habilitar:${cuenta.id}`
                              ? t.comun.guardando
                              : t.habilitar_clave.habilitar}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </EstadoLista>
          )}
        </section>
      </div>
    </div>
  );
}
