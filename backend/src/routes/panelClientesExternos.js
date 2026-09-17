import { Router } from 'express';
import { requiereRolPanel } from '../middleware/requiereRolPanel.js';
import { exigirAdministracion } from '../middleware/exigirAdministracion.js';
import { supabase } from '../db/connection.js';
import {
  LARGO_MAXIMO_DEL_CLIENTE_EXTERNO,
  TOPE_DE_FILAS,
  elApareoDeLaFila,
  esIdentificador,
  queHacerConLaFilaDeApareo,
} from '../utils/intercambioDeFacturacion.js';
import { ErrorConMotivo, responderError } from '../utils/errorConMotivo.js';

/* Con qué cliente del otro software se corresponde cada Cliente.
   ==========================================================================

   POR QUÉ EXISTE ESTE ARCHIVO. El padrón de clientes no se duplica: se parte. El producto es dueño
   de quién es el cliente —que existe, cómo se llama, dónde vive, qué servicio recibe— y el
   software de facturación es dueño de cómo ese cliente figura ante el organismo fiscal, que acá
   no se guarda, no se pide y no se manda. Lo único que une las dos mitades es una referencia:
   cómo identifica el otro software a esa misma persona. Eso es lo que se anota acá.

   PARA QUÉ SIRVE. Para dos cosas. La conexión directa necesita poder decir de qué cliente está
   hablando, y una Prestadora que ya tenía sus clientes cargados antes de empezar necesita poder
   aparearlos con sus Clientes sin rehacer nada de los dos lados.

   POR CONEXIÓN, PORQUE PUEDEN SER DOS. El software que factura y el que sigue la cobranza pueden
   ser de dos proveedores que no se conocen y cada uno numera sus clientes como quiere. Qué clases
   de conexión hay sale del catálogo de la base, nunca de una lista escrita acá.

   QUIÉN PUEDE. Es configuración de la Prestadora, así que entra por el mismo criterio que el
   resto de la configuración: rol de Panel y administración. Quien coordina turnos no aparea
   clientes de un software de facturación.

   EL APAREO NO TRAE NADA DE AFUERA. Se anota una referencia y nada más. El alta de clientes va en
   un solo sentido, hacia afuera: un cliente creado adentro del facturador no existe de este lado
   y no se trae. */

export const panelClientesExternosRouter = Router();

const soloAdministracion = exigirAdministracion('Solo Admin o Superadmin puede aparear clientes');

panelClientesExternosRouter.use(requiereRolPanel, soloAdministracion);

