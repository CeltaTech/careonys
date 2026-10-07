import { Router } from 'express';
import multer from 'multer';
import { requiereRolAsistente } from '../middleware/requiereRolAsistente.js';
import { clienteDelPedido, supabase } from '../db/connection.js';
import { exigeVisible } from '../utils/visibilidadPrestadora.js';
import { esRutaDeMatriculaDe, extensionDeArchivo, rutaDeMatriculaNueva } from '../utils/archivosSubidos.js';
import { responderError } from '../utils/errorConMotivo.js';

// ============================================================================
// La Matrícula, vista desde el teléfono del Asistente.
//
// POR QUÉ EXISTE ESTA PANTALLA
// Sin Matrícula vigente, la base no deja que el Asistente atienda a nadie. Si
// eso pasa y él no se entera, lo único que ve es que dejaron de ofrecerle
// guardias, sin ningún motivo a la vista. La regla dice que nunca se bloquea en
// silencio, y el lugar donde ese mensaje llega de verdad es el teléfono, no una
// pantalla del Panel que él no usa.
//
// Y el papel lo tiene él. Pedirle a la oficina que lo consiga es hacer trabajo
// de más para todos.
//
// LO QUE ACÁ NO SE PUEDE HACER, A PROPÓSITO
// El Asistente carga, y nada más. No verifica, no edita y no borra.
//
//   · Verificar es de la Prestadora. Toda Matrícula que llega por acá queda
//     marcada con `cargada_por_el_asistente`, y esa marca hace que la base le
//     exija verificación aunque la Prestadora esté en modo flexible. Si no
//     fuera así, cualquiera podría escribir un número inventado y habilitarse
//     solo: el interesado no se aprueba a sí mismo.
//   · Editar o borrar tampoco. Una Matrícula es una constancia de un momento;
//     si se pudiera cambiar después, no serviría como constancia de nada. Se
//     corrige cargando la nueva, que es lo que pasa en la vida real cuando el
//     organismo emite una renovación.
//
// CON LA CREDENCIAL DE QUIEN PIDE
// Las consultas a la base entran con `clienteDelPedido(req)`, no con la llave
// maestra: la base le contesta al Asistente sólo lo suyo. Por eso ninguna de
// ellas lleva el filtro de la Prestadora de la sesión.
//
// EL DEPÓSITO SIGUE CON LA LLAVE MAESTRA
// Subir el archivo y generar el enlace temporal van con la llave maestra, y la ruta se
// comprueba a mano con `utils/archivosSubidos.js`: las políticas del depósito
// piden que la carpeta sea el usuario de la sesión, y la ruta la arma el Legajo
// del Asistente (ver el comentario de cada llamada).
// ============================================================================

export const appAsistentesMatriculaRouter = Router();

const BUCKET = 'prescripciones-medicacion';

const TIPOS_ARCHIVO_PERMITIDOS = ['application/pdf', 'image/jpeg', 'image/png'];
const TAMANO_MAXIMO = 10 * 1024 * 1024; // 10 MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TAMANO_MAXIMO },
  fileFilter(req, file, cb) {
    cb(null, TIPOS_ARCHIVO_PERMITIDOS.includes(file.mimetype));
  },
});

function manejarErrorMulter(err, req, res, next) {
  if (err) {
    return res.status(400).json({ error: 'Archivo faltante o de tipo no permitido (solo PDF, JPG o PNG, hasta 10 MB)' });
  }
  next();
}

// Lo que la base ya resolvió sobre este Asistente. Se piden solo las columnas
// que la pantalla del teléfono necesita: `modo_control_matricula` es una
// decisión interna de la Prestadora y no tiene por qué salir de ahí.
const COLUMNAS_ESTADO =
  'asistente_id, requiere_matricula, tipo_matricula, motivo_bloqueo, matricula_id, vigente_hasta, verificada_at, dias_para_vencer';

// La vista se lee con los permisos de quien pide, así que la base ya la acota a
// la Prestadora de la sesión.
async function estadoDelAsistente(db, asistenteId) {
  const { data } = await db
    .from('estado_matricula_asistente')
    .select(COLUMNAS_ESTADO)
    .eq('asistente_id', asistenteId)
    .maybeSingle();
  return data ?? null;
}

// ---------------------------------------------------------------------------
// Cómo está mi Matrícula
// ---------------------------------------------------------------------------

appAsistentesMatriculaRouter.get('/', requiereRolAsistente, async (req, res) => {
  const db = clienteDelPedido(req);
  const estado = await estadoDelAsistente(db, req.usuarioAsistente.asistenteId);

  // Con cuántos días de anticipación avisa esta Prestadora. Es el mismo número
  // que usa para los demás papeles que vencen: dos ventanas distintas para la
  // misma idea terminan siempre desalineadas (CLAUDE.md §7.12).
  const { data: prestadora } = await db
    .from('prestadoras')
    .select('dias_aviso_vencimiento_documentos')
    .eq('id', req.usuarioAsistente.prestadoraId)
    .maybeSingle();

  const { data: matriculas, error } = await db
    .from('matriculas_asistente')
    .select('id, tipo, numero_matricula, vigente_desde, vigente_hasta, archivo_url, verificada_at, cargada_por_el_asistente, created_at')
    .eq('asistente_id', req.usuarioAsistente.asistenteId)
    .order('vigente_desde', { ascending: false });
  if (error) return responderError(res, error);

  res.json({
    estado,
    matriculas: matriculas ?? [],
    diasAviso: prestadora?.dias_aviso_vencimiento_documentos ?? null,
  });
});

