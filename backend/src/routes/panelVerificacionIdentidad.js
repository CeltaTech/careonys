import { Router } from 'express';
import multer from 'multer';
import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import { exigirOrganizacionActiva } from '../middleware/alcancePrestadora.js';
import { clienteDelPedido } from '../db/connection.js';
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
// credencial de quien pide (`clienteDelPedido(req)`), y es la base la que decide: la
// administración alcanza a todos los Asistentes de su Prestadora, el Coordinador sólo a los de su
// zona, y nadie al Asistente pendiente de conformidad.
//
// LO QUE ESTA RUTA NO HACE. No compara las dos caras: eso es dato biométrico, no hay documento
// legal del que sacar la advertencia y no hay proveedor elegido (`docs/SECURITY.md`). Acá las fotos se
// guardan y se muestran; quien las mira decide, y marca la etapa como venía haciéndolo.

export const panelVerificacionIdentidadRouter = Router();

const BUCKET = 'fotos-identidad';
const SEGUNDOS_DEL_ENLACE_TEMPORAL = 60;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TAMANO_MAXIMO_DE_FOTO },
  fileFilter(req, file, cb) {
    cb(null, FORMATOS_DE_FOTO.includes(file.mimetype));
  },
});

// Si la base no lo deja ver, para quien pregunta no existe.
async function asistenteVisible(db, asistenteId) {
  const { data } = await db
    .from('asistentes')
    .select('id, prestadora_id')
    .eq('id', asistenteId)
    .maybeSingle();
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

    const db = clienteDelPedido(req);
    const asistente = await asistenteVisible(db, req.params.asistenteId);
    if (!asistente) {
      return res.status(404).json({ error: 'asistente_no_encontrado', motivo: 'asistente_no_encontrado' });
    }

    // La ruta sale de la fila que la base ya dejó ver, no del pedido.
    const { error: errorSubida } = await db.storage
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
    const db = clienteDelPedido(req);
    const asistente = await asistenteVisible(db, req.params.asistenteId);
    if (!asistente) {
      return res.status(404).json({ error: 'asistente_no_encontrado', motivo: 'asistente_no_encontrado' });
    }

    // Las rutas se arman acá con los datos del Asistente, no se lee ninguna que venga en el
    // pedido: así no hay forma de pedir un enlace temporal a un archivo de otra Prestadora.
    //
    // Y cuáles están cargadas lo contesta el depósito, no una columna aparte: la ruta se deduce
    // de la Prestadora, el Asistente y el tipo, así que el archivo es la única verdad posible.
    // Una columna que dijera «esta foto está subida» podría decir que sí cuando el archivo ya no
    // está, y entonces la pantalla mostraría un hueco sin explicar por qué.
    const enlaces = await Promise.all(FOTOS_DE_IDENTIDAD.map(async (tipo) => {
      const { data } = await db.storage
        .from(BUCKET)
        .createSignedUrl(rutaEnElDeposito(asistente.prestadora_id, asistente.id, tipo), SEGUNDOS_DEL_ENLACE_TEMPORAL);
      return [tipo, data?.signedUrl ?? null];
    }));

    res.json({ fotos: Object.fromEntries(enlaces) });
  },
);
