import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { EstadoLista } from '../../components/layout/EstadoLista';
import { Cabecera } from '../../components/ui/Cabecera';
import { mensajeDeError } from '../../lib/errores';
import { llamarApiDeMatch } from './llamarApiDeMatch';
import '../../styles/molde-paginas.css';

// Qué advertencia legal se mostró al encender cada función de riesgo de Match, cuándo y a quién.
// Es un informe de la administración: vive en la sección Informes y lo ve sólo el Administrador.
// El encendido de las funciones está en `FuncionesConRiesgoLegal.jsx`, dentro de Configuración.
export function IntermediacionAuditoriaLegal() {
  const { t, locale } = useLocale();
  const [eventos, setEventos] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    try {
      const { auditoria: filas } = await llamarApiDeMatch('/auditoria-legal');
      setEventos(filas);
      setEstado('listo');
    } catch (err) {
      setError(mensajeDeError(err, t));
      setEstado('error');
    }
  }, [t]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  return (
    <div>
      <Cabecera titulo={t.intermediacion.auditoria_legal_titulo} />

      <section className="panel-tarjeta">
        <EstadoLista estado={estado} error={error} vacio={estado === 'listo' && eventos.length === 0} recargar={recargar}>
          <table className="panel-tabla">
            <thead>
              <tr>
                <th>{t.intermediacion.col_fecha}</th>
                <th>{t.intermediacion.col_usuario}</th>
                <th>{t.intermediacion.col_funcion}</th>
                <th>{t.intermediacion.col_texto_mostrado}</th>
              </tr>
            </thead>
            <tbody>
              {eventos.map((e) => (
                <tr key={e.id}>
                  <td className="panel-mini">{new Date(e.created_at).toLocaleString(locale)}</td>
                  <td><b>{e.usuarios?.nombre || '—'}</b></td>
                  <td>{t.intermediacion[`funcion_${e.funcion_clave}`] || e.funcion_clave}</td>
                  <td>{e.texto_mostrado}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </EstadoLista>
      </section>
    </div>
  );
}
