import { useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { supabase } from '../../lib/supabaseClient';
import { nombreTipo } from '../../lib/tiposAsistente';
import { useTiposAsistente } from '../../hooks/useTiposAsistente';
import { mensajeDeError } from '../../lib/errores';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { useModalAccesible } from '../../hooks/useModalAccesible';
import { con } from '../../lib/textos';

// La pantalla donde se le pone tipo a los Asistentes que todavía no lo tienen:
// los que entraron por una planilla importada donde el tipo no se pudo
// reconocer. Los pone uno debajo del otro y el tipo se elige a mano, porque el
// tipo es lo que decide si a esa persona se le exige matrícula para atender.
//
// El día que no quede ningún Asistente sin tipo, la alerta de la lista deja de
// aparecer y esta pantalla no se abre más.
export function PasarAlCatalogoModal({ asistentes, onClose, onGuardado }) {
  const modal = useModalAccesible(onClose);
  const { t } = useLocale();
  const { paraElegir: tipos } = useTiposAsistente();
  const [elegidos, setElegidos] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  function valorDe(asistenteId) {
    return elegidos[asistenteId] ?? '';
  }

  const cuantosTienenTipo = asistentes.filter((a) => valorDe(a.id)).length;

  async function guardar() {
    setGuardando(true);
    setError(null);
    const cambios = asistentes
      .map((a) => ({ id: a.id, tipo_asistente_id: valorDe(a.id) }))
      .filter((cambio) => cambio.tipo_asistente_id);

    for (const cambio of cambios) {
      const { error: errorGuardar } = await supabase
        .from('asistentes')
        .update({ tipo_asistente_id: cambio.tipo_asistente_id })
        .eq('id', cambio.id);
      if (errorGuardar) {
        setGuardando(false);
        setError(mensajeDeError(errorGuardar, t));
        return;
      }
    }

    setGuardando(false);
    onGuardado();
  }

  return (
    <div className="panel-modal-fondo" onClick={onClose}>
      <div className="panel-modal" onClick={(e) => e.stopPropagation()} {...modal.props}>
        <h2 id={modal.idTitulo}>{t.asistentes.pasar_al_catalogo.titulo}</h2>
        {error && <Alert variant="error">{error}</Alert>}

        <table className="panel-tabla">
          <thead>
            <tr>
              <th>{t.asistentes.col_nombre}</th>
              <th>{t.asistentes.col_tipo}</th>
            </tr>
          </thead>
          <tbody>
            {asistentes.map((asistente) => (
              <tr key={asistente.id}>
                <td>{asistente.nombre}</td>
                <td>
                  <select
                    value={valorDe(asistente.id)}
                    onChange={(e) => setElegidos((previos) => ({ ...previos, [asistente.id]: e.target.value }))}
                    aria-label={con(t.comun.campo_de_fila, { campo: t.asistentes.col_tipo, nombre: asistente.nombre })}
                  >
                    <option value="">{t.asistentes.pasar_al_catalogo.dejar_para_despues}</option>
                    {tipos.map((tipo) => (
                      <option key={tipo.id} value={tipo.id}>{nombreTipo(tipo, t)}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="panel-modal-acciones">
          <Button variant="secondary" type="button" onClick={onClose} disabled={guardando}>
            {t.comun.cancelar}
          </Button>
          <Button type="button" onClick={guardar} disabled={guardando || cuantosTienenTipo === 0}>
            {guardando ? t.comun.guardando : t.asistentes.pasar_al_catalogo.guardar}
          </Button>
        </div>
      </div>
    </div>
  );
}
