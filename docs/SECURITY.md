# SECURITY.md — Autenticación, autorización y datos sensibles

> La plataforma usa Supabase Auth, no un esquema JWT propio.

## Autenticación por etapa

- **Panel:** Supabase Auth y contraseña, **sin** magic link. El Coordinador entra con nombre de
  usuario `parte_código`; el Administrador y el equipo técnico, con su email
  (`panel/src/pages/Login.jsx`, `backend/src/routes/ingreso.js`).
- **Aplicaciones de Asistentes y Clientes:** Supabase Auth, nombre de usuario y contraseña. El
  nombre es único en todo el sistema y lo elige la persona al activar la cuenta; la contraseña se
  recupera con ese nombre. El email es un dato de contacto: el servicio de acceso conoce a la
  cuenta por `<identificador de la cuenta>@acceso.careonys.invalid`
  (`backend/src/config/direccionDeAcceso.js`), así que corregir el email no toca el acceso.

Supabase Auth ya maneja la emisión, rotación y revocación de tokens JWT — **no construir
un esquema propio de access/refresh tokens**.

## Política de contraseñas (configurable en Supabase Auth)

- Longitud mínima: 8 caracteres, sin exigencia de mayúsculas, números ni caracteres especiales.
  Vive en dos lugares que tienen que decir lo mismo —`backend/src/config/reglaDeClave.js` y
  `supabase/config.toml`—, y `scripts/verificar_regla_de_clave.mjs` rompe la construcción si se
  despegan.
- Intentos de entrada: el tope nativo de Supabase Auth, 30 entradas o altas cada 5 minutos por
  dirección IP (`supabase/config.toml`, `[auth.rate_limit]`). No hay bloqueo de la cuenta por
  intentos fallidos.
- Pedidos de contraseña nueva: 5 por hora y por cuenta (`TOPE_PEDIDOS_DE_CLAVE_POR_HORA`,
  `backend/src/utils/topeDePedidosDeClave.js`).

## Portabilidad de datos — no depender de un solo proveedor

Supabase es la base de datos elegida para todo el roadmap (ver `CONTEXT.md`), pero el
proyecto **no debe construirse de forma que dejarlo sea riesgoso o traumático**. Reglas
para mantener esa salida siempre abierta:

- **Toda la lógica de negocio vive en el backend Node/Express propio**, nunca en Supabase
  Edge Functions ni en triggers/funciones de Postgres con lógica de negocio compleja. Si
  cambia el proveedor de base de datos, el backend cambia una connection string, no su
  código.
- **RLS se escribe en SQL estándar de Postgres**, sin depender de helpers propietarios de
  Supabase más allá de `auth.uid()` (que tiene equivalente directo en cualquier Postgres
  con su propio esquema de usuarios).
- **Backup propio, independiente del backup nativo de Supabase**: los datos de cada
  Prestadora, guardados fuera de Supabase, en almacenamiento de objetos (bucket — Google Cloud
  Storage, AWS S3, Backblaze B2 o similar). Esto protege contra el peor caso (cuenta bloqueada, error
  de facturación, borrado accidental del proyecto) sin depender de que el proveedor mismo
  resuelva su propia falla. **Git/GitHub queda descartado como destino, no en evaluación**:
  guarda historial permanente que no se puede purgar sin reescribir
  todo el repo, es una segunda copia de datos sensibles sin ninguna protección de RLS/tenant,
  y tiene límite de tamaño de archivo (100MB) que un dump de base va a superar con el tiempo.
- Storage: si se sube a Supabase Storage, evitar features no estándar que no tengan
  equivalente en cualquier storage S3-compatible.

Ninguna de estas reglas frena el desarrollo actual — son restricciones de diseño, no
trabajo extra significativo.

**El backup propio existe, y va de a una Prestadora.** Todas las noches el backend respalda los
datos de cada Prestadora en un archivo propio, con sus cuentas de entrada adentro
(`backend/src/utils/respaldoDeLosDatos.js`), y copia los archivos de sus depósitos bajo
`archivos/<depósito>/<ruta>` (`backend/src/utils/copiaDeLosArchivos.js`). Los dos suben a
Cloudflare R2, que es el principal, y a Backblaze B2, que es el espejo. Trabajan con la credencial
de la copia de respaldo, que sólo lee lo de esa Prestadora: no escribe y no borra. La lista de
tablas y la de depósitos se las pregunta a la base, para que una nueva no quede afuera por olvido.
La estructura no se respalda acá: está en el repositorio, que sube a los mismos dos destinos todos
los días a las 03:00 de Buenos Aires (`.github/workflows/backup-diario.yml`).

**Todo sale cifrado con la clave pública de su Prestadora** (`backend/src/utils/cifradoDeLosRespaldos.js`),
que está en `CLAVES_PUBLICAS_DE_LOS_RESPALDOS` del backend. La pública cifra y no descifra: quien
se lleve el backend o los depósitos no lee nada. La privada, una por Prestadora, vive en la caja
fuerte y en el gestor de contraseñas del Desarrollador, y en ningún lugar al que llegue el sistema.
Una Prestadora sin clave pública no se respalda esa noche, y el registro lo dice.

**Un respaldo se abre con `backend/scripts/abrir_respaldo.mjs`** y la clave privada de su
Prestadora. Baja el más nuevo, lo abre y contesta `bien`, `roto` o `no_probado`: `roto` si es de
otra Prestadora o trae alguna fila de otra, y `no_probado` si estaba en orden pero no traía una sola
fila. Muestra cantidades, nunca una fila. Qué decide cada uno está en
`backend/src/utils/comprobacionDeRestauracion.js`. Lo corre el Desarrollador, porque pide la clave
privada.

