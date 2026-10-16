import { Router } from 'express';
import multer from 'multer';
import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import { acotarAPrestadora, exigirOrganizacionActiva } from '../middleware/alcancePrestadora.js';
import { enLaPrestadora } from '../db/connection.js';
import { esDocumentoDeCese, rutaEnElDeposito } from '../utils/documentosDeCese.js';
import { responderError } from '../utils/errorConMotivo.js';

// Los documentos del cese quedan guardados.
//
// QUÉ RESOLVÍA MAL ESTO. El PDF de la liquidación final, el del telegrama y el de la notificación
// de fin de período de prueba se arman en el navegador con los datos del cese y se bajaban a la
// máquina de quien apretó el botón. Nada más. `ceses.documentos_generados` existía vacía desde
// siempre, así que un mes después nadie podía decir qué documento se le entregó a esa persona; y
// volver a apretar el botón no devuelve el mismo papel, porque el cálculo se rehace con las
// escalas de hoy. `docs/PRD_02B_Gestion_Personal.md:156-163` los pide guardados.
//
// POR QUÉ SUBE POR ACÁ Y NO DERECHO DESDE EL PANEL. El depósito `documentos-cese` es privado:
// adentro hay documentos de baja con nombre, documento y montos. La ruta del archivo la arma esta
// ruta con los datos del cese, nunca con lo que venga en el pedido, y el tipo sale de una lista
// cerrada.
//
// CON LA CREDENCIAL DEL TRABAJO DE LA PRESTADORA ACTIVA. El cese, el depósito y el enlace temporal
// van con esa credencial, que la base acota a los ceses de esa Prestadora y, en el depósito, a la
// carpeta de un cese suyo. Con la de quien pide no alcanzaría: la política `admin_gestiona_ceses`
// deja ver y escribir los ceses sólo a la administración, y esta ruta la usa también quien
// coordina. Del cese, el trabajo sólo lee y anota: no da de alta ni borra ninguno.
//
// EL PDF LO SIGUE ARMANDO EL NAVEGADOR. Armarlo también acá sería tener el generador escrito dos
// veces, y las dos versiones se separarían el día que alguien corrija una sola: entonces el
// documento guardado y el que se bajó dirían cosas distintas, que es peor que no guardar nada. Lo
// que sube es exactamente el archivo que se bajó.

export const panelCesesRouter = Router();

const BUCKET = 'documentos-cese';
const TAMANO_MAXIMO = 5 * 1024 * 1024; // 5 MB. Un PDF de texto de una carilla pesa decenas de KB.

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TAMANO_MAXIMO },
  fileFilter(req, file, cb) {
    cb(null, file.mimetype === 'application/pdf');
  },
});

async function ceseDeLaPrestadora(db, ceseId, usuarioPanel) {
  let query = db
    .from('ceses')
    .select('id, prestadora_id, documentos_generados')
    .eq('id', ceseId);
  query = acotarAPrestadora(query, usuarioPanel);
  const { data } = await query.maybeSingle();
  return data;
}

function manejarErrorMulter(err, req, res, next) {
  if (err) {
    return res.status(400).json({ error: 'documento_invalido', motivo: 'documento_invalido' });
  }
  next();
}

panelCesesRouter.post(
  '/:id/documento',
  requiereRolPanel,
  exigirOrganizacionActiva,
  upload.single('archivo'),
  manejarErrorMulter,
  async (req, res) => {
    // Qué documento es lo decide una lista cerrada, compartida con la pantalla que lo arma
    // (`utils/documentosDeCese.js`). Sin ese corte, el tipo lo escribiría quien manda el pedido y
    // sería él quien decide el nombre del archivo adentro del depósito.
    const { tipo } = req.body ?? {};
    if (!esDocumentoDeCese(tipo)) {
      return res.status(400).json({ error: 'documento_invalido', motivo: 'documento_invalido' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'documento_invalido', motivo: 'documento_invalido' });
    }

    await enLaPrestadora(req.usuarioPanel.prestadoraId, 'documentos del cese', async (db) => {
      const cese = await ceseDeLaPrestadora(db, req.params.id, req.usuarioPanel);
      if (!cese) {
        return res.status(404).json({ error: 'cese_no_encontrado', motivo: 'cese_no_encontrado' });
      }

      // La ruta empieza por la Prestadora del cese, que ya se comprobó que es la de quien pide.
      const ruta = rutaEnElDeposito(cese.prestadora_id, cese.id, tipo);
      const { error: errorSubida } = await db.storage
        .from(BUCKET)
        .upload(ruta, req.file.buffer, { contentType: 'application/pdf', upsert: true });
      if (errorSubida) {
        return responderError(res, errorSubida);
      }

      // La columna guarda un documento por tipo, con el día en que se generó. Se lee y se vuelve a
      // escribir entera porque la base no ofrece mezclar un pedazo de JSON desde acá; el riesgo de
      // que dos subidas simultáneas se pisen existe, y es chico: los tres documentos de un cese los
      // baja una persona de a uno, apretando un botón por vez.
      const documentos = { ...cese.documentos_generados, [tipo]: { ruta, generado_en: new Date().toISOString() } };

      let apuntar = db
        .from('ceses')
        .update({ documentos_generados: documentos })
        .eq('id', cese.id);
      apuntar = acotarAPrestadora(apuntar, req.usuarioPanel);
      const { data: apuntado, error: errorUpdate } = await apuntar.select('id');
      if (errorUpdate) {
        return responderError(res, errorUpdate);
      }
      // El archivo ya está arriba: si la fila del cese ya no está, ese documento queda sin dueño y
      // nadie lo va a encontrar. Eso se dice, no se contesta que salió todo bien.
      if (!apuntado?.length) {
        return res.status(404).json({ error: 'cese_no_encontrado', motivo: 'cese_no_encontrado' });
      }

      return res.json({ ok: true, documentos_generados: documentos });
    });
  },
);

panelCesesRouter.get('/:id/documento-url', requiereRolPanel, exigirOrganizacionActiva, async (req, res) => {
  const { tipo } = req.query;
  if (!esDocumentoDeCese(tipo)) {
    return res.status(400).json({ error: 'documento_invalido', motivo: 'documento_invalido' });
  }

  await enLaPrestadora(req.usuarioPanel.prestadoraId, 'documentos del cese', async (db) => {
    const cese = await ceseDeLaPrestadora(db, req.params.id, req.usuarioPanel);
    if (!cese) {
      return res.status(404).json({ error: 'cese_no_encontrado', motivo: 'cese_no_encontrado' });
    }

    // La ruta se arma acá con los datos del cese, no se lee la que vino en el pedido: así no hay
    // forma de pedir un enlace temporal a un archivo de otra Prestadora. Lo guardado sólo dice si
    // ese documento existe.
    const guardado = cese.documentos_generados?.[tipo];
    if (!guardado) {
      return res.status(404).json({ error: 'documento_no_generado', motivo: 'documento_no_generado' });
    }

    const { data, error } = await db.storage
      .from(BUCKET)
      .createSignedUrl(rutaEnElDeposito(cese.prestadora_id, cese.id, tipo), 60);
    if (error) {
      return responderError(res, error);
    }

    return res.json({ url: data.signedUrl });
  });
});
