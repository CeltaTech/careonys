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
import { hoyEnLaPrestadora } from './relojDeLaPrestadora.js';

// Todo lo que le pasa al consentimiento de cada Responsable de pagos: se carga, se cierra con el
// documento firmado, o se anula porque se cargó otro.
//
// SIN ESA FIRMA NO HAY RESPONSABLE DE PAGOS DEFINIDO, Y QUÉ PASA ENTONCES LO DECIDE CADA PRESTADORA.
// Con la opción de la Prestadora apagada, que es como viene de fábrica, no se bloquea nada: la
// contratación sigue, el Servicio se presta y el Cliente se da de alta igual. Con la opción
// encendida, en un Servicio donde alguno de los Responsables de pagos que rigen hoy no firmó no se
// programan turnos de guardia: lo rechaza la base, y el detalle del Servicio lo avisa. Lo que ya estaba
// programado sigue igual.
//
// TODO ES DEL SERVICIO. Los Responsables de pagos, lo que firma cada uno y sus documentos son de
// cada Servicio: un mismo Cliente puede tener dos Servicios con distintos Responsables de pagos. El
// Apoderado, en cambio, es del Cliente, y firma por él en todos sus Servicios.
//
// VARIOS A LA VEZ, CADA UNO CON SU DOCUMENTO. Un Servicio puede tener varios Responsables de pagos al
// mismo tiempo, y cada uno firma el suyo. Hay un solo documento pendiente por Servicio y por persona:
// si se carga otro antes de que esa persona firme el anterior, el anterior se anula. La base lo
// exige además con un índice único, así que esto no es la única defensa.
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

// El Servicio con sus Responsables de pagos que no terminaron antes de hoy —los que rigen hoy y los
// que empiezan más adelante—, y de qué Cliente es. La tabla la abre la base sólo a quien tiene el
// permiso de lo comercial o el de los consentimientos.
export async function servicioConSusResponsables({ db, servicioId, prestadoraId }) {
  const { data: servicio } = await db
    .from('servicios')
    .select('id, prestadora_id, cliente_id')
    .eq('prestadora_id', prestadoraId)
    .eq('id', servicioId)
    .maybeSingle();

  if (!servicio || servicio.prestadora_id !== prestadoraId) {
    throw new ErrorConMotivo('no_encontrado', 'Servicio no encontrado');
  }

  const hoy = new Date().toISOString().slice(0, 10);
  const { data: filas, error } = await db
    .from('pagadores_del_servicio')
    .select('id, pagador_persona_id, pagador_tipo, vigente_desde, vigente_hasta, factura_al_responsable')
    .eq('prestadora_id', prestadoraId)
    .eq('servicio_id', servicioId)
    .or(`vigente_hasta.is.null,vigente_hasta.gte.${hoy}`)
    .order('vigente_desde', { ascending: true });
  if (error) throw new Error(error.message);

  return {
    ...servicio,
    responsables: (filas ?? []).map((fila) => ({
      ...fila,
      rige_hoy: String(fila.vigente_desde).slice(0, 10) <= hoy,
    })),
  };
}

