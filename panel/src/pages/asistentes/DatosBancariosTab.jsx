import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { llamarApiPanel } from '../../lib/apiPanel';
import { mensajeDeError } from '../../lib/errores';
import { EstadoLista } from '../../components/layout/EstadoLista';

/* Dónde cobra este Asistente, para que la administración le pueda transferir.
   ==========================================================================

   POR QUÉ EXISTE. La cuenta la informa el Asistente desde su teléfono, y hasta ahora no había
   dónde mirarla: no se le podía pagar aunque estuviera cargada.

   SE MIRA Y NO SE TOCA. Lo que está mal en una cuenta lo corrige su dueño, que es el único que
   sabe cuál es la suya. Por eso acá no hay ningún casillero.

   CÓMO SE LLAMA EL NÚMERO LO DICE LA BASE. CBU, CVU o alias son de Argentina; en otro país son
   otros. La sigla viene resuelta desde el backend, del catálogo por país. Acá no hay ninguna lista
   escrita.

   EL NÚMERO NO SE PIDE POR LA DIRECCIÓN NI SE ESCRIBE EN NINGÚN LADO: llega en la respuesta y se
   muestra. Lo que viaja en la dirección es de quién es la ficha que se está mirando. */

export function DatosBancariosTab({ asistente }) {
  const { t, locale } = useLocale();
  const [cuentas, setCuentas] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);

  const cargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    try {
      const resultado = await llamarApiPanel(`/datos-bancarios/${asistente.id}`);
      setCuentas(resultado.cuentas || []);
      setEstado('listo');
    } catch (falla) {
      setError(mensajeDeError(falla, t));
      setEstado('error');
    }
  }, [asistente.id, t]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return (
    <EstadoLista
      estado={estado}
      error={error}
      vacio={estado === 'listo' && cuentas.length === 0}
      recargar={cargar}
      mensajeVacio={t.asistentes.datos_bancarios.sin_cuenta}
      ayudaVacio={t.asistentes.datos_bancarios.sin_cuenta_ayuda}
    >
      <table className="panel-tabla">
        <thead>
          <tr>
            <th>{t.asistentes.datos_bancarios.identificador}</th>
            <th>{t.asistentes.datos_bancarios.banco}</th>
            <th>{t.asistentes.datos_bancarios.titular}</th>
            <th>{t.asistentes.datos_bancarios.actualizado_en}</th>
          </tr>
        </thead>
        <tbody>
          {cuentas.map((cuenta) => (
            <tr key={`${cuenta.pais}:${cuenta.clase}`}>
              <td>
                {cuenta.sigla} {cuenta.identificador}
              </td>
              <td>{cuenta.banco || '—'}</td>
              <td>{cuenta.titular || '—'}</td>
              <td>
                {cuenta.actualizado_en
                  ? new Date(cuenta.actualizado_en).toLocaleDateString(locale)
                  : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </EstadoLista>
  );
}
