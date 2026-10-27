import { Router } from 'express';
import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import { clienteDelPedido } from '../db/connection.js';
import { requierePermiso } from '../utils/permisos.js';
import { responderError } from '../utils/errorConMotivo.js';

/* Dónde cobra un Asistente, mirado desde la administración de la Prestadora.
   ==========================================================================

   POR QUÉ EXISTE ESTE ARCHIVO. El Asistente ya puede informar su cuenta desde el teléfono
   (`appAsistentes.js`), pero del lado del Panel no había forma de mirarla, así que no se le
   podía transferir nada. Esto es esa mirada, y nada más: se lee, no se escribe. Lo que la
   administración corrige de una cuenta lo corrige su dueño.

   POR DÓNDE SE ENTRA. Por el permiso `ver_datos_bancarios_asistente`, que nace reservada a
   administración, con el mismo molde que `ver_pagos_asistente`. Todo entra a la base con la
   credencial de quien pide (`clienteDelPedido(req)`), no con la llave maestra: la base sabe quién
   pide y le contesta sólo lo de su Prestadora, así que ninguna consulta lleva el filtro de la
   Prestadora de la sesión. Al Coordinador con el permiso la base le deja los Asistentes de su
   zona, y a nadie el Asistente pendiente de conformidad: para esta mirada, esos no existen.

   EL NÚMERO DE CUENTA NO SALE POR NINGÚN LADO. No viaja en la dirección, no se registra, no
   aparece en ningún mensaje de error y no entra en la auditoría. Sale solamente en el cuerpo de
   la respuesta, que es a quien se le pidió. Lo que sí va en la dirección es de quién se está
   mirando la cuenta, que es un identificador de una persona, no un número de cuenta.

   CÓMO SE LLAMA EL NÚMERO LO DICE LA BASE. CBU, CVU o alias son nombres de Argentina; en otro
   país son otros. La sigla sale de `catalogo_identificadores_de_cuenta`, que es por país y no
   es de ninguna Prestadora: dos Prestadoras del mismo país ven la misma. */

export const panelDatosBancariosRouter = Router();

const PERMISO_LECTURA = 'ver_datos_bancarios_asistente';

panelDatosBancariosRouter.get(
  '/:asistenteId',
  requiereRolPanel,
  requierePermiso(PERMISO_LECTURA),
  async (req, res) => {
    const db = clienteDelPedido(req);

    // Primero de quién es. Si la base no lo deja ver, para quien pregunta no existe, y contesta
    // lo mismo que uno que no existe.
    const { data: asistente, error: errorAsistente } = await db
      .from('asistentes')
      .select('id, nombre')
      .eq('id', req.params.asistenteId)
      .maybeSingle();
    if (errorAsistente) return responderError(res, errorAsistente);
    if (!asistente) return res.status(404).json({ error: 'Asistente no encontrado' });

    const { data: cuentas, error } = await db
      .from('datos_bancarios_asistente')
      .select('pais, identificador_clase, identificador, banco, titular, updated_at')
      .eq('asistente_id', asistente.id);
    if (error) return responderError(res, error);

    const paises = [...new Set((cuentas || []).map((cuenta) => cuenta.pais))];
    let siglas = new Map();
    if (paises.length > 0) {
      const { data: catalogo, error: errorCatalogo } = await db
        .from('catalogo_identificadores_de_cuenta')
        .select('pais, codigo, sigla')
        .in('pais', paises);
      if (errorCatalogo) return responderError(res, errorCatalogo);
      siglas = new Map((catalogo || []).map((fila) => [`${fila.pais}:${fila.codigo}`, fila.sigla]));
    }

    res.json({
      asistente: { id: asistente.id, nombre: asistente.nombre },
      cuentas: (cuentas || []).map((cuenta) => ({
        pais: cuenta.pais,
        clase: cuenta.identificador_clase,
        sigla: siglas.get(`${cuenta.pais}:${cuenta.identificador_clase}`) || cuenta.identificador_clase,
        identificador: cuenta.identificador,
        banco: cuenta.banco,
        titular: cuenta.titular,
        actualizado_en: cuenta.updated_at,
      })),
    });
  },
);
