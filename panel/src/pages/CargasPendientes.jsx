import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '../i18n/LocaleContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { mensajeDeError } from '../lib/errores';
import { conMotivoDeDomicilioTemporal } from '../lib/domiciliosTemporales';
import { FICHA_NOMBRE, conSuFicha } from '../lib/fichaDelPaciente';
import { Button } from '../components/ui/Button';
import { FormField } from '../components/ui/FormField';
import { Alert } from '../components/ui/Alert';
import { Cabecera } from '../components/ui/Cabecera';
import { EstadoLista } from '../components/layout/EstadoLista';
import '../styles/molde-paginas.css';

// Lo que cargó un Coordinador sobre un Paciente que no coordina, esperando que lo acepte el
// Coordinador asignado o el Administrador. Qué filas ve cada uno lo decide la base: quien la
// cargó ve la suya, y quien puede revisarla la ve para aceptarla o rechazarla. Aceptar y
// rechazar pasan por `revisar_carga`, que vuelve a comprobar quién está revisando.
//
// Funciona como la aprobación de medicación, con su mismo molde.

// Qué se muestra de cada tabla, y con qué texto. Lo que no está acá —coordenadas, partes
// sueltas del domicilio— se aplica igual al aceptar, pero no se lee.
const CAMPOS = {
  informacion_de_salud_del_paciente: ['nivel_complejidad', 'patologias', 'nota_aclaratoria'],
  domicilios_temporales_paciente: ['domicilio', 'motivo', 'fecha_inicio', 'fecha_fin'],
};

function etiquetaDelCampo(t, campo) {
  switch (campo) {
    case 'nivel_complejidad': return t.clientes.nivel_complejidad;
    case 'patologias': return t.clientes.editar_paciente.patologias;
    case 'nota_aclaratoria': return t.cargas_pendientes.nota_aclaratoria;
    case 'domicilio': return t.domicilios_temporales.col_domicilio;
    case 'motivo': return t.domicilios_temporales.col_motivo;
    case 'fecha_inicio': return t.domicilios_temporales.col_desde;
    case 'fecha_fin': return t.domicilios_temporales.col_hasta;
    default: return campo;
  }
}

function valorDelCampo(t, campo, valor) {
  if (Array.isArray(valor)) return valor.join(', ');
  if (valor === null || valor === undefined || valor === '') {
    return campo === 'fecha_fin' ? t.domicilios_temporales.sin_fecha_fin : '—';
  }
  return String(valor);
}

export function CargasPendientes() {
  const { t, locale } = useLocale();
  const { usuario } = useAuth();
  const [cargas, setCargas] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [accionEnCurso, setAccionEnCurso] = useState(null);
  const [rechazando, setRechazando] = useState(null);
  const [motivoRechazo, setMotivoRechazo] = useState('');

  const explicar = useCallback(
    (e) => mensajeDeError(conMotivoDeDomicilioTemporal(e), t, 'cargas pendientes'),
    [t]
  );

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    const { data, error: errorLista } = await supabase
      .from('cargas_sujetas_a_aprobacion')
      .select(`id, tabla, operacion, datos, cargado_por, cargado_en,
        cargador:usuarios!cargas_sujetas_a_aprobacion_cargado_por_fkey(nombre),
        paciente:pacientes!cargas_sujetas_a_aprobacion_del_paciente(${FICHA_NOMBRE})`)
      .eq('estado', 'pendiente')
      .order('cargado_en', { ascending: true });
    if (errorLista) {
      setError(explicar(errorLista));
      setEstado('error');
      return;
    }
    setCargas((data ?? []).map((c) => ({ ...c, paciente: conSuFicha(c.paciente) })));
    setEstado('listo');
  }, [explicar]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  async function revisar(carga, acepta, motivo = null) {
    setAccionEnCurso(carga.id);
    setError(null);
    const { error: errorRevision } = await supabase
      .rpc('revisar_carga', { p_carga: carga.id, p_acepta: acepta, p_motivo: motivo });
    setAccionEnCurso(null);
    if (errorRevision) {
      setError(explicar(errorRevision));
      return;
    }
    setRechazando(null);
    setMotivoRechazo('');
    recargar();
  }

  return (
    <div>
      <Cabecera titulo={t.cargas_pendientes.titulo} />
      {estado === 'listo' && error && <Alert variant="error">{error}</Alert>}

      <EstadoLista estado={estado} error={error} vacio={estado === 'listo' && cargas.length === 0} recargar={recargar}>
        <div className="molde-pila">
          {cargas.map((carga) => {
            const ocupada = accionEnCurso === carga.id;
            // Quien la cargó la ve, pero no la revisa: la base lo rechazaría igual.
            const propia = carga.cargado_por === usuario?.id;
            const campos = (CAMPOS[carga.tabla] ?? []).filter((campo) => campo in (carga.datos ?? {}));
            return (
              <section key={carga.id} className="panel-tarjeta">
                <div className="panel-tarjeta-titulo">
                  <h2>{carga.paciente?.nombre}</h2>
                  <span className="panel-mini">
                    {t.cargas_pendientes.tablas[carga.tabla]} · {t.cargas_pendientes.operaciones[carga.operacion]}
                  </span>
                </div>
                <dl className="documento-datos">
                  {campos.map((campo) => (
                    <div key={campo}>
                      <dt>{etiquetaDelCampo(t, campo)}</dt>
                      <dd>{valorDelCampo(t, campo, carga.datos[campo])}</dd>
                    </div>
                  ))}
                </dl>
                <span className="panel-mini">
                  {carga.cargador?.nombre} · {new Date(carga.cargado_en).toLocaleString(locale)}
                </span>

                {propia ? null : rechazando === carga.id ? (
                  <>
                    <div className="molde-formgrid">
                      <div className="molde-ancho">
                        <FormField
                          label={t.cargas_pendientes.motivo_rechazo}
                          name={`motivo-${carga.id}`}
                          value={motivoRechazo}
                          onChange={(e) => setMotivoRechazo(e.target.value)}
                          required
                        />
                      </div>
                    </div>
                    <div className="molde-acciones">
                      <Button variant="secondary" onClick={() => { setRechazando(null); setMotivoRechazo(''); }} disabled={ocupada}>
                        {t.comun.cancelar}
                      </Button>
                      <Button onClick={() => revisar(carga, false, motivoRechazo)} disabled={ocupada || !motivoRechazo.trim()}>
                        {ocupada ? t.comun.guardando : t.cargas_pendientes.confirmar_rechazo}
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="molde-acciones">
                    <Button variant="secondary" onClick={() => setRechazando(carga.id)} disabled={ocupada}>
                      {t.cargas_pendientes.rechazar}
                    </Button>
                    <Button onClick={() => revisar(carga, true)} disabled={ocupada}>
                      {ocupada ? t.comun.guardando : t.cargas_pendientes.aceptar}
                    </Button>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </EstadoLista>
    </div>
  );
}
