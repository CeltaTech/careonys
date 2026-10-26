import { paraCadaPrestadora } from '../db/connection.js';
import { notificarCoordinador } from './whatsapp.js';
import { DIAS_AVISO_POR_DEFECTO, fechaLimiteDeAviso, ventanaDeAviso } from './reglaVencimientos.js';
import { ESTADO_VISIBLE, estadoVisible } from './estadoDelDocumento.js';
import { avisarDocumentoAlAsistente } from './avisoDeDocumento.js';
import { mensajeDelSistema } from '../i18n/avisos.js';
import { idiomaDeLaPrestadora } from '../i18n/idiomaDeLaPrestadora.js';

const TRABAJO = 'vencimientos de documentos';
const EVENTO_VENCIMIENTO_DOCUMENTO = 'vencimiento_documento_asistente';

// La frase que recibe el Asistente según cómo esté su documento.
const CLAVE_POR_CLASE = {
  por_vencer: 'documento_por_vencer',
  vencido: 'documento_vencido',
};

// Revisa una vez por día los documentos aprobados de cada Prestadora que vencen dentro de su
// ventana de aviso, o que ya vencieron, y avisa a dos personas distintas:
//
// - a la Prestadora, con un mensaje por tipo de documento que junta a todos sus Asistentes;
// - al Asistente, en su teléfono, una sola vez por documento y por clase —«por vencer» y
//   «vencido»—. Lo que ya se le mandó queda anotado en `avisos_de_documento_enviados`, y la base
//   no deja anotarlo dos veces.
//
// De a una Prestadora por vez, con la credencial del trabajo sin persona: la base sólo le
// contesta lo de esa Prestadora.
export async function revisarVencimientos() {
  await paraCadaPrestadora(TRABAJO, revisarLaPrestadora);
}

async function revisarLaPrestadora(prestadoraId, db) {
  const { data: prestadora, error: errorPrestadora } = await db
    .from('prestadoras')
    .select('dias_aviso_vencimiento_documentos')
    .eq('id', prestadoraId)
    .maybeSingle();
  if (errorPrestadora) {
    console.error(`${TRABAJO}: no se pudo leer la Prestadora ${prestadoraId}:`, errorPrestadora.message);
    return;
  }

  // Con cuántos días avisa esta Prestadora y hasta qué día hay que mirar: la misma cuenta que
  // hacen el Panel y la aplicación del Asistente, en `reglaVencimientos.js`.
  const diasAviso = prestadora?.dias_aviso_vencimiento_documentos ?? DIAS_AVISO_POR_DEFECTO;
  const anticipacion = ventanaDeAviso(diasAviso);
  const limiteISO = fechaLimiteDeAviso(anticipacion);

  // La vista ya deja afuera los tipos apagados, los Legajos borrados y los documentos que no se le
  // piden a ese Asistente, y trae sólo el último que cargó de cada tipo.
  const { data: documentos, error } = await db
    .from('documentos_pedidos_al_asistente')
    .select('asistente_id, tipo_documento_id, nombre, documento_id, estado, fecha_vencimiento')
    .eq('prestadora_id', prestadoraId)
    .eq('estado', 'aprobado')
    .not('fecha_vencimiento', 'is', null)
    .lte('fecha_vencimiento', limiteISO);
  if (error) {
    console.error(`${TRABAJO}: no se pudieron leer los documentos de ${prestadoraId}:`, error.message);
    return;
  }
  if (!documentos?.length) return;

  const idsDeAsistentes = [...new Set(documentos.map((d) => d.asistente_id))];
  const { data: asistentes, error: errorAsistentes } = await db
    .from('asistentes')
    .select('id, nombre, estado')
    .eq('prestadora_id', prestadoraId)
    .in('id', idsDeAsistentes);
  if (errorAsistentes) {
    console.error(`${TRABAJO}: no se pudieron leer los Asistentes de ${prestadoraId}:`, errorAsistentes.message);
    return;
  }
  const activos = new Map(
    (asistentes ?? []).filter((a) => a.estado === 'activo').map((a) => [a.id, a.nombre]),
  );
  const aAvisar = documentos.filter((d) => activos.has(d.asistente_id));
  if (!aAvisar.length) return;

  const idioma = await idiomaDeLaPrestadora(db, prestadoraId);

  await avisarALaPrestadora(prestadoraId, idioma, anticipacion, aAvisar, activos);
  await avisarALosAsistentes(db, prestadoraId, idioma, diasAviso, aAvisar);
}

