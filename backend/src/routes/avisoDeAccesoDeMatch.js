// La puerta por la que el software de créditos y cobranzas avisa cómo está cada acceso de Match.
//
// POR QUÉ EXISTE. En Match el Cliente paga por adelantado cada acceso, y el cobro lo hace el
// software de cobranzas de la Prestadora. Ese software es el que sabe si el pago entró. Por acá
// se lo cuenta a Careonys, y Careonys abre o cierra el contacto por esa orden y por ninguna otra:
// no le pregunta al software cómo va el pago ni toma por bueno lo que diga el navegador.
//
// QUÉ TRAE CADA AVISO. Nombra un acceso, no un Cliente, y dice una de cuatro cosas:
//
//   - `pagado`: pagó el período. El acceso queda vigente, y si es un paquete suma sus contactos.
//   - `gracia`: el cobro fue rechazado y el software reintenta. Trae `suspende_el`, el día fijo en
//     que el acceso queda suspendido si el pago no entra. Hasta ese día el acceso sigue abriendo.
//   - `suspendido`: no abre nada hasta que entre el pago. Al entrar, se levanta solo.
//   - `baja`: el Cliente dio de baja la renovación. Trae `vigente_hasta`, el último día pagado.
//
// Siempre trae además el período, el importe con su moneda y el número propio del aviso. El
// mismo número mandado dos veces se anota una sola vez.
//
// TODO SE ANOTA JUNTO O NADA. El cobro, el cambio de estado, los contactos del paquete y la
// constancia en el registro de actividad los hace una sola función de la base, en una sola
// operación. Si algo falla, no queda nada a medias, y el software reintenta el aviso entero.
//
// CÓMO SE SABE QUE LO QUE LLEGA ES DE VERDAD. Igual que el aviso de cobranza por Cliente
// (`avisoDeCobranzaExterna.js`), con el mismo secreto, porque es el mismo software:
//
//   1. **La Prestadora viaja en la dirección, no en el cuerpo.**
//   2. **El cuerpo se recibe crudo**, porque la firma se calcula sobre los bytes exactos que
//      llegaron. Por eso este router trae su propio lector y en `server.js` se monta antes del
//      `express.json()` general.
//   3. **Ante cualquier duda se corta con 401, antes de tocar una sola fila.**
//   4. **El acceso tiene que ser de esa Prestadora.** Si no lo es, se contesta lo mismo que si no
//      existiera.
import express, { Router } from 'express';
import { conexionDeLaDireccion, enLaPrestadoraDeLaDireccion } from '../middleware/enLaPrestadoraDeLaDireccion.js';
import { comprobarFirmaSinEsquemaPublicado } from '../pasarelas/firmaWebhook.js';
import { USO, secretoParaComprobar } from '../utils/secretosDeTerceros.js';

export const accesoDeMatchRouter = Router();

const FORMA_DE_IDENTIFICADOR = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FORMA_DE_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const FORMA_DE_MONEDA = /^[A-Z]{3}$/;

/** Lo más largo que pueden medir el número del aviso y el medio de pago. No hay por qué guardar
 *  un texto sin fin. */
const LARGO_MAXIMO_DEL_TEXTO = 200;

/** Las cuatro cosas que puede decir un aviso. Son las palabras del contrato con el software de
 *  cobranzas, no los estados guardados del acceso: la traducción de unas a otros es de la base. */
export const ESTADO_DEL_AVISO = ['pagado', 'gracia', 'suspendido', 'baja'];

accesoDeMatchRouter.use(express.raw({ type: 'application/json', limit: '256kb' }));

/** Una fecha `AAAA-MM-DD` que además existe en el calendario. */
function esFecha(valor) {
  if (typeof valor !== 'string' || !FORMA_DE_FECHA.test(valor)) return false;
  const fecha = new Date(`${valor}T00:00:00Z`);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor;
}

function textoCorto(valor) {
  if (valor === undefined || valor === null) return '';
  return String(valor).trim();
}

/**
 * Qué dato del aviso está mal, o `null` si está entero. Se devuelve el nombre del dato y no una
 * frase: del otro lado hay un software, que tiene que poder corregir lo que mandó.
 */
export function loQueEstaMalEnElAvisoDeAcceso(cuerpo) {
  if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) return 'cuerpo';
  if (!FORMA_DE_IDENTIFICADOR.test(String(cuerpo.acceso_id ?? ''))) return 'acceso_id';
  if (!ESTADO_DEL_AVISO.includes(cuerpo.estado)) return 'estado';
  if (!esFecha(cuerpo.periodo)) return 'periodo';
  if (typeof cuerpo.monto !== 'number' || !Number.isFinite(cuerpo.monto) || cuerpo.monto < 0) return 'monto';
  if (typeof cuerpo.moneda !== 'string' || !FORMA_DE_MONEDA.test(cuerpo.moneda)) return 'moneda';
  const numero = textoCorto(cuerpo.numero_del_aviso);
  if (!numero || numero.length > LARGO_MAXIMO_DEL_TEXTO) return 'numero_del_aviso';
  if (textoCorto(cuerpo.medio).length > LARGO_MAXIMO_DEL_TEXTO) return 'medio';
  if (cuerpo.fecha_cobro !== undefined && cuerpo.fecha_cobro !== null && !esFecha(cuerpo.fecha_cobro)) {
    return 'fecha_cobro';
  }
  if (cuerpo.estado === 'gracia' && !esFecha(cuerpo.suspende_el)) return 'suspende_el';
  if (cuerpo.estado === 'suspendido' && cuerpo.suspende_el !== undefined && cuerpo.suspende_el !== null
    && !esFecha(cuerpo.suspende_el)) {
    return 'suspende_el';
  }
  if (cuerpo.estado === 'baja' && !esFecha(cuerpo.vigente_hasta)) return 'vigente_hasta';
  return null;
}

