# PLAN_CONTINUIDAD_PROVEEDORES.md — Resguardos ante caída o salida de un proveedor

> Este documento cubre qué se hace si hay que dejar el servicio de identidad de Supabase o alguno
> de los proveedores de bajo riesgo: Railway, Cloudflare Pages, Resend y GitHub. El respaldo de la base y de los archivos, y su prueba de
> restauración, están en `docs/SECURITY.md`, «Portabilidad de datos». La copia en caliente del
> servicio de identidad queda afuera: se discute aparte y no está recomendada (ver cierre).

## Plan de migración de Supabase Auth (documentado, no ejecutado)

Este plan es para el caso de que Supabase deje de ser viable como proveedor de
autenticación (cierre de cuenta, cambio de precios, discontinuación del servicio). Hoy
**no hay ninguna decisión de migrar** — esto es solo el plan a seguir si algún día hiciera
falta, para no empezar de cero en el peor momento posible.

### Qué hay que exportar de Supabase Auth

- Lista de usuarios: email, `id` (UUID), rol (`usuarios.rol` en la tabla propia del
  proyecto, no en Supabase Auth), fecha de alta, estado (activo/deshabilitado).
- **Los identificadores de verificación de las contraseñas NO son exportables ni migrables tal cual** — Supabase Auth
  usa bcrypt con su propia configuración interna, y ningún proveedor externo (Auth0,
  Clerk) ni un esquema JWT propio puede re-verificar esos identificadores sin acceso al mismo
  algoritmo exacto. Esto no es una limitación técnica que se pueda evitar con más
  trabajo: es así en cualquier migración de un proveedor de auth a otro.
- **Consecuencia obligatoria de cualquier migración real:** todas las cuentas
  (hoy: Superadmin, Admin_prestadora, Coordinador, Asistente y Cliente — los valores de
  `usuarios.rol`) tendrían que restablecer su contraseña la primera vez que entren al sistema nuevo. Esto se
  comunica por email antes del corte, no es un detalle a resolver en el momento.

### Alternativas de reemplazo (ninguna decidida — para evaluar si el caso se da)

| Opción | A favor | En contra |
|---|---|---|
| **Auth0** | Proveedor maduro, migración de usuarios asistida, soporta multi-tenant nativo (relevante para el modelo de CeltaTech, una Organización por Prestadora) | Costo por usuario activo, otro proveedor externo del cual depender |
| **Clerk** | Más simple de integrar, buena UI de gestión lista para usar | Más joven que Auth0, menos historial en volumen alto |
| **JWT propio (backend Node/Express)** | Cero dependencia externa nueva, control total | Hay que construir y mantener: cálculo del identificador de verificación de las contraseñas, rotación de tokens, rate limiting de intentos fallidos, restablecimiento de la contraseña — todo lo que hoy resuelve Supabase Auth gratis (ver `docs/SECURITY.md`, «Autenticación por etapa», que ya lo descartó por redundante mientras Supabase funcione) |

No se recomienda decidir esto ahora — la decisión correcta depende de por qué se está
migrando (¿solo Auth, o toda la base también?) y de la escala del proyecto en ese momento
(cuántas Prestadoras hay para entonces). Este documento
existe para que, llegado el caso, no haya que investigar las opciones desde cero bajo
presión.

### Qué NO cambia en una migración de Auth

- La lógica de negocio (`docs/SECURITY.md`, «Portabilidad de datos»): vive en el backend
  propio, no en Supabase — migrar Auth no toca esa capa.
- Los datos de la base (`prestadoras`, `usuarios`, `asistentes`, etc.) — eso es
  Postgres/Supabase Database, un proveedor distinto de Supabase Auth, y ya tiene su propio
  resguardo (backup R2+B2, `docs/SECURITY.md`, «Portabilidad de datos»).

## Runbooks de proveedores de bajo riesgo

Estos cuatro proveedores son de bajo riesgo y bajo esfuerzo de migración. Estos son los pasos
concretos a seguir si alguno falla o hay
que reemplazarlo — para no tener que decidir el procedimiento en el momento de la caída.

### Railway (hosting del backend Node/Express)

1. El código del backend es un repo Git estándar (`backend/`), sin nada específico de
   Railway salvo variables de entorno — ver `backend/.env.example` para la lista completa.
2. Alternativas equivalentes: Render, Fly.io, un VPS propio con PM2 o Docker. **El plan del
   proveedor nuevo no puede dormir el servicio por inactividad:** las tareas programadas corren
   adentro del mismo proceso (`programar()` en `backend/src/server.js`), y un servicio dormido no
   las corre. En Railway hoy no duerme (`sleepApplication: false`, comprobado con
   `railway status --json`).
   La dirección del backend todavía es la que asigna Railway
   (`careonys-backend-production-e7ee.up.railway.app`, la que comprueba
   `.github/workflows/deploy-backend.yml`), no una de `careonys.com`: al mudarse cambia, y con
   ella todo lo del punto siguiente.
