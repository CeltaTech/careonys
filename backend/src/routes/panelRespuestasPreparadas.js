import { Router } from 'express';
import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import { exigirAdministracion } from '../middleware/exigirAdministracion.js';
import { exigirOrganizacionActiva } from '../middleware/alcancePrestadora.js';
import { supabase } from '../db/connection.js';
import { responderError } from '../utils/errorConMotivo.js';
import { ACCION_MODIFICACION_CRITICA, registrarActividad } from '../utils/registroDeActividad.js';
import { IDIOMAS_SOPORTADOS } from '../i18n/idiomas.js';

/* El banco de respuestas preparadas, visto desde el Panel.
   ======================================================================================

   QUÉ SE HACE DESDE ACÁ. Ver el banco, agregar una respuesta, corregirla, aprobarla y sacarle
   la aprobación. Es la única puerta por la que una respuesta pasa a estar aprobada, y por eso
   está detrás de la administración de la Prestadora: quien aprueba se hace cargo de un texto
   que después sale solo hacia el teléfono de otra persona.

   NACE SIN APROBAR, SIEMPRE. Ni el alta a mano ni la propuesta de la IA pueden entrar
   aprobadas: las dos columnas de la aprobación las escribe solamente la ruta de aprobar, con
   quién la firmó sacado de la sesión comprobada y nunca de lo que venga en el pedido.

   CORREGIR EL TEXTO SACA LA APROBACIÓN. Lo que se aprobó es un texto, no un renglón: cambiarle
   el texto, las palabras con las que se reconoce o la marca de lo clínico deja una respuesta
   que nadie leyó saliendo con el visto bueno de ayer. Apagarla o volver a encenderla no cambia
   el texto, así que eso no toca la aprobación.

   LO CLÍNICO NO SE APROBA DESDE NINGÚN LADO. Una respuesta marcada `toca_salud` se rechaza acá
   y la base la rechaza también, con la restricción `lo_que_toca_salud_no_se_aprueba`. Queda en
   el banco para que la lea una persona, que es lo que corresponde.

   EL AISLAMIENTO. El motor entra a la base con la llave de servicio, así que la Prestadora sale
   de `req.usuarioPanel.prestadoraId` y se escribe en cada consulta: es la primera red, y las
   políticas de la tabla son la segunda. */

export const panelRespuestasPreparadasRouter = Router();

panelRespuestasPreparadasRouter.use(
  requiereRolPanel,
  exigirAdministracion('Solo Admin o Superadmin puede tocar las respuestas preparadas'),
  exigirOrganizacionActiva,
);

const COLUMNAS =
  'id, nombre_interno, terminos, i18n, toca_salud, origen, activa, aprobada_at, created_at, updated_at';

/** Las palabras con las que se reconoce una situación: sin repetir, sin espacios de más y sin
 *  vacías. Se comparan en minúsculas del lado del motor, así que se guardan ya así. */
function terminosQueSeGuardan(terminos) {
  if (!Array.isArray(terminos)) return null;
  return [...new Set(terminos.map((termino) => String(termino).trim().toLowerCase()).filter(Boolean))];
}

/** El texto en los tres idiomas. Con uno solo que falte no hay nada que mandar el día que
 *  escriba alguien en ese idioma, y la base lo rechazaría nombrando la restricción. */
function textoQueSeGuarda(i18n) {
  if (!i18n || typeof i18n !== 'object') return null;
  const texto = {};
  for (const idioma of IDIOMAS_SOPORTADOS) {
    const valor = String(i18n[idioma] ?? '').trim();
    if (!valor) return null;
    texto[idioma] = valor;
  }
  return texto;
}

panelRespuestasPreparadasRouter.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('respuestas_preparadas_whatsapp')
    .select(COLUMNAS)
    .eq('prestadora_id', req.usuarioPanel.prestadoraId)
    .order('created_at', { ascending: false });
  if (error) return responderError(res, error);
  // Una lista vacía es lo corriente: el banco nace vacío y se llena acá.
  res.json({ respuestas: data ?? [] });
});

panelRespuestasPreparadasRouter.post('/', async (req, res) => {
  const nombre = String(req.body?.nombre_interno ?? '').trim();
  const terminos = terminosQueSeGuardan(req.body?.terminos);
  const texto = textoQueSeGuarda(req.body?.i18n);

  if (!nombre) return res.status(400).json({ error: 'Falta el nombre de la respuesta' });
  if (!terminos?.length) return res.status(400).json({ error: 'Falta con qué palabras se reconoce esta respuesta' });
  if (!texto) return res.status(400).json({ error: 'Falta el texto en los tres idiomas' });

  // Las dos columnas de la aprobación no se escriben acá ni aunque vengan en el pedido.
  const { data, error } = await supabase
    .from('respuestas_preparadas_whatsapp')
    .insert({
      prestadora_id: req.usuarioPanel.prestadoraId,
      nombre_interno: nombre,
      terminos,
      i18n: texto,
      toca_salud: req.body?.toca_salud === true,
      origen: 'prestadora',
    })
    .select(COLUMNAS)
    .maybeSingle();
  if (error) return responderError(res, error);
  res.json({ respuesta: data });
});

