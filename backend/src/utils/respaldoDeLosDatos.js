/* La copia nocturna de los datos, de a una Prestadora por vez.
   ==============================================================

   Cada Prestadora tiene su propio archivo de respaldo, con sus filas y nada más. Lo arma la cuenta
   automática de la copia de respaldo de esa Prestadora, que sólo puede llamar a dos funciones de
   la base: `tablas_del_respaldo`, que dice qué tablas entran, y `filas_del_respaldo`, que entrega
   las filas de una tabla de a tramos. Las dos ponen el filtro adentro —la Prestadora del pase— y
   no reciben ninguna. No hay ninguna cuenta que copie la base entera.

   Entran la fila de la propia Prestadora, todas las tablas que tienen la columna de la Prestadora
   —una tabla nueva entra sola— y las cuentas de entrada de su gente. La estructura de la base no:
   esa la reconstruyen las migraciones.

   EL ARCHIVO SUBE CIFRADO con la clave de esa Prestadora (`cifradoDeLosRespaldos.js`), comprimido,
   a los dos depósitos de respaldo: `datos/<prestadora>/<código>_datos_<fecha>.json.gz.age`. Una
   Prestadora sin clave no se respalda, y el respaldo termina con error.

   UNO POR DÍA. Corre al arrancar el backend y después una vez por día; si los dos depósitos ya
   tienen el de hoy de una Prestadora, esa Prestadora no se vuelve a leer.

   CUÁNTO SE GUARDA lo decide `retencionDeRespaldos.js`. Una falla al borrar lo viejo se anota y
   no tumba el respaldo: lo que importa es que el nuevo esté arriba.

   EN EL REGISTRO, CANTIDADES. Ninguna fila, ningún nombre. */

import { gzipSync } from 'node:zlib';
import { paraCadaPrestadora } from '../db/connection.js';
import { IDENTIDAD } from '../config/identidadProducto.js';
import { cifradorDeLaPrestadora } from './cifradoDeLosRespaldos.js';
import { losDestinos } from './copiaDeLosArchivos.js';
import { respaldosQueSeBorran } from './retencionDeRespaldos.js';

const TRAMO = 1000;

/** Todas las filas de una Prestadora, tabla por tabla, con la conexión de su copia de respaldo. */
export async function leerLosDatos(conexion) {
  const { data: tablas, error } = await conexion.rpc('tablas_del_respaldo');
  if (error) throw new Error(`No se pudo saber qué tablas copiar: ${error.message}`);
  if (!Array.isArray(tablas) || tablas.length === 0) throw new Error('La base no devolvió ninguna tabla para copiar');

  const datos = {};
  for (const tabla of tablas) {
    const filas = [];
    for (let desde = 0; ; desde += TRAMO) {
      const { data, error: e } = await conexion.rpc('filas_del_respaldo', { p_tabla: tabla, p_desde: desde, p_cantidad: TRAMO });
      if (e) throw new Error(`No se pudo copiar ${tabla}: ${e.message}`);
      const tramo = Array.isArray(data) ? data : [];
      filas.push(...tramo);
      if (tramo.length < TRAMO) break;
    }
    datos[tabla] = filas;
  }
  return datos;
}

function claveDelRespaldo(prestadoraId, ahora) {
  const fecha = ahora.toISOString().replace(/[:.]/g, '-');
  return `datos/${prestadoraId}/${IDENTIDAD.codigo}_datos_${fecha}.json.gz.age`;
}

async function borrarLoVencido(destino, prestadoraId, ahora, avisar) {
  if (typeof destino.listar !== 'function' || typeof destino.borrar !== 'function') return 0;
  const carpeta = `datos/${prestadoraId}/`;
  const claves = await destino.listar(carpeta);
  const nombres = claves.map((c) => c.slice(carpeta.length));
  let borrados = 0;
  for (const nombre of respaldosQueSeBorran(nombres, IDENTIDAD.codigo, ahora)) {
    try {
      await destino.borrar(carpeta + nombre);
      borrados += 1;
    } catch (err) {
      avisar(`No se pudo borrar un respaldo vencido: ${err.message}`);
    }
  }
  return borrados;
}

async function yaEstaElDeHoy(destinos, prestadoraId, ahora) {
  if (!destinos.every((d) => typeof d.listar === 'function')) return false;
  const hoy = `${IDENTIDAD.codigo}_datos_${ahora.toISOString().slice(0, 10)}`;
  for (const destino of destinos) {
    const claves = await destino.listar(`datos/${prestadoraId}/`);
    if (!claves.some((c) => c.slice(c.lastIndexOf('/') + 1).startsWith(hoy))) return false;
  }
  return true;
}

/**
 * Respalda los datos de cada Prestadora, de a una, a los dos depósitos. Falla —y lo dice en el
 * registro— si alguna Prestadora no se pudo respaldar, después de haber intentado con todas.
 */
export async function respaldarLosDatos({ destinos = losDestinos(), avisar = (t) => console.log(t), claves, ahora = new Date() } = {}) {
  const total = { prestadoras: 0, respaldadas: 0, yaEstaban: 0, falladas: 0, filas: 0, vencidosBorrados: 0 };
  await paraCadaPrestadora('copia_de_respaldo', async (prestadoraId, conexion) => {
    total.prestadoras += 1;
    try {
      // Primero la clave: sin ella no se lee nada.
      const cifrar = cifradorDeLaPrestadora(prestadoraId, claves);
      if (await yaEstaElDeHoy(destinos, prestadoraId, ahora)) {
        total.yaEstaban += 1;
        return;
      }
      const datos = await leerLosDatos(conexion);
      const contenido = {
        producto: IDENTIDAD.codigo,
        prestadora: prestadoraId,
        hecho_en: ahora.toISOString(),
        tablas: datos,
      };
      const cuerpo = await cifrar(gzipSync(Buffer.from(JSON.stringify(contenido))));
      const clave = claveDelRespaldo(prestadoraId, ahora);
      for (const destino of destinos) await destino.subir(clave, cuerpo);
      total.respaldadas += 1;
      total.filas += Object.values(datos).reduce((n, filas) => n + filas.length, 0);

      for (const destino of destinos) {
        try {
          total.vencidosBorrados += await borrarLoVencido(destino, prestadoraId, ahora, avisar);
        } catch (err) {
          avisar(`No se pudieron revisar los respaldos vencidos: ${err.message}`);
        }
      }
    } catch (err) {
      total.falladas += 1;
      throw err;
    }
  }, { rol: 'copia_de_respaldo' });
  avisar(
    `Datos: ${total.prestadoras} Prestadoras, ${total.respaldadas} respaldadas, ${total.yaEstaban} ya estaban, ${total.falladas} falladas, `
    + `${total.filas} filas, ${total.vencidosBorrados} respaldos vencidos borrados.`,
  );
  if (total.falladas > 0) throw new Error(`${total.falladas} Prestadoras no se pudieron respaldar.`);
  return total;
}
