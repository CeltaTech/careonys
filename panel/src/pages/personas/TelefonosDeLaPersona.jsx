import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';
import { Alert } from '../../components/ui/Alert';
import { EstadoLista } from '../../components/layout/EstadoLista';
import { mensajeDeError } from '../../lib/errores';
import { useConfirmarDestructivo } from '../../context/ConfirmacionContext';
import {
  cargarUnTelefono,
  corregirUnTelefono,
  pedirLosTelefonosDeLaPersona,
  ponerFueraDeUso,
  restaurarUnTelefono,
  borrarUnTelefono,
} from '../../lib/apiPersonasTelefonos';

/* Los teléfonos de contacto de una Ficha de Persona.
   ==========================================================================

   PARA QUÉ. Un Cliente tiene el fijo de la casa, el celular de quien contrató y el de la hija que
   atiende cuando los demás no atienden. Antes entraba uno solo, y el resto terminaba escrito
   adentro de las notas. Acá entran todos, y todos quedan habilitados.

   EL PREFERIDO NO SE ELIGE ACÁ. Es el que esa Persona usa en su cuenta, y por eso no hay ningún
   casillero para marcarlo: lo resuelve el backend al entregar la lista. Quien no tiene cuenta no
   tiene preferido, y la lista sale igual de completa.

   SE PUEDEN REPETIR. El mismo número en dos Fichas es lo normal cuando viven juntos, y no se
   rechaza ni se avisa.

   EL NÚMERO NO VIAJA EN NINGUNA DIRECCIÓN: entra y sale en el cuerpo del pedido. */

export function TelefonosDeLaPersona({ personaId, puedeEditar }) {
  const { t } = useLocale();
  const tr = t.personas.telefonos;
  const confirmarDestructivo = useConfirmarDestructivo();

  const [filas, setFilas] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  // Qué operación está corriendo: `'nuevo'`, o el identificador del teléfono que se está tocando.
  // Con eso se apaga el botón que la disparó y nada más.
  const [operando, setOperando] = useState(null);
  // Si lo que corre sobre ese teléfono es borrarlo: sólo ese botón dice «Borrando…».
  const [borrando, setBorrando] = useState(false);
  const [nuevo, setNuevo] = useState('');
  // Cuál se está corrigiendo, y con qué texto.
  const [corrigiendo, setCorrigiendo] = useState(null);
  const [textoCorregido, setTextoCorregido] = useState('');

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    try {
      const datos = await pedirLosTelefonosDeLaPersona(personaId);
      setFilas(datos?.telefonos ?? []);
      setEstado('listo');
    } catch (e) {
      setError(mensajeDeError(e, t));
      setEstado('error');
    }
  }, [personaId, t]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  async function agregar(evento) {
    evento.preventDefault();
    if (!nuevo.trim()) return;
    setOperando('nuevo');
    setError(null);
    try {
      await cargarUnTelefono(personaId, nuevo.trim());
      setNuevo('');
      await recargar();
    } catch (e) {
      setError(mensajeDeError(e, t));
    } finally {
      setOperando(null);
    }
  }

  async function guardarCorreccion(evento) {
    evento.preventDefault();
    if (!textoCorregido.trim()) return;
    setOperando(corrigiendo);
    setError(null);
    try {
      await corregirUnTelefono(personaId, corrigiendo, textoCorregido.trim());
      setCorrigiendo(null);
      setTextoCorregido('');
      await recargar();
    } catch (e) {
      setError(mensajeDeError(e, t));
    } finally {
      setOperando(null);
    }
  }

  // Lo mismo para las tres operaciones sobre un teléfono: apagar los botones, llamar y recargar.
  async function operarSobre(fila, operacion) {
    setOperando(fila.id);
    setBorrando(operacion === borrarUnTelefono);
    setError(null);
    try {
      await operacion(personaId, fila.id);
      await recargar();
    } catch (e) {
      setError(mensajeDeError(e, t));
    } finally {
      setOperando(null);
    }
  }

  // El que no atiende no se borra: queda fuera de uso. Borrar es sólo para cuando hay certeza de
  // que el número está mal, y por eso es lo único que pide confirmación.
  async function borrar(fila) {
    if (!(await confirmarDestructivo(tr.confirmar_borrar))) return;
    await operarSobre(fila, borrarUnTelefono);
  }

  return (
    <section className="panel-telefonos-de-la-persona">
      <h3>{tr.titulo}</h3>
      {/* Sólo con la carga hecha: si el estado es de error, el cartel con su botón de reintentar lo
          pone `EstadoLista`, y los dos juntos dirían lo mismo dos veces. */}
      {error && estado === 'listo' && <Alert variant="error">{error}</Alert>}

      <EstadoLista
        estado={estado}
        error={error}
        vacio={estado === 'listo' && filas.length === 0}
        recargar={recargar}
      >
        <ul className="panel-telefonos-lista">
          {filas.map((fila) => (
            <li key={fila.id}>
              {corrigiendo === fila.id ? (
                <form onSubmit={guardarCorreccion}>
                  <FormField
                    label={tr.campo_telefono}
                    name={`telefono-${fila.id}`}
                    value={textoCorregido}
                    onChange={(e) => setTextoCorregido(e.target.value)}
                    disabled={operando === fila.id}
                    required
                  />
                  <Button type="submit" disabled={operando === fila.id}>
                    {operando === fila.id ? t.comun.guardando : t.comun.guardar}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setCorrigiendo(null)}
                    disabled={operando === fila.id}
                  >
                    {t.comun.cancelar}
                  </Button>
                </form>
              ) : (
                <>
                  <span className="panel-telefono-numero">{fila.telefono}</span>
                  {fila.preferido && <span className="panel-telefono-preferido">{tr.preferido}</span>}
                  {fila.fuera_de_uso_at && (
                    <span className="panel-telefono-fuera-de-uso">{tr.marca_fuera_de_uso}</span>
                  )}
                  {puedeEditar && (
                    <>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setCorrigiendo(fila.id);
                          setTextoCorregido(fila.telefono);
                        }}
                        disabled={operando !== null}
                      >
                        {t.comun.editar}
                      </Button>
                      {fila.fuera_de_uso_at ? (
                        <Button
                          variant="secondary"
                          onClick={() => operarSobre(fila, restaurarUnTelefono)}
                          disabled={operando !== null}
                        >
                          {tr.restaurar}
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          onClick={() => operarSobre(fila, ponerFueraDeUso)}
                          disabled={operando !== null}
                        >
                          {tr.fuera_de_uso}
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        onClick={() => borrar(fila)}
                        disabled={operando !== null}
                      >
                        {operando === fila.id && borrando ? tr.borrando : tr.borrar}
                      </Button>
                    </>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      </EstadoLista>

      {/* Queda afuera de `EstadoLista` a propósito: es la salida cuando no hay ninguno cargado, así
          que tiene que verse justamente en el caso vacío. */}
      {puedeEditar && estado === 'listo' && (
        <form className="panel-telefono-nuevo" onSubmit={agregar}>
          <FormField
            label={tr.campo_telefono}
            name="telefono-nuevo"
            value={nuevo}
            onChange={(e) => setNuevo(e.target.value)}
            disabled={operando === 'nuevo'}
            required
          />
          <Button type="submit" variant="secondary" disabled={operando === 'nuevo'}>
            {operando === 'nuevo' ? tr.agregando : tr.agregar}
          </Button>
        </form>
      )}
    </section>
  );
}
