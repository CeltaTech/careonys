# Kickoff — Implementación de la migración multi-tenant (PLM Systems)

Arranca la implementación real de `docs/PLAN_MULTITENANT_PLM.md`. El plan y el diseño ya
están aprobados en su totalidad (tabla de trazabilidad completa, sin filas pendientes) — lo
único que faltaba era la decisión 4.1, que queda resuelta ahora:

## Decisión 4.1 — resuelta: opción (a)

Se renombra `admin` → `admin_prestadora`. `superadmin` pasa a ser el rol cross-tenant real de
PLM Systems (ve todas las prestadoras). Motivo, para que quede registrado en
`docs/PLAN_MULTITENANT_PLM.md` junto con la decisión: alinea con práctica estándar de la
industria en RBAC multi-tenant — un rol sin contexto de tenant en el nombre (`admin` a secas)
es, según múltiples guías de arquitectura de autorización (WorkOS, Auth0, AWS Prescriptive
Guidance), el patrón que más frecuentemente deriva en bugs de seguridad por chequeos que
asumen roles globales. Además, hacerlo ahora —con un solo tenant real y pocos usuarios— es
muchísimo más barato que hacerlo con varias prestadoras ya operando.

Actualizar la sección 4.1 del plan marcándola como **resuelta (opción a)**, con la fecha de
hoy, antes de tocar código.

## Alcance de este kickoff — qué se implementa ahora, qué queda para después

Siguiendo el orden sugerido en la sección 4.5 del plan, **este kickoff cubre únicamente el
aislamiento de datos** (sección 2 del plan, pasos 1 a 6, más el rename de rol que motiva la
decisión 4.1). **No** entra en este alcance:

- **Facturación (sección 3.5)** — queda para después, cuando exista la decisión de negocio
  de qué esquema de precio y periodicidad se usa con prestadora-original en concreto (punto 4.3 del
  plan). No crear ni las tablas todavía — evitemos tener schema sin uso real dando vueltas.
- **Branding por tenant y multi-moneda en UI** — después del aislamiento de datos, como
  indica el propio orden sugerido.
- Cualquier cambio al modelo directo o al match de prestadora-original — el cambio es aditivo, no
  se toca nada de lo que ya funciona.

## Trabajo a realizar, en este orden, con checkpoint antes del paso más sensible

### Bloque 1 — aditivo puro, bajo riesgo (pasos 1-4 de la sección 2 + rename de rol)

1. Crear la tabla `prestadoras` (diseño 3.1) e insertar la fila de prestadora-original Salud
   (`estado = 'certificada'`, `pais = 'AR'`).
2. Agregar `prestadora_id UUID REFERENCES prestadoras(id)` **nullable** a cada tabla listada
   en la sección 1.1 del plan (excepto `verificaciones_asistente`, que hereda vía
   `asistente_id`, y `escalas_legales`, que queda global por ahora).
3. Backfill: `UPDATE tabla SET prestadora_id = '<id-prestadora-original>' WHERE prestadora_id IS NULL`,
   un script por tabla, verificado con `SELECT count(*) WHERE prestadora_id IS NULL` = 0 antes
   de seguir.
4. Volver la columna `NOT NULL` una vez confirmado el backfill completo en cada tabla.
5. Rename de rol: `UPDATE usuarios SET rol = 'admin_prestadora' WHERE rol = 'admin'`, y los
   puntos de código exactos que ya identificó el inventario (sección 3.4 del plan):
   `panel/src/lib/roles.js:8`, `backend/src/middleware/requiereRolPanel.js:22`,
   `backend/src/routes/panelUsuarios.js:12,19-21`. Actualizar también el `CHECK` de
   `usuarios.rol` en el schema para que acepte `admin_prestadora` en vez de `admin`.
6. Actualizar el glosario de `CLAUDE.md` con la entrada `admin_prestadora` (y confirmar que
   la entrada de "Desarrollador" del mensaje anterior ya quedó aplicada correctamente antes
   de seguir — si no, resolverla primero).

Cada paso de este bloque se aplica y verifica contra Supabase real antes de pasar al
siguiente, como ya es el criterio del proyecto — no se acumulan varios pasos sin verificar.

**Parar acá y reportar** (resumen de lo aplicado, resultado de cada verificación, cualquier
imprevisto) antes de continuar al Bloque 2. Este bloque es aditivo y de bajo riesgo, pero el
siguiente toca políticas de seguridad sobre datos de salud y laborales — quiero ver el estado
real antes de seguir, no asumir que salió bien.

### Bloque 2 — RLS (paso 5 de la sección 2) — recién con aprobación explícita después del Bloque 1

1. Crear las funciones `current_tenant()`/`es_superadmin()` (diseño exacto en 3.6 del plan).
2. Reescribir las policies existentes usándolas, empezando por `pacientes`, `ceses`,
   `ausencias` (mayor exigencia regulatoria — Ley 25.326 y datos laborales sensibles) y
   siguiendo con el resto de `schema_etapa2i.sql` y los `schema_etapa2*.sql` anteriores.
3. Mismo criterio de verificación incremental contra Supabase real, tabla por tabla.

### Bloque 3 — backend (paso 6 de la sección 2) — el de mayor riesgo de seguridad

Actualizar cada ruta de `backend/src/routes/*.js` que usa la Service Role Key para filtrar
explícitamente por `prestadora_id` — este paso no lo cubre ninguna policy de RLS porque el
backend bypassea RLS por diseño (es el hallazgo central del inventario, sección 1 del plan).
Ir ruta por ruta, no de una sola vez — reportar cuáles rutas se tocaron y cuáles quedan
pendientes si no se termina en la misma sesión.

### Bloque 4 — `configuracion_empresa` y hardcodeos estructurales (pasos 7-8 de la sección 2)

Migrar `configuracion_empresa` (singleton, `CHECK (id = 1)`) a `configuracion_prestadora`
(diseño 3.2), y parametrizar los hardcodeos estructurales de la sección 1.5 del plan
(`email.js`, `generarDocumentoCese.js`, `calcularCese.js`, `configuracionPublica.js`,
`panelConfiguracion.js`). Los hardcodeos que son solo texto de marca (logo, i18n) quedan
para cuando se implemente branding por tenant — no es parte de este bloque.

## Reglas de todo el kickoff

- Ninguna tabla de datos existente pierde información — todo el plan es no destructivo, tal
  como está diseñado.
- Actualizar `docs/PROGRESS.md` al cierre de cada bloque (no solo al final de todo), con el
  mismo nivel de detalle que las actualizaciones anteriores del archivo.
- Si en cualquier punto el código real difiere de lo que asume el plan (una tabla con
  columnas distintas a las documentadas, una policy que ya no está donde se la ubicó en el
  inventario), parar y reportarlo en vez de improvisar una solución — mismo criterio que ya
  se usó para el inventario original.
- Actualizar `docs/BUILD_ORDER.md`, fila "Multi-tenancy real", de "Diferida" a "En progreso"
  al arrancar el Bloque 1.
