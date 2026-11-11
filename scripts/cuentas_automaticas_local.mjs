// ---------------------------------------------------------------------------
// cuentas_automaticas_local.mjs — las cuentas automáticas en la base local
//
// Uso, desde la raíz del producto, con la base local levantada:
//   node scripts/cuentas_automaticas_local.mjs
//
// POR QUÉ EXISTE. El backend entra a la base con una cuenta automática por Prestadora, con correo
// y contraseña (`backend/src/db/connection.js`), y el pase lo arma la base con
// `interno.armar_el_pase`. La base local nace sin esas cuentas, así que en la máquina de trabajo
// no correría ninguna tarea programada.
//
// QUÉ DEJA Y DÓNDE. A cada Prestadora de la base local que no tenga sus tres cuentas —la del
// trabajo, la de la copia de respaldo y la de la importación de planillas— se las crea, y también
// la que sólo pide la lista. Las contraseñas van a `CONTRASENAS_DE_LAS_CUENTAS_AUTOMATICAS` de
// `backend/.env`, que el repositorio ignora. Se puede correr otra vez después de un
// `supabase db reset` o de sembrar una Prestadora nueva: sólo crea las que faltan.
//
// NINGÚN VALOR SE MUESTRA. Ni en la pantalla, ni como argumento de otro programa.
// ---------------------------------------------------------------------------

import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENTORNO_DEL_BACKEND = join(RAIZ, 'backend', '.env');
const VARIABLE = 'CONTRASENAS_DE_LAS_CUENTAS_AUTOMATICAS';
const DOMINIO = 'cuentas-automaticas.invalid';
// El contenedor de la base local lleva el nombre del proyecto de `supabase/config.toml`.
const PROYECTO = readFileSync(join(RAIZ, 'supabase', 'config.toml'), 'utf8').match(/^project_id\s*=\s*"([^"]+)"/m)[1];
const CONTENEDOR = `supabase_db_${PROYECTO}`;

// La consulta entra por la entrada estándar, nunca como argumento.
const base = (texto) => execFileSync('docker', ['exec', '-i', CONTENEDOR, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-qAt'], {
  input: texto, encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'],
}).trim();

// Las letras con tilde viajan escritas por su número, para que la consola de Windows no las cambie.
const unicode = (s) => `U&'${[...s].map((ch) => ch.charCodeAt(0) > 127 ? '\\' + ch.charCodeAt(0).toString(16).padStart(4, '0') : ch).join('')}'`;

const entorno = existsSync(ENTORNO_DEL_BACKEND) ? readFileSync(ENTORNO_DEL_BACKEND, 'utf8') : '';
const renglonAnterior = entorno.match(new RegExp(`^${VARIABLE}=(.*)$`, 'm'));
const contrasenas = renglonAnterior ? JSON.parse(renglonAnterior[1]) : {};

const existentes = new Set(base('select u.email from interno.cuentas_automaticas c join auth.users u on u.id = c.id').split('\n').filter(Boolean));
const prestadoras = base('select id from public.prestadoras order by id').split('\n').filter(Boolean);

const cuentas = [{ email: `lista@${DOMINIO}`, prestadora: null, rol: 'trabajo_sin_persona', trabajo: null }];
for (const p of prestadoras) {
  cuentas.push({ email: `trabajo-${p}@${DOMINIO}`, prestadora: p, rol: 'trabajo_sin_persona', trabajo: null });
  cuentas.push({ email: `copia-${p}@${DOMINIO}`, prestadora: p, rol: 'copia_de_respaldo', trabajo: null });
  cuentas.push({ email: `importacion-${p}@${DOMINIO}`, prestadora: p, rol: 'trabajo_sin_persona', trabajo: 'importación de planillas' });
}

let creadas = 0;
for (const c of cuentas) {
  // Una cuenta que existe pero cuya contraseña se perdió se vuelve a crear con otra.
  if (existentes.has(c.email) && contrasenas[c.email]) continue;
  if (existentes.has(c.email)) base(`delete from auth.users where email = '${c.email}'`);
  const contrasena = crypto.randomBytes(32).toString('base64url');
  base(`with u as (
      insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,confirmation_token,recovery_token,email_change_token_new,email_change,email_change_token_current,phone_change,phone_change_token,reauthentication_token)
      values ('00000000-0000-0000-0000-000000000000',gen_random_uuid(),'authenticated','authenticated','${c.email}',extensions.crypt('${contrasena}', extensions.gen_salt('bf', 10)),now(),now(),now(),'{"provider":"email","providers":["email"]}','{}','','','','','','','','') returning id),
    i as (insert into auth.identities (id,user_id,provider_id,identity_data,provider,created_at,updated_at,last_sign_in_at)
      select gen_random_uuid(), id, id::text, jsonb_build_object('sub',id::text,'email','${c.email}','email_verified',true),'email',now(),now(),now() from u returning 1)
    insert into interno.cuentas_automaticas (id,prestadora_id,rol,trabajo)
      select id, ${c.prestadora ? `'${c.prestadora}'` : 'null'}, '${c.rol}', ${c.trabajo ? unicode(c.trabajo) : 'null'} from u`);
  contrasenas[c.email] = contrasena;
  creadas += 1;
}

const renglon = `${VARIABLE}=${JSON.stringify(contrasenas)}`;
writeFileSync(ENTORNO_DEL_BACKEND, renglonAnterior
  ? entorno.replace(renglonAnterior[0], renglon)
  : entorno + (entorno && !entorno.endsWith('\n') ? '\n' : '') + renglon + '\n');

console.log(`Cuentas automáticas en la base local: ${cuentas.length}, de las cuales ${creadas} recién creadas.`);
