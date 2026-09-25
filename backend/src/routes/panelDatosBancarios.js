import { Router } from 'express';
import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import { supabase } from '../db/connection.js';
import { requierePermiso } from '../utils/permisos.js';
import { responderError } from '../utils/errorConMotivo.js';

/* Dónde cobra un Asistente, mirado desde la administración de la Prestadora.
   ==========================================================================

   POR QUÉ EXISTE ESTE ARCHIVO. El Asistente ya puede informar su cuenta desde el teléfono
   (`appAsistentes.js`), pero del lado del Panel no había forma de mirarla, así que no se le
   podía transferir nada. Esto es esa mirada, y nada más: se lee, no se escribe. Lo que la
   administración corrige de una cuenta lo corrige su dueño.

   POR DÓNDE SE ENTRA. Por el permiso `ver_datos_bancarios_asistente`, que nace reservada a
   administración, con el mismo molde que `ver_pagos_asistente`. La Prestadora sale siempre de
   la sesión, nunca del pedido, y va escrita en cada consulta: el backend entra a la base con la
   llave de servicio, o sea sin las reglas de acceso por fila, y acá el aislamiento lo garantiza
   cada consulta o no lo garantiza nadie (`CLAUDE.md` §5).

   EL NÚMERO DE CUENTA NO SALE POR NINGÚN LADO. No viaja en la dirección, no se registra, no
   aparece en ningún mensaje de error y no entra en la auditoría. Sale solamente en el cuerpo de
   la respuesta, que es a quien se le pidió. Lo que sí va en la dirección es de quién se está
   mirando la cuenta, que es un identificador de una persona, no un número de cuenta.

   CÓMO SE LLAMA EL NÚMERO LO DICE LA BASE. CBU, CVU o alias son nombres de Argentina; en otro
   país son otros. La sigla sale de `catalogo_identificadores_de_cuenta`, que es por país y no
   es de ninguna Prestadora: dos Prestadoras del mismo país ven la misma. Por eso esa consulta
   es la única que no lleva filtro de Prestadora — no tiene columna que la nombre. */

export const panelDatosBancariosRouter = Router();

const PERMISO_LECTURA = 'ver_datos_bancarios_asistente';

panelDatosBancariosRouter.get(
  '/:asistenteId',
  requiereRolPanel,
  requierePermiso(PERMISO_LECTURA),
  async (req, res) => {
    const prestadoraId = req.usuarioPanel.prestadoraId;

    // Primero de quién es. Un Asistente de otra Prestadora no existe para esta sesión, y
    // contesta lo mismo que uno que no existe.
    const { data: asistente, error: errorAsistente } = await supabase
      .from('asistentes')
      .select('id, nombre')
      .eq('id', req.params.asistenteId)
      .eq('prestadora_id', prestadoraId)
      .maybeSingle();
    if (errorAsistente) return responderError(res, errorAsistente);
    if (!asistente) return res.status(404).json({ error: 'Asistente no encontrado' });

    const { data: cuentas, error } = await supabase
      .from('datos_bancarios_asistente')
      .select('pais, identificador_clase, identificador, banco, titular, updated_at')
      .eq('prestadora_id', prestadoraId)
      .eq('asistente_id', asistente.id);
    if (error) return responderError(res, error);

    const paises = [...new Set((cuentas || []).map((cuenta) => cuenta.pais))];
    let siglas = new Map();
    if (paises.length > 0) {
      const { data: catalogo, error: errorCatalogo } = await supabase
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
