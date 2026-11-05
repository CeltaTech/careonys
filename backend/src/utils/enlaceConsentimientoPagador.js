import crypto from 'crypto';
import { enLaPrestadora } from '../db/connection.js';
import { IDENTIDAD } from '../config/identidadProducto.js';
import { diasDeValidezDelEnlaceDeActivacion } from '../config/enlaceDeActivacion.js';
import { mensajeDelSistema } from '../i18n/avisos.js';
import { idiomaDeLaPrestadora } from '../i18n/idiomaDeLaPrestadora.js';
import { idiomaDelDestinatario } from '../i18n/idiomas.js';
import { frase } from '../i18n/mensajesDelSistema.js';
import { DEPOSITO_PAGADOR } from './consentimientoPagador.js';
import { enlaceConCodigo } from './direccionDeLaPrestadora.js';
import { enviarEmail } from './email.js';
import { ErrorConMotivo } from './errorConMotivo.js';
import { marcaDeLaPrestadora } from './marcaPrestadora.js';
import { verificadorDelEnlace } from './verificadorDelEnlace.js';

// El documento del que paga se firma con un enlace que llega por email: quien lo recibe lo lee, lo
// firma y, con el mismo enlace, vuelve a verlo y lo descarga. No hace falta cuenta, así que todo
// corre con el trabajo de la Prestadora y el enlace se busca sólo adentro de ella. De la base se
// guarda el identificador de verificación del enlace, nunca el enlace.

const TRABAJO = 'documento para firmar';
const UN_DIA_MS = 24 * 60 * 60 * 1000;
const SEGUNDOS_DEL_ENLACE_TEMPORAL = 60;

// Manda el enlace y deja de servir el anterior: vale sólo el último.
export async function enviarDocumentoParaFirmar({ consentimientoId, prestadoraId, email }) {
  const token = crypto.randomBytes(32).toString('base64url');
  const link = await enlaceConCodigo({
    appUrl: process.env.PWA_CLIENTES_URL,
    pantalla: 'documento-para-firmar',
    prestadoraId,
    codigo: token,
  });
  if (!link) throw new Error('No se pudo armar el enlace del documento para firmar');

  const ahora = new Date().toISOString();
  const expiraEn = new Date(Date.now() + diasDeValidezDelEnlaceDeActivacion() * UN_DIA_MS).toISOString();

  const idioma = await enLaPrestadora(prestadoraId, TRABAJO, async (db) => {
    const { data: nuevo, error } = await db
      .from('enlaces_consentimiento_pagador')
      .insert({
        prestadora_id: prestadoraId,
        consentimiento_id: consentimientoId,
        verificador: verificadorDelEnlace(token),
        expira_en: expiraEn,
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);

    const { error: errorAnteriores } = await db
      .from('enlaces_consentimiento_pagador')
      .update({ expira_en: ahora })
      .eq('prestadora_id', prestadoraId)
      .eq('consentimiento_id', consentimientoId)
      .gt('expira_en', ahora)
      .neq('id', nuevo.id);
    if (errorAnteriores) throw new Error(errorAnteriores.message);

    return idiomaDelDestinatario(null, await idiomaDeLaPrestadora(db, prestadoraId));
  });

  const textos = mensajeDelSistema(
    'documento_para_firmar',
    idioma,
    { link, producto: IDENTIDAD.nombre },
    prestadoraId,
  );
  await enviarEmail({ to: email, asunto: textos.asunto, texto: textos.texto, formato: textos.html, prestadoraId });
}

// El consentimiento al que lleva el enlace. Un enlace que no existe y uno de un documento anulado
// dan lo mismo: quien llega no tiene nada que hacer ahí.
async function consentimientoDelEnlace(db, prestadoraId, token) {
  if (typeof token !== 'string' || !token) throw new ErrorConMotivo('token_invalido');

  const { data: enlace, error } = await db
    .from('enlaces_consentimiento_pagador')
    .select('consentimiento_id, expira_en')
    .eq('prestadora_id', prestadoraId)
    .eq('verificador', verificadorDelEnlace(token))
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!enlace) throw new ErrorConMotivo('token_invalido');
  if (new Date(enlace.expira_en) <= new Date()) throw new ErrorConMotivo('token_vencido');

  const { data: consentimiento, error: errorConsentimiento } = await db
    .from('consentimientos_pagador')
    .select('id, estado, documento_texto, archivo_firmado_url')
    .eq('prestadora_id', prestadoraId)
    .eq('id', enlace.consentimiento_id)
    .maybeSingle();
  if (errorConsentimiento) throw new Error(errorConsentimiento.message);
  if (!consentimiento || consentimiento.estado === 'anulado') throw new ErrorConMotivo('token_invalido');

  return consentimiento;
}

export async function leerDocumento({ prestadoraId, token, idioma }) {
  const consentimiento = await enLaPrestadora(prestadoraId, TRABAJO, (db) =>
    consentimientoDelEnlace(db, prestadoraId, token),
  );
  const marca = await marcaDeLaPrestadora(prestadoraId);

  return {
    texto: consentimiento.documento_texto,
    firmado: consentimiento.estado === 'cerrado',
    tieneArchivo: Boolean(consentimiento.archivo_firmado_url),
    marca: { nombre: marca?.nombre ?? null, logoUrl: marca?.logoUrl ?? null },
    textos: {
      firmar: frase('documento_para_firmar.firmar', idioma, {}, prestadoraId),
      descargar: frase('documento_para_firmar.descargar', idioma, {}, prestadoraId),
    },
  };
}

// Si ya estaba firmado no queda nada por hacer, y no es un error: quien tocó dos veces ve lo firmado.
export async function firmarDocumento({ prestadoraId, token, idioma }) {
  await enLaPrestadora(prestadoraId, TRABAJO, async (db) => {
    const consentimiento = await consentimientoDelEnlace(db, prestadoraId, token);
    if (consentimiento.estado !== 'pendiente_firma') return;

    const { error } = await db
      .from('consentimientos_pagador')
      .update({
        estado: 'cerrado',
        cerrado_como: 'firmado_con_el_enlace',
        cerrado_en: new Date().toISOString(),
      })
      .eq('prestadora_id', prestadoraId)
      .eq('id', consentimiento.id)
      .eq('estado', 'pendiente_firma');
    if (error) throw new Error(error.message);
  });

  return leerDocumento({ prestadoraId, token, idioma });
}

// El archivo firmado, cuando se firmó a mano y se subió. Mientras esté sin firmar no hay nada que bajar.
export async function enlaceDeDescarga({ prestadoraId, token }) {
  return enLaPrestadora(prestadoraId, TRABAJO, async (db) => {
    const consentimiento = await consentimientoDelEnlace(db, prestadoraId, token);
    if (consentimiento.estado !== 'cerrado' || !consentimiento.archivo_firmado_url) {
      throw new ErrorConMotivo('no_encontrado');
    }

    const { data, error } = await db.storage
      .from(DEPOSITO_PAGADOR)
      .createSignedUrl(consentimiento.archivo_firmado_url, SEGUNDOS_DEL_ENLACE_TEMPORAL, { download: true });
    if (error) throw new Error(error.message);
    return { url: data.signedUrl };
  });
}