// Los Servicios de un Cliente, para lo que cambia en todos a la vez: el Apoderado.
async function serviciosDelCliente({ db, clienteId, prestadoraId }) {
  const { data, error } = await db
    .from('servicios')
    .select('id')
    .eq('prestadora_id', prestadoraId)
    .eq('cliente_id', clienteId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((fila) => fila.id);
}

async function persona({ db, personaId, prestadoraId }) {
  if (!personaId) return null;
  if (!prestadoraId) {
    throw new ErrorConMotivo('faltan_datos', 'No se leen los datos de una persona sin saber de qué Organización es');
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
// poderes son Cliente por Cliente, así que se lee por Cliente y no por los datos del Pagador.
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

// Deja cada consentimiento pendiente en manos de quien hoy corresponde. Se llama cada vez que cambia
// el Apoderado o su poder: si firmaba otro, ese pendiente se anula y se arma uno nuevo para la misma
// persona. Si la persona ya no es Responsable de pagos del Servicio, el pendiente se anula y no se
// arma otro. Lo cerrado no se toca, porque lo que ya se firmó sigue vigente. El Apoderado es del
// Cliente, así que se revisan todos sus Servicios.
export async function alinearConsentimientoPendiente({ db, clienteId, prestadoraId, cargadoPor }) {
  const servicios = await serviciosDelCliente({ db, clienteId, prestadoraId });
  if (!servicios.length) return;

  const { data: pendientes, error } = await db
    .from('consentimientos_pagador')
    .select('id, servicio_id, pagador_persona_id, firmante_persona_id')
    .eq('prestadora_id', prestadoraId)
    .in('servicio_id', servicios)
    .eq('estado', 'pendiente_firma');
  if (error) throw new Error(error.message);
  if (!pendientes?.length) return;

  const firmante = await firmantePorApoderado({ db, clienteId, prestadoraId });
  for (const pendiente of pendientes) {
    if ((pendiente.firmante_persona_id ?? null) === (firmante?.id ?? null)) continue;

    const servicio = await servicioConSusResponsables({ db, servicioId: pendiente.servicio_id, prestadoraId });
    const sigue = servicio.responsables.some((fila) => fila.pagador_persona_id === pendiente.pagador_persona_id);
    if (!sigue) {
      await anularPendiente({ db, consentimientoId: pendiente.id, prestadoraId });
      continue;
    }
    await crearConsentimiento({
      db, servicioId: servicio.id, prestadoraId, personaId: pendiente.pagador_persona_id, cargadoPor,
    });
  }
}

// Anula los documentos pendientes de las personas que ya no son Responsables de pagos del Servicio:
// las que terminaron antes de hoy. Lo cerrado no se toca: lo que ya se firmó vale para sus días.
export async function anularPendientesDeQuienYaNoEs({ db, servicioId, prestadoraId }) {
  const servicio = await servicioConSusResponsables({ db, servicioId, prestadoraId });
  const siguen = new Set(servicio.responsables.map((fila) => fila.pagador_persona_id));

  const { data: pendientes, error } = await db
    .from('consentimientos_pagador')
    .select('id, pagador_persona_id')
    .eq('prestadora_id', prestadoraId)
    .eq('servicio_id', servicioId)
    .eq('estado', 'pendiente_firma');
  if (error) throw new Error(error.message);

  for (const pendiente of pendientes ?? []) {
    if (siguen.has(pendiente.pagador_persona_id)) continue;
    await anularPendiente({ db, consentimientoId: pendiente.id, prestadoraId });
  }
}

// Arma el documento de un Responsable de pagos con lo de esta contratación, lo guarda tal cual y lo
// deja esperando firma.
//
// El nombre de quien firma se guarda escrito además de apuntado a sus datos: los datos dicen con quién
// quedó atado, y el nombre, cómo se llamaba el día que leyó el documento.
export async function crearConsentimiento({ db, servicioId, prestadoraId, personaId, cargadoPor }) {
  const servicio = await servicioConSusResponsables({ db, servicioId, prestadoraId });
  const clienteId = servicio.cliente_id;
  const esResponsable = Boolean(personaId)
    && servicio.responsables.some((fila) => fila.pagador_persona_id === personaId);
  if (!esResponsable) {
    throw new ErrorConMotivo('sin_pagador', 'Esa persona no es Responsable de pagos de esta contratación');
  }

  const pagador = await persona({ db, personaId, prestadoraId });
  if (!pagador) {
    throw new ErrorConMotivo('no_encontrado', 'Los datos del Responsable de pagos no existen');
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

  // El anterior de esta misma persona se anula antes de insertar el nuevo, o el índice único de la
  // base rechaza la inserción. Los pendientes de los demás Responsables de pagos no se tocan. No se
  // borra: el historial de lo que se fue firmando es lo que esta tabla guarda.
  const { error: errorAnular } = await db
    .from('consentimientos_pagador')
    .update({ estado: 'anulado' })
    .eq('prestadora_id', prestadoraId)
    .eq('servicio_id', servicioId)
    .eq('pagador_persona_id', pagador.id)
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

// Se anula el pendiente sin reemplazarlo: se cargó por error, o la persona dejó de ser Responsable
// de pagos. Lo cerrado no se anula nunca: ya lo firmó alguien. Si otra persona ya lo cerró o lo
// anuló, no queda nada por hacer y no es un error.
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
// Contesta lo mismo a todo el que pregunte: qué firmó cada Responsable de pagos y qué falta. Lo
// consume la tarjeta de las firmas del Servicio, y cualquier otra parte que mañana necesite saberlo.
//
// Trae a los Responsables de pagos que no terminaron antes de hoy: los que rigen hoy y los que
// empiezan más adelante. `firmaCompleta` dice si firmaron todos los que rigen hoy, que es lo mismo
// que exige la base para programar turnos de guardia con la opción de la Prestadora encendida.
export async function estadoDelPagador({ db, servicioId, prestadoraId, idioma, zona }) {
  const servicio = await servicioConSusResponsables({ db, servicioId, prestadoraId });
  const tipos = [...new Set(servicio.responsables.map((fila) => fila.pagador_tipo).filter(Boolean))];

  const [personas, { data: consentimientos, error }, documentos] = await Promise.all([
    Promise.all(servicio.responsables.map((fila) => persona({ db, personaId: fila.pagador_persona_id, prestadoraId }))),
    db
      .from('consentimientos_pagador')
      // El texto viene entero: la pantalla lo muestra tal como se guardó, y armarlo de nuevo para
      // mostrarlo daría otro documento el día que la Prestadora cambie su modelo.
      .select('id, estado, pagador_persona_id, pagador_nombre, firmante_persona_id, firmante_nombre, documento_texto, documento_idioma, archivo_firmado_url, cerrado_como, cerrado_en, firmado_con_email, created_at')
      .eq('prestadora_id', prestadoraId)
      .eq('servicio_id', servicioId)
      .in('estado', ['pendiente_firma', 'cerrado'])
      .order('created_at', { ascending: false }),
    documentosDelPagador({ db, servicioId, prestadoraId, pagadorTipos: tipos }),
  ]);
  if (error) throw new Error(error.message);

  const conEmail = async (consentimiento) =>
    Boolean(consentimiento && (await emailDeLaFicha({ db, personaId: quienFirma(consentimiento), prestadoraId })));

  const responsables = await Promise.all(servicio.responsables.map(async (fila, indice) => {
    const suyos = (consentimientos ?? []).filter((c) => c.pagador_persona_id === fila.pagador_persona_id);
    const pendiente = suyos.find((c) => c.estado === 'pendiente_firma') ?? null;
    const cerradoLeido = suyos.find((c) => c.estado === 'cerrado') ?? null;
    // Firmado con el enlace, el documento lleva su frase de firma en lugar del pie para firmar a mano.
    const cerrado = cerradoLeido && {
      ...cerradoLeido,
      firmadoCon: fraseDeLaFirma({ consentimiento: cerradoLeido, idioma: cerradoLeido.documento_idioma ?? idioma, zona, prestadoraId }),
    };
    return {
      id: fila.id,
      persona: personas[indice],
      tipo: fila.pagador_tipo,
      vigenteDesde: fila.vigente_desde,
      vigenteHasta: fila.vigente_hasta,
      rigeHoy: fila.rige_hoy,
      facturaAlResponsable: fila.factura_al_responsable,
      consentimientoPendiente: pendiente,
      consentimientoCerrado: cerrado,
      // Son dos preguntas: mientras hay un documento pendiente, quien firmó el anterior puede ser
      // otra persona, y a esa también se le manda lo que firmó.
      pendienteConEmail: await conEmail(pendiente),
      cerradoConEmail: await conEmail(cerrado),
    };
  }));

  const deHoy = responsables.filter((fila) => fila.rigeHoy);
  return {
    responsables,
    firmaCompleta: deHoy.length > 0 && deHoy.every((fila) => Boolean(fila.consentimientoCerrado)),
    documentos,
    documentosFaltantes: documentos.filter((documento) => !documento.cargado).length,
    documentosVencidos: documentos.filter((documento) => documento.vencido).length,
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

// A qué email va el documento de este Servicio, o null si los datos de quien firma no tienen ninguno.
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

// Qué documentos exigen los Responsables de pagos del Servicio y cuáles están. Se devuelve el
// catálogo entero, tenga o no archivo cargado cada uno: lo que falta sólo se ve si el renglón
// aparece igual. `pagadorTipos` son los tipos de los Responsables de pagos que no terminaron.
export async function documentosDelPagador({ db, servicioId, prestadoraId, pagadorTipos = [] }) {
  let query = db
    .from('tipos_documento_pagador')
    .select('id, nombre, pagador_tipo, requiere_vencimiento')
    .eq('prestadora_id', prestadoraId)
    .eq('activo', true)
    .order('nombre', { ascending: true });

  // Nulo en el catálogo quiere decir «a todos». Cuando ningún Responsable de pagos dice quién
  // financia, se muestran nada más que esos: exigir los de una obra social sin saber si la hay
  // sería inventar un requisito. Los tipos salen de la lista cerrada de la base.
  query = pagadorTipos.length
    ? query.or(`pagador_tipo.is.null,pagador_tipo.in.(${pagadorTipos.join(',')})`)
    : query.is('pagador_tipo', null);

  const { data: tipos, error } = await query;
  if (error) throw new Error(error.message);

  const { data: cargados } = await db
    .from('documentos_pagador')
    .select('id, tipo_documento_id, archivo_url, fecha_vencimiento, created_at')
    .eq('prestadora_id', prestadoraId)
    .eq('servicio_id', servicioId);

  const porTipo = new Map((cargados ?? []).map((fila) => [fila.tipo_documento_id, fila]));
  // Vencido se mide contra el día del reloj de la Prestadora, no el del servidor.
  const hoy = await hoyEnLaPrestadora(db, prestadoraId);

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

  const servicio = await servicioConSusResponsables({ db, servicioId, prestadoraId });

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
