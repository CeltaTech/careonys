import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '../i18n/LocaleContext';
import { useAuth } from '../context/AuthContext';
import { esAdminOSuperior } from '../lib/roles';
import { supabase } from '../lib/supabaseClient';
import { EstadoLista } from '../components/layout/EstadoLista';
import { HiloComunicacion } from '../components/comunicacion/HiloComunicacion';

export function Comunicacion() {
  const { t } = useLocale();
  const { usuario } = useAuth();
  const esAdmin = esAdminOSuperior(usuario?.rol);
  const [asistentes, setAsistentes] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [seleccionado, setSeleccionado] = useState(null);

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);

    const [{ data: asistentesData, error: errorAsistentes }, { data: mensajesData }] = await Promise.all([
      supabase.from(esAdmin ? 'asistentes' : 'asistentes_coordinador').select('id, nombre'),
      supabase.from('mensajes_asistente').select('asistente_id, mensaje, created_at').order('created_at', { ascending: false }),
    ]);

    if (errorAsistentes) {
      setError(errorAsistentes.message);
      setEstado('error');
      return;
    }

    const ultimoPorAsistente = new Map();
    for (const m of mensajesData ?? []) {
      if (!ultimoPorAsistente.has(m.asistente_id)) {
        ultimoPorAsistente.set(m.asistente_id, m);
      }
    }

    const conUltimoMensaje = (asistentesData ?? []).map((a) => ({
      ...a,
      ultimo_mensaje: ultimoPorAsistente.get(a.id) ?? null,
    }));

    conUltimoMensaje.sort((a, b) => {
      const fechaA = a.ultimo_mensaje?.created_at;
      const fechaB = b.ultimo_mensaje?.created_at;
      if (!fechaA && !fechaB) return a.nombre.localeCompare(b.nombre);
      if (!fechaA) return 1;
      if (!fechaB) return -1;
      return new Date(fechaB) - new Date(fechaA);
    });

    setAsistentes(conUltimoMensaje);
    setEstado('listo');
  }, [esAdmin]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  return (
    <div>
      <h1>{t.comunicacion.titulo}</h1>

      <div className="panel-comunicacion-layout">
        <div className="panel-comunicacion-lista-wrap">
          <EstadoLista
            estado={estado}
            error={error}
            vacio={estado === 'listo' && asistentes.length === 0}
            recargar={recargar}
            mensajeVacio={t.comunicacion.sin_asistentes}
          >
            <div className="panel-comunicacion-lista">
              {asistentes.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className={`panel-comunicacion-item ${seleccionado === a.id ? 'panel-comunicacion-item-activo' : ''}`}
                  onClick={() => setSeleccionado(a.id)}
                >
                  <div className="panel-comunicacion-item-nombre">{a.nombre}</div>
                  <div className="panel-comunicacion-item-preview">
                    {a.ultimo_mensaje ? a.ultimo_mensaje.mensaje : t.comunicacion.sin_mensaje_previo}
                  </div>
                </button>
              ))}
            </div>
          </EstadoLista>
        </div>

        <div className="panel-comunicacion-hilo">
          {seleccionado ? (
            <HiloComunicacion asistenteId={seleccionado} mostrarEncabezado={false} onEnviado={recargar} />
          ) : (
            <p className="estado-vacio">{t.comunicacion.seleccionar_asistente}</p>
          )}
        </div>
      </div>
    </div>
  );
}