### Si hay que dejar el servicio de identidad de Supabase

No hay ninguna decisión de migrar. Esto es lo que se hace si Supabase deja de servir para
autenticar —cierre de cuenta, cambio de precios, fin del servicio—, para no empezar de cero en el
peor momento.

- **Qué se exporta:** la lista de usuarios —email, `id` (UUID), fecha de alta y estado— y el rol,
  que vive en `usuarios.rol`, la tabla propia del producto, no en Supabase Auth.
- **Los identificadores de verificación de las contraseñas no se pueden migrar.** Supabase Auth
  usa bcrypt con su propia configuración interna, y ningún otro proveedor ni un esquema propio los
  puede volver a verificar. Pasa en cualquier migración de un proveedor de identidad a otro.
- **Por eso toda cuenta restablece su contraseña** la primera vez que entra al sistema nuevo:
  Superadmin, Admin_prestadora, Coordinador, Asistente y Cliente, los valores de `usuarios.rol`. Se
  avisa por email antes del corte.
- **Qué no cambia:** la lógica de negocio, que vive en el backend propio, y los datos de la base,
  que son otro servicio y tienen su propio respaldo, el de arriba.

| Opción | A favor | En contra |
|---|---|---|
| **Auth0** | Proveedor maduro, migración de usuarios asistida, multi-tenant nativo | Costo por usuario activo, otro proveedor externo del que depender |
| **Clerk** | Más simple de integrar, gestión de usuarios lista para usar | Más joven que Auth0, menos historial en volumen alto |
| **JWT propio en el backend** | Ninguna dependencia externa nueva, control total | Hay que construir y mantener el cálculo del identificador de verificación de las contraseñas, la rotación de tokens, el tope de intentos y el restablecimiento de la contraseña, que hoy resuelve Supabase Auth |

Qué opción conviene depende de por qué se migra —sólo la identidad, o también la base— y de
cuántas Prestadoras haya en ese momento. La copia en caliente del servicio de identidad queda
fuera de alcance.

### Railway, donde corre el backend

1. El backend es un repositorio Git estándar (`backend/`), sin nada propio de Railway salvo las
   variables de entorno, que lista `backend/.env.example`.
2. **Alternativas:** Render, Fly.io, un servidor propio con PM2 o Docker. **El plan del proveedor
   nuevo no puede dormir el servicio por inactividad:** las tareas programadas corren adentro del
   mismo proceso (`programar()` en `backend/src/server.js`), y un servicio dormido no las corre. En
   Railway no duerme (`sleepApplication: false` en `railway status --json`). La dirección del
   backend es la que asigna Railway, `careonys-backend-production-e7ee.up.railway.app`, la que
   comprueba `.github/workflows/deploy-backend.yml`: al mudarse cambia.
3. **Pasos:** crear el proyecto en el proveedor elegido, cargar las mismas variables de entorno con
   `backend/.env.example` como lista, apuntar el mismo repositorio, y cambiar la dirección del
   backend en `panel/.env` para el desarrollo local, en el secreto `VITE_API_URL` del repositorio
   para lo que se publica (`.github/workflows/publicar-pantallas.yml`) y en toda dirección que otro
   software llama para dejar un dato, como la de WhatsApp en el panel de Meta.
4. `RAILWAY_TOKEN`, en `.github/workflows/deploy-backend.yml`, sirve sólo para la publicación
   automática y se reemplaza por el mecanismo del proveedor nuevo.

### Cloudflare Pages, donde se publican el Panel, las dos aplicaciones y la página raíz

1. El Panel y las dos aplicaciones (`panel/`, `pwa-clientes/`, `pwa-asistentes/`) son proyectos
   Vite y React estándar y se publican ya compilados. Lo único propio del proveedor es el archivo
   `_redirects` de cada uno, una regla de una línea para que al recargar una dirección interna no
   salga 404. La página raíz de `careonys.com` (`sitio-web/`) es un HTML suelto que arma
   `node sitio-web/construir.mjs`.
2. **Alternativas:** Netlify, Vercel, GitHub Pages.
3. **Los proyectos de Cloudflare Pages son de subida directa: no están enganchados a GitHub.**
   Compila y publica `.github/workflows/publicar-pantallas.yml`, que corre `npm run build` con las
   variables `VITE_*` guardadas como secretos del repositorio —o `construir.mjs`, para la página
   raíz— y sube la carpeta compilada con `wrangler pages deploy` a cuatro proyectos:
   `careonys-panel`, `careonys-clientes`, `careonys-asistentes` y `careonys-sitio`. Cambiar de
   proveedor es cambiar ese último paso, no la compilación.
4. **Pasos:** crear los cuatro proyectos en el proveedor nuevo, reemplazar el paso de `wrangler`
   por el comando equivalente, cargar allá el token que ese comando necesite —hoy son
   `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID`— y repuntar por DNS `careonys.com`,
   `gestion.careonys.com`, `clientes.careonys.com` y `asistentes.careonys.com`.
5. **Dos cosas fallan en vivo y no al compilar:** la regla de reescritura equivalente a
   `_redirects`, sin la cual toda dirección interna da 404 al recargar, y el tipo de contenido del
   manifiesto y de `sw.js` de las dos aplicaciones, sin el cual dejan de instalarse en el teléfono.
6. Las direcciones que el backend pone en los correos de activación (`PWA_CLIENTES_URL` y
   `PWA_ASISTENTES_URL`, en Railway) apuntan a los dominios propios: con el DNS repuntado no se
   tocan.
