import { supabase, sinPrestadora, enLaPrestadora } from '../db/connection.js';
import { responderError } from '../utils/errorConMotivo.js';

// De qué Prestadora es un pedido que llega sin sesión: los dos formularios del sitio público de
// una Prestadora —pedir un servicio, postularse como Asistente— y los datos de contacto que ese
// sitio muestra.
//
// **La Prestadora sale de la dirección, nunca de un encabezado.** Antes se deducía de `Origin`,
// `Referer` o `Host`: un navegador los manda solos, pero cualquier otro programa los escribe a
// mano, así que quien mandaba el pedido elegía en qué Prestadora escribir. Y cuando ninguno
// coincidía —lo normal detrás de un proxy, que reemplaza el `Host` por el suyo— se asumía la
// única Prestadora pública que hubiera, que es adivinar y deja de funcionar en cuanto hay dos.
// Ahora el identificador viaja en la propia dirección del formulario
// (`/api/publico/:prestadora/…`), lo escribe el sitio de esa Prestadora, y un pedido que no
// resuelve se rechaza en vez de asumir una.
//
// El identificador público es la dirección por la que se entra a esa Prestadora: vive en
// `configuracion_prestadora.dominio`, se le asigna sola al darla de alta, es única y no cambia
// nunca (`utils/direccionDeLaPrestadora.js`). Se guarda siempre en minúsculas, que es por lo que
// alcanza con comparar contra lo que llegó en minúsculas.
//
// Lo que esto **no** hace: un formulario público sigue siendo abierto por definición, y cualquiera
// puede mandarle datos inventados a la Prestadora que quiera. Lo que se termina acá es que el
// destino lo elija un encabezado ajeno o una adivinanza del servidor.
const TRABAJO = 'Puerta pública';

export async function resolverPrestadoraPublica(req, res, next) {
  const identificador = String(req.params.prestadora || '')
    .trim()
    .toLowerCase()
    .replace(/^www\./, '');

  if (!identificador) {
    return res.status(404).json({ error: 'prestadora_no_reconocida' });
  }

  // Quien golpea todavía no dice de qué Prestadora es: lo dice la dirección. La credencial sin
  // Prestadora sólo sirve para esa pregunta, y con la respuesta se entra a la Prestadora y a ninguna
  // otra. Todo lo que corre detrás de la puerta queda adentro de ella.
  const { data: prestadoraId, error } = await sinPrestadora(TRABAJO)
    .rpc('prestadora_de_la_direccion', { p_direccion: identificador });

  if (error) return responderError(res, error);
  if (!prestadoraId) return res.status(404).json({ error: 'prestadora_no_reconocida' });

  return enLaPrestadora(prestadoraId, TRABAJO, async () => {
    const { data, error: errorConfiguracion } = await supabase
      .from('configuracion_prestadora')
      .select('*')
      .eq('prestadora_id', prestadoraId)
      .maybeSingle();

    if (errorConfiguracion) return responderError(res, errorConfiguracion);
    if (!data) return res.status(404).json({ error: 'prestadora_no_reconocida' });

    req.prestadoraPublica = data;
    return next();
  });
}
