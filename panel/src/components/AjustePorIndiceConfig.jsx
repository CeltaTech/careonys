import { FormField } from './ui/FormField';
import { AJUSTES_POR_INDICE_POSIBLES, SIN_INDICE, VALORES_DE_FABRICA_DEL_CLIENTE } from '../lib/condicionesDelCliente';
import { MESES_POSIBLES, textoDeMeses } from '../lib/ajustePorIndice';

/* Los tres casilleros del ajuste periódico por índice, para toda la Prestadora.
   ==========================================================================

   Qué índice, cada cuántos meses y si el valor nuevo se aplica solo o queda propuesto para que la
   administración lo revise. Los usan dos pantallas con las mismas tres claves: el precio que se
   le cobra al Cliente y el valor del Legajo que se le paga al Asistente.

   Va sin envoltorio: los casilleros se dibujan adentro de la grilla del formulario que lo usa.
   Sin índice no hay nada que aplicar, así que los meses y la forma de aplicarlo no se muestran.

   - valores: las tres claves; null quiere decir «la de fábrica».
   - indices: el catálogo de la base, [{ codigo, nombre }].
   - errorIndices: el texto si el catálogo no se pudo leer.
   - claveMal: la clave mal cargada, que se señala recién al apretar guardar.
   - onCambiar(clave, valor): valor null cuando el casillero quedó vacío. */
export function AjustePorIndiceConfig({ t, valores, indices, errorIndices, claveMal, onCambiar, disabled }) {
  const tc = t.configuracion.condiciones_cliente;
  const conIndice = (valores?.indice_de_actualizacion ?? SIN_INDICE) !== SIN_INDICE;
  const cambiar = (clave) => (e) => onCambiar(clave, e.target.value === '' ? null : e.target.value);

  return (
    <>
      <FormField
        label={tc.indice_de_actualizacion}
        name="indice_de_actualizacion"
        type="select"
        value={valores?.indice_de_actualizacion ?? SIN_INDICE}
        error={errorIndices ?? undefined}
        disabled={disabled}
        onChange={cambiar('indice_de_actualizacion')}
      >
        <option value={SIN_INDICE}>{t.actualizacion_de_precios.sin_indice}</option>
        {(indices ?? []).map((indice) => (
          <option key={indice.codigo} value={indice.codigo}>
            {indice.nombre}
          </option>
        ))}
      </FormField>
      {conIndice && (
        <>
          <FormField
            label={tc.meses_entre_actualizaciones}
            name="meses_entre_actualizaciones"
            type="select"
            value={String(valores?.meses_entre_actualizaciones ?? VALORES_DE_FABRICA_DEL_CLIENTE.meses_entre_actualizaciones)}
            error={claveMal === 'meses_entre_actualizaciones' ? t.formularios.falta_un_dato_obligatorio : undefined}
            disabled={disabled}
            onChange={cambiar('meses_entre_actualizaciones')}
          >
            {MESES_POSIBLES.map((n) => (
              <option key={n} value={String(n)}>{textoDeMeses(tc, n)}</option>
            ))}
          </FormField>
          <FormField
            label={tc.ajuste_por_indice}
            name="ajuste_por_indice"
            type="select"
            value={valores?.ajuste_por_indice ?? VALORES_DE_FABRICA_DEL_CLIENTE.ajuste_por_indice}
            disabled={disabled}
            onChange={cambiar('ajuste_por_indice')}
          >
            {AJUSTES_POR_INDICE_POSIBLES.map((valor) => (
              <option key={valor} value={valor}>
                {tc.valores.ajuste_por_indice[valor]}
              </option>
            ))}
          </FormField>
        </>
      )}
    </>
  );
}
