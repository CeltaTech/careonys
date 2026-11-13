// Lo que el software de cobranzas informó de cada acceso de Match, resumido para la lista de
// Clientes del Panel.
//
// El producto no anota cobros por su cuenta: cada fila de `cobros_intermediacion` es un aviso que
// llegó de afuera. De esas filas salen dos datos por acceso:
//
// - el estado del cobro, que es el del aviso más reciente (el del período más nuevo y, dentro del
//   mismo período, el último que llegó): si el último intento falló, eso es lo que hay que ver,
//   aunque antes haya habido cobros buenos;
// - el último cobro, que es el exitoso más reciente, con su fecha, su importe y su moneda.

function masReciente(a, b) {
  const periodoA = String(a.periodo ?? '');
  const periodoB = String(b.periodo ?? '');
  if (periodoA !== periodoB) return periodoA > periodoB ? a : b;
  return String(a.created_at ?? '') >= String(b.created_at ?? '') ? a : b;
}

/**
 * @param {Array<{acceso_id: string, estado_cobro: string, fecha_cobro: string|null, monto: number,
 *   moneda: string|null, periodo: string, created_at: string}>} cobros
 * @returns {Map<string, {estado_cobro: string, ultimo_cobro: null | {fecha_cobro: string|null,
 *   monto: number, moneda: string|null, periodo: string}}>}
 */
export function estadoDeCobroDeCadaAcceso(cobros) {
  const ultimoAviso = new Map();
  const ultimoExitoso = new Map();
  for (const c of cobros ?? []) {
    if (!c?.acceso_id) continue;
    const previo = ultimoAviso.get(c.acceso_id);
    ultimoAviso.set(c.acceso_id, previo ? masReciente(previo, c) : c);
    if (c.estado_cobro === 'exitoso') {
      const previoExitoso = ultimoExitoso.get(c.acceso_id);
      ultimoExitoso.set(c.acceso_id, previoExitoso ? masReciente(previoExitoso, c) : c);
    }
  }

  const resultado = new Map();
  for (const [accesoId, aviso] of ultimoAviso) {
    const exitoso = ultimoExitoso.get(accesoId);
    resultado.set(accesoId, {
      estado_cobro: aviso.estado_cobro,
      ultimo_cobro: exitoso
        ? { fecha_cobro: exitoso.fecha_cobro ?? null, monto: exitoso.monto, moneda: exitoso.moneda ?? null, periodo: exitoso.periodo }
        : null,
    });
  }
  return resultado;
}
