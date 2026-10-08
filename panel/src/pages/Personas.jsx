import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale } from '../i18n/LocaleContext';
import { useAuth } from '../context/AuthContext';
import { usePermisos } from '../context/PermisosContext';
import { usePrestadoraActual } from '../hooks/usePrestadoraActual';
import { esAdminOSuperior } from '../lib/roles';
import { supabase } from '../lib/supabaseClient';
import { useFiltros } from '../hooks/useFiltros';
import { useCatalogoDeLugares } from '../hooks/useCatalogoDeLugares';
import { useTiposDeDocumento } from '../hooks/useTiposDeDocumento';
import { usePaises } from '../hooks/usePaises';
import { nombreDelTipo } from '../lib/documentoDeIdentidad';
import { EstadoLista } from '../components/layout/EstadoLista';
import { Button } from '../components/ui/Button';
import { Cabecera } from '../components/ui/Cabecera';
import { PersonaModal } from './personas/PersonaModal';
import { mensajeDeError } from '../lib/errores';
import { palabrasDelDomicilio, partesDesdeFila, renglonDelDomicilio } from '../lib/partesDeDomicilio';
import { pedirLosTelefonosDelDirectorio } from '../lib/apiPersonasTelefonos';
import '../styles/molde-paginas.css';
import './hojaDeTarjetas.css';

/* El Directorio de Personas de la Prestadora.
   ==========================================================================

   La lista de todas las Personas de los Clientes de la Prestadora: quien contrata, quien paga,
   quien recibe el cuidado, quien acompaña. Una Persona, una Ficha, aunque con el tiempo le toquen
   varios roles. Los Asistentes no están acá: son del Padrón, cada uno con su Legajo.

   LA FICHA NO GUARDA NINGÚN ROL. Guarda quién es esa Persona y nada más. Qué rol le toca se
   resuelve donde ocurre —la contratación, el Servicio, el Cliente— y desde ahí se señala cuál
   Ficha es. Así, la misma Persona que hoy contrata para un Cliente y mañana necesita cuidados
   sigue siendo una sola Ficha, con todo su historial junto.

   NADIE BORRA UNA FICHA, y por eso esta pantalla no ofrece hacerlo. Lo que se pierde el día que
   alguien borra «porque ya no está activa» es justamente el historial de cómo se comportó esa
   Persona en cada rol.

   LA LISTA ES DE LA PRESTADORA. Quién ve cada fila lo decide la base con la política, no esta
   pantalla: acá el candado sirve para no mostrar un renglón de menú que después va a fallar. */
