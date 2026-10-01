import { useLocale } from '../../i18n/LocaleContext';
import { HiloComunicacion } from '../../components/comunicacion/HiloComunicacion';

export function ComunicacionTab({ asistente }) {
  const { t } = useLocale();
  return (
    <section className="panel-tarjeta">
      <div className="panel-tarjeta-titulo">
        <h2>{t.asistentes.comunicacion.titulo}</h2>
      </div>
      <HiloComunicacion asistenteId={asistente.id} mostrarEncabezado={false} />
    </section>
  );
}
