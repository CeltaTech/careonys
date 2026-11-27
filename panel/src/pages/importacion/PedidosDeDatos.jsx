import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { llamadorDe } from '../../lib/apiPanel';
import { mensajeDeError } from '../../lib/errores';
import { con } from '../../lib/textos';
import { mensajeDeModalidad } from '../../lib/modalidades';
import { DIAS_SEMANA } from '../../lib/cronogramaDeGuardias';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';
import { CasillerosDeHorario } from '../../components/turnos_guardia/CasillerosDeHorario';
import { PEDIDOS_CON_RESPUESTA_PROPIA } from '../../lib/importacion';
import { RespuestaDePedido } from './RespuestasDePedido';

const llamarApi = llamadorDe('/importacion');

// Los datos que se contestan eligiendo una de las sugerencias que armó la importación.
const DATOS_CON_SUGERENCIAS = new Set(['localidad', 'coordinador', 'asistente', 'tipo_servicio']);

/* Los pedidos de dato de la importación.
   ==========================================================================

   Una importación no deja nada afuera: cuando un dato falta o es dudoso y la IA no lo encuentra
   con certeza en la misma planilla, la persona o el Servicio entran igual y queda abierto un
   pedido de ese dato. Acá se contestan, uno por uno, y cada respuesta completa en el backend lo
   que quedó esperando.

   Se muestran todos los abiertos, también los de lotes anteriores; primero los del lote que se
   acaba de importar (`importacionId`). Con `soloSiHay`, sin pedidos abiertos no se muestra nada:
   es el caso de la pantalla de elegir el archivo, donde un cartel vacío no le dice nada a nadie. */
export function PedidosDeDatos({ importacionId = null, soloSiHay = false }) {
  const { t } = useLocale();
  const textos = t.importacion.pedidos;
  const [estado, setEstado] = useState('cargando');
  const [pedidos, setPedidos] = useState([]);
  const [error, setError] = useState(null);
  const [guardado, setGuardado] = useState(false);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const resultado = await llamarApi('/pedidos');
      const abiertos = (resultado.pedidos ?? []).filter((pedido) => pedido.estado === 'abierto');
      const delLote = (pedido) => (importacionId && pedido.importacionId === importacionId ? 0 : 1);
      abiertos.sort((a, b) => delLote(a) - delLote(b) || a.fila - b.fila);
      setPedidos(abiertos);
      setEstado('listo');
    } catch (err) {
      setError(mensajeDeError(err, t, 'pedidos de dato'));
      setEstado('error');
    }
  }, [importacionId, t]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  function alResponder() {
    setGuardado(true);
    cargar();
  }

  if (soloSiHay && estado !== 'error' && pedidos.length === 0) return null;

  return (
    <section className="panel-tarjeta">
      <div className="panel-tarjeta-titulo">
        <h2>{textos.titulo}</h2>
        {estado === 'listo' && pedidos.length > 0 && <span className="panel-mini">{pedidos.length}</span>}
      </div>

      {estado === 'cargando' && <p>{textos.cargando}</p>}
      {estado === 'error' && <Alert variant="error">{error}</Alert>}
      {estado === 'listo' && pedidos.length === 0 && (
        <Alert variant={guardado ? 'success' : 'info'}>{textos.vacio}</Alert>
      )}
      {estado === 'listo' && pedidos.length > 0 && (
        <div className="molde-pila">
          {pedidos.map((pedido) => (
            PEDIDOS_CON_RESPUESTA_PROPIA.has(pedido.dato) ? (
              <div key={pedido.id}>
                <EncabezadoDelPedido pedido={pedido} />
                <RespuestaDePedido pedido={pedido} alResponder={alResponder} />
              </div>
            ) : (
              <RenglonDePedido key={pedido.id} pedido={pedido} alResponder={alResponder} />
            )
          ))}
        </div>
      )}
    </section>
  );
}

// Quién es, qué valor traía el archivo y por qué quedó abierto el pedido.
function EncabezadoDelPedido({ pedido }) {
  const { t, locale } = useLocale();
  const textos = t.importacion.pedidos;

  // El motivo es un código del catálogo de errores y se traduce por el mismo camino que
  // cualquier otro error del Panel: la modalidad trae pegada cuál es, y el resto sale de los
  // motivos o, si no hay frase propia, de la situación —falla_del_sistema—.
  const codigo = String(pedido.motivo ?? '');
  // Lo encontrado en un documento trae como motivo qué se encontró —una indicación de
  // medicación, unos valores normales—, que tiene su propia frase.
  const delHallazgo = pedido.dato === 'hallazgo' && Object.hasOwn(textos.hallazgos ?? {}, codigo)
    ? textos.hallazgos[codigo]
    : '';
  const frase = delHallazgo || (codigo
    ? mensajeDeModalidad(codigo, t.modalidades) ?? mensajeDeError({ motivo: codigo.split(':')[0] }, t, 'pedido de dato')
    : '');
  const motivo = frase
    ? con(frase, {
      opciones: new Intl.ListFormat(locale, { type: 'disjunction' }).format(
        (pedido.sugerencias ?? []).map((sugerencia) => sugerencia.etiqueta),
      ),
    })
    : '';
  const propia = PEDIDOS_CON_RESPUESTA_PROPIA.has(pedido.dato);

  return (
    <>
      <h3>{pedido.quien}</h3>
      {propia && <p className="panel-mini">{textos.datos[pedido.dato]}</p>}
      {pedido.valorOriginal && <p className="panel-mini">{con(textos.valor_original, { valor: pedido.valorOriginal })}</p>}
      {motivo && <p className="panel-mini">{motivo}</p>}
    </>
  );
}