7. En el proveedor nuevo se comprueba si publica solo o si necesita un paso explícito, y se deja
   escrito en el automatismo (`celtatech/CLAUDE.md`, «Y terminar la tarea incluye comprobar que la
   publicación salió bien»).

### Resend, el despachante de correo

**Por qué hay un despachante y no una casilla.** Railway no deja salir tráfico por los puertos de
correo, así que el backend no puede entrar a ninguna casilla. El envío sale por un despachante que
habla por el puerto 443, como cualquier pedido web. **Un proveedor de SMTP puro no sirve mientras
el backend corra en Railway.**

1. **Un despachante, con una dirección de envío por Prestadora.** `RESEND_API_KEY` y
   `REMITENTE_AVISOS`, cargadas en Railway (`docs/SECRETOS.md`), las consume
   `backend/src/utils/email.js`, el único archivo del producto que manda correo. Al despachante se
   le autoriza el dominio `careonys.com` una sola vez y de ahí cuelgan todas las direcciones, así
   que el costo no sube por Prestadora. Cada Prestadora manda desde `[prestadora]@careonys.com` y
   las respuestas se reenvían a la casilla que ella declare (`docs/MARCA.md`, sección «Antes que
   nada: acá hay tres marcas, no una»).
2. **El camino por SMTP es para la máquina de desarrollo.** Sin clave del despachante,
   `crearTransporterPara` arma un transporte de Nodemailer contra `smtp.gmail.com` con `SMTP_USER`
   y `SMTP_PASSWORD`, resolviendo a mano una IPv4. No hay un tercer camino: el servidor de correo
   propio de cada Prestadora se retiró junto con la pantalla que lo pedía, porque sale por SMTP.
3. **Alternativas:** cualquier despachante que hable por el puerto 443 —Amazon SES, Postmark,
   Cloudflare Email Service, la API de Gmail—. Amazon SES cobra por correo mandado y no tiene abono
   fijo. El plan gratuito de SendGrid es una prueba de sesenta días.
4. **El tope:** el plan gratuito de Resend deja 3.000 correos por mes y como mucho 100 por día.
   Cada envío queda contado en `envios_de_correo`.
5. **Pasos:** dar de alta la cuenta en el despachante nuevo, autorizar `careonys.com`, generar sus
   claves de acceso, cargarlas en Railway con nombres propios y cambiar `transporteDelDespachante`
   en `backend/src/utils/email.js`. El armado de cada correo —a quién va, qué dice, con qué marca—
   no sabe por dónde viaja, y hay un solo juego de claves que reemplazar, no uno por Prestadora.
6. **Verificar el remitente antes del corte** (SPF y DKIM del proveedor nuevo), o los correos caen
   en correo no deseado. Los renglones de DNS van en Cloudflare sin proxi: proxiados, el dominio no
   verifica nunca.
7. **El reenvío de las respuestas es de Cloudflare, no del despachante**, así que no se mueve con
   él. Vive en Email Routing de `careonys.com`, una regla por Prestadora, con un techo de 200
   reglas por dominio y 200 direcciones de destino por cuenta.

### GitHub, el repositorio y los automatismos

1. El código y su historial completo están en cada clon local, no sólo en GitHub.
2. **Alternativas:** GitLab, Bitbucket, un servidor Git propio.
3. **Pasos:** `git remote add nuevo-origen <url>` y `git push nuevo-origen --all --tags` desde un
   clon al día.
4. Lo que se reconstruye son los automatismos de `.github/workflows/`, que pasan a GitLab CI o
   Bitbucket Pipelines con ajustes de sintaxis menores. Los secretos del repositorio, como
   `RAILWAY_TOKEN`, no se exportan: se vuelven a cargar a mano.

## RBAC — roles del sistema

Los roles reales del proyecto:

| Rol | Alcance |
|---|---|
| `superadmin` | Técnico (código/infra/base de datos), sin carácter administrativo de negocio. No tiene entrada propia en Careonys: sin un **permiso de acceso** vigente, el backend la rechaza en cada pedido, igual que a cualquier rol sin acceso. El permiso lo abre CeltaTech desde su lado: una prestadora por vez, acotado en el tiempo y auditado — ver abajo |
| `admin_prestadora` | Todo el negocio de su propia prestadora (cero visibilidad de otras prestadoras) |
| `coordinador` | Su zona asignada (Clientes, pacientes, guardias, Asistentes de esa zona), dentro de su propia prestadora |
| `asistente` | Sus propias guardias, su perfil, su certificado |
| `cliente` | Sus pacientes, reportes y alertas de sus pacientes |

Son los únicos cinco: la base no admite otro valor en `usuarios.rol`. No hay rol `admin` ni
`admin_plataforma`; lo comercial es de CeltaTech.

**El permiso de acceso** (tablas `permisos_de_acceso` y `auditoria_de_accesos`) es la única forma
en que `superadmin` entra a los datos de una Prestadora: una por vez, con corte a los 5 minutos de
inactividad, tope de 60 con aviso a los 50, advertencia antes de cada operación destructiva y
auditoría de todo lo que se hace adentro (`celtatech/CLAUDE.md`, sección «Seguridad, privacidad y
auditoría»).

**El permiso lo abre CeltaTech desde su lado, y el producto ya no tiene ninguna ruta para abrirlo,
renovarlo ni cerrarlo a pedido.** La cerradura está acá —la base es la que decide qué filas ve una
consulta— y la llave es de CeltaTech. Lo que queda de este lado es hacerlo cumplir, y vive entero
en `backend/src/middleware/requiereRolPanel.js`: cierre del permiso vencido con su motivo, refresco
de la marca de actividad y auditoría de cada escritura. El cartel y el aviso a los 50 minutos son
de la herramienta de CeltaTech; la Prestadora no ve nada. Qué tiene que construir CeltaTech está en
`celtatech/docs/EL_PERMISO_DE_ACCESO.md`.