accesoDeMatchRouter.post('/:prestadoraId', enLaPrestadoraDeLaDireccion('Aviso de acceso de Match'), async (req, res) => {
  const { prestadoraId } = req.params;
  const db = conexionDeLaDireccion(req);

  function rechazar(motivo) {
    // El motivo queda del lado del servidor. Al que llama se le contesta siempre lo mismo.
    console.warn('Aviso de acceso de Match rechazado:', prestadoraId, motivo);
    return res.status(401).json({ error: 'Aviso no autenticado' });
  }

  if (!FORMA_DE_IDENTIFICADOR.test(prestadoraId)) return rechazar('prestadora_de_la_direccion_ilegible');

  // Sin cuerpo crudo no hay con qué comprobar la firma: o el router quedó montado después del
  // lector de JSON general, o lo que llegó no es JSON. En los dos casos no se sigue.
  const cuerpoCrudo = Buffer.isBuffer(req.body) ? req.body : null;
  if (!cuerpoCrudo) return rechazar('cuerpo_crudo_ausente');

  // El mismo secreto que el aviso de cobranza por Cliente: es el mismo software de la Prestadora.
  const { texto: secreto, motivo: motivoDelSecreto } = await secretoParaComprobar(db, prestadoraId, USO.AVISO_DE_COBRANZA);
  if (!secreto) return rechazar(motivoDelSecreto);

  const comprobacion = comprobarFirmaSinEsquemaPublicado({
    secretoFirma: secreto,
    secretoDeAmbiente: null,
    headers: req.headers,
    cuerpoCrudo,
  });
  if (!comprobacion.valido) return rechazar(comprobacion.motivo);

  let cuerpo;
  try {
    cuerpo = JSON.parse(cuerpoCrudo.toString('utf8'));
  } catch {
    console.warn('Aviso de acceso de Match rechazado:', prestadoraId, 'cuerpo_ilegible');
    return res.status(400).json({ error: 'Cuerpo ilegible' });
  }

  // De acá para abajo lo que llegó ya está probado auténtico: lo que falle se contesta con el
  // nombre del dato.
  const malo = loQueEstaMalEnElAvisoDeAcceso(cuerpo);
  if (malo) return res.status(400).json({ error: 'Aviso incompleto', dato: malo });

  const { data, error } = await db.rpc('anotar_aviso_de_acceso_de_match', {
    p_acceso_id: cuerpo.acceso_id,
    p_estado: cuerpo.estado,
    p_periodo: cuerpo.periodo,
    p_monto: cuerpo.monto,
    p_moneda: cuerpo.moneda,
    p_numero_del_aviso: textoCorto(cuerpo.numero_del_aviso),
    p_fecha_cobro: cuerpo.fecha_cobro ?? null,
    p_suspende_el: cuerpo.suspende_el ?? null,
    p_vigente_hasta: cuerpo.vigente_hasta ?? null,
    p_medio: textoCorto(cuerpo.medio) || null,
  });

  if (error) {
    console.error('No se pudo anotar el aviso de acceso de Match:', prestadoraId, error.message);
    return res.status(500).json({ error: 'No se pudo anotar el aviso' });
  }

  // Falla cerrado: una respuesta que no se entiende no se da por anotada.
  if (!data || typeof data !== 'object') {
    console.error('No se pudo anotar el aviso de acceso de Match:', prestadoraId, 'respuesta vacía');
    return res.status(500).json({ error: 'No se pudo anotar el aviso' });
  }

  if (!data.ok) {
    if (data.motivo === 'acceso_inexistente') return res.status(404).json({ error: 'Acceso inexistente' });
    if (data.motivo === 'no_se_renueva') return res.status(409).json({ error: 'El acceso no se renueva solo' });
    if (data.motivo === 'aviso_incompleto') {
      return res.status(400).json({ error: 'Aviso incompleto', dato: String(data.dato ?? '') });
    }
    console.error('No se pudo anotar el aviso de acceso de Match:', prestadoraId, data.motivo);
    return res.status(500).json({ error: 'No se pudo anotar el aviso' });
  }

  if (data.repetido) return res.status(200).json({ ok: true, repetido: true });
  return res.status(200).json({ ok: true });
});
