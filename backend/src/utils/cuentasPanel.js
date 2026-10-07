import crypto from 'crypto';
import { supabase, enLaPrestadora } from '../db/connection.js';
import { invitarActivacionCuenta } from './activacionCuenta.js';
import { ErrorConMotivo } from './errorConMotivo.js';
import { exigirQueElCelularSeaDeUnaSolaPersona } from './celularDeUnaSolaPersona.js';
import { coordenadasDeDomicilio } from '../geocodificacion/index.js';
import { CATALOGO_PERSONAS_AUTORIZADAS } from './catalogoPersonasAutorizadas.js';
import { acotarAUsuariosDelPanel, laCuentaDelPanelEstaAlAlcance } from '../middleware/alcancePrestadora.js';
import { APROBADAS, filasDeIncorporacion } from './etapasDeIncorporacion.js';
import { guardarLugaresDe } from './lugaresDeCadaPersona.js';
import { nombreDelLugar } from './catalogoDeLugares.js';
import { domicilioEscrito, partesDelDomicilio } from './domicilioEscrito.js';
import { cuentaDeLaFila } from './cuentaDeLaFila.js';

// Comprueba que un tipo de Asistente exista y sea de los que esta Prestadora puede usar:
// los generales de CeltaTech (`prestadora_id` vacío) o los que creó ella misma. Devuelve el
// mismo id si está bien, y `null` si no vino ninguno.
//
// Hace falta escribirlo: entra con la conexión que recibe, y quien llama puede pasar la llave
// maestra, que las reglas de aislamiento de la base no frenan. El filtro por Prestadora se escribe
// acá a mano o no existe (CLAUDE.md §5, regla de aislamiento).
//
// Todas las funciones de este archivo que van a la base reciben la conexión de quien las llama,
// salvo `crearCuentaConPerfil` y `borrarCuenta`, que entran con la credencial del trabajo sin
// persona, adentro de la Prestadora que se les nombra.
export async function validarTipoAsistente(db, tipoAsistenteId, prestadoraId) {
  if (!tipoAsistenteId) return null;

  const { data, error } = await db
    .from('tipos_asistente')
    .select('id')
    .eq('id', tipoAsistenteId)
    .or(`prestadora_id.is.null,prestadora_id.eq.${prestadoraId}`)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error('El tipo de Asistente indicado no existe o no es de esta Prestadora');
  return data.id;
}