`superadmin` es el único rol, además de `admin_prestadora`, con acceso de escritura a
configuración de sistema y a cualquier herramienta de diagnóstico asistido por IA
que se construya sobre logs/errores de la aplicación — no exponer esas herramientas a
`admin_prestadora` ni a `coordinador`.

## Multi-tenancy — `prestadora_actual()` y `es_superadmin()`

- `interno.prestadora_actual()` resuelve el permiso de acceso primero, el `prestadora_id` propio
  después —sólo si la cuenta no está desactivada— y, para el trabajo sin persona, la Prestadora
  para la que el backend generó su acceso. La definición vigente se lee de la base
  (`pg_get_functiondef`), no se copia acá.
- `es_superadmin()` no es un bypass: devuelve `TRUE` sólo si el usuario tiene el rol `superadmin`.
  Las policies la usan siempre junto al tenant
  (`es_superadmin() AND prestadora_id = prestadora_actual()`), nunca sola.

La tabla que consulta `prestadora_actual()` se llama `permisos_de_acceso` y el rol habilitado es
`superadmin`.

Toda policy de RLS resuelve la Prestadora y el rol `superadmin` con estas dos funciones SQL, en
vez de repetir el `EXISTS (SELECT ... FROM usuarios WHERE id = auth.uid() ...)` a mano.

Toda tabla con `prestadora_id` debe filtrar por `prestadora_id = prestadora_actual()` en sus
policies — nunca solo por rol, sin el filtro de tenant, salvo que la tabla sea
intencionalmente global (ej. `escalas_legales`, que no tiene `prestadora_id`).

**Regla: en toda tabla que tenga `prestadora_id`, `es_superadmin()` va con `AND`, nunca sola.**
El patrón correcto es `(es_superadmin() AND prestadora_id = prestadora_actual()) OR (...)`: ser
superadmin da un permiso *dentro* del tenant en el que uno está parado, no permiso para
salirse de él. Una policy que diga solamente `USING (es_superadmin())` sobre una tabla con
`prestadora_id` es un bypass cross-tenant.

**Excepciones vigentes** (141 policies usan
`es_superadmin()`; estas 6 la usan sin `prestadora_actual()` sobre una tabla que sí tiene
`prestadora_id`):

| Tabla | Policy | Por qué se acepta |
|---|---|---|
| `permisos_de_acceso` | `superadmin_lee_sus_permisos_de_acceso` | Va con `admin_id = auth.uid()`: cada cuenta lee sólo sus propios permisos de acceso. |
| `tareas_que_alcanza_la_prohibicion` | `superadmin_gestiona_lo_que_alcanza_la_prohibicion` | Va con `prestadora_id IS NULL`: alcanza sólo las filas del producto, no las de ninguna Prestadora. |
| `vias_que_alcanza_la_prohibicion` | `superadmin_gestiona_las_vias_que_alcanza_la_prohibicion` | Ídem. |
| `formularios_declarados` | `superadmin_gestiona_formularios` | Sin motivo escrito: alcanza los formularios de todas las Prestadoras. |
| `formulario_secciones` | `superadmin_gestiona_secciones` | Sin motivo escrito: ídem. |
| `formulario_campos` | `superadmin_gestiona_campos` | Sin motivo escrito: ídem. |

**Si una tabla nueva necesita entrar en esta lista, no se agrega en silencio: se agrega acá con
su motivo escrito.** Toda tabla con datos de la operación queda fuera, sin excepción.

## RLS — políticas obligatorias

Cada tabla nueva lleva RLS en la misma migración que la crea (`celtatech/CLAUDE.md`, sección
«Aislamiento entre Organizaciones»). Toda policy filtra por `prestadora_actual()`, no sólo por
rol. Tres de las vigentes, copiadas de la base (`pg_policies`):

```sql
-- El Asistente ve sólo sus propias guardias, dentro de su Prestadora
CREATE POLICY asistente_ve_sus_guardias ON guardias
  FOR SELECT USING (
    prestadora_id = interno.prestadora_actual()
    AND asistente_id = interno.asistente_de_la_sesion()
  );

-- El Cliente ve los reportes de sus pacientes, si la persona autorizada tiene ese permiso
CREATE POLICY cliente_ve_reportes_de_sus_pacientes ON reportes
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM pacientes p
             WHERE p.id = reportes.paciente_id
               AND p.cliente_id = interno.cliente_id_de_usuario(auth.uid()))
    AND interno.persona_autorizada_puede(auth.uid(), 'persona_autorizada_reportes')
  );

-- La administración ve todas las guardias de su Prestadora, y el Superadmin sólo con permiso de acceso
CREATE POLICY panel_gestiona_guardias ON guardias
  FOR ALL USING (
    (interno.es_superadmin() AND prestadora_id = interno.prestadora_actual())
    OR (prestadora_id = interno.prestadora_actual()
        AND EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin_prestadora'))
  );
```

**Patrón OR para FK nullable (ejemplo oficial, `incidentes_relevo`):**
cuando una tabla tiene una FK opcional que cambia de qué fila derivar el alcance según esté NULL
o no (acá, `guardia_saliente_id` NULL = "Ausente sin relevo previo"), la policy resuelve ambos
casos con dos llamadas a la misma función unidas por `OR`, en vez de intentar una sola condición
que cubra los dos. `interno.coordinador_ve_la_guardia` devuelve falso ante un NULL:

