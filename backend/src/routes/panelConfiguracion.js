import { Router } from 'express';
import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import { acotarAPrestadora, exigirOrganizacionActiva } from '../middleware/alcancePrestadora.js';
import { clienteDelPedido, supabase } from '../db/connection.js';
import { accionesDePermisos } from '../utils/permisos.js';
import { exigirAdministracion, exigirAdminDePrestadora } from '../middleware/exigirAdministracion.js';
import { ErrorConMotivo, responderError } from '../utils/errorConMotivo.js';
import { prestadoraVisible, prestadoraVisibleOContestar } from '../utils/prestadoraVisible.js';
import {
  ACCION_CAMBIO_DE_MONEDA,
  ACCION_CAMBIO_DE_PERMISOS,
  ACCION_MODIFICACION_CRITICA,
  registrarActividad,
} from '../utils/registroDeActividad.js';
import { mensajeDelCatalogo, mezclarMensajesConCatalogo, sePuedeApagar, VALORES_POR_DEFECTO_MENSAJE } from '../utils/catalogoAvisos.js';
import { cosaDelCatalogo, mezclarVisibilidadConCatalogo } from '../utils/catalogoVisibilidad.js';
import { mensajeDeTextoQueSeGuarda } from '../utils/viaMensajeDeTexto.js';
import { hayProveedorDeMensajeDeTexto, proveedorDeMensajeDeTexto } from '../utils/mensajeDeTexto.js';
import { LIMITES_ALERTAS_IA, VALORES_POR_DEFECTO_ALERTAS_IA } from '../utils/revisarAlertasIA.js';
import { validarUmbralesPremura, validarMinutosEmergencia } from '../utils/umbralesPremura.js';
import { MINUTOS_QUE_SE_PUEDEN_TOCAR } from '../utils/ordenDeLaEscalada.js';
import {
  PERFIL_POR_DEFECTO,
  pesosYTopesDe,
  revisarCambios,
  soloLoQueCorreDelPerfil,
} from '../utils/perfilesDeCandidatos.js';
import {
  reglaDeEquipoDe,
  revisarRegla,
  soloLoQueCorreDeLaRegla,
} from '../utils/equipoDelPaciente.js';
// Con alias porque las tres funciones de configuración se llaman igual en los dos archivos: el
// molde es el mismo a propósito, y renombrarlas en el original para que no choquen acá escondería
// que son la misma clase de cosa.
import {
  reglaDeAvisoDe,
  revisarRegla as revisarReglaDeAviso,
  soloLoQueCorreDeLaRegla as soloLoQueCorreDelAviso,
} from '../utils/avisoDeAusencia.js';
import {
  reglaDelIncidenteDe,
  revisarRegla as revisarReglaDelIncidente,
  soloLoQueCorreDeLaRegla as soloLoQueCorreDelIncidente,
} from '../utils/incidenteTurnoSinCubrir.js';
import {
  reglaDeLaTomaDe,
  revisarRegla as revisarReglaDeLaToma,
  soloLoQueCorreDeLaRegla as soloLoQueCorreDeLaToma,
} from '../utils/alarmasTomadas.js';
import { darDeAltaEnMeta, traerEstadosDeMeta } from '../utils/plantillasWhatsapp.js';
import { redactarPlantillaWhatsapp, corregirPlantillaWhatsapp } from '../utils/iaPlantillasWhatsapp.js';
import { buscarLugares, listarProvincias } from '../geocodificacion/index.js';
import { agregarLugar, lugaresDeLaPrestadora, paisDeLaPrestadora } from '../utils/catalogoDeLugares.js';
import { idiomaDeLaPrestadora } from '../i18n/idiomaDeLaPrestadora.js';
import { direccionDeEnvioDe, esDireccionDeCorreo } from '../utils/email.js';
import {
  apuntarReenvioDeRespuestas,
  hayReenvioConfigurado,
  respuestasConfirmadas,
} from '../utils/reenvioDeRespuestas.js';
import { LIMITES_PREAVISO_GUARDIA } from '../utils/revisarRecordatoriosPush.js';
import { reglaDePagoDe, revisarReglaDePago, soloLoQueCorreDelPago } from '../utils/formaDePago.js';
import {
  frecuenciaDePagoDe,
  revisarFrecuenciaDePago,
  soloLoQueCorreDeLaFrecuencia,
} from '../utils/frecuenciaDePago.js';
import {
  LARGO_MINIMO_DEL_SECRETO_DEL_AVISO,
  entregaLaFactura,
  plazoQueSePuedeGuardar,
  sigueLaCobranza,
} from '../utils/facturacionDeClientes.js';
import { METROS_TOLERANCIA_POR_OMISION, MINUTOS_TOLERANCIA_POR_OMISION } from '../utils/toleranciaCheckin.js';
import {
  SEGUNDOS_EN_PANTALLA_POR_OMISION,
  SEGUNDOS_EN_PANTALLA_MINIMO,
  SEGUNDOS_EN_PANTALLA_MAXIMO,
  MINUTOS_CODIGO_DE_LA_PRESTADORA_POR_OMISION,
  MINUTOS_CODIGO_DE_LA_PRESTADORA_MINIMO,
  MINUTOS_CODIGO_DE_LA_PRESTADORA_MAXIMO,
} from '../utils/comprobacionDePresencia.js';
import { cuerpoVigente } from '../utils/consentimientoPagador.js';
import {
  IDIOMA_DEL_DOCUMENTO,
  MARCADORES,
  MODELO_DE_FABRICA,
} from '../utils/documentoConsentimientoPagador.js';
import {
  IDIOMAS_DEL_TEXTO as IDIOMAS_DEL_TEXTO_DE_MEDICACION,
  MARCADORES as MARCADORES_DE_MEDICACION,
  MODELO_DE_FABRICA as MODELO_DE_MEDICACION,
  cuerpoVigente as cuerpoDeMedicacionVigente,
  pideLaFirma as pideLaFirmaDeLaMedicacion,
} from '../utils/consentimientoMedicacion.js';

export const panelConfiguracionRouter = Router();

// Módulo 8 (Configuración) es a nivel de toda la empresa — Coordinador no entra acá,
// solo Admin/Superadmin (misma restricción que precios y escalas legales).
const soloAdministracion = exigirAdministracion('Solo Admin o Superadmin puede editar la configuración');

// El corte por "no hay Organización activa" lo pone exigirOrganizacionActiva, compartido con el
// resto de los routers (CLAUDE.md §7.12) — antes esta misma condición estaba escrita acá a mano.
panelConfiguracionRouter.use(requiereRolPanel, soloAdministracion, exigirOrganizacionActiva);

// CON LA CREDENCIAL DE QUIEN PIDE. Lo de esta ruta entra a la base con `clienteDelPedido(req)`, no
// con la llave maestra: la base sabe quién pide y le contesta sólo lo de su Prestadora. Por eso las
// consultas no llevan el filtro de la Prestadora de la sesión, y la Prestadora con la que nace una
// fila nueva es la que la base ya dejó ver (`prestadoraVisible`), no un dato de la sesión ni del
// pedido.
//
// LO QUE SIGUE CON LA MAESTRA lleva al lado un comentario que dice por qué. Son cuatro casos: lo
// que la base todavía no le deja hacer a la Administración de la Prestadora (cambiar su fila de
// `prestadoras`, escribir la forma de pago de los Asistentes, las conexiones con software externo),
// las funciones que guardan secretos o reordenan, que no se le dieron a quien inicia sesión, la
// lista de Coordinadores, que sale de `usuarios`, y el registro de actividad.

// --- Datos de la prestadora (configuracion_prestadora, ver schema_multitenant_04.sql —
//     reemplaza el singleton configuracion_empresa: cada prestadora tiene su propia fila) ---
panelConfiguracionRouter.get('/empresa', async (req, res) => {
  const db = clienteDelPedido(req);
  const { data, error } = await db
    .from('configuracion_prestadora')
    .select('*')
    .single();
  if (error) return responderError(res, error);
  res.json({ empresa: data });
});

panelConfiguracionRouter.patch('/empresa', async (req, res) => {
  // `dominio` no entra acá aunque venga en el pedido: es la dirección por la que entra esta
  // Prestadora, se le asigna sola al darla de alta y no cambia nunca
  // (`utils/direccionDeLaPrestadora.js`). Cambiarla dejaría afuera a toda su gente, que la tiene
  // anotada en el navegador. La base lo impide igual, con un disparador.
  const { nombre, telefono, telefono_emergencias, whatsapp_numero, email, zona_cobertura_texto } = req.body;
  // A diferencia de los datos que viven en `prestadoras`, esta fila puede no existir: se crea
  // en el alta y una Prestadora dada de alta a mano puede quedarse sin ella. Sin esta
  // comprobación, la pantalla de Configuración guarda, dice que guardó, y al recargar está todo
  // como antes.
  const db = clienteDelPedido(req);
  const prestadoraId = await prestadoraVisibleOContestar(db, res);
  if (!prestadoraId) return;
  // El filtro nombra la fila que se cambia —la base no acepta un cambio sin ninguno—; que sea de
  // quien pide lo decide ella.
  const { data, error } = await db
    .from('configuracion_prestadora')
    .update({ nombre, telefono, telefono_emergencias, whatsapp_numero, email, zona_cobertura_texto, updated_at: new Date().toISOString() })
    .eq('prestadora_id', prestadoraId)
    .select('prestadora_id');
  if (error) return responderError(res, error);
  if (!data?.length) return res.status(404).json({ error: 'Esta Prestadora todavía no tiene configuración cargada' });
  res.json({ ok: true });
});

// --- La moneda en la que trabaja esta Prestadora ---
//
// El dato vive en `prestadoras.moneda` y nace del país que se eligió al darla de alta. Desde
// acá se cambia, que es lo que la columna venía prometiendo desde que se escribió
// (lo dice el comentario de `prestadoras.moneda` en la base) y todavía no tenía
// pantalla.
//
// QUÉ ALCANZA EL CAMBIO. Sólo a lo que se cargue de acá en adelante: cada importe ya guardado
// lleva su propia columna `moneda`, completada por el disparador el día que se insertó, y esa
// no se toca. Un importe anotado en pesos sigue siendo en pesos aunque la Prestadora pase a
// trabajar en otra moneda, que es justamente para lo que se guarda al lado de cada cifra.
// Careonys no convierte importes ni guarda cotizaciones (`CLAUDE.md` §6).
//
// DE DÓNDE SALE LA LISTA. Del catálogo `monedas_por_pais`, que es el mismo del que sale la
// moneda al dar de alta una Prestadora. No está escrita en la pantalla ni acá: se amplía
// agregándole una fila al catálogo.

// Las monedas que el producto conoce, sin repetir y en orden. Un solo punto de verdad para las
// dos rutas de abajo: la que muestra la lista y la que comprueba lo que se eligió.
async function monedasDelCatalogo(db) {
  const { data, error } = await db.from('monedas_por_pais').select('moneda');
  if (error) throw error;
  return [...new Set((data ?? []).map((fila) => fila.moneda))].sort();
}

panelConfiguracionRouter.get('/moneda', async (req, res) => {
  try {
    const db = clienteDelPedido(req);
    const { data, error } = await db
      .from('prestadoras')
      .select('moneda')
      .single();
    if (error) throw error;

    const monedas = await monedasDelCatalogo(db);

    // La que está guardada va en la lista aunque el catálogo ya no la tenga: si no, la pantalla
    // mostraría el casillero vacío y el primer guardado cambiaría la moneda sin que nadie lo
    // pidiera.
    if (data.moneda && !monedas.includes(data.moneda)) monedas.push(data.moneda);

    res.json({ moneda: data.moneda, monedas: monedas.sort() });
  } catch (error) {
    responderError(res, error);
  }
});

panelConfiguracionRouter.patch('/moneda', async (req, res) => {
  try {
    const moneda = String(req.body?.moneda ?? '').trim().toUpperCase();
    if (!moneda) {
      return responderError(res, new ErrorConMotivo('faltan_datos', 'cambio de moneda sin moneda'));
    }

    // Se comprueba contra el catálogo antes de escribir. Sin esto, una moneda inventada la
    // rechazaría el dominio `moneda_iso` de la base, y ese error nombra el dominio y la columna.
    const db = clienteDelPedido(req);
    const monedas = await monedasDelCatalogo(db);
    if (!monedas.includes(moneda)) {
      return responderError(res, new ErrorConMotivo('moneda_desconocida', `moneda ${moneda} fuera del catálogo`));
    }

    // Cuál era la moneda antes, leída antes de pisarla: sin esto el registro puede decir que se
    // cambió la moneda pero no de cuál a cuál, y la mitad de «qué cambió» se pierde.
    const { data: antes } = await db
      .from('prestadoras')
      .select('id, moneda')
      .maybeSingle();
    if (!antes) return responderError(res, new ErrorConMotivo('no_encontrado', 'la base no deja ver la Prestadora de quien pide'));

    // CON LA MAESTRA: la base sólo le deja cambiar `prestadoras` al Superadmin, y la moneda la
    // cambia la Administración de la Prestadora. La fila que se cambia es la que la base acaba de
    // dejar ver con la credencial de quien pide.
    const { data, error } = await supabase
      .from('prestadoras')
      .update({ moneda })
      .eq('id', antes.id)
      .select('moneda');
    if (error) throw error;
    if (!data?.length) return responderError(res, new ErrorConMotivo('no_encontrado', 'la Prestadora de la sesión no existe'));

    // Cambiar la moneda de una Prestadora tiene consecuencia económica sobre todo lo que se
    // cargue de ahí en adelante, así que queda registrado: quién, cuándo, y de qué moneda a qué
    // moneda. **Ningún importe.** El código de la moneda no es un importe: dice en qué se
    // trabaja, no cuánto.
    await registrarActividad(req.usuarioPanel, ACCION_CAMBIO_DE_MONEDA, {
      tablaAfectada: 'prestadoras',
      registroId: req.usuarioPanel.prestadoraId,
      camposCambiados: ['moneda'],
      detalle: { moneda_anterior: antes?.moneda ?? null, moneda_nueva: data[0].moneda },
    });

    res.json({ moneda: data[0].moneda });
  } catch (error) {
    responderError(res, error);
  }
});

// --- Zonas de cobertura ---
panelConfiguracionRouter.get('/zonas', async (req, res) => {
  const db = clienteDelPedido(req);
  const { data, error } = await db.from('zonas_cobertura').select('*').order('orden');
  if (error) return responderError(res, error);
  res.json({ zonas: data });
});

panelConfiguracionRouter.post('/zonas', async (req, res) => {
  const { codigo, nombre, categoria, orden } = req.body;
  if (!codigo || !nombre || !categoria) {
    return res.status(400).json({ error: 'Faltan código, nombre o categoría' });
  }
  const db = clienteDelPedido(req);
  const prestadoraId = await prestadoraVisibleOContestar(db, res);
  if (!prestadoraId) return;
  const { error } = await db
    .from('zonas_cobertura')
    .insert({ codigo, nombre, categoria, orden: orden ?? 0, prestadora_id: prestadoraId });
  if (error) return responderError(res, error);
  res.json({ ok: true });
});

panelConfiguracionRouter.patch('/zonas/:id', async (req, res) => {
  const { nombre, categoria, activa, orden } = req.body;
  const db = clienteDelPedido(req);
  const { data, error } = await db
    .from('zonas_cobertura')
    .update({ nombre, categoria, activa, orden })
    .eq('id', req.params.id)
    .select('id');
  if (error) return responderError(res, error);
  if (!data?.length) return res.status(404).json({ error: 'No se encontró esa zona de cobertura' });
  res.json({ ok: true });
});

