import { Router } from 'express';
import multer from 'multer';
import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import { clienteDelPedido, supabase } from '../db/connection.js';
import { tipoMatriculaRequerida, hayAsistenteAsignadoConMatricula } from '../utils/medicacionIndicaciones.js';
import { extensionDeArchivo, rutaDeMatriculaNueva } from '../utils/archivosSubidos.js';
import { registrarAdvertenciaAlActivar } from '../utils/advertenciaLegal.js';
import { responderError } from '../utils/errorConMotivo.js';
import { anotarConsultaAHce, origenDelPedido } from '../utils/registroDeConsultas.js';

// Cierra pendiente #62 (docs/PLAN_HASTA_PRODUCCION.md): cola de revisión de indicaciones de
// medicación solicitadas por el Cliente (appClientesMedicacion.js). Aceptar/rechazar nunca
// bloquea por falta de matrícula del Asistente (CLAUDE.md §3) — solo informa mediante
// el flag `sinMatricula`, que el Panel usa para mostrar la advertencia legal
// (AdvertenciaLegalContext, funcion_clave 'medicacion_via_sin_matricula') antes de confirmar
// la aceptación. Mostrarla es de la pantalla; dejar registrado que se avisó es de acá, en el
// mismo pedido que acepta la indicación (utils/advertenciaLegal.js).
//
// matriculas_asistente y configuracion_matricula_via_medicacion no tienen rutas CRUD
// acá: el Panel las gestiona directo vía supabase-js bajo RLS (mismo criterio que
// autorizaciones_monitoreo_paciente/rangos_referencia_vitales — RLS ya lo permite a
// admin_prestadora). Esta ruta solo resuelve el archivo de evidencia de matrícula.
//
// CON LA CREDENCIAL DE QUIEN PIDE. La firma del archivo entra a la base con
// `clienteDelPedido(req)`, no con la llave maestra: el depósito sólo firma archivos cuya ruta
// empieza por la Prestadora de quien pide, así que la firma no compara la ruta a mano. La bandeja
// es información de salud: antes de entregarla queda anotado, con esa misma credencial, quién la
// vio, paciente por paciente.
//
// SIGUEN CON LA LLAVE MAESTRA, con la Prestadora de la sesión escrita en cada consulta:
// - Leer la bandeja: la base se la acota más que lo que la pantalla mostraba (ver el comentario
//   de la consulta).
// - Aceptar y rechazar: la base deja modificar una indicación sólo a la administración, y acá
//   también la revisa el Coordinador (`indicaciones_medicacion`, modificar).
// - Subir el archivo de matrícula: el depósito no le deja escribir al Coordinador
//   (`prescripciones-medicacion`, alta y reemplazo).

export const panelMedicacionRouter = Router();

const BUCKET = 'prescripciones-medicacion';
const TIPOS_PERMITIDOS = ['application/pdf', 'image/jpeg', 'image/png'];
const TAMANO_MAXIMO = 10 * 1024 * 1024; // 10 MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TAMANO_MAXIMO },
  fileFilter(req, file, cb) {
    cb(null, TIPOS_PERMITIDOS.includes(file.mimetype));
  },
});

function manejarErrorMulter(err, req, res, next) {
  if (err) {
    return res.status(400).json({ error: 'Archivo no permitido (solo PDF, JPG o PNG, hasta 10 MB)' });
  }
  next();
}

panelMedicacionRouter.get('/pendientes', requiereRolPanel, async (req, res) => {
  const db = clienteDelPedido(req);
  // Con la llave maestra: la política RESTRICTIVE `la_informacion_de_salud_la_ve_quien_atiende`
  // exige interno.alcanza_la_informacion_de_salud(paciente_id), y con la restricción de la
  // historia clínica activa (el valor de fábrica) el Administrador y el Superadministrador que no
  // atienden al paciente dejan de ver la indicación; además `oculta_pendientes_de_conformidad`
  // (RESTRICTIVE, NOT pendiente_conformidad) deja en null el paciente y el cliente embebidos si
  // están pendientes. Hasta ahora cada rol veía toda la bandeja de su Prestadora. Si se acota o no
  // se decide aparte.
  const { data, error } = await supabase
    .from('indicaciones_medicacion')
    .select('id, medicamento, dosis, frecuencia, via_administracion, prescripcion_archivo_url, fecha_desde, fecha_hasta, created_at, pacientes(id, nombre), clientes(id)')
    .eq('prestadora_id', req.usuarioPanel.prestadoraId)
    .eq('estado', 'pendiente')
    .order('created_at', { ascending: true });
  if (error) return responderError(res, error);

  // Antes de entregar la medicación queda anotado quién la vio. Si no se puede anotar, no se
  // entrega (docs/PLAN_HASTA_PRODUCCION.md, paso 9).
  const pacienteIds = [...new Set((data || []).map((indicacion) => indicacion.pacientes?.id).filter(Boolean))];
  try {
    for (const pacienteId of pacienteIds) {
      await anotarConsultaAHce(
        req.usuarioPanel,
        { pacienteId, categorias: ['indicaciones_medicacion'], origen: origenDelPedido(req) },
        { cliente: db },
      );
    }
  } catch (errorAnotacion) {
    return responderError(res, errorAnotacion);
  }

  const pendientes = await Promise.all(
    (data || []).map(async (indicacion) => {
      const tipoRequerido = await tipoMatriculaRequerida(req.usuarioPanel.prestadoraId, indicacion.via_administracion);
      const sinMatricula = tipoRequerido
        ? !(await hayAsistenteAsignadoConMatricula(
            req.usuarioPanel.prestadoraId,
            indicacion.pacientes.id,
            tipoRequerido
          ))
        : false;
      return { ...indicacion, tipoMatriculaRequerida: tipoRequerido, sinMatricula };
    })
  );

  res.json({ pendientes });
});

