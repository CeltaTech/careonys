import { Router } from 'express';
import { supabase } from '../db/connection.js';
import { prestadora-original_PRESTADORA_ID } from '../db/tenantTemporal.js';

export const configuracionPublicaRouter = Router();

// Sin auth a propósito: el sitio público (sin login) necesita estos datos para no
// hardcodear teléfono/email/zonas (regla 1 de CLAUDE.md). Nunca expone nada de
// escalas_legales ni datos internos — solo lo que ya es público en el sitio.
// `configuracion_empresa` es un singleton (id=1) sin columna de tenant todavía — fuera de
// alcance de este bloque (Bloque 4). `zonas_cobertura` sí la tiene y sí necesita filtro acá.
configuracionPublicaRouter.get('/', async (req, res) => {
  const [{ data: empresa, error: errorEmpresa }, { data: zonas, error: errorZonas }] = await Promise.all([
    supabase.from('configuracion_empresa').select('nombre, telefono, whatsapp_numero, email, dominio, zona_cobertura_texto').eq('id', 1).single(),
    supabase.from('zonas_cobertura').select('codigo, nombre, categoria').eq('activa', true).eq('prestadora_id', prestadora-original_PRESTADORA_ID).order('orden'),
  ]);

  if (errorEmpresa || errorZonas) {
    return res.status(500).json({ error: (errorEmpresa || errorZonas).message });
  }

  res.json({ empresa, zonas });
});
