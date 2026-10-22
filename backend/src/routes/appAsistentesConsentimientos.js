import { Router } from 'express';
import { requiereRolAsistente } from '../middleware/requiereRolAsistente.js';
import { clienteDelPedido } from '../db/connection.js';
import { normalizarIdioma } from '../i18n/idiomas.js';

// ============================================================================
// Pendiente #102 — consentimiento del Asistente para el registro de su ubicación.
//
// Por qué el texto lo elige el backend y no la pantalla: la fotografía que se
// guarda tiene que ser del texto que la persona realmente leyó. Si el frontend
// mandara el texto, mandaría el que él quiera, y la constancia no valdría nada.
// Acá se busca el texto vigente, se le muestra a la persona y se guarda esa
// misma fila — no una que llegue de afuera.
//
// Y una decisión de diseño que no es técnica: esta pantalla NO bloquea el uso
// de la aplicación. Un consentimiento que hay que dar para poder trabajar no es
// libre, y si no es libre no es válido (ver el análisis en PENDIENTES #102). Se
// puede rechazar, el rechazo se registra, y la persona sigue usando todo lo
// demás con normalidad.
//
// Con la credencial de quien pide: todo entra a la base con `clienteDelPedido(req)`, no
// con la llave maestra. La base sabe qué Asistente pide y le deja ver y escribir sólo
// lo de su propio Legajo, así que ninguna consulta lleva el filtro de la Prestadora de
// la sesión. La Prestadora que se escribe es la del Legajo que la base ya dejó ver.
// ============================================================================

export const appAsistentesConsentimientosRouter = Router();

// Los temas sobre los que hoy se pide consentimiento. Cuando haya más, se
// agregan acá y en el catálogo de la base — no se repite la lista en otro lado.
const CLAVES = ['seguimiento_ubicacion'];

// La modalidad legal con la que se busca el texto en el catálogo. El Asistente
// trabaja siempre como independiente, así que es una sola.
const MODALIDAD = 'autonomo';

// Devuelve { asistente, jurisdiccion, enElTurno } o null si falta algo para poder decidir.
async function contextoDelAsistente(db, usuarioAsistente) {
  const { data: asistente } = await db
    .from('asistentes')
    .select('id, prestadora_id')
    .eq('id', usuarioAsistente.asistenteId)
    .maybeSingle();
  if (!asistente) return null;

  const { data: prestadora } = await db
    .from('prestadoras')
    .select('pais, control_de_ubicacion_en_el_turno')
    .eq('id', asistente.prestadora_id)
    .maybeSingle();
  if (!prestadora?.pais || typeof prestadora.control_de_ubicacion_en_el_turno !== 'boolean') return null;

  return { asistente, jurisdiccion: prestadora.pais, enElTurno: prestadora.control_de_ubicacion_en_el_turno };
}

// Texto vigente para una jurisdicción + tema + modalidad + idioma, y de la forma de tomar la
// ubicación que eligió la Prestadora: cada forma tiene su texto, y el que no depende de la forma
// la tiene vacía. Si no hay fila, devuelve null: sin texto no hay consentimiento posible, y no se
// inventa uno por analogía con otro país (CLAUDE.md §3).
async function textoVigente(db, { jurisdiccion, clave, modalidad, idioma, enElTurno }) {
  const { data } = await db
    .from('textos_consentimiento')
    .select('id, version, idioma, titulo, cuerpo, puntos_clave, es_borrador')
    .eq('jurisdiccion', jurisdiccion)
    .eq('clave', clave)
    .eq('modalidad', modalidad)
    .eq('idioma', idioma)
    .or(`control_de_ubicacion_en_el_turno.is.null,control_de_ubicacion_en_el_turno.eq.${enElTurno}`)
    .is('vigente_hasta', null)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data || null;
}

