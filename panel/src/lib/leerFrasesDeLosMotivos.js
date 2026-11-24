import { supabase } from './supabaseClient';
import { CLAVE_DE_CADA_MOTIVO } from '../i18n/frasesDeLosMotivos';

/* Lee de la base las frases de los motivos que la base levanta (`i18n/frasesDeLosMotivos.js`).

   La base deja leer las de fábrica y las propias de la Prestadora de quien inició sesión. Si la
   lectura falla, devuelve una lista vacía: el rechazo se sigue mostrando, con la frase general de
   su situación. */
export async function leerFrasesDeLosMotivos() {
  const { data, error } = await supabase
    .from('mensajes_del_sistema')
    .select('clave, prestadora_id, i18n')
    .in('clave', Object.values(CLAVE_DE_CADA_MOTIVO))
    .eq('activo', true);
  if (error) {
    console.error('[frases de los motivos]', error);
    return [];
  }
  return data ?? [];
}