// Va con la llave maestra: ver el encabezado.
panelMedicacionRouter.post('/:id/aceptar', requiereRolPanel, async (req, res) => {
  const { data: indicacion } = await supabase
    .from('indicaciones_medicacion')
    .select('id, estado, paciente_id, via_administracion')
    .eq('id', req.params.id)
    .eq('prestadora_id', req.usuarioPanel.prestadoraId)
    .eq('estado', 'pendiente')
    .maybeSingle();
  if (!indicacion) return res.status(404).json({ error: 'Indicación no encontrada o ya revisada' });

  // La condición de la lectura se repite en la escritura, y se comprueba que haya escrito. Dos
  // Coordinadores mirando la misma bandeja pueden aceptar y rechazar la misma indicación al
  // mismo tiempo: sin esto, los dos ven que salió bien y solo una de las dos decisiones quedó.
  // En medicación eso no es un detalle de pantalla.
  const { data: aceptada, error } = await supabase
    .from('indicaciones_medicacion')
    .update({ estado: 'aceptada', revisado_por: req.usuarioPanel.id, revisado_en: new Date().toISOString() })
    .eq('id', indicacion.id)
    .eq('prestadora_id', req.usuarioPanel.prestadoraId)
    .eq('estado', 'pendiente')
    .select('id');
  if (error) return responderError(res, error);
  if (!aceptada?.length) return res.status(404).json({ error: 'Indicación no encontrada o ya revisada' });

  // Aceptada de verdad, se anota que se avisó. La situación se vuelve a calcular acá y no se
  // recibe del navegador: quien manda el pedido podría decir que no había nada que advertir.
  // Si la jurisdicción de esta Prestadora no tiene texto escrito para esta función, no hay
  // advertencia y no se anota nada — y la indicación queda aceptada igual (CLAUDE.md §7).
  const tipoRequerido = await tipoMatriculaRequerida(req.usuarioPanel.prestadoraId, indicacion.via_administracion);
  const sinMatricula = tipoRequerido
    ? !(await hayAsistenteAsignadoConMatricula(
        req.usuarioPanel.prestadoraId,
        indicacion.paciente_id,
        tipoRequerido
      ))
    : false;
  if (sinMatricula) {
    await registrarAdvertenciaAlActivar({
      prestadoraId: req.usuarioPanel.prestadoraId,
      usuarioId: req.usuarioPanel.id,
      funcionClave: 'medicacion_via_sin_matricula',
    });
  }

  res.json({ ok: true });
});

// Va con la llave maestra: ver el encabezado.
panelMedicacionRouter.post('/:id/rechazar', requiereRolPanel, async (req, res) => {
  const { motivo_rechazo: motivoRechazo } = req.body || {};
  if (!motivoRechazo) return res.status(400).json({ error: 'Falta el motivo del rechazo' });

  const { data: indicacion } = await supabase
    .from('indicaciones_medicacion')
    .select('id, estado')
    .eq('id', req.params.id)
    .eq('prestadora_id', req.usuarioPanel.prestadoraId)
    .eq('estado', 'pendiente')
    .maybeSingle();
  if (!indicacion) return res.status(404).json({ error: 'Indicación no encontrada o ya revisada' });

  // Mismo criterio que en /aceptar de más arriba.
  const { data: rechazada, error } = await supabase
    .from('indicaciones_medicacion')
    .update({
      estado: 'rechazada',
      motivo_rechazo: motivoRechazo,
      revisado_por: req.usuarioPanel.id,
      revisado_en: new Date().toISOString(),
    })
    .eq('id', indicacion.id)
    .eq('prestadora_id', req.usuarioPanel.prestadoraId)
    .eq('estado', 'pendiente')
    .select('id');
  if (error) return responderError(res, error);
  if (!rechazada?.length) return res.status(404).json({ error: 'Indicación no encontrada o ya revisada' });

  res.json({ ok: true });
});

// Va con la llave maestra: ver el encabezado.
panelMedicacionRouter.post(
  '/matriculas/:asistenteId/archivo',
  requiereRolPanel,
  upload.single('archivo'),
  manejarErrorMulter,
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'Archivo faltante o de tipo no permitido (solo PDF, JPG o PNG, hasta 10 MB)' });
    }

    const { data: asistente } = await supabase
      .from('asistentes')
      .select('id, prestadora_id')
      .eq('id', req.params.asistenteId)
      .eq('prestadora_id', req.usuarioPanel.prestadoraId)
      .maybeSingle();
    if (!asistente) return res.status(404).json({ error: 'Asistente no encontrado' });

    const ruta = rutaDeMatriculaNueva(asistente.prestadora_id, asistente.id, extensionDeArchivo(req.file.mimetype));

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(ruta, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
    if (error) return responderError(res, error);

    res.json({ archivoUrl: ruta });
  }
);

panelMedicacionRouter.get('/archivo-url', requiereRolPanel, async (req, res) => {
  const ruta = req.query.ruta;
  if (!ruta) {
    return res.status(400).json({ error: 'Ruta de archivo inválida' });
  }

  // La política del depósito exige que la ruta empiece por la Prestadora de quien pide: un archivo
  // de otra no se firma.
  const { data, error } = await clienteDelPedido(req).storage.from(BUCKET).createSignedUrl(ruta, 60);
  if (error) return responderError(res, error);

  res.json({ url: data.signedUrl });
});