// Un mensaje por tipo de documento. El nombre del tipo viene del catálogo de la Prestadora y sale
// tal cual.
async function avisarALaPrestadora(prestadoraId, idioma, anticipacion, documentos, nombres) {
  const porTipo = new Map();
  for (const d of documentos) {
    if (!porTipo.has(d.tipo_documento_id)) porTipo.set(d.tipo_documento_id, { etiqueta: d.nombre, lista: [] });
    porTipo.get(d.tipo_documento_id).lista.push({
      nombre: nombres.get(d.asistente_id),
      fechaVencimiento: d.fecha_vencimiento,
    });
  }

  for (const { etiqueta, lista } of porTipo.values()) {
    try {
      // Por el canal que la Prestadora haya elegido para este mensaje: con WhatsApp encendido y
      // una plantilla aprobada sale por ahí, y si no, por correo. Nunca por los dos.
      await notificarCoordinador({
        evento: EVENTO_VENCIMIENTO_DOCUMENTO,
        prestadoraId,
        ...mensajeDelSistema('vencimiento_documentos', idioma, {
          etiqueta,
          dias: anticipacion,
          documentos: lista,
        }),
      });
    } catch (err) {
      console.error(`${TRABAJO}: no salió el aviso (${etiqueta}) de ${prestadoraId}:`, err.message);
    }
  }
}

// Al teléfono de cada Asistente, una vez por documento y por clase.
async function avisarALosAsistentes(db, prestadoraId, idioma, diasAviso, documentos) {
  const hoy = new Date();
  const conClase = documentos
    .map((d) => {
      const estado = estadoVisible(d, diasAviso, hoy);
      const clase = estado === ESTADO_VISIBLE.VENCIDO ? 'vencido' : estado === ESTADO_VISIBLE.POR_VENCER ? 'por_vencer' : null;
      return clase ? { ...d, clase } : null;
    })
    .filter(Boolean);
  if (!conClase.length) return;

  const { data: enviados, error } = await db
    .from('avisos_de_documento_enviados')
    .select('documento_id, clase')
    .eq('prestadora_id', prestadoraId)
    .in('documento_id', [...new Set(conClase.map((d) => d.documento_id))]);
  if (error) {
    // Sin saber qué ya salió, no se manda nada: repetir un aviso es peor que mandarlo mañana.
    console.error(`${TRABAJO}: no se pudo saber qué avisos ya salieron en ${prestadoraId}:`, error.message);
    return;
  }
  const yaSalio = new Set((enviados ?? []).map((e) => `${e.documento_id}:${e.clase}`));

  for (const d of conClase) {
    if (yaSalio.has(`${d.documento_id}:${d.clase}`)) continue;

    // Primero se anota, después se manda: si dos corridas se cruzan, la base deja anotar a una
    // sola, y sólo esa avisa.
    const { error: errorAnotar } = await db
      .from('avisos_de_documento_enviados')
      .insert({ prestadora_id: prestadoraId, documento_id: d.documento_id, clase: d.clase });
    if (errorAnotar) {
      if (errorAnotar.code !== '23505') {
        console.error(`${TRABAJO}: no se pudo anotar el aviso del documento ${d.documento_id}:`, errorAnotar.message);
      }
      continue;
    }

    const salio = await avisarDocumentoAlAsistente(db, {
      prestadoraId,
      asistenteId: d.asistente_id,
      clave: CLAVE_POR_CLASE[d.clase],
      documento: d.nombre,
      fecha: d.fecha_vencimiento,
      idioma,
    });

    // Si no salió, se saca la anotación: la corrida de mañana lo vuelve a intentar.
    if (!salio) {
      const { error: errorSacar } = await db
        .from('avisos_de_documento_enviados')
        .delete()
        .eq('prestadora_id', prestadoraId)
        .eq('documento_id', d.documento_id)
        .eq('clase', d.clase);
      if (errorSacar) {
        console.error(`${TRABAJO}: no se pudo sacar la anotación del aviso del documento ${d.documento_id}:`, errorSacar.message);
      }
    }
  }
}
