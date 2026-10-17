import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { correoDeAcceso } from '../lib/correoDeAcceso';
import { olvidarMarca } from '../lib/marcaGuardada';
import { descartarSesionGuardada, guardarSesionBajoLaHuella } from '../lib/accesoGuardado';

// Este proveedor contesta tres cosas distintas, y nunca las confunde entre sí:
//   'cargando' — todavía no se sabe quién entró;
//   'error'    — no se pudo averiguar, y la pantalla lo dice en vez de mostrarse vacía;
//   'listo'    — se averiguó, haya sesión o no la haya.
// Antes, una lectura fallida dejaba el usuario en nulo y quien lo recibía no podía distinguir
// «todavía no llegó» de «falló», así que mostraba un vacío tranquilizador.
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined);
  const [usuario, setUsuario] = useState(null);
  const [estado, setEstado] = useState('cargando');
  const cargando = estado === 'cargando';

  useEffect(() => {
    let activo = true;

    async function traerUsuario(userId) {
      const { data, error } = await supabase
        .from('usuarios')
        .select('id, rol, nombre, prestadora_id')
        .eq('id', userId)
        .maybeSingle();
      if (error) return { usuario: null, fallo: true };
      return { usuario: data ?? null, fallo: false };
    }

    async function cargarUsuario(userId) {
      setEstado('cargando');
      let traido;
      try {
        traido = await traerUsuario(userId);
      } catch {
        traido = { usuario: null, fallo: true };
      }
      if (!activo) return;
      if (traido.fallo) {
        setUsuario(null);
        setEstado('error');
        return;
      }
      setUsuario(traido.usuario);
      setEstado('listo');
    }

    async function cargarSesion() {
      let datos;
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        datos = data;
      } catch {
        if (!activo) return;
        setSession(null);
        setUsuario(null);
        setEstado('error');
        return;
      }
      if (!activo) return;
      setSession(datos.session);
      if (datos.session) {
        await cargarUsuario(datos.session.user.id);
      } else {
        setEstado('listo');
      }
    }

    cargarSesion();

    const { data: listener } = supabase.auth.onAuthStateChange((_evento, nuevaSesion) => {
      setSession(nuevaSesion);
      if (nuevaSesion) {
        cargarUsuario(nuevaSesion.user.id);
      } else {
        setUsuario(null);
        setEstado('listo');
      }
    });

    return () => {
      activo = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  // La cuenta es de una Prestadora: con el mismo correo, cada una tiene la suya
  // (`lib/correoDeAcceso.js`). Por eso se entra nombrando primero la Prestadora.
  async function login(prestadoraId, email, password) {
    try {
      const acceso = await correoDeAcceso(email, prestadoraId);
      const { error } = await supabase.auth.signInWithPassword({ email: acceso, password });
      return { error };
    } catch (error) {
      return { error };
    }
  }

  // Con un acceso guardado de esta persona, cerrar sesión no la revoca: la deja cifrada en el
  // teléfono y se vuelve a abrir con la huella (`lib/accesoGuardado.js`). Supabase no tiene una
  // forma pública de soltar la sesión sin revocarla, así que se usa la interna; si una versión
  // nueva la saca, se cierra como siempre.
  async function logout() {
    const { data } = await supabase.auth.getSession();
    let guardada = false;
    if (typeof supabase.auth._removeSession === 'function') {
      guardada = await guardarSesionBajoLaHuella(data?.session).catch(() => false);
    }
    if (guardada) {
      await supabase.auth._removeSession();
      return;
    }
    descartarSesionGuardada();
    await supabase.auth.signOut();
    await olvidarMarca();
  }

  return (
    <AuthContext.Provider value={{ session, usuario, estado, cargando, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
