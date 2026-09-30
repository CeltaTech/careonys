import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { usePrestadoraActual } from './usePrestadoraActual';
import { useAuth } from '../context/AuthContext';
import {
  alarmasTomadas,
  reglaDeLaTomaDe,
  tomaVigente,
} from '../lib/alarmasTomadas';

/* QUIÉN SE ESTÁ HACIENDO CARGO DE CADA ALARMA, PARA LA PANTALLA
   ============================================================

   Una consulta por pantalla, no una por alarma. La pantalla de Continuidad muestra cuatro clases
   de alarma juntas, y las tomas en pie de una Prestadora son pocas: se traen todas y después cada
   renglón busca la suya.

   SE LEE DE LA VISTA Y SE ESCRIBE EN LA TABLA. El nombre de quien la tomó no se puede pedir
   consultando `usuarios`: esa tabla deja que cada persona lea su propia fila y ninguna otra, así
   que acá se dibujaría un guión justo en el único dato que importa. La vista muestra las mismas
   filas con el nombre ya resuelto. Mismo camino que los avisos de cierre de servicio.

   LO QUE SE VE SE VUELVE A MEDIR ACÁ. Una toma vencida es una alarma que volvió, y quien mira la
   pantalla tiene que verla volver sin recargar nada. Por eso la vigencia se calcula contra el
   momento en que se dibuja, con el mismo archivo que usa el backend. */

const VISTA = 'alarmas_tomadas_quien_la_tomo';
const TABLA = 'alarmas_tomadas';

export function useAlarmasTomadas() {
  const prestadoraId = usePrestadoraActual();
  const { usuario } = useAuth();
  const [tomas, setTomas] = useState([]);
  const [regla, setRegla] = useState(() => reglaDeLaTomaDe(null));
  const [trabajando, setTrabajando] = useState(null);

  const recargar = useCallback(async () => {
    if (!prestadoraId) return;
    const [{ data: filas }, { data: configuracion }] = await Promise.all([
      supabase.from(VISTA).select('*').is('soltada_at', null).order('tomada_at', { ascending: false }),
      supabase
        .from('configuracion_alarmas_tomadas')
        .select('regla')
        .eq('prestadora_id', prestadoraId)
        .maybeSingle(),
    ]);
    setRegla(reglaDeLaTomaDe(configuracion?.regla));
    setTomas(filas ?? []);
  }, [prestadoraId]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  /** La toma en pie de esta alarma, o `null` si nadie se hizo cargo o ya se le cumplió el rato. */
  const tomaDe = useCallback(
    (tipo, referenciaId, ahora = new Date()) =>
      tomas.find((t) => t.tipo === tipo && t.referencia_id === referenciaId && tomaVigente(t, ahora, regla)) ?? null,
    [tomas, regla],
  );

  /** Si otra persona tiene tomada esta alarma. Mientras la tenga, la base no deja resolverla. */
  const laTieneOtraPersona = useCallback(
    (tipo, referenciaId) => {
      const toma = tomaDe(tipo, referenciaId);
      return Boolean(toma) && toma.tomada_por !== usuario?.id;
    },
    [tomaDe, usuario?.id],
  );

  /** Los identificadores de las alarmas de esa clase que alguien está atendiendo. */
  const tomadasDe = useCallback(
    (tipo, ahora = new Date()) => alarmasTomadas(tomas.filter((t) => t.tipo === tipo), ahora, regla),
    [tomas, regla],
  );

  const tomar = useCallback(
    async (tipo, referenciaId, usuarioId) => {
      setTrabajando(referenciaId);
      try {
        // Fila nueva cada vez, nunca pisando la anterior: quién atendió qué y cuándo es justamente
        // lo que hay que poder reconstruir después. La hora y el vencimiento los pone la base, y
        // también rechaza la toma si otra persona llegó antes: en ese caso se recarga y la pantalla
        // muestra quién la tiene.
        const { error } = await supabase.from(TABLA).insert({
          prestadora_id: prestadoraId,
          tipo,
          referencia_id: referenciaId,
          tomada_por: usuarioId,
        });
        if (error) console.error(error);
        await recargar();
      } finally {
        setTrabajando(null);
      }
    },
    [prestadoraId, recargar],
  );

  const soltar = useCallback(
    async (toma) => {
      setTrabajando(toma.referencia_id);
      try {
        const { error } = await supabase
          .from(TABLA)
          .update({ soltada_at: new Date().toISOString() })
          .eq('id', toma.id);
        if (error) throw error;
        await recargar();
      } finally {
        setTrabajando(null);
      }
    },
    [recargar],
  );

  return { regla, tomaDe, laTieneOtraPersona, tomadasDe, tomar, soltar, recargar, trabajando };
}
