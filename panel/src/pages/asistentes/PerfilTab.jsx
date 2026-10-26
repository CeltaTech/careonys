import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { useAuth } from '../../context/AuthContext';
import { usePermisos } from '../../context/PermisosContext';
import { useModalidades } from '../../context/ModalidadesContext';
import { esAdminOSuperior } from '../../lib/roles';
import {
  MODALIDADES,
  modalidadesDelAsistente,
  modalidadesHabilitadas,
  mensajeDeModalidad,
} from '../../lib/modalidades';
import { COLUMNA_DEL_VALOR, UNIDADES_POSIBLES, unidadDeMedicionDe } from '../../lib/formaDePago';
import {
  FRECUENCIAS,
  FRECUENCIAS_POSIBLES,
  FRECUENCIA_DE_PAGO,
  FRECUENCIA_QUE_SE_PUEDE_TOCAR,
  soloLoQueCorreDeLaFrecuencia,
} from '../../lib/frecuenciaDePago';
import { nombreTipo } from '../../lib/tiposAsistente';
import { useTiposAsistente } from '../../hooks/useTiposAsistente';
import { usePrestadoraActual } from '../../hooks/usePrestadoraActual';
import { supabase } from '../../lib/supabaseClient';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';
import { Alert } from '../../components/ui/Alert';
import { EstadoLista } from '../../components/layout/EstadoLista';
import { DocumentosDelAsistente } from './DocumentosDelAsistente';
import { ElegirLugares } from '../../components/lugares/ElegirLugares';
import { CamposDeDomicilio } from '../../components/domicilio/CamposDeDomicilio';
import { partesDesdeFila, partesParaGuardar, renglonDelDomicilio } from '../../lib/partesDeDomicilio';
import { useCatalogoDeLugares } from '../../hooks/useCatalogoDeLugares';
import { llamarApiLugaresDeTrabajo } from '../../lib/apiLugaresDeTrabajo';
import { mensajeDeError } from '../../lib/errores';
import { avisosDelDocumento, nombreDelTipo, normalizarDni, normalizarNumero } from '../../lib/documentoDeIdentidad';
import { useTiposDeDocumento } from '../../hooks/useTiposDeDocumento';
import { useGeneros } from '../../hooks/useGeneros';
import { usePaises } from '../../hooks/usePaises';
import '../../styles/molde-paginas.css';
import '../hojaDeTarjetas.css';

// Lo que la base rechaza al guardar la identidad, y al pie de qué casillero va.
// `23505` es el documento repetido, que sólo la base puede saber.
const AVISO_DE_LA_BASE = {
  falta_el_documento: ['documento_tipo', 'falta_el_documento'],
  documento_no_corresponde: ['documento_tipo', 'falta_el_documento'],
  numero_no_valido: ['documento_numero', 'numero_no_valido'],
  falta_el_pais_del_documento: ['documento_pais', 'falta_el_pais'],
  falta_el_dni: ['dni', 'falta_el_dni'],
  dni_no_coincide: ['dni', 'dni_no_coincide'],
  falta_el_genero: ['genero', 'falta_el_genero'],
  genero_no_corresponde: ['genero', 'genero_no_reconocido'],
  23505: ['documento_numero', 'legajo_repetido'],
};

const ORDEN_DE_LOS_CASILLEROS = ['nombre', 'genero', 'documento_tipo', 'documento_numero', 'dni', 'documento_pais'];

