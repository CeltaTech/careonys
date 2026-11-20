import { useEffect, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { useModalAccesible } from '../../hooks/useModalAccesible';
import { CasillerosDeHorario } from '../../components/turnos_guardia/CasillerosDeHorario';
import { datosDelRecurrente, editarTurnoGuardiaRecurrente } from '../../lib/coberturaDelServicio';
import { hoyISO } from '../../lib/horarios';
import { mensajeDeError } from '../../lib/errores';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';

/* Cambiar los días y el horario de un turno de guardia recurrente desde una fecha.
   ==========================================================================

   No se cancela el recurrente: la base lo cierra el día antes de la fecha elegida y abre uno
   nuevo con los días y el horario nuevos. Los turnos de guardia que ya pasaron y los que ya tienen
   Asistente no se tocan; los que vienen y no tienen Asistente se arman de nuevo. */
const hora = (valor) => (valor ? String(valor).slice(0, 5) : '');

export function EditarRecurrenteModal({ serieId, onClose, onHecho }) {
  const modal = useModalAccesible(onClose);
  const { t } = useLocale();
  const textos = t.servicios.cobertura;

  const [estado, setEstado] = useState('cargando');
  const [errorCarga, setErrorCarga] = useState(null);
  const [desde, setDesde] = useState(hoyISO());
  const [diasSemana, setDiasSemana] = useState([]);
  const [horaInicio, setHoraInicio] = useState('');
  const [horaFin, setHoraFin] = useState('');
  const [diasHastaElFin, setDiasHastaElFin] = useState('0');
  const [intentado, setIntentado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let vigente = true;
    setEstado('cargando');
    datosDelRecurrente(serieId)
      .then((serie) => {
        if (!vigente) return;
        if (!serie || serie.estado !== 'activa') {
          setEstado('vacio');
          return;
        }
        setDiasSemana(serie.dias_semana ?? []);
        setHoraInicio(hora(serie.hora_inicio));
        setHoraFin(hora(serie.hora_fin));
        setDiasHastaElFin(String(serie.dias_hasta_el_fin ?? 0));
        if (serie.vigente_desde && serie.vigente_desde > hoyISO()) setDesde(serie.vigente_desde);
        setEstado('listo');
      })
      .catch((falla) => {
        if (!vigente) return;
        setErrorCarga(falla);
        setEstado('error');
      });
    return () => {
      vigente = false;
    };
  }, [serieId]);

  function alternarDia(dia) {
    setDiasSemana((actuales) => (actuales.includes(dia) ? actuales.filter((d) => d !== dia) : [...actuales, dia]));
  }

  const dias = String(diasHastaElFin).trim();
  const faltan = {
    desde: !desde,
    dias_semana: diasSemana.length === 0,
    hora_inicio: !horaInicio,
    hora_fin: !horaFin,
    dias_hasta_el_fin: !/^\d+$/.test(dias),
  };
  const orden = [
    ['desde', 'field-recurrente_desde'],
    ['dias_semana', 'field-recurrente_dias_semana'],
    ['hora_inicio', 'field-recurrente_hora_inicio'],
    ['dias_hasta_el_fin', 'field-recurrente_dias_hasta_el_fin'],
    ['hora_fin', 'field-recurrente_hora_fin'],
  ];
  const errores = intentado
    ? Object.fromEntries(Object.entries(faltan).filter(([, falta]) => falta).map(([k]) => [k, t.formularios.falta_un_dato_obligatorio]))
    : {};

  async function handleSubmit(e) {
    e.preventDefault();
    setIntentado(true);
    const primero = orden.find(([k]) => faltan[k]);
    if (primero) {
      document.getElementById(primero[1])?.focus();
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await editarTurnoGuardiaRecurrente({
        serieId,
        desde,
        diasSemana,
        horaInicio,
        horaFin,
        diasHastaElFin: Number(dias),
      });
    } catch (falla) {
      setGuardando(false);
      setError(mensajeDeError(falla, t));
      return;
    }
    setGuardando(false);
    onHecho();
  }

  return (
    <div className="panel-modal-fondo" onClick={onClose}>
      <div className="panel-modal" onClick={(e) => e.stopPropagation()} {...modal.props}>
        <h2 id={modal.idTitulo}>{textos.editar_recurrente_titulo}</h2>

        {estado === 'cargando' && <p>{t.comun.cargando}</p>}
        {estado === 'error' && <Alert variant="error">{mensajeDeError(errorCarga, t)}</Alert>}
        {estado === 'vacio' && <Alert variant="warning">{t.errores.motivos.turno_guardia_recurrente_inexistente}</Alert>}
        {error && <Alert variant="error">{error}</Alert>}

        {estado === 'listo' && (
          <form onSubmit={handleSubmit} noValidate>
            <FormField
              label={textos.editar_recurrente_desde}
              name="recurrente_desde"
              type="date"
              required
              min={hoyISO()}
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              disabled={guardando}
              error={errores.desde}
            />
            <CasillerosDeHorario
              prefijo="recurrente_"
              diasSemana={diasSemana}
              onAlternarDia={alternarDia}
              fecha={desde}
              horaInicio={horaInicio}
              onHoraInicio={setHoraInicio}
              horaFin={horaFin}
              onHoraFin={setHoraFin}
              diasHastaElFin={diasHastaElFin}
              onDiasHastaElFin={setDiasHastaElFin}
              errores={errores}
              disabled={guardando}
            />
            <div className="panel-modal-acciones">
              <Button variant="secondary" type="button" onClick={onClose} disabled={guardando}>
                {t.comun.cancelar}
              </Button>
              <Button type="submit" disabled={guardando}>
                {guardando ? textos.guardando : textos.editar_recurrente}
              </Button>
            </div>
          </form>
        )}

        {estado !== 'listo' && (
          <div className="panel-modal-acciones">
            <Button variant="secondary" type="button" onClick={onClose}>
              {t.comun.cancelar}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