3. Pasos para migrar: crear el proyecto nuevo en el proveedor elegido, cargar las mismas
   variables de entorno (`backend/.env.example` como checklist), apuntar el mismo repo de
   GitHub (o hacer deploy manual del código), y actualizar la URL del backend en:
   - `panel/.env` para el desarrollo local, y el secreto `VITE_API_URL` del repositorio de
     GitHub para lo que se publica (`.github/workflows/publicar-pantallas.yml`) — es la
     variable que apunta a la dirección del backend.
   - Cualquier puerta configurada externamente para que otro software deje un dato (ej. la de WhatsApp/Meta Cloud
     API, `docs/PRD_06_WhatsApp_IA.md`) — hay que reconfigurar la URL en el panel de Meta.
4. El `RAILWAY_TOKEN` usado en GitHub Actions (`.github/workflows/deploy-backend.yml`) solo sirve para el
   auto-deploy — no bloquea la migración, se reemplaza por el token/mecanismo equivalente
   del proveedor nuevo.

### Cloudflare Pages (hosting del Panel, las dos aplicaciones y la página raíz)

1. El Panel y las dos aplicaciones (`panel/`, `pwa-clientes/`, `pwa-asistentes/`) son proyectos
   frontend estándar (Vite/React) y se publican **ya compilados**: no hay nada propietario de
   Cloudflare adentro del código. Lo único específico del proveedor es el archivo `_redirects` de
   cada aplicación — una regla de una línea para que al recargar una pantalla interna no salga
   404. La página raíz de `careonys.com` (`sitio-web/`) es un HTML suelto, sin Vite, que arma
   `node sitio-web/construir.mjs`.
2. Alternativas equivalentes: Netlify, Vercel, GitHub Pages (mientras el HTML no haya que
   armarlo del lado del servidor, que hoy no hace falta).
3. **Los proyectos de Cloudflare Pages son de subida directa: no están enganchados a
   GitHub.** Quien compila y publica es `.github/workflows/publicar-pantallas.yml`, que
   corre `npm run build` con las variables `VITE_*` guardadas como secretos del repositorio
   —o `construir.mjs`, para la página raíz— y después sube la carpeta ya compilada con
   `wrangler pages deploy` a cuatro proyectos: `careonys-panel`, `careonys-clientes`,
   `careonys-asistentes` y `careonys-sitio`. Eso es justamente lo
   que hace fácil la mudanza: el proveedor recibe archivos terminados, así que cambiarlo es
   cambiar el último paso de ese archivo, no rehacer la compilación.
4. Pasos para migrar: crear los cuatro proyectos en el proveedor nuevo, reemplazar en ese
   archivo el paso de `wrangler` por el comando equivalente del proveedor nuevo, cargar allá
   el token que ese comando necesite (hoy son `CLOUDFLARE_API_TOKEN` y
   `CLOUDFLARE_ACCOUNT_ID`), y repuntar por DNS `careonys.com`, `gestion.careonys.com`,
   `clientes.careonys.com` y `asistentes.careonys.com` al lugar nuevo.
5. Dos cosas que no se pueden olvidar en el proveedor nuevo, porque no fallan en la
   compilación sino en vivo: la regla de reescritura equivalente al `_redirects` (sin ella,
   toda dirección interna da 404 al recargar), y que el manifiesto y el `sw.js` de las dos
   aplicaciones se sirvan con el tipo de contenido correcto, o dejan de instalarse en el
   teléfono.
6. Las direcciones que el backend mete adentro de los correos de activación
   (`PWA_CLIENTES_URL` y `PWA_ASISTENTES_URL`, configuradas en Railway) apuntan a los
   dominios propios, no a los del proveedor: mientras el DNS se repunte, esos correos no
   hay que tocarlos.
7. Recordar en el proveedor nuevo también «terminar la tarea incluye comprobar que la
   publicación salió bien», de `celtatech/CLAUDE.md`: confirmar si publica solo desde el
   `git push` o si hace falta un paso explícito, y dejarlo escrito en el automatismo, no en
   la memoria de nadie.

### Resend (envío de correo transaccional)