// ---------------------------------------------------------------------------
// Cargar la Matrícula
//
// Llega en un solo envío —los datos y el archivo juntos— para que no pueda
// quedar a mitad de camino: un archivo subido sin su fila sería un papel
// suelto en el depósito que nadie va a mirar nunca.
//
// Hay Prestadoras que prefieren recibir el papel por la oficina y cargarlo
// ellas. Por eso la carga desde el teléfono se puede apagar (tarea 65). Ver
// cómo está la propia Matrícula no se apaga nunca: si la base lo está frenando
// para trabajar, tiene derecho a saber por qué.
// ---------------------------------------------------------------------------

appAsistentesMatriculaRouter.post(
  '/',
  requiereRolAsistente,
  exigeVisible('asistente_carga_su_matricula'),
  upload.single('archivo'),
  manejarErrorMulter,
  async (req, res) => {
    const { numeroMatricula, vigenteDesde, vigenteHasta } = req.body;

    const db = clienteDelPedido(req);
    const estado = await estadoDelAsistente(db, req.usuarioAsistente.asistenteId);
    // El tipo no lo elige el Asistente: lo dice su tipo de Asistente en el
    // catálogo. Dejarlo elegir sería dejarlo cargar la Matrícula equivocada y
    // seguir trabado sin entender por qué.
    if (!estado || estado.requiere_matricula !== true || !estado.tipo_matricula) {
      return res.status(400).json({ error: 'Este tipo de Asistente no requiere matrícula' });
    }
    if (!vigenteDesde) {
      return res.status(400).json({ error: 'Falta la fecha desde la que vale la matrícula' });
    }

    // La Prestadora con la que se arma la ruta y se da el alta es la del Legajo que la base ya
    // le dejó ver, no un dato del pedido.
    const { data: asistente } = await db
      .from('asistentes')
      .select('id, prestadora_id')
      .eq('id', req.usuarioAsistente.asistenteId)
      .maybeSingle();
    if (!asistente) return res.status(404).json({ error: 'Asistente no encontrado' });

    let archivoUrl = null;
    if (req.file) {
      const ruta = rutaDeMatriculaNueva(asistente.prestadora_id, asistente.id, extensionDeArchivo(req.file.mimetype));
      // Con la llave maestra: `prescripciones_asistente_sube_su_matricula` exige
      // (storage.foldername(name))[3] = auth.uid(), y la ruta lleva el identificador de la
      // Legajo del Asistente, que para todo Legajo nuevo es distinto del de su usuario; con la
      // credencial de la persona la subida se rechaza. Si se cambia la ruta o la política se
      // decide aparte. La ruta la arma `rutaDeMatriculaNueva` con la Prestadora del Legajo.
      const { error: errorSubida } = await supabase.storage
        .from(BUCKET)
        .upload(ruta, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
      if (errorSubida) return responderError(res, errorSubida);
      archivoUrl = ruta;
    }

    const { error } = await db.from('matriculas_asistente').insert({
      prestadora_id: asistente.prestadora_id,
      asistente_id: asistente.id,
      tipo: estado.tipo_matricula,
      numero_matricula: numeroMatricula || null,
      vigente_desde: vigenteDesde,
      vigente_hasta: vigenteHasta || null,
      archivo_url: archivoUrl,
      registrado_por: req.usuarioAsistente.id,
      cargada_por_el_asistente: true,
    });
    if (error) return responderError(res, error);

    res.json({
      estado: await estadoDelAsistente(db, req.usuarioAsistente.asistenteId),
    });
  }
);

// ---------------------------------------------------------------------------
// Ver el archivo que subí
//
// El enlace dura un minuto y se arma acá, nunca en el teléfono: si la dirección
// del depósito quedara escrita en la pantalla, cualquiera que la copie entra al
// archivo de cualquier otro.
// ---------------------------------------------------------------------------

appAsistentesMatriculaRouter.get('/archivo-url', requiereRolAsistente, async (req, res) => {
  // Quién puede ver qué archivo lo decide `utils/archivosSubidos.js`, que es el mismo archivo
  // que arma la ruta al subirlo. Separadas, la comprobación y la construcción se despegan sin
  // que nadie lo note, y lo que queda abierto es un enlace temporal a un archivo ajeno.
  const ruta = req.query.ruta;
  if (!esRutaDeMatriculaDe(ruta, req.usuarioAsistente.prestadoraId, req.usuarioAsistente.asistenteId)) {
    return res.status(400).json({ error: 'Ruta de archivo inválida' });
  }

  // Con la llave maestra: `prescripciones_asistente_lee_su_matricula` exige
  // (storage.foldername(name))[3] = auth.uid(), y la carpeta es el identificador del Legajo,
  // no el del usuario; con la credencial de la persona el Asistente no podría abrir su propio
  // archivo. Si se cambia la ruta o la política se decide aparte.
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(ruta, 60);
  if (error) return responderError(res, error);

  res.json({ url: data.signedUrl });
});