export function PerfilTab({ asistente, onActualizado, documentosDelAsistente }) {
  const { t, locale } = useLocale();
  const { usuario } = useAuth();
  const esAdmin = esAdminOSuperior(usuario?.rol);
  const { puede } = usePermisos();
  const puedeEditarIdentidad = esAdmin || puede('editar_identidad_asistente');
  const { paraElegir: tiposAsistente, porId: tiposPorId } = useTiposAsistente();
  const { modalidades } = useModalidades();
  /* La lista de lugares de la Prestadora, pedida una sola vez para las tres cosas que la usan en
     el Legajo del Asistente: el lugar del domicilio, dónde acepta trabajar y el nombre del lugar con el que se
     arma el renglón del domicilio. */
  const catalogoDeLugares = useCatalogoDeLugares();
  const prestadoraId = usePrestadoraActual();
  const { porClase } = useTiposDeDocumento(prestadoraId);
  const { generos } = useGeneros(prestadoraId);
  const { paises } = usePaises();

  /* Las formas de recibir trabajo que se pueden marcar en el Legajo del Asistente. El techo lo pone la
     Prestadora con las modalidades que tenga activas. Se suma a la lista la que el Asistente
     ya tenga puesta aunque la Prestadora la haya apagado después: si no se mostrara, quedaría
     escrita en el Legajo del Asistente sin que nadie la vea, y el primer cambio de modalidad lo rechazaría la
     base sin explicación. Mismo criterio que el tipo de Asistente, más abajo. */
  const modalidadesPosibles = useMemo(() => {
    const habilitadas = modalidadesHabilitadas(modalidades);
    const puestas = modalidadesDelAsistente(asistente);
    return MODALIDADES.filter((m) => habilitadas.includes(m) || puestas.includes(m));
  }, [modalidades, asistente]);

  const [form, setForm] = useState({
    nombre: asistente.nombre || '',
    genero: asistente.genero || '',
    documento_tipo: asistente.documento_tipo || '',
    documento_numero: asistente.documento_numero || '',
    documento_pais: asistente.documento_pais || '',
    dni: asistente.dni || '',
    telefono: asistente.telefono || '',
    email: asistente.email || '',
    domicilio: partesDesdeFila(asistente),
    tipo_asistente_id: asistente.tipo_asistente_id || '',
    estado: asistente.estado,
    // Con qué se mide el trabajo de esta persona. Un Legajo del Asistente que todavía no eligió
    // ninguna se mide por hora, que es como se liquida mientras nadie decida otra cosa.
    unidad_medicion: unidadDeMedicionDe(asistente),
    valor_hora: asistente.valor_hora || '',
    valor_guardia: asistente.valor_guardia || '',
    valor_semana: asistente.valor_semana || '',
    valor_hora_extra: asistente.valor_hora_extra || '',
    horas_semanales: asistente.horas_semanales || '',
    modalidades: modalidadesDelAsistente(asistente),
    // Cada cuánto cobra esta persona. Vacío es lo normal y quiere decir «lo que diga la
    // Prestadora»: acá se guarda solamente lo que se arregló distinto con ella. Los campos
    // arrancan en el valor de fábrica para que, al encender el arreglo propio, no haya que
    // completar de cero tres cosas para cambiar una.
    frecuencia_propia: Object.keys(asistente.frecuencia_pago ?? {}).length > 0,
    frecuencia: { ...FRECUENCIA_DE_PAGO, ...(asistente.frecuencia_pago ?? {}) },
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const [guardado, setGuardado] = useState(false);
  // Hasta que se aprieta Guardar no se avisa nada; después los avisos se recalculan solos.
  const [intentado, setIntentado] = useState(false);
  // Lo que rechazó la base: [casillero, motivo]. Se olvida en cuanto se toca la identidad.
  const [avisoDeLaBase, setAvisoDeLaBase] = useState(null);

  const tiposDeDocumento = porClase.fisica;
  const tipoDeDocumento = tiposDeDocumento.find((uno) => uno.codigo === form.documento_tipo) ?? null;

  function avisosEnPantalla() {
    const avisos = {};
    if (!form.nombre.trim()) avisos.nombre = 'falta_el_dato';
    return Object.assign(
      avisos,
      avisosDelDocumento({
        tipo: tipoDeDocumento,
        numero: form.documento_numero,
        pais: form.documento_pais,
        dni: form.dni,
        genero: form.genero,
        pideGenero: true,
      }),
    );
  }

  const avisos = intentado ? avisosEnPantalla() : {};
  if (avisoDeLaBase && !avisos[avisoDeLaBase[0]]) avisos[avisoDeLaBase[0]] = avisoDeLaBase[1];
  const TEXTO_DEL_AVISO = {
    falta_el_dato: t.formularios.falta_un_dato_obligatorio,
    falta_el_pais: t.formularios.falta_un_dato_obligatorio,
    falta_el_documento: t.personas.falta_el_documento,
    numero_no_valido: t.personas.numero_no_valido,
    falta_el_dni: t.personas.falta_el_dni,
    dni_no_coincide: t.personas.dni_no_coincide,
    falta_el_genero: t.personas.falta_el_genero,
    genero_no_reconocido: t.personas.genero_no_reconocido,
    legajo_repetido: t.errores.motivos.legajo_repetido,
  };
  const avisoDe = (casillero) => (avisos[casillero] ? TEXTO_DEL_AVISO[avisos[casillero]] : undefined);

  function saltarAlPrimero(conAviso) {
    const primero = ORDEN_DE_LOS_CASILLEROS.find((casillero) => conAviso[casillero]);
    if (primero) document.getElementById(`field-${primero}`)?.focus();
  }

  function setIdentidad(campo, valor) {
    set(campo, valor);
    setAvisoDeLaBase(null);
  }

  /* Dónde acepta trabajar esta persona. No está en el Legajo del Asistente: está en una tabla que la cruza con
     cada lugar, y por eso se lee y se escribe por el backend, que deja guardados exactamente los que
     quedaron tildados. Mientras no se pudo leer, no se manda nada al guardar: escribir una lista
     que no se llegó a cargar borraría los lugares que la persona ya tenía. */
  const [lugares, setLugares] = useState([]);
  const [estadoLugares, setEstadoLugares] = useState('cargando');
  const [errorLugares, setErrorLugares] = useState(null);

  const cargarLugares = useCallback(async () => {
    setEstadoLugares('cargando');
    setErrorLugares(null);
    try {
      const datos = await llamarApiLugaresDeTrabajo(`/asistente/${asistente.id}`);
      setLugares(datos.lugares ?? []);
      setEstadoLugares('listo');
    } catch (err) {
      setErrorLugares(mensajeDeError(err, t));
      setEstadoLugares('error');
    }
  }, [asistente.id, t]);

  useEffect(() => {
    cargarLugares();
  }, [cargarLugares]);

  /* Sus Especialidades, elegidas del catálogo del tipo que tiene. La base sólo acepta las del tipo
     ya guardado en el Legajo, así que se escriben después del Legajo, y al cambiar de tipo se
     quedan afuera las del anterior. Mientras no se pudo leer, no se escribe nada. */
  const [catalogoEspecialidades, setCatalogoEspecialidades] = useState([]);
  const [especialidadesGuardadas, setEspecialidadesGuardadas] = useState([]);
  const [especialidadesElegidas, setEspecialidadesElegidas] = useState([]);
  const [estadoEspecialidades, setEstadoEspecialidades] = useState('cargando');
  const [errorEspecialidades, setErrorEspecialidades] = useState(null);

  const cargarEspecialidades = useCallback(async () => {
    setEstadoEspecialidades('cargando');
    setErrorEspecialidades(null);
    const [catalogo, propias] = await Promise.all([
      supabase.from('especialidades').select('id, nombre, tipo_asistente_id, activo').order('orden').order('nombre'),
      supabase.from('especialidades_asistente').select('especialidad_id').eq('asistente_id', asistente.id),
    ]);
    if (catalogo.error || propias.error) {
      setErrorEspecialidades(mensajeDeError(catalogo.error ?? propias.error, t));
      setEstadoEspecialidades('error');
      return;
    }
    const ids = propias.data.map((fila) => fila.especialidad_id);
    setCatalogoEspecialidades(catalogo.data);
    setEspecialidadesGuardadas(ids);
    setEspecialidadesElegidas(ids);
    setEstadoEspecialidades('listo');
  }, [asistente.id, t]);

  useEffect(() => {
    cargarEspecialidades();
  }, [cargarEspecialidades]);

  // Las del tipo elegido: las activas, más la que ya tenga aunque después se haya apagado.
  const especialidadesDelTipo = catalogoEspecialidades.filter(
    (especialidad) =>
      especialidad.tipo_asistente_id === form.tipo_asistente_id &&
      (especialidad.activo || especialidadesGuardadas.includes(especialidad.id)),
  );

  function alternarEspecialidad(id) {
    setEspecialidadesElegidas((elegidas) =>
      elegidas.includes(id) ? elegidas.filter((uno) => uno !== id) : [...elegidas, id],
    );
    setGuardado(false);
  }

  async function guardarEspecialidades() {
    const delTipo = new Set(especialidadesDelTipo.map((especialidad) => especialidad.id));
    const deseadas = especialidadesElegidas.filter((id) => delTipo.has(id));
    const sobran = especialidadesGuardadas.filter((id) => !deseadas.includes(id));
    const faltan = deseadas.filter((id) => !especialidadesGuardadas.includes(id));
    if (sobran.length > 0) {
      const { error: errorBorrar } = await supabase
        .from('especialidades_asistente')
        .delete()
        .eq('asistente_id', asistente.id)
        .in('especialidad_id', sobran);
      if (errorBorrar) return errorBorrar;
    }
    if (faltan.length > 0) {
      const { error: errorAgregar } = await supabase.from('especialidades_asistente').insert(
        faltan.map((especialidad_id) => ({
          prestadora_id: asistente.prestadora_id,
          asistente_id: asistente.id,
          especialidad_id,
        })),
      );
      if (errorAgregar) return errorAgregar;
    }
    setEspecialidadesGuardadas(deseadas);
    setEspecialidadesElegidas(deseadas);
    return null;
  }

  function set(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }));
    setGuardado(false);
  }

  function setFrecuencia(clave, valor) {
    setForm((f) => ({ ...f, frecuencia: { ...f.frecuencia, [clave]: valor } }));
    setGuardado(false);
  }

  function alternarModalidad(modalidad) {
    setForm((f) => ({
      ...f,
      modalidades: f.modalidades.includes(modalidad)
        ? f.modalidades.filter((m) => m !== modalidad)
        : [...f.modalidades, modalidad],
    }));
    setGuardado(false);
  }

  async function guardar() {
    setIntentado(true);
    setAvisoDeLaBase(null);
    const enPantalla = avisosEnPantalla();
    if (Object.keys(enPantalla).length > 0) {
      setError(null);
      saltarAlPrimero(enPantalla);
      return;
    }
    /* Sin ninguna forma de recibir trabajo, este Asistente no puede recibir una sola guardia.
       La base lo dejaría guardar así, y el problema recién aparecería el día que se le quiera
       asignar algo, lejos de la pantalla donde se produjo. */
    if (esAdmin && form.modalidades.length === 0) {
      setError(t.modalidades.falta_elegir);
      return;
    }
    setGuardando(true);
    setError(null);
    const payload = {
      nombre: form.nombre.trim(),
      genero: form.genero,
      documento_tipo: form.documento_tipo,
      documento_numero: normalizarNumero(form.documento_numero, tipoDeDocumento.verifica_modulo_11),
      documento_pais: tipoDeDocumento.lleva_pais ? form.documento_pais : null,
      dni: tipoDeDocumento.contiene_dni ? normalizarDni(form.dni) : null,
      telefono: form.telefono.trim() || null,
      email: form.email.trim() || null,
      tipo_asistente_id: form.tipo_asistente_id || null,
      estado: form.estado,
      ...(esAdmin && {
        /* Dónde vive, escrito para que lo lea una persona. Las coordenadas (`lat`/`lng`) no se
           cargan a mano acá: se sacan de esta dirección con el servicio del país de la
           Prestadora, que vive en el backend (`backend/src/geocodificacion/`) y hoy corre solo en
           las altas. Esta pantalla escribe derecho contra la base, sin pasar por el backend, así
           que un domicilio corregido desde acá deja las coordenadas como estaban — mientras
           esta pantalla no guarde a través del backend, eso no cambia.
           Viaja solo cuando la pantalla lo tenía para mostrar: la vista que lee el Coordinador
           (`asistentes_coordinador`) no trae esta columna, así que mandarlo igual borraría un
           domicilio ya cargado que esa pantalla nunca llegó a mostrar. */
        domicilio: renglonDelDomicilio(form.domicilio, catalogoDeLugares.lugares) || null,
        ...partesParaGuardar(form.domicilio),
        horas_semanales: form.horas_semanales || null,
        // La columna se llama `canales` de antes y no se renombra (regla 13). La palabra del
        // producto, acá y en toda la pantalla, es modalidad de trabajo.
        canales: form.modalidades,
      }),
    };
    const { error: errorUpdate } = await supabase.from('asistentes').update(payload).eq('id', asistente.id);
    if (errorUpdate) {
      setGuardando(false);
      const deLaBase = AVISO_DE_LA_BASE[errorUpdate.code === '23505' ? '23505' : errorUpdate.message];
      if (deLaBase) {
        setAvisoDeLaBase(deLaBase);
        saltarAlPrimero({ [deLaBase[0]]: true });
        return;
      }
      // La base tiene la última palabra sobre la modalidad: puede rechazar una que la
      // Prestadora apagó mientras esta pantalla estaba abierta. Ese rechazo se traduce a una
      // frase que dice qué pasó y dónde se arregla, nunca el texto crudo del error.
      setError(mensajeDeModalidad(errorUpdate, t.modalidades) ?? t.comun.error_generico);
      return;
    }

    // Lo que cobra el Asistente se guarda aparte, en `remuneraciones_asistente`, donde la base
    // exige el permiso `ver_pagos_asistente` para leerlo y ser administración para cambiarlo.
    // Puede no existir todavía la fila —un Asistente dado de alta sin importes—, así que se
    // usa `upsert`: la crea la primera vez y la actualiza las siguientes.
    if (esAdmin) {
      const { error: errorRemuneracion } = await supabase
        .from('remuneraciones_asistente')
        .upsert(
          {
            asistente_id: asistente.id,
            prestadora_id: asistente.prestadora_id,
            unidad_medicion: form.unidad_medicion,
            valor_hora: form.valor_hora || null,
            valor_guardia: form.valor_guardia || null,
            valor_semana: form.valor_semana || null,
            valor_hora_extra: form.valor_hora_extra || null,
            // Sin arreglo propio, vacío: hereda lo de la Prestadora y sigue heredándolo el día
            // que ella lo cambie. Con arreglo propio, sólo lo que difiere de fábrica.
            frecuencia_pago: form.frecuencia_propia ? soloLoQueCorreDeLaFrecuencia(form.frecuencia) : {},
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'asistente_id' },
        );
      if (errorRemuneracion) {
        setGuardando(false);
        setError(t.comun.error_generico);
        return;
      }
    }

    if (estadoEspecialidades === 'listo') {
      const errorEspecialidad = await guardarEspecialidades();
      if (errorEspecialidad) {
        setGuardando(false);
        setError(mensajeDeError(errorEspecialidad, t));
        return;
      }
    }

    // Los lugares van por el backend, que es el único que escribe esa tabla.
    if (estadoLugares === 'listo') {
      try {
        await llamarApiLugaresDeTrabajo(`/asistente/${asistente.id}`, {
          method: 'PUT',
          body: JSON.stringify({ lugares }),
        });
      } catch (err) {
        setGuardando(false);
        setError(mensajeDeError(err, t));
        return;
      }
    }

    setGuardando(false);
    setGuardado(true);
    onActualizado();
  }

  return (
    <div className="molde-pila">
      {error && <Alert variant="error">{error}</Alert>}
      {guardado && <Alert variant="info">{t.comun.guardar} <span aria-hidden="true">✓</span></Alert>}

      <section className="panel-tarjeta">
        <div className="panel-tarjeta-titulo">
          <h2>{t.asistentes.tabs.perfil}</h2>
        </div>
        <div className="molde-formgrid">
          <div className="hoja-dato">
            <div className="panel-mini">{t.asistentes.numero_legajo}</div>
            <b>{asistente.numero_legajo}</b>
          </div>
          <FormField
            label={t.asistentes.col_nombre}
            name="nombre"
            required
            value={form.nombre}
            onChange={(e) => set('nombre', e.target.value)}
            disabled={!puedeEditarIdentidad}
            error={avisoDe('nombre')}
          />
          <FormField
            label={t.asistentes.genero}
            name="genero"
            type="select"
            required
            value={form.genero}
            onChange={(e) => setIdentidad('genero', e.target.value)}
            disabled={!puedeEditarIdentidad}
            error={avisoDe('genero')}
          >
            <option value="">{t.personas.selector_sin_elegir}</option>
            {generos.map((uno) => (
              <option key={uno.codigo} value={uno.codigo}>{t.generos[uno.codigo] ?? uno.codigo}</option>
            ))}
          </FormField>
          <FormField
            label={t.personas.documento_tipo}
            name="documento_tipo"
            type="select"
            required
            value={form.documento_tipo}
            onChange={(e) => setIdentidad('documento_tipo', e.target.value)}
            disabled={!puedeEditarIdentidad}
            error={avisoDe('documento_tipo')}
          >
            <option value="">{t.personas.selector_sin_elegir}</option>
            {tiposDeDocumento.map((uno) => (
              <option key={uno.codigo} value={uno.codigo}>{nombreDelTipo(uno, t.personas.tipos_de_documento)}</option>
            ))}
          </FormField>
          <FormField
            label={t.personas.documento_numero}
            name="documento_numero"
            required
            value={form.documento_numero}
            onChange={(e) => setIdentidad('documento_numero', e.target.value)}
            disabled={!puedeEditarIdentidad}
            error={avisoDe('documento_numero')}
          />
          {tipoDeDocumento?.contiene_dni && (
            <FormField
              label={t.asistentes.dni}
              name="dni"
              required
              inputMode="numeric"
              value={form.dni}
              onChange={(e) => setIdentidad('dni', e.target.value)}
              disabled={!puedeEditarIdentidad}
              error={avisoDe('dni')}
            />
          )}
          {tipoDeDocumento?.lleva_pais && (
            <FormField
              label={t.personas.documento_pais}
              name="documento_pais"
              type="select"
              required
              value={form.documento_pais}
              onChange={(e) => setIdentidad('documento_pais', e.target.value)}
              disabled={!puedeEditarIdentidad}
              error={avisoDe('documento_pais')}
            >
              <option value="">{t.personas.selector_sin_elegir}</option>
              {paises.map((pais) => (
                <option key={pais.codigo} value={pais.codigo}>{pais.nombre}</option>
              ))}
            </FormField>
          )}
          <FormField label={t.asistentes.telefono} name="telefono" value={form.telefono} onChange={(e) => set('telefono', e.target.value)} disabled={!puedeEditarIdentidad} />
          <FormField label={t.asistentes.email} name="email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} disabled={!puedeEditarIdentidad} />
          {/* El domicilio solo lo ve la administración: la vista del Coordinador no trae esa
              columna, así que ahí el campo aparecería siempre vacío por más que el dato exista. */}
          {esAdmin && (
            <div className="molde-ancho">
              <CamposDeDomicilio
                valor={form.domicilio}
                alCambiar={(partes) => set('domicilio', partes)}
                catalogo={catalogoDeLugares}
                deshabilitado={!puedeEditarIdentidad}
              />
            </div>
          )}

          <FormField
            label={t.asistentes.col_tipo}
            name="tipo_asistente_id"
            type="select"
            value={form.tipo_asistente_id}
            onChange={(e) => set('tipo_asistente_id', e.target.value)}
            disabled={!puedeEditarIdentidad}
          >
            <option value="">{t.asistentes.tipo_sin_asignar}</option>
            {/* El tipo que tiene puesto puede haberse apagado después; igual se
                muestra, para que no aparezca vacío ni se pierda al guardar. */}
            {tiposAsistente.some((tipo) => tipo.id === form.tipo_asistente_id) === false && form.tipo_asistente_id && (
              <option value={form.tipo_asistente_id}>{nombreTipo(tiposPorId.get(form.tipo_asistente_id), t)}</option>
            )}
            {tiposAsistente.map((tipo) => (
              <option key={tipo.id} value={tipo.id}>{nombreTipo(tipo, t)}</option>
            ))}
          </FormField>

          {asistente.estado === 'cesado' ? (
            <FormField label={t.asistentes.col_estado} name="estado" type="select" value="cesado" disabled>
              <option value="cesado">{t.asistentes.estado_cesado}</option>
            </FormField>
          ) : (
            <FormField label={t.asistentes.col_estado} name="estado" type="select" value={form.estado} onChange={(e) => set('estado', e.target.value)} disabled={!puedeEditarIdentidad}>
              <option value="activo">{t.asistentes.estado_activo}</option>
              <option value="inactivo">{t.asistentes.estado_inactivo}</option>
            </FormField>
          )}

          <div className="hoja-dato">
            <div className="panel-mini">{t.asistentes.fecha_alta}</div>
            <b>{new Date(asistente.fecha_alta).toLocaleDateString(locale)}</b>
          </div>
        </div>
      </section>

      {(estadoEspecialidades !== 'listo' || especialidadesDelTipo.length > 0) && form.tipo_asistente_id && (
        <section className="panel-tarjeta">
          <div className="panel-tarjeta-titulo">
            <h2>{t.configuracion.especialidades_titulo}</h2>
          </div>
          <EstadoLista estado={estadoEspecialidades} error={errorEspecialidades} recargar={cargarEspecialidades}>
            <div className="molde-formgrid">
              {especialidadesDelTipo.map((especialidad) => (
                <FormField
                  key={especialidad.id}
                  label={especialidad.nombre}
                  name={`especialidad_${especialidad.id}`}
                  type="checkbox"
                  checked={especialidadesElegidas.includes(especialidad.id)}
                  onChange={() => alternarEspecialidad(especialidad.id)}
                  disabled={guardando || !puedeEditarIdentidad}
                />
              ))}
            </div>
          </EstadoLista>
        </section>
      )}

      <section className="panel-tarjeta">
        <div className="panel-tarjeta-titulo">
          <h2>{t.configuracion.lugares_elegir_titulo}</h2>
        </div>
        <EstadoLista estado={estadoLugares} error={errorLugares} recargar={cargarLugares}>
          <ElegirLugares
            catalogo={catalogoDeLugares}
            valor={lugares}
            onChange={(siguiente) => { setLugares(siguiente); setGuardado(false); }}
            deshabilitado={guardando || !puedeEditarIdentidad}
          />
        </EstadoLista>
      </section>

      {esAdmin && (
        <section className="panel-tarjeta">
          <div className="panel-tarjeta-titulo">
            <h2>{t.asistentes.tabs.perfil_vinculo}</h2>
          </div>
          <div className="molde-formgrid">
            {/* Con qué se mide el trabajo lo elige quien carga el Legajo del Asistente. Se muestra el valor de la unidad elegida y no los cuatro, porque
                cuatro casillas de importe al lado invitan a llenar la que no se usa, y un valor
                cargado que no se paga es una pregunta cada vez que alguien abre el Legajo del Asistente. */}
            <FormField label={t.asistentes.unidad_medicion} name="unidad_medicion" type="select" value={form.unidad_medicion} onChange={(e) => set('unidad_medicion', e.target.value)}>
              {UNIDADES_POSIBLES.map((unidad) => (
                <option key={unidad} value={unidad}>{t.asistentes[`unidad_${unidad}`]}</option>
              ))}
            </FormField>

            <FormField
              label={t.asistentes[COLUMNA_DEL_VALOR[form.unidad_medicion]]}
              name={COLUMNA_DEL_VALOR[form.unidad_medicion]}
              type="number"
              value={form[COLUMNA_DEL_VALOR[form.unidad_medicion]]}
              onChange={(e) => set(COLUMNA_DEL_VALOR[form.unidad_medicion], e.target.value)}
            />

            {/* Se pregunta siempre, y no sólo a quien cobra por hora: una guardia con horas de más
                se paga igual midan el trabajo como lo midan. Vacío quiere decir que no está
                cargado, y entonces la liquidación avisa en vez de estimarlo. */}
            <FormField label={t.asistentes.valor_hora_extra} name="valor_hora_extra" type="number" value={form.valor_hora_extra} onChange={(e) => set('valor_hora_extra', e.target.value)} />

            <FormField label={t.asistentes.horas_semanales} name="horas_semanales" type="number" value={form.horas_semanales} onChange={(e) => set('horas_semanales', e.target.value)} />

            {/* Cada cuánto cobra es otra cosa que con qué se le mide el trabajo, y por eso va en su
                propio bloque. Lo normal es que cobre cada cuánto cobra el resto; esto está acá
                porque con cada persona se arregla distinto, y hasta hoy no había dónde anotarlo.
                No cambia ni un centavo: sólo desde qué día hasta qué día va su período. */}
            <div className="molde-ancho">
              <FormField
                label={t.asistentes.frecuencia_pago_propia}
                name="frecuencia_propia"
                type="checkbox"
                checked={form.frecuencia_propia}
                onChange={(e) => set('frecuencia_propia', e.target.checked)}
              />
            </div>

            {form.frecuencia_propia && (
              <>
                <FormField
                  label={t.asistentes.frecuencia_pago_cada_cuanto}
                  name="frecuencia_cada_cuanto"
                  type="select"
                  value={form.frecuencia.cada_cuanto}
                  onChange={(e) => setFrecuencia('cada_cuanto', e.target.value)}
                >
                  {FRECUENCIAS_POSIBLES.map((cual) => (
                    <option key={cual} value={cual}>
                      {t.configuracion.frecuencia_pago_cada_cuanto_opciones[cual]}
                    </option>
                  ))}
                </FormField>

                {form.frecuencia.cada_cuanto === FRECUENCIAS.SEMANA && (
                  <FormField
                    label={t.asistentes.frecuencia_pago_dia_de_corte}
                    name="frecuencia_dia_de_corte"
                    type="select"
                    value={form.frecuencia.dia_de_corte}
                    onChange={(e) => setFrecuencia('dia_de_corte', Number(e.target.value))}
                  >
                    {[1, 2, 3, 4, 5, 6, 7].map((dia) => (
                      <option key={dia} value={dia}>
                        {t.configuracion.frecuencia_pago_dias[dia]}
                      </option>
                    ))}
                  </FormField>
                )}

                <FormField
                  label={t.asistentes.frecuencia_pago_dias_hasta_el_pago}
                  name="frecuencia_dias_hasta_el_pago"
                  type="number"
                  min={FRECUENCIA_QUE_SE_PUEDE_TOCAR.dias_hasta_el_pago.minimo}
                  max={FRECUENCIA_QUE_SE_PUEDE_TOCAR.dias_hasta_el_pago.maximo}
                  value={form.frecuencia.dias_hasta_el_pago}
                  onChange={(e) =>
                    setFrecuencia('dias_hasta_el_pago', e.target.value === '' ? '' : Number(e.target.value))
                  }
                />
              </>
            )}
          </div>
        </section>
      )}

      {esAdmin && (
        <section className="panel-tarjeta">
          <div className="panel-tarjeta-titulo">
            <h2>{t.modalidades.etiqueta}</h2>
          </div>
          <div className="molde-formgrid">
            {modalidadesPosibles.map((modalidad) => (
              <FormField
                key={modalidad}
                label={t.modalidades[modalidad]}
                name={`modalidad_${modalidad}`}
                type="checkbox"
                checked={form.modalidades.includes(modalidad)}
                onChange={() => alternarModalidad(modalidad)}
              />
            ))}
          </div>
        </section>
      )}

      <div className="molde-acciones">
        <Button onClick={guardar} disabled={guardando || !puedeEditarIdentidad}>{guardando ? t.comun.guardando : t.comun.guardar}</Button>
      </div>

      {esAdmin && <DocumentosDelAsistente asistenteId={asistente.id} {...documentosDelAsistente} />}
    </div>
  );
}
