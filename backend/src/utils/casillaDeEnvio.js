import { direccionRemitente } from './email.js';

// La dirección desde la que manda cada Prestadora.
//
// Cada Prestadora manda sus mensajes desde una dirección suya bajo el dominio del producto
// —`cuidadosdellitoral@careonys.com`—, que sólo manda: las respuestas se reenvían a la casilla
// que ella declaró (`docs/MARCA.md`, sección 0). Acá se decide cómo se llama esa casilla.
//
// Se fija una sola vez, al darla de alta, y no cambia nunca: es la dirección que va a quedar
// guardada en el buzón de cada Cliente y de cada Asistente que alguna vez recibió un correo.
//
// Sale del código de la Prestadora, que no elige Careonys: lo elige CeltaTech y llega con el alta
// (`docs/PLAN_HASTA_PRODUCCION.md`, paso 111). Ese código ya es único, así que la casilla no
// necesita mirar las de las demás Prestadoras.

// Quita los acentos y deja sólo lo que puede vivir a la izquierda de una arroba sin traer
// problemas: letras sin marca, números y guiones. No intenta abarcar todo lo que la norma
// permite; apunta a una dirección que alguien pueda dictar por teléfono.
export function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
}

// La parte izquierda de la dirección común del producto. La casilla de una Prestadora no puede
// ser esa misma, porque entonces dos remitentes distintos serían la misma dirección. Se compara
// contra lo que está configurado y no contra una lista escrita acá.
function casillaDeLaDireccionComun() {
  const [local] = String(direccionRemitente() ?? '').split('@');
  return normalizar(local);
}

// Devuelve el nombre de la casilla, o `null` si el código no da ninguna. `null` no es una falla
// del alta: esa Prestadora manda desde la dirección común del producto, y eso se avisa en el Panel.
//
// La dirección entera —el nombre con el dominio— la arma `utils/email.js`, que es donde vive el
// dominio del producto. Acá sólo se decide cómo se llama.
export function casillaDeEnvioDelCodigo(codigo) {
  const casilla = normalizar(codigo);
  if (!casilla || casilla === casillaDeLaDireccionComun()) return null;
  return casilla;
}
