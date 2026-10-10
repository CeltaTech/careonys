import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { llamarApiConfiguracion } from '../../lib/apiConfiguracion';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { MODOS_DE_CONTROL_MATRICULA } from '../../lib/matricula';
import { mensajeDeError } from '../../lib/errores';
import '../../styles/molde-paginas.css';

/* Qué tan estricta es la Prestadora con la matrícula de sus Asistentes. Es parte del control de
   la documentación de cada uno, en el alta y en las renovaciones, y por eso vive junto a los
   documentos y no junto a los tipos.

   Se lee aparte del resto y tiene sus propios cuatro estados, porque es lo único de acá que se
   puede contestar mal sin que se note. Si la lectura falla no se muestra ninguna política ni se
   deja guardar ninguna: mostrar la flexible sin haberla leído dejaría guardar esa mentira encima
   de la verdadera con sólo tocar el selector. El backend, con el mismo dato ausente, supone la
   estricta (`lib/matricula.js`, MODO_CONTROL_MATRICULA_SUPUESTO), porque todo control de acceso
   falla cerrado. Esta pantalla no necesita suponer: puede volver a preguntar. */
export function ControlDeMatricula() {
  const { t } = useLocale();
  const [modo, setModo] = useState(null);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    try {
      const respuesta = await llamarApiConfiguracion('/modo-control-matricula');
      // Una respuesta que llegó sin un modo conocido es una lectura fallida igual que una caída.
      if (!MODOS_DE_CONTROL_MATRICULA.includes(respuesta?.modo)) {
        throw new Error('modo_control_matricula_desconocido');
      }
      setModo(respuesta.modo);
      setEstado('listo');
    } catch (fallo) {
      setModo(null);
      setError(mensajeDeError(fallo, t));
      setEstado('error');
    }
  }, [t]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function cambiar(nuevo) {
    // Sin haber leído la política actual no se guarda ninguna.
    if (estado !== 'listo') return;
    setGuardando(true);
    setError(null);
    try {
      await llamarApiConfiguracion('/modo-control-matricula', {
        method: 'PATCH',
        body: JSON.stringify({ modo: nuevo }),
      });
      setModo(nuevo);
    } catch (fallo) {
      setError(mensajeDeError(fallo, t));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="panel-tarjeta">
      <div className="panel-tarjeta-titulo">
        <h2>{t.matricula.modo_titulo}</h2>
      </div>
      {estado === 'cargando' && (
        <p className="estado-cargando" role="status">
          {t.comun.cargando}
        </p>
      )}

      {estado === 'error' && (
        <Alert variant="error">
          {t.matricula.modo_no_se_pudo_leer} {error}{' '}
          <Button variant="secondary" onClick={cargar} disabled={guardando}>
            {t.comun.reintentar}
          </Button>
        </Alert>
      )}

      {estado === 'listo' && (
        <>
          {error && <Alert variant="error">{error}</Alert>}
          <div className="molde-formgrid">
            <div className="molde-campo">
              <select
                id="modo_control_matricula"
                aria-label={t.matricula.modo_titulo}
                value={modo}
                disabled={guardando}
                onChange={(e) => cambiar(e.target.value)}
              >
                {MODOS_DE_CONTROL_MATRICULA.map((opcion) => (
                  <option key={opcion} value={opcion}>
                    {t.matricula[`modo_${opcion}`]}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
