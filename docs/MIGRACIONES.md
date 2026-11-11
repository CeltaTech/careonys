# Migraciones — cómo se cambia la base de datos de Careonys

> Regla corta: **la base nunca se toca a mano.** Todo cambio de esquema es un archivo nuevo en
> `supabase/migrations/`, y la base se puede reconstruir desde cero corriendo esos archivos en
> orden.

Vigente desde el **2026-07-28**. Es el paso 2 de la Etapa 0 de
`celtatech/docs/PLAN_SEPARACION_CELTATECH.md`.

## 1. La foto de la base

La migración inicial es una **foto fiel al esquema real de producción**. Hoy la foto vigente es:

```
supabase/migrations/20270323000000_foto_de_la_base.sql
```

Reemplaza a las 196 migraciones que se habían apilado hasta ella. Al sacarla, la base en vivo
tenía 221 tablas en `public`, con 2094 columnas; 696 políticas de seguridad sobre esas tablas y 53
sobre los depósitos de archivos; 306 funciones propias, 110 en `public` y 196 en `interno`; 210
disparadores y 644 índices en `public`; y 13 depósitos de archivos. La foto trae además las filas
de los 31 catálogos que el producto trae de fábrica y las de los 13 depósitos. No es lo que
alguien quiso hacer: es lo que había.

**Cómo se comprobó.** Se reconstruyó la base local desde cero con la foto sola y se la comparó,
objeto por objeto —tablas, columnas, políticas, funciones, disparadores, índices, permisos—,
contra la base en vivo, y fila por fila en los catálogos. Las únicas diferencias son piezas que
la plataforma pone de un lado y no del otro: los disparadores internos del depósito de archivos y
la extensión `pg_net`.

### Cuándo se saca una foto nueva

Cuando la carpeta se llenó de archivos ya aplicados en producción y estorba más de lo que
documenta. **No se borran de a uno**: la carpeta entera es la receta para armar la base desde
cero y, si falta un paso, la receta no se puede seguir. Se saca una foto del resultado
(`supabase migration squash`), esa foto queda como único archivo y los viejos se borran juntos.

Cuatro cosas que hay que saber antes de hacerlo:

- **La foto trae el esquema, no las filas.** `supabase migration squash` vuelca la estructura y
  nada más: toda alta de datos que hubiera en las migraciones viejas se pierde en silencio. Las
  filas del catálogo de la plataforma —acciones de permisos, advertencias legales, textos de
  consentimiento, tipos de Asistente, los depósitos de archivos— hay que volver a escribirlas al
  final del archivo, leyéndolas de la base real, y comprobar después que volvieron.
- **La foto no trae los roles propios ni retira lo que regala la plataforma.** Los roles
  `trabajo_sin_persona` y `copia_de_respaldo` no viven en ningún esquema, así que se crean al
  principio del archivo. Y la plataforma les da todo, sobre cada tabla nueva de `public`, a `anon`,
  `authenticated` y `service_role`: se les retira antes de crear las tablas, porque la foto
  después escribe los permisos de cada una y no saca los que sobran.
- **El archivo conserva el número de la última migración de la tanda.** Supabase reconoce una
  migración por los 14 dígitos y nada más, así que el texto del nombre se puede cambiar sin
  romper nada, pero el número no.
- **La libreta de apuntes de producción queda desfasada y hay que corregirla**, con
  `supabase migration repair --status reverted` para cada número que desaparece y
  `--status applied` para el que queda. Después, `supabase migration list --linked` tiene que
  mostrar una sola línea con las dos columnas iguales.

## 2. Dónde vive el esquema

**Cómo es la base hoy lo dice un solo archivo: `supabase/schemas/careonys.sql`, el esquema
declarado.** Es la foto sin las filas de fábrica. `supabase/config.toml` lo nombra en
`schema_paths`, y así la herramienta de Supabase lo reconoce.

**Un cambio de estructura se escribe primero ahí**, y la migración sale sola de comparar ese
archivo con la base local:

```bash
supabase db diff --local -f el_paciente_guarda_su_grupo_sanguineo
```

Eso deja el archivo nuevo en `supabase/migrations/`, que se revisa, se le escribe la cabecera
(§4) y se aplica como cualquier otra. Las filas de fábrica no se declaran: van en una migración
escrita a mano.

**Los dos tienen que decir lo mismo.** Con la base local reconstruida desde las migraciones,

```bash
supabase db diff --local
```

tiene que contestar `No schema changes found`. Si contesta otra cosa, uno de los dos se despegó.
Y cuando se saca una foto nueva (§1), el esquema declarado se vuelve a sacar de ella.

Fuera de esas dos carpetas no se guarda ningún archivo `.sql` de esquema. (La única excepción es
`supabase/seed.sql`, que no crea ni modifica estructura: solo carga filas de prueba en la base
local.)

Las reglas que valen para toda migración —una aplicada no se edita, corre entera o no corre, el
orden de los archivos es el de aplicación, y el permiso de tabla no es la RLS— están en
`celtatech/CLAUDE.md`, en «La base de datos: sólo por migraciones».

## 3. Cómo se llama un archivo

```
supabase/migrations/AAAAMMDDHHMMSS_descripcion_en_snake_case.sql
```

Ejemplo: `20261020093000_el_paciente_guarda_su_grupo_sanguineo.sql`

Los 14 dígitos son fecha y hora en UTC. Es el formato que espera la herramienta de línea de
comandos de Supabase.

## 4. Qué lleva adentro

Toda migración empieza con un comentario de cabecera que diga **qué hace y por qué**, no solo
qué tablas toca. Dentro de seis meses el "por qué" es lo único que no se puede reconstruir
leyendo el esquema. Si el cambio borra algo, la cabecera dice además **qué se comprobó antes**
de borrarlo y **cómo se vuelve atrás**.

