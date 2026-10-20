import { Link } from 'react-router-dom';
import { useLocale } from '../../i18n/LocaleContext';
import { usePuestaEnMarchaAlDia } from '../../context/PuestaEnMarchaContext';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { PropuestaDesdePlanilla } from './PropuestaDesdePlanilla';
import '../../styles/molde-paginas.css';

/* La guía de puesta en marcha de una Prestadora nueva.
   ==========================================================================

   POR QUÉ EXISTE. Una Prestadora recién creada entraba al Panel y se encontraba una grilla de
   guardias vacía, sin ningún indicio de qué cargar primero.

   QUÉ HACE ESTE ARCHIVO Y QUÉ NO. Pinta, y nada más. Qué falta lo contesta
   `context/PuestaEnMarchaContext.jsx`: primero los tres pasos de la configuración inicial
   —datos, zonas y precios—, y recién con esos completos, los de la gente. La misma respuesta
   apaga los botones que cargan Asistentes o Clientes.

   Y LEE PLANILLAS. Lo que la Prestadora ya tiene escrito no se vuelve a tipear: la lectura de
   planilla del producto —la misma de la pantalla de importación— cuelga acá abajo, en
   `PropuestaDesdePlanilla`, y propone la configuración inicial a partir del archivo. No crea
   nada: quien confirma sigue siendo una persona, en la pantalla de importación.

   QUIÉN LA VE. Sólo Admin_prestadora o Superadmin. Un Superadmin mirando por un permiso de acceso
   ve exactamente lo mismo pero sin botones de acción — la guía es de la Prestadora que visita,
   no un trabajo para él. */

export function GuiaPrimerosPasos() {
  const { t } = useLocale();
  const { estado, veLaGuia, pasos, faltan, completos, informativo, recargar } = usePuestaEnMarchaAlDia();

  if (!veLaGuia) return null;

  if (estado === 'cargando') {
    return (
      <section className="panel-tarjeta">
        <p className="estado-cargando">{t.comun.cargando}</p>
      </section>
    );
  }

  if (estado === 'error') {
    return (
      <section className="panel-tarjeta">
        <Alert variant="error">
          {t.comun.error_generico}{' '}
          <Button variant="secondary" onClick={recargar}>
            {t.comun.reintentar}
          </Button>
        </Alert>
      </section>
    );
  }

  // Se apaga sola cuando ya está todo: sin botón de «descartar» a mano, porque no hay nada que
  // descartar una vez que no falta nada.
  if (completos || pasos.length === 0) return null;

  const completados = pasos.length - faltan.length;
  const porcentaje = Math.round((completados / pasos.length) * 100);

  return (
    <div className="molde-pila">
      <section className="panel-tarjeta">
        <div className="panel-tarjeta-titulo">
          <h2>{informativo ? t.guia_primeros_pasos.titulo_informativo : t.guia_primeros_pasos.titulo}</h2>
          <span className="panel-mini">
            {t.guia_primeros_pasos.completados.replace('{n}', completados).replace('{total}', pasos.length)}
          </span>
        </div>
        <div className="onboarding-checklist-barra">
          <div className="onboarding-checklist-barra-relleno" style={{ width: `${porcentaje}%` }} />
        </div>
        {pasos.map((paso) => {
          const textos = t.guia_primeros_pasos;
          return (
            <div key={paso.clave} className="panel-fila-alerta">
              <div>
                <b>{textos[`paso_${paso.clave}_titulo`]}</b>
                {/* La consecuencia sólo se muestra en lo que falta: al lado de un paso ya hecho
                    sería la advertencia de algo que no va a pasar. */}
                {!paso.hecho && (
                  <span className="panel-mini">{textos[`paso_${paso.clave}_consecuencia`]}</span>
                )}
              </div>
              {paso.hecho ? (
                <span className="badge badge-exito">{textos.paso_completado}</span>
              ) : (
                !informativo && (
                  <Link to={paso.ruta} className="btn btn-secondary">
                    {textos[`paso_${paso.clave}_cta`]}
                  </Link>
                )
              )}
            </div>
          );
        })}
      </section>
      {/* Sólo para quien puede completar los pasos: un Superadmin de visita mira, no trabaja. */}
      {!informativo && <PropuestaDesdePlanilla />}
    </div>
  );
}