```sql
-- Copiado de la base (pg_policies).
CREATE POLICY coordinador_gestiona_incidentes_relevo_de_sus_servicios ON incidentes_relevo
  FOR ALL TO authenticated
  USING (prestadora_id = interno.prestadora_actual()
         AND (interno.coordinador_ve_la_guardia(guardia_entrante_id)
              OR interno.coordinador_ve_la_guardia(guardia_saliente_id)));
```

Tablas que **nunca** deben tener policy de lectura para `asistente` ni `cliente`:
`escalas_legales`, `ausencias`, `guardias_cobertura`, `remuneraciones_asistente`,
`datos_reservados_asistente`.

**Lo que se le paga al Asistente vive en una tabla aparte.** `valor_hora`, `valor_guardia`,
`valor_semana`, `valor_hora_extra`, `moneda`, `unidad_medicion` y
`frecuencia_pago` están en `remuneraciones_asistente`, no en `asistentes`, con su propia policy de
lectura. Contra `asistentes` es uno a uno
—la clave primaria es el propio `asistente_id`, y la fila existe sólo si hay algún importe
cargado—. `datos_reservados_asistente`, más abajo, también tiene por clave primaria el
`asistente_id`:

```sql
CREATE POLICY lee_remuneraciones_quien_tiene_el_permiso ON remuneraciones_asistente
  FOR SELECT USING (
    prestadora_id = prestadora_actual()
    AND tiene_permiso('ver_pagos_asistente')
    AND EXISTS (SELECT 1 FROM asistentes a WHERE a.id = remuneraciones_asistente.asistente_id)
  );
```

El motivo es que RLS filtra **filas, no columnas**: si esos datos fueran columnas de
`asistentes`, cualquier sesión que pudiera ver la fila del Asistente los leería, tuviera o no
el permiso. Escribir es exclusivo de
`es_superadmin() OR es_admin_prestadora()`. El `EXISTS` es deliberado: reutiliza las policies
de `asistentes` en lugar de repetir los filtros de tenant y de zona («Ningún patrón repetido sin punto único de verdad», `celtatech/CLAUDE.md`),
así una Coordinadora con el permiso abierto ve los pagos de los Asistentes de su zona y de
ningún otro. `es_admin_prestadora()` es el punto único de verdad de esa condición.

El Cliente no alcanza ninguna fila de `asistentes` ni de `certificados`: la protección por fila
no recorta columnas, y una fila abierta le entregaba el teléfono y el domicilio. Lo que ve del
Asistente —nombre, foto, tipo y certificado vigente, sólo del que tiene una guardia en curso o
próxima— se lo arma el backend con el trabajo de la Prestadora y columnas contadas
(`backend/src/routes/appClientes.js`). Y el código QR vale sólo para la guardia de hoy
(`backend/src/utils/comprobacionDePresencia.js`, `esGuardiaDeHoy`).

Por el mismo motivo, el Cliente no lee de la base ninguna fila de `guardias`, de `personas` del
Paciente, de `informacion_de_salud_del_paciente` ni de `domicilios_temporales_paciente`. La base no
distingue entre el titular y la persona autorizada, ni sabe qué le dio el titular a cada una: una
fila abierta le entregaba a cualquiera de las dos el punto del que salió el Asistente, el domicilio
y las patologías del Paciente. Con su credencial sólo se comprueba que el Paciente es suyo; lo
demás lo arma el backend con el trabajo de la Prestadora y con las columnas que corresponden a
quien pide: el domicilio, sólo con el acceso a la ficha; las coordenadas y el punto del viaje, sólo
con el mapa en vivo prendido y el acceso a la ubicación; la información de salud, sólo si
`alcanza_la_informacion_de_salud_la_sesion` contesta que sí (`backend/src/routes/appClientes.js`).
El punto del viaje se borra en la base apenas la guardia deja de estar programada, con el
disparador `borrar_el_punto_del_viaje`, cualquiera sea el camino por el que cambió.

**«Es de esta Prestadora» no alcanza para leer lo del Panel.** `interno.prestadora_actual()`
contesta también para un Cliente, una persona autorizada y un Asistente, así que una política que
sólo compara la Prestadora le abre la tabla entera a cualquiera de ellos. Toda lectura pensada para
el Panel pide además `interno.es_personal_de_la_prestadora()` —o la función del permiso que
corresponda, como `interno.gestiona_la_facturacion()` en las correcciones de factura—, y el
Asistente y el Cliente leen lo suyo con su propia política. Las calificaciones piden además, para
la persona autorizada, el acceso para calificar, y las correcciones el acceso al dinero.

**El estado de cuenta del Cliente lo ve la administración.** Cuánto debe cada Cliente y si está
atrasado entra por la acción `ver_estado_de_cuenta_cliente` del catálogo
`catalogo_acciones_permisos`, que nace reservada a la administración y que cada Prestadora abre o
cierra desde su Panel. La coordinación de turnos arma las guardias y no interviene en el trato
económico.

En el backend, el middleware `requierePermiso('ver_estado_de_cuenta_cliente')` cierra en
`backend/src/routes/panelCobros.js` las seis rutas que entregan o mueven el estado de cuenta —los
saldos, el que llegó de afuera, el detalle de una factura, anotar un cobro, anularlo y la entrada
de lotes—, que además entran a la base con la sesión de quien pide. Lo que sirve para facturar no
lo lleva, y que un Cliente quedó restringido tampoco: no dice cuánto debe, y quien coordina
necesita verlo para trabajar. La política de lectura de `estados_de_cuenta_externos` pide también
esa acción. `saldos_cliente` es una vista que se consulta con los permisos de quien pregunta
(`security_invoker`), así que su alcance es el de las políticas de `facturas_cliente`: la de la
administración pide `interno.gestiona_la_facturacion()`, que alcanza también a quien manda a
facturar.

