import { supabase } from '../../lib/supabaseClient';
import { errorDeLaRespuesta } from '../../lib/errores';

const API_URL = import.meta.env.VITE_API_URL;

/** Pide una ruta de Match del backend con la sesión de quien está en el Panel. */
export async function llamarApiDeMatch(path, opciones = {}) {
  const { data } = await supabase.auth.getSession();
  const respuesta = await fetch(`${API_URL}/api/panel/intermediacion${path}`, {
    ...opciones,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.session?.access_token}`,
      ...opciones.headers,
    },
  });
  const resultado = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) throw errorDeLaRespuesta(respuesta, resultado);
  return resultado;
}