Y toda migración que crea una tabla, en el mismo archivo:

- activa RLS (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`) — «RLS estricta en toda tabla y todo
  depósito de archivos nuevo», de `celtatech/CLAUDE.md`;
- crea sus políticas;
- otorga a `authenticated` los permisos de tabla que sus políticas usan, y ninguno más (ver §5);
- deja `NOTIFY pgrst, 'reload schema';` al final si se aplicó directo contra Supabase, porque
  sin eso la API puede devolver 404 en tablas que sí existen.

Una tabla sin RLS no se sube. No hay caso en el que "después la agrego".

**Y no depende de acordarse: lo comprueban dos automatismos en cada push.**

- `scripts/verificar_proteccion_por_fila.mjs` lee el esquema declarado y falla si una tabla de
  `public` no tiene la protección por fila encendida o no tiene ninguna política, o si un depósito
  de archivos no aparece en ninguna política. Corre sin base y sin dependencias, así que se corre
  también antes de `supabase db push --linked`:

  ```bash
  node scripts/verificar_proteccion_por_fila.mjs
  ```

- `scripts/probar_aislamiento_en_la_base.mjs` levanta la base desde cero con la siembra y lee
  cada tabla con cada cuenta sembrada de las dos Prestadoras de prueba, **sin ningún filtro de
  Prestadora**. Una sola fila ajena la hace fallar. Falla también si no puede fallar: si alguna
  Prestadora no tiene filas, si una cuenta de administración no ve nada propio, o si al apagarle
  a propósito la protección a una tabla no encuentra la filtración. Con la base local levantada:

  ```bash
  node scripts/probar_aislamiento_en_la_base.mjs
  ```

Los dos tienen su automatismo en `.github/workflows/`.

## 5. Qué permisos abre cada migración

**Todo lo nuevo nace cerrado.** Los permisos por defecto de la base no le dan nada a
`authenticated` ni a `anon`: ni sobre tablas, vistas y contadores de `public`, ni sobre
funciones, de ningún esquema. Así que cada migración dice a quién le abre lo que crea:

- **Una tabla:** `GRANT SELECT, INSERT, UPDATE, DELETE` a `authenticated` sólo de lo que tiene
  política que lo respalde. Una escritura sin política no lleva permiso: así la base contesta
  `42501` en vez de negar en silencio. `TRUNCATE`, `TRIGGER` y `REFERENCES` no se dan nunca —
  `TRUNCATE` vacía la tabla entera sin pasar por la RLS.
- **Una vista:** `GRANT SELECT` y nada más.
- **Una tabla que guarda secretos** —códigos, credenciales, contraseñas de terceros—: ningún
  permiso. La lee y la escribe sólo el backend.
- **Una función que usa una política o un disparador sin privilegio de dueño:** `GRANT EXECUTE` a
  `authenticated`, y vive en `interno`. Sin eso, la tabla que la llama falla con
  `42501 permission denied for function`.
- **Una función que necesita el trabajo sin persona:** `GRANT EXECUTE` a `trabajo_sin_persona`.

Qué tiene cada rol se mira en la base, no acá: `information_schema.role_table_grants` para las
tablas, y `has_function_privilege` para las funciones.

## 6. Cómo se aplican

**En la máquina propia**, para desarrollar y probar. Desde
`F:\proyectos\celtatech\productos\careonys`:

```bash
supabase start
```

Levanta Postgres, Auth y PostgREST en contenedores y aplica todas las migraciones en orden. Para
volver a cero y aplicar todo de nuevo:

```bash
supabase db reset
```

Los puertos locales de Careonys son los `446xx` (API en 44621, base en 44622, Studio en 44623),
distintos a propósito de los del panel de CeltaTech, para que los dos puedan estar levantados al
mismo tiempo sin pisarse. Están fijados en `supabase/config.toml`.

**Quedan debajo del 49152 a propósito.** Del 49152 para arriba Windows aparta tramos enteros para
sí, y cuáles aparta cambia de un arranque a otro: un puerto de ahí que hoy anda mañana deja la
base sin levantar, con un mensaje que culpa a otra cosa. Debajo de ese número no aparta nada. Para
ver qué tiene apartado:

```bash
netsh interface ipv4 show excludedportrange protocol=tcp
```

**La primera vez en cada máquina, la base local necesita su clave de firma.** Sin ella el backend
no puede entrar con la credencial de las tareas, y no corre ninguna. La genera:

```bash
node scripts/clave_de_firma_local.mjs
```

Deja la misma clave en `supabase/signing_keys.json` y en `backend/.env`, los dos ignorados por el
repositorio, y no la muestra. Después hay que bajar y volver a levantar la base.

**Contra producción.** Desde la misma carpeta:

```bash
supabase db push --linked
```

Aplica únicamente las migraciones que la base todavía no tiene. Para ver antes qué falta:

```bash
supabase migration list --linked
```

Muestra dos columnas, local y remoto. Si las dos coinciden, no hay nada pendiente.

**No se pega SQL en el editor del panel de Supabase.** Deja la base cambiada y el repositorio sin
enterarse.

## 7. Reconstruir desde cero

Correr todos los archivos de `supabase/migrations/` en orden sobre una base vacía tiene que dar
exactamente el esquema de producción. Si algún día deja de dar, hay una migración que se editó
después de aplicarse, o un cambio que se hizo a mano. Las dos cosas son defectos, no accidentes.

**Principio de certeza aplicado a esto:** no se declara que una migración funciona porque el
archivo "se ve bien". Se corre contra un Supabase de verdad —el local alcanza— y se compara el
resultado contra lo que se esperaba. Fue así como se validó la foto inicial, y así se validan
las que vengan.
