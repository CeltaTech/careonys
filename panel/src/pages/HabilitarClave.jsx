import { useState } from 'react';
import { useLocale } from '../i18n/LocaleContext';
import { useTelefonosEsperando } from '../context/TelefonosEsperandoContext';
import { llamarApiPanel } from '../lib/apiPanel';
import { mensajeDeError } from '../lib/errores';
import { EstadoLista } from '../components/layout/EstadoLista';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { FormField } from '../components/ui/FormField';

/* HABILITAR UN CAMBIO DE CLAVE.
   ==========================================================================

   Alguien llama porque no puede entrar. Acá se le abre una puerta que dura poco y sirve una vez:
   la clave la elige esa persona, sola, en su pantalla. Desde acá no se elige ninguna clave y no se
   ve ninguna.

   SE HABILITA HACIA ABAJO Y NUNCA A UNO MISMO. La lista ya llega filtrada por el motor, así que lo
   que se ve es lo que se puede hacer.

   NO SE MUESTRA NINGÚN NÚMERO DE TELÉFONO. Lo que hay es la foto de la ficha y el correo, que es
   con lo que se reconoce a quien llama.

   ARRIBA, LO QUE ESTÁ ESPERANDO. Quien cambió su número queda a la espera, y esa espera aparece
   sola acá: no hace falta ir a buscar a la persona a mano. Se la llama, se verifica que el cambio
   es real, y recién ahí se habilita. La lista llega filtrada por el motor, igual que la búsqueda:
   lo que se ve es lo que se puede hacer. */
export function HabilitarClave() {
  const { t } = useLocale();
  const {
    cuentas: esperando,
    estado: estadoEsperando,
    error: errorEsperando,
    recargar: recargarEsperando,
  } = useTelefonosEsperando();
  const [texto, setTexto] = useState('');
  const [estado, setEstado] = useState('inicial');
  const [error, setError] = useState(null);
  const [cuentas, setCuentas] = useState([]);
  const [minutos, setMinutos] = useState(null);
  const [trabajando, setTrabajando] = useState(null);
  const [aviso, setAviso] = useState(null);

  async function buscar(evento) {
    evento.preventDefault();
    setError(null);
    setAviso(null);
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
    setAviso(null);
    setTrabajando(`habilitar:${cuenta.id}`);
    try {
      const respuesta = await llamarApiPanel('/habilitar-clave', {
        method: 'POST',
        body: JSON.stringify({ usuarioId: cuenta.id }),
      });
      setAviso(
        t.habilitar_clave.habilitado
          .replace('{{nombre}}', cuenta.nombre)
          .replace('{{minutos}}', String(respuesta.minutos ?? minutos ?? '')),
      );
    } catch (err) {
      setError(mensajeDeError(err, t, 'HabilitarClave'));
    } finally {
      setTrabajando(null);
    }
  }

  async function confirmarTelefono(cuenta) {
    setError(null);
    setAviso(null);
    setTrabajando(`telefono:${cuenta.id}`);
    try {
      await llamarApiPanel('/habilitar-clave/telefono', {
        method: 'POST',
        body: JSON.stringify({ usuarioId: cuenta.id }),
      });
      setAviso(t.habilitar_clave.telefono_confirmado.replace('{{nombre}}', cuenta.nombre));
      // Uno menos esperando. El motor ya avisó por el canal, y esto es para quien lo hizo: su
      // pantalla no espera a que le llegue la vuelta.
      await recargarEsperando();
    } catch (err) {
      setError(mensajeDeError(err, t, 'HabilitarClave'));
    } finally {
      setTrabajando(null);
    }
  }

  return (
    <div>
      <h1>{t.habilitar_clave.titulo}</h1>

      <section>
        <h2>{t.habilitar_clave.pendientes_titulo}</h2>
        <EstadoLista
          estado={estadoEsperando}
          error={errorEsperando}
          recargar={recargarEsperando}
          vacio={esperando.length === 0}
          mensajeVacio={t.habilitar_clave.pendientes_vacio}
          ayudaVacio={t.habilitar_clave.pendientes_vacio_ayuda}
        >
          <table className="panel-tabla">
            <thead>
              <tr>
                <th>{t.habilitar_clave.columna_persona}</th>
                <th>{t.habilitar_clave.columna_acciones}</th>
              </tr>
            </thead>
            <tbody>
              {esperando.map((cuenta) => (
                <tr key={cuenta.id}>
                  <td>
                    <strong>{cuenta.nombre}</strong>
                    <br />
                    {cuenta.email}
                  </td>
                  <td>
                    <Button
                      onClick={() => confirmarTelefono(cuenta)}
                      disabled={trabajando !== null}
                    >
                      {trabajando === `telefono:${cuenta.id}`
                        ? t.comun.guardando
                        : t.habilitar_clave.confirmar_telefono}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </EstadoLista>
      </section>

      <form onSubmit={buscar} className="panel-filtros">
        <FormField
          label={t.habilitar_clave.buscar}
          name="texto"
          required
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        <Button type="submit" disabled={estado === 'cargando' || texto.trim().length < 3}>
          {estado === 'cargando' ? t.comun.cargando : t.habilitar_clave.buscar_boton}
        </Button>
      </form>

      {error && <Alert variant="error">{error}</Alert>}
      {aviso && <Alert variant="success">{aviso}</Alert>}

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
                    {cuenta.foto && <img src={cuenta.foto} alt="" width="40" height="40" />}
                    <strong>{cuenta.nombre}</strong>
                    <br />
                    {cuenta.email}
                  </td>
                  <td>
                    {!cuenta.telefonoCargado
                      ? t.cuenta_segura.sin_telefono
                      : cuenta.telefonoVerificado
                        ? t.cuenta_segura.telefono_verificado
                        : t.cuenta_segura.telefono_sin_verificar}
                  </td>
                  <td>
                    <Button
                      onClick={() => habilitar(cuenta)}
                      disabled={trabajando !== null}
                    >
                      {trabajando === `habilitar:${cuenta.id}`
                        ? t.comun.guardando
                        : t.habilitar_clave.habilitar}
                    </Button>
                    {cuenta.telefonoCargado && !cuenta.telefonoVerificado && (
                      <Button
                        variant="secondary"
                        onClick={() => confirmarTelefono(cuenta)}
                        disabled={trabajando !== null}
                      >
                        {trabajando === `telefono:${cuenta.id}`
                          ? t.comun.guardando
                          : t.habilitar_clave.confirmar_telefono}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </EstadoLista>
      )}
    </div>
  );
}
