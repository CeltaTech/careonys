import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { llamarApiSoporteTecnico as llamarApi } from '../../lib/apiSoporteTecnico';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';
import { Alert } from '../../components/ui/Alert';
import { EstadoLista } from '../../components/layout/EstadoLista';
import { mensajeDeError } from '../../lib/errores';

/* Pedir soporte técnico y leer las respuestas.
   ==========================================================================

   QUÉ SE HACE ACÁ. Se describe el problema, se manda, y después se lee lo que contestaron. Se
   puede agregar algo más a una solicitud abierta, y cerrarla cuando el asunto terminó.

   QUÉ NO SE VE ACÁ. Nada de cómo se atiende del otro lado: ni quién atiende, ni cuándo, ni nada
   de otra Prestadora. Lo que se ve son las solicitudes propias y sus respuestas.

   POR QUÉ LOS TRES ESTADOS ESTÁN EN EL CATÁLOGO DE TEXTO y no escritos acá: lo que guarda la base
   es `abierta`, `en_curso` y `cerrada`, y lo que se lee en pantalla sale de las traducciones, en
   los tres idiomas. */
export function SoporteTecnico() {
  const { t, locale } = useLocale();
  const [solicitudes, setSolicitudes] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);

  const [asunto, setAsunto] = useState('');
  const [problema, setProblema] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  const [abierta, setAbierta] = useState(null);
  const [mensajes, setMensajes] = useState([]);
  const [texto, setTexto] = useState('');
  const [agregando, setAgregando] = useState(false);
  const [cerrando, setCerrando] = useState(false);

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    try {
      const datos = await llamarApi('/');
      setSolicitudes(datos.solicitudes ?? []);
      setEstado('listo');
    } catch (err) {
      setError(mensajeDeError(err, t, 'soporte técnico'));
      setEstado('error');
    }
  }, [t]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  async function abrirElHilo(id) {
    setError(null);
    setTexto('');
    try {
      const datos = await llamarApi(`/${id}`);
      setAbierta(datos.solicitud);
      setMensajes(datos.mensajes ?? []);
    } catch (err) {
      setError(mensajeDeError(err, t, 'soporte técnico'));
    }
  }

  async function pedir() {
    setEnviando(true);
    setError(null);
    setEnviado(false);
    try {
      const datos = await llamarApi('/', {
        method: 'POST',
        body: JSON.stringify({ asunto, problema }),
      });
      setAsunto('');
      setProblema('');
      setEnviado(true);
      await recargar();
      if (datos.solicitud?.id) await abrirElHilo(datos.solicitud.id);
    } catch (err) {
      setError(mensajeDeError(err, t, 'soporte técnico'));
    } finally {
      setEnviando(false);
    }
  }

  async function agregar() {
    setAgregando(true);
    setError(null);
    try {
      await llamarApi(`/${abierta.id}/mensajes`, {
        method: 'POST',
        body: JSON.stringify({ texto }),
      });
      setTexto('');
      await abrirElHilo(abierta.id);
      await recargar();
    } catch (err) {
      setError(mensajeDeError(err, t, 'soporte técnico'));
    } finally {
      setAgregando(false);
    }
  }

  async function cerrar() {
    setCerrando(true);
    setError(null);
    try {
      await llamarApi(`/${abierta.id}/cerrar`, { method: 'POST' });
      await abrirElHilo(abierta.id);
      await recargar();
    } catch (err) {
      setError(mensajeDeError(err, t, 'soporte técnico'));
    } finally {
      setCerrando(false);
    }
  }

  return (
    <div>
      <h2>{t.soporte.titulo}</h2>
      {error && <Alert variant="error">{error}</Alert>}
      {enviado && <Alert variant="info">{t.soporte.enviado}</Alert>}

      <h3>{t.soporte.pedir_titulo}</h3>
      <FormField
        label={t.soporte.campo_asunto}
        name="asunto"
        required
        value={asunto}
        onChange={(e) => {
          setAsunto(e.target.value);
          setEnviado(false);
        }}
      />
      <FormField
        label={t.soporte.campo_problema}
        name="problema"
        type="textarea"
        rows={6}
        required
        value={problema}
        onChange={(e) => {
          setProblema(e.target.value);
          setEnviado(false);
        }}
      />
      <Button onClick={pedir} disabled={enviando || !asunto.trim() || !problema.trim()}>
        {enviando ? t.soporte.enviando : t.soporte.enviar}
      </Button>

      <h3>{t.soporte.lista_titulo}</h3>
      <EstadoLista
        estado={estado}
        error={error}
        vacio={estado === 'listo' && solicitudes.length === 0}
        mensajeVacio={t.soporte.sin_solicitudes}
        recargar={recargar}
      >
        <table className="panel-tabla">
          <thead>
            <tr>
              <th>{t.soporte.col_fecha}</th>
              <th>{t.soporte.col_asunto}</th>
              <th>{t.soporte.col_estado}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {solicitudes.map((s) => (
              <tr key={s.id}>
                <td>{new Date(s.created_at).toLocaleDateString(locale)}</td>
                <td>{s.asunto}</td>
                <td>{t.soporte[`estado_${s.estado}`]}</td>
                <td>
                  <Button variant="secondary" onClick={() => abrirElHilo(s.id)}>
                    {t.soporte.ver}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </EstadoLista>

      {abierta && (
        <section>
          <h3>{abierta.asunto}</h3>
          <p>{abierta.problema}</p>

          {mensajes.length > 0 && (
            <ul>
              {mensajes.map((m) => (
                <li key={m.id}>
                  <strong>
                    {m.autor === 'soporte' ? t.soporte.autor_soporte : t.soporte.autor_prestadora}
                  </strong>{' '}
                  <span>{new Date(m.created_at).toLocaleDateString(locale)}</span>
                  <p>{m.texto}</p>
                </li>
              ))}
            </ul>
          )}

          {abierta.estado !== 'cerrada' && (
            <>
              <FormField
                label={t.soporte.campo_agregar}
                name="texto"
                type="textarea"
                rows={4}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
              />
              <Button onClick={agregar} disabled={agregando || !texto.trim()}>
                {agregando ? t.soporte.agregando : t.soporte.agregar}
              </Button>
              <Button variant="secondary" onClick={cerrar} disabled={cerrando}>
                {cerrando ? t.soporte.cerrando : t.soporte.cerrar}
              </Button>
            </>
          )}
        </section>
      )}
    </div>
  );
}