**Por qué hay un despachante y no una casilla.** Railway no deja salir tráfico por los puertos
de correo —se probaron los tres desde el propio servidor y los tres cortaron a los 260
milisegundos, que es la firma de un bloqueo y no de una demora—, así que el backend no puede
entrar a ninguna casilla: ni a una propia ni a la de una Prestadora. El envío sale por un
despachante que habla por el puerto 443, como cualquier otro pedido web. Eso convierte la
restricción en el primer filtro de cualquier reemplazo: **un proveedor de SMTP puro no sirve
mientras el backend corra en Railway.**

1. **Uso actual: un despachante, con una dirección de envío por Prestadora.** `RESEND_API_KEY`
   y `REMITENTE_AVISOS`, cargadas en Railway (ver `docs/SECRETOS.md`), consumidas en
   `backend/src/utils/email.js`, que es el único archivo del producto que manda correo. Al
   despachante se le autoriza el dominio `careonys.com` una sola vez, y de ahí cuelgan todas
   las direcciones que haga falta, así que **el costo no sube por Prestadora**. Cada
   Prestadora manda desde `[prestadora]@careonys.com` y las respuestas se reenvían a la
   casilla que ella declare (`docs/MARCA.md`, sección 0).
2. **El camino por SMTP sigue escrito, y es para la máquina de desarrollo.** Mientras no haya
   acceso al despachante, `crearTransporterPara` arma un transporte de Nodemailer contra
   `smtp.gmail.com` con `SMTP_USER` y `SMTP_PASSWORD`, resolviendo a mano una IPv4 porque la
   salida IPv6 de Railway da `ENETUNREACH` y Nodemailer elige al azar entre IPv4 e IPv6.
   **Y no hay un tercer camino.** Cada Prestadora tuvo alguna vez su propio servidor de correo
   con su contraseña; se retiró junto con la pantalla que lo pedía, porque sale por SMTP y esos
   puertos están bloqueados: no podía andar en producción para ninguna.
3. **Alternativas equivalentes:** cualquier despachante que hable por el puerto 443 —Amazon
   SES, Postmark, Cloudflare Email Service, la API de Gmail—. **Amazon SES es la salida
   pensada para cuando el plan gratuito quede chico**, porque cobra por correo mandado y no
   tiene abono fijo. Uno ya se descartó con la cuenta en la mano: el plan gratuito de SendGrid
   es una prueba de sesenta días.
4. **Lo que hay que mirar antes de que apriete, y no el día que aprieta:** el plan gratuito de
   Resend deja 3.000 correos por mes **y como mucho 100 por día**. El tope diario es el que se
   descubre el peor día, así que el uso se cuenta y se muestra en el Panel.
5. **Pasos para migrar:** dar de alta la cuenta en el despachante nuevo, autorizar
   `careonys.com` allá, generar sus claves de acceso, cargarlas en Railway con nombres propios y
   cambiar `transporteDelDespachante` en `backend/src/utils/email.js`. Es una pieza sola: el
   armado de cada correo —a quién va, qué dice, con qué marca— sale de `destinatariosEvento` y
   de la marca de la Prestadora, y no sabe por dónde viaja. Hay **un solo** juego de
   claves de acceso que reemplazar, no uno por Prestadora.
6. **Verificar el remitente antes del corte** (SPF y DKIM del proveedor nuevo), o los correos
   caen en correo no deseado. Los renglones de DNS van en Cloudflare sin proxi: proxiados, el
   dominio no verifica nunca.
7. **El reenvío de las respuestas es de Cloudflare, no del despachante**, así que no se mueve
   con él. Vive en Email Routing de `careonys.com`, una regla por Prestadora, y tiene su
   propio techo: 200 reglas por dominio y 200 direcciones de destino por cuenta.

### GitHub (repositorio de código + Actions)

1. Es el proveedor de más bajo riesgo de los cuatro — el código y su historial completo
   ya están en el propio Git local de cada desarrollador, no solo en GitHub.
2. Alternativas equivalentes: GitLab, Bitbucket, un servidor Git propio.
3. Pasos para migrar: `git remote add nuevo-origen <url>` y `git push nuevo-origen
   --all --tags` desde cualquier clon local actualizado — no se pierde nada del historial.
4. Lo único que hay que reconstruir en el proveedor nuevo son los GitHub Actions
   (`.github/workflows/`) — el YAML de los workflows es portable casi literal a GitLab CI o
   Bitbucket Pipelines con ajustes de sintaxis menores, pero los *secrets* configurados
   (ej. `RAILWAY_TOKEN`) hay que volver a cargarlos a mano en el proveedor nuevo, no se
   exportan.

## Cierre

La copia en caliente de Supabase Auth sigue explícitamente fuera de alcance y no
recomendada — se retoma en una conversación aparte si el Desarrollador quiere profundizarla.
