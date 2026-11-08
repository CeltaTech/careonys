import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { mensajeDeError } from '../lib/errores';
import { useLocale } from '../i18n/LocaleContext';

/* Las frases de `mensajes_del_sistema`, leídas por el Panel.
 *
 * La base deja leer las de fábrica y las propias de la Prestadora de quien inició sesión. Si la
 * Prestadora escribió la suya, vale la suya; si no, la de fábrica. La frase sale en el idioma que
 * se pide, que es el del documento y no siempre el de quien mira.
 *
 * Devuelve `{ frases, estado, error }`: `frases[clave]` es el texto, y una clave sin frase en la
 * base se ve como `[sin traducir: clave]` en desarrollo y como un guion en producción. */
export function useFrasesDelSistema(claves, idioma) {
  const { t } = useLocale();
  const [filas, setFilas] = useState([]);
  const [estado, setEstado] = useState('cargando'); // cargando | error | vacio | listo
  const [error, setError] = useState(null);

  const clavesFirmadas = JSON.stringify(claves);

  useEffect(() => {
    let vigente = true;
    setEstado('cargando');
    setError(null);
    supabase
      .from('mensajes_del_sistema')
      .select('clave, prestadora_id, i18n')
      .in('clave', JSON.parse(clavesFirmadas))
      .eq('activo', true)
      .then(({ data, error: errorConsulta }) => {
        if (!vigente) return;
        if (errorConsulta) {
          setError(mensajeDeError(errorConsulta, t, 'mensajes_del_sistema'));
          setEstado('error');
          return;
        }
        const traidas = data ?? [];
        setFilas(traidas);
        setEstado(traidas.length === 0 ? 'vacio' : 'listo');
      });
    return () => {
      vigente = false;
    };
  }, [clavesFirmadas, t]);

  const frases = {};
  for (const clave of JSON.parse(clavesFirmadas)) {
    const deLaClave = filas.filter((fila) => fila.clave === clave);
    const fila = deLaClave.find((f) => f.prestadora_id) ?? deLaClave.find((f) => !f.prestadora_id);
    const texto = fila?.i18n?.[idioma] ?? fila?.i18n?.['es-AR'];
    frases[clave] = texto ?? (import.meta.env.DEV ? `[sin traducir: ${clave}]` : '—');
  }

  return { frases, estado, error };
}
