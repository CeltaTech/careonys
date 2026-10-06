import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { llamarApiIntermediacion } from '../../lib/apiIntermediacion';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';
import { Alert } from '../../components/ui/Alert';
import { mensajeDeError } from '../../lib/errores';
import '../../styles/molde-paginas.css';

/* Los plazos con los que cobra la Prestadora.
   ==========================================================================

   Con cuántos días se avisa un cobro que viene, cuántos días se conserva el acceso cuando un
   cobro no entra, y cuántos días vive el cupón de la red de cobranza. Los tres estaban escritos
   en el backend y son decisiones comerciales de cara al Cliente, así que los elige ella.

   Los números con los que arranca salen de la base, igual que el resto de su configuración: acá
   no hay ninguno escrito. Verlos es de la administración y cambiarlos es del Admin de la
   Prestadora, con el mismo candado que las formas de cobro. */
export function PlazosDelCobro({ soloLectura }) {
  const { t } = useLocale();
  const [plazos, setPlazos] = useState(null);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [guardados, setGuardados] = useState(false);

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    try {
      const { plazos: filas } = await llamarApiIntermediacion('/plazos-de-cobro');
      setPlazos(filas);
      setEstado('listo');
    } catch (err) {
      setError(mensajeDeError(err, t));
      setEstado('error');
    }
  }, [t]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  function cambiar(campo, valor) {
    setGuardados(false);
    setPlazos((anteriores) => ({ ...anteriores, [campo]: valor }));
  }

  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      const { plazos: guardadosEnLaBase } = await llamarApiIntermediacion('/plazos-de-cobro', {
        method: 'PATCH',
        body: JSON.stringify(plazos),
      });
      setPlazos(guardadosEnLaBase);
      setGuardados(true);
    } catch (err) {
      setError(mensajeDeError(err, t));
    }
    setGuardando(false);
  }

  return (
    <section className="panel-tarjeta">
      <div className="panel-tarjeta-titulo">
        <h2>{t.intermediacion.plazos_titulo}</h2>
      </div>

      {estado === 'cargando' && <p className="molde-vacio">{t.comun.cargando}</p>}

      {estado === 'error' && (
        <>
          <Alert variant="error">{error}</Alert>
          <div className="molde-acciones">
            <Button onClick={recargar}>{t.comun.reintentar}</Button>
          </div>
        </>
      )}

      {estado !== 'cargando' && estado !== 'error' && (
        <>
          {error && <Alert variant="error">{error}</Alert>}
          {guardados && <Alert variant="success">{t.intermediacion.plazos_guardados}</Alert>}

          <div className="molde-formgrid">
            <FormField
              label={t.intermediacion.plazo_aviso_antes_del_cobro}
              name="dias_de_aviso_antes_del_cobro"
              type="number"
              min="1"
              value={plazos?.dias_de_aviso_antes_del_cobro ?? ''}
              onChange={(e) => cambiar('dias_de_aviso_antes_del_cobro', e.target.value)}
              disabled={soloLectura}
            />

            <FormField
              label={t.intermediacion.plazo_gracia_por_cobro_rechazado}
              name="dias_de_gracia_por_cobro_rechazado"
              type="number"
              min="1"
              value={plazos?.dias_de_gracia_por_cobro_rechazado ?? ''}
              onChange={(e) => cambiar('dias_de_gracia_por_cobro_rechazado', e.target.value)}
              disabled={soloLectura}
            />

            <FormField
              label={t.intermediacion.plazo_vida_del_cupon}
              name="dias_de_vida_del_cupon"
              type="number"
              min="1"
              value={plazos?.dias_de_vida_del_cupon ?? ''}
              onChange={(e) => cambiar('dias_de_vida_del_cupon', e.target.value)}
              disabled={soloLectura}
            />
          </div>

          {!soloLectura && (
            <div className="molde-acciones">
              <Button onClick={guardar} disabled={guardando}>
                {t.comun.guardar}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
