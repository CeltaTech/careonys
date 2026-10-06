import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { T, LOCALES } from './translations';
import { sustituirIdentidadProfundo } from '../config/identidadProducto.js';
import { idiomaInicial, loQueDiceElNavegador } from './idiomaInicial.js';
import {
  alCambiarElNombre,
  nombreDeLaPrestadora,
  sustituirPrestadoraProfundo,
} from './marcaEnElTexto.js';
import { avisandoLoQueFalta } from './faltaLaFrase.js';

const LocaleContext = createContext(null);

const CLAVE_GUARDADA = 'plm-pwa-clientes-locale';

// La clave con la que esta aplicación guardaba el idioma antes de cambiarle el nombre. Se escribe
// una sola vez, acá, y existe sólo para mudar lo que eligió quien ya la tenía instalada: sin esto,
// esa persona vería la pantalla en otro idioma del que eligió. Se puede borrar cuando ya no quede
// ningún teléfono con la clave vieja.
const CLAVE_GUARDADA_ANTERIOR = 'plm-pwa-clientes-locale';

// Lo elegido a mano, mudado de la clave anterior si hace falta. La mudanza pasa una sola vez: la
// clave vieja se borra al copiarla.
function idiomaGuardado() {
  try {
    const guardado = localStorage.getItem(CLAVE_GUARDADA);
    if (guardado !== null) return guardado;
    const anterior = localStorage.getItem(CLAVE_GUARDADA_ANTERIOR);
    if (anterior === null) return null;
    localStorage.setItem(CLAVE_GUARDADA, anterior);
    localStorage.removeItem(CLAVE_GUARDADA_ANTERIOR);
    return anterior;
  } catch {
    return null;
  }
}

// En qué idioma se abre la pantalla. Lo elegido a mano manda; si nadie eligió nunca, lo deciden
// la dirección por la que se entró y después el navegador. La regla entera, con el porqué de ese
// orden, está en `i18n/idiomaInicial.js`.
function localeInicial() {
  const { direccion, etiquetas } = loQueDiceElNavegador();
  return idiomaInicial({ guardado: idiomaGuardado(), direccion, etiquetas });
}

export function LocaleProvider({ children }) {
  const [locale, setLocaleState] = useState(localeInicial);

  function setLocale(nuevoLocale) {
    if (!LOCALES.includes(nuevoLocale)) return;
    localStorage.setItem(CLAVE_GUARDADA, nuevoLocale);
    setLocaleState(nuevoLocale);
  }

  // Con qué nombre se presenta la Prestadora de esta sesión. Se lee de un anotador y no de un
  // contexto porque el que tiene ese dato cuelga de este proveedor, no al revés. Ver
  // `i18n/marcaEnElTexto.js`.
  const nombrePrestadora = useSyncExternalStore(
    alCambiarElNombre,
    nombreDeLaPrestadora,
    nombreDeLaPrestadora
  );

  // Los textos nombran al producto con el marcador {{producto}} y a la Prestadora con
  // {{prestadora}}, y los dos se resuelven acá, una sola vez por idioma y por nombre. Se hace en
  // este punto —y no en cada componente— porque `t` se consume como objeto plano (t.auth.titulo),
  // no como función t('auth.titulo'): así ningún punto de consumo cambia por esto. Al final, la
  // envoltura que hace que una frase que falta avise en vez de dibujarse como un hueco en blanco.
  // Ver src/config/identidadProducto.js, i18n/marcaEnElTexto.js e i18n/faltaLaFrase.js.
  const t = useMemo(
    () =>
      avisandoLoQueFalta(
        sustituirPrestadoraProfundo(sustituirIdentidadProfundo(T[locale]), nombrePrestadora)
      ),
    [locale, nombrePrestadora]
  );

  // En qué idioma está la página. El `index.html` la declara en castellano y ahí se quedaba
  // aunque se eligiera inglés o portugués: un lector de pantalla seguía leyendo con la
  // pronunciación castellana, que vuelve incomprensible el texto en otro idioma.
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale debe usarse dentro de LocaleProvider');
  return ctx;
}
