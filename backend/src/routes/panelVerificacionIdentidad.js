import { Router } from 'express';
import multer from 'multer';
import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import { acotarAPrestadora, exigirOrganizacionActiva } from '../middleware/alcancePrestadora.js';
import { supabase } from '../db/connection.js';
import {
  esFotoDeIdentidad,
  rutaEnElDeposito,
  FOTOS_DE_IDENTIDAD,
  FORMATOS_DE_FOTO,
  TAMANO_MAXIMO_DE_FOTO,
} from '../utils/fotosDeIdentidad.js';
import { responderError } from '../utils/errorConMotivo.js';

// Las dos fotos con las que se verifica la identidad de un Asistente.
//
// QUÉ RESOLVÍA MAL ESTO. La etapa de verificación de identidad compara la foto del documento con
// la foto de la persona (`docs/PRD_03_Reclutamiento.md`), y no había ningún lado donde guardar
// esas dos fotos: quien revisaba las recibía por fuera del producto y marcaba la etapa a mano.
//
// POR QUÉ SUBE POR ACÁ Y NO DERECHO DESDE EL PANEL. El depósito `fotos-identidad` es privado,
// porque adentro hay imágenes de documentos de identidad. Lo escribe y lo lee el backend con la
// llave maestra, después de comprobar de qué Prestadora es el Asistente. Es la misma forma de
// `documentos-cese`. La base tiene políticas para la tabla y para el depósito, pero son más
// estrechas que lo que esta ruta le deja hacer a cada rol (ver el comentario de cada consulta);
// si se adoptan o no se decide aparte.
//
// LO QUE ESTA RUTA NO HACE. No compara las dos caras: eso es dato biométrico, no hay documento
// legal del que sacar la advertencia y no hay proveedor elegido (`docs/SECURITY.md`). Acá las fotos se
// guardan y se muestran; quien las mira decide, y marca la etapa como venía haciéndolo.

export const panelVerificacionIdentidadRouter = Router();

const BUCKET = 'fotos-identidad';
const SEGUNDOS_DE_LA_FIRMA = 60;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TAMANO_MAXIMO_DE_FOTO },
  fileFilter(req, file, cb) {
    cb(null, FORMATOS_DE_FOTO.includes(file.mimetype));
  },
});

async function asistenteDeLaPrestadora(asistenteId, usuarioPanel) {
  // Con la llave maestra: con la credencial de la persona, `coordinador_lee_asistentes_de_su_zona`
  // (interno.coordinador_alcanza_asistente) le deja al Coordinador sólo los de su zona, y
  // `oculta_pendientes_de_conformidad` (RESTRICTIVE, NOT pendiente_conformidad) contesta 404 a
  // todos los roles por el Asistente pendiente. Hasta ahora cualquier rol del Panel alcanzaba a
  // todos los de su Prestadora. Si se acota o no se decide aparte.
  let query = supabase
    .from('asistentes')
    .select('id, prestadora_id')
    .eq('id', asistenteId);
  query = acotarAPrestadora(query, usuarioPanel);
  const { data } = await query.maybeSingle();
  return data;
}

function manejarErrorMulter(err, req, res, next) {
  if (err) {
    return res.status(400).json({ error: 'foto_invalida', motivo: 'foto_invalida' });
  }
  next();
}

panelVerificacionIdentidadRouter.post(
  '/:asistenteId/foto',
  requiereRolPanel,
  exigirOrganizacionActiva,
  upload.single('archivo'),
  manejarErrorMulter,
  async (req, res) => {
    // Qué foto es lo decide una lista cerrada, compartida con la pantalla que la sube
    // (`utils/fotosDeIdentidad.js`). Sin ese corte, el tipo lo escribiría quien manda el pedido y
    // sería él quien decide el nombre del archivo adentro del depósito.
    const { tipo } = req.body ?? {};
    if (!esFotoDeIdentidad(tipo) || !req.file) {
      return res.status(400).json({ error: 'foto_invalida', motivo: 'foto_invalida' });
    }

    const asistente = await asistenteDeLaPrestadora(req.params.asistenteId, req.usuarioPanel);
    if (!asistente) {
      return res.status(404).json({ error: 'asistente_no_encontrado', motivo: 'asistente_no_encontrado' });
    }

    // Con la llave maestra: `fotos_identidad_las_alcanza_quien_administra_o_coordina` le pide al
    // Coordinador que alcance a ese Asistente (interno.coordinador_alcanza_asistente); la ruta sale
    // de la fila ya acotada a la Prestadora de la sesión. Si se acota o no se decide aparte.
    const { error: errorSubida } = await supabase.storage
      .from(BUCKET)
      .upload(rutaEnElDeposito(asistente.prestadora_id, asistente.id, tipo), req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: true,
      });
    if (errorSubida) {
      return responderError(res, errorSubida);
    }

    res.json({ ok: true, tipo });
  },
);

panelVerificacionIdentidadRouter.get(
  '/:asistenteId/fotos',
  requiereRolPanel,
  exigirOrganizacionActiva,
  async (req, res) => {
    const asistente = await asistenteDeLaPrestadora(req.params.asistenteId, req.usuarioPanel);
    if (!asistente) {
      return res.status(404).json({ error: 'asistente_no_encontrado', motivo: 'asistente_no_encontrado' });
    }

    // Las rutas se arman acá con los datos del Asistente, no se lee ninguna que venga en el
    // pedido: así no hay forma de pedir la firma de un archivo de otra Prestadora.
    //
    // Y cuáles están cargadas lo contesta el depósito, no una columna aparte: la ruta se deduce
    // de la Prestadora, el Asistente y el tipo, así que el archivo es la única verdad posible.
    // Una columna que dijera «esta foto está subida» podría decir que sí cuando el archivo ya no
    // está, y entonces la pantalla mostraría un hueco sin explicar por qué.
    //
    // Con la llave maestra, por la misma política del depósito que al subir.
    const firmadas = await Promise.all(FOTOS_DE_IDENTIDAD.map(async (tipo) => {
      const { data } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(rutaEnElDeposito(asistente.prestadora_id, asistente.id, tipo), SEGUNDOS_DE_LA_FIRMA);
      return [tipo, data?.signedUrl ?? null];
    }));

    res.json({ fotos: Object.fromEntries(firmadas) });
  },
);
