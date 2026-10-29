// La conexión de los programas de siembra: sólo contra la base local.
//
// La dirección y la llave salen de `supabase status`, que describe la base que corre en esta
// máquina. La llave de la nube no se lee nunca, así que no hay forma de apuntar estos programas a
// la nube; y si `supabase status` contestara con una dirección que no es de esta máquina, se
// plantan. La llave local es la misma en toda instalación local de Supabase y no abre nada fuera
// de esta máquina.

import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// La Sandbox de `supabase/seed.sql`, la Organización de pruebas de la base local.
export const PRESTADORA_LOCAL = '11111111-1111-4111-8111-111111111111';

export function conexionLocal() {
  let estado;
  try {
    estado = JSON.parse(execFileSync('npx', ['supabase', 'status', '-o', 'json'], {
      cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], shell: process.platform === 'win32',
    }));
  } catch {
    console.error('No se encontró la base local. Levántela con `npx supabase start` y vuelva a correr el programa.');
    process.exit(1);
  }
  const { hostname } = new URL(estado.API_URL);
  if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(hostname)) {
    console.error('La base que contestó no es la de esta máquina. El programa no siembra nada.');
    process.exit(1);
  }
  return createClient(estado.API_URL, estado.SERVICE_ROLE_KEY);
}
