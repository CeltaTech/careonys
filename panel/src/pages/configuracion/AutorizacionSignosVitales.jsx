import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { llamarApiConfiguracion as llamarApi } from '../../lib/apiConfiguracion';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { TextoConMarcadores } from '../../components/ui/TextoConMarcadores';
import { EstadoLista } from '../../components/layout/EstadoLista';
import { mensajeDeError } from '../../lib/errores';
import { useModalAccesible } from '../../hooks/useModalAccesible';

/* El texto de la autorización para que un Asistente le tome los signos vitales al Paciente. Se
   edita en el idioma en que está abierto el Panel. Mientras la Prestadora no lo cambie rige el
   predeterminado de su país, y guardar el predeterminado tal cual es volver a él: la base borra el
   propio y el texto vuelve a seguir al de fábrica. */
export function AutorizacionSignosVitales({ onClose }) {
  const { t, locale } = useLocale();
  const modal = useModalAccesible(onClose);
  const [datos, setDatos] = useState(null);
  const [cuerpo, setCuerpo] = useState('');
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    try {
      const respuesta = await llamarApi('/autorizacion-signos-vitales');
      setDatos(respuesta);
      setCuerpo(respuesta.textos?.[locale]?.cuerpo ?? '');
      setEstado('listo');
    } catch (err) {
      setError(mensajeDeError(err, t));
      setEstado('error');
    }
  }, [locale, t]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  const texto = datos?.textos?.[locale];
  const etiquetas = useMemo(
    () => ({ prestadora: datos?.prestadora ?? '', paciente: t.vitales_autorizacion.paciente }),
    [datos?.prestadora, t],
  );

  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      await llamarApi('/autorizacion-signos-vitales', {
        method: 'PUT',
        body: JSON.stringify({ cuerpo: cuerpo === texto.predeterminado ? '' : cuerpo, idioma: locale }),
      });
      onClose();
    } catch (err) {
      setError(mensajeDeError(err, t));
      setGuardando(false);
    }
  }

  return (
    <div className="panel-modal-fondo" onClick={onClose}>
      <div className="panel-modal panel-modal-ancho" onClick={(e) => e.stopPropagation()} {...modal.props}>
        <h2 id={modal.idTitulo}>{t.vitales_autorizacion.titulo_texto}</h2>
        {estado === 'listo' && error && <Alert variant="error">{error}</Alert>}
        <EstadoLista estado={estado} error={error} vacio={estado === 'listo' && !texto} recargar={recargar}>
          {texto && (
            <>
              <TextoConMarcadores
                value={cuerpo}
                onChange={setCuerpo}
                etiquetas={etiquetas}
                aria-label={t.vitales_autorizacion.titulo_texto}
              />
              <div className="panel-modal-acciones">
                {cuerpo !== texto.predeterminado && (
                  <div className="panel-modal-acciones-aparte">
                    <Button variant="secondary" onClick={() => setCuerpo(texto.predeterminado)} disabled={guardando}>
                      {t.comun.restablecer_predeterminado}
                    </Button>
                  </div>
                )}
                <Button variant="secondary" onClick={onClose} disabled={guardando}>{t.comun.cancelar}</Button>
                <Button onClick={guardar} disabled={guardando || !cuerpo.trim()}>
                  {guardando ? t.comun.guardando : t.comun.guardar}
                </Button>
              </div>
            </>
          )}
        </EstadoLista>
      </div>
    </div>
  );
}