**Lo reservado del Legajo del Asistente también vive aparte.** `motivo_exclusion_directo` y
`motivo_exclusion_intermediacion` —por qué quedó excluido de recibir trabajo— están en `datos_reservados_asistente`,
no en `asistentes`. Una vista que las omita no alcanza: describe lo que consulta la pantalla, y la
tabla contestaría esas columnas a cualquiera que preguntara con su propia sesión. La tabla tiene
su propia policy de lectura:

```sql
CREATE POLICY lee_datos_reservados_quien_tiene_el_permiso ON datos_reservados_asistente
  FOR SELECT USING (
    prestadora_id = prestadora_actual()
    AND tiene_permiso('ver_datos_reservados_asistente')
    AND EXISTS (SELECT 1 FROM asistentes a WHERE a.id = datos_reservados_asistente.asistente_id)
  );
```

El permiso `ver_datos_reservados_asistente` está en `catalogo_acciones_permisos`
(`default_solo_admin = TRUE`, orden 9): arranca cerrado y cada Prestadora decide si se lo abre
a su Coordinadora. Escribir es exclusivo de `es_superadmin() OR es_admin_prestadora()` — el
permiso habilita a mirar, nunca a cambiar la causa de una baja ni un puntaje de riesgo.

Con el mismo molde, el domicilio del Asistente vive en `domicilio_asistente` y su relación
laboral en `relacion_laboral_asistente`. La base las deja leer con `ver_domicilio_asistente` y
`ver_relacion_laboral_asistente`, las dos con `default_solo_admin = TRUE`: de fábrica sólo las ve
la administración, y cada Prestadora decide si se las abre a su Coordinadora. El domicilio lo
cambia también quien, con el permiso de verlo, tiene `gestionar_asistentes`; la relación laboral,
sólo la administración.

**Qué quedó afuera a propósito.** Los otros seis datos que `asistentes_coordinador` omite
—`fecha_baja`, `canales`, `horas_semanales`, `importacion_id`,
`pendiente_conformidad`, `prestadora_id`— siguen siendo columnas de `asistentes` y los lee
cualquiera que pueda ver el Legajo del Asistente. Es una decisión, no un olvido: la Coordinadora los necesita
para trabajar, y la lista de omisiones de esa vista nunca fue un criterio pensado. La frontera
de lo sensible se escribió de nuevo acá, no se heredó de la vista.

Para `coordinador`, la policy de "su zona" resuelve el alcance con
`interno.coordinador_alcanza_asistente(asistente_id)`: el Coordinador alcanza a un Asistente
cuando comparten algún lugar (`usuario_lugares` contra `asistente_lugares`), o cuando cubre la
ausencia de otro Coordinador que lo alcanza, mientras dura. No se da acceso total a
`coordinador` salvo en las tablas donde el PRD lo indica explícitamente.

Esa función está en las policies de las tablas de Asistentes —entre otras `asistentes`,
`verificaciones_asistente`, `ausencias`, `guardias_cobertura`, `certificados`, `incidentes_relevo`,
`guardias_tracking_gps` y `reportes`—. Las tablas que cuelgan de una guardia —`guardias`,
`series_guardias`, `extensiones_de_turno`, `guardia_comprobaciones`,
`incidentes_turno_sin_cubrir`, `excepciones_familiar_relevo` y `consentimientos_paciente_solo`—
usan `interno.coordinador_alcanza_guardia(asistente_id)`, que además alcanza la guardia que todavía
no tiene Asistente. Van en policies separadas de las de administración, que Postgres combina con OR
al ser ambas permisivas. Una alarma que llega a todos los Coordinadores abre una vía más, aparte de
la zona: en `guardias` y en `incidentes_relevo`, el Coordinador ve la fila de la alarma que tiene a
la vista y modifica la de la alarma que tomó (`coordinador_ve_la_guardia_de_una_alarma_que_llego_a_todos`,
`coordinador_resuelve_la_guardia_de_una_alarma_que_tomo`, `coordinador_ve_la_alarma_que_llego_a_todos`,
`coordinador_resuelve_la_alarma_que_tomo`).

En `clientes`, `pacientes` y `prestaciones` el alcance del Coordinador no sale de la zona sino de
los Servicios. `coordinador_lee_clientes` usa `interno.coordinador_ve_al_cliente`, que lo deja ver
al Cliente cuando coordina uno de sus Servicios o cuando atiende a alguno de sus Pacientes;
`coordinador_lee_pacientes` usa `interno.coordinador_ve_al_paciente`, con las mismas dos vías, y
`panel_gestiona_prestaciones` también. Editar un Cliente o un Paciente le pide además el permiso
`editar_datos_cliente` o `editar_datos_paciente`, y agregar un Paciente, coordinar un Servicio de
ese Cliente (`coordinador_agrega_pacientes`).

**Guardias:** las tablas de guardias tienen RLS multi-tenant aplicada, incluido el patrón
OR-de-dos-EXISTS de `incidentes_relevo` documentado arriba, y las consume el backend —entre
otras, `backend/src/routes/panelGuardias.js`, `panelEmergencias.js` y `appAsistentes.js`—.

- **A una guardia con check-in no se le saca ningún Paciente**: la base rechaza borrar o
  cambiar una fila de `guardia_pacientes` y cambiar `guardias.paciente_id` (disparadores
  `guardia_empezada_no_pierde_pacientes` y `guardia_empezada_no_cambia_de_paciente`).
