import multer from 'multer';
import { extensionDeArchivo } from './archivosSubidos.js';
import { errorDeLaIdentidad } from './cuentasPanel.js';
import { ErrorConMotivo, responderError } from './errorConMotivo.js';
import { alinearConsentimientoPendiente } from './consentimientoPagador.js';
import { frase } from '../i18n/mensajesDelSistema.js';

// El Apoderado de un Cliente: quién firma en nombre del que paga, o por el Paciente en los signos
// vitales. Lo usan el Panel y la aplicación del Cliente, cada uno con su conexión: la de la persona
// del Panel, o la del trabajo de la Prestadora, porque el Cliente no escribe en esa tabla ni en ese
// depósito. En las dos, la base vuelve a comprobar quién pide.
//
// Se nombra una sola vez por Cliente y por función. Nombrar a otro reemplaza al anterior, que deja
// de firmar en el momento; lo que ya firmó sigue vigente.

const DEPOSITO_PODERES = 'poderes';
const FUNCIONES = ['pagos', 'signos_vitales'];
const TIPOS_PERMITIDOS = ['application/pdf', 'image/jpeg', 'image/png'];
const TAMANO_MAXIMO = 10 * 1024 * 1024; // 10 MB

const CLAVES_DE_LOS_TEXTOS = [
  'titulo', 'nombrar', 'quitar', 'quitar_aviso', 'poder', 'nombre', 'apellido', 'cuil',
  'cancelar', 'guardar', 'cargar', 'ver', 'reemplazar', 'aprobar', 'observar', 'motivo',
  'campo_obligatorio', 'estado_falta', 'estado_en_revision', 'estado_aprobado', 'estado_observado',
];

const MOTIVOS_DE_LA_BASE = {
  sin_permiso: 'sin_permiso',
  falta_el_motivo: 'falta_el_motivo',
  faltan_datos: 'faltan_datos',
  no_encontrado: 'no_encontrado',
  numero_no_valido: 'numero_no_valido',
  archivo_invalido: 'faltan_datos',
  documento_no_corresponde: 'numero_no_valido',
};

export function conMotivo(error) {
  const motivo = MOTIVOS_DE_LA_BASE[error?.message];
  return motivo ? new ErrorConMotivo(motivo, error.message) : errorDeLaIdentidad(error, 'persona_autorizada');
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TAMANO_MAXIMO },
  fileFilter(req, file, cb) {
    cb(null, TIPOS_PERMITIDOS.includes(file.mimetype));
  },
});

function manejarErrorDeLaSubida(err, req, res, next) {
  if (err) return responderError(res, new ErrorConMotivo('faltan_datos', err.message));
  next();
}

export const recibirElPoder = [upload.single('archivo'), manejarErrorDeLaSubida];

function exigirFuncion(funcion) {
  if (!FUNCIONES.includes(funcion)) throw new ErrorConMotivo('no_encontrado');
}

// Sólo el del Cliente que paga cambia un consentimiento; el de signos vitales no toca ninguno.
async function alinearSiCorresponde({ db, clienteId, prestadoraId, funcion, cargadoPor }) {
  if (funcion !== 'pagos') return;
  await alinearConsentimientoPendiente({ db, clienteId, prestadoraId, cargadoPor });
}

