import { ErrorConMotivo } from './errorConMotivo.js';
import {
  IDIOMA_DEL_DOCUMENTO,
  verificadorDelDocumento,
  textoDelConsentimiento,
} from './documentoConsentimientoPagador.js';
import { textosDeFabrica } from './textosDeFabrica.js';
import { FICHA_NOMBRE } from './fichaDelPaciente.js';
import { frase } from '../i18n/mensajesDelSistema.js';
import { fraseDeLaFirma } from './fraseDeLaFirma.js';

// Todo lo que le pasa al consentimiento del Pagador: se carga, se cierra con el documento firmado, o se
// anula porque se cargó otro.
//
// SIN ESA FIRMA NO HAY PAGADOR DEFINIDO, Y AUN ASÍ NO SE BLOQUEA NADA. La contratación sigue, el
// Servicio se presta y el Cliente se da de alta igual. Lo único que cambia es que la pantalla lo
// dice, ahí donde se elige el Pagador, para que nadie se entere el día que hay que cobrar. Decidir
// es de quien tiene la responsabilidad, no del sistema.
//
// TODO ES DEL SERVICIO. El Responsable de pagos, lo que firma y sus documentos son de cada Servicio:
// un mismo Cliente puede tener dos Servicios con distinto Responsable de pagos. El Apoderado, en
// cambio, es del Cliente, y firma por él en todos sus Servicios.
//
// UNO PENDIENTE POR SERVICIO. Si se carga otro antes de que se firme el anterior, el anterior se
// anula: lo último que se le hizo firmar es lo que vale. La base lo exige además con un índice
// único, así que esto no es la única defensa.
//
// CON LA CONEXIÓN QUE LE PASEN. Cada función recibe `db`: la de la persona del Panel que pide, o la
// del trabajo de la Prestadora cuando el Cliente nombra o quita a su Apoderado desde la aplicación.
// En los dos casos la base decide qué alcanza.
//
// LOS DOCUMENTOS SON APARTE DE LA FIRMA. El consentimiento lo firma quien paga; los documentos los exige
// el Pagador, y qué documentos son lo sabe cada Prestadora. Que falte uno no invalida la firma, y
// que esté la firma no completa los documentos: son dos cosas y la pantalla muestra las dos.

const DEPOSITO = 'documentos-pagador';

// El texto de fábrica vive en la base (`textos_consentimiento`, esta clave), por país e idioma.
export const CLAVE_DEL_TEXTO = 'consentimiento_pagador';

// El texto que rige para esta Prestadora: el suyo si lo cargó, el de fábrica de su país si no.
export async function cuerpoVigente({ db, prestadoraId, idioma = IDIOMA_DEL_DOCUMENTO }) {
  const [{ data }, deFabrica] = await Promise.all([
    db
      .from('textos_consentimiento_pagador')
      .select('cuerpo, updated_at')
      .eq('prestadora_id', prestadoraId)
      .eq('idioma', idioma)
      .maybeSingle(),
    textosDeFabrica({ db, prestadoraId, clave: CLAVE_DEL_TEXTO }),
  ]);

  const predeterminado = deFabrica[idioma] ?? null;
  return {
    cuerpo: data?.cuerpo ?? predeterminado,
    predeterminado,
    esDelProducto: !data,
    actualizadoEn: data?.updated_at ?? null,
    idioma,
  };
}

// El Servicio con su Responsable de pagos, y de qué Cliente es.
export async function servicioConSuPagador({ db, servicioId, prestadoraId }) {
  const { data: servicio } = await db
    .from('servicios')
    .select('id, prestadora_id, contratante_id, pagador_persona_id, pagador_tipo')
    .eq('prestadora_id', prestadoraId)
    .eq('id', servicioId)
    .maybeSingle();

  if (!servicio || servicio.prestadora_id !== prestadoraId) {
    throw new ErrorConMotivo('no_encontrado', 'Servicio no encontrado');
  }
  return { ...servicio, cliente_id: servicio.contratante_id };
}