function RenglonDePedido({ pedido, alResponder }) {
  const { t } = useLocale();
  const textos = t.importacion.pedidos;
  const nombre = `pedido-${pedido.id}`;
  const conSugerencias = DATOS_CON_SUGERENCIAS.has(pedido.dato);
  const esHorario = pedido.dato === 'horario';

  const [valor, setValor] = useState('');
  const [dias, setDias] = useState([]);
  const [horaInicio, setHoraInicio] = useState('');
  const [horaFin, setHoraFin] = useState('');
  const [diasHastaElFin, setDiasHastaElFin] = useState('0');
  const [intentado, setIntentado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  function alternarDia(dia) {
    setDias((marcados) => (marcados.includes(dia) ? marcados.filter((uno) => uno !== dia) : [...marcados, dia]));
  }

  function faltantes() {
    if (!esHorario) return valor.trim() ? {} : { valor: true };
    const avisos = {};
    if (dias.length === 0) avisos.dias_semana = true;
    if (!horaInicio) avisos.hora_inicio = true;
    if (!horaFin) avisos.hora_fin = true;
    if (!/^\d+$/.test(diasHastaElFin.trim())) avisos.dias_hasta_el_fin = true;
    return avisos;
  }

  const avisos = intentado ? faltantes() : {};
  const falta = t.formularios.falta_un_dato_obligatorio;
  const erroresDelHorario = Object.fromEntries(Object.keys(avisos).map((casillero) => [casillero, falta]));

  async function guardar(e) {
    e.preventDefault();
    setIntentado(true);
    const enPantalla = faltantes();
    if (Object.keys(enPantalla).length > 0) {
      setError(null);
      const primero = esHorario ? Object.keys(enPantalla)[0] : 'valor';
      document.getElementById(`field-${nombre}-${primero}`)?.focus();
      return;
    }
    setError(null);
    setGuardando(true);
    try {
      const respuesta = esHorario
        ? {
          dias: DIAS_SEMANA.filter((dia) => dias.includes(dia)),
          horaInicio,
          horaFin,
          diasHastaElFin: Number(diasHastaElFin),
        }
        : valor.trim();
      await llamarApi(`/pedidos/${pedido.id}/responder`, {
        method: 'POST',
        body: JSON.stringify({ valor: respuesta }),
      });
      alResponder();
    } catch (err) {
      setError(mensajeDeError(err, t, 'pedido de dato'));
    } finally {
      setGuardando(false);
    }
  }

  // Un dato suelto del renglón se nombra igual que en la tabla de correspondencias.
  const delCampo = pedido.dato === 'dato' && pedido.campo && `campo_${pedido.campo}` in t.importacion
    ? t.importacion[`campo_${pedido.campo}`]
    : null;
  const etiqueta = delCampo ?? (pedido.dato in t.importacion.pedidos.datos
    ? t.importacion.pedidos.datos[pedido.dato]
    : t.importacion.pedidos.datos.dato);

  return (
    <form onSubmit={guardar} noValidate>
      <EncabezadoDelPedido pedido={pedido} />
      {error && <Alert variant="error">{error}</Alert>}

      {conSugerencias && (
        <FormField
          label={etiqueta}
          name={`${nombre}-valor`}
          type="select"
          required
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          disabled={guardando || !pedido.sugerencias?.length}
          error={avisos.valor ? falta : undefined}
        >
          <option value="">{pedido.sugerencias?.length ? textos.sin_elegir : textos.sin_opciones}</option>
          {(pedido.sugerencias ?? []).map((sugerencia) => (
            <option key={sugerencia.valor} value={sugerencia.valor}>
              {sugerencia.detalle ? `${sugerencia.etiqueta} · ${sugerencia.detalle}` : sugerencia.etiqueta}
            </option>
          ))}
        </FormField>
      )}

      {esHorario && (
        <CasillerosDeHorario
          prefijo={`${nombre}-`}
          diasSemana={dias}
          onAlternarDia={alternarDia}
          horaInicio={horaInicio}
          onHoraInicio={setHoraInicio}
          horaFin={horaFin}
          onHoraFin={setHoraFin}
          diasHastaElFin={diasHastaElFin}
          onDiasHastaElFin={setDiasHastaElFin}
          errores={erroresDelHorario}
          disabled={guardando}
        />
      )}

      {!conSugerencias && !esHorario && (
        <FormField
          label={etiqueta}
          name={`${nombre}-valor`}
          required
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          disabled={guardando}
          error={avisos.valor ? falta : undefined}
        />
      )}

      <div className="molde-acciones">
        <Button type="submit" disabled={guardando || (conSugerencias && !pedido.sugerencias?.length)}>
          {guardando ? textos.guardando : textos.guardar}
        </Button>
      </div>
    </form>
  );
}
