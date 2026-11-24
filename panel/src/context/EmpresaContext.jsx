import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { anotarNombreDeLaPrestadora } from '../i18n/marcaEnElTexto';
import { anotarZonaHoraria } from '../lib/horarios';
import { anotarFrasesDeLosMotivos } from '../i18n/frasesDeLosMotivos';
import { leerFrasesDeLosMotivos } from '../lib/leerFrasesDeLosMotivos';

const EmpresaContext = createContext(null);

// Con sesión, cada Organización lee su propia fila vía RLS (prestadora_lee_su_configuracion).
//
// Sin sesión no se carga nada acá, y es a propósito: esta lectura pasa por RLS y devuelve la
// configuración propia de quien entró.
// DEVUELVE EL FALLO, NO UN NULO. Sin sesión no hay configuración que leer, y eso es una
// respuesta; una lectura que no se pudo hacer es otra cosa, y antes las dos
// terminaban en el mismo nulo. Quien lo consume no podía distinguir «todavía no llegó» de
// «falló», que es la forma de mostrar un vacío tranquilizador en lugar de un error.
//
// EL NOMBRE SALE DE `prestadoras`. Es el nombre de fantasía, el mismo que leen las aplicaciones y
// los correos, y se guarda una sola vez. Esa fila la leen la Administración y la coordinación; los
// canales de contacto, sólo la Administración, así que quien coordina recibe el nombre sin ellos.
//
// LA ZONA HORARIA TAMBIÉN SALE DE `prestadoras`, en la misma lectura. Con ella el Panel cuenta
// qué día es hoy y en qué momento empieza cada turno de guardia (lib/horarios.js). Se anota allá
// antes de pasar a 'listo', y ProtectedRoute no abre ninguna pantalla mientras no esté anotada.
async function cargarConfiguracionPropia() {
  const [prestadora, configuracion] = await Promise.all([
    supabase.from('prestadoras').select('nombre_fantasia, logo_url, zona_horaria').maybeSingle(),
    supabase
      .from('configuracion_prestadora')
      .select('telefono, whatsapp_numero, email, dominio, zona_cobertura_texto')
      .maybeSingle(),
  ]);
  if (prestadora.error || configuracion.error) return { empresa: null, fallo: true };
  if (!prestadora.data) return { empresa: null, fallo: false };
  return {
    empresa: {
      ...(configuracion.data ?? {}),
      nombre: prestadora.data.nombre_fantasia,
      logo_url: prestadora.data.logo_url,
      zona_horaria: prestadora.data.zona_horaria,
    },
    fallo: false,
  };
}

export function EmpresaProvider({ children }) {
  const [empresa, setEmpresa] = useState(null);
  // 'cargando' mientras la respuesta viaja, 'error' cuando no se pudo leer, 'listo' cuando se
  // supo —incluida la pantalla de ingreso, donde saber que todavía no hay configuración propia que
  // leer es una respuesta y no una espera—.
  const [estado, setEstado] = useState('cargando');
  // Vuelve a leer la fila sin pasar por el cargando, para que el encabezado tome el nombre o el
  // logo que se acaban de cambiar en Configuración.
  const [vuelta, setVuelta] = useState(0);
  const recargar = useCallback(() => setVuelta((v) => v + 1), []);

  useEffect(() => {
    let activo = true;

    // Las frases de la base que explican los rechazos de la base (i18n/frasesDeLosMotivos.js).
    // Corren aparte de la configuración: una no espera a la otra. Sin sesión se borran.
    async function anotarLasFrasesDeLosMotivos(session) {
      const filas = session ? await leerFrasesDeLosMotivos().catch(() => null) : null;
      if (activo) anotarFrasesDeLosMotivos(filas);
    }

    async function cargarSegunSesion(session) {
      anotarLasFrasesDeLosMotivos(session);
      if (activo && vuelta === 0) setEstado('cargando');
      let traido = { empresa: null, fallo: false };
      if (session) {
        try {
          traido = await cargarConfiguracionPropia();
        } catch {
          traido = { empresa: null, fallo: true };
        }
      }
      if (!activo) return;
      if (traido.fallo) {
        setEmpresa(null);
        anotarNombreDeLaPrestadora(null);
        anotarZonaHoraria(null);
        setEstado('error');
        return;
      }
      setEmpresa(traido.empresa);
      // Con qué nombre se presenta la Prestadora, para las frases que la nombran con el
      // marcador {{prestadora}} (i18n/marcaEnElTexto.js). Sin sesión queda en nulo, que es lo
      // que corresponde: la configuración propia recién se lee después de entrar.
      anotarNombreDeLaPrestadora(traido.empresa?.nombre);
      // Antes de 'listo': nada de lo que se dibuje después puede contar el día con otro reloj.
      anotarZonaHoraria(traido.empresa?.zona_horaria);
      setEstado('listo');
    }

    supabase.auth.getSession().then(({ data: { session } }) => cargarSegunSesion(session));

    const { data: suscripcion } = supabase.auth.onAuthStateChange((_evento, session) => {
      cargarSegunSesion(session);
    });

    return () => {
      activo = false;
      suscripcion.subscription.unsubscribe();
    };
  }, [vuelta]);

  return <EmpresaContext.Provider value={{ empresa, estado, recargar }}>{children}</EmpresaContext.Provider>;
}

export function useEmpresa() {
  const ctx = useContext(EmpresaContext);
  if (!ctx) throw new Error('useEmpresa debe usarse dentro de EmpresaProvider');
  return ctx;
}