// Los Servicios de un Cliente, para lo que cambia en todos a la vez: el Apoderado.
async function serviciosDelCliente({ db, clienteId, prestadoraId }) {
  const { data, error } = await db
    .from('servicios')
    .select('id')
    .eq('prestadora_id', prestadoraId)
    .eq('contratante_id', clienteId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((fila) => fila.id);
}

async function persona({ db, personaId, prestadoraId }) {
  if (!personaId) return null;
  if (!prestadoraId) {
    throw new ErrorConMotivo('faltan_datos', 'No se lee una Ficha de Persona sin saber de qué Organización es');
  }

  const { data } = await db
    .from('personas')
    .select('id, nombre_visible, clase, documento_tipo, documento_numero')
    .eq('prestadora_id', prestadoraId)
    .eq('id', personaId)
    .maybeSingle();
  if (!data) return null;

  return {
    id: data.id,
    nombre: data.nombre_visible,
    clase: data.clase,
    documento: data.documento_numero
      ? `${data.documento_tipo} ${data.documento_numero}`
      : null,
  };
}

// Quién firma en nombre del que paga: el Apoderado de este Cliente, si su poder está aprobado. Los
// poderes son Cliente por Cliente, así que se lee por Cliente y no por la Ficha del Pagador.
export async function firmantePorApoderado({ db, clienteId, prestadoraId }) {
  const { data, error } = await db
    .from('apoderados')
    .select('persona_id')
    .eq('prestadora_id', prestadoraId)
    .eq('cliente_id', clienteId)
    .eq('funcion', 'pagos')
    .eq('estado', 'aprobado')
    .is('quitado_en', null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? persona({ db, personaId: data.persona_id, prestadoraId }) : null;
}

// Deja el consentimiento pendiente en manos de quien hoy corresponde. Se llama cada vez que cambia
// el Apoderado o su poder: si firmaba otro, ese pendiente se anula y se arma uno nuevo. Lo cerrado
// no se toca, porque lo que ya se firmó sigue vigente. El Apoderado es del Cliente, así que se
// revisan todos sus Servicios.
export async function alinearConsentimientoPendiente({ db, clienteId, prestadoraId, cargadoPor }) {
  const servicios = await serviciosDelCliente({ db, clienteId, prestadoraId });
  if (!servicios.length) return;

  const { data: pendientes, error } = await db
    .from('consentimientos_pagador')
    .select('id, servicio_id, firmante_persona_id')
    .eq('prestadora_id', prestadoraId)
    .in('servicio_id', servicios)
    .eq('estado', 'pendiente_firma');
  if (error) throw new Error(error.message);
  if (!pendientes?.length) return;

  const firmante = await firmantePorApoderado({ db, clienteId, prestadoraId });
  for (const pendiente of pendientes) {
    if ((pendiente.firmante_persona_id ?? null) === (firmante?.id ?? null)) continue;

    const servicio = await servicioConSuPagador({ db, servicioId: pendiente.servicio_id, prestadoraId });
    if (!servicio.pagador_persona_id) {
      await anularPendiente({ db, consentimientoId: pendiente.id, prestadoraId });
      continue;
    }
    await crearConsentimiento({ db, servicioId: servicio.id, prestadoraId, cargadoPor });
  }
}

// Arma el documento con lo de esta contratación, lo guarda tal cual y lo deja esperando firma.
//
// El nombre de quien firma se guarda escrito además de apuntado a su Ficha: la Ficha dice con quién
// quedó atado, y el nombre, cómo se llamaba el día que leyó el documento.
export async function crearConsentimiento({ db, servicioId, prestadoraId, cargadoPor }) {
  const servicio = await servicioConSuPagador({ db, servicioId, prestadoraId });
  const clienteId = servicio.cliente_id;
  if (!servicio.pagador_persona_id) {
    throw new ErrorConMotivo('sin_pagador', 'Esta contratación todavía no tiene Pagador elegido');
  }

  const pagador = await persona({ db, personaId: servicio.pagador_persona_id, prestadoraId });
  if (!pagador) {
    throw new ErrorConMotivo('no_encontrado', 'La Ficha de Persona del Pagador no existe');
  }

  const [{ cuerpo, idioma }, { data: prestadora }, nombreDelCliente, apoderado] = await Promise.all([
    cuerpoVigente({ db, prestadoraId }),
    db.from('prestadoras').select('nombre_fantasia').eq('id', prestadoraId).maybeSingle(),
    nombreDeLaContratacion({ db, clienteId, prestadoraId }),
    firmantePorApoderado({ db, clienteId, prestadoraId }),
  ]);

  const texto = textoDelConsentimiento({
    cuerpo,
    prestadora: { nombre: prestadora?.nombre_fantasia },
    pagador,
    cliente: { nombre: nombreDelCliente },
    apoderado,
  });

  // El anterior se anula antes de insertar el nuevo, o el índice único de la base rechaza la
  // inserción. No se borra: el historial de lo que se fue firmando es lo que esta tabla guarda.
  const { error: errorAnular } = await db
    .from('consentimientos_pagador')
    .update({ estado: 'anulado' })
    .eq('prestadora_id', prestadoraId)
    .eq('servicio_id', servicioId)
    .eq('estado', 'pendiente_firma');
  if (errorAnular) throw new Error(errorAnular.message);

  const { data: consentimiento, error } = await db
    .from('consentimientos_pagador')
    .insert({
      prestadora_id: prestadoraId,
      cliente_id: clienteId,
      servicio_id: servicioId,
      pagador_persona_id: pagador.id,
      pagador_nombre: pagador.nombre,
      // Quién firma se copia acá el día que se arma, igual que el nombre de quien paga: si mañana
      // el Cliente cambia de Apoderado, el documento sigue diciendo quién lo firmó.
      firmante_persona_id: apoderado?.id ?? null,
      firmante_nombre: apoderado?.nombre ?? null,
      documento_texto: texto,
      documento_verificador: verificadorDelDocumento(texto),
      documento_idioma: idioma,
      cargado_por: cargadoPor,
    })
    .select('id, estado, documento_texto, documento_verificador, documento_idioma, pagador_nombre, firmante_nombre, created_at')
    .single();
  if (error) throw new Error(error.message);

  return consentimiento;
}

// Cómo nombrar la contratación adentro del documento. Es el apellido y los nombres del Paciente,
// que es lo mismo que la pantalla muestra: quien firma tiene que reconocer por quién se obliga.
// El nombre visible se calcula al mostrarlo y no se guarda (CLAUDE.md del producto §6); acá se
// escribe adentro del documento porque un documento firmado no se recalcula nunca más.
async function nombreDeLaContratacion({ db, clienteId, prestadoraId }) {
  const { data } = await db
    .from('pacientes')
    .select(`created_at, ${FICHA_NOMBRE}`)
    .eq('prestadora_id', prestadoraId)
    .eq('cliente_id', clienteId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  return data?.persona?.nombre_visible ?? null;
}

// El consentimiento de esta Prestadora, con su estado y su archivo, o null si no es de ella.
export async function consentimientoDelPagador({ db, consentimientoId, prestadoraId }) {
  const { data, error } = await db
    .from('consentimientos_pagador')
    .select('id, estado, archivo_firmado_url')
    .eq('id', consentimientoId)
    .eq('prestadora_id', prestadoraId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

// El camino de siempre: quien paga firmó el documento y la Prestadora lo guarda. La ruta que sube el
// archivo se encarga del depósito; acá sólo se cierra. Si otra persona ya lo cerró o lo anuló, no
// queda nada por hacer: no se toca nada, no es un error, y devuelve false para que la ruta sepa
// que el archivo que subió no quedó guardado en ningún consentimiento.
export async function cerrarConDocumentoFirmado({ db, consentimientoId, prestadoraId, archivoUrl }) {
  const consentimiento = await consentimientoDelPagador({ db, consentimientoId, prestadoraId });
  if (!consentimiento) throw new ErrorConMotivo('no_encontrado', 'Consentimiento no encontrado');
  if (consentimiento.estado !== 'pendiente_firma') return false;

  const { data, error } = await db
    .from('consentimientos_pagador')
    .update({
      estado: 'cerrado',
      cerrado_como: 'documento_firmado',
      cerrado_en: new Date().toISOString(),
      archivo_firmado_url: archivoUrl,
    })
    .eq('prestadora_id', prestadoraId)
    .eq('id', consentimientoId)
    .eq('estado', 'pendiente_firma')
    .select('id');
  if (error) throw new Error(error.message);
  return Boolean(data?.length);
}

// Se anula el pendiente sin reemplazarlo: se cargó por error, o cambió el Pagador y todavía no se
// sabe cuál es el nuevo. Lo cerrado no se anula nunca: ya lo firmó alguien. Si otra persona ya lo
// cerró o lo anuló, no queda nada por hacer y no es un error.
export async function anularPendiente({ db, consentimientoId, prestadoraId }) {
  const { data, error } = await db
    .from('consentimientos_pagador')
    .update({ estado: 'anulado' })
    .eq('id', consentimientoId)
    .eq('prestadora_id', prestadoraId)
    .eq('estado', 'pendiente_firma')
    .select('id');
  if (error) throw new Error(error.message);
  return Boolean(data?.length);
}

// ---------------------------------------------------------------------------------------
// El punto único de verdad del estado
// ---------------------------------------------------------------------------------------
//
// Contesta lo mismo a todo el que pregunte: qué firmó el Pagador y qué le falta. Lo consume la parte
// del Panel donde se elige el Pagador, y cualquier otra que mañana necesite saberlo.
export async function estadoDelPagador({ db, servicioId, prestadoraId, idioma, zona }) {
  const servicio = await servicioConSuPagador({ db, servicioId, prestadoraId });

  const [pagador, { data: consentimientos }, documentos] = await Promise.all([
    persona({ db, personaId: servicio.pagador_persona_id, prestadoraId }),
    db
      .from('consentimientos_pagador')
      // El texto viene entero: la pantalla lo muestra tal como se guardó, y armarlo de nuevo para
      // mostrarlo daría otro documento el día que la Prestadora cambie su modelo.
      .select('id, estado, pagador_persona_id, pagador_nombre, firmante_persona_id, firmante_nombre, documento_texto, documento_idioma, archivo_firmado_url, cerrado_como, cerrado_en, firmado_con_email, created_at')
      .eq('prestadora_id', prestadoraId)
      .eq('servicio_id', servicioId)
      .in('estado', ['pendiente_firma', 'cerrado'])
      .order('created_at', { ascending: false }),
    documentosDelPagador({ db, servicioId, prestadoraId, pagadorTipo: servicio.pagador_tipo }),
  ]);

  const pendiente = (consentimientos ?? []).find((fila) => fila.estado === 'pendiente_firma') ?? null;
  const cerradoLeido = (consentimientos ?? []).find((fila) => fila.estado === 'cerrado') ?? null;
  // Firmado con el enlace, el documento lleva su frase de firma en lugar del pie para firmar a mano.
  const cerrado = cerradoLeido && {
    ...cerradoLeido,
    firmadoCon: fraseDeLaFirma({ consentimiento: cerradoLeido, idioma: cerradoLeido.documento_idioma ?? idioma, zona, prestadoraId }),
  };

  // Si el consentimiento firmado quedó atado a otra Ficha que la que hoy figura como Pagador, la
  // firma no vale para éste: firmó otra persona, y el Panel muestra su nombre junto a la fecha.
  const firmadoPorOtro = Boolean(
    cerrado && servicio.pagador_persona_id && cerrado.pagador_persona_id !== servicio.pagador_persona_id,
  );

  const conEmail = async (consentimiento) =>
    Boolean(consentimiento && (await emailDeLaFicha({ db, personaId: quienFirma(consentimiento), prestadoraId })));

  return {
    pagador,
    firmadoPorOtro,
    consentimientoPendiente: pendiente,
    consentimientoCerrado: cerrado,
    documentos,
    documentosFaltantes: documentos.filter((documento) => !documento.cargado).length,
    documentosVencidos: documentos.filter((documento) => documento.vencido).length,
    // Son dos preguntas: mientras hay un documento pendiente, quien firmó el anterior puede ser
    // otra persona, y a esa también se le manda lo que firmó.
    pendienteConEmail: await conEmail(pendiente),
    cerradoConEmail: await conEmail(cerrado),
    textos: {
      enviar: frase('documento_para_firmar.enviar', idioma, {}, prestadoraId),
      enviado: frase('documento_para_firmar.enviado', idioma, {}, prestadoraId),
    },
  };
}

// Firma el Apoderado si lo hay, y si no quien paga.
function quienFirma(consentimiento) {
  return consentimiento.firmante_persona_id ?? consentimiento.pagador_persona_id;
}

// El email se lee con la conexión de quien pide: el trabajo sin persona no alcanza esa columna.
async function emailDeLaFicha({ db, personaId, prestadoraId }) {
  const { data, error } = await db
    .from('personas')
    .select('email')
    .eq('prestadora_id', prestadoraId)
    .eq('id', personaId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.email?.trim() || null;
}

// A qué email va el documento de este Servicio, o null si la Ficha de quien firma no tiene ninguno.
export async function emailDeQuienFirma({ db, consentimientoId, servicioId, prestadoraId }) {
  const { data: consentimiento, error } = await db
    .from('consentimientos_pagador')
    .select('firmante_persona_id, pagador_persona_id')
    .eq('prestadora_id', prestadoraId)
    .eq('servicio_id', servicioId)
    .eq('id', consentimientoId)
    .in('estado', ['pendiente_firma', 'cerrado'])
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!consentimiento) throw new ErrorConMotivo('no_encontrado', 'Consentimiento no encontrado');

  return emailDeLaFicha({ db, personaId: quienFirma(consentimiento), prestadoraId });
}

// Qué documentos exige este Pagador y cuáles están. Se devuelve el catálogo entero, tenga o no
// archivo cargado cada uno: lo que falta sólo se ve si el renglón aparece igual.
export async function documentosDelPagador({ db, servicioId, prestadoraId, pagadorTipo }) {
  let query = db
    .from('tipos_documento_pagador')
    .select('id, nombre, pagador_tipo, requiere_vencimiento')
    .eq('prestadora_id', prestadoraId)
    .eq('activo', true)
    .order('nombre', { ascending: true });

  // Nulo en el catálogo quiere decir «a todos». Cuando la contratación todavía no dice quién
  // financia, se muestran nada más que esos: exigir los de una obra social sin saber si la hay
  // sería inventar un requisito.
  query = pagadorTipo
    ? query.or(`pagador_tipo.is.null,pagador_tipo.eq.${pagadorTipo}`)
    : query.is('pagador_tipo', null);

  const { data: tipos, error } = await query;
  if (error) throw new Error(error.message);

  const { data: cargados } = await db
    .from('documentos_pagador')
    .select('id, tipo_documento_id, archivo_url, fecha_vencimiento, created_at')
    .eq('prestadora_id', prestadoraId)
    .eq('servicio_id', servicioId);

  const porTipo = new Map((cargados ?? []).map((fila) => [fila.tipo_documento_id, fila]));
  const hoy = new Date().toISOString().slice(0, 10);

  return (tipos ?? []).map((tipo) => {
    const cargado = porTipo.get(tipo.id) ?? null;
    return {
      tipoId: tipo.id,
      nombre: tipo.nombre,
      pagadorTipo: tipo.pagador_tipo,
      requiereVencimiento: tipo.requiere_vencimiento,
      cargado: Boolean(cargado?.archivo_url),
      documentoId: cargado?.id ?? null,
      fechaVencimiento: cargado?.fecha_vencimiento ?? null,
      vencido: Boolean(cargado?.fecha_vencimiento && cargado.fecha_vencimiento < hoy),
    };
  });
}

// Guarda un documento que ya se subió al depósito. La ruta del archivo la arma quien sube; acá se anota
// cuál es y hasta cuándo vale.
export async function guardarDocumento({
  db, servicioId, prestadoraId, tipoDocumentoId, archivoUrl, fechaVencimiento, cargadoPor,
}) {
  const { data: tipo } = await db
    .from('tipos_documento_pagador')
    .select('id')
    .eq('id', tipoDocumentoId)
    .eq('prestadora_id', prestadoraId)
    .maybeSingle();
  if (!tipo) throw new ErrorConMotivo('no_encontrado', 'Ese tipo de documento no existe');

  const servicio = await servicioConSuPagador({ db, servicioId, prestadoraId });

  const { error } = await db
    .from('documentos_pagador')
    .upsert({
      prestadora_id: prestadoraId,
      cliente_id: servicio.cliente_id,
      servicio_id: servicioId,
      tipo_documento_id: tipoDocumentoId,
      archivo_url: archivoUrl,
      fecha_vencimiento: fechaVencimiento || null,
      cargado_por: cargadoPor,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'servicio_id,tipo_documento_id' });
  if (error) throw new Error(error.message);
}

// Dónde va cada archivo adentro del depósito. La ruta empieza siempre por la Prestadora, que es lo
// que exige su política: nadie alcanza el archivo de otra ni adivinando el nombre.
export function rutaDelArchivo({ prestadoraId, servicioId, nombre, extension }) {
  return `${prestadoraId}/${servicioId}/${nombre}.${extension}`;
}

export const DEPOSITO_PAGADOR = DEPOSITO;
