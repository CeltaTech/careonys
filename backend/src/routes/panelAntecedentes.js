/*
 * Lo que trajo la importación de cada persona y no tenía un lugar propio: la historia anterior del
 * Paciente, los antecedentes del Legajo del Asistente y los del Cliente.
 *
 * Se lee siempre con la sesión de quien pide: la base decide qué filas alcanza, y la lectura de la
 * historia del Paciente queda registrada como toda lectura de información de salud. Un documento
 * guardado se entrega con un enlace temporal de 60 segundos, pedido también con esa sesión.
 */

import { Router } from 'express';
import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import { clienteDelPedido } from '../db/connection.js';
import { esIdentificador } from '../utils/loteManual.js';
import { ErrorConMotivo, responderError } from '../utils/errorConMotivo.js';
import { DEPOSITO_DE_LA_HISTORIA, enlaceTemporal } from '../utils/originalesDeImportacion.js';

export const panelAntecedentesRouter = Router();

const COLUMNAS = 'id, clase, etiqueta, valor, datos, fecha, hoja, fila, importacion_id, created_at';

const DE_QUIEN = {
  paciente: {
    tabla: 'historia_anterior_del_paciente',
    columna: 'paciente_id',
    columnas: `${COLUMNAS}, documento_ruta, documento_nombre, documento_tipo`,
  },
  asistente: { tabla: 'antecedentes_del_legajo', columna: 'asistente_id', columnas: COLUMNAS },
  cliente: { tabla: 'antecedentes_del_cliente', columna: 'cliente_id', columnas: COLUMNAS },
};

async function antecedenteParaLaPantalla(db, fila) {
  let documento = null;
  if (fila.documento_ruta) {
    documento = {
      nombre: fila.documento_nombre ?? null,
      tipo: fila.documento_tipo ?? null,
      url: await enlaceTemporal(db, DEPOSITO_DE_LA_HISTORIA, fila.documento_ruta),
    };
  }
  return {
    id: fila.id,
    clase: fila.clase,
    etiqueta: fila.etiqueta ?? null,
    valor: fila.valor ?? null,
    datos: fila.datos ?? null,
    fecha: fila.fecha ?? null,
    hoja: fila.hoja ?? null,
    fila: fila.fila ?? null,
    importacionId: fila.importacion_id ?? null,
    creado: fila.created_at,
    documento,
  };
}

for (const [quien, { tabla, columna, columnas }] of Object.entries(DE_QUIEN)) {
  panelAntecedentesRouter.get(`/${quien}/:id`, requiereRolPanel, async (req, res) => {
    try {
      if (!esIdentificador(req.params.id)) throw new ErrorConMotivo('persona_no_encontrada');
      const db = clienteDelPedido(req);
      const { data, error } = await db
        .from(tabla)
        .select(columnas)
        .eq(columna, req.params.id)
        .eq('prestadora_id', req.usuarioPanel.prestadoraId)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      const antecedentes = [];
      for (const fila of data ?? []) antecedentes.push(await antecedenteParaLaPantalla(db, fila));
      res.json({ antecedentes });
    } catch (error) {
      responderError(res, error);
    }
  });
}
