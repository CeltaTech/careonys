import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { anotarActividad } from '../lib/ultimaActividad';

const AuthContext = createContext(null);

// Quién está mirando, leído de la base. Está acá afuera porque lo usan dos caminos —la carga
// inicial de la sesión y el refresco de abajo— y una sola forma de armar el usuario evita que
// uno de los dos se olvide de la moneda.
//
// La moneda de la Prestadora viaja junto con el usuario porque hay importes que se muestran
// antes de guardarse —una proyección, una cuenta en pantalla— y no tienen todavía una moneda
// propia de la que leerla (`CLAUDE.md` §8, «todo importe se guarda con su moneda»).
//
// DEVUELVE LAS TRES SITUACIONES POR SEPARADO, y no un usuario en nulo para todas. Antes
// esta lectura descartaba el error: una consulta que no se podía hacer terminaba en
// el mismo nulo que una fila inexistente, y el Panel echaba a la pantalla de ingreso a alguien
// que sí tenía sesión. `maybeSingle` es lo que separa los dos casos: sin fila devuelve nulo sin
// error, y entonces cualquier error que llegue acá es de verdad una falla.
async function traerUsuario(userId) {
  const { data, error } = await supabase
    .from('usuarios')
    .select('id, rol, nombre, prestadora_id, prestadoras(moneda, cierre_por_inactividad_activo, cierre_por_inactividad_minutos)')
    .eq('id', userId)
    .maybeSingle();
  if (error) return { usuario: null, fallo: true };
  if (!data) return { usuario: null, fallo: false };
  const prestadora = data.prestadoras;
  return {
    usuario: {
      ...data,
      moneda: prestadora?.moneda ?? null,
      // Sin fila de Prestadora no hay configuración que leer, y el cierre no corre.
      cierrePorInactividad: prestadora
        ? { activo: prestadora.cierre_por_inactividad_activo, minutos: prestadora.cierre_por_inactividad_minutos }
        : null,
    },
    fallo: false,
  };
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined);
  const [usuario, setUsuario] = useState(null);
  // Las tres situaciones, dichas por separado: 'cargando' mientras la respuesta viaja, 'error'
  // cuando no se pudo saber quién está mirando, y 'listo' cuando se supo —haya fila o no—. Sin
  // esta separación, quien consume este proveedor no puede distinguir «todavía no llegó» de
  // «falló», y una pantalla que trata un fallo como «no hay nada» muestra un vacío tranquilizador
  // en vez de un error (`celtatech/CLAUDE.md` §5, todo control de acceso falla cerrado).
  const [estado, setEstado] = useState('cargando');
  const cargando = estado === 'cargando';

  useEffect(() => {
    let activo = true;

    async function cargarSesion() {
      const { data, error } = await supabase.auth.getSession();
      if (!activo) return;
      if (error) {
        // No se pudo saber si hay sesión. Eso no es «no hay sesión»: decirlo así mandaría a la
        // pantalla de ingreso a quien está trabajando, y encima sin explicación.
        setEstado('error');
        return;
      }
      setSession(data.session);
      if (data.session) {
        await cargarUsuario(data.session.user.id);
      } else {
        setEstado('listo');
      }
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
        // El usuario anterior no queda puesto: con la lectura fallada no se sabe quién está
        // mirando, y dejar el de antes sería contestar con un dato de otra sesión.
        setUsuario(null);
        setEstado('error');
        return;
      }
      setUsuario(traido.usuario);
      setEstado('listo');
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

  async function login(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    // Una entrada nueva empieza a contar de cero: si no, la quietud de la sesión anterior la
    // cerraría apenas abierta.
    if (!error) anotarActividad();
    return { error };
  }

  async function logout() {
    await supabase.auth.signOut();
  }

  // Volver a leer al usuario sin salir y entrar. Lo pide la pantalla que cambia la moneda de la
  // Prestadora: el dato viaja pegado al usuario, así que sin esto los importes que se muestran
  // antes de guardarse seguirían escritos en la moneda anterior hasta la próxima entrada.
  async function refrescarUsuario() {
    const userId = session?.user?.id;
    if (!userId) return;
    const traido = await traerUsuario(userId);
    // Si la relectura falla, se deja el usuario que ya estaba: es el de esta misma sesión y
    // sigue siendo cierto. Lo que no se hace es reemplazarlo por un nulo, que se leería como
    // «esta persona ya no existe».
    if (traido.fallo) {
      setEstado('error');
      return;
    }
    setUsuario(traido.usuario);
  }

  return (
    <AuthContext.Provider
      value={{ session, usuario, estado, cargando, login, logout, refrescarUsuario }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
