import { useRef, useState } from 'react';
import { useLocale } from '../i18n/LocaleContext';
import { supabase } from '../lib/supabaseClient';
import { mensajeDeError } from '../lib/errores';
import { hoyISO } from '../lib/horarios';
import { formatearImporte } from '../lib/dinero';
import { useModalAccesible } from '../hooks/useModalAccesible';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { FormField } from '../components/ui/FormField';
import {
  AVISOS_DE_LA_PROMOCION,
  CAMPOS_DE_LA_PROMOCION,
  avisosDeLaPromocion,
  pedidoDeLaPromocion,
  promocionVacia,
} from '../lib/promocionDeLista';
import '../styles/molde-paginas.css';

/* La carga de una promoción sobre un precio de lista que rige.
   ==========================================================================

   La promoción es un renglón aparte, con su precio, su comienzo y su fin. El precio de siempre no
   se toca: cuando la promoción vence, vuelve a regir solo. La graba la base en una sola operación
   (`cargar_promocion_de_lista`), que también rechaza una promoción que se superpone con otra del
   mismo precio. Una promoción cargada no se edita: se mira en la lista. */
export function PromocionDeLista({ precio, onClose, onCargada }) {
  const modal = useModalAccesible(onClose);
  const { t, locale } = useLocale();
  const tl = t.lista_precios;
  const [form, setForm] = useState(() => promocionVacia(precio, hoyISO()));
  const [avisos, setAvisos] = useState({});
  const [intentoGuardar, setIntentoGuardar] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const formRef = useRef(null);

  const etiquetas = {
    precio: precio?.moneda ? `${tl.campo_precio_de_promocion} (${precio.moneda})` : tl.campo_precio_de_promocion,
    vigente_desde: tl.col_vigente_desde,
    vigente_hasta: tl.col_vigente_hasta,
  };
  const tipos = { numero: 'number', fecha: 'date' };

  function textoDelAviso(codigo) {
    switch (codigo) {
      case AVISOS_DE_LA_PROMOCION.FALTA:
        return t.formularios.falta_un_dato_obligatorio;
      case AVISOS_DE_LA_PROMOCION.PRECIO_NO_POSITIVO:
        return tl.error_precio_positivo;
      case AVISOS_DE_LA_PROMOCION.FECHA_ANTERIOR:
        return t.errores.motivos.fecha_anterior;
      case AVISOS_DE_LA_PROMOCION.FECHAS_AL_REVES:
        return t.errores.motivos.fechas_al_reves;
      default:
        return undefined;
    }
  }

  function cambiar(clave, valor) {
    const siguiente = { ...form, [clave]: valor };
    setForm(siguiente);
    if (intentoGuardar) setAvisos(avisosDeLaPromocion(siguiente, precio));
  }

  async function guardar() {
    const encontrados = avisosDeLaPromocion(form, precio);
    setIntentoGuardar(true);
    setAvisos(encontrados);
    const primero = Object.keys(encontrados)[0];
    if (primero) {
      formRef.current?.querySelector(`#field-${primero}`)?.focus();
      return;
    }
    setGuardando(true);
    setError(null);
    const { error: falla } = await supabase.rpc('cargar_promocion_de_lista', pedidoDeLaPromocion(form, precio));
    setGuardando(false);
    if (falla) {
      setError(mensajeDeError(falla, t, 'promoción de lista'));
      return;
    }
    onCargada();
  }

  return (
    <div className="panel-modal-fondo" onClick={onClose}>
      <div className="panel-modal" onClick={(e) => e.stopPropagation()} {...modal.props}>
        <h2 id={modal.idTitulo}>{`${tl.cargar_promocion} — ${precio.tipo_servicio} — ${precio.modalidad}`}</h2>
        <p>{`${tl.col_precio}: ${formatearImporte(precio.precio, precio.moneda, locale)}`}</p>

        {error && <Alert variant="error">{error}</Alert>}

        <div className="molde-formgrid" ref={formRef}>
          {CAMPOS_DE_LA_PROMOCION.map((campo) => (
            <FormField
              key={campo.clave}
              label={etiquetas[campo.clave]}
              name={campo.clave}
              type={tipos[campo.tipo] ?? 'text'}
              step={campo.tipo === 'numero' ? '0.01' : undefined}
              min={campo.tipo === 'numero' ? '0' : undefined}
              value={form[campo.clave]}
              onChange={(e) => cambiar(campo.clave, e.target.value)}
              disabled={guardando}
              required={campo.obligatorio}
              error={textoDelAviso(avisos[campo.clave])}
            />
          ))}
        </div>

        <div className="panel-modal-acciones">
          <Button variant="secondary" onClick={onClose} disabled={guardando}>
            {t.comun.cancelar}
          </Button>
          <Button onClick={guardar} disabled={guardando}>
            {guardando ? t.comun.guardando : t.comun.guardar}
          </Button>
        </div>
      </div>
    </div>
  );
}
