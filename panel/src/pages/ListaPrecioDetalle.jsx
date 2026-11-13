import { useState } from 'react';
import { useLocale } from '../i18n/LocaleContext';
import { useConfirmarDestructivo } from '../context/ConfirmacionContext';
import { supabase } from '../lib/supabaseClient';
import { Button } from '../components/ui/Button';
import { FormField } from '../components/ui/FormField';
import { Alert } from '../components/ui/Alert';
import { useModalAccesible } from '../hooks/useModalAccesible';
import { usePrestadoraActual } from '../hooks/usePrestadoraActual';
import { useMonedaActual } from '../hooks/useMonedaActual';
import { mensajeDeError } from '../lib/errores';
import '../styles/molde-paginas.css';

function hoy() {
  return new Date().toISOString().slice(0, 10);
}

export function ListaPrecioDetalle({ precio, soloLectura, onClose, onActualizada }) {
  const modal = useModalAccesible(onClose);
  const { t } = useLocale();
  const prestadoraId = usePrestadoraActual();
  const confirmarDestructivo = useConfirmarDestructivo();
  const esNuevo = !precio;
  // La moneda no se elige acá: la de un precio ya cargado es la que quedó guardada con él, y la
  // de uno nuevo es la de la Prestadora, que la completa sola al insertar
  // (`public.moneda_de_prestadora`). Se muestra igual, porque un importe sin moneda a la vista
  // no se puede leer: en la lista de al lado ya se ve con la suya, y este formulario era el
  // único lugar donde el mismo número aparecía pelado.
  const monedaDeLaPrestadora = useMonedaActual();
  const moneda = precio?.moneda ?? monedaDeLaPrestadora;
  const [tipoServicio, setTipoServicio] = useState(precio?.tipo_servicio || '');
  const [modalidad, setModalidad] = useState(precio?.modalidad || '');
  const [valorPrecio, setValorPrecio] = useState(precio?.precio ?? '');
  const [vigenteDesde, setVigenteDesde] = useState(precio?.vigente_desde || hoy());
  const [activo, setActivo] = useState(precio?.activo ?? true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  // Un renglón que ya fue reemplazado por otro precio es historia: se mira, no se cambia.
  const cerrado = !esNuevo && Boolean(precio.vigente_hasta);
  const bloqueado = soloLectura || cerrado;
  const cambiaElPrecio = !esNuevo && valorPrecio !== '' && Number(valorPrecio) !== Number(precio.precio);

  // El precio de un renglón ya cargado no se pisa: el nuevo se escribe aparte, con la fecha desde
  // la que rige, y el viejo queda cerrado el día anterior (`reemplazar_precio_de_lista`). Por eso
  // la fecha sólo se elige cuando cambia el precio, y arranca en hoy.
  function cambiarPrecio(valor) {
    setValorPrecio(valor);
    if (!esNuevo && Number(valor) !== Number(precio.precio) && vigenteDesde === precio.vigente_desde) {
      setVigenteDesde(hoy());
    }
    if (!esNuevo && Number(valor) === Number(precio.precio)) setVigenteDesde(precio.vigente_desde);
  }

  async function handleGuardar() {
    if (cambiaElPrecio) {
      const confirmado = await confirmarDestructivo(t.lista_precios.confirmar_cambio_precio);
      if (!confirmado) return;
    }

    setGuardando(true);
    setError(null);

    try {
      if (esNuevo) {
        const { error: errorAlta } = await supabase.from('lista_precios').insert({
          tipo_servicio: tipoServicio,
          modalidad,
          precio: Number(valorPrecio),
          vigente_desde: vigenteDesde,
          activo,
          prestadora_id: prestadoraId,
        });
        if (errorAlta) throw errorAlta;
      } else {
        let renglonId = precio.id;
        if (cambiaElPrecio) {
          const { data, error: errorPrecio } = await supabase.rpc('reemplazar_precio_de_lista', {
            p_precio_id: precio.id,
            p_precio: Number(valorPrecio),
            p_desde: vigenteDesde,
          });
          if (errorPrecio) throw errorPrecio;
          renglonId = data ?? precio.id;
        }
        // Lo demás se corrige sobre el renglón que rige. El precio y su fecha no viajan acá.
        const { error: errorDatos } = await supabase
          .from('lista_precios')
          .update({ tipo_servicio: tipoServicio, modalidad, activo })
          .eq('id', renglonId);
        if (errorDatos) throw errorDatos;
      }
    } catch (errorGuardado) {
      setError(mensajeDeError(errorGuardado, t, 'lista de precios'));
      setGuardando(false);
      return;
    }

    setGuardando(false);
    onActualizada();
  }

  return (
    <div className="panel-modal-fondo" onClick={onClose}>
      <div className="panel-modal" onClick={(e) => e.stopPropagation()} {...modal.props}>
        <h2 id={modal.idTitulo}>{esNuevo ? t.lista_precios.nuevo : `${precio.tipo_servicio} — ${precio.modalidad}`}</h2>

        {error && <Alert variant="error">{error}</Alert>}

        <div className="molde-formgrid">
          <FormField
            label={t.lista_precios.col_tipo_servicio}
            name="tipo_servicio"
            value={tipoServicio}
            onChange={(e) => setTipoServicio(e.target.value)}
            disabled={bloqueado}
            required
          />

          <FormField
            label={t.lista_precios.col_modalidad}
            name="modalidad"
            value={modalidad}
            onChange={(e) => setModalidad(e.target.value)}
            disabled={bloqueado}
            required
          />

          <FormField
            label={moneda ? `${t.lista_precios.col_precio} (${moneda})` : t.lista_precios.col_precio}
            name="precio"
            type="number"
            step="0.01"
            value={valorPrecio}
            onChange={(e) => cambiarPrecio(e.target.value)}
            disabled={bloqueado}
            required
          />

          <FormField
            label={t.lista_precios.col_vigente_desde}
            name="vigente_desde"
            type="date"
            value={vigenteDesde}
            onChange={(e) => setVigenteDesde(e.target.value)}
            disabled={bloqueado || (!esNuevo && !cambiaElPrecio)}
            required
          />

          <FormField
            label={t.lista_precios.col_activo}
            name="activo"
            type="checkbox"
            checked={activo}
            onChange={(e) => setActivo(e.target.checked)}
            disabled={bloqueado}
          />
        </div>

        <div className="panel-modal-acciones">
          <Button variant="secondary" onClick={onClose} disabled={guardando}>
            {bloqueado ? t.comun.cerrar : t.comun.cancelar}
          </Button>
          {!bloqueado && (
            <Button onClick={handleGuardar} disabled={guardando}>
              {guardando ? t.comun.guardando : t.comun.guardar}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