- **Una guardia empezada no cambia de Asistente, de día ni de horario.** Empezada es la que
  tiene check-in o un estado que no sea programada, pausada o cancelada. El disparador
  `guardia_empezada_no_cambia_de_asistente` rechaza en ella todo cambio de `asistente_id`,
  `fecha`, `hora_inicio` y `hora_fin`. La única excepción es la guardia **ausente** —empezó y
  nadie la está haciendo—, que pasa sólo por `reasignar_guardia_por_emergencia`: toma la
  Prestadora y la persona de la sesión, exige el motivo, cambia sólo el Asistente, deja la
  guardia en `programada` esperando el check-in de quien la cubre, y anota en
  `auditoria_reasignaciones_por_emergencia` quién, cuándo, la guardia, el Asistente anterior, el
  nuevo y el motivo. Ese registro lo leen la administración y la coordinación de la Prestadora,
  la policy de alta sólo deja escribir desde esa función, y no tiene policy de cambio ni de
  borrado.

**Match — cómo cobra la Prestadora y qué tiene habilitado el Cliente.** Son dos tablas y
se leen juntas. `formas_de_cobro_intermediacion` guarda las piezas con las que cada Prestadora arma
su forma de cobrar —qué importe, cada cuánto, con qué período gratuito, con qué saldo de
contactos, si se renueva sola—; `accesos_intermediacion`, a qué forma se adhirió cada Cliente, con
qué importe congelado, hasta qué fecha y con cuántos contactos. La primera la administra
únicamente la Admin de esa Prestadora, y el Cliente alcanza sólo las que están ofrecidas:

```sql
CREATE POLICY prestadora_administra_sus_formas_de_cobro ON formas_de_cobro_intermediacion
  FOR ALL USING (
    prestadora_id = interno.prestadora_actual()
    AND EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin_prestadora')
  );

CREATE POLICY cliente_ve_las_formas_ofrecidas ON formas_de_cobro_intermediacion
  FOR SELECT USING (
    ofrecida
    AND prestadora_id = (SELECT f.prestadora_id FROM clientes f
                         WHERE f.id = interno.cliente_id_de_usuario(auth.uid()))
  );
```

La columna `ofrecida` es parte del control de acceso, no una preferencia de pantalla: una forma
que la Prestadora dejó de ofrecer desaparece de la vista del Cliente, y los accesos que ya se
adhirieron a ella siguen apuntando a su fila. Las demás tablas de la modalidad conservan el mismo
reparto de siempre —`cliente_ve_su_acceso_intermediacion` / `prestadora_ve_accesos_intermediacion`,
`cliente_ve_los_cobros_de_su_acceso` / `prestadora_ve_cobros_intermediacion`—, renombradas al pasar
de suscripción a acceso. Ningún Cliente ve el acceso ni el cobro de otro, y ninguna Prestadora
ve nada de otra Prestadora.

**Y las unidades de tiempo salen de una tabla del producto, no de cada Prestadora.**
`catalogo_periodos_cobro` dice cada cuánto se puede cobrar —`dia`, `semana`, `mes`, `anio`—, y
`formas_de_cobro_intermediacion.periodo_unidad` la apunta con clave foránea. No lleva columna de
Prestadora porque no tiene ninguna adentro: es una lista de unidades de tiempo, igual para todas.
De ahí sale su reparto, que es el de un catálogo del producto y no el de un dato de nadie:

```sql
CREATE POLICY lectura_del_catalogo_de_periodos ON catalogo_periodos_cobro
  FOR SELECT TO authenticated USING (true);

CREATE POLICY superadmin_gestiona_catalogo_de_periodos ON catalogo_periodos_cobro
  FOR ALL USING (interno.es_superadmin()) WITH CHECK (interno.es_superadmin());
```

Lo lee cualquiera con sesión porque el Cliente también necesita esas palabras: ve las formas que
su Prestadora le ofrece y cada una dice cada cuánto se cobra. Escribirlo es cambiar el producto,
así que queda del lado del Superadmin.

**Y el saldo de un paquete de contactos no lo mueve ninguna pantalla.** Un paquete se paga una
vez y se gasta de a un Asistente: `accesos_intermediacion.saldo_contactos` dice cuántos quedan y
`contactos_vistos_intermediacion` dice a quiénes ya se les abrió el contacto, con un único por
(`cliente_id`, `asistente_id`) que es lo que hace que volver a mirar al mismo no cueste otro. Las
dos cuentas —sumarle al saldo cuando entra la plata y restarle uno al abrir— viven en dos
funciones de la base (`sumar_contactos_al_saldo` y `consumir_contacto_intermediacion`), y lo que
las obliga a estar ahí es la seguridad, no la comodidad: leer el saldo, restarle uno y volver a
escribirlo son dos viajes, y dos ventanas abiertas a la vez descuentan una sola vez. Adentro de la
base el descuento y la anotación pasan juntos, con la fila del acceso tomada.

Ninguna de las dos funciones es `SECURITY DEFINER` —las llama el backend
(`backend/src/utils/contactosIntermediacion.js`), y el esquema `interno` es para las que usan las
políticas—, y ninguna de las dos se puede ejecutar como `PUBLIC`, `anon` ni `authenticated`. Las
dos quedan al alcance de `service_role` y del trabajo sin persona (`trabajo_sin_persona`) y de nadie
más. Sin eso serían dos direcciones web, y una de ellas gasta plata ajena.

La tabla lleva RLS y sólo políticas de lectura, porque desde una pantalla no se escribe: la fila
la escribe el descuento, en la misma transacción.

