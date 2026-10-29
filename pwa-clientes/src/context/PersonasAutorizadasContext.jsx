// Qué le toca ver a quien está usando esta aplicación, y si el titular tiene una autorización de
// acceso para firmar.
//
// CADA PERSONA AUTORIZADA VE LO SUYO. Qué puede ver cada una lo dice la autorización de acceso
// que firma el titular, la arme él desde esta aplicación o la Prestadora desde el Panel, y rige
// desde la firma. La aplicación recibe eso resuelto: un objeto plano clave → verdadero o falso.
//
// POR QUÉ ESTÁ ACÁ Y NO EN `PerfilContext.jsx`, QUE PIDE EL MISMO `/perfil`. Aquel archivo es
// idéntico en las dos aplicaciones —está declarado como copia en `scripts/copias_entre_apps.mjs`
// y `scripts/verificar_identidad.mjs` corta la publicación si alguna se despega—, y las personas
// autorizadas no existen del lado del Asistente. Meterlas ahí obligaría a llevarle a esa aplicación
// una idea que no es suya.
//
// POR QUÉ UN CONTEXTO Y NO UN PEDIDO POR PANTALLA. Varias pantallas necesitan `/perfil` nada más
// que para saber el rol de quien mira. Acá se pregunta una vez y lo consumen todas, que es lo que
// pide la regla del punto único de verdad.
//
// EL CANDADO DE VERDAD NO ESTÁ ACÁ. Está en el backend, que directamente no manda lo que esa
// persona no tiene, y en las políticas de la base. Esto es para que no quede un botón que lleva
// a una pantalla vacía ni un formulario que va a terminar en un rechazo.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from './AuthContext';

// `estado` es 'cargando' hasta que llega la respuesta, 'error' si no se la pudo traer y 'listo'
// cuando se sabe qué le dieron a esta persona.
const PERSONAS_AUTORIZADAS_VACIO = { estado: 'cargando', esTitular: false, accesos: null, instruccionPendiente: null };

// El valor de afuera del proveedor tiene la misma forma que el de adentro, con `puedeVer`
// incluido. Un componente dibujado por error fuera del proveedor tiene que comportarse como
// cuando la respuesta todavía no llegó, no romperse llamando a una función que no está.
const PersonasAutorizadasContext = createContext({
  estado: 'cargando',
  esTitular: false,
  instruccionPendiente: null,
  recargar: () => {},
  puedeVer: () => false,
});

export function PersonasAutorizadasProvider({ children }) {
  const { session } = useAuth();
  const [personasAutorizadas, setPersonasAutorizadas] = useState(PERSONAS_AUTORIZADAS_VACIO);
  // Cuenta cuál es el pedido vigente. Sin esto, la respuesta de un pedido viejo —el de antes de
  // cerrar sesión, o el de antes de firmar— puede llegar después del nuevo y pisarlo con datos
  // que ya no valen.
  const vigente = useRef(0);

  const recargar = useCallback(async () => {
    const mio = ++vigente.current;
    try {
      // `accesos` e `instruccionPendiente` viajan al lado de `perfil`, no adentro, igual que
      // `visibilidad`: la persona es una cosa y lo que le dieron es otra.
      const respuesta = await api.perfil();
      if (vigente.current !== mio) return;
      setPersonasAutorizadas({
        estado: 'listo',
        esTitular: Boolean(respuesta?.perfil?.esTitular),
        accesos: respuesta?.accesos ?? null,
        instruccionPendiente: respuesta?.instruccionPendiente ?? null,
      });
    } catch {
      // Sin esta respuesta no se sabe qué le dieron, y ante la duda se niega, igual que el backend
      // y la base. Lo que ya se sabía de un intento anterior se conserva.
      if (vigente.current !== mio) return;
      setPersonasAutorizadas((antes) => (antes.accesos ? antes : { ...antes, estado: 'error' }));
    }
  }, []);

  useEffect(() => {
    if (!session) {
      vigente.current += 1;
      setPersonasAutorizadas(PERSONAS_AUTORIZADAS_VACIO);
      return;
    }
    recargar();
  }, [session, recargar]);

  const valor = useMemo(
    () => ({
      estado: personasAutorizadas.estado,
      esTitular: personasAutorizadas.esTitular,
      instruccionPendiente: personasAutorizadas.instruccionPendiente,
      recargar,
      // Se pregunta por la clave en vez de repartir la lista entera, igual que `useSeVe`: el
      // catálogo de accesos vive en el backend (`backend/src/utils/catalogoPersonasAutorizadas.js`) y
      // no se copia acá, así que un acceso nuevo no obliga a tocar este archivo.
      //
      // Mientras la respuesta no llegó, o si no llegó nunca, contesta que no: lo que no se sabe
      // que le dieron no se muestra, igual que en el backend y en la base. La ruta que abre una
      // pantalla entera no expulsa a nadie por eso: espera (`App.jsx`, `PantallaPermitida`).
      puedeVer: (clave) => personasAutorizadas.accesos?.[clave] === true,
    }),
    [personasAutorizadas, recargar],
  );

  return <PersonasAutorizadasContext.Provider value={valor}>{children}</PersonasAutorizadasContext.Provider>;
}

export function usePersonasAutorizadas() {
  return useContext(PersonasAutorizadasContext);
}