// Es la puerta de entrada de todo lo demás: lo que se actualiza o se borra después va por el
// identificador que sale de acá, y la base sólo deja ver las decisiones del propio Legajo.
async function decisionViva(db, asistenteId, clave) {
  const { data } = await db
    .from('consentimientos_asistente')
    .select('id, decision, version_mostrada, decidido_at, texto_consentimiento_id, textos_consentimiento(id, version, idioma, titulo, cuerpo, puntos_clave, es_borrador, vigente_hasta, control_de_ubicacion_en_el_turno)')
    .eq('asistente_id', asistenteId)
    .eq('clave', clave)
    .is('retirado_at', null)
    .maybeSingle();
  return data || null;
}

// Si lo que la persona ya aceptó cubre lo que hoy pide la Prestadora, devuelve ese texto; si no,
// null. Lo cubre el mismo texto, y también el de «Viaje y turno» cuando la Prestadora pasó a «Sólo
// viaje»: aceptó algo más amplio, y no se le vuelve a preguntar.
function textoQueLoCubre(decision, texto, enElTurno) {
  if (!decision || decision.decision !== 'otorgado') return null;
  if (decision.texto_consentimiento_id === texto.id) return texto;
  const aceptado = decision.textos_consentimiento;
  if (
    aceptado &&
    !aceptado.es_borrador &&
    aceptado.vigente_hasta === null &&
    aceptado.control_de_ubicacion_en_el_turno === true &&
    enElTurno === false
  ) {
    return aceptado;
  }
  return null;
}

// ============================================================================
// GET / — qué se le tiene que preguntar a esta persona, y qué contestó ya.
//
// "pendiente" es true cuando todavía no decidió, o cuando decidió sobre una
// versión del texto que quedó vieja: si el alcance cambió, el sí anterior no
// cubre el nuevo y hay que volver a preguntar.
// ============================================================================
appAsistentesConsentimientosRouter.get('/', requiereRolAsistente, async (req, res) => {
  const idioma = normalizarIdioma(req.query.idioma);
  const db = clienteDelPedido(req);
  const contexto = await contextoDelAsistente(db, req.usuarioAsistente);
  if (!contexto) {
    return res.status(404).json({ error: 'Perfil no encontrado' });
  }

  const modalidad = MODALIDAD;
  const items = [];

  for (const clave of CLAVES) {
    const texto = await textoVigente(db, {
      jurisdiccion: contexto.jurisdiccion,
      clave,
      modalidad,
      idioma,
      enElTurno: contexto.enElTurno,
    });
    // Sin texto para esta jurisdicción no hay nada que preguntar. No es un
    // error: es el caso normal de un país sin documento legal cargado.
    if (!texto) continue;

    const decision = await decisionViva(db, contexto.asistente.id, clave);
    // Cada persona ve lo que firmó: si lo aceptado cubre lo de hoy, se muestra eso.
    const cubierto = textoQueLoCubre(decision, texto, contexto.enElTurno);
    const mostrado = cubierto || texto;
    items.push({
      clave,
      modalidad,
      jurisdiccion: contexto.jurisdiccion,
      texto: {
        id: mostrado.id,
        version: mostrado.version,
        idioma: mostrado.idioma,
        titulo: mostrado.titulo,
        cuerpo: mostrado.cuerpo,
        puntos_clave: mostrado.puntos_clave || [],
        es_borrador: mostrado.es_borrador,
      },
      decision: decision
        ? {
            valor: decision.decision,
            version_mostrada: decision.version_mostrada,
            decidido_at: decision.decidido_at,
            desactualizada: !cubierto && decision.decision === 'otorgado',
          }
        : null,
      pendiente: !decision || (decision.decision === 'otorgado' ? !cubierto : decision.texto_consentimiento_id !== texto.id),
    });
  }

  res.json({ consentimientos: items });
});

