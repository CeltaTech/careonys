import multer from 'multer';
import { ErrorConMotivo } from './errorConMotivo.js';
import { errorDeDocumentos } from './erroresDeDocumentos.js';
import { extensionDeArchivo, rutaDeDocumentoNuevo } from './archivosSubidos.js';
import { fechasDelDocumento } from './estadoDelDocumento.js';

// Cargar un documento del Asistente: lo que tienen en común la carga desde el Panel y la carga
// desde el teléfono. Las dos validan lo mismo contra el tipo de documento —qué fecha lleva, si
// lleva número, quién lo otorga— y suben el archivo al mismo depósito con la misma forma de ruta.
// Escrito dos veces, el día que uno cambie el otro deja pasar lo que el primero frena.
//
// Lo que las separa queda en cada ruta: el Panel guarda el documento aprobado y el archivo es
// opcional; el teléfono lo guarda en revisión, el archivo es obligatorio y no acepta uno vencido.

export const DEPOSITO_DE_DOCUMENTOS = 'documentos-asistente';

// El mismo par que acota el depósito en la base. Acá está para cortar antes de que el archivo
// ocupe memoria del lado de la base (`celtatech/CLAUDE.md` §6, «se valida en el servidor»).
export const TIPOS_DE_ARCHIVO = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'];
export const TAMANO_MAXIMO = 10 * 1024 * 1024;

const recibirArchivo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TAMANO_MAXIMO },
  fileFilter(req, file, cb) {
    if (TIPOS_DE_ARCHIVO.includes(file.mimetype)) return cb(null, true);
    cb(new ErrorConMotivo('archivo_de_documento_invalido', `tipo ${file.mimetype}`));
  },
}).single('archivo');

/** Recibe el formulario con su archivo. Un archivo de otro tipo o más pesado que el tope es 400. */
export function recibirDocumento(req, res, next) {
  recibirArchivo(req, res, (err) => {
    if (!err) return next();
    const motivo = err instanceof ErrorConMotivo ? err : new ErrorConMotivo('archivo_de_documento_invalido', err.message);
    return res.status(400).json({ error: motivo.motivo, motivo: motivo.motivo });
  });
}

const COLUMNAS_DEL_TIPO =
  'id, prestadora_id, nombre, activo, vencimiento, periodo_cantidad, periodo_unidad, lleva_numero';

function textoLimpio(valor) {
  return typeof valor === 'string' && valor.trim() ? valor.trim() : null;
}

/**
 * Lo que se va a guardar de un documento, validado contra su tipo. Tira `ErrorConMotivo` si algo
 * vino mal; devuelve `{ tipo, datos }`, donde `datos` son las columnas propias del documento.
 *
 * El tipo se busca en la Prestadora del Legajo, no en la del pedido: un tipo de otra Prestadora,
 * o uno apagado, es un tipo que para este Asistente no existe.
 */
export async function validarDocumento(db, { prestadoraId, tipoDocumentoId, cuerpo }) {
  const { data: tipo, error } = await db
    .from('tipos_documento_asistente')
    .select(COLUMNAS_DEL_TIPO)
    .eq('id', tipoDocumentoId)
    .eq('prestadora_id', prestadoraId)
    .maybeSingle();
  if (error) throw error;
  if (!tipo || tipo.activo === false) throw new ErrorConMotivo('tipo_de_documento_invalido');

  const fechas = fechasDelDocumento(tipo, cuerpo);
  if (fechas.motivo) throw new ErrorConMotivo(fechas.motivo);

  const numero = textoLimpio(cuerpo.numero);
  if (tipo.lleva_numero && !numero) throw new ErrorConMotivo('numero_requerido');

  const { data: otorgantes, error: errorOtorgantes } = await db
    .from('organismos_por_tipo_documento')
    .select('organismo_id')
    .eq('prestadora_id', prestadoraId)
    .eq('tipo_documento_id', tipo.id);
  if (errorOtorgantes) throw errorOtorgantes;
  const posibles = (otorgantes ?? []).map((fila) => fila.organismo_id);

  let organismoId = textoLimpio(cuerpo.organismo_id);
  if (organismoId && !posibles.includes(organismoId)) throw new ErrorConMotivo('organismo_no_otorga_ese_documento');
  if (!organismoId && posibles.length === 1) organismoId = posibles[0];
  if (!organismoId && posibles.length > 1) throw new ErrorConMotivo('organismo_requerido');

  return {
    tipo,
    fechas,
    datos: {
      tipo_documento_id: tipo.id,
      fecha_emision: fechas.fecha_emision,
      fecha_vencimiento: fechas.fecha_vencimiento,
      numero,
      organismo_id: organismoId,
    },
  };
}

/**
 * Sube el archivo a la carpeta del Legajo, con un nombre que pone el sistema, y devuelve la ruta.
 * Sin reemplazar: el nombre es siempre nuevo, y reemplazar pediría además permiso de cambiar un
 * archivo, que el Asistente no tiene.
 */
export async function subirArchivoDelDocumento(db, { prestadoraId, asistenteId, archivo }) {
  const ruta = rutaDeDocumentoNuevo(prestadoraId, asistenteId, extensionDeArchivo(archivo.mimetype));
  const { error } = await db.storage
    .from(DEPOSITO_DE_DOCUMENTOS)
    .upload(ruta, archivo.buffer, { contentType: archivo.mimetype, upsert: false });
  if (error) throw error;
  return ruta;
}

/** El error de la base sobre un documento, con su motivo si es uno conocido. */
export function errorDeLaBase(error) {
  return errorDeDocumentos(error) ?? error;
}