panelConfiguracionRouter.delete('/zonas/:id', async (req, res) => {
  const db = clienteDelPedido(req);
  const { data, error } = await db.from('zonas_cobertura').delete().eq('id', req.params.id).select('id');
  if (error) return responderError(res, error);
  if (!data?.length) return res.status(404).json({ error: 'No se encontró esa zona de cobertura' });
  res.json({ ok: true });
});

// --- Los lugares donde trabaja la Prestadora ---
//
// La lista de localidades y barrios de la que salen después el domicilio del Paciente, el de la
// Asistente, los lugares donde cada una acepta trabajar y qué abarca cada zona de cobertura. Es de
// un solo nivel: un barrio se distingue de una localidad nada más que por colgar de ella.

panelConfiguracionRouter.get('/lugares', async (req, res) => {
  try {
    res.json({ lugares: await lugaresDeLaPrestadora(clienteDelPedido(req), req.usuarioPanel.prestadoraId) });
  } catch (error) {
    responderError(res, error);
  }
});

// Lo que sugiere el organismo oficial del país de esta Prestadora. Es para cargar la lista, no
// para usarlo en vivo: lo que se elige acá queda guardado y de ahí en más el producto trabaja
// contra su propia lista.
panelConfiguracionRouter.get('/lugares/sugerencias', async (req, res) => {
  try {
    const lugares = await buscarLugares({
      prestadoraId: req.usuarioPanel.prestadoraId,
      texto: req.query.texto,
      provincia: req.query.provincia,
    });
    res.json({ lugares });
  } catch {
    // Si el servicio del organismo no contestó se dice eso, y no una lista vacía: vacía haría
    // creer que el lugar no existe y cargarlo a mano, duplicado. El error no se copia tal cual
    // porque llegó de un tercero (CLAUDE.md §6).
    res.status(502).json({ error: 'No se pudo consultar el servicio de direcciones. Vuelva a intentarlo.' });
  }
});

panelConfiguracionRouter.get('/lugares/provincias', async (req, res) => {
  try {
    res.json({ provincias: await listarProvincias({ prestadoraId: req.usuarioPanel.prestadoraId }) });
  } catch {
    res.status(502).json({ error: 'No se pudo consultar el servicio de direcciones. Vuelva a intentarlo.' });
  }
});

panelConfiguracionRouter.post('/lugares', async (req, res) => {
  const { nombre, provincia, municipio, id_oficial, localidad_censal, parte_de, lat, lng } = req.body;
  if (!String(nombre ?? '').trim()) {
    return res.status(400).json({ error: 'Falta el nombre del lugar' });
  }
  // El país es el de la Prestadora y no viaja en el pedido: un lugar de una Prestadora argentina
  // es argentino, y un valor que llega de afuera lo escribe quien llama.
  const db = clienteDelPedido(req);
  let pais;
  let prestadoraId;
  try {
    prestadoraId = await prestadoraVisible(db);
    pais = await paisDeLaPrestadora(db, prestadoraId);
  } catch (error) {
    return responderError(res, error);
  }
  if (!pais) return res.status(400).json({ error: 'La Prestadora todavía no tiene país configurado' });

  try {
    const id = await agregarLugar(db, {
      prestadoraId, pais, nombre, provincia, municipio,
      idOficial: id_oficial, localidadCensal: localidad_censal, parteDe: parte_de, lat, lng,
    });
    res.json({ ok: true, id });
  } catch (error) {
    responderError(res, error);
  }
});

// Un lugar donde se dejó de trabajar se apaga y no se borra: hay fichas, domicilios y zonas que lo
// nombran, y borrarlo dejaría a esas filas sin poder decir dónde estaban.
panelConfiguracionRouter.patch('/lugares/:id', async (req, res) => {
  const { nombre, activo, parte_de } = req.body;
  const cambios = {};
  if (nombre !== undefined) cambios.nombre = String(nombre).trim();
  if (activo !== undefined) cambios.activo = Boolean(activo);
  if (parte_de !== undefined) cambios.parte_de = parte_de ?? null;
  if (!Object.keys(cambios).length) return res.status(400).json({ error: 'No hay nada para cambiar' });
  cambios.updated_at = new Date().toISOString();

  const db = clienteDelPedido(req);
  let query = db.from('lugares').update(cambios).eq('id', req.params.id);
  // El nombre de un lugar oficial es el del organismo y no se edita a mano: si se pudiera, dos
  // Prestadoras terminarían llamando distinto a la misma localidad y el identificador diría una
  // cosa y la pantalla otra.
  if (cambios.nombre !== undefined) query = query.eq('fuente', 'propio');
  const { data, error } = await query.select('id');
  if (error) return responderError(res, error);
  if (!data?.length) return res.status(404).json({ error: 'No se encontró ese lugar, o su nombre lo pone el organismo oficial' });
  res.json({ ok: true });
});

// --- Qué lugares abarca cada zona de cobertura ---
//
// Agrupar es decisión de cada Prestadora: el organismo oficial sirve de referencia para sugerir,
// nunca para imponer. Un mismo lugar puede estar en más de una zona.

panelConfiguracionRouter.get('/zonas/:id/lugares', async (req, res) => {
  const db = clienteDelPedido(req);
  const { data, error } = await db.from('zona_lugares').select('lugar_id').eq('zona_id', req.params.id);
  if (error) return responderError(res, error);
  res.json({ lugares: (data ?? []).map((fila) => fila.lugar_id) });
});

panelConfiguracionRouter.put('/zonas/:id/lugares', async (req, res) => {
  const lugares = Array.isArray(req.body?.lugares) ? req.body.lugares : null;
  if (!lugares) return res.status(400).json({ error: 'Falta la lista de lugares' });

  const db = clienteDelPedido(req);
  // Que la zona sea de esta Organización se comprueba antes de borrar nada: si la base no la deja
  // ver, es de otra Prestadora y no se toca ningún renglón.
  const { data: zona, error: errorZona } = await db
    .from('zonas_cobertura')
    .select('id, prestadora_id')
    .eq('id', req.params.id)
    .maybeSingle();
  if (errorZona) return responderError(res, errorZona);
  if (!zona) return res.status(404).json({ error: 'No se encontró esa zona de cobertura' });

  const { error: errorBorrado } = await db
    .from('zona_lugares')
    .delete()
    .eq('zona_id', zona.id);
  if (errorBorrado) return responderError(res, errorBorrado);

  if (lugares.length) {
    // Los renglones nacen con la Prestadora de la zona que la base dejó ver.
    const { error } = await db.from('zona_lugares').insert(
      lugares.map((lugarId) => ({ zona_id: zona.id, lugar_id: lugarId, prestadora_id: zona.prestadora_id })),
    );
    // Si alguno de los lugares no es de esta Organización, la clave foránea compuesta lo rechaza y
    // no entra ninguno.
    if (error) return responderError(res, error);
  }
  res.json({ ok: true });
});

// --- Servicios: escalada de relevo (protocolo de continuidad de guardia) ---
panelConfiguracionRouter.get('/escalada-relevo', async (req, res) => {
  const db = clienteDelPedido(req);
  const { data, error } = await db.from('configuracion_escalada_relevo').select('*').order('nivel');
  if (error) return responderError(res, error);
  res.json({ niveles: data });
});

panelConfiguracionRouter.post('/escalada-relevo', async (req, res) => {
  const { nivel, minutos_demora, orden_prioridad, plantilla_mensaje } = req.body;
  if (!nivel || !plantilla_mensaje) {
    return res.status(400).json({ error: 'Faltan nivel o plantilla de mensaje' });
  }
  const db = clienteDelPedido(req);
  const prestadoraId = await prestadoraVisibleOContestar(db, res);
  if (!prestadoraId) return;
  const { error } = await db
    .from('configuracion_escalada_relevo')
    .insert({ nivel, minutos_demora, orden_prioridad, plantilla_mensaje, prestadora_id: prestadoraId });
  if (error) return responderError(res, error);
  res.json({ ok: true });
});

panelConfiguracionRouter.patch('/escalada-relevo/:id', async (req, res) => {
  const { nivel, minutos_demora, orden_prioridad, plantilla_mensaje } = req.body;
  const db = clienteDelPedido(req);
  const { data, error } = await db
    .from('configuracion_escalada_relevo')
    .update({ nivel, minutos_demora, orden_prioridad, plantilla_mensaje })
    .eq('id', req.params.id)
    .select('id');
  if (error) return responderError(res, error);
  if (!data?.length) return res.status(404).json({ error: 'No se encontró ese nivel de la escalada de relevo' });
  res.json({ ok: true });
});

panelConfiguracionRouter.delete('/escalada-relevo/:id', async (req, res) => {
  const db = clienteDelPedido(req);
  const { data, error } = await db.from('configuracion_escalada_relevo').delete().eq('id', req.params.id).select('id');
  if (error) return responderError(res, error);
  if (!data?.length) return res.status(404).json({ error: 'No se encontró ese nivel de la escalada de relevo' });
  res.json({ ok: true });
});

// --- Servicios: etapas del Proceso de Incorporación de Asistentes, configurables por
//     prestadora (pendiente #18 candidato 7, docs/PLAN_HASTA_PRODUCCION.md — ver
//     supabase/migrations/). Alta/edición/reordenamiento
//     desde el Panel; sin DELETE — se discontinúa con el toggle "activa" para no romper
//     verificaciones_asistente ya existentes que referencian esa etapa. ---
panelConfiguracionRouter.get('/etapas-incorporacion', async (req, res) => {
  const db = clienteDelPedido(req);
  const { data, error } = await db
    .from('etapas_incorporacion_asistente')
    .select('*')
    .order('orden');
  if (error) return responderError(res, error);
  res.json({ etapas: data });
});

