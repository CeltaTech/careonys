// Contenidos: la biblioteca que cada Prestadora escribe para su gente. Cada pieza dice para quién
// es —Clientes, Asistentes, su propio personal, uno o más— y la ven sólo ellos, y sólo publicada.
//
// QUÉ SE GUARDA. Un título, un texto y, si la Prestadora ya publica material en otro lado, un
// enlace. No se suben archivos: eso es un depósito con sus propias políticas y es una decisión
// aparte.
//
// QUIÉN. Escribir y publicar es una acción del catálogo de permisos, `publicar_contenidos`, que
// nace reservada a la administración y cada Prestadora reparte como quiera desde Configuración ›
// Accesos. Quien la tiene ve todo, borradores incluidos. El resto del Panel ve sólo lo publicado
// para el personal. Las dos cosas las decide la base, no esta ruta.
//
// NO LLEVA CANDADO DE MODALIDAD. Un Cliente de prestación directa cuida en su casa igual que uno
// de Match. Por eso este riel no cuelga de `panelIntermediacion.js`.
//
// CON QUÉ CREDENCIAL. Todo va con la de quien pide (`clienteDelPedido(req)`): la política de la
// tabla deja escribir a quien tiene el permiso, y leer a cada uno lo que le toca.

import { Router } from 'express';
import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import { exigirOrganizacionActiva } from '../middleware/alcancePrestadora.js';
import { requierePermiso } from '../utils/permisos.js';
import { clienteDelPedido } from '../db/connection.js';
import { ErrorConMotivo, responderError } from '../utils/errorConMotivo.js';
import { DESTINATARIOS_DE_CONTENIDOS } from '../config/destinatariosDeContenidos.js';

export const panelContenidosRouter = Router();

panelContenidosRouter.use(requiereRolPanel, exigirOrganizacionActiva);

const puedePublicar = requierePermiso('publicar_contenidos');

const CAMPOS = 'id, titulo, cuerpo, enlace_url, orden, destinatarios, publicado, created_at, updated_at';

/**
 * Lo que se va a guardar, o un error con motivo.
 *
 * Repite en el servidor lo que la tabla comprueba en la base, y por el mismo motivo que las formas
 * de cobro: un `CHECK` que salta sube como código crudo de Postgres, y de ahí la pantalla sólo
 * puede decir «hay un dato mal cargado». Comprobándolo acá, cada pieza mal cargada viaja con su
 * propio motivo (`celtatech/CLAUDE.md` §6, y `utils/errorConMotivo.js`).
 */
function contenidoValidado(cuerpoDelPedido) {
  const titulo = typeof cuerpoDelPedido.titulo === 'string' ? cuerpoDelPedido.titulo.trim() : '';
  if (!titulo) throw new ErrorConMotivo('faltan_datos', 'El contenido necesita un título');

  const cuerpo = typeof cuerpoDelPedido.cuerpo === 'string' ? cuerpoDelPedido.cuerpo.trim() : '';
  if (!cuerpo) throw new ErrorConMotivo('faltan_datos', 'El contenido necesita un texto');

  // El enlace es opcional; si viene, tiene que ser una página web cifrada. Lo que no se admite es
  // un `javascript:` ni un `http://` suelto: esto termina en un enlace que toca un Cliente.
  const enlaceCrudo = typeof cuerpoDelPedido.enlace_url === 'string' ? cuerpoDelPedido.enlace_url.trim() : '';
  const enlace = enlaceCrudo === '' ? null : enlaceCrudo;
  if (enlace !== null && !/^https:\/\/\S+$/.test(enlace)) {
    throw new ErrorConMotivo('enlace_invalido', `Enlace que no es una dirección https: ${enlace}`);
  }

  // Sin número de orden, la pieza va al final por fecha. Cero es un orden válido, así que no se
  // puede preguntar por el valor a secas.
  const ordenCrudo = cuerpoDelPedido.orden;
  const orden = ordenCrudo === null || ordenCrudo === undefined || ordenCrudo === '' ? 0 : Number(ordenCrudo);
  if (!Number.isInteger(orden)) {
    throw new ErrorConMotivo('orden_invalido', `Orden que no es un número entero: ${ordenCrudo}`);
  }

  // Para quién es. Falla cerrado: lo que no es una lista, o trae un destinatario que no existe, no
  // se guarda. Repetidos se juntan.
  const destinatariosCrudos = cuerpoDelPedido.destinatarios ?? [];
  if (
    !Array.isArray(destinatariosCrudos) ||
    destinatariosCrudos.some((d) => !DESTINATARIOS_DE_CONTENIDOS.includes(d))
  ) {
    throw new ErrorConMotivo('dato_invalido', `Destinatarios desconocidos: ${JSON.stringify(destinatariosCrudos)}`);
  }
  const destinatarios = DESTINATARIOS_DE_CONTENIDOS.filter((d) => destinatariosCrudos.includes(d));

  // Una pieza nueva nace sin publicar: se escribe primero y se muestra después. Publicada sin
  // nadie que la vea no tiene sentido, y la base tampoco la admite.
  const publicado = cuerpoDelPedido.publicado === true;
  if (publicado && destinatarios.length === 0) {
    throw new ErrorConMotivo('faltan_datos', 'Contenido publicado sin destinatarios');
  }

  return { titulo, cuerpo, enlace_url: enlace, orden, destinatarios, publicado };
}

