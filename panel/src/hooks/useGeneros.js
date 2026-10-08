import { useCatalogo } from './useCatalogo';
import { usePaisDeLaPrestadora } from './usePaisDeLaPrestadora';

/* Los géneros que se pueden elegir para una persona física, en el país de la Prestadora.
   La lista sale de la base; lo que se lee en pantalla es la traducción de cada código. */
export function useGeneros(prestadoraId) {
  const { pais, estado: estadoPais, error: errorPais, recargar: recargarPais } = usePaisDeLaPrestadora(prestadoraId);

  const { filas, estado: estadoCatalogo, error: errorCatalogo, recargar: recargarCatalogo } = useCatalogo(
    'catalogo_generos',
    { columnas: 'codigo', filtros: { pais, activo: true }, requiere: [pais] },
  );

  return {
    generos: filas,
    estado: estadoPais === 'listo' ? estadoCatalogo : estadoPais,
    error: errorPais || errorCatalogo,
    recargar: () => {
      recargarPais();
      recargarCatalogo();
    },
  };
}