export function Personas() {
  const { t } = useLocale();
  const { usuario } = useAuth();
  const prestadoraId = usePrestadoraActual();
  const esAdmin = esAdminOSuperior(usuario?.rol);
  const { puede } = usePermisos();
  const puedeEditar = esAdmin || puede('editar_personas');

  const [filas, setFilas] = useState([]);
  // Los teléfonos vienen del backend, en un solo pedido para todo el Directorio: pedirlos Ficha por Ficha
  // sería un pedido por renglón. Vienen con el preferido ya resuelto.
  const [telefonos, setTelefonos] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const { f, set, limpiar, hayFiltros } = useFiltros({ busqueda: '', clase: '' });
  // `null` es «cerrado»; `'nuevo'` es un alta; una fila es la corrección de esa Ficha.
  const [enEdicion, setEnEdicion] = useState(null);

  const catalogo = useCatalogoDeLugares();
  const documentos = useTiposDeDocumento(prestadoraId);
  const { nombreDe: nombreDelPais } = usePaises();

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    const { data, error: errorConsulta } = await supabase
      .from('personas')
      .select('*')
      .order('apellido', { ascending: true })
      .order('nombre', { ascending: true });

    if (errorConsulta) {
      setError(mensajeDeError(errorConsulta, t));
      setEstado('error');
      return;
    }

    setFilas(data ?? []);

    try {
      const respuesta = await pedirLosTelefonosDelDirectorio();
      setTelefonos(respuesta?.telefonos ?? []);
    } catch (errorTelefonos) {
      setError(mensajeDeError(errorTelefonos, t));
      setEstado('error');
      return;
    }

    setEstado('listo');
  }, [t]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  // Cómo se lee el documento en el renglón: el tipo, el número y, si lo emitió otro país, cuál.
  const documentoDe = useMemo(() => {
    const todos = [...(documentos.porClase.fisica ?? []), ...(documentos.porClase.juridica ?? [])];
    const porCodigo = new Map(todos.map((uno) => [uno.codigo, uno]));
    return (fila) => {
      const tipo = nombreDelTipo(porCodigo.get(fila.documento_tipo), t.personas.tipos_de_documento);
      const pais = fila.documento_pais ? ` (${nombreDelPais(fila.documento_pais)})` : '';
      return `${tipo} ${fila.documento_numero ?? ''}${pais}`.trim();
    };
  }, [documentos.porClase, nombreDelPais, t]);

  // Cómo se nombra cada renglón. La persona física por apellido y nombre; la jurídica por su razón
  // social entera, que no se parte en dos. Está acá, en un solo lugar, porque lo usan el título de
  // la tabla, la búsqueda y el renglón del Apoderado.
  const comoSeLlama = useCallback(
    (fila) => (fila?.clase === 'juridica' ? fila.nombre : `${fila?.apellido ?? ''}, ${fila?.nombre ?? ''}`),
    [],
  );

  // Los teléfonos de cada Ficha, con el preferido adelante: si hay que llamar, ése es el que
  // atiende. Los demás siguen ahí y siguen sirviendo.
  const telefonosPorPersona = useMemo(() => {
    const porPersona = new Map();
    for (const uno of telefonos) {
      const suyos = porPersona.get(uno.persona_id) ?? [];
      suyos.push(uno);
      porPersona.set(uno.persona_id, suyos);
    }
    for (const suyos of porPersona.values()) {
      suyos.sort((a, b) => Number(Boolean(b.preferido)) - Number(Boolean(a.preferido)));
    }
    return porPersona;
  }, [telefonos]);

  // El Apoderado es otra Ficha de este mismo Directorio, así que su nombre ya está cargado y no hace
  // falta volver a pedirlo.
  const nombrePorId = useMemo(
    () => new Map(filas.map((fila) => [fila.id, comoSeLlama(fila)])),
    [filas, comoSeLlama],
  );

  // La búsqueda primero, la clase después, y por separado: así se puede decir cuántas hay de cada
  // clase entre lo que se está mirando. Contar sobre el total diría siempre lo mismo, y contar
  // después del filtro de clase diría cero en las otras dos posiciones.
  const buscadas = useMemo(() => {
    const buscado = f.busqueda.trim().toLowerCase();
    if (!buscado) return filas;
    return filas.filter((fila) => (
      `${fila.apellido ?? ''} ${fila.nombre ?? ''}`.toLowerCase().includes(buscado)
      || (fila.documento_numero ?? '').toLowerCase().includes(buscado)
    ));
  }, [filas, f.busqueda]);

  const cuantas = useMemo(() => ({
    todas: buscadas.length,
    fisica: buscadas.filter((fila) => fila.clase === 'fisica').length,
    juridica: buscadas.filter((fila) => fila.clase === 'juridica').length,
  }), [buscadas]);

  const filtradas = useMemo(
    () => (f.clase ? buscadas.filter((fila) => fila.clase === f.clase) : buscadas),
    [buscadas, f.clase],
  );

  return (
    <div>
      <Cabecera titulo={t.personas.titulo}>
        {puedeEditar && <Button onClick={() => setEnEdicion('nuevo')}>{t.personas.nuevo_titulo}</Button>}
      </Cabecera>
      <section className="panel-tarjeta hoja-desplazable">
        <div className="panel-tarjeta-titulo">
          <h2>{t.personas.titulo}</h2>
          {estado === 'listo' && <span className="panel-mini">{filtradas.length}</span>}
        </div>
        <div className="panel-filtros">
          <input
            type="text"
            placeholder={t.personas.buscar}
            aria-label={t.personas.buscar}
            value={f.busqueda}
            onChange={(e) => set('busqueda', e.target.value)}
          />
          <select value={f.clase} onChange={(e) => set('clase', e.target.value)} aria-label={t.personas.clase}>
            {/* Cada posición dice cuántas hay: así se sabe si vale la pena cambiar de filtro antes
                de cambiarlo, y que no hay ninguna empresa cargada deja de ser algo que se descubre
                recién al elegir esa posición y ver la lista vacía. */}
            <option value="">{t.personas.filtro_clase_todas} ({cuantas.todas})</option>
            <option value="fisica">{t.personas.clase_fisica} ({cuantas.fisica})</option>
            <option value="juridica">{t.personas.clase_juridica} ({cuantas.juridica})</option>
          </select>
        </div>

        {enEdicion && (
          <PersonaModal
            persona={enEdicion === 'nuevo' ? null : enEdicion}
            prestadoraId={prestadoraId}
            tiposDeDocumento={documentos.porClase}
            onClose={() => setEnEdicion(null)}
            onGuardado={() => {
              setEnEdicion(null);
              recargar();
            }}
          />
        )}

        <EstadoLista
          estado={estado}
          error={error}
          vacio={estado === 'listo' && filtradas.length === 0}
          recargar={recargar}
          filtrado={hayFiltros}
          onLimpiarFiltros={limpiar}
        >
          <table className="panel-tabla">
            <thead>
              <tr>
                <th>{t.personas.nombre}</th>
                <th>{t.personas.apoderado}</th>
                <th>{t.personas.telefono}</th>
                <th>{t.personas.email}</th>
                <th>{t.personas.domicilio}</th>
                {puedeEditar && <th />}
              </tr>
            </thead>
            <tbody>
              {filtradas.map((fila) => (
                /* El renglón muestra lo que le corresponde a su clase. Las dos comparten la lista,
                   porque contratan y pagan igual, pero no son la misma cosa: una entidad tiene razón
                   social, clave fiscal y alguien que firma por ella; una persona tiene apellido,
                   nombre y documento, y se representa sola. */
                <tr key={fila.id}>
                  <td>
                    <b>{comoSeLlama(fila)}</b>
                    <div className="panel-mini">
                      {documentoDe(fila)}
                    </div>
                  </td>
                  <td>
                    {fila.clase === 'juridica'
                      && (nombrePorId.get(fila.apoderado_persona_id) || t.personas.apoderado_sin_elegir)}
                  </td>
                  <td>
                    {(telefonosPorPersona.get(fila.id) ?? []).length === 0
                      ? '—'
                      : (telefonosPorPersona.get(fila.id) ?? []).map((uno, indice) => (
                        <span key={uno.id}>
                          {indice > 0 && ' · '}
                          {uno.telefono}
                          {uno.preferido && ` (${t.personas.telefonos.preferido})`}
                        </span>
                      ))}
                  </td>
                  <td>{fila.email || '—'}</td>
                  <td>
                    {renglonDelDomicilio(partesDesdeFila(fila), catalogo.lugares, palabrasDelDomicilio(t)) || '—'}
                  </td>
                  {puedeEditar && (
                    <td>
                      <button type="button" className="panel-enlace" onClick={() => setEnEdicion(fila)}>
                        {t.comun.editar}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </EstadoLista>
      </section>
    </div>
  );
}
