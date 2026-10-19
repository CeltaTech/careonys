// ORIGINAL. Las copias de `pwa-clientes/` y `pwa-asistentes/` se regeneran con
// `scripts/sincronizar_copias.mjs` y nunca se editan a mano.
//
// El mensaje emergente: la tercera forma de alerta, la que se usa cuando algo salió bien y no
// queda nada por hacer. Aparece abajo, en una línea, y se va solo.
//
// UN SOLO PUNTO DE LLAMADA: `avisar(texto)`, desde cualquier lugar, sin pasar nada por props ni
// por contexto. Y UN SOLO LUGAR DONDE SE DIBUJA: `<MensajeEmergente />`, montado una vez en la
// raíz de cada producto. El texto lo trae quien llama, sacado del catálogo de traducciones.
//
// Está escrito sin JSX para que las pruebas de las aplicaciones, que corren con `node --test`
// sin ninguna herramienta de armado, lo puedan importar tal cual. Cómo se ve no está acá: cada
// producto lo dibuja con sus propios tonos, en su hoja de estilos, sobre las clases
// `mensaje-emergente-zona` y `mensaje-emergente`.

import { createElement, useSyncExternalStore } from 'react';

export const DURACION_MS = 4000;

let actual = null;
let temporizador = null;
let numero = 0;
const oyentes = new Set();

function anunciar() {
  for (const oyente of oyentes) oyente();
}

function suscribir(oyente) {
  oyentes.add(oyente);
  return () => oyentes.delete(oyente);
}

function leer() {
  return actual;
}

// Un mensaje nuevo reemplaza al que estaba y vuelve a contar los cuatro segundos desde cero:
// dos avisos seguidos no se apilan, se ve el último.
export function avisar(texto) {
  if (typeof texto !== 'string' || texto.trim() === '') return;
  numero += 1;
  actual = { texto, numero };
  if (temporizador) clearTimeout(temporizador);
  temporizador = setTimeout(() => {
    temporizador = null;
    actual = null;
    anunciar();
  }, DURACION_MS);
  anunciar();
}

// La zona queda siempre puesta, aunque esté vacía: un lector de pantalla anuncia lo que cambia
// adentro de una zona que ya conocía, y no lo que llega junto con la zona.
export function MensajeEmergente() {
  const mensaje = useSyncExternalStore(suscribir, leer, leer);
  return createElement(
    'div',
    { className: 'mensaje-emergente-zona', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' },
    mensaje ? createElement('div', { key: mensaje.numero, className: 'mensaje-emergente' }, mensaje.texto) : null,
  );
}
