import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale } from '../i18n/LocaleContext';
import { useConfirmarDestructivo } from '../context/TenantSessionContext';
import { useFiltros } from '../hooks/useFiltros';
import { EstadoLista } from '../components/layout/EstadoLista';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { FormField } from '../components/ui/FormField';
import { llamadorDe } from '../lib/apiPanel';
import { mensajeDeError } from '../lib/errores';

/* El banco de respuestas preparadas de WhatsApp.
   ======================================================================================

   La respuesta automática manda únicamente lo que está en esta lista y aprobado. Acá se agrega,
   se corrige, se aprueba y se saca la aprobación. Una lista vacía es lo correcto: el banco nace
   vacío y no hay ninguna respuesta escrita en el producto.

   Lo que esta pantalla NO decide: que una respuesta marcada `toca_salud` no se pueda aprobar lo
   hacen cumplir el motor y la base. Acá no se le ofrece el botón, que es otra cosa. */

const llamar = llamadorDe('/respuestas-preparadas');

const FORMULARIO_VACIO = {
  nombre_interno: '',
  terminos: '',
  toca_salud: false,
  'es-AR': '',
  en: '',
  'pt-BR': '',
};

function formularioDe(respuesta) {
  return {
    nombre_interno: respuesta.nombre_interno ?? '',
    terminos: (respuesta.terminos ?? []).join(', '),
    toca_salud: respuesta.toca_salud === true,
    'es-AR': respuesta.i18n?.['es-AR'] ?? '',
    en: respuesta.i18n?.en ?? '',
    'pt-BR': respuesta.i18n?.['pt-BR'] ?? '',
  };
}

function cuerpoDe(formulario) {
  return {
    nombre_interno: formulario.nombre_interno,
    terminos: formulario.terminos.split(',').map((termino) => termino.trim()).filter(Boolean),
    toca_salud: formulario.toca_salud,
    i18n: {
      'es-AR': formulario['es-AR'],
      en: formulario.en,
      'pt-BR': formulario['pt-BR'],
    },
  };
}

