import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { supabase } from '../../lib/supabaseClient';
import { FormField } from '../ui/FormField';
import { Alert } from '../ui/Alert';
import { mensajeDeError } from '../../lib/errores';

/* El casillero que nombra a una Persona del Directorio de Personas.
   ==========================================================================

   Donde antes se tecleaba un nombre, se elige una Ficha de Persona. Un nombre tecleado crea un ente
   nuevo que no existe: la misma obra social escrita en la Ficha de cien Pacientes son cien entidades
   distintas, y una mal tipeada no se cruza nunca con la buena.

   ACÁ SE ELIGE Y NADA MÁS. Una Ficha nueva se carga desde el Directorio de Personas, con el botón que
   lo dice.

   CÓMO SE LLAMA CADA PERSONA LO DICE LA BASE, en una sola columna calculada, para que todas las
   pantallas digan lo mismo. */
export function SelectorDePersona({
  valor,
  alElegir,
  label,
  name,
  deshabilitado = false,
  clase = null,
}) {
  const { t } = useLocale();
  const [filas, setFilas] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [busqueda, setBusqueda] = useState('');

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    // `clase` acota la lista cuando el casillero admite una sola: el Apoderado de una entidad es
    // una persona de carne y hueso, y ofrecer ahí otra entidad sería ofrecer algo que la base
    // rechaza. Sin `clase` se ofrecen las dos, que es lo corriente, porque contrata y paga
    // cualquiera de las dos.
    let consulta = supabase
      .from('personas')
      .select('id, nombre_visible, documento_numero')
      .order('nombre_visible', { ascending: true });
    if (clase) consulta = consulta.eq('clase', clase);

    const { data, error: errorConsulta } = await consulta;

    if (errorConsulta) {
      setError(mensajeDeError(errorConsulta, t));
      setEstado('error');
      return;
    }

    setFilas(data ?? []);
    setEstado(data && data.length > 0 ? 'listo' : 'vacio');
  }, [t, clase]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  // Lo elegido se muestra siempre, aunque la búsqueda lo deje afuera: una lista que esconde lo que
  // ya está guardado se lee como si el dato se hubiera perdido.
  const listadas = useMemo(() => {
    const buscado = busqueda.trim().toLowerCase();
    if (!buscado) return filas;
    return filas.filter((fila) => (
      fila.id === valor
      || (fila.nombre_visible ?? '').toLowerCase().includes(buscado)
      || (fila.documento_numero ?? '').toLowerCase().includes(buscado)
    ));
  }, [filas, busqueda, valor]);

  return (
    <>
      {error && <Alert variant="error">{error}</Alert>}

      {estado === 'listo' && filas.length > 10 && (
        <FormField
          label={t.personas.selector_buscar}
          name={`${name}_busqueda`}
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          disabled={deshabilitado}
        />
      )}

      <FormField
        label={label}
        name={name}
        type="select"
        value={valor ?? ''}
        onChange={(e) => alElegir(e.target.value || null)}
        disabled={deshabilitado || estado === 'cargando' || estado === 'error'}
      >
        <option value="">
          {estado === 'cargando' ? t.personas.selector_cargando : t.personas.selector_sin_elegir}
        </option>
        {listadas.map((fila) => (
          <option key={fila.id} value={fila.id}>
            {fila.nombre_visible}{fila.documento_numero ? ` · ${fila.documento_numero}` : ''}
          </option>
        ))}
      </FormField>
    </>
  );
}