// ============================================================================
// POST / — registrar la decisión.
//
// Guarda la fotografía del texto exacto. Si ya había una decisión viva sobre
// otra versión, se la retira primero: la fila anterior no se pisa ni se borra,
// porque hace falta poder demostrar qué hubo vigente entre qué fechas.
// ============================================================================
appAsistentesConsentimientosRouter.post('/', requiereRolAsistente, async (req, res) => {
  const { clave, decision } = req.body || {};
  const idioma = normalizarIdioma(req.body?.idioma);

  if (!CLAVES.includes(clave)) {
    return res.status(400).json({ error: 'Consentimiento desconocido' });
  }
  if (!['otorgado', 'rechazado'].includes(decision)) {
    return res.status(400).json({ error: 'Decisión no válida' });
  }

  const db = clienteDelPedido(req);
  const contexto = await contextoDelAsistente(db, req.usuarioAsistente);
  if (!contexto) {
    return res.status(404).json({ error: 'Perfil no encontrado' });
  }

  const modalidad = MODALIDAD;
  const texto = await textoVigente(db, {
    jurisdiccion: contexto.jurisdiccion,
    clave,
    modalidad,
    idioma,
    enElTurno: contexto.enElTurno,
  });
  if (!texto) {
    return res.status(409).json({ error: 'Todavía no hay texto de consentimiento para este país' });
  }

  const viva = await decisionViva(db, contexto.asistente.id, clave);
  if (viva) {
    if (viva.texto_consentimiento_id === texto.id && viva.decision === decision) {
      return res.json({ ok: true, sin_cambios: true });
    }
    // Solo un 'otorgado' se puede retirar (lo dice la restricción de la tabla).
    // Un 'rechazado' que cambia de opinión se reemplaza borrando el anterior:
    // no hay nada que preservar, nunca autorizó nada.
    if (viva.decision === 'otorgado') {
      const { error } = await db
        .from('consentimientos_asistente')
        .update({ retirado_at: new Date().toISOString(), motivo_retiro: 'reemplazado_por_decision_nueva' })
        .eq('id', viva.id);
      if (error) return res.status(500).json({ error: 'No se pudo registrar la decisión' });
    } else {
      const { error } = await db
        .from('consentimientos_asistente')
        .delete()
        .eq('id', viva.id);
      if (error) return res.status(500).json({ error: 'No se pudo registrar la decisión' });
    }
  }

  const { error } = await db.from('consentimientos_asistente').insert({
    prestadora_id: contexto.asistente.prestadora_id,
    asistente_id: contexto.asistente.id,
    clave,
    texto_consentimiento_id: texto.id,
    version_mostrada: texto.version,
    idioma_mostrado: texto.idioma,
    texto_mostrado: texto.cuerpo,
    decision,
  });
  if (error) {
    return res.status(500).json({ error: 'No se pudo registrar la decisión' });
  }

  res.json({ ok: true });
});

// ============================================================================
// POST /retirar — la ley exige que se pueda retirar, así que existe la ruta.
//
// No borra la fila: le pone fecha de retiro. Desde ese instante
// consentimiento_seguimiento_vigente() devuelve false para esta persona.
// ============================================================================
appAsistentesConsentimientosRouter.post('/retirar', requiereRolAsistente, async (req, res) => {
  const { clave, motivo } = req.body || {};
  if (!CLAVES.includes(clave)) {
    return res.status(400).json({ error: 'Consentimiento desconocido' });
  }

  const db = clienteDelPedido(req);
  const viva = await decisionViva(db, req.usuarioAsistente.asistenteId, clave);
  if (!viva || viva.decision !== 'otorgado') {
    return res.status(409).json({ error: 'No hay un consentimiento vigente para retirar' });
  }

  // Se comprueba que la fila se haya escrito de verdad. La lectura de arriba pasó hace un
  // instante, pero acá se contesta "listo, retirado" y eso es lo que la persona se lleva: si no
  // quedó escrito, no se le puede decir que sí. Un consentimiento que alguien cree retirado y
  // sigue vigente es exactamente lo que la ley no perdona.
  const { data: retirado, error } = await db
    .from('consentimientos_asistente')
    .update({
      retirado_at: new Date().toISOString(),
      motivo_retiro: typeof motivo === 'string' && motivo.trim() ? motivo.trim().slice(0, 500) : null,
    })
    .eq('id', viva.id)
    .is('retirado_at', null)
    .select('id');

  if (error) {
    return res.status(500).json({ error: 'No se pudo retirar el consentimiento' });
  }
  if (!retirado?.length) {
    return res.status(409).json({ error: 'No hay un consentimiento vigente para retirar' });
  }

  res.json({ ok: true });
});
