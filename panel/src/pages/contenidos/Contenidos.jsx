import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { useAuth } from '../../context/AuthContext';
import { usePermisos } from '../../context/PermisosContext';
import { esAdminOSuperior } from '../../lib/roles';
import { claseBadge } from '../../lib/tonos';
import { llamarApiContenidos } from '../../lib/apiContenidos';
import { DESTINATARIOS_DE_CONTENIDOS } from '../../lib/destinatariosDeContenidos';
import { EstadoLista } from '../../components/layout/EstadoLista';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { Cabecera } from '../../components/ui/Cabecera';
import { mensajeDeError } from '../../lib/errores';
import { ContenidoDetalle } from './ContenidoDetalle';
import '../../styles/molde-paginas.css';
import '../hojaDeTarjetas.css';

/* Contenidos.
   ==========================================================================

   La biblioteca que la Prestadora escribe para su gente: un título, un texto y, si ya publica
   material en otro lado, un enlace. Cada pieza dice para quién es —Clientes, Asistentes, personal—
   y la ven sólo ellos, y sólo publicada. CeltaTech no escribe nada de esto ni trae nada de
   fábrica, así que una Prestadora nueva arranca con la lista vacía.

   Quién la escribe lo decide cada Prestadora en Configuración › Accesos (`publicar_contenidos`).
   Quien puede ve todo, borradores incluidos; el resto del Panel ve sólo lo publicado para el
   personal. Las dos cosas las decide la base, no esta pantalla. */
export function Contenidos() {
  const { t } = useLocale();
  const { usuario } = useAuth();
  const { puede } = usePermisos();
  const [contenidos, setContenidos] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [seleccionado, setSeleccionado] = useState(null);
  const [creandoNuevo, setCreandoNuevo] = useState(false);

  const puedeEscribir = esAdminOSuperior(usuario?.rol) || puede('publicar_contenidos');

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    try {
      const { contenidos: filas } = await llamarApiContenidos('/');
      setContenidos(filas || []);
      setEstado('listo');
    } catch (err) {
      setError(mensajeDeError(err, t));
      setEstado('error');
    }
  }, [t]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  // En el orden de la lista, que es el mismo en que el backend los guarda.
  const nombrarDestinatarios = (destinatarios) =>
    DESTINATARIOS_DE_CONTENIDOS.filter((d) => destinatarios?.includes(d))
      .map((d) => t.contenidos[`destinatario_${d}`])
      .join(', ') || '—';

  return (
    <div>
      <Cabecera titulo={t.contenidos.titulo}>
        {puedeEscribir && <Button onClick={() => setCreandoNuevo(true)}>{t.contenidos.nuevo}</Button>}
      </Cabecera>
      {estado === 'error' && error && <Alert variant="error">{error}</Alert>}

      <section className="panel-tarjeta hoja-desplazable">
        <div className="panel-tarjeta-titulo">
          <h2>{t.contenidos.titulo}</h2>
          {estado === 'listo' && <span className="panel-mini">{contenidos.length}</span>}
        </div>
        <EstadoLista
          estado={estado}
          error={error}
          vacio={estado === 'listo' && contenidos.length === 0}
          recargar={recargar}
        >
          <table className="panel-tabla">
            <thead>
              <tr>
                <th>{t.contenidos.col_orden}</th>
                <th>{t.contenidos.col_titulo}</th>
                <th>{t.contenidos.col_destinatarios}</th>
                <th>{t.contenidos.col_enlace}</th>
                <th>{t.contenidos.col_publicado}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {contenidos.map((contenido) => (
                <tr key={contenido.id}>
                  <td>{contenido.orden}</td>
                  <td>
                    <b>{contenido.titulo}</b>
                  </td>
                  <td>{nombrarDestinatarios(contenido.destinatarios)}</td>
                  <td>{contenido.enlace_url ? t.comun.si : '—'}</td>
                  <td>
                    <span className={claseBadge(contenido.publicado ? 'activo' : 'inactivo')}>
                      {contenido.publicado ? t.contenidos.publicado_si : t.contenidos.publicado_no}
                    </span>
                  </td>
                  <td>
                    <button type="button" className="panel-enlace" onClick={() => setSeleccionado(contenido)}>
                      {puedeEscribir ? t.comun.editar : t.comun.ver_detalle}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </EstadoLista>
      </section>

      {(seleccionado || creandoNuevo) && (
        <ContenidoDetalle
          contenido={seleccionado}
          soloLectura={!puedeEscribir}
          onClose={() => {
            setSeleccionado(null);
            setCreandoNuevo(false);
          }}
          onGuardado={() => {
            setSeleccionado(null);
            setCreandoNuevo(false);
            recargar();
          }}
        />
      )}
    </div>
  );
}