export function RespuestasPreparadas() {
  const { t } = useLocale();
  const tr = t.respuestas_preparadas;
  const confirmarDestructivo = useConfirmarDestructivo();

  const [respuestas, setRespuestas] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  // Cuál fila está en curso: mientras tenga valor, ningún botón de esa fila se puede volver a
  // apretar. Es lo que evita dos aprobaciones o dos bajas del mismo renglón.
  const [enCurso, setEnCurso] = useState(null);
  const [editando, setEditando] = useState(null);
  const [formulario, setFormulario] = useState(FORMULARIO_VACIO);

  const { f, set, limpiar, hayFiltros } = useFiltros({ estado: 'todas' });

  const cargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    try {
      const { respuestas: filas } = await llamar('/');
      setRespuestas(filas ?? []);
      setEstado('listo');
    } catch (err) {
      setError(mensajeDeError(err, t));
      setEstado('error');
    }
  }, [t]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const visibles = useMemo(
    () =>
      respuestas.filter((respuesta) => {
        if (f.estado === 'aprobadas') return Boolean(respuesta.aprobada_at);
        if (f.estado === 'sin_aprobar') return !respuesta.aprobada_at;
        return true;
      }),
    [respuestas, f],
  );

  function cambiar(clave, valor) {
    setFormulario((actual) => ({ ...actual, [clave]: valor }));
  }

  function abrirAlta() {
    setAviso(null);
    setFormulario(FORMULARIO_VACIO);
    setEditando('nueva');
  }

  function abrirCorreccion(respuesta) {
    setAviso(null);
    setFormulario(formularioDe(respuesta));
    setEditando(respuesta.id);
  }

  async function correr(clave, operacion) {
    if (enCurso) return;
    setEnCurso(clave);
    setAviso(null);
    try {
      await operacion();
      await cargar();
    } catch (err) {
      setAviso(mensajeDeError(err, t));
    } finally {
      setEnCurso(null);
    }
  }

  async function guardar(evento) {
    evento.preventDefault();
    const cuerpo = cuerpoDe(formulario);
    const esNueva = editando === 'nueva';
    await correr('formulario', async () => {
      await llamar(esNueva ? '/' : `/${editando}`, {
        method: esNueva ? 'POST' : 'PATCH',
        body: JSON.stringify(cuerpo),
      });
      setEditando(null);
      setFormulario(FORMULARIO_VACIO);
    });
  }

  function aprobar(respuesta) {
    // Lo clínico no se aprueba, y se dice acá mismo en vez de dejar que el motor lo rechace.
    if (respuesta.toca_salud) {
      setAviso(tr.lo_clinico_se_deriva);
      return;
    }
    return correr(respuesta.id, () => llamar(`/${respuesta.id}/aprobar`, { method: 'POST' }));
  }

  function desaprobar(respuesta) {
    return correr(respuesta.id, () => llamar(`/${respuesta.id}/desaprobar`, { method: 'POST' }));
  }

  async function eliminar(respuesta) {
    if (!(await confirmarDestructivo(tr.confirmar_eliminar))) return;
    return correr(respuesta.id, () => llamar(`/${respuesta.id}`, { method: 'DELETE' }));
  }

  return (
    <div>
      <h1>{tr.titulo}</h1>
      <p className="panel-explicacion">{tr.explicacion}</p>

      {aviso && <Alert variant="error">{aviso}</Alert>}

      <div className="panel-filtros">
        <select value={f.estado} onChange={(e) => set('estado', e.target.value)} aria-label={tr.titulo}>
          <option value="todas">{tr.filtro_todas}</option>
          <option value="sin_aprobar">{tr.filtro_sin_aprobar}</option>
          <option value="aprobadas">{tr.filtro_aprobadas}</option>
        </select>
        <Button onClick={abrirAlta} disabled={editando !== null || enCurso !== null}>
          {tr.agregar}
        </Button>
      </div>

      {editando !== null && (
        <form className="panel-formulario" onSubmit={guardar}>
          <FormField
            label={tr.nombre}
            name="nombre_interno"
            required
            value={formulario.nombre_interno}
            onChange={(e) => cambiar('nombre_interno', e.target.value)}
          />
          <FormField
            label={tr.terminos}
            name="terminos"
            required
            value={formulario.terminos}
            onChange={(e) => cambiar('terminos', e.target.value)}
          />
          <FormField
            label={tr.texto_es_ar}
            name="texto_es_ar"
            type="textarea"
            required
            value={formulario['es-AR']}
            onChange={(e) => cambiar('es-AR', e.target.value)}
          />
          <FormField
            label={tr.texto_en}
            name="texto_en"
            type="textarea"
            required
            value={formulario.en}
            onChange={(e) => cambiar('en', e.target.value)}
          />
          <FormField
            label={tr.texto_pt_br}
            name="texto_pt_br"
            type="textarea"
            required
            value={formulario['pt-BR']}
            onChange={(e) => cambiar('pt-BR', e.target.value)}
          />
          <FormField
            label={tr.toca_salud}
            name="toca_salud"
            type="checkbox"
            checked={formulario.toca_salud}
            onChange={(e) => cambiar('toca_salud', e.target.checked)}
          />
          <Button type="submit" disabled={enCurso !== null}>
            {tr.guardar}
          </Button>
          <Button variant="secondary" onClick={() => setEditando(null)} disabled={enCurso !== null}>
            {tr.cancelar}
          </Button>
        </form>
      )}

      <EstadoLista
        estado={estado}
        error={error}
        vacio={estado === 'listo' && visibles.length === 0}
        recargar={cargar}
        filtrado={hayFiltros}
        onLimpiarFiltros={limpiar}
        mensajeVacio={tr.sin_respuestas}
        accionVacio={<Button onClick={abrirAlta}>{tr.agregar}</Button>}
      >
        <table className="panel-tabla">
          <thead>
            <tr>
              <th>{tr.nombre}</th>
              <th>{tr.terminos}</th>
              <th>{tr.texto_es_ar}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visibles.map((respuesta) => (
              <tr key={respuesta.id}>
                <td>
                  {respuesta.nombre_interno}
                  <span className="badge">
                    {respuesta.origen === 'ia' ? tr.origen_ia : tr.origen_prestadora}
                  </span>
                  <span className="badge">
                    {respuesta.aprobada_at ? tr.aprobada : tr.sin_aprobar}
                  </span>
                  {respuesta.toca_salud && <span className="badge">{tr.toca_salud}</span>}
                  {!respuesta.activa && <span className="badge">{tr.apagada}</span>}
                </td>
                <td>{(respuesta.terminos ?? []).join(', ')}</td>
                <td>{respuesta.i18n?.['es-AR']}</td>
                <td>
                  <Button
                    variant="secondary"
                    onClick={() => abrirCorreccion(respuesta)}
                    disabled={enCurso !== null || editando !== null}
                  >
                    {tr.corregir}
                  </Button>
                  {respuesta.aprobada_at ? (
                    <Button
                      variant="secondary"
                      onClick={() => desaprobar(respuesta)}
                      disabled={enCurso !== null}
                    >
                      {tr.desaprobar}
                    </Button>
                  ) : (
                    !respuesta.toca_salud && (
                      <Button onClick={() => aprobar(respuesta)} disabled={enCurso !== null}>
                        {tr.aprobar}
                      </Button>
                    )
                  )}
                  <Button
                    variant="secondary"
                    onClick={() => eliminar(respuesta)}
                    disabled={enCurso !== null}
                  >
                    {tr.eliminar}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </EstadoLista>
    </div>
  );
}