panelConfiguracionRouter.post('/etapas-incorporacion', async (req, res) => {
  const { clave, nombre } = req.body;
  if (!clave || !nombre) return res.status(400).json({ error: 'Faltan clave o nombre' });
  const db = clienteDelPedido(req);
  const prestadoraId = await prestadoraVisibleOContestar(db, res);
  if (!prestadoraId) return;
  const { data: maxOrden, error: errorMax } = await db
    .from('etapas_incorporacion_asistente')
    .select('orden')
    .order('orden', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (errorMax) return responderError(res, errorMax);
  const { error } = await db
    .from('etapas_incorporacion_asistente')
    .insert({ clave, nombre, orden: (maxOrden?.orden ?? 0) + 1, prestadora_id: prestadoraId });
  if (error) return responderError(res, error);
  res.json({ ok: true });
});

panelConfiguracionRouter.patch('/etapas-incorporacion/:id', async (req, res) => {
  const { nombre, activa } = req.body;
  const db = clienteDelPedido(req);
  const { data, error } = await db
    .from('etapas_incorporacion_asistente')
    .update({ nombre, activa })
    .eq('id', req.params.id)
    .select('id');
  if (error) return responderError(res, error);
  if (!data?.length) return res.status(404).json({ error: 'No se encontró esa etapa del Proceso de Incorporación de Asistentes' });
  res.json({ ok: true });
});

// Reordena una etapa moviéndola una posición hacia arriba o abajo — intercambia su
// "orden" con el de la etapa vecina (misma prestadora).
panelConfiguracionRouter.patch('/etapas-incorporacion/:id/mover', async (req, res) => {
  const { direccion } = req.body;
  if (direccion !== 'arriba' && direccion !== 'abajo') {
    return res.status(400).json({ error: 'direccion debe ser "arriba" o "abajo"' });
  }
  const db = clienteDelPedido(req);
  const { data: etapas, error: errorEtapas } = await db
    .from('etapas_incorporacion_asistente')
    .select('*')
    .order('orden');
  if (errorEtapas) return responderError(res, errorEtapas);

  const indice = etapas.findIndex((e) => e.id === req.params.id);
  if (indice === -1) return res.status(404).json({ error: 'Etapa no encontrada' });
  const indiceVecino = direccion === 'arriba' ? indice - 1 : indice + 1;
  if (indiceVecino < 0 || indiceVecino >= etapas.length) return res.json({ ok: true });

  const actual = etapas[indice];
  const vecino = etapas[indiceVecino];
  // CON LA MAESTRA: la función que intercambia el orden no se le dio a quien inicia sesión. Las
  // dos etapas que recibe son las que la base acaba de dejar ver con la credencial de quien pide.
  const { error: errorSwap } = await supabase.rpc('intercambiar_orden_etapas_incorporacion', {
    p_id_a: actual.id, p_orden_a: vecino.orden, p_id_b: vecino.id, p_orden_b: actual.orden,
  });
  if (errorSwap) return responderError(res, errorSwap);
  res.json({ ok: true });
});

// --- Servicios: personal de emergencia (roster de suplentes/franqueros/emergencia
//     disponibles para el protocolo de continuidad de guardia, Parte 2 de Módulo 6) ---
panelConfiguracionRouter.get('/personal-emergencia', async (req, res) => {
  // Queda con la llave maestra y el filtro de la Prestadora: el nombre embebido sale de
  // `asistentes`, donde la política restrictiva `oculta_pendientes_de_conformidad` esconde al
  // Asistente importado que todavía espera conformidad (`pendiente_conformidad = true`), para
  // superadmin y admin_prestadora por igual; con la credencial de la persona su nombre saldría
  // vacío en esta lista, y antes se mostraba. Se decide aparte.
  let query = supabase
    .from('personal_emergencia')
    .select('id, asistente_id, tipo, activo, created_at, asistentes(nombre)')
    .order('created_at', { ascending: false });
  query = acotarAPrestadora(query, req.usuarioPanel);
  const { data, error } = await query;
  if (error) return responderError(res, error);
  res.json({ personal: data });
});

panelConfiguracionRouter.post('/personal-emergencia', async (req, res) => {
  const { asistente_id, tipo } = req.body;
  if (!asistente_id || !tipo) {
    return res.status(400).json({ error: 'Faltan asistente_id o tipo' });
  }
  const db = clienteDelPedido(req);
  const prestadoraId = await prestadoraVisibleOContestar(db, res);
  if (!prestadoraId) return;
  const { error } = await db
    .from('personal_emergencia')
    .insert({ asistente_id, tipo, prestadora_id: prestadoraId });
  if (error) return responderError(res, error);
  res.json({ ok: true });
});

panelConfiguracionRouter.patch('/personal-emergencia/:id', async (req, res) => {
  const { activo } = req.body;
  const db = clienteDelPedido(req);
  const { data, error } = await db.from('personal_emergencia').update({ activo }).eq('id', req.params.id).select('id');
  if (error) return responderError(res, error);
  if (!data?.length) return res.status(404).json({ error: 'No se encontró a esa persona en el personal de emergencia' });
  res.json({ ok: true });
});

panelConfiguracionRouter.delete('/personal-emergencia/:id', async (req, res) => {
  const db = clienteDelPedido(req);
  const { data, error } = await db.from('personal_emergencia').delete().eq('id', req.params.id).select('id');
  if (error) return responderError(res, error);
  if (!data?.length) return res.status(404).json({ error: 'No se encontró a esa persona en el personal de emergencia' });
  res.json({ ok: true });
});

// --- Configuración de notificaciones ---
// configuracion_notificaciones pasó a ser por prestadora el 2026-07-13
// (supabase/migrations/) — antes era una fila global por
// evento, compartida sin darse cuenta por todas las prestadoras licenciatarias.
//
// La pantalla muestra SIEMPRE los ocho mensajes del catálogo (utils/catalogoAvisos.js), tenga
// o no tenga fila guardada cada uno. Antes devolvía solo las filas existentes, así que un
// mensaje sin sembrar era invisible y no se podía apagar aunque se siguiera mandando.
//
// Y la vía «mensaje de texto» sale siempre en la lista, con o sin proveedor contratado. Sin
// proveedor viaja marcada como no disponible, y la pantalla la muestra sin dejar elegirla: el
// producto no esconde una vía que existe, y tampoco ofrece una que hoy no manda nada.
panelConfiguracionRouter.get('/notificaciones', async (req, res) => {
  const db = clienteDelPedido(req);
  const { data, error } = await db
    .from('configuracion_notificaciones')
    .select('evento, descripcion, emails, activo, whatsapp_activo, mensaje_de_texto_activo, notificar_cliente, plantilla_whatsapp_id');
  if (error) return responderError(res, error);

  const hayProveedor = await hayProveedorDeMensajeDeTexto(req.usuarioPanel.prestadoraId);
  res.json({ notificaciones: mezclarMensajesConCatalogo(data, { hayProveedorDeMensajeDeTexto: hayProveedor }) });
});

// Cómo está la vía del mensaje de texto en esta Prestadora. Es lo que la pantalla necesita para
// decir si hay proveedor, y el único lugar donde se le cuenta a quien configura que ésta es la vía
// débil. No hay PATCH: cargar un proveedor es cargar datos —una fila en el catálogo y otra en la
// configuración—, y no hay ninguno contratado que ofrecer en una pantalla.
panelConfiguracionRouter.get('/mensaje-de-texto', async (req, res) => {
  const db = clienteDelPedido(req);
  const { data, error } = await db
    .from('catalogo_proveedores_de_mensaje_de_texto')
    .select('proveedor')
    .eq('activo', true);
  if (error) return responderError(res, error);

  const proveedor = await proveedorDeMensajeDeTexto(req.usuarioPanel.prestadoraId);
  res.json({
    mensaje_de_texto: {
      hay_proveedor: proveedor !== null,
      proveedor: proveedor?.proveedor ?? null,
      // Cuántos conoce el producto. Con el catálogo vacío no hay nada que elegir en ninguna
      // Prestadora, y eso no es lo mismo que esta Prestadora todavía no haber elegido.
      proveedores_conocidos: (data ?? []).length,
    },
  });
});

// Inserción-o-actualización, no actualización a secas: la primera vez que la Prestadora toca
// un mensaje, la fila todavía no existe y un UPDATE no hacía nada (guardaba en silencio y no
// guardaba nada). La descripción sale del catálogo, nunca del navegador.
panelConfiguracionRouter.patch('/notificaciones/:evento', async (req, res) => {
  const mensaje = mensajeDelCatalogo(req.params.evento);
  if (!mensaje) return res.status(400).json({ error: 'Mensaje desconocido' });

  const { emails, activo, whatsapp_activo, mensaje_de_texto_activo, notificar_cliente, plantilla_whatsapp_id } = req.body;

  // Si la vía del mensaje de texto se puede encender no lo decide el navegador: sin proveedor
  // cargado se guarda apagada aunque venga encendida. La pantalla ya no deja elegirla, pero la
  // pantalla no es la que manda: el pedido se puede armar a mano.
  const db = clienteDelPedido(req);
  const prestadoraId = await prestadoraVisibleOContestar(db, res);
  if (!prestadoraId) return;
  const hayProveedor = await hayProveedorDeMensajeDeTexto(prestadoraId);

  // La plantilla se guarda sólo si la base la deja ver, que es lo mismo que decir que es de esta
  // Prestadora. El identificador viene del navegador: sin esta comprobación, una Prestadora podría
  // mandar sus mensajes con la plantilla de otra.
  let plantillaId = null;
  if (mensaje.admite_whatsapp && plantilla_whatsapp_id) {
    const { data: plantilla } = await db
      .from('plantillas_whatsapp')
      .select('id')
      .eq('id', plantilla_whatsapp_id)
      .maybeSingle();
    if (!plantilla) return res.status(400).json({ error: 'Plantilla desconocida' });
    plantillaId = plantilla.id;
  }

  const { error } = await db.from('configuracion_notificaciones').upsert(
    {
      prestadora_id: prestadoraId,
      evento: mensaje.evento,
      descripcion: mensaje.descripcion,
      emails: Array.isArray(emails) ? emails.map((correo) => String(correo).trim()).filter(Boolean) : [...VALORES_POR_DEFECTO_MENSAJE.emails],
      // Un mensaje que la persona está esperando para poder seguir no se apaga aunque el navegador
      // lo mande apagado: la pantalla no ofrece esa casilla, y el emisor tampoco la obedecería.
      activo: sePuedeApagar(mensaje) ? (activo === undefined ? VALORES_POR_DEFECTO_MENSAJE.activo : Boolean(activo)) : true,
      // Un canal que este mensaje no usa se guarda apagado aunque el navegador lo mande
      // encendido: dejarlo prendido haría creer que el mensaje sale por ahí, y no sale.
      whatsapp_activo: mensaje.admite_whatsapp ? Boolean(whatsapp_activo) : false,
      mensaje_de_texto_activo: mensajeDeTextoQueSeGuarda({
        mensaje,
        hayProveedor,
        pedido: mensaje_de_texto_activo,
      }),
      notificar_cliente: mensaje.admite_cliente ? Boolean(notificar_cliente) : false,
      plantilla_whatsapp_id: plantillaId,
    },
    { onConflict: 'evento,prestadora_id' }
  );
  if (error) return responderError(res, error);
  res.json({ ok: true });
});

// --- Cuánto antes se le recuerda a la Asistente su próxima guardia. Estaba escrito fijo en
//     una hora para todas las Prestadoras (utils/revisarRecordatoriosPush.js), y una hora no
//     le sirve a todas: quien trabaja con guardias de doce horas quiere avisar la noche
//     anterior. Mismo patrón que /guardias/horizonte-generacion: el valor vive en
//     "prestadoras" y se expone acá para reusar el acotado por Prestadora de este router. ---
panelConfiguracionRouter.get('/aviso-previo-guardia', async (req, res) => {
  const db = clienteDelPedido(req);
  const { data, error } = await db
    .from('prestadoras')
    .select('minutos_aviso_previo_guardia')
    .single();
  if (error) return responderError(res, error);
  res.json({ minutos_aviso_previo_guardia: data.minutos_aviso_previo_guardia });
});

panelConfiguracionRouter.patch('/aviso-previo-guardia', async (req, res) => {
  const { minutos } = req.body;
  if (
    !Number.isInteger(minutos)
    || minutos < LIMITES_PREAVISO_GUARDIA.minimo
    || minutos > LIMITES_PREAVISO_GUARDIA.maximo
  ) {
    return res.status(400).json({
      error: `La anticipación tiene que ser un número entero de minutos, entre ${LIMITES_PREAVISO_GUARDIA.minimo} y ${LIMITES_PREAVISO_GUARDIA.maximo}.`,
    });
  }
  const prestadoraId = await prestadoraVisibleOContestar(clienteDelPedido(req), res);
  if (!prestadoraId) return;
  // CON LA MAESTRA: la base sólo le deja cambiar `prestadoras` al Superadmin. La fila es la que la
  // base acaba de dejar ver con la credencial de quien pide.
  const { error } = await supabase
    .from('prestadoras')
    .update({ minutos_aviso_previo_guardia: minutos })
    .eq('id', prestadoraId);
  if (error) return responderError(res, error);
  res.json({ ok: true });
});

// --- Revisión con IA de los reportes (IA Nivel 2): palabras clave que disparan la revisión
//     inmediata, cuántos reportes se miran y a quién se entera de cada nivel de alerta.
//     Hasta ahora las palabras clave solo se podían cambiar por SQL directo contra la base, y
//     el resto estaba escrito fijo en utils/revisarAlertasIA.js — las dos cosas en contra de
//     "Configuración sobre programación" (CLAUDE.md §2). Mismo patrón que /ausencia-automatica. ---
panelConfiguracionRouter.get('/alertas-ia', async (req, res) => {
  const prestadoraId = req.usuarioPanel.prestadoraId;
  // Queda con la llave maestra y el filtro de la Prestadora: en `configuracion_alertas_ia` la
  // única política del Panel que alcanza al administrador, `admin_gestiona_configuracion_alertas_ia`,
  // exige rol admin_prestadora, y no hay ninguna para superadmin; con su credencial no vería la
  // fila y la pantalla le mostraría los valores de fábrica. Se decide aparte.
  const { data, error } = await supabase
    .from('configuracion_alertas_ia')
    .select('palabras_clave, reportes_a_analizar, roja_avisa_cliente, amarilla_avisa_cliente, amarilla_avisa_coordinador')
    .eq('prestadora_id', prestadoraId)
    .maybeSingle();
  if (error) return responderError(res, error);
  res.json({ configuracion: data || { ...VALORES_POR_DEFECTO_ALERTAS_IA } });
});

panelConfiguracionRouter.patch('/alertas-ia', async (req, res) => {
  const {
    palabras_clave, reportes_a_analizar,
    roja_avisa_cliente, amarilla_avisa_cliente, amarilla_avisa_coordinador,
  } = req.body;

  if (!Array.isArray(palabras_clave)) {
    return res.status(400).json({ error: 'palabras_clave debe ser una lista de textos' });
  }
  if (
    !Number.isInteger(reportes_a_analizar)
    || reportes_a_analizar < LIMITES_ALERTAS_IA.reportes_a_analizar_minimo
    || reportes_a_analizar > LIMITES_ALERTAS_IA.reportes_a_analizar_maximo
  ) {
    return res.status(400).json({
      error: `reportes_a_analizar debe ser un entero entre ${LIMITES_ALERTAS_IA.reportes_a_analizar_minimo} y ${LIMITES_ALERTAS_IA.reportes_a_analizar_maximo}`,
    });
  }

  // "Fiebre", " fiebre" y "FIEBRE" son la misma palabra: el disparo inmediato compara en
  // minúsculas (routes/appAsistentes.js), así que se guardan ya normalizadas y sin repetir.
  const palabrasNormalizadas = [
    ...new Set(
      palabras_clave
        .map((palabra) => String(palabra).trim().toLowerCase())
        .filter(Boolean)
    ),
  ];

  // Queda con la llave maestra y el filtro de la Prestadora: la política de escritura de
  // `configuracion_alertas_ia`, `admin_gestiona_configuracion_alertas_ia`, exige rol
  // admin_prestadora, y superadmin, que llega a esta ruta, dejaría de poder guardar. Se decide aparte.
  const { error } = await supabase.from('configuracion_alertas_ia').upsert({
    prestadora_id: req.usuarioPanel.prestadoraId,
    palabras_clave: palabrasNormalizadas,
    reportes_a_analizar,
    roja_avisa_cliente: Boolean(roja_avisa_cliente),
    amarilla_avisa_cliente: Boolean(amarilla_avisa_cliente),
    amarilla_avisa_coordinador: Boolean(amarilla_avisa_coordinador),
    updated_at: new Date().toISOString(),
  });
  if (error) return responderError(res, error);
  res.json({ ok: true });
});

// --- Qué muestran las dos aplicaciones de teléfono. La lista completa sale del catálogo del
//     backend (utils/catalogoVisibilidad.js) y la pantalla la muestra entera, tenga o no fila
//     guardada cada interruptor; la tabla solo guarda lo que la Prestadora cambió. Mismo patrón
//     que /notificaciones. ---
panelConfiguracionRouter.get('/visibilidad-app', async (req, res) => {
  // Queda con la llave maestra y el filtro de la Prestadora: en `configuracion_visibilidad_app`
  // la única política del Panel que alcanza al administrador, `admin_gestiona_visibilidad_app`,
  // exige rol admin_prestadora, y no hay ninguna para superadmin; con su credencial no vería lo
  // guardado y la pantalla le mostraría el catálogo de fábrica. Se decide aparte.
  const { data, error } = await supabase
    .from('configuracion_visibilidad_app')
    .select('clave, visible')
    .eq('prestadora_id', req.usuarioPanel.prestadoraId);
  if (error) return responderError(res, error);
  res.json({ visibilidad: mezclarVisibilidadConCatalogo(data) });
});

// Inserción-o-actualización, no actualización a secas: la primera vez que la Prestadora toca
// un interruptor la fila todavía no existe, y un UPDATE guardaría en silencio sin guardar nada.
// La clave se valida contra el catálogo: lo que mande el navegador que no esté en la lista no
// se guarda, para que no queden filas de interruptores que no existen.
panelConfiguracionRouter.patch('/visibilidad-app/:clave', async (req, res) => {
  const cosa = cosaDelCatalogo(req.params.clave);
  if (!cosa) return res.status(400).json({ error: 'Esa opción no existe' });

  const { visible } = req.body || {};
  if (typeof visible !== 'boolean') {
    return res.status(400).json({ error: 'Falta decir si se muestra o no' });
  }

  // Queda con la llave maestra y el filtro de la Prestadora: la política de escritura de
  // `configuracion_visibilidad_app`, `admin_gestiona_visibilidad_app`, exige rol
  // admin_prestadora, y superadmin, que llega a esta ruta, dejaría de poder guardar. Se decide aparte.
  const { error } = await supabase.from('configuracion_visibilidad_app').upsert(
    {
      prestadora_id: req.usuarioPanel.prestadoraId,
      clave: cosa.clave,
      visible,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'prestadora_id,clave' }
  );
  if (error) return responderError(res, error);
  res.json({ ok: true });
});

// --- Cómo se ordena la lista de candidatos para un hueco. Tres formas armadas y, para quien
//     quiera, el detalle abierto número por número. Las tres formas, los valores de fábrica y el
//     borde de cada número están en utils/perfilesDeCandidatos.js, que es copia del original del
//     Panel: así el backend comprueba contra la misma lista con la que el Panel dibuja la pantalla.
//
//     Se guarda solamente lo que corre respecto del perfil elegido, nunca la tabla entera:
//     guardar los cuarenta números congelaría los valores de fábrica apenas alguien abriera la
//     pantalla y le diera a guardar sin tocar nada. ---
panelConfiguracionRouter.get('/calculo-candidatos', async (req, res) => {
  const db = clienteDelPedido(req);
  const { data, error } = await db
    .from('configuracion_calculo_candidatos')
    .select('perfil, pesos, topes')
    .maybeSingle();
  if (error) return responderError(res, error);

  // La fila puede no existir —una Prestadora que nunca entró acá—, y eso no es un error: es la
  // configuración de fábrica. La pantalla necesita las tres capas para poder mostrar cada número
  // con su valor efectivo y saber cuáles fueron corridos a mano.
  const guardado = data ?? { perfil: PERFIL_POR_DEFECTO, pesos: {}, topes: {} };
  const efectivo = pesosYTopesDe(guardado);
  res.json({
    configuracion: {
      perfil: efectivo.perfil,
      pesos: efectivo.pesos,
      topes: efectivo.topes,
      corridos: { pesos: guardado.pesos ?? {}, topes: guardado.topes ?? {} },
    },
  });
});

panelConfiguracionRouter.put('/calculo-candidatos', async (req, res) => {
  const { perfil, pesos, topes } = req.body || {};

  // Llega la tabla completa desde la pantalla; acá se queda solamente lo que difiere del perfil.
  const corridos = soloLoQueCorreDelPerfil(perfil, pesos, topes);
  const revision = revisarCambios(perfil, corridos.pesos, corridos.topes);
  if (!revision.ok) {
    return res.status(400).json({ error: `El valor de «${revision.clave}» está fuera de lo permitido` });
  }

  const db = clienteDelPedido(req);
  const prestadoraId = await prestadoraVisibleOContestar(db, res);
  if (!prestadoraId) return;
  const { error } = await db.from('configuracion_calculo_candidatos').upsert(
    {
      prestadora_id: prestadoraId,
      perfil: perfil ?? PERFIL_POR_DEFECTO,
      pesos: corridos.pesos,
      topes: corridos.topes,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'prestadora_id' }
  );
  if (error) return responderError(res, error);
  res.json({ ok: true });
});

// --- Con cuántos turnos se entra solo al equipo de un Paciente ---
//
// El equipo se arma solo y lo corrige la Coordinadora. Acá se guarda nada más que con cuántos
// turnos, y en qué ventana de días, alguien entra sin que nadie la ponga.

panelConfiguracionRouter.get('/equipo-paciente', async (req, res) => {
  const db = clienteDelPedido(req);
  const { data, error } = await db
    .from('configuracion_equipo_paciente')
    .select('regla')
    .maybeSingle();
  if (error) return responderError(res, error);

  // Que la fila no exista no es un error: es la configuración de fábrica.
  const corrido = data?.regla ?? {};
  res.json({ configuracion: { regla: reglaDeEquipoDe(corrido), corridos: corrido } });
});

panelConfiguracionRouter.put('/equipo-paciente', async (req, res) => {
  // Llega la regla completa desde la pantalla; acá se queda solamente lo que difiere de fábrica.
  const corridos = soloLoQueCorreDeLaRegla(req.body?.regla);
  const revision = revisarRegla(corridos);
  if (!revision.ok) {
    return res.status(400).json({ error: `El valor de «${revision.clave}» está fuera de lo permitido` });
  }

  const db = clienteDelPedido(req);
  const prestadoraId = await prestadoraVisibleOContestar(db, res);
  if (!prestadoraId) return;
  const { error } = await db.from('configuracion_equipo_paciente').upsert(
    {
      prestadora_id: prestadoraId,
      regla: corridos,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'prestadora_id' }
  );
  if (error) return responderError(res, error);
  res.json({ ok: true });
});

// --- Con cuánta anticipación una ausencia se considera avisada con tiempo ---
//
// De acá sale si una falta le llega a la Coordinadora como tarea o como alarma. Es la misma forma
// que la configuración del equipo: se guarda solamente lo que esta Prestadora corrió, y la
// pantalla recibe además los valores que están rigiendo.

panelConfiguracionRouter.get('/ausencias', async (req, res) => {
  const db = clienteDelPedido(req);
  const { data, error } = await db
    .from('configuracion_ausencias')
    .select('regla')
    .maybeSingle();
  if (error) return responderError(res, error);

  // Que la fila no exista no es un error: es la configuración de fábrica.
  const corrido = data?.regla ?? {};
  res.json({ configuracion: { regla: reglaDeAvisoDe(corrido), corridos: corrido } });
});

panelConfiguracionRouter.put('/ausencias', async (req, res) => {
  const corridos = soloLoQueCorreDelAviso(req.body?.regla);
  const revision = revisarReglaDeAviso(corridos);
  if (!revision.ok) {
    return res.status(400).json({ error: `El valor de «${revision.clave}» está fuera de lo permitido` });
  }

  const db = clienteDelPedido(req);
  const prestadoraId = await prestadoraVisibleOContestar(db, res);
  if (!prestadoraId) return;
  const { error } = await db.from('configuracion_ausencias').upsert(
    {
      prestadora_id: prestadoraId,
      regla: corridos,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'prestadora_id' }
  );
  if (error) return responderError(res, error);
  res.json({ ok: true });
});

// --- A cuántas horas un turno sin nadie se vuelve un incidente grave ---
//
// Los dos números con los que el backend abre el incidente y le insiste a quien coordina. Lo que no
// se configura acá es el destino ni si el recordatorio se manda: un defecto grave no se apaga, y
// el destinatario es quien coordina a ese Paciente, no una dirección elegible.

panelConfiguracionRouter.get('/incidentes-turno-sin-cubrir', async (req, res) => {
  const db = clienteDelPedido(req);
  const { data, error } = await db
    .from('configuracion_incidentes_turno_sin_cubrir')
    .select('regla')
    .maybeSingle();
  if (error) return responderError(res, error);

  // Que la fila no exista no es un error: es la configuración de fábrica.
  const corrido = data?.regla ?? {};
  res.json({ configuracion: { regla: reglaDelIncidenteDe(corrido), corridos: corrido } });
});

panelConfiguracionRouter.put('/incidentes-turno-sin-cubrir', async (req, res) => {
  const corridos = soloLoQueCorreDelIncidente(req.body?.regla);
  const revision = revisarReglaDelIncidente(corridos);
  if (!revision.ok) {
    return res.status(400).json({ error: `El valor de «${revision.clave}» está fuera de lo permitido` });
  }

  const db = clienteDelPedido(req);
  const prestadoraId = await prestadoraVisibleOContestar(db, res);
  if (!prestadoraId) return;
  const { error } = await db.from('configuracion_incidentes_turno_sin_cubrir').upsert(
    {
      prestadora_id: prestadoraId,
      regla: corridos,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'prestadora_id' }
  );
  if (error) return responderError(res, error);
  res.json({ ok: true });
});

// --- Cuánto dura hacerse cargo de una alarma ---
//
// El único número del «la tomo yo»: cuántos minutos una alarma deja de insistir desde que alguien
// dice que la está atendiendo. No apaga nada para siempre, y ésa es la razón por la que se
// configura: cuando el rato se cumple, la alarma vuelve como si nadie la hubiera tomado.

panelConfiguracionRouter.get('/alarmas-tomadas', async (req, res) => {
  const db = clienteDelPedido(req);
  const { data, error } = await db
    .from('configuracion_alarmas_tomadas')
    .select('regla')
    .maybeSingle();
  if (error) return responderError(res, error);

  // Que la fila no exista no es un error: es la configuración de fábrica.
  const corrido = data?.regla ?? {};
  res.json({ configuracion: { regla: reglaDeLaTomaDe(corrido), corridos: corrido } });
});

panelConfiguracionRouter.put('/alarmas-tomadas', async (req, res) => {
  const corridos = soloLoQueCorreDeLaToma(req.body?.regla);
  const revision = revisarReglaDeLaToma(corridos);
  if (!revision.ok) {
    return res.status(400).json({ error: `El valor de «${revision.clave}» está fuera de lo permitido` });
  }

  const db = clienteDelPedido(req);
  const prestadoraId = await prestadoraVisibleOContestar(db, res);
  if (!prestadoraId) return;
  const { error } = await db.from('configuracion_alarmas_tomadas').upsert(
    {
      prestadora_id: prestadoraId,
      regla: corridos,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'prestadora_id' }
  );
  if (error) return responderError(res, error);
  res.json({ ok: true });
});

// --- Cómo se le paga el período a quien cobra un monto fijo ---
//
// A quien cobra por hora o por guardia se le paga lo que hizo, y no hay nada que decidir. La
// pregunta aparece con el monto fijo —por semana o por mes— cuando la persona entró o se fue a
// mitad del período: o se le paga la parte de los días que estuvo, o se le paga el monto entero.
// Las dos formas se usan, y cuál corresponde lo arregla la Prestadora con cada persona, así que
// acá está el valor con el que sale de fábrica —la parte proporcional— y la Prestadora lo cambia.

panelConfiguracionRouter.get('/pago-asistentes', async (req, res) => {
  const db = clienteDelPedido(req);
  const { data, error } = await db
    .from('configuracion_pago_asistentes')
    .select('regla, frecuencia_pago')
    .maybeSingle();
  if (error) return responderError(res, error);

  // Que la fila no exista no es un error: es la configuración de fábrica.
  const corrido = data?.regla ?? {};
  const corridoDeLaFrecuencia = data?.frecuencia_pago ?? {};
  res.json({
    configuracion: {
      regla: reglaDePagoDe(corrido),
      corridos: corrido,
      // Con qué se mide el trabajo y cada cuánto se cobra son dos cosas distintas, y por eso
      // viajan separadas. Se le puede pagar por hora y cobrar por mes.
      frecuencia: frecuenciaDePagoDe(corridoDeLaFrecuencia),
      corridos_frecuencia: corridoDeLaFrecuencia,
    },
  });
});

panelConfiguracionRouter.put('/pago-asistentes', async (req, res) => {
  const corridos = soloLoQueCorreDelPago(req.body?.regla);
  const revision = revisarReglaDePago(corridos);
  if (!revision.ok) {
    return res.status(400).json({ error: `El valor de «${revision.clave}» está fuera de lo permitido` });
  }

  const corridosDeLaFrecuencia = soloLoQueCorreDeLaFrecuencia(req.body?.frecuencia);
  const revisionDeLaFrecuencia = revisarFrecuenciaDePago(corridosDeLaFrecuencia);
  if (!revisionDeLaFrecuencia.ok) {
    return res
      .status(400)
      .json({ error: `El valor de «${revisionDeLaFrecuencia.clave}» está fuera de lo permitido` });
  }

  const prestadoraId = await prestadoraVisibleOContestar(clienteDelPedido(req), res);
  if (!prestadoraId) return;
  // CON LA MAESTRA: la tabla tiene políticas para que la Administración escriba, pero a quien
  // inicia sesión no se le dio permiso de escritura sobre ella, y con su credencial la base
  // rechaza el guardado. La Prestadora es la que la base acaba de dejar ver.
  const { error } = await supabase.from('configuracion_pago_asistentes').upsert(
    {
      prestadora_id: prestadoraId,
      regla: corridos,
      frecuencia_pago: corridosDeLaFrecuencia,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'prestadora_id' }
  );
  if (error) return responderError(res, error);
  res.json({ ok: true });
});

// --- A qué plazo pagan los Clientes ---
//
// Es el plazo que se acordó, y es uno de los tres datos que Careonys le manda al software de
// facturación: cuántas unidades, a qué precio, y a qué plazo. De él sale la fecha de vencimiento
// de cada factura, que hasta ahora se escribía a mano para toda la tanda.
//
// NO HAY VALOR DE FÁBRICA. Una factura con un vencimiento que inventó el sistema se vería
// vencida sin que nadie lo haya acordado. Vacío quiere decir que no se acordó ninguno, y
// entonces la pantalla sigue pidiendo la fecha como hasta ahora.

panelConfiguracionRouter.get('/facturacion-clientes', async (req, res) => {
  const db = clienteDelPedido(req);
  const { data, error } = await db
    .from('configuracion_facturacion_clientes')
    .select('regla, secreto_del_aviso_secret_id, secreto_del_aviso_de_facturacion_secret_id')
    .maybeSingle();
  if (error) return responderError(res, error);
  const prestadoraId = await prestadoraVisibleOContestar(db, res);
  if (!prestadoraId) return;

  res.json({
    configuracion: {
      dias_hasta_el_vencimiento: data?.regla?.dias_hasta_el_vencimiento ?? null,
      sigue_la_cobranza: sigueLaCobranza(data?.regla),
      entrega_la_factura: entregaLaFactura(data?.regla),
      // Del secreto sale de acá si está cargado o no, nunca su contenido, y tampoco la referencia
      // a la caja fuerte: al navegador no le sirve para nada y sí sirve para terminar en un
      // registro donde no tendría que estar.
      aviso_de_restriccion_conectado: !!data?.secreto_del_aviso_secret_id,
      // Lo mismo para el secreto con el que firma el software de facturación, que es otro: son dos
      // software distintos y pueden ser de dos proveedores que no se conocen.
      aviso_de_facturacion_conectado: !!data?.secreto_del_aviso_de_facturacion_secret_id,
      // Para que la pantalla pueda mostrar a qué dirección tiene que escribir el otro
      // software. No es un secreto: sin el secreto de firma, conocerla no sirve de nada.
      prestadora_id: prestadoraId,
    },
  });
});

panelConfiguracionRouter.put('/facturacion-clientes', async (req, res) => {
  const revision = plazoQueSePuedeGuardar(req.body?.dias_hasta_el_vencimiento);
  if (!revision.ok) {
    return res.status(400).json({ error: 'El plazo de pago está fuera de lo permitido' });
  }

  if (req.body?.sigue_la_cobranza !== undefined && typeof req.body.sigue_la_cobranza !== 'boolean') {
    return res.status(400).json({ error: 'El seguimiento de la cobranza se enciende o se apaga' });
  }

  if (req.body?.entrega_la_factura !== undefined && typeof req.body.entrega_la_factura !== 'boolean') {
    return res.status(400).json({ error: 'La entrega de la factura se enciende o se apaga' });
  }

  // Vacío se guarda como objeto vacío y no como un cero: cero es «paga el mismo día» y vacío es
  // «no se acordó nada». Son dos cosas distintas y la pantalla se comporta distinto con cada una.
  const regla = revision.valor === null ? {} : { dias_hasta_el_vencimiento: revision.valor };

  // Encendido es lo de fábrica, así que sólo se guarda el apagado: una regla que repite el valor
  // de fábrica hace creer que alguien lo decidió.
  if (req.body?.sigue_la_cobranza === false) regla.sigue_la_cobranza = false;

  // Lo mismo con la entrega de la factura, que es otra decisión: hay Prestadoras que reparten las
  // facturas por su cuenta y siguen llevando el saldo acá.
  if (req.body?.entrega_la_factura === false) regla.entrega_la_factura = false;

  const db = clienteDelPedido(req);
  const prestadoraId = await prestadoraVisibleOContestar(db, res);
  if (!prestadoraId) return;
  const { error } = await db.from('configuracion_facturacion_clientes').upsert(
    {
      prestadora_id: prestadoraId,
      regla,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'prestadora_id' }
  );
  if (error) return responderError(res, error);
  res.json({ ok: true });
});

// El secreto con el que el otro software de créditos y cobranzas firma lo que entrega.
//
// Se cierra más que el resto de la configuración, por lo mismo que las credenciales de WhatsApp:
// es una llave de la Prestadora, y Superadmin es un rol técnico de CeltaTech. Quien lo carga es
// Admin, y una vez cargado no vuelve a mostrarse: de la caja fuerte no sale nada hacia el
// navegador. Para cambiarlo se escribe uno nuevo, que reemplaza al anterior.
const soloAdminParaElSecretoDelAviso = exigirAdminDePrestadora(
  'La clave del software de cobranzas es de la Prestadora: solo Admin puede cambiarla'
);

panelConfiguracionRouter.put(
  '/facturacion-clientes/secreto-del-aviso',
  soloAdminParaElSecretoDelAviso,
  async (req, res) => {
    const secreto = String(req.body?.secreto ?? '').trim();
    if (secreto.length < LARGO_MINIMO_DEL_SECRETO_DEL_AVISO) {
      return res.status(400).json({ error: 'El secreto es demasiado corto' });
    }

    const prestadoraId = await prestadoraVisibleOContestar(clienteDelPedido(req), res);
    if (!prestadoraId) return;
    // CON LA MAESTRA: la función que guarda el secreto en la caja fuerte no se le dio a quien
    // inicia sesión. La Prestadora es la que la base acaba de dejar ver.
    const { error } = await supabase.rpc('guardar_secreto_del_aviso_de_cobranza', {
      p_prestadora_id: prestadoraId,
      p_secreto: secreto,
    });
    if (error) return responderError(res, error);
    res.json({ ok: true });
  }
);

// El secreto con el que el software de facturación firma lo que emitió.
//
// Es otro secreto, y no el mismo de arriba a propósito: el que factura y el que sigue la cobranza
// pueden ser dos software de dos proveedores que no se conocen, y compartir el secreto haría que
// rotar el de uno rompiera el del otro.
//
// Se cierra igual que aquél: lo carga Admin, no se muestra nunca más, y para cambiarlo se escribe
// uno nuevo que reemplaza al anterior.
const soloAdminParaElSecretoDeFacturacion = exigirAdminDePrestadora(
  'La clave del software de facturación es de la Prestadora: solo Admin puede cambiarla'
);

panelConfiguracionRouter.put(
  '/facturacion-clientes/secreto-del-aviso-de-facturacion',
  soloAdminParaElSecretoDeFacturacion,
  async (req, res) => {
    const secreto = String(req.body?.secreto ?? '').trim();
    if (secreto.length < LARGO_MINIMO_DEL_SECRETO_DEL_AVISO) {
      return res.status(400).json({ error: 'El secreto es demasiado corto' });
    }

    const prestadoraId = await prestadoraVisibleOContestar(clienteDelPedido(req), res);
    if (!prestadoraId) return;
    // CON LA MAESTRA, por lo mismo que el secreto de arriba.
    const { error } = await supabase.rpc('guardar_secreto_del_aviso_de_facturacion', {
      p_prestadora_id: prestadoraId,
      p_secreto: secreto,
    });
    if (error) return responderError(res, error);
    res.json({ ok: true });
  }
);

// --- Con qué software de afuera se conecta la Prestadora ---
//
// Dos conexiones: la de facturación y la de créditos y cobranzas. Careonys no hace ninguna de las
// dos tareas —son software aparte, comprado por la Prestadora— y esto no es más que la libreta
// donde ella anota cuál es el suyo y con qué credencial se entra.
//
// De la credencial sale de acá si está cargada o no, y nada más. Ni el texto, ni la referencia a
// la caja fuerte: la primera no vuelve a salir nunca, y la segunda al navegador no le sirve para
// nada mientras que sí sirve para terminar en un registro donde no tendría que estar. Para
// cambiarla se escribe una nueva, que reemplaza a la anterior.

const CLASES_DE_SOFTWARE_EXTERNO = ['facturacion', 'creditos_y_cobranzas'];

panelConfiguracionRouter.get('/software-externo', async (req, res) => {
  try {
    // Con qué software se puede conectar sale de la base, no de la pantalla: sumar uno es una
    // fila, no una versión nueva del producto.
    const db = clienteDelPedido(req);
    const { data: catalogo, error: errorDelCatalogo } = await db
      .from('catalogo_software_externo')
      .select('clave, clase, nombre')
      .eq('activo', true)
      .order('clase')
      .order('orden');
    if (errorDelCatalogo) throw errorDelCatalogo;

    const prestadoraId = await prestadoraVisible(db);
    // CON LA MAESTRA: a quien inicia sesión no se le dio ningún permiso sobre esta tabla, y con su
    // credencial la base rechaza hasta la lectura. Se pide sólo lo de la Prestadora que la base
    // acaba de dejar ver.
    const { data: conexiones, error } = await supabase
      .from('conexiones_con_software_externo')
      .select('clase, software, credencial_secret_id')
      .eq('prestadora_id', prestadoraId);
    if (error) throw error;

    res.json({
      catalogo: catalogo ?? [],
      conexiones: CLASES_DE_SOFTWARE_EXTERNO.map((clase) => {
        const fila = (conexiones ?? []).find((una) => una.clase === clase);
        return {
          clase,
          software: fila?.software ?? null,
          credencial_cargada: !!fila?.credencial_secret_id,
        };
      }),
    });
  } catch (error) {
    responderError(res, error);
  }
});

// La credencial es de la Prestadora, y Superadmin es un rol técnico de CeltaTech: se le suma el
// mismo candado que a las claves de WhatsApp y a los secretos de firma. Sumar un candado nunca
// abre nada.
const soloAdminParaElSoftwareExterno = exigirAdminDePrestadora(
  'La credencial del software de afuera es de la Prestadora: solo Admin puede cargarla'
);

panelConfiguracionRouter.put(
  '/software-externo/:clase',
  soloAdminParaElSoftwareExterno,
  async (req, res) => {
    try {
      const clase = String(req.params.clase ?? '');
      if (!CLASES_DE_SOFTWARE_EXTERNO.includes(clase)) {
        return responderError(res, new ErrorConMotivo('no_encontrado', `clase de software ${clase}`));
      }

      const software = String(req.body?.software ?? '').trim();
      if (!software) {
        return responderError(res, new ErrorConMotivo('faltan_datos', 'conexión sin software elegido'));
      }

      // Se comprueba contra el catálogo y contra la clase: un facturador no puede quedar anotado
      // como el software de cobranzas. La base lo impide igual con la clave foránea; esto es para
      // contestar con un mensaje del catálogo en vez de con un error de la base.
      const db = clienteDelPedido(req);
      const { data: delCatalogo, error: errorDelCatalogo } = await db
        .from('catalogo_software_externo')
        .select('clave')
        .eq('clave', software)
        .eq('clase', clase)
        .eq('activo', true)
        .maybeSingle();
      if (errorDelCatalogo) throw errorDelCatalogo;
      if (!delCatalogo) {
        return responderError(res, new ErrorConMotivo('software_desconocido', `software ${software} fuera del catálogo`));
      }

      const credencial = String(req.body?.credencial ?? '').trim();

      // CON LA MAESTRA, la lectura y el guardado: a quien inicia sesión no se le dio ningún
      // permiso sobre las conexiones ni la función que las guarda. La Prestadora es la que la base
      // deja ver con la credencial de quien pide.
      const prestadoraId = await prestadoraVisible(db);
      const { data: antes, error: errorDeLaLectura } = await supabase
        .from('conexiones_con_software_externo')
        .select('software, credencial_secret_id')
        .eq('prestadora_id', prestadoraId)
        .eq('clase', clase)
        .maybeSingle();
      if (errorDeLaLectura) throw errorDeLaLectura;

      // Cambiar de software deja sin valor la credencial anterior, que es la llave de otra puerta:
      // la de la base la borra al cambiar. Por eso, si se cambia, hay que traer una nueva, o la
      // conexión queda anotada y muerta sin que nadie se entere.
      const cambiaElSoftware = antes?.software !== software;
      if (!credencial && (cambiaElSoftware || !antes?.credencial_secret_id)) {
        return responderError(res, new ErrorConMotivo('credencial_requerida', 'conexión sin credencial'));
      }

      const { error } = await supabase.rpc('guardar_conexion_con_software_externo', {
        p_prestadora_id: prestadoraId,
        p_clase: clase,
        p_software: software,
        // Vacío quiere decir «no se toca la que hay». Va como nulo para que la función de la base
        // no tenga que adivinar si una cadena vacía es una credencial.
        p_credencial: credencial || null,
      });
      if (error) throw error;

      // Qué se cambió, nunca con qué: en el registro no entra ninguna credencial.
      await registrarActividad(req.usuarioPanel, ACCION_MODIFICACION_CRITICA, {
        tablaAfectada: 'conexiones_con_software_externo',
        registroId: req.usuarioPanel.prestadoraId,
        camposCambiados: credencial ? ['software', 'credencial'] : ['software'],
        detalle: {
          clase_de_software: clase,
          software_anterior: antes?.software ?? null,
          software_nuevo: software,
        },
      });

      res.json({ ok: true });
    } catch (error) {
      responderError(res, error);
    }
  }
);

// --- WhatsApp: credenciales de Meta Cloud API (Supabase Vault, ver
//     supabase/migrations/ — el token nunca vuelve a
//     mostrarse en el Panel una vez guardado) ---
//
// Acá se cierra más que en el resto del router. El candado de arriba
// (`soloAdministracion`) deja pasar a Superadmin, y para casi toda la configuración está bien:
// Superadmin es quien da soporte. Pero estas tres claves son con las que la Prestadora habla
// con Meta, y Superadmin es un rol técnico de CeltaTech: no tiene por qué poder leer si están
// cargadas ni, mucho menos, reemplazarlas. El permiso de acceso tampoco lo habilita —
// existe para mirar los datos de una Organización por vez y queda auditada, no para alcanzar
// sus credenciales (`panel/src/lib/roles.js`, `esAdminDePrestadora`).
//
// Se agrega encima del de router en vez de tocar aquél, porque aquél protege bien al resto de
// la configuración y ahí Superadmin sí tiene que entrar. Sumar un candado nunca abre nada.
const soloAdminDePrestadora = exigirAdminDePrestadora(
  'Las credenciales de WhatsApp son de la Prestadora: solo Admin puede verlas y cambiarlas'
);

panelConfiguracionRouter.get('/whatsapp', soloAdminDePrestadora, async (req, res) => {
  const db = clienteDelPedido(req);
  const { data, error } = await db
    .from('configuracion_whatsapp_prestadora')
    .select('prestadora_id, activo, numero_telefono, waba_id, phone_number_id, verificado_at, updated_at, app_secret_secret_id, verify_token_secret_id')
    .maybeSingle();
  if (error) return responderError(res, error);
  const prestadoraId = data?.prestadora_id ?? await prestadoraVisibleOContestar(db, res);
  if (!prestadoraId) return;
  // De los tres secretos sale de acá si están cargados o no, nunca su contenido: la referencia
  // a la caja fuerte tampoco viaja al navegador, porque no le sirve para nada y sí sirve para
  // aparecer en un registro donde no tendría que estar.
  res.json({
    whatsapp: data
      ? {
          ...data,
          token_cargado: true,
          app_secret_cargado: !!data.app_secret_secret_id,
          verify_token_cargado: !!data.verify_token_secret_id,
          app_secret_secret_id: undefined,
          verify_token_secret_id: undefined,
        }
      : {
          prestadora_id: prestadoraId,
          activo: false,
          numero_telefono: null,
          waba_id: null,
          phone_number_id: null,
          verificado_at: null,
          token_cargado: false,
          app_secret_cargado: false,
          verify_token_cargado: false,
        },
  });
});

panelConfiguracionRouter.patch('/whatsapp', soloAdminDePrestadora, async (req, res) => {
  const { activo, numero_telefono, waba_id, phone_number_id, token, app_secret, verify_token } = req.body;
  const db = clienteDelPedido(req);
  const prestadoraId = await prestadoraVisibleOContestar(db, res);
  if (!prestadoraId) return;

  const { error } = await db
    .from('configuracion_whatsapp_prestadora')
    .upsert({
      prestadora_id: prestadoraId,
      activo,
      numero_telefono,
      waba_id,
      phone_number_id,
      updated_at: new Date().toISOString(),
    });
  if (error) return responderError(res, error);

  // CON LA MAESTRA, las tres claves: las funciones que las guardan en la caja fuerte no se le
  // dieron a quien inicia sesión. La Prestadora es la que la base acaba de dejar ver.
  if (token) {
    const { error: errorToken } = await supabase.rpc('guardar_token_whatsapp', {
      p_prestadora_id: prestadoraId,
      p_token: token,
    });
    if (errorToken) return responderError(res, errorToken);
  }

  // Los dos secretos con los que el backend le cree a lo que entra de Meta (pendiente #165):
  // el de la aplicación, con el que se comprueba la firma de cada mensaje, y el token del
  // saludo inicial, que ahora es de esta Prestadora y no uno solo para todo el producto. Los
  // dos van a la caja fuerte y no vuelven a mostrarse acá, igual que el token de acceso.
  if (app_secret) {
    const { error: errorAppSecret } = await supabase.rpc('guardar_app_secret_whatsapp', {
      p_prestadora_id: prestadoraId,
      p_secreto: app_secret,
    });
    if (errorAppSecret) return responderError(res, errorAppSecret);
  }

  if (verify_token) {
    const { error: errorVerifyToken } = await supabase.rpc('guardar_verify_token_whatsapp', {
      p_prestadora_id: prestadoraId,
      p_token: verify_token,
    });
    if (errorVerifyToken) return responderError(res, errorVerifyToken);
  }

  res.json({ ok: true });
});

// --- El correo de esta Prestadora: desde dónde sale y adónde vuelven las respuestas ---
//
// Acá no se pide ningún servidor de correo ni ninguna contraseña, y no es un olvido. Cada
// Prestadora manda desde una dirección propia bajo el dominio del producto, que le fija el alta
// (`utils/casillaDeEnvio.js`) y que despacha el mismo servicio para todas. Lo único que la
// Prestadora elige es **adónde quiere que le lleguen las respuestas**, porque esa dirección sólo
// manda: quien le conteste un mensaje le estaría escribiendo a un buzón que no existe
// (`utils/reenvioDeRespuestas.js`).
//
// Y por eso tampoco lleva el candado angosto que llevaba la contraseña: la casilla de respuestas
// no es un secreto, es el mismo `configuracion_prestadora.email` que ya se edita desde la
// pantalla de datos de la empresa. Dos puertas sobre el mismo dato con cerraduras distintas es
// una sola puerta mal cerrada.

// Lo que la pantalla necesita saber para explicar en qué estado está el correo de esta
// Prestadora. Son cuatro cosas distintas y ninguna se deduce de otra, así que se arman juntas y
// las devuelven tanto la lectura como el guardado.
async function estadoDelCorreoDe(db) {
  const { data } = await db
    .from('configuracion_prestadora')
    .select('email')
    .maybeSingle();

  const { data: prestadora } = await db
    .from('prestadoras')
    .select('regla_reenvio')
    .maybeSingle();

  const emailRespuestas = data?.email ?? null;

  return {
    // La dirección desde la que sale el correo no viaja hasta acá a propósito. Es un recurso
    // del sistema, no de la Prestadora: ella nunca la usa, nunca entra a esa casilla y no
    // necesita saber que existe. Lo suyo es adónde quiere que le lleguen las respuestas.
    email_respuestas: emailRespuestas,
    reenvio_abierto: Boolean(prestadora?.regla_reenvio),
    // Se pregunta en el momento: el clic con el que se confirma la casilla lo da una persona
    // cuando quiere, así que un valor guardado diría «sin confirmar» para siempre.
    respuestas_confirmadas: await respuestasConfirmadas(emailRespuestas),
    // Sin el servicio configurado no hay reenvío posible, y la pantalla lo dice en vez de
    // mostrar un reenvío cerrado como si fuera una falla de esta Prestadora.
    servicio_configurado: hayReenvioConfigurado(),
  };
}

panelConfiguracionRouter.get('/correo', async (req, res) => {
  try {
    res.json({ correo: await estadoDelCorreoDe(clienteDelPedido(req)) });
  } catch (error) {
    responderError(res, error);
  }
});

panelConfiguracionRouter.patch('/correo', async (req, res) => {
  const { email_respuestas: emailRespuestas } = req.body;

  if (!esDireccionDeCorreo(emailRespuestas)) {
    // Mismo motivo que la casilla mal escrita en el alta: es el mismo dato y se arregla igual.
    return responderError(res, new ErrorConMotivo('correo_invalido'));
  }

  const db = clienteDelPedido(req);
  const prestadoraId = await prestadoraVisibleOContestar(db, res);
  if (!prestadoraId) return;

  const { data, error } = await db
    .from('configuracion_prestadora')
    .update({ email: emailRespuestas, updated_at: new Date().toISOString() })
    .eq('prestadora_id', prestadoraId)
    .select('prestadora_id');
  if (error) return responderError(res, error);
  if (!data?.length) return res.status(404).json({ error: 'Esta Prestadora todavía no tiene configuración cargada' });

  // El reenvío tiene que seguir a la casilla. Si se guardara la casilla nueva sin mover el
  // reenvío, las respuestas seguirían yendo a la vieja y nadie se enteraría.
  const { data: prestadora } = await db
    .from('prestadoras')
    .select('regla_reenvio')
    .maybeSingle();

  await apuntarReenvioDeRespuestas({
    prestadoraId,
    direccionDeEnvio: await direccionDeEnvioDe(prestadoraId),
    emailRespuestas,
    reglaAnterior: prestadora?.regla_reenvio ?? null,
  });

  res.json({ correo: await estadoDelCorreoDe(db) });
});

// --- WhatsApp: plantillas de mensaje (requieren aprobación de Meta antes de poder
//     usarse para un mensaje que la prestadora inicia) ---
panelConfiguracionRouter.get('/whatsapp/plantillas', async (req, res) => {
  const { data, error } = await clienteDelPedido(req)
    .from('plantillas_whatsapp')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return responderError(res, error);
  res.json({ plantillas: data });
});

panelConfiguracionRouter.post('/whatsapp/plantillas', async (req, res) => {
  const { nombre_interno, categoria, idioma, cuerpo_texto } = req.body;
  if (!nombre_interno || !categoria || !cuerpo_texto) {
    return res.status(400).json({ error: 'Faltan nombre_interno, categoria o cuerpo_texto' });
  }
  const db = clienteDelPedido(req);
  const prestadoraId = await prestadoraVisibleOContestar(db, res);
  if (!prestadoraId) return;
  const { error } = await db.from('plantillas_whatsapp').insert({
    nombre_interno,
    categoria,
    idioma: idioma || 'es-AR',
    cuerpo_texto,
    prestadora_id: prestadoraId,
    created_by: req.usuarioPanel.id,
  });
  if (error) return responderError(res, error);
  res.json({ ok: true });
});

// Lo único que se edita a mano es el texto, y solamente mientras la plantilla es un borrador. El
// estado y el identificador de Meta los escribe el alta de acá abajo con lo que Meta contesta:
// puestos a mano decían que la plantilla estaba aprobada sin que nadie lo hubiera preguntado.
panelConfiguracionRouter.patch('/whatsapp/plantillas/:id', async (req, res) => {
  const { cuerpo_texto } = req.body;
  if (!cuerpo_texto) return responderError(res, new ErrorConMotivo('faltan_datos', 'Falta cuerpo_texto'));

  const { data, error } = await clienteDelPedido(req)
    .from('plantillas_whatsapp')
    .update({ cuerpo_texto, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .eq('estado', 'borrador')
    .select('id');
  if (error) return responderError(res, error);
  // La que no existe, la de otra Prestadora y la que ya salió hacia Meta contestan lo mismo: el
  // texto de una plantilla que ya se mandó no se cambia de este lado sin que Meta se entere.
  if (!data?.length) return responderError(res, new ErrorConMotivo('no_encontrado', 'Plantilla inexistente, de otra Prestadora o ya enviada'));
  res.json({ ok: true });
});

// La IA escribe el texto, y quien coordina decide. Las dos rutas que siguen no guardan nada ni le
// mandan nada a Meta: devuelven una propuesta, que se ve en la pantalla antes de usarla. Guardarla
// sola sería escribir en nombre de la Prestadora un texto que nadie leyó
// (`docs/PRD_06_WhatsApp_IA.md:49`).
panelConfiguracionRouter.post('/whatsapp/plantillas/redactar', async (req, res) => {
  const { proposito, categoria } = req.body ?? {};
  try {
    const prestadoraId = await prestadoraVisible(clienteDelPedido(req));
    // El idioma no se le pregunta a la pantalla: es el de la Prestadora, resuelto donde ya se
    // resuelve para todos los mensajes.
    const propuesta = await redactarPlantillaWhatsapp({
      proposito,
      categoria,
      idioma: await idiomaDeLaPrestadora(clienteDelPedido(req), prestadoraId),
      prestadoraId,
    });
    res.json({ propuesta });
  } catch (err) {
    responderError(res, err);
  }
});

// Corregir la que Meta rechazó, leyendo lo que Meta objetó. Lo que hoy queda escrito en la fila es
// la sigla con la que Meta nombra su objeción, en inglés; acá se convierte en otro texto.
panelConfiguracionRouter.post('/whatsapp/plantillas/:id/corregir', async (req, res) => {
  const { data: filas, error } = await clienteDelPedido(req)
    .from('plantillas_whatsapp')
    .select('id, prestadora_id, categoria, idioma, cuerpo_texto, motivo_rechazo')
    .eq('id', req.params.id);
  if (error) return responderError(res, error);
  const fila = filas?.[0];
  if (!fila) return responderError(res, new ErrorConMotivo('no_encontrado', 'Plantilla inexistente o de otra Prestadora'));
  // La Prestadora sale de la fila que la base dejó ver; a la IA le llega la plantilla sin ella,
  // como antes.
  const { prestadora_id: prestadoraId, ...plantilla } = fila;

  try {
    const propuesta = await corregirPlantillaWhatsapp({
      plantilla,
      prestadoraId,
    });
    res.json({ propuesta });
  } catch (err) {
    responderError(res, err);
  }
});

// Dar de alta la plantilla en Meta. Hasta que esto existió, el botón del Panel cambiaba el estado
// guardado y nada más.
panelConfiguracionRouter.post('/whatsapp/plantillas/:id/enviar-a-meta', async (req, res) => {
  const db = clienteDelPedido(req);
  const { data: filas, error } = await db.from('plantillas_whatsapp').select('*').eq('id', req.params.id);
  if (error) return responderError(res, error);
  const plantilla = filas?.[0];
  if (!plantilla) return responderError(res, new ErrorConMotivo('no_encontrado', 'Plantilla inexistente o de otra Prestadora'));
  if (plantilla.estado !== 'borrador') {
    return responderError(res, new ErrorConMotivo('plantilla_ya_enviada', `Estado ${plantilla.estado}`));
  }

  let resultado;
  try {
    resultado = await darDeAltaEnMeta(plantilla);
  } catch (err) {
    // Lo que Meta objetó queda guardado en la fila: es lo que hay que corregir para volver a
    // intentarlo, y la plantilla se queda en borrador justamente para poder corregirla.
    if (err.motivo === 'meta_no_acepto') {
      await db
        .from('plantillas_whatsapp')
        .update({ motivo_rechazo: err.message, updated_at: new Date().toISOString() })
        .eq('id', plantilla.id);
    }
    return responderError(res, err);
  }

  const { error: errorGuardado } = await db
    .from('plantillas_whatsapp')
    .update({
      meta_template_id: resultado.metaTemplateId,
      estado: resultado.estado,
      motivo_rechazo: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', plantilla.id);
  if (errorGuardado) return responderError(res, errorGuardado);

  res.json({ ok: true, estado: resultado.estado });
});

// Preguntarle a Meta cómo quedaron las plantillas que ya salieron. El camino normal es lo que
// Meta manda sola, que entra por `whatsappWebhook.js` y no le pide nada a nadie; esto es la
// otra puerta, para cuando esa entrada no está conectada o se perdió una. Se pregunta por todas en
// un solo pedido y se escriben únicamente las que cambiaron.
panelConfiguracionRouter.post('/whatsapp/plantillas/consultar-a-meta', async (req, res) => {
  const db = clienteDelPedido(req);
  const { data: plantillas, error } = await db
    .from('plantillas_whatsapp')
    .select('id, meta_template_id, estado, motivo_rechazo')
    .not('meta_template_id', 'is', null);
  if (error) return responderError(res, error);

  let estados;
  try {
    estados = await traerEstadosDeMeta(await prestadoraVisible(db));
  } catch (err) {
    return responderError(res, err);
  }

  let cambiadas = 0;
  for (const plantilla of plantillas ?? []) {
    const enMeta = estados.get(String(plantilla.meta_template_id));
    if (!enMeta) continue;
    if (enMeta.estado === plantilla.estado && (enMeta.motivo ?? null) === (plantilla.motivo_rechazo ?? null)) continue;

    const { error: errorGuardado } = await db
      .from('plantillas_whatsapp')
      .update({
        estado: enMeta.estado,
        motivo_rechazo: enMeta.motivo,
        updated_at: new Date().toISOString(),
      })
      .eq('id', plantilla.id);
    if (errorGuardado) return responderError(res, errorGuardado);
    cambiadas += 1;
  }

  res.json({ ok: true, cambiadas });
});

panelConfiguracionRouter.delete('/whatsapp/plantillas/:id', async (req, res) => {
  const { data, error } = await clienteDelPedido(req)
    .from('plantillas_whatsapp')
    .delete()
    .eq('id', req.params.id)
    .select('id');
  if (error) return responderError(res, error);
  if (!data?.length) return res.status(404).json({ error: 'No se encontró esa plantilla de WhatsApp' });
  res.json({ ok: true });
});

// --- Catálogo de tipos de documento de Asistente (vencimientos a trackear) + plazo de preaviso
//     configurable por prestadora (pendiente #18 punto 1, docs/PLAN_HASTA_PRODUCCION.md — ver
//     supabase/migrations/). El plazo vive en la tabla "prestadoras",
//     que por RLS sólo superadmin puede modificar: se lee con la credencial de quien pide, y
//     el cambio va con la maestra sobre la Prestadora que la base deja ver. ---
panelConfiguracionRouter.get('/documentos-tipo', async (req, res) => {
  const db = clienteDelPedido(req);

  const [{ data: tipos, error: errorTipos }, { data: prestadora, error: errorPrestadora }] = await Promise.all([
    db.from('tipos_documento_asistente').select('*').order('nombre'),
    db.from('prestadoras').select('dias_aviso_vencimiento_documentos').single(),
  ]);
  if (errorTipos) return responderError(res, errorTipos);
  if (errorPrestadora) return responderError(res, errorPrestadora);
  res.json({ tipos, dias_aviso_vencimiento_documentos: prestadora.dias_aviso_vencimiento_documentos });
});

panelConfiguracionRouter.post('/documentos-tipo', async (req, res) => {
  const { nombre, requiere_vencimiento } = req.body;
  if (!nombre) return res.status(400).json({ error: 'Falta nombre' });
  const db = clienteDelPedido(req);
  const prestadoraId = await prestadoraVisibleOContestar(db, res);
  if (!prestadoraId) return;
  const { error } = await db
    .from('tipos_documento_asistente')
    .insert({ nombre, requiere_vencimiento: requiere_vencimiento ?? true, prestadora_id: prestadoraId });
  if (error) return responderError(res, error);
  res.json({ ok: true });
});

panelConfiguracionRouter.patch('/documentos-tipo/plazo-aviso', async (req, res) => {
  const { dias } = req.body;
  if (!Number.isInteger(dias) || dias <= 0) {
    return res.status(400).json({ error: 'dias debe ser un entero positivo' });
  }
  const prestadoraId = await prestadoraVisibleOContestar(clienteDelPedido(req), res);
  if (!prestadoraId) return;
  // CON LA MAESTRA: la fila de la Prestadora sólo la modifica superadmin por RLS.
  const { error } = await supabase
    .from('prestadoras')
    .update({ dias_aviso_vencimiento_documentos: dias })
    .eq('id', prestadoraId);
  if (error) return responderError(res, error);
  res.json({ ok: true });
});

// --- Qué tan estricto es el control de matrícula en esta prestadora.
//     Mismo motivo que el plazo de preaviso de más arriba: el dato vive en la tabla "prestadoras",
//     que por RLS solo superadmin puede modificar. El navegador no la puede escribir ni aunque
//     lo intente; el backend sí, porque usa la service role key y acota siempre a la prestadora
//     de quien pide. Los dos valores posibles los fija una restricción de la base
//     (`prestadoras_modo_control_matricula_check`) — acá se repiten como
//     validación de entrada, no como fuente de verdad. ---
const MODOS_DE_CONTROL_MATRICULA = ['flexible', 'estricto'];

panelConfiguracionRouter.get('/modo-control-matricula', async (req, res) => {
  const { data, error } = await clienteDelPedido(req)
    .from('prestadoras')
    .select('modo_control_matricula')
    .single();
  if (error) return responderError(res, error);
  res.json({ modo: data.modo_control_matricula });
});

panelConfiguracionRouter.patch('/modo-control-matricula', async (req, res) => {
  const { modo } = req.body;
  if (!MODOS_DE_CONTROL_MATRICULA.includes(modo)) {
    return res.status(400).json({ error: 'modo debe ser flexible o estricto' });
  }
  const prestadoraId = await prestadoraVisibleOContestar(clienteDelPedido(req), res);
  if (!prestadoraId) return;
  // CON LA MAESTRA: la fila de la Prestadora sólo la modifica superadmin por RLS.
  const { error } = await supabase
    .from('prestadoras')
    .update({ modo_control_matricula: modo })
    .eq('id', prestadoraId);
  if (error) return responderError(res, error);
  res.json({ ok: true });
});

// --- Catálogo de motivos de aviso previo de guardia, configurable por prestadora. Mismo patrón
//     que /documentos-tipo. ---
panelConfiguracionRouter.get('/motivos-aviso-previo', async (req, res) => {
  const { data, error } = await clienteDelPedido(req)
    .from('motivos_aviso_previo_guardia')
    .select('*')
    .order('nombre');
  if (error) return responderError(res, error);
  res.json({ motivos: data });
});

panelConfiguracionRouter.post('/motivos-aviso-previo', async (req, res) => {
  const { nombre } = req.body;
  if (!nombre) return res.status(400).json({ error: 'Falta nombre' });
  const db = clienteDelPedido(req);
  const prestadoraId = await prestadoraVisibleOContestar(db, res);
  if (!prestadoraId) return;
  const { error } = await db
    .from('motivos_aviso_previo_guardia')
    .insert({ nombre, prestadora_id: prestadoraId });
  if (error) return responderError(res, error);
  res.json({ ok: true });
});

panelConfiguracionRouter.patch('/motivos-aviso-previo/:id', async (req, res) => {
  const { nombre, activo } = req.body;
  const { data, error } = await clienteDelPedido(req)
    .from('motivos_aviso_previo_guardia')
    .update({ nombre, activo })
    .eq('id', req.params.id)
    .select('id');
  if (error) return responderError(res, error);
  if (!data?.length) return res.status(404).json({ error: 'No se encontró ese motivo de aviso previo' });
  res.json({ ok: true });
});

// --- Catálogo de motivos de cierre de la atención de un Paciente, configurable por prestadora.
//     Dos niveles: las filas que trae el producto guardan "clave" y su texto sale de las
//     traducciones; las que agrega la prestadora guardan "nombre", escrito por ella. Cada
//     prestadora nace con las siete de fábrica y a partir de ahí la lista es suya: puede
//     apagarlas, borrarlas y agregar las que quiera. La base lo controla en el disparador
//     "validar_motivo_cierres_servicio_paciente", no acá. ---
panelConfiguracionRouter.get('/motivos-cierre-servicio', async (req, res) => {
  const { data, error } = await clienteDelPedido(req)
    .from('motivos_cierre_servicio')
    .select('*')
    .order('orden');
  if (error) return responderError(res, error);
  res.json({ motivos: data });
});

/* Sólo se crean motivos propios: los de fábrica ya vienen sembrados y su clave no la elige
   nadie desde afuera —el texto visible de una clave sale de las traducciones, así que una clave
   inventada acá se mostraría con un guion—. Por eso esta ruta no acepta "clave". */
panelConfiguracionRouter.post('/motivos-cierre-servicio', async (req, res) => {
  const { nombre, pide_detalle } = req.body;
  if (!nombre) return res.status(400).json({ error: 'Falta nombre' });
  const db = clienteDelPedido(req);
  const prestadoraId = await prestadoraVisibleOContestar(db, res);
  if (!prestadoraId) return;
  const { error } = await db
    .from('motivos_cierre_servicio')
    .insert({
      nombre,
      pide_detalle: pide_detalle === true,
      prestadora_id: prestadoraId,
    });
  if (error) return responderError(res, error);
  res.json({ ok: true });
});

/* Lo que se puede cambiar de una fila ya creada es si está encendida y si pide detalle. El
   nombre no: es lo que quedó escrito en los cierres que ya se hicieron con ese motivo, y
   cambiarlo acá los dejaría diciendo una cosa distinta de la que se eligió ese día. Para
   corregir un nombre se apaga el motivo y se crea otro. */
panelConfiguracionRouter.patch('/motivos-cierre-servicio/:id', async (req, res) => {
  const { activo, pide_detalle } = req.body;
  const cambios = {};
  if (activo !== undefined) cambios.activo = activo === true;
  if (pide_detalle !== undefined) cambios.pide_detalle = pide_detalle === true;
  if (Object.keys(cambios).length === 0) {
    return res.status(400).json({ error: 'No hay nada que cambiar' });
  }
  cambios.updated_at = new Date().toISOString();
  const { data, error } = await clienteDelPedido(req)
    .from('motivos_cierre_servicio')
    .update(cambios)
    .eq('id', req.params.id)
    .select('id');
  if (error) return responderError(res, error);
  if (!data?.length) return res.status(404).json({ error: 'No se encontró ese motivo de cierre' });
  res.json({ ok: true });
});

/* Borrar no rompe la historia: el cierre guarda el texto del motivo, no una referencia a esta
   fila, así que los cierres viejos siguen diciendo lo que decían. */
panelConfiguracionRouter.delete('/motivos-cierre-servicio/:id', async (req, res) => {
  const { data, error } = await clienteDelPedido(req)
    .from('motivos_cierre_servicio')
    .delete()
    .eq('id', req.params.id)
    .select('id');
  if (error) return responderError(res, error);
  if (!data?.length) return res.status(404).json({ error: 'No se encontró ese motivo de cierre' });
  res.json({ ok: true });
});

// --- Horizonte de generación de guardias de series abiertas — cron
//     backend/src/utils/generacionSeriesGuardia.js. Mismo patrón que
//     /documentos-tipo/plazo-aviso: valor en "prestadoras", expuesto acá para reusar el
//     scoping por prestadora ya resuelto en este router. ---
panelConfiguracionRouter.get('/guardias/horizonte-generacion', async (req, res) => {
  const { data, error } = await clienteDelPedido(req)
    .from('prestadoras')
    .select('dias_generacion_series_guardia')
    .single();
  if (error) return responderError(res, error);
  res.json({ dias_generacion_series_guardia: data.dias_generacion_series_guardia });
});

panelConfiguracionRouter.patch('/guardias/horizonte-generacion', async (req, res) => {
  const { dias } = req.body;
  if (!Number.isInteger(dias) || dias <= 0) {
    return res.status(400).json({ error: 'dias debe ser un entero positivo' });
  }
  const prestadoraId = await prestadoraVisibleOContestar(clienteDelPedido(req), res);
  if (!prestadoraId) return;
  // CON LA MAESTRA: la fila de la Prestadora sólo la modifica superadmin por RLS.
  const { error } = await supabase
    .from('prestadoras')
    .update({ dias_generacion_series_guardia: dias })
    .eq('id', prestadoraId);
  if (error) return responderError(res, error);
  res.json({ ok: true });
});

// --- Ausencia automática por falta de check-in GPS (Etapa 3, pendiente #63): antes solo
//     editable por SQL directo contra Supabase, violando "Configuración sobre programación"
//     (CLAUDE.md §2). Ver backend/src/routes/appAsistentes.js (uso de metros_tolerancia_checkin
//     al validar el check-in) y backend/src/utils/ausenciaAutomatica.js (uso de
//     minutos_tolerancia_checkin y activo). ---
panelConfiguracionRouter.get('/ausencia-automatica', async (req, res) => {
  const { data, error } = await clienteDelPedido(req)
    .from('configuracion_ausencia_automatica')
    .select(
      'activo, minutos_tolerancia_checkin, metros_tolerancia_checkin, ' +
      'segundos_codigo_en_pantalla, minutos_codigo_de_la_prestadora',
    )
    .maybeSingle();
  if (error) return responderError(res, error);
  res.json({
    configuracion: data || {
      activo: true,
      minutos_tolerancia_checkin: MINUTOS_TOLERANCIA_POR_OMISION,
      metros_tolerancia_checkin: METROS_TOLERANCIA_POR_OMISION,
      segundos_codigo_en_pantalla: SEGUNDOS_EN_PANTALLA_POR_OMISION,
      minutos_codigo_de_la_prestadora: MINUTOS_CODIGO_DE_LA_PRESTADORA_POR_OMISION,
    },
  });
});

/* Las dos decisiones del pase de guardia (pendiente #113) viajan por acá y no por una ruta
   propia porque viven en la misma fila y describen lo mismo: cada cuánto se renueva el código
   que alguien muestra en su pantalla, y cuántos minutos vale el que suelta la Prestadora. Los
   topes son los de las restricciones de la base; se comprueban también acá para que el rechazo
   llegue con un mensaje que la pantalla pueda explicar y no con el texto crudo de la base. */
panelConfiguracionRouter.patch('/ausencia-automatica', async (req, res) => {
  const {
    activo,
    minutos_tolerancia_checkin,
    metros_tolerancia_checkin,
    segundos_codigo_en_pantalla,
    minutos_codigo_de_la_prestadora,
  } = req.body;
  if (!Number.isInteger(minutos_tolerancia_checkin) || minutos_tolerancia_checkin <= 0) {
    return res.status(400).json({ error: 'minutos_tolerancia_checkin debe ser un entero positivo' });
  }
  if (!Number.isInteger(metros_tolerancia_checkin) || metros_tolerancia_checkin <= 0) {
    return res.status(400).json({ error: 'metros_tolerancia_checkin debe ser un entero positivo' });
  }
  if (
    !Number.isInteger(segundos_codigo_en_pantalla) ||
    segundos_codigo_en_pantalla < SEGUNDOS_EN_PANTALLA_MINIMO ||
    segundos_codigo_en_pantalla > SEGUNDOS_EN_PANTALLA_MAXIMO
  ) {
    return res.status(400).json({
      error: `segundos_codigo_en_pantalla debe estar entre ${SEGUNDOS_EN_PANTALLA_MINIMO} y ${SEGUNDOS_EN_PANTALLA_MAXIMO}`,
    });
  }
  if (
    !Number.isInteger(minutos_codigo_de_la_prestadora) ||
    minutos_codigo_de_la_prestadora < MINUTOS_CODIGO_DE_LA_PRESTADORA_MINIMO ||
    minutos_codigo_de_la_prestadora > MINUTOS_CODIGO_DE_LA_PRESTADORA_MAXIMO
  ) {
    return res.status(400).json({
      error: `minutos_codigo_de_la_prestadora debe estar entre ${MINUTOS_CODIGO_DE_LA_PRESTADORA_MINIMO} y ${MINUTOS_CODIGO_DE_LA_PRESTADORA_MAXIMO}`,
    });
  }
  const db = clienteDelPedido(req);
  const prestadoraId = await prestadoraVisibleOContestar(db, res);
  if (!prestadoraId) return;
  const { error } = await db
    .from('configuracion_ausencia_automatica')
    .upsert({
      prestadora_id: prestadoraId,
      activo: Boolean(activo),
      minutos_tolerancia_checkin,
      metros_tolerancia_checkin,
      segundos_codigo_en_pantalla,
      minutos_codigo_de_la_prestadora,
    });
  if (error) return responderError(res, error);
  res.json({ ok: true });
});

panelConfiguracionRouter.patch('/documentos-tipo/:id', async (req, res) => {
  const { nombre, requiere_vencimiento, activo } = req.body;
  const { data, error } = await clienteDelPedido(req)
    .from('tipos_documento_asistente')
    .update({ nombre, requiere_vencimiento, activo })
    .eq('id', req.params.id)
    .select('id');
  if (error) return responderError(res, error);
  if (!data?.length) return res.status(404).json({ error: 'No se encontró ese tipo de documento' });
  res.json({ ok: true });
});

// --- Motor de permisos configurable por Prestadora — quién, además de un Admin, puede dar de
//     alta a mano, editar datos de Asistentes/Clientes/Pacientes, importar en masa, validar un
//     informe de Obra Social o ver lo que se le paga a un Asistente.
//
//     Qué acciones existen y qué pasa con cada una cuando la Prestadora no configuró nada NO se
//     decide acá: sale del catálogo de la base, que es el único lugar donde está escrito. Hasta
//     el 2026-08-19 esta pantalla tenía su propia lista de tres acciones y mostraba un estado
//     que el backend no aplicaba (pendiente #127). Ver backend/src/utils/permisos.js. ---

// Los Coordinadores de una Prestadora, para las pantallas de Configuración que hacen elegir uno
// de una lista. Sale del backend y no del navegador porque la tabla `usuarios` sólo deja que cada
// persona lea su propia fila: pedida desde el Panel, la lista vuelve vacía y el desplegable
// aparece sin nadie adentro. El backend entra con la llave maestra —decisión escrita en
// `CLAUDE.md` §6— y acota a la Prestadora acá, en la única consulta que hace falta escribir.
// Todo el router está reservado a Admin y Superadmin de la Organización activa (ver el
// `use` de arriba), así que esta lista no llega a más gente de la que ya podía verla.
// CON LA MAESTRA por eso mismo; la Prestadora que recibe es la que la base dejó ver a quien pide.
function coordinadoresDeLaPrestadora(prestadoraId) {
  return supabase
    .from('usuarios')
    .select('id, nombre')
    .eq('prestadora_id', prestadoraId)
    .eq('rol', 'coordinador')
    .order('nombre');
}

panelConfiguracionRouter.get('/permisos', async (req, res) => {
  const db = clienteDelPedido(req);
  try {
    const prestadoraId = await prestadoraVisible(db);
    const [acciones, { data: filas, error: errorFilas }, { data: coordinadores, error: errorCoordinadores }] = await Promise.all([
      accionesDePermisos(db),
      db.from('permisos_prestadora').select('*'),
      coordinadoresDeLaPrestadora(prestadoraId),
    ]);
    if (errorFilas) return responderError(res, errorFilas);
    if (errorCoordinadores) return responderError(res, errorCoordinadores);

    const porAccion = Object.fromEntries((filas || []).map((f) => [f.accion, f]));
    const permisos = acciones.map(({ accion, default_solo_admin }) => porAccion[accion] || {
      accion,
      alcance: default_solo_admin ? 'solo_admin' : 'admin_y_coordinador',
      excepciones_permitir: [],
      excepciones_denegar: [],
    });

    res.json({ permisos, coordinadores });
  } catch (e) {
    responderError(res, e);
  }
});

panelConfiguracionRouter.patch('/permisos/:accion', async (req, res) => {
  const { accion } = req.params;
  const db = clienteDelPedido(req);
  let acciones;
  try {
    acciones = await accionesDePermisos(db);
  } catch (e) {
    return responderError(res, e);
  }
  if (!acciones.some((a) => a.accion === accion)) {
    return res.status(400).json({ error: 'Acción desconocida' });
  }
  const { alcance, excepciones_permitir, excepciones_denegar } = req.body;
  if (!['solo_admin', 'admin_y_coordinador'].includes(alcance)) {
    return res.status(400).json({ error: 'Alcance inválido' });
  }
  // Cuál era el alcance antes, leído antes de pisarlo. Puede no haber fila: ahí el alcance que
  // regía era el de fábrica del catálogo, y eso se anota tal cual.
  const prestadoraId = await prestadoraVisibleOContestar(db, res);
  if (!prestadoraId) return;
  const { data: antes } = await db
    .from('permisos_prestadora')
    .select('alcance')
    .eq('accion', accion)
    .maybeSingle();

  const { error } = await db.from('permisos_prestadora').upsert(
    {
      prestadora_id: prestadoraId,
      accion,
      alcance,
      excepciones_permitir: excepciones_permitir || [],
      excepciones_denegar: excepciones_denegar || [],
      actualizado_por: req.usuarioPanel.id,
      actualizado_en: new Date().toISOString(),
    },
    { onConflict: 'prestadora_id,accion' }
  );
  if (error) return responderError(res, error);

  // Un cambio de permisos cambia quién puede hacer qué: es de lo que la regla de la empresa pide
  // auditar sin excepción. Se anota qué permiso y de qué alcance a qué alcance —las tres son
  // claves opacas—, y qué columnas se tocaron. Quiénes quedaron como excepción no se anotan acá:
  // son cuentas de personas, y para eso se mira el permiso.
  await registrarActividad(req.usuarioPanel, ACCION_CAMBIO_DE_PERMISOS, {
    tablaAfectada: 'permisos_prestadora',
    camposCambiados: ['alcance', 'excepciones_permitir', 'excepciones_denegar'],
    detalle: {
      accion_permiso: accion,
      alcance_anterior: antes?.alcance ?? null,
      alcance_nuevo: alcance,
    },
  });

  res.json({ ok: true });
});

panelConfiguracionRouter.get('/politica-verificacion', async (req, res) => {
  const { data, error } = await clienteDelPedido(req)
    .from('prestadoras')
    .select('politica_verificacion_alta_manual')
    .single();
  if (error) return responderError(res, error);
  res.json({ politica_verificacion_alta_manual: data.politica_verificacion_alta_manual });
});

panelConfiguracionRouter.patch('/politica-verificacion', async (req, res) => {
  const { politica } = req.body;
  if (!['omitir', 'pendiente', 'aprobado'].includes(politica)) {
    return res.status(400).json({ error: 'Política inválida' });
  }
  const prestadoraId = await prestadoraVisibleOContestar(clienteDelPedido(req), res);
  if (!prestadoraId) return;
  // CON LA MAESTRA: la fila de la Prestadora sólo la modifica superadmin por RLS.
  const { error } = await supabase
    .from('prestadoras')
    .update({ politica_verificacion_alta_manual: politica })
    .eq('id', prestadoraId);
  if (error) return responderError(res, error);
  res.json({ ok: true });
});

// --- Escalada a Coordinador: respaldo + intervalos de insistencia según premura
//     (punto 5 de docs/PRD_06_WhatsApp_IA.md) ---

// NINGÚN VALOR DE ARRANQUE SE ESCRIBE ACÁ. Los que valen mientras la Prestadora no tocó nada
// son los `DEFAULT` de cada columna, y esa es la única fuente. Si la fila llegara a faltar se
// la pide a la base, que la crea con esos mismos valores; copiarlos acá haría que el formulario
// prometa un número y el backend use otro apenas alguien cambie la migración.
// Lo que sí vive acá son los dos bordes de lo que se puede guardar.
const MINUTOS_DE_UN_DIA = 24 * 60;
const HORAS_DE_TRES_DIAS = 72;

panelConfiguracionRouter.get('/escalada-coordinador', async (req, res) => {
  const db = clienteDelPedido(req);
  const prestadoraId = await prestadoraVisibleOContestar(db, res);
  if (!prestadoraId) return;
  // La lista de Coordinadores viaja con la configuración, y no la pide el navegador por su
  // cuenta: es el mismo reparto que ya usa `/permisos`, con la misma consulta escrita una sola
  // vez más arriba.
  const [{ data, error }, { data: coordinadores, error: errorCoordinadores }] = await Promise.all([
    db
      .from('configuracion_escalada_coordinador')
      .select('*')
      .maybeSingle(),
    coordinadoresDeLaPrestadora(prestadoraId),
  ]);
  if (error) return responderError(res, error);
  if (errorCoordinadores) return responderError(res, errorCoordinadores);

  // Toda Prestadora nace con esta fila: la crea el disparador del alta
  // (`trg_sembrar_configuracion_prestadora`), y las que existían antes quedaron completadas. Si
  // igual faltara, se la pide a la misma función que usa el alta y se vuelve a leer. Así lo
  // que el formulario muestra es lo que la base va a usar de verdad, y no una copia.
  let escalada = data;
  if (!escalada) {
    // CON LA MAESTRA: la función que siembra la configuración no se le dio a quien inicia
    // sesión. La Prestadora es la que la base acaba de dejar ver.
    const { error: errorSiembra } = await supabase.rpc('sembrar_configuracion_prestadora', {
      p_prestadora_id: prestadoraId,
    });
    if (errorSiembra) return responderError(res, errorSiembra);
    const { data: recien, error: errorRelectura } = await db
      .from('configuracion_escalada_coordinador')
      .select('*')
      .maybeSingle();
    if (errorRelectura) return responderError(res, errorRelectura);
    escalada = recien;
  }

  res.json({ coordinadores: coordinadores || [], escalada });
});

panelConfiguracionRouter.patch('/escalada-coordinador', async (req, res) => {
  const {
    coordinador_backup_id, minutos_antes_backup, umbrales_premura,
    fase_automatica_activa, minutos_antes_fase_automatica,
    minutos_gracia_cierre_guardia, horas_antes_aviso_grave_sin_cerrar,
    minutos_antes_todos_los_coordinadores, minutos_antes_administracion,
    minutos_insistencia_emergencia,
  } = req.body;

  // Lo mismo que los minutos de abajo: la base rechazaría el valor fuera de borde con un error
  // suyo, y esto contesta uno que se entiende.
  if (minutos_insistencia_emergencia !== undefined) {
    const problemaEmergencia = validarMinutosEmergencia(minutos_insistencia_emergencia);
    if (problemaEmergencia) return res.status(400).json({ error: problemaEmergencia });
  }

  // Los tramos deciden cada cuánto se le vuelve a insistir al Coordinador. Antes se guardaban
  // sin mirarlos, y una lista mal armada no rompía nada acá: rompía después, callada, en
  // intervaloParaPremura() — que ante un tramo raro cae a su intervalo de respaldo y le
  // termina avisando cada una hora a alguien que había pedido que le avisen cada diez minutos.
  const problema = validarUmbralesPremura(umbrales_premura);
  if (problema) return res.status(400).json({ error: problema });

  // El Panel ya lo revisa antes de mandarlo, pero la revisión de allá es para que la
  // Coordinadora se entere sin esperar la respuesta del servidor — no es la que protege el
  // dato. Esta es la que protege: la base rechazaría un valor fuera de rango con un error
  // suyo, ilegible, y cualquiera puede llamar a esta dirección sin pasar por la pantalla.
  if (minutos_gracia_cierre_guardia !== undefined) {
    const minutos = Number(minutos_gracia_cierre_guardia);
    if (!Number.isInteger(minutos) || minutos <= 0 || minutos > MINUTOS_DE_UN_DIA) {
      return res.status(400).json({
        error: `Los minutos de espera para avisar que una guardia quedó sin cerrar tienen que ser un número entero entre 1 y ${MINUTOS_DE_UN_DIA}`,
      });
    }
  }

  if (horas_antes_aviso_grave_sin_cerrar !== undefined) {
    const horas = Number(horas_antes_aviso_grave_sin_cerrar);
    if (!Number.isInteger(horas) || horas <= 0 || horas > HORAS_DE_TRES_DIAS) {
      return res.status(400).json({
        error: `Las horas antes de escalar una guardia sin cerrar tienen que ser un número entero entre 1 y ${HORAS_DE_TRES_DIAS}`,
      });
    }
  }

  // Los dos escalones de arriba se apagan dejando el campo vacío, así que el nulo es un valor
  // válido y no un dato que falta. Lo que no puede pasar es que el número quede fuera de los
  // bordes, que son los mismos que mira el Panel antes de mandar.
  for (const [campo, valor] of [
    ['minutos_antes_todos_los_coordinadores', minutos_antes_todos_los_coordinadores],
    ['minutos_antes_administracion', minutos_antes_administracion],
  ]) {
    if (valor === undefined || valor === null || valor === '') continue;
    const { minimo, maximo } = MINUTOS_QUE_SE_PUEDEN_TOCAR[campo];
    const minutos = Number(valor);
    if (!Number.isInteger(minutos) || minutos < minimo || minutos > maximo) {
      return res.status(400).json({
        error: `Los minutos antes de escalar tienen que ser un número entero entre ${minimo} y ${maximo}`,
      });
    }
  }

  const enMinutosOApagado = (valor) =>
    valor === undefined || valor === null || valor === '' ? null : Number(valor);

  const db = clienteDelPedido(req);
  const prestadoraId = await prestadoraVisibleOContestar(db, res);
  if (!prestadoraId) return;
  const { error } = await db
    .from('configuracion_escalada_coordinador')
    .upsert({
      prestadora_id: prestadoraId,
      coordinador_backup_id,
      minutos_antes_backup,
      umbrales_premura,
      fase_automatica_activa,
      minutos_antes_fase_automatica,
      // Sin valor no se pisa nada: el campo que no viene se omite, así que la fila que ya
      // existe conserva lo que la Prestadora había configurado y la que se crea toma el
      // `DEFAULT` de la columna. Antes acá se forzaba un número escrito en este archivo, que
      // borraba en silencio una configuración guardada.
      ...(minutos_gracia_cierre_guardia === undefined
        ? {}
        : { minutos_gracia_cierre_guardia }),
      ...(horas_antes_aviso_grave_sin_cerrar === undefined
        ? {}
        : { horas_antes_aviso_grave_sin_cerrar }),
      ...(minutos_insistencia_emergencia === undefined
        ? {}
        : { minutos_insistencia_emergencia: Number(minutos_insistencia_emergencia) }),
      minutos_antes_todos_los_coordinadores: enMinutosOApagado(minutos_antes_todos_los_coordinadores),
      minutos_antes_administracion: enMinutosOApagado(minutos_antes_administracion),
      updated_at: new Date().toISOString(),
    });
  if (error) return responderError(res, error);
  res.json({ ok: true });
});

// ============================================================================
// El consentimiento del Pagador: el texto y los papeles que se exigen
// ============================================================================
//
// EL TEXTO ES DE LA PRESTADORA. Es un documento hacia un tercero suyo, así que lo escribe, lo
// adopta o lo reemplaza ella. El producto le entrega un modelo a título de sugerencia y nada más:
// mientras no cargue ninguno rige ese modelo, y por eso la pantalla dice de dónde salió el texto
// que está viendo. Sin fila, no se guarda una copia por Prestadora: así, el día que el modelo
// mejore, ninguna queda con la versión vieja sin haber decidido nada.

panelConfiguracionRouter.get('/consentimiento-pagador', async (req, res) => {
  try {
    const vigente = await cuerpoVigente({ prestadoraId: await prestadoraVisible(clienteDelPedido(req)) });
    // Los marcadores se devuelven para que quien escriba el suyo sepa cuáles puede usar. Salen del
    // mismo archivo que los reemplaza, para que la lista no se despegue de lo que de verdad anda.
    res.json({ ...vigente, marcadores: MARCADORES, modeloDelProducto: MODELO_DE_FABRICA });
  } catch (error) {
    responderError(res, error);
  }
});

panelConfiguracionRouter.put('/consentimiento-pagador', async (req, res) => {
  const { cuerpo, idioma } = req.body || {};
  const db = clienteDelPedido(req);
  const prestadoraId = await prestadoraVisibleOContestar(db, res);
  if (!prestadoraId) return;

  // Vaciarlo es volver al modelo del producto, no dejar a la Prestadora sin texto: se borra la
  // fila y vuelve a regir el modelo.
  if (!String(cuerpo ?? '').trim()) {
    const { error } = await db
      .from('textos_consentimiento_pagador')
      .delete()
      .eq('prestadora_id', prestadoraId)
      .eq('idioma', idioma || IDIOMA_DEL_DOCUMENTO);
    if (error) return responderError(res, error);
    return res.json({ ok: true, esDelProducto: true });
  }

  const { error } = await db
    .from('textos_consentimiento_pagador')
    .upsert({
      prestadora_id: prestadoraId,
      idioma: idioma || IDIOMA_DEL_DOCUMENTO,
      cuerpo,
      actualizado_por: req.usuarioPanel.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'prestadora_id,idioma' });
  if (error) return responderError(res, error);
  res.json({ ok: true, esDelProducto: false });
});

// ============================================================================
// La medicación que carga el Cliente: si se le pide la firma, y el texto que acepta
// ============================================================================
//
// Mismo criterio que el texto del Pagador: el producto trae un modelo y la Prestadora lo adopta,
// lo cambia o vuelve a él. Acá hay un texto por idioma, porque lo lee el Cliente en el suyo.

panelConfiguracionRouter.get('/consentimiento-medicacion', async (req, res) => {
  try {
    const db = clienteDelPedido(req);
    const prestadoraId = await prestadoraVisible(db);
    const [pideFirma, ...vigentes] = await Promise.all([
      pideLaFirmaDeLaMedicacion({ prestadoraId, db }),
      ...IDIOMAS_DEL_TEXTO_DE_MEDICACION.map((idioma) => cuerpoDeMedicacionVigente({ prestadoraId, idioma, db })),
    ]);
    res.json({
      pideFirma,
      textos: Object.fromEntries(vigentes.map((v) => [v.idioma, v])),
      marcadores: MARCADORES_DE_MEDICACION,
      modeloDelProducto: MODELO_DE_MEDICACION,
    });
  } catch (error) {
    responderError(res, error);
  }
});

panelConfiguracionRouter.put('/consentimiento-medicacion', async (req, res) => {
  const { cuerpo, idioma } = req.body || {};
  if (!IDIOMAS_DEL_TEXTO_DE_MEDICACION.includes(idioma)) return responderError(res, new ErrorConMotivo('faltan_datos'));
  const db = clienteDelPedido(req);
  const prestadoraId = await prestadoraVisibleOContestar(db, res);
  if (!prestadoraId) return;

  // Vaciarlo es volver al modelo del producto, igual que el del Pagador.
  if (!String(cuerpo ?? '').trim()) {
    const { error } = await db
      .from('textos_consentimiento_medicacion')
      .delete()
      .eq('prestadora_id', prestadoraId)
      .eq('idioma', idioma);
    if (error) return responderError(res, error);
    return res.json({ ok: true, esDelProducto: true });
  }

  const { error } = await db
    .from('textos_consentimiento_medicacion')
    .upsert({
      prestadora_id: prestadoraId,
      idioma,
      cuerpo,
      actualizado_por: req.usuarioPanel.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'prestadora_id,idioma' });
  if (error) return responderError(res, error);
  res.json({ ok: true, esDelProducto: false });
});

panelConfiguracionRouter.put('/consentimiento-medicacion/pide-firma', async (req, res) => {
  const { pideFirma } = req.body || {};
  if (typeof pideFirma !== 'boolean') return responderError(res, new ErrorConMotivo('faltan_datos'));
  const db = clienteDelPedido(req);
  const prestadoraId = await prestadoraVisibleOContestar(db, res);
  if (!prestadoraId) return;

  const { error } = await db
    .from('configuracion_medicacion')
    .upsert({
      prestadora_id: prestadoraId,
      pide_firma_del_cliente: pideFirma,
      actualizado_por: req.usuarioPanel.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'prestadora_id' });
  if (error) return responderError(res, error);
  res.json({ ok: true });
});

// Qué papeles exige cada financiador. El producto no siembra ninguno: eso lo sabe la Prestadora
// que trabaja con ese financiador, y adivinarlo desde acá sería inventar un requisito que nadie
// pidió. Vacío quiere decir «no se exige ninguno», y es una respuesta válida.
panelConfiguracionRouter.get('/documentos-pagador', async (req, res) => {
  const { data, error } = await clienteDelPedido(req)
    .from('tipos_documento_pagador')
    .select('id, nombre, financiador_tipo, requiere_vencimiento, activo')
    .order('nombre');
  if (error) return responderError(res, error);
  res.json({ tipos: data ?? [] });
});

panelConfiguracionRouter.post('/documentos-pagador', async (req, res) => {
  const { nombre, financiador_tipo, requiere_vencimiento } = req.body || {};
  if (!String(nombre ?? '').trim()) {
    return res.status(400).json({ error: 'Falta el nombre del documento' });
  }

  const db = clienteDelPedido(req);
  const prestadoraId = await prestadoraVisibleOContestar(db, res);
  if (!prestadoraId) return;
  const { data, error } = await db
    .from('tipos_documento_pagador')
    .insert({
      prestadora_id: prestadoraId,
      nombre: String(nombre).trim(),
      // Vacío es «a todos los financiadores», y así se guarda: nulo.
      financiador_tipo: financiador_tipo || null,
      requiere_vencimiento: Boolean(requiere_vencimiento),
    })
    .select('id')
    .single();
  if (error) return responderError(res, error);
  res.json({ ok: true, id: data.id });
});

panelConfiguracionRouter.patch('/documentos-pagador/:id', async (req, res) => {
  const { nombre, financiador_tipo, requiere_vencimiento, activo } = req.body || {};

  const cambios = {};
  if (nombre !== undefined) cambios.nombre = String(nombre).trim();
  if (financiador_tipo !== undefined) cambios.financiador_tipo = financiador_tipo || null;
  if (requiere_vencimiento !== undefined) cambios.requiere_vencimiento = Boolean(requiere_vencimiento);
  if (activo !== undefined) cambios.activo = Boolean(activo);

  const { data, error } = await clienteDelPedido(req)
    .from('tipos_documento_pagador')
    .update(cambios)
    .eq('id', req.params.id)
    .select('id');
  if (error) return responderError(res, error);
  if (!data?.length) return res.status(404).json({ error: 'Ese documento no existe' });
  res.json({ ok: true });
});

// No se borra: se apaga. Un tipo borrado se llevaría puestos los papeles ya cargados con él, y lo
// que se quiso decir es «esto ya no se pide más», no «esto nunca se pidió».
panelConfiguracionRouter.delete('/documentos-pagador/:id', async (req, res) => {
  const { data, error } = await clienteDelPedido(req)
    .from('tipos_documento_pagador')
    .update({ activo: false })
    .eq('id', req.params.id)
    .select('id');
  if (error) return responderError(res, error);
  if (!data?.length) return res.status(404).json({ error: 'Ese documento no existe' });
  res.json({ ok: true });
});
