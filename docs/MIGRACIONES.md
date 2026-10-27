# Migraciones — cómo se cambia la base de datos de Careonys

> Regla corta: **la base nunca se toca a mano.** Todo cambio de esquema es un archivo nuevo en
> `supabase/migrations/`, y la base se puede reconstruir desde cero corriendo esos archivos en
> orden.

Vigente desde el **2026-07-28**. Es el paso 2 de la Etapa 0 de
`celtatech/docs/PLAN_SEPARACION_CELTATECH.md`.

## 1. La foto de la base

La migración inicial es una **foto fiel al esquema real de producción**. Hoy la foto vigente es:

```
supabase/migrations/20261016000000_foto_de_la_base.sql
```

Detrás de ella vienen, en orden, los cambios que se aplicaron después: el 2026-10-27 la carpeta
tiene 125 archivos, la foto incluida. Ese mismo día la base en vivo tiene 207 tablas en `public`,
con 1959 columnas; 609 políticas de seguridad sobre esas tablas y 37 sobre los depósitos de
archivos; 229 funciones propias, 83 en `public` y 146 en `interno`; 185 disparadores y 600
índices en `public`; y 12 depósitos de archivos. La foto trae además las filas de los catálogos
que el producto trae de fábrica. No es lo que alguien quiso hacer: es lo que había.

### Cuándo se saca una foto nueva

Cuando la carpeta se llenó de archivos ya aplicados en producción y estorba más de lo que
documenta. **No se borran de a uno**: la carpeta entera es la receta para armar la base desde
cero y, si falta una hoja, la receta no se puede seguir. Se saca una foto del resultado
(`supabase migration squash`), esa foto queda como único archivo y los viejos se borran juntos.

Tres cosas que hay que saber antes de hacerlo:

- **La foto trae el esquema, no las filas.** `supabase migration squash` vuelca la estructura y
  nada más: toda alta de datos que hubiera en las migraciones viejas se pierde en silencio. Las
  filas del catálogo de la plataforma —módulos, acciones de permisos, advertencias legales,
  textos de consentimiento, tipos de Asistente, el depósito de logos— hay que volver a escribirlas
  a mano al final del archivo, leyéndolas de la base real, y comprobar después que volvieron.
- **El archivo conserva el número de la última migración de la tanda.** Supabase reconoce una
  migración por los 14 dígitos y nada más, así que el texto del nombre se puede cambiar sin
  romper nada, pero el número no.
- **La libreta de apuntes de producción queda desfasada y hay que corregirla**, con
  `supabase migration repair --status reverted` para cada número que desaparece y
  `--status applied` para el que queda. Después, `supabase migration list --linked` tiene que
  mostrar una sola línea con las dos columnas iguales.

## 2. Dónde vive el esquema

**La única fuente del esquema son `supabase/migrations/` y la base real.** Fuera de esa carpeta
no se guarda ningún archivo `.sql` de esquema: todo cambio, sin excepción, va ahí, y se ejecuta
en orden de nombre. (La única excepción es `supabase/seed.sql`, que no crea ni modifica
estructura: solo carga filas de prueba en la base local.)

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