```sql
CREATE POLICY cliente_ve_los_contactos_que_abrio ON contactos_vistos_intermediacion
  FOR SELECT USING (
    cliente_id = interno.cliente_id_de_usuario(auth.uid())
    AND interno.persona_autorizada_puede(auth.uid(), 'persona_autorizada_dinero')
  );

CREATE POLICY prestadora_ve_los_contactos_vistos ON contactos_vistos_intermediacion
  FOR SELECT USING (
    prestadora_id = interno.prestadora_actual()
    AND EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid()
                AND u.rol IN ('admin_prestadora', 'coordinador'))
  );
```

`guardias_tracking_gps` guarda el histórico de posiciones del Asistente durante una guardia
activa, que es un dato personal sensible bajo la Ley 25.326 (geolocalización de una persona
física).

## Datos sensibles — qué nunca se loguea ni va en URL/GET

- Lo que cobra cada Asistente, honorarios.
- Certificados médicos, antecedentes penales.
- Fotos de identidad del Asistente (la del documento y la de la cara), en el depósito
  `fotos-identidad`.
- Datos de salud del paciente (`informacion_de_salud_del_paciente`, indicaciones de medicación,
  contenido de `reportes`).
- Texto libre de reportes y salida de los prompts de IA (ver `AI_PROMPTS.md`).

Estos datos viajan solo en el body de requests autenticadas, nunca en query params, nunca
en logs de aplicación accesibles a todo el equipo.

## Dónde vive cada secreto

En `docs/SECRETOS.md`: qué secreto existe, para qué sirve, dónde vive, qué se rompe mientras se
rota y cuándo se rotó por última vez. Sin ningún valor adentro, y no se le agrega ninguno.

## Cumplimiento normativo

Lo de cada país está en su documento, en `docs/legal/<país>.md`, con el artículo de cada norma y el
estado del producto frente a ella; lo que no es de un país, en `docs/CUMPLIMIENTO_NORMATIVO.md`; lo que se va a construir, en `docs/PLAN_HASTA_PRODUCCION.md`. Acá no se
duplica ninguna de las tres cosas.

Lo que no espera: Careonys trata datos de salud, así que lo alcanzan HIPAA en Estados Unidos, el
Reglamento General de Protección de Datos en Europa y las leyes de los diez países
latinoamericanos relevados —no sólo la Ley 25.326 argentina—. **Y los datos están alojados en São
Paulo**, lo que para todo país que no sea Brasil es transferencia internacional.

## Verificación de antecedentes penales (etapa 3 del Proceso de Incorporación de Asistentes)

Es un proceso manual: consulta al Registro Nacional de Reincidencia, con renovación anual. El
producto no está conectado con ningún proveedor de esa consulta.

## Referencias laborales del Asistente

Viven en `referencias_laborales_asistente`, una por una, para poder llamarlas y dejar constancia
de qué contestó cada una; cuántas verificadas espera cada Prestadora, en
`configuracion_referencias_laborales.minimo_verificadas` (entre 0 y 5).

- **La firma de la verificación —`verificada_por` y `verificada_en`— la escribe el backend**,
  nunca la pantalla: por eso esas rutas van por `/api/panel/referencias-laborales` y no por
  Supabase directo. El CHECK `referencias_laborales_asistente_verificada_tiene_firma` impide que
  una referencia quede con resultado y sin firma.
- **Llegan solas desde la postulación:** `POST /api/panel/cuentas/asistente` copia las que la
  persona cargó en su formulario, todas en `pendiente`. También se pueden cargar a mano, hasta el tope de
  cinco, que es el mismo que admite ese formulario.
- **El mínimo no bloquea nada.** La decisión es de la Prestadora (`celtatech/CLAUDE.md`, «El
  riesgo legal»).
- Los cuatro resultados y la cuenta contra el mínimo viven en
  `panel/src/lib/referenciasLaborales.js`, que es el original de la copia que usa el backend.

## Verificación de identidad (etapa del Proceso de Incorporación de Asistentes)

Las dos fotos con las que se verifica la identidad —la del documento y la de la cara— viven en el
depósito `fotos-identidad`.

- **Es privado y tiene una sola política**, `fotos_identidad_las_alcanza_quien_administra_o_coordina`,
  para quien tiene sesión y para todas las operaciones —leer, subir, reemplazar y borrar—. Exige
  que la primera carpeta de la ruta sea la Prestadora de la sesión (`interno.prestadora_actual()`), y
  adentro de ella alcanza al Administrador y al Superadmin con cualquier foto, y al Coordinador sólo
  con las de un Asistente a su alcance (`interno.coordinador_alcanza_asistente`, con la segunda
  carpeta de la ruta, que tiene que ser un identificador válido; si no lo es, niega). El backend lo
  escribe y lo lee con la sesión de quien pide, así que es esa política la que decide
  (`backend/src/routes/panelVerificacionIdentidad.js`).
  `certificados-medicos` y `autorizaciones-monitoreo` también tienen sus políticas.
- **La ruta empieza por la Prestadora** y se arma siempre con los mismos tres datos —Prestadora,
  Asistente y cuál de las dos fotos es—, nunca con algo que venga en el pedido. Va sin extensión:
  el formato viaja en el tipo de contenido. Qué tipos hay y cómo se arma la ruta está en
  `panel/src/lib/fotosDeIdentidad.js`, que es el original de la copia que usa el backend.
- **No hay ninguna columna que diga si una foto está cargada.** Como la ruta se deduce, el archivo
  es la única verdad posible; una columna podría decir que sí cuando el archivo ya no está.
- **Las fotos se sirven con enlace temporal que vence al minuto**, nunca con dirección pública.
- **Comparar las dos caras no lo hace el producto.** Hoy las mira una persona y marca la etapa.
  Compararlas automáticamente es tratamiento de dato biométrico, y el producto no lo hace.