// Deja un texto comparable: sin mayúsculas, sin tildes, sin nada que no sea letra.
function comparable(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

// Busca a qué tipo del catálogo corresponde un nombre escrito en una planilla.
//
// Es a propósito MÁS ESTRICTO que la sugerencia que hace el Panel: acá tiene que decir lo
// mismo —ignorando mayúsculas, tildes y puntuación— y nada más. "Enfermería" encuentra a
// "Enfermero/a" solo si así se llama el tipo; "Enf." no encuentra nada.
//
// Cuando no encuentra, devuelve `null` y el Asistente entra sin tipo. Eso es deliberado: el
// tipo decide si a esa persona se le va a exigir Matrícula para poder atender, y adivinarlo
// mal deja trabajando a alguien que no debería. El que entra sin tipo aparece después en la
// lista de Asistentes, marcado, para que una persona lo complete — se ve, no se esconde.
export async function resolverTipoAsistentePorNombre(db, texto, prestadoraId) {
  if (!comparable(texto)) return null;
  return resolverTipoAsistenteEnCatalogo(texto, await catalogoDeTiposAsistente(db, prestadoraId));
}

// Los tipos que esa Prestadora puede usar: los cuatro de fábrica (sin Prestadora) más los
// propios. El filtro por Prestadora va escrito acá a mano por el mismo motivo que arriba.
export async function catalogoDeTiposAsistente(db, prestadoraId) {
  const { data, error } = await db
    .from('tipos_asistente')
    .select('id, clave, nombre, prestadora_id')
    .or(`prestadora_id.is.null,prestadora_id.eq.${prestadoraId}`)
    .eq('activo', true);

  if (error) throw new Error(error.message);
  return data || [];
}

// La comparación sola, sin ir a la base. Existe aparte para que quien tenga que preguntar por
// muchos nombres de una sola planilla lea el catálogo una vez y no una vez por nombre — y sobre
// todo para que la regla de arriba, que decide si un Asistente entra con tipo o sin él, siga
// escrita en un solo lugar.
export function resolverTipoAsistenteEnCatalogo(texto, catalogo) {
  const buscado = comparable(texto);
  if (!buscado) return null;

  const encontrados = (catalogo || []).filter((tipo) =>
    comparable(tipo.nombre) === buscado || (!tipo.prestadora_id && comparable(tipo.clave) === buscado),
  );

  return encontrados.length === 1 ? encontrados[0].id : null;
}

// Los motivos con que la base rechaza un alta o una baja, y que la pantalla sabe traducir. El
// resto de los errores de la base no viaja: es texto crudo (CLAUDE.md §6).
const MOTIVOS_DE_LA_BASE = ['correo_de_esta_prestadora', 'faltan_datos'];

// Da de alta una cuenta: su cuenta de ingreso y su fila en `usuarios`, juntas.
//
// Lo hace la base con `dar_de_alta_la_cuenta`, sin llave maestra: o pasan las dos o ninguna, y la
// Prestadora sale de la credencial de este trabajo, nunca de lo que venga en el pedido. Una cuenta
// de ingreso que quedó sola de un alta anterior la borra la misma base antes de seguir.
//
// Sólo la gente de la Prestadora: coordinación, Asistentes, Clientes y sus personas autorizadas. La cuenta del
// Administrador y la del equipo técnico son de CeltaTech, y la base se niega a crearlas.
//
// Para la coordinación, `passwordTemporal` vuelve al Panel para que se la comuniquen. Para
// Cliente, Asistente y personas autorizadas la persona nunca la ve: con `enviarActivacion: true` sale el correo
// para elegir la primera clave (activacionCuenta.js).
export async function crearCuentaConPerfil({ email, nombre, telefono, rol, prestadoraId, enviarActivacion = false }) {
  if (!prestadoraId) throw new ErrorConMotivo('faltan_datos', 'crearCuentaConPerfil: falta la Prestadora');

  // UN CELULAR ES DE UNA SOLA PERSONA, y se comprueba acá porque acá pasan todas las altas: la del
  // Panel, la del Asistente y la de las personas autorizadas del Cliente. Escrito en cada ruta serían tres copias
  // de la misma decisión. La línea fija de una casa no cae nunca acá, y el mensaje no lleva el
  // número adentro. La unicidad la impone igual la base, con un índice único.
  await exigirQueElCelularSeaDeUnaSolaPersona({ telefono, prestadoraId });

  const passwordTemporal = crypto.randomBytes(24).toString('base64url');

  const { data: userId, error } = await enLaPrestadora(prestadoraId, 'alta de cuenta', () =>
    supabase.rpc('dar_de_alta_la_cuenta', {
      p_email: email,
      p_clave: passwordTemporal,
      p_rol: rol,
      p_nombre: nombre,
      p_telefono: telefono ?? null,
    }));
  if (error) {
    if (MOTIVOS_DE_LA_BASE.includes(error.message)) throw new ErrorConMotivo(error.message);
    throw new Error(error.message);
  }
  if (!userId) throw new Error('crearCuentaConPerfil: la base no devolvió la cuenta');

  if (enviarActivacion) {
    try {
      await invitarActivacionCuenta({ usuarioId: userId, email, nombre, rol, prestadoraId });
    } catch (errorActivacion) {
      // La cuenta ya quedó creada correctamente — un fallo al mandar el email (ej. SMTP
      // caído en ese momento) no debe deshacer el alta, se recupera con "Reenviar invitación".
      console.error('Error al enviar el email de activación:', errorActivacion.message);
    }
  }

  return { userId, passwordTemporal };
}

// Da de baja una cuenta: su fila de `usuarios` y su cuenta de ingreso, juntas.
//
// Lo hace la base con `dar_de_baja_la_cuenta`, adentro de la Prestadora que se nombra acá: una
// cuenta de otra Prestadora, una que no existe y la del Administrador o del equipo técnico se
// contestan igual, que no hay nada que dar de baja. Sin cuenta o sin Prestadora no se le pregunta
// nada a la base (CLAUDE.md §5, todo control de acceso falla cerrado).
export async function borrarCuenta(userId, { prestadoraId } = {}) {
  if (!userId || !prestadoraId) throw new Error('No hay permiso para dar de baja esa cuenta');

  const { data: borrada, error } = await enLaPrestadora(prestadoraId, 'baja de cuenta', () =>
    supabase.rpc('dar_de_baja_la_cuenta', { p_usuario: userId }));
  if (error) throw new Error(error.message);
  if (borrada !== true) throw new Error('No hay permiso para dar de baja esa cuenta');
}

// Deshace un alta que se cortó por la mitad. **Nunca falla**: pase lo que pase, termina.
//
// Por qué importa que no falle. Un alta que se corta tiene siempre dos partes: el problema
// real (falta una configuración, la base no contestó) y la limpieza de lo que alcanzó a
// crearse. Cuando la limpieza se escribe suelta, un tropiezo suyo pisa el problema real: la
// persona ve el error de la limpieza, o directamente no ve nada porque la respuesta al Panel
// nunca llega a mandarse y la pantalla se queda esperando para siempre. Acá la limpieza se
// traga sus propios tropiezos, los deja anotados en el registro del servidor, y devuelve si
// pudo o no — para que el problema de verdad sea el que llegue a la pantalla.
//
// `filas` son las tablas a limpiar, en orden de hija a madre. `columna` es por dónde se
// busca (por omisión `id`), `valor` con qué se compara (por omisión el id de la cuenta), y
// `sinPrestadora` marca las tablas que no tienen esa columna (ver las listas de más abajo).
//
// `prestadoraId` es obligatorio y no tiene valor por omisión: sin él este borrado alcanzaría
// filas de cualquier Organización. Falla cerrado — sin Prestadora no se limpia nada.
export async function deshacerAlta(db, userId, { prestadoraId, filas = [] } = {}) {
  if (!prestadoraId) {
    console.error('deshacerAlta: sin Prestadora no se limpia nada', userId);
    return false;
  }

  let limpioTodo = true;

  // La red propia de esta función, por la misma razón que la de `borrarCuenta`: el borrado de
  // abajo recibe el nombre de la tabla y la columna desde afuera y no puede defenderse solo, así
  // que la pertenencia se comprueba una vez acá, antes de tocar nada. Se comprueba sobre la
  // cuenta y no tabla por tabla porque dos de las tablas de la lista no tienen columna de
  // Prestadora (`verificaciones_asistente`, `personas_autorizadas`) y cuelgan de esta misma
  // cuenta — filtrar solo las que sí la tienen dejaría a las otras sin red y, encima, se
  // borran primero. Si la cuenta no es de esta Prestadora, no se limpia nada.
  if (userId) {
    // La lectura se acota con el mismo ayudante que la de `borrarCuenta`, y sin `esSuperadmin`: lo
    // que se deshace son altas de Cliente, Asistente o personas autorizadas, todas de una Prestadora.
    // Una cuenta de otra Organización no aparece, y no aparecer es lo mismo que no estar.
    const { data: duena, error: errorDuena } = await acotarAUsuariosDelPanel(
      db.from('usuarios').select('rol, prestadora_id').eq('id', userId),
      { prestadoraId },
    ).maybeSingle();
    if (errorDuena || !duena) {
      // Sin fila de la que colgar no hay nada que limpiar y tampoco forma de comprobar de quién
      // es. Puede quedar una cuenta de acceso sin nadie detrás; el próximo intento con ese mismo
      // correo la va a reconocer como sobrante y la va a borrar sola (`dar_de_alta_la_cuenta`).
      // Se anota el id, nunca el correo (CLAUDE.md §6).
      console.error('deshacerAlta: no hay cuenta a limpiar en esta Prestadora', userId);
      return false;
    }
    // La misma regla de siempre, preguntada donde se escribió una sola vez. Sin `esSuperadmin`,
    // así que una cuenta del equipo técnico de CeltaTech tampoco se limpia por acá: lo que se
    // deshace son altas de Cliente, Asistente o personas autorizadas, nunca cuentas de Panel.
    if (!laCuentaDelPanelEstaAlAlcance(duena, { prestadoraId })) {
      console.error('deshacerAlta: la cuenta no es de esta Prestadora, no se limpió nada', userId);
      return false;
    }
  }

  for (const fila of filas) {
    const valor = fila.valor ?? userId;
    if (!valor) continue;
    try {
      // Cada tabla se borra nombrando la Prestadora. Las tres que no tienen esa columna van
      // marcadas en las listas de abajo: cuelgan de la cuenta, y la pertenencia de la cuenta ya
      // se comprobó al entrar.
      const { error } = await db
        .from(fila.tabla)
        .delete()
        .eq(fila.columna || 'id', valor)
        .match(fila.sinPrestadora ? {} : { prestadora_id: prestadoraId });
      if (error) throw new Error(error.message);
    } catch (error) {
      limpioTodo = false;
      console.error(`deshacerAlta: quedó sin limpiar ${fila.tabla}`, error.message);
    }
  }

  if (userId) {
    try {
      await borrarCuenta(userId, { prestadoraId });
    } catch (error) {
      limpioTodo = false;
      // Se anota el id, nunca el correo (CLAUDE.md §6). Si esto aparece en el registro, quedó
      // una cuenta de acceso sin nadie detrás — y el próximo intento con ese mismo correo la
      // va a reconocer como sobrante y la va a borrar sola (ver `dar_de_alta_la_cuenta`).
      console.error('deshacerAlta: quedó una cuenta de acceso sin borrar', userId, error.message);
    }
  }

  return limpioTodo;
}

// Qué deja atrás cada tipo de alta, de la fila hija a la madre. Escrito una sola vez porque
// lo usan tanto el deshacer de un alta cortada como la reversión de un lote importado que la
// Prestadora rechazó — es la misma lista, y tenerla dos veces es cómo se olvida una tabla en
// una de las dos (regla 12 de CLAUDE.md §7).
//
// `sinPrestadora: true` marca las tablas que no tienen columna de Organización: se borran
// colgando del Legajo del Asistente o de la cuenta, cuya pertenencia el deshacer comprueba antes de tocar
// nada. Todas las demás se borran nombrando la Prestadora.
export const FILAS_DE_UN_ASISTENTE = [
  { tabla: 'asistente_lugares', columna: 'asistente_id' },
  { tabla: 'verificaciones_asistente', columna: 'asistente_id', sinPrestadora: true },
  { tabla: 'referencias_laborales_asistente', columna: 'asistente_id' },
  { tabla: 'asistentes' },
];

export const FILAS_DE_UNA_CLIENTE = [
  { tabla: 'pacientes', columna: 'cliente_id' },
  { tabla: 'clientes' },
];

// Las cuatro tablas de arriba cuelgan del LEGAJO DEL ASISTENTE, no de la cuenta, y desde que el Legajo tiene
// identificador propio esos dos números dejaron de ser el mismo. Por eso el valor con el que se
// busca se dice acá y no se deja librado al valor por omisión del deshacer, que es el de la
// cuenta: sin esto la limpieza pasaría por encima sin borrar nada y no se notaría.
//
// Sin Legajo del Asistente no hay nada que limpiar de ese lado: el alta se cortó antes de crearla, y lo único
// que queda es la cuenta, que el deshacer borra igual.
export const filasDeUnAsistente = (asistenteId) =>
  asistenteId ? FILAS_DE_UN_ASISTENTE.map((fila) => ({ ...fila, valor: asistenteId })) : [];

export const filasDeUnaCliente = (clienteId) =>
  clienteId ? FILAS_DE_UNA_CLIENTE.map((fila) => ({ ...fila, valor: clienteId })) : [];

const FILAS_DE_UNA_PERSONA_AUTORIZADA = [
  { tabla: 'permisos_personas_autorizadas', columna: 'usuario_id', sinPrestadora: true },
  { tabla: 'personas_autorizadas', columna: 'usuario_id', sinPrestadora: true },
];

// Lógica de alta manual de un Asistente, extraída de panelCuentas.js (ruta /asistente-directo)
// en la Fase 3 (importación masiva) del plan "Terminar la Etapa 2 (Panel)" para que la
// importación fila-por-fila reutilice exactamente el mismo camino de creación que el alta
// manual de la Fase 1, en vez de duplicar la lógica (ver alcance de la Fase 3 en el plan
// aprobado: "no se construye un camino de creación de datos paralelo y distinto").
export async function crearAsistenteDirecto({
  nombre, telefono, email, dni, domicilio, domicilioPartido, tipo_asistente_id, tipo_asistente, lugares, estado,
  tipo_vinculo, categoria_cct, valor_hora, sueldo_basico, horas_semanales, modalidades,
  prestadoraId, usuarioPanelId, importacionId, db,
}) {
  if (!nombre || !email) {
    throw new ErrorConMotivo('faltan_datos', 'Faltan datos obligatorios (nombre, email)');
  }

  // En qué modalidad de trabajo va a estar esta persona. Si el alta no lo dice —una planilla
  // importada, por ejemplo—, no se manda nada y la base lo completa con las modalidades que la
  // Prestadora tenga activas. Elegirlo acá por las dudas sería adivinar en el único lugar donde
  // no hace falta, y además duplicaría esa cuenta (Regla 12).
  const modalidadesElegidas =
    Array.isArray(modalidades) && modalidades.length > 0 ? modalidades : null;

  // Dos maneras de decir el tipo, según de dónde venga: el Panel manda el identificador
  // porque lo eligió de una lista; una planilla importada manda el nombre escrito, que hay
  // que buscar en el catálogo. Si viene el identificador, manda ese.
  const tipoAsistenteId = tipo_asistente_id
    ? await validarTipoAsistente(db, tipo_asistente_id, prestadoraId)
    : await resolverTipoAsistentePorNombre(db, tipo_asistente, prestadoraId);

  // Dónde vive, escrito para que lo lea una persona, y ese mismo lugar en coordenadas para
  // poder medir distancias — la cercanía al elegir a quién llamar, y de dónde salió el viaje.
  // Las coordenadas las saca de la dirección el servicio del país de la Prestadora
  // (`geocodificacion/`); si no hay servicio para ese país, si se cae o si no la encuentra,
  // quedan en nulo y el alta sigue igual: el texto es el dato. Dato sensible: no sale en
  // registros ni en URLs (CLAUDE.md §6).
  //
  // Desde el Panel llega partido —calle, número, piso, unidad y cuál de los lugares de la
  // Prestadora—; desde una planilla importada llega como un renglón suelto, que es lo que la
  // planilla trae. En los dos casos se guardan las partes que haya, y el renglón lo arma
  // `domicilioEscrito`, que es el único lugar donde se decide dónde va cada coma.
  const partes = partesDelDomicilio(domicilioPartido);
  const nombreDeSuLugar = await nombreDelLugar(db, partes.lugar_id, prestadoraId);
  const domicilioDelAsistente = domicilioEscrito({ ...partes, lugar: nombreDeSuLugar }) || domicilio || null;
  const ubicacion = await coordenadasDeDomicilio({ prestadoraId, direccion: domicilioDelAsistente });

  // Dos identificadores, y ya no son el mismo número. `cuentaId` es la persona —con qué entra,
  // cómo se llama, qué teléfono tiene—; `asistenteId` es su Legajo en esta Prestadora, que la base
  // numera sola. La misma persona puede tener otro Legajo de Asistente en otra Prestadora, con su propia
  // antigüedad y sus propias matrículas, colgando de esta misma cuenta.
  let cuentaId;
  let asistenteId;
  try {
    ({ userId: cuentaId } = await crearCuentaConPerfil({
      email, nombre, telefono, rol: 'asistente', prestadoraId, enviarActivacion: true,
    }));

    const { data: asistenteNuevo, error: errorAsistente } = await db.from('asistentes').insert({
      usuario_id: cuentaId,
      nombre,
      dni: dni || null,
      telefono: telefono || null,
      email,
      domicilio: domicilioDelAsistente,
      ...partes,
      ...ubicacion,
      tipo_asistente_id: tipoAsistenteId,
      estado: estado || 'activo',
      tipo_vinculo: tipo_vinculo || 'monotributo',
      horas_semanales: horas_semanales || null,
      // La columna se llama `canales` de antes y no se renombra (regla 13 de CLAUDE.md §7).
      ...(modalidadesElegidas && { canales: modalidadesElegidas }),
      prestadora_id: prestadoraId,
      importacion_id: importacionId || null,
      pendiente_conformidad: Boolean(importacionId),
    }).select('id').single();
    if (errorAsistente) throw new Error(errorAsistente.message);
    asistenteId = asistenteNuevo.id;

    // Dónde acepta trabajar esta persona. Se guarda por la misma función que usa su Legajo, para
    // que el alta y la corrección dejen la lista igual. Si alguno de los lugares no es de esta
    // Organización, la clave foránea compuesta rechaza la escritura entera, el alta se deshace
    // como cualquier otro tropiezo y no queda un Legajo a medias.
    await guardarLugaresDe(db, 'asistente_lugares', 'asistente_id', asistenteId, prestadoraId, lugares);

    // Lo que cobra el Asistente va a su propia tabla, no a su Legajo: ahí la base exige el
    // permiso `ver_pagos_asistente` antes de mostrarlo. Si el alta no trae ningún importe no
    // se crea la fila — una fila vacía no dice nada distinto de que no haya fila.
    if (categoria_cct || valor_hora || sueldo_basico) {
      const { error: errorRemuneracion } = await db.from('remuneraciones_asistente').insert({
        asistente_id: asistenteId,
        prestadora_id: prestadoraId,
        categoria_cct: categoria_cct || null,
        valor_hora: valor_hora || null,
        sueldo_basico: sueldo_basico || null,
      });
      if (errorRemuneracion) throw new Error(errorRemuneracion.message);
    }

    // Filas importadas quedan ocultas por RLS (pendiente_conformidad=true) hasta que la
    // Prestadora las conforme — no tiene sentido correr acá la política de verificación de
    // alta manual sobre una fila que todavía no es operable; ese paso corre recién al
    // conformar el lote (panelImportacion.js /conformar, vía activarVerificacionAltaAsistente).
    if (importacionId) {
      return { asistenteId };
    }

    await activarVerificacionAltaAsistente(db, asistenteId, prestadoraId, usuarioPanelId);

    return { asistenteId };
  } catch (error) {
    await deshacerAlta(db, cuentaId, { prestadoraId, filas: filasDeUnAsistente(asistenteId) });
    throw error;
  }
}

// Extraída de crearAsistenteDirecto para que el alta manual (arriba) y la conformidad
// post-importación (panelImportacion.js /conformar) apliquen exactamente la misma política
// de verificación en vez de duplicarla (Regla 12, CLAUDE.md §7).
export async function activarVerificacionAltaAsistente(db, asistenteId, prestadoraId, usuarioPanelId) {
  const { data: prestadora, error: errorPrestadora } = await db
    .from('prestadoras')
    .select('politica_verificacion_alta_manual')
    .eq('id', prestadoraId)
    .single();
  if (errorPrestadora) throw new Error(errorPrestadora.message);

  const politica = prestadora.politica_verificacion_alta_manual;
  if (politica === 'pendiente' || politica === 'aprobado') {
    // Las etapas son las que esa Prestadora tiene configuradas, las mismas que arma una
    // postulación aprobada. La política decide si nacen cumplidas o por cumplir, no cuáles son:
    // un alta a mano y una postulación son dos puertas al mismo proceso.
    const filasVerificacion = await filasDeIncorporacion(asistenteId, prestadoraId, {
      aprobadas: politica === 'aprobado' ? APROBADAS.TODAS : APROBADAS.NINGUNA,
      revisadoPor: usuarioPanelId,
    });
    const { error: errorVerificaciones } = await db.from('verificaciones_asistente').insert(filasVerificacion);
    if (errorVerificaciones) throw new Error(errorVerificaciones.message);
  }
}

// Revierte un lote importado y rechazado por la Prestadora (panelImportacion.js /rechazar):
// mismo desarmado que el catch de crearAsistenteDirecto/crearClienteImportado, aplicado a
// todas las filas que compartan `importacionId` en vez de a una sola fila recién creada.
// Devuelven `false` si algo quedó sin limpiar, para que la pantalla pueda contar bien
// cuántas filas se revirtieron de verdad.
//
// Reciben el identificador del Legajo del Asistente o de la Ficha del cliente, que es lo que guarda
// el lote importado, y buscan de qué cuenta cuelga: son dos números distintos desde que ese
// renglón dejó de ser la cuenta.
export async function revertirAsistenteImportado(db, asistenteId, prestadoraId) {
  const cuentaId = await cuentaDeLaFila('asistentes', asistenteId, prestadoraId);
  return deshacerAlta(db, cuentaId, { prestadoraId, filas: filasDeUnAsistente(asistenteId) });
}

export async function revertirClienteImportada(db, clienteId, prestadoraId) {
  const cuentaId = await cuentaDeLaFila('clientes', clienteId, prestadoraId);
  return deshacerAlta(db, cuentaId, { prestadoraId, filas: filasDeUnaCliente(clienteId) });
}

// Suma una persona autorizada a un Cliente ya existente: crea su cuenta con
// `crearCuentaConPerfil` igual que cualquier otro rol de login propio, y en vez de una fila en
// `clientes` (eso es solo para el titular) crea la fila en `personas_autorizadas` que la vincula.
//
// Y le deja escritos los once accesos en su valor de fábrica, que es lo mismo que veía el
// personas autorizadas antes de que esto existiera: todo menos calificar al Asistente y pedir medicación.
// No es un adorno — la función de la base niega cuando no encuentra fila, así que una persona
// recién anotada y sin filas no vería absolutamente nada y nadie sabría por qué. Después, si el
// titular quiere darle menos, lo pide por escrito y se carga la instrucción.
export async function invitarPersonaAutorizada({ db, email, nombre, telefono, clienteId, prestadoraId, invitadoPor }) {
  if (!nombre || !email || !clienteId) {
    throw new ErrorConMotivo('faltan_datos', 'Faltan datos obligatorios (nombre, email, clienteId)');
  }

  // Y el Cliente tiene que ser de esta Prestadora. Sin esto, un número de Cliente de otra alcanza
  // para meterle a alguien adentro de las personas autorizadas de un Paciente ajeno, con acceso a sus
  // datos. Que hoy lo tape la pantalla que llama no es aislamiento: es que nadie probó otra puerta.
  // Falla cerrada — sin Prestadora, o si el Cliente no es suya, no se crea nada.
  if (!prestadoraId || !(await cuentaDeLaFila('clientes', clienteId, prestadoraId))) {
    throw new ErrorConMotivo('cliente_de_otra_prestadora', `cliente ${clienteId} fuera de la Prestadora`);
  }

  let miembroId;
  try {
    ({ userId: miembroId } = await crearCuentaConPerfil({
      email, nombre, telefono, rol: 'cliente', prestadoraId, enviarActivacion: true,
    }));

    const { error: errorMiembro } = await db
      .from('personas_autorizadas')
      .insert({ usuario_id: miembroId, cliente_id: clienteId, email, creado_por: invitadoPor });
    if (errorMiembro) throw new Error(errorMiembro.message);

    const { error: errorAccesos } = await db
      .from('permisos_personas_autorizadas')
      .insert(CATALOGO_PERSONAS_AUTORIZADAS.map((cosa) => ({
        cliente_id: clienteId,
        usuario_id: miembroId,
        clave: cosa.clave,
        permitido: cosa.de_fabrica,
      })));
    if (errorAccesos) throw new Error(errorAccesos.message);

    return { miembroId };
  } catch (error) {
    await deshacerAlta(db, miembroId, { prestadoraId, filas: FILAS_DE_UNA_PERSONA_AUTORIZADA });
    throw error;
  }
}

// Revoca el acceso de un miembro invitado de las personas autorizadas — borra su fila en
// `personas_autorizadas` (RLS/`ON DELETE CASCADE` no alcanza porque el borrado real es la
// cuenta completa, no la fila) y su cuenta, reutilizando `borrarCuenta` para no duplicar la
// validación de tenant que ya hace esa función.
export async function revocarPersonaAutorizada(db, usuarioId, { prestadoraId, clienteId }) {
  // La misma comprobación que al invitar, y por un motivo más fuerte: acá se borra. Los dos
  // borrados de abajo van por número de cuenta, sin Prestadora, y corren ANTES de `borrarCuenta`,
  // que es la que valida. Sin esto, un número de Cliente ajeno alcanza para dejar sin accesos a
  // una persona autorizada de otra Prestadora, y la validación llega tarde.
  if (!prestadoraId || !clienteId || !(await cuentaDeLaFila('clientes', clienteId, prestadoraId))) {
    throw new ErrorConMotivo('cliente_de_otra_prestadora', `cliente ${clienteId} fuera de la Prestadora`);
  }

  const { data: miembro, error: errorMiembro } = await db
    .from('personas_autorizadas')
    .select('cliente_id')
    .eq('usuario_id', usuarioId)
    .single();
  if (errorMiembro || !miembro || miembro.cliente_id !== clienteId) {
    // Con motivo, y no con la frase suelta que estaba antes: la frase viajaba en el cuerpo de
    // la respuesta y era texto visible escrito a mano, en un solo idioma. El motivo es un
    // código, y la frase vive en las traducciones, en los tres.
    throw new ErrorConMotivo(
      'persona_fuera_del_personas_autorizadas',
      `usuario ${usuarioId} no figura en las personas autorizadas del cliente ${clienteId}`,
    );
  }

  await db.from('permisos_personas_autorizadas').delete().eq('usuario_id', usuarioId);
  await db.from('personas_autorizadas').delete().eq('usuario_id', usuarioId);
  await borrarCuenta(usuarioId, { prestadoraId });
}

// Da de alta un Cliente que llega en una planilla importada: es la cartera que la Prestadora ya
// atendía antes de usar Careonys.
//
// El Cliente está en el Padrón: su nombre, su correo y su teléfono se guardan en su Legajo, y la
// Ficha del cliente lo apunta. Un Legajo no se borra nunca, así que si el alta se corta después
// de crearlo, la persona queda en el Padrón como contacto.
export async function crearClienteImportado({
  nombreContacto, apellidoContacto, telefono, email, localidad, plan,
  nombrePaciente, domicilioPaciente, domicilioDelPacientePartido,
  fechaNacimientoPaciente, nivelComplejidadPaciente, patologiasPaciente,
  prestadoraId, importacionId, db,
}) {
  if (!nombreContacto || !apellidoContacto || !email || !nombrePaciente) {
    throw new ErrorConMotivo('faltan_datos', 'Faltan datos obligatorios (nombreContacto, apellidoContacto, email, nombrePaciente)');
  }

  // El domicilio llega como un renglón suelto, que es lo que la planilla trae, o partido si
  // alguien lo partió. En los dos casos se guardan las partes que haya y el renglón se arma con
  // `domicilioEscrito`, que es el único lugar donde se decide dónde va cada coma. El nombre del
  // lugar se busca acá porque vive en otra tabla.
  const partes = partesDelDomicilio(domicilioDelPacientePartido);
  const nombreDeSuLugar = await nombreDelLugar(db, partes.lugar_id, prestadoraId);
  const renglonPartido = domicilioEscrito({ ...partes, lugar: nombreDeSuLugar });

  // Lo que va a quedar escrito en `pacientes.domicilio`, y su punto en el mapa si se lo puede
  // ubicar. La localidad viaja aparte porque desempata: la misma calle con el mismo número
  // existe en decenas de partidos. Si no se puede ubicar, el Paciente se da de alta igual con
  // las coordenadas en nulo (ver `geocodificacion/index.js`).
  const domicilioDelPaciente = renglonPartido || domicilioPaciente || localidad || null;
  const ubicacion = await coordenadasDeDomicilio({
    prestadoraId,
    direccion: domicilioDelPaciente,
    localidad: nombreDeSuLugar || localidad,
  });

  // Igual que en el alta de Asistente: la cuenta es la persona y la Ficha del cliente es lo suyo en
  // esta Prestadora. La misma persona puede ser Cliente en otra sin volver a darse de alta.
  let cuentaId;
  let clienteId;
  try {
    ({ userId: cuentaId } = await crearCuentaConPerfil({
      email, nombre: `${nombreContacto} ${apellidoContacto}`, telefono, rol: 'cliente', prestadoraId, enviarActivacion: true,
    }));

    const { data: legajo, error: errorLegajo } = await db
      .from('legajos')
      .insert({
        prestadora_id: prestadoraId,
        clase: 'fisica',
        nombre: nombreContacto,
        apellido: apellidoContacto,
        email,
        lugar_id: partes.lugar_id || null,
      })
      .select('id')
      .single();
    if (errorLegajo) throw new Error(errorLegajo.message);

    if (telefono) {
      const { error: errorTelefono } = await db
        .from('telefonos_del_legajo')
        .insert({ prestadora_id: prestadoraId, legajo_id: legajo.id, telefono });
      if (errorTelefono) throw new Error(errorTelefono.message);
    }

    const { data: clienteNuevo, error: errorCliente } = await db
      .from('clientes')
      .insert({
        usuario_id: cuentaId,
        legajo_id: legajo.id,
        prestadora_id: prestadoraId,
        plan: plan || null,
        importacion_id: importacionId || null,
        pendiente_conformidad: Boolean(importacionId),
      })
      .select('id')
      .single();
    if (errorCliente) throw new Error(errorCliente.message);
    clienteId = clienteNuevo.id;

    const { data: paciente, error: errorPaciente } = await db
      .from('pacientes')
      .insert({
        cliente_id: clienteId,
        nombre: nombrePaciente,
        domicilio: domicilioDelPaciente,
        ...partes,
        ...ubicacion,
        fecha_nacimiento: fechaNacimientoPaciente || null,
        nivel_complejidad: nivelComplejidadPaciente || null,
        patologias: patologiasPaciente || [],
        prestadora_id: prestadoraId,
        importacion_id: importacionId || null,
        pendiente_conformidad: Boolean(importacionId),
      })
      .select()
      .single();
    if (errorPaciente) throw new Error(errorPaciente.message);

    return { clienteId, pacienteId: paciente.id };
  } catch (error) {
    await deshacerAlta(db, cuentaId, { prestadoraId, filas: filasDeUnaCliente(clienteId) });
    throw error;
  }
}