/** Qué clases de conexión existen. Sale de la base para que agregar una no sea un despliegue. */
async function clasesDeConexion() {
  const { data, error } = await supabase
    .from('catalogo_conexiones_externas')
    .select('conexion, orden')
    .order('orden', { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).map((c) => c.conexion);
}

/**
 * La conexión que pidió quien llama, o null si no es ninguna de las que existen.
 *
 * Falla cerrado a propósito: una conexión que no está en el catálogo no se guarda «por las
 * dudas», porque una referencia anotada bajo un nombre que nadie lee no la ve nunca nadie.
 */
async function conexionPedida(valor) {
  const pedida = String(valor ?? '').trim();
  if (pedida === '') return null;
  const clases = await clasesDeConexion();
  return clases.includes(pedida) ? pedida : null;
}

/**
 * Si lo que falló fue que esa misma referencia ya está anotada en otra Cliente.
 *
 * La base no deja que dos Clientes apunten al mismo cliente del otro lado, y hace bien: si lo
 * dejara, lo de dos Clientes se le reclamaría a una sola persona. Pero contestado como una falla
 * del sistema, la pantalla muestra «Algo falló de nuestro lado» y quien está apareando no se
 * entera de lo único que necesita saber, que es que ese número ya está usado.
 */
function esElMismoClienteEnOtraCliente(error) {
  return error?.code === '23505';
}

/** Los nombres de los Clientes de esta Prestadora, para que la lista se pueda leer. */
async function clientesDeLaPrestadora(prestadoraId) {
  const { data, error } = await supabase
    .from('clientes')
    .select('id, solicitudes!clientes_solicitud_id_fkey(nombre)')
    .eq('prestadora_id', prestadoraId);
  if (error) throw new Error(error.message);
  return data || [];
}

/** El apareo que ya tiene cada Cliente en esta conexión, por identificador de Cliente. */
async function apareosDeLaConexion(prestadoraId, conexion) {
  const { data, error } = await supabase
    .from('clientes_externos_de_clientes')
    .select('cliente_id, cliente_externo')
    .eq('prestadora_id', prestadoraId)
    .eq('conexion', conexion);
  if (error) throw new Error(error.message);
  return new Map((data || []).map((a) => [a.cliente_id, a.cliente_externo]));
}

// ---------------------------------------------------------------------------------------
// Qué clases de conexión hay
// ---------------------------------------------------------------------------------------

panelClientesExternosRouter.get('/conexiones', async (req, res) => {
  try {
    res.json(await clasesDeConexion());
  } catch (e) {
    responderError(res, e);
  }
});

// ---------------------------------------------------------------------------------------
// Todas los Clientes, apareadas y sin aparear
//
// Van todas y no sólo las apareadas, porque lo que se está mirando es justamente cuáles faltan.
// ---------------------------------------------------------------------------------------

panelClientesExternosRouter.get('/', async (req, res) => {
  const prestadoraId = req.usuarioPanel.prestadoraId;

  try {
    const conexion = await conexionPedida(req.query.conexion);
    if (!conexion) return res.status(400).json({ error: 'Falta decir de qué conexión se trata' });

    const [clientes, apareos] = await Promise.all([
      clientesDeLaPrestadora(prestadoraId),
      apareosDeLaConexion(prestadoraId, conexion),
    ]);

    res.json(
      clientes
        .map((f) => ({
          cliente_id: f.id,
          cliente: f.solicitudes?.nombre ?? '',
          cliente_externo: apareos.get(f.id) ?? '',
        }))
        .sort((a, b) => a.cliente.localeCompare(b.cliente))
    );
  } catch (e) {
    responderError(res, e);
  }
});

// ---------------------------------------------------------------------------------------
// Aparear un Cliente, o dejarla sin aparear
//
// La referencia vacía borra el apareo. Es una decisión legítima —se cambió de software, o se
// apareó al Cliente equivocada— y no mueve ningún dato de Careonys, que es lo que se gana
// partiendo el padrón en lugar de copiarlo.
// ---------------------------------------------------------------------------------------

panelClientesExternosRouter.put('/:clienteId', async (req, res) => {
  const prestadoraId = req.usuarioPanel.prestadoraId;
  const clienteId = req.params.clienteId;

  if (!esIdentificador(clienteId)) return res.status(400).json({ error: 'El Cliente no existe' });

  try {
    const conexion = await conexionPedida(req.body?.conexion);
    if (!conexion) return res.status(400).json({ error: 'Falta decir de qué conexión se trata' });

    const referencia = String(req.body?.cliente_externo ?? '').trim();
    if (referencia.length > LARGO_MAXIMO_DEL_CLIENTE_EXTERNO) {
      return res.status(400).json({ error: 'La referencia al cliente es demasiado larga' });
    }

    // De quién es el Cliente lo resuelve esta consulta y no quien llama: el motor entra a la base
    // con la llave de servicio, así que el filtro por Prestadora es lo que aísla una de otra.
    const { data: cliente, error: errorCliente } = await supabase
      .from('clientes')
      .select('id')
      .eq('id', clienteId)
      .eq('prestadora_id', prestadoraId)
      .maybeSingle();
    if (errorCliente) return responderError(res, errorCliente);
    if (!cliente) return res.status(404).json({ error: 'El Cliente no existe' });

    if (referencia === '') {
      const { error } = await supabase
        .from('clientes_externos_de_clientes')
        .delete()
        .eq('prestadora_id', prestadoraId)
        .eq('cliente_id', clienteId)
        .eq('conexion', conexion);
      if (error) return responderError(res, error);
      return res.json({ ok: true, cliente_externo: '' });
    }

    const { error } = await supabase.from('clientes_externos_de_clientes').upsert(
      {
        prestadora_id: prestadoraId,
        cliente_id: clienteId,
        conexion,
        cliente_externo: referencia,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'prestadora_id,cliente_id,conexion' }
    );
    if (error) {
      return esElMismoClienteEnOtraCliente(error)
        ? responderError(res, new ErrorConMotivo('cliente_externo_ya_apareado', error.message))
        : responderError(res, error);
    }

    res.json({ ok: true, cliente_externo: referencia });
  } catch (e) {
    responderError(res, e);
  }
});

// ---------------------------------------------------------------------------------------
// El apareo de a muchos
//
// Es lo que resuelve el arranque de una Prestadora que ya tenía sus clientes cargados: se baja
// la lista con sus Clientes, se completa al lado de cada una y se vuelve a subir. Contesta fila
// por fila qué pasó, porque quien sube un archivo necesita saber cuál renglón no entró para
// corregir ese y no volver a subir todo.
// ---------------------------------------------------------------------------------------

panelClientesExternosRouter.post('/importar', async (req, res) => {
  const prestadoraId = req.usuarioPanel.prestadoraId;
  const filas = req.body?.filas;

  if (!Array.isArray(filas) || filas.length === 0) {
    return res.status(400).json({ error: 'El archivo no trae ninguna fila' });
  }
  if (filas.length > TOPE_DE_FILAS) {
    return res.status(400).json({ error: `Se leen hasta ${TOPE_DE_FILAS} filas por vez` });
  }

  try {
    const conexion = await conexionPedida(req.body?.conexion);
    if (!conexion) return res.status(400).json({ error: 'Falta decir de qué conexión se trata' });

    const [clientes, apareos] = await Promise.all([
      clientesDeLaPrestadora(prestadoraId),
      apareosDeLaConexion(prestadoraId, conexion),
    ]);
    const deLaPrestadora = new Set(clientes.map((f) => f.id));

    const resultados = [];
    const yaVistas = new Set();

    for (const fila of filas) {
      const apareo = elApareoDeLaFila(fila);
      const decision = queHacerConLaFilaDeApareo(apareo, {
        yaVista: yaVistas.has(apareo.cliente_id),
        apareada: apareos.get(apareo.cliente_id) ?? null,
      });

      if (esIdentificador(apareo.cliente_id)) yaVistas.add(apareo.cliente_id);

      // Que el Cliente sea de esta Prestadora se comprueba acá y no en la función de decisión,
      // porque de quién es cada Cliente lo sabe la base, no el archivo.
      if (decision.resultado !== 'rechazado' && !deLaPrestadora.has(apareo.cliente_id)) {
        resultados.push({ cliente_id: apareo.cliente_id, resultado: 'rechazado', motivo: 'no_encontrada' });
        continue;
      }

      if (decision.resultado === 'apareado') {
        const { error } = await supabase.from('clientes_externos_de_clientes').upsert(
          {
            prestadora_id: prestadoraId,
            cliente_id: apareo.cliente_id,
            conexion,
            cliente_externo: apareo.cliente_externo,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'prestadora_id,cliente_id,conexion' }
        );
        // El único rechazo que se cuenta por renglón es que esa referencia ya esté anotada en
        // otra Cliente: eso se corrige en ese renglón y el resto del archivo sigue entrando.
        // Cualquier otra falla es de este lado y corta todo, porque seguir escribiendo después
        // de algo que no se entendió deja el archivo a medio aplicar.
        if (error) {
          if (!esElMismoClienteEnOtraCliente(error)) return responderError(res, error);
          resultados.push({
            cliente_id: apareo.cliente_id,
            resultado: 'rechazado',
            motivo: 'cliente_repetido',
          });
          continue;
        }
      }

      if (decision.resultado === 'borrado') {
        const { error } = await supabase
          .from('clientes_externos_de_clientes')
          .delete()
          .eq('prestadora_id', prestadoraId)
          .eq('cliente_id', apareo.cliente_id)
          .eq('conexion', conexion);
        if (error) return responderError(res, error);
      }

      resultados.push({ cliente_id: apareo.cliente_id, ...decision });
    }

    res.json({ resultados });
  } catch (e) {
    responderError(res, e);
  }
});