/** El título repetido es lo único que la base rechaza y que la persona puede corregir sola. */
function errorDeGuardado(error) {
  if (error?.code === '23505') {
    return new ErrorConMotivo('titulo_de_contenido_repetido', error.message);
  }
  return error;
}

// La base contesta a cada uno lo suyo: a quien publica, todo; al resto, lo publicado para el
// personal. Por eso esta consulta no lleva filtros propios.
panelContenidosRouter.get('/', async (req, res) => {
  const db = clienteDelPedido(req);
  const { data, error } = await db
    .from('contenidos')
    .select(CAMPOS)
    .order('orden', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) return responderError(res, error);
  res.json({ contenidos: data });
});

// Si hay algo para mostrar. El menú del Panel lo pregunta para quien no publica, y esconde la
// sección mientras no haya nada publicado para el personal.
panelContenidosRouter.get('/hay', async (req, res) => {
  const db = clienteDelPedido(req);
  const { data, error } = await db.from('contenidos').select('id').limit(1);
  if (error) return responderError(res, error);
  res.json({ hay: data.length > 0 });
});

panelContenidosRouter.post('/', puedePublicar, async (req, res) => {
  let valores;
  try {
    valores = contenidoValidado(req.body || {});
  } catch (error) {
    return responderError(res, error, 400);
  }

  const { data, error } = await clienteDelPedido(req)
    .from('contenidos')
    .insert({
      ...valores,
      prestadora_id: req.usuarioPanel.prestadoraId,
      creado_por: req.usuarioPanel.id,
    })
    .select(CAMPOS)
    .single();
  if (error) return responderError(res, errorDeGuardado(error));

  res.json({ contenido: data });
});

panelContenidosRouter.patch('/:id', puedePublicar, async (req, res) => {
  const db = clienteDelPedido(req);
  // Se lee la pieza entera antes de tocarla: si no es de esta Prestadora, la base no la devuelve,
  // y se contesta lo mismo que si no existiera. Además, un pedido que trae sólo el interruptor de
  // publicado tiene que validarse contra lo que ya está guardado.
  const { data: actual, error: errorLectura } = await db
    .from('contenidos')
    .select(CAMPOS)
    .eq('id', req.params.id)
    .eq('prestadora_id', req.usuarioPanel.prestadoraId)
    .maybeSingle();
  if (errorLectura) return responderError(res, errorLectura);
  if (!actual) {
    return responderError(res, new ErrorConMotivo('no_encontrado', 'Contenido de otra Prestadora o inexistente'));
  }

  let valores;
  try {
    valores = contenidoValidado({ ...actual, ...req.body });
  } catch (error) {
    return responderError(res, error, 400);
  }

  const { data, error } = await db
    .from('contenidos')
    .update({ ...valores, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .eq('prestadora_id', req.usuarioPanel.prestadoraId)
    .select(CAMPOS)
    .single();
  if (error) return responderError(res, errorDeGuardado(error));

  res.json({ contenido: data });
});

// Acá sí se borra, a diferencia de las formas de cobro: una forma que ya se contrató la siguen
// apuntando los accesos, y esto no lo apunta nadie. Es texto propio de la Prestadora, y un
// borrador equivocado tiene que poder sacarse —si no, el título que eligió mal le queda ocupado
// para siempre—. La confirmación la pide la pantalla.
panelContenidosRouter.delete('/:id', puedePublicar, async (req, res) => {
  const { data: borrado, error } = await clienteDelPedido(req)
    .from('contenidos')
    .delete()
    .eq('id', req.params.id)
    .eq('prestadora_id', req.usuarioPanel.prestadoraId)
    .select('id');
  if (error) return responderError(res, error);
  if (!borrado?.length) {
    return responderError(res, new ErrorConMotivo('no_encontrado', 'Contenido de otra Prestadora o inexistente'));
  }
  res.json({ ok: true });
});