async function apoderadoVigente({ db, clienteId, prestadoraId, funcion }) {
  const { data, error } = await db
    .from('apoderados')
    .select('id, funcion, estado, motivo_observacion, archivo_url, persona:personas!apoderados_persona_fkey(id, nombre_visible)')
    .eq('prestadora_id', prestadoraId)
    .eq('cliente_id', clienteId)
    .eq('funcion', funcion)
    .is('quitado_en', null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

// Si hay quien firma por el Paciente: un Apoderado de signos vitales con el poder aprobado.
export async function hayApoderadoDeSignosVitales({ db, clienteId, prestadoraId }) {
  const vigente = await apoderadoVigente({ db, clienteId, prestadoraId, funcion: 'signos_vitales' });
  return vigente?.estado === 'aprobado';
}

// Los textos viven en la base y las interfaces no la leen: llegan acá, en el idioma de quien mira y
// con los propios de la Prestadora si los tiene.
function textosDelApoderado({ idioma, prestadoraId }) {
  return Object.fromEntries(
    CLAVES_DE_LOS_TEXTOS.map((clave) => [clave, frase(`apoderado.${clave}`, idioma, {}, prestadoraId)]),
  );
}

export async function estadoDelApoderado({ db, clienteId, prestadoraId, funcion, idioma }) {
  exigirFuncion(funcion);
  const vigente = await apoderadoVigente({ db, clienteId, prestadoraId, funcion });
  const nombre = vigente?.persona?.nombre_visible ?? null;
  return {
    apoderado: vigente
      ? {
          id: vigente.id,
          nombre,
          estado: vigente.estado,
          motivo: vigente.motivo_observacion,
          tienePoder: Boolean(vigente.archivo_url),
        }
      : null,
    textos: textosDelApoderado({ idioma, prestadoraId }),
  };
}

// Sube el archivo, llama a la base y, si la base no lo aceptó, no deja el archivo suelto.
async function conElPoderSubido({ db, clienteId, prestadoraId, funcion, archivo }, guardar) {
  if (!archivo) throw new ErrorConMotivo('faltan_datos');
  const ruta = `${prestadoraId}/${clienteId}/${funcion}/poder-${Date.now()}.${extensionDeArchivo(archivo.mimetype)}`;
  const { error: errorSubida } = await db.storage
    .from(DEPOSITO_PODERES)
    .upload(ruta, archivo.buffer, { contentType: archivo.mimetype, upsert: false });
  if (errorSubida) throw new Error(errorSubida.message);

  const { data, error } = await guardar(ruta);
  if (error) {
    const { error: errorBorrado } = await db.storage.from(DEPOSITO_PODERES).remove([ruta]);
    if (errorBorrado) console.error('No se pudo borrar el poder que no quedó:', errorBorrado.message);
    throw conMotivo(error);
  }
  return data;
}

// `pUsuario` es el Cliente en nombre de quien trabaja la aplicación, y va nulo desde el Panel, donde
// la base ya sabe quién pide. `cargadoPor` es siempre la persona.
export async function nombrarApoderado({ db, clienteId, prestadoraId, funcion, datos, archivo, pUsuario = null, cargadoPor }) {
  exigirFuncion(funcion);
  const { nombre, apellido, cuil } = datos ?? {};
  if (![nombre, apellido, cuil].every((dato) => typeof dato === 'string' && dato.trim())) {
    throw new ErrorConMotivo('faltan_datos');
  }

  const id = await conElPoderSubido({ db, clienteId, prestadoraId, funcion, archivo }, (ruta) =>
    db.rpc('nombrar_apoderado', {
      p_cliente: clienteId,
      p_funcion: funcion,
      p_nombre: nombre.trim(),
      p_apellido: apellido.trim(),
      p_cuil: cuil.trim(),
      p_archivo: ruta,
      p_usuario: pUsuario,
    }));
  await alinearSiCorresponde({ db, clienteId, prestadoraId, funcion, cargadoPor });
  return id;
}

// También es el «Cargar» de un Apoderado al que le falta el poder.
export async function reemplazarPoder({ db, clienteId, prestadoraId, funcion, archivo, pUsuario = null, cargadoPor }) {
  exigirFuncion(funcion);
  const id = await conElPoderSubido({ db, clienteId, prestadoraId, funcion, archivo }, (ruta) =>
    db.rpc('reemplazar_poder_del_apoderado', {
      p_cliente: clienteId,
      p_funcion: funcion,
      p_archivo: ruta,
      p_usuario: pUsuario,
    }));
  await alinearSiCorresponde({ db, clienteId, prestadoraId, funcion, cargadoPor });
  return id;
}

export async function quitarApoderado({ db, clienteId, prestadoraId, funcion, pUsuario = null, cargadoPor }) {
  exigirFuncion(funcion);
  const { data, error } = await db.rpc('quitar_apoderado', {
    p_cliente: clienteId,
    p_funcion: funcion,
    p_usuario: pUsuario,
  });
  if (error) throw conMotivo(error);
  if (data !== true) throw new ErrorConMotivo('no_encontrado');
  await alinearSiCorresponde({ db, clienteId, prestadoraId, funcion, cargadoPor });
}

export async function enlaceDelPoder({ db, clienteId, prestadoraId, funcion }) {
  exigirFuncion(funcion);
  const vigente = await apoderadoVigente({ db, clienteId, prestadoraId, funcion });
  if (!vigente?.archivo_url) throw new ErrorConMotivo('no_encontrado');
  const { data, error } = await db.storage.from(DEPOSITO_PODERES).createSignedUrl(vigente.archivo_url, 60);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

// La administración aprueba u observa. La base comprueba que lo sea.
export async function revisarApoderado({ db, fila, aprobar, motivo = null, cargadoPor }) {
  const { data, error } = await db.rpc('revisar_apoderado', {
    p_id: fila.id,
    p_aprobar: aprobar,
    p_motivo: motivo,
  });
  if (error) throw conMotivo(error);
  if (data !== true) throw new ErrorConMotivo('ya_resuelta');

  await alinearSiCorresponde({
    db,
    clienteId: fila.cliente_id,
    prestadoraId: fila.prestadora_id,
    funcion: fila.funcion,
    cargadoPor,
  });
}