panelRespuestasPreparadasRouter.patch('/:id', async (req, res) => {
  const cambios = { updated_at: new Date().toISOString() };
  let cambiaElTexto = false;

  if (req.body?.nombre_interno !== undefined) {
    const nombre = String(req.body.nombre_interno).trim();
    if (!nombre) return res.status(400).json({ error: 'Falta el nombre de la respuesta' });
    cambios.nombre_interno = nombre;
  }
  if (req.body?.terminos !== undefined) {
    const terminos = terminosQueSeGuardan(req.body.terminos);
    if (!terminos?.length) return res.status(400).json({ error: 'Falta con qué palabras se reconoce esta respuesta' });
    cambios.terminos = terminos;
    cambiaElTexto = true;
  }
  if (req.body?.i18n !== undefined) {
    const texto = textoQueSeGuarda(req.body.i18n);
    if (!texto) return res.status(400).json({ error: 'Falta el texto en los tres idiomas' });
    cambios.i18n = texto;
    cambiaElTexto = true;
  }
  if (req.body?.toca_salud !== undefined) {
    cambios.toca_salud = req.body.toca_salud === true;
    cambiaElTexto = true;
  }
  if (req.body?.activa !== undefined) cambios.activa = req.body.activa === true;

  if (Object.keys(cambios).length === 1) return res.status(400).json({ error: 'No hay nada para cambiar' });

  // Lo corregido vuelve a esperar que alguien lo lea. Se hace acá y no se confía a la pantalla.
  if (cambiaElTexto) {
    cambios.aprobada_at = null;
    cambios.aprobada_por = null;
  }

  const { data, error } = await supabase
    .from('respuestas_preparadas_whatsapp')
    .update(cambios)
    .eq('id', req.params.id)
    .eq('prestadora_id', req.usuarioPanel.prestadoraId)
    .select(COLUMNAS);
  if (error) return responderError(res, error);
  if (!data?.length) return res.status(404).json({ error: 'No se encontró esa respuesta preparada' });
  res.json({ respuesta: data[0] });
});

// Aprobar es lo que habilita a que ese texto salga solo, así que queda registrado: quién, cuándo
// y sobre qué fila. **El texto no entra en el registro.**
panelRespuestasPreparadasRouter.post('/:id/aprobar', async (req, res) => {
  const { data: respuesta, error: errorLectura } = await supabase
    .from('respuestas_preparadas_whatsapp')
    .select('id, toca_salud')
    .eq('id', req.params.id)
    .eq('prestadora_id', req.usuarioPanel.prestadoraId)
    .maybeSingle();
  if (errorLectura) return responderError(res, errorLectura);
  if (!respuesta) return res.status(404).json({ error: 'No se encontró esa respuesta preparada' });
  if (respuesta.toca_salud) {
    return res.status(400).json({ error: 'Lo que toca la salud se deriva siempre a una persona' });
  }

  const { data, error } = await supabase
    .from('respuestas_preparadas_whatsapp')
    .update({
      aprobada_at: new Date().toISOString(),
      // Quién la firma sale de la sesión comprobada, nunca del pedido.
      aprobada_por: req.usuarioPanel.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', respuesta.id)
    .eq('prestadora_id', req.usuarioPanel.prestadoraId)
    .select(COLUMNAS);
  if (error) return responderError(res, error);
  if (!data?.length) return res.status(404).json({ error: 'No se encontró esa respuesta preparada' });

  await registrarActividad(req.usuarioPanel, ACCION_MODIFICACION_CRITICA, {
    tablaAfectada: 'respuestas_preparadas_whatsapp',
    registroId: respuesta.id,
    camposCambiados: ['aprobada_at', 'aprobada_por'],
  });

  res.json({ respuesta: data[0] });
});

panelRespuestasPreparadasRouter.post('/:id/desaprobar', async (req, res) => {
  const { data, error } = await supabase
    .from('respuestas_preparadas_whatsapp')
    .update({ aprobada_at: null, aprobada_por: null, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .eq('prestadora_id', req.usuarioPanel.prestadoraId)
    .select(COLUMNAS);
  if (error) return responderError(res, error);
  if (!data?.length) return res.status(404).json({ error: 'No se encontró esa respuesta preparada' });

  await registrarActividad(req.usuarioPanel, ACCION_MODIFICACION_CRITICA, {
    tablaAfectada: 'respuestas_preparadas_whatsapp',
    registroId: data[0].id,
    camposCambiados: ['aprobada_at', 'aprobada_por'],
  });

  res.json({ respuesta: data[0] });
});

// El borrado lo anota solo `requiereRolPanel`, que engancha todo pedido de borrado del Panel.
panelRespuestasPreparadasRouter.delete('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('respuestas_preparadas_whatsapp')
    .delete()
    .eq('id', req.params.id)
    .eq('prestadora_id', req.usuarioPanel.prestadoraId)
    .select('id');
  if (error) return responderError(res, error);
  if (!data?.length) return res.status(404).json({ error: 'No se encontró esa respuesta preparada' });
  res.json({ ok: true });
});
