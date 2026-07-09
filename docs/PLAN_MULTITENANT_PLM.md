# PLAN_MULTITENANT_PLM.md — Inventario + plan de migración a multi-tenant (PLM Systems)

> Responde a los 4 puntos de "Lo que sí te pedimos ahora" en
> `docs/Prompt_Claude_Code_PLM_Multitenant.md`. Es un documento de **plan**, no de
> implementación — ningún código de producto se tocó para escribir esto. No arrancar la
> implementación de ninguna sección sin aprobación explícita del usuario, punto por punto
> (hay varias decisiones de diseño con implicancias grandes marcadas explícitamente en la
> sección 4).

## 1. Inventario — qué asume hoy "una sola organización" (prestadora-original)

Relevamiento completo del repo (`backend/`, `panel/`, `sitio-web/`, `docs/DATA_MODEL.md`,
`docs/SECURITY.md`). Resumen ejecutivo:

- El **único eje de segmentación de datos hoy es el rol** (`usuarios.rol`), combinado
  opcionalmente con **zona geográfica** (`usuarios.zonas`/`asistentes.zonas`, array-overlap).
  No existe ningún eje de "organización" en ninguna tabla.
- El patrón RLS dominante — "admin/superadmin ven todo", "coordinador ve por zona (`&&` de
  arrays)", consolidado en `backend/src/db/schema_etapa2i.sql` — es **extensible casi 1:1**
  al patrón de tenant: donde hoy hay `u.zonas && tabla.zonas`, el equivalente sería
  `u.prestadora_id = tabla.prestadora_id`. Buena noticia arquitectónica: hay un molde ya
  probado, no hace falta inventar el patrón de RLS desde cero.
- El caso mono-tenant más **literal y duro** (no solo ausencia de columna, sino constraint
  SQL que lo prohíbe) es `configuracion_empresa` (`backend/src/db/schema_etapa2h.sql`):
  `id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1)`. Esta tabla no puede evolucionar por
  `ALTER TABLE` incremental — tiene que reemplazarse por la entidad `prestadoras`.
- El **riesgo de seguridad mayor** de la migración no es el panel (protegido por RLS con la
  anon key) sino el **backend con Service Role Key** (`backend/src/routes/*.js`), que
  bypassea RLS por diseño. Cada ruta ahí necesita el filtro de `prestadora_id` agregado
  explícitamente en el código — ninguna policy de base lo va a hacer por él.
- `zonas` (geografía) y `prestadora` (tenant) son ejes **ortogonales** — dos prestadoras
  pueden operar en la misma zona, una prestadora puede operar en varias zonas. No mezclar
  ambos conceptos en el modelo de datos ni en RLS.
- Las tablas de mayor exigencia regulatoria (Ley 25.326) para el aislamiento son
  `pacientes` (datos de salud) y `ceses`/`ausencias`/`escalas_legales` (datos laborales) —
  deberían priorizarse primero en cualquier migración incremental.

### 1.1 Tablas de negocio sin columna de organización (todas las creadas hasta hoy)

| Tabla | Creada en | Prioridad de aislamiento |
|---|---|---|
| `usuarios` | `schema_etapa2.sql` | Alta — es la raíz de todo el resto |
| `asistentes` | `schema_etapa2b.sql` | Alta — ya tiene `prestadora_id` **documentado mas no aplicado** en `DATA_MODEL.md` (ver 1.2) |
| `verificaciones_asistente` | `schema_etapa2b.sql` | Media — hereda tenant vía `asistente_id`, no necesita columna propia |
| `ausencias`, `guardias_cobertura` | `schema_etapa2b.sql` | Alta (datos laborales) |
| `ceses` | `schema_etapa2b.sql` | Alta (datos laborales sensibles) |
| `clientes`, `pacientes` | `schema_etapa2c.sql` | Alta (`pacientes` = datos de salud, Ley 25.326) |
| `lista_precios`, `prestaciones`, `paquetes_prestaciones`, `paquete_prestacion_items` | `schema_etapa2d.sql` | Media — a decidir si lista de precios es por prestadora o catálogo sugerido compartido |
| `certificados` | `schema_etapa2f.sql` | Media — es además el objeto que necesita branding por tenant (QR, marca visible al cliente) |
| `configuracion_empresa` | `schema_etapa2h.sql` | **Crítica** — `CHECK (id = 1)` bloquea multi-tenant a nivel de constraint |
| `zonas_cobertura`, `configuracion_notificaciones` | `schema_etapa2h.sql` | Media — hoy son globales, ver sección 1.3 |
| `solicitudes`, `postulaciones` | `schema.sql` (Etapa 1) | Baja/media — entrada cruda del sitio público, relevante solo si el sitio se vuelve white-label multi-marca |

Tablas documentadas en `DATA_MODEL.md` pero **aún no creadas** en SQL real (`guardias`,
`reportes`, `alertas`, `validaciones_faciales` — Etapas 3/4): conviene diseñarlas con
`prestadora_id` desde que se creen, no agregarlo después.

**Probablemente deba quedar global/compartida**: `escalas_legales` (valores de LCT/CCT
743/16 argentinos, iguales para cualquier prestadora que opere en Argentina). Si se licencia
a prestadoras de otro país, deja de ser universal — necesitaría un campo de jurisdicción,
no `prestadora_id` (relacionado al punto 6 del prompt de negocio, residencia de datos). **Ese
mismo campo de jurisdicción va de la mano con moneda** (ver 1.8 y 4.2): un valor legal de
otro país está expresado en otra escala numérica y en otra moneda a la vez — no son dos
features independientes, es un único cambio de forma en esta tabla puntual cuando llegue el
caso. Diseño propuesto en 3.7.

### 1.2 Detalle no trivial: `asistentes.prestadora_id` ya existe en la documentación

`docs/DATA_MODEL.md` (sección "Tabla: asistentes") ya tiene:

```sql
prestadora_id UUID REFERENCES prestadoras(id),  -- nullable, soporte futuro modelo B2B
```

con la nota: *"`prestadora_id` es la recomendación de `prestadora-original_Modelo_B2B_v1.md`... La tabla
`prestadoras` no se crea todavía — es un placeholder de FK para el futuro"*. Es decir, el
proyecto ya había anticipado parcialmente esto (probablemente pensado para el caso más
acotado "un Asistente que pertenece a una prestadora tercera dentro del negocio B2B de
prestadora-original", no para el multi-tenancy completo de PLM). **Esta columna documentada nunca se
aplicó contra Supabase real** — no existe en ningún `schema_etapa2*.sql` real. El diseño de
la sección 3 de este documento la reutiliza pero le cambia el sentido: no es "un Asistente
de una prestadora tercera dentro de prestadora-original", es "a qué prestadora licenciataria pertenece
este registro completo".

### 1.3 Zonas vs. prestadora — no colapsar

`zonas_cobertura` (catálogo público de barrios/partidos) y `usuarios.zonas`/`asistentes.zonas`
(asignación operativa de Coordinador) son ejes independientes de `prestadora_id`. Una
prestadora puede operar en una o varias zonas; dos prestadoras pueden compartir zona. El
filtro de Coordinador en el diseño multi-tenant sería compuesto: `prestadora_id` **Y**
`zonas`, nunca uno sustituyendo al otro.

### 1.4 Roles — dónde encaja "administrador de prestadora"

`panel/src/lib/roles.js` hoy solo define `esAdminOSuperior()` y `ROLES_PANEL = ['admin',
'coordinador', 'superadmin']`. El rol es el único eje de autorización — no existe tabla
rol↔organización. Puntos de código que hoy asumen "admin ve todo, literalmente todo" y que
habría que tocar: `backend/src/middleware/requiereRolPanel.js`,
`panelUsuarios.js` (`rolesGestionables()`), `roles.js`, y cada policy `admin_*` de los
`schema_etapa2*.sql`.

**Decisión de diseño que esto obliga a tomar (ver sección 4.1)**: ¿el rol `admin` de hoy
pasa a estar acotado a su propia prestadora, y `superadmin` pasa a ser el único rol
verdaderamente cross-tenant (el de PLM Systems)? Esto es un cambio de semántica del rol
`admin` existente, no solo un rol nuevo — hay que decidirlo antes de tocar código.

### 1.5 Hardcodeos de "prestadora-original como única organización posible" (estructurales, no solo marca)

- `configuracion_empresa.id CHECK (id = 1)` (`schema_etapa2h.sql`) y sus dos consumidores
  (`backend/src/routes/configuracionPublica.js`, `backend/src/routes/panelConfiguracion.js`)
  — el caso más literal, ver 1.1.
- `backend/src/utils/email.js` — un único remitente SMTP global (`SMTP_USER`/`SMTP_PASSWORD`)
  para todos los tenants.
- `configuracion_notificaciones` — destinatarios de alertas operativas son una lista global,
  no por prestadora.
- `sitio-web/src/config/siteConfig.js` — objeto de módulo único (teléfono, email, dominio,
  zona de cobertura), asume una sola marca para todo el sitio público.
- `panel/src/lib/generarDocumentoCese.js` — el documento legal de cese hardcodea "prestadora-original
  Salud" como la razón social empleadora en el template.
- `panel/src/lib/calcularCese.js` — texto de advertencia que asume que la única alternativa
  a "vínculo directo con cliente" es "prestadora-original".

**Hardcodeos que son solo texto de marca (prestadora-original seguirá siendo un tenant real llamado
así, no requieren cambio funcional hoy, sí cuando se implemente branding por tenant)**:
`panel/src/components/layout/Layout.jsx` (logo), `panel/src/i18n/translations.js` (~20
menciones de "prestadora-original"/"prestadora-original Salud" en textos de certificado/equipo/facturación),
`backend/src/routes/panelNotificaciones.js` (firma de emails en 3 idiomas).

### 1.6 Módulo de compliance documental — **no existe ninguna huella en el repo hoy**

Búsqueda explícita (`compliance`, `constancia de pago`, `seguro de riesgos del trabajo`,
`ART`, "verificación documental") en `docs/`, `backend/`, `panel/`, `sitio-web/`: **no hay
ninguna referencia a este módulo en ningún schema, PRD, ni comentario del código** — ni
siquiera como placeholder. No es un olvido de este inventario, es una ausencia confirmada:
el prompt de negocio lo describe como pieza no negociable (protege legalmente el modelo de
licenciamiento frente a incumplimientos laborales de terceros), pero hoy no existe nada que
se le parezca a nivel de prestadora.

Lo único remotamente relacionado que existe hoy son tres columnas de vencimiento en
`asistentes` (`backend/src/db/schema_etapa2b.sql:70-72`: `vencimiento_monotributo`,
`vencimiento_art`, `vencimiento_seguro`) y el job `backend/src/utils/vencimientos.js`, que
una vez por día avisa por email a Coordinadores sobre vencimientos próximos de esas tres
fechas. Esto es un caso completamente distinto y no debe confundirse con el módulo pedido:

- Es **por Asistente individual**, no por prestadora — no hay ningún concepto de "empresa
  licenciataria" ahí, solo el vínculo laboral de un trabajador con prestadora-original.
- Es **solo una fecha de vencimiento**, sin registro histórico de verificación — no guarda
  quién verificó el documento, cuándo, ni el documento en sí (no hay `documento_url` ni
  `verificado_por`). No cumple el requisito de "registro con fecha cierta e inmutable de
  cada verificación" que pide el prompt.
- No dispara nada más que un email — no hay estado de "vencido" ni bloqueo de ningún flujo
  cuando vence.

**Conclusión**: el módulo de compliance por prestadora es una pieza **completamente nueva a
diseñar desde cero**, no una tabla existente a extender. Se relaciona con dos entidades ya
relevadas: la futura `prestadoras` (dueña del checklist) y, indirectamente, `asistentes`
(cuyo propio patrón de vencimientos individual — sección de arriba — es un precedente de
diseño útil pero insuficiente, ya que resuelve un problema distinto: cumplimiento de UN
trabajador, no de la prestadora que lo emplea). El diseño de tabla propuesto para esto está
en la sección 3.3 más abajo.

### 1.7 Facturación dual (PLM↔prestadora, prestadora-original↔prestadora) — no existe ningún concepto de "emisor" hoy

Búsqueda explícita de `factura`, `emisor`, `billing`, `licencia` contra todo el repo: la
única aparición de "licencia" en código real es `licencia GCBA` (habilitación sanitaria del
negocio de prestadora-original, no tiene nada que ver con licenciamiento de software) y menciones en
i18n de "Certificado" — **no existe ninguna tabla, columna ni concepto de "quién emite la
factura" en ningún lado**. El sistema asume, igual que con `configuracion_empresa`, que solo
hay una parte que cobra (implícitamente prestadora-original) — el mismo patrón mono-tenant de la sección
1.5, aplicado a facturación.

Relación con lo ya relevado en `lista_precios`/`prestaciones`/`paquetes_prestaciones`
(`backend/src/db/schema_etapa2d.sql`, ver 1.1):

- Estas tres tablas resuelven **cuánto le cobra prestadora-original a un Cliente** por la prestación de
  cuidado (precio de lista → precio final con descuento, snapshot al momento de armarse). Es
  un concepto de negocio **totalmente distinto** al que pide el prompt: facturación B2B de
  PLM/prestadora-original hacia una **prestadora**, no de prestadora-original hacia un Cliente. No hay ningún
  cruce de datos entre ambos hoy, y no debería haberlo — son dos facturaciones con
  contrapartes distintas (Cliente vs. Prestadora).
- Ninguna de las tres tablas tiene columna de moneda ni de emisor (ver 1.8).
- No hace falta modificar estas tablas para resolver el punto 4 del prompt — son
  independientes. Lo que hace falta es **crear tablas nuevas** para la relación
  PLM/prestadora-original↔Prestadora, que no tiene ningún antecedente parcial en el esquema actual (a
  diferencia de compliance, acá ni siquiera hay una pieza parcial como los campos de
  vencimiento de 1.6).

A nivel de inventario (sin diseño completo todavía, eso está en la sección 3.5), lo mínimo
que hace falta:

- Una tabla que registre, por prestadora, **qué esquema de precio tiene contratado** (por
  caso activo, por personal certificado, fee fijo) y con qué monto/moneda — hoy no existe
  ningún lugar donde esto se pudiera guardar, ni siquiera de forma genérica.
- Una tabla de **comprobantes/facturas** con un campo explícito de **empresa emisora**
  (`PLM` | `prestadora-original`) y numeración propia por emisor — hoy no hay ningún concepto de emisor
  en absoluto, todo el sistema asume una sola parte que cobra.

### 1.8 Multi-moneda — confirmado: todos los montos asumen ARS implícito, sin columna de moneda

Revisión de cada tabla con campos de dinero:

| Tabla.columna | Archivo:línea | Moneda explícita? |
|---|---|---|
| `lista_precios.precio` | `schema_etapa2d.sql:16` | No — `NUMERIC(12,2)`, sin columna de moneda |
| `prestaciones.precio_lista_snapshot`, `.valor_descuento`, `.precio_final` | `schema_etapa2d.sql:56,58,59` | No |
| `paquetes_prestaciones.precio_paquete` | `schema_etapa2d.sql:79` | No |
| `asistentes.valor_hora`, `.sueldo_basico` | `schema_etapa2b.sql:67-68` | No |
| `escalas_legales.valor` | `schema_etapa2b.sql:135` | No (columna `unidad` existe — `monto_fijo_mensual`\|`porcentaje`\|`dias`\|`meses`\|`monto_por_hora` — pero describe la **unidad de medida** del valor, no la moneda; coherente con que hoy `escalas_legales` es exclusivamente derecho argentino, ver 1.1) |
| `ceses.monto_total` | `schema_etapa2b.sql` (tabla `ceses`) | No |
| `guardias_cobertura.costo_adicional` | `schema_etapa2b.sql` (tabla `guardias_cobertura`) | No |

**Ningún campo de dinero en todo el schema actual tiene columna de moneda.** Todo el
sistema asume ARS de forma puramente implícita (nunca escrita, ni siquiera como comentario)
en cada uno de estos siete puntos. Esto confirma exactamente lo que pide el punto 5 del
prompt de negocio — no es una omisión menor, es una ausencia total y consistente en todas
las tablas monetarias existentes.

### 1.9 Sistema de creación de cuentas (`backend/src/utils/cuentasPanel.js`)

`crearCuentaConPerfil()` (compartida por `panelCuentas.js` y `panelUsuarios.js`) no recibe
ni acepta ningún parámetro de organización. `borrarCuenta()` tampoco valida organización del
que borra. El vínculo `auth.users` ↔ `usuarios` es 1:1 por `id` — **limitación estructural**:
hoy es imposible que la misma persona (mismo email) tenga cuentas en dos prestadoras
distintas sin duplicar el registro de Auth con otro email. Probablemente no sea un problema
de negocio real (raro que alguien trabaje para dos prestadoras competidoras a la vez), pero
queda señalado.

---

## 2. Plan de migración de datos propuesto (sin perder datos de prestadora-original, sin romper producción)

Migración **incremental y no destructiva**, en el mismo estilo de `schema_etapa2*.sql` ya
usado en el proyecto (una migración por paso, aplicada y verificada contra Supabase real
antes de la siguiente). Orden propuesto:

1. **Crear la tabla `prestadoras`** (diseño completo en sección 3) e insertar una única fila
   para prestadora-original Salud (la prestadora "cero", ya operando). Nada más cambia en este paso —
   es aditivo puro, cero riesgo de romper producción.
2. **Agregar `prestadora_id UUID REFERENCES prestadoras(id)` nullable** a cada tabla listada
   en 1.1 (excepto `verificaciones_asistente`, que hereda vía `asistente_id`, y
   `escalas_legales`, que queda global). Todavía nullable — sigue sin romper nada.
3. **Backfill**: un `UPDATE tabla SET prestadora_id = '<id-prestadora-original>' WHERE prestadora_id IS
   NULL` por cada tabla — un solo script, una sola vez, con las credenciales del archivo de
   claves (nunca en chat), igual que se hizo con `schema_etapa2o.sql`.
4. **Volver la columna `NOT NULL`** una vez confirmado el backfill completo (chequeo simple:
   `SELECT count(*) FROM tabla WHERE prestadora_id IS NULL` debe dar 0 en todas).
5. **Crear las funciones `current_tenant()`/`es_superadmin()`** (detalle y justificación en
   sección 3.6) y **reescribir las policies RLS** existentes usándolas en vez de repetir la
   subquery `EXISTS (SELECT 1 FROM usuarios u WHERE ...)` completa en cada una — empezando
   por `pacientes`/`ceses`/`ausencias` (mayor exigencia regulatoria, ver resumen ejecutivo de
   la sección 1) y siguiendo con el resto de `schema_etapa2i.sql` y los `schema_etapa2*.sql`
   anteriores. Un `schema_etapa2X.sql` por tabla o un solo archivo grande, a discreción de
   cuando se ejecute, pero aplicado y verificado contra Supabase real antes de dar el paso
   por completo (regla ya establecida del proyecto).
6. **Actualizar el backend** (rutas con Service Role Key) para filtrar explícitamente por
   `prestadora_id` en cada query — es el paso de mayor riesgo de seguridad si se omite (ver
   1.1), y no lo cubre ninguna policy de RLS porque el backend bypassea RLS por diseño.
7. **Migrar `configuracion_empresa`** de singleton a una fila de configuración por
   prestadora (ver sección 3.2) — es el único paso que requiere un cambio de forma, no solo
   de columna agregada, porque el `CHECK (id = 1)` actual lo impide estructuralmente.
8. **Reemplazar/parametrizar los hardcodeos de la sección 1.5** — empezar por los
   estructurales (email, documento de cese, config pública), dejar los de marca/branding
   para cuando se implemente el branding por tenant real (no es parte del aislamiento de
   datos, es una feature de valor de producto aparte).

Este orden prioriza primero el aislamiento de los datos más sensibles (paso 2-6 cubre
`pacientes`, `ceses`, `ausencias`) antes de tocar lo cosmético/config (pasos 7-8).

---

## 3. Diseño de la entidad `prestadoras`, compliance documental y roles

### 3.1 Tabla `prestadoras`

```sql
CREATE TYPE estado_prestadora AS ENUM (
  'prospecto', 'en_certificacion', 'certificada', 'suspendida', 'dada_de_baja'
);

CREATE TABLE prestadoras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  razon_social TEXT NOT NULL,
  nombre_fantasia TEXT NOT NULL,        -- marca que ve el cliente/paciente final (branding)
  identificacion_fiscal TEXT NOT NULL,  -- CUIT u equivalente según país
  pais TEXT NOT NULL DEFAULT 'AR',      -- ligado a punto 6 del prompt (residencia/jurisdicción)
  estado estado_prestadora NOT NULL DEFAULT 'prospecto',
  zonas_operacion TEXT[],               -- eje independiente de usuarios.zonas (ver 1.3)
  plan_licencia TEXT,                   -- ver 3.4, esquema de facturación contratado
  fecha_alta DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

Fila inicial (migración, paso 1 de la sección 2): una prestadora con
`razon_social`/`nombre_fantasia` = "prestadora-original Salud", `estado = 'certificada'`,
`pais = 'AR'`.

### 3.2 Reemplazo de `configuracion_empresa`

En vez de una tabla singleton global, la configuración por-tenant (branding, remitente de
notificaciones, destinatarios de alertas) pasa a ser una tabla `configuracion_prestadora`
con `prestadora_id UNIQUE REFERENCES prestadoras(id)` — una fila por tenant, sin `CHECK
(id=1)`. Los campos hoy en `configuracion_empresa`/`configuracion_notificaciones` se
mudan ahí tal cual, solo cambia la clave de particionado.

### 3.3 Compliance documental por prestadora

Registro **append-only** (nunca se actualiza una fila existente, se inserta una nueva por
cada verificación — para que quede fecha cierta e inmutable, tal como pide el punto 2 del
prompt de negocio):

```sql
CREATE TYPE tipo_compliance AS ENUM (
  'identificacion_trabajador', 'constancia_pago', 'seguro_riesgos_trabajo'
);
CREATE TYPE estado_compliance AS ENUM ('pendiente', 'verificado', 'vencido', 'rechazado');

CREATE TABLE compliance_prestadora (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prestadora_id UUID NOT NULL REFERENCES prestadoras(id),
  tipo tipo_compliance NOT NULL,
  estado estado_compliance NOT NULL DEFAULT 'pendiente',
  documento_url TEXT,
  vigencia_desde DATE,
  vigencia_hasta DATE,           -- dispara alerta de vencimiento antes de esta fecha
  verificado_por UUID REFERENCES usuarios(id),
  verificado_en TIMESTAMPTZ,
  observaciones TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_compliance_prestadora ON compliance_prestadora (prestadora_id, tipo, vigencia_hasta);
```

El "estado de compliance vigente" de una prestadora para un tipo de documento se calcula
como la fila más reciente de ese `tipo` con `vigencia_hasta` no vencida — nunca se
sobreescribe una fila vieja (protege la trazabilidad legal que sostiene el modelo de
negocio, según el propio prompt).

### 3.4 Roles nuevos y puntos exactos de código a tocar

- **`admin_prestadora`** (nuevo valor del `CHECK` de `usuarios.rol`, o revisión del rol
  `admin` existente — ver decisión abierta 4.1): acceso de gestión a los datos de su propia
  `prestadora_id` únicamente — su personal, sus pacientes/casos, sus reportes y alertas.
  Cero visibilidad de otras prestadoras.
- **`superadmin`** pasa a ser, en el diseño multi-tenant, el rol de **PLM Systems**:
  cross-tenant real, ve todas las prestadoras. Esto es coherente con cómo ya está descripto
  en `docs/SECURITY.md` (login propio, separado de `admin`) pero cambia su alcance de
  "toda prestadora-original" a "toda la plataforma, todas las prestadoras".
- **`financiador`** (obra social/prepaga): contemplado en el diseño (nombre de rol, alcance
  de solo lectura agregada), **no implementado** — tal como pide el punto 3 del prompt de
  negocio.

Puntos de código concretos que hay que tocar si se ejecuta la opción (a) de 4.1
(`admin` → `admin_prestadora`, `superadmin` = PLM cross-tenant):

- `panel/src/lib/roles.js:8` — `ROLES_PANEL = ['admin', 'coordinador', 'superadmin']` pasa a
  `['admin_prestadora', 'coordinador', 'superadmin']`. `esAdminOSuperior()` (línea 4-6) queda
  igual en forma, solo cambia el string comparado.
- `backend/src/middleware/requiereRolPanel.js:22` — el `.includes(perfil.rol)` contra
  `['admin', 'coordinador', 'superadmin']` es la puerta de entrada de **todas** las rutas de
  panel; se actualiza ahí y en ningún otro lado (es el único punto de verdad de "¿este rol
  puede entrar al panel?").
- `backend/src/routes/panelUsuarios.js:12` (`requiereAdminOSuperior`) y `:19-21`
  (`rolesGestionables()`): hoy `rolesGestionables('superadmin')` devuelve
  `['admin', 'coordinador', 'superadmin']` y cualquier otro rol devuelve solo `['coordinador']`
  — es decir, hoy un `admin` **no puede** gestionar otras cuentas `admin`, solo `superadmin`
  puede. Con `admin_prestadora`, este mismo criterio se mantiene pero acotado a la propia
  prestadora: `admin_prestadora` gestiona `coordinador` de su prestadora, `superadmin`
  (PLM) gestiona `admin_prestadora` de cualquier prestadora. Esta función es también donde
  se agregaría, el día que exista, la restricción cross-tenant explícita (un
  `admin_prestadora` no puede editar usuarios de otra `prestadora_id`, algo que hoy no aplica
  porque no hay más de una organización).
- Cada policy `admin_*`/`EXISTS (... u.rol IN ('admin', 'superadmin') ...)` en
  `schema_etapa2i.sql` y el resto de los `schema_etapa2*.sql` — mismo cambio de string, pero
  ver 3.6 antes de tocarlas una por una.

Sobre la opción (b) de 4.1 (no renombrar, solo agregar `admin_prestadora` como sinónimo de
negocio): en ese caso ninguno de los puntos de arriba requiere cambio de string, pero
tampoco resuelve el problema real — `admin` seguiría leyéndose en código como "ve todo,
sin acotar", que es exactamente lo que hay que dejar de asumir. Por eso la recomendación de
4.1 sigue siendo (a), pese al costo de tocar estos puntos.

### 3.5 Facturación — diseño de tablas (para discutir el nivel de detalle antes de implementar)

```sql
CREATE TYPE esquema_facturacion AS ENUM ('por_caso', 'por_personal', 'fee_fijo');
CREATE TYPE empresa_emisora AS ENUM ('PLM', 'prestadora-original');

CREATE TABLE planes_facturacion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prestadora_id UUID NOT NULL REFERENCES prestadoras(id),
  esquema esquema_facturacion NOT NULL,
  monto NUMERIC(14,2) NOT NULL,
  moneda TEXT NOT NULL DEFAULT 'ARS',   -- ISO 4217, nunca asumir ARS implícito (punto 5 del prompt)
  vigencia_desde DATE NOT NULL,
  vigencia_hasta DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE facturas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prestadora_id UUID NOT NULL REFERENCES prestadoras(id),
  empresa_emisora empresa_emisora NOT NULL,  -- separa numeración/comprobantes PLM vs prestadora-original
  numero_comprobante TEXT NOT NULL,          -- secuencia propia por empresa_emisora
  periodo_desde DATE NOT NULL,
  periodo_hasta DATE NOT NULL,
  monto NUMERIC(14,2) NOT NULL,
  moneda TEXT NOT NULL DEFAULT 'ARS',
  tipo_cambio_referencia NUMERIC(12,4),      -- solo trazabilidad, no conversión automática (punto 5)
  fecha_emision DATE NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente',  -- pendiente | pagada | vencida | anulada
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_factura_numero_por_emisor ON facturas (empresa_emisora, numero_comprobante);
```

Este es el nivel de detalle de diagrama que pide el punto 3 del prompt — falta definir con
el usuario (antes de implementar) el formato exacto de numeración fiscal de cada empresa
emisora (depende de la situación de facturación electrónica de cada una en AFIP, que es un
tema legal/contable, no técnico).

### 3.6 RLS: centralizar el chequeo de tenant en una función, no repetir la subquery

`schema_etapa2i.sql` (ver ejemplo real arriba) ya muestra el problema: **cada** policy repite
`EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol IN (...))` completo —
son 3 tablas con 2-3 policies cada una solo en ese archivo, y el patrón se repite en todos
los `schema_etapa2*.sql` restantes. Agregar `prestadora_id` multiplicaría esa subquery (una
condición más) en cada una de esas ~25 policies existentes, y en cada policy nueva de las
tablas de la sección 3 (`compliance_prestadora`, `planes_facturacion`, `facturas`,
`configuracion_prestadora`).

**Decisión: centralizar en una función SQL `current_tenant()`**, en vez de seguir
multiplicando la subquery inline:

```sql
CREATE OR REPLACE FUNCTION current_tenant() RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT prestadora_id FROM usuarios WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION es_superadmin() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND rol = 'superadmin')
$$;
```

Con esto, cada policy nueva o reescrita queda:

```sql
CREATE POLICY "admin_prestadora_lee_asistentes" ON asistentes
  FOR SELECT USING (es_superadmin() OR asistentes.prestadora_id = current_tenant());
```

en vez de repetir el `EXISTS (SELECT 1 FROM usuarios u WHERE ...)` completo. Razones:

- **Un solo lugar para cambiar semántica de tenant** — si mañana la decisión 4.1 cambia
  cómo se calcula "el tenant del usuario actual" (por ejemplo, si un `admin_prestadora`
  pudiera algún día tener acceso a más de una prestadora), se edita una función, no ~25+
  policies repartidas en 10+ archivos `schema_etapa2*.sql`.
- **Menos superficie de error de copy-paste** — la subquery inline ya se repite hoy
  textualmente en cada policy de `schema_etapa2i.sql`; agregar una condición más de tenant a
  mano en cada una es exactamente el tipo de trabajo mecánico donde se desliza un error (una
  policy que se olvida el filtro, por ejemplo).
- **`STABLE` (no `VOLATILE`)** permite que Postgres cachee el resultado dentro de la misma
  consulta en vez de re-ejecutar la subquery por cada fila evaluada — mismo comportamiento
  que ya tienen las subqueries inline actuales, sin penalidad de performance nueva.
- Costo: dos funciones más para mantener, y quien lea una policy aislada ya no ve inline
  qué hace `current_tenant()` — mitigado con el comentario de cabecera que ya usa el
  proyecto en cada archivo `schema_etapa2*.sql` (ver estilo de `schema_etapa2i.sql:1-11`).

Aplica a: todas las policies reescritas en el paso 5 de la sección 2, y a las tablas nuevas
de 3.1-3.5. Las policies de `coordinador` (`u.zonas && tabla.zonas`) se mantienen como
subquery inline aparte — son un eje ortogonal a tenant (ver 1.3), no tiene sentido
fusionarlas en la misma función.

### 3.7 `escalas_legales`: jurisdicción y moneda como un mismo cambio

Hoy `escalas_legales.valor NUMERIC(14,4)` (`schema_etapa2b.sql:135`) no tiene columna de
moneda (confirmado en 1.8) y tampoco tiene columna de jurisdicción (señalado en 1.1/4.2).
Como se corresponden — un valor legal de otro país está en otra escala y en otra moneda a la
vez — se resuelven con el mismo par de columnas, el día que haga falta (no ahora, ver 4.2):

```sql
ALTER TABLE escalas_legales
  ADD COLUMN jurisdiccion TEXT NOT NULL DEFAULT 'AR',  -- ISO 3166-1 alpha-2
  ADD COLUMN moneda TEXT NOT NULL DEFAULT 'ARS';       -- ISO 4217
```

`DEFAULT 'AR'`/`DEFAULT 'ARS'` hace este `ALTER TABLE` aditivo puro sobre las filas
existentes (todas argentinas hoy) — no requiere backfill manual ni rompe las lecturas
actuales del motor de cálculo de indemnizaciones (`docs/PRD_02B_Gestion_Personal.md`), que
seguiría consultando por `tipo`/`categoria`/`vigencia` igual que hoy y simplemente ignoraría
las columnas nuevas hasta que exista una segunda jurisdicción real. Este cambio queda fuera
del plan de 8 pasos de la sección 2 (que es sobre `prestadora_id`, no sobre esta tabla) —
se ejecuta el día que el punto 6 del prompt de negocio (residencia/jurisdicción) deje de ser
solo una bandera y se convierta en un cliente real fuera de Argentina.

### 3.8 Moneda en los campos monetarios restantes (fuera de `escalas_legales` y facturación nueva)

3.5 y 3.7 ya resuelven moneda para las tablas nuevas de facturación y para `escalas_legales`.
Quedan los otros seis puntos de la tabla de 1.8 (`lista_precios`, `prestaciones`,
`paquetes_prestaciones`, `asistentes`, `ceses`, `guardias_cobertura`) — mismo patrón aditivo,
mismo criterio que 3.7: columna `TEXT DEFAULT 'ARS'`, sin backfill manual, sin romper
lecturas actuales.

```sql
ALTER TABLE lista_precios
  ADD COLUMN moneda TEXT NOT NULL DEFAULT 'ARS';   -- schema_etapa2d.sql:16

ALTER TABLE prestaciones
  ADD COLUMN moneda TEXT NOT NULL DEFAULT 'ARS';   -- cubre precio_lista_snapshot/valor_descuento/precio_final,
                                                     -- schema_etapa2d.sql:56,58,59 — una sola columna de moneda
                                                     -- por fila, no una por cada campo de precio: los tres montos
                                                     -- de una misma fila de "prestaciones" son siempre la misma
                                                     -- operación, nunca mezclan moneda entre sí.

ALTER TABLE paquetes_prestaciones
  ADD COLUMN moneda TEXT NOT NULL DEFAULT 'ARS';   -- schema_etapa2d.sql:79

ALTER TABLE asistentes
  ADD COLUMN moneda TEXT NOT NULL DEFAULT 'ARS';   -- cubre valor_hora + sueldo_basico, schema_etapa2b.sql:67-68 —
                                                     -- mismo criterio: un Asistente cobra en una sola moneda

ALTER TABLE ceses
  ADD COLUMN moneda TEXT NOT NULL DEFAULT 'ARS';   -- monto_total, schema_etapa2b.sql

ALTER TABLE guardias_cobertura
  ADD COLUMN moneda TEXT NOT NULL DEFAULT 'ARS';   -- costo_adicional, schema_etapa2b.sql
```

Igual que en 3.7, este `ALTER TABLE` es aditivo puro y **no** forma parte del plan de 8 pasos
de la sección 2 (que resuelve `prestadora_id`, no moneda) — se ejecuta en el mismo momento en
que se materialice el primer caso real de un tenant que no factura en ARS, no antes. Hasta
entonces el `DEFAULT 'ARS'` deja el comportamiento actual exactamente igual para prestadora-original.

---

## 4. Puntos donde el diseño actual complica esto — para discutir antes de escribir código

### 4.1 Cambio de semántica del rol `admin` existente (decisión grande, no técnica)

Hoy `admin` = "ve todo el negocio de prestadora-original". En el diseño multi-tenant, ese mismo alcance
("ve todo dentro de su organización") pasa a llamarse `admin_prestadora`, y `admin` a secas
dejaría de tener sentido como nombre (¿admin de qué?). Dos caminos:

- **(a)** Renombrar el rol existente `admin` → `admin_prestadora` en una migración de datos
  (`UPDATE usuarios SET rol = 'admin_prestadora' WHERE rol = 'admin'`), y reservar
  `superadmin` para PLM Systems cross-tenant.
- **(b)** Mantener `admin` como está (implícitamente escopeado a la prestadora vía RLS) y
  agregar `admin_prestadora` como alias/sinónimo solo para nomenclatura de negocio.

Recomendación: (a) es más limpio a largo plazo pero es un cambio de dato en producción
sobre usuarios reales — **no ejecutar sin que el usuario lo apruebe explícitamente**, y
coordinar con el glosario obligatorio de `CLAUDE.md` (que hoy no menciona `admin_prestadora`
en absoluto).

### 4.2 `escalas_legales` compartida vs. por jurisdicción (y moneda — mismo cambio)

Si la primera prestadora fuera de Argentina llega antes de resolver esto, `escalas_legales`
necesita jurisdicción **y** moneda (diseño ya resuelto en 3.7 — es un único `ALTER TABLE`
aditivo, no dos features separadas) antes de servir datos legales incorrectos, o en la
moneda incorrecta, a un tenant extranjero. No es urgente mientras todos los tenants operen
en Argentina, pero **no asumir que nunca va a pasar** — dejarlo señalado y diseñado (punto 6
del prompt: "dejar preparado, no implementar ya"), ejecutar recién cuando haya un cliente
real fuera de Argentina.

### 4.3 Alcance real del punto 4 del prompt (facturación) — pedido como "implementar ahora"

El prompt de negocio pide explícitamente el módulo de facturación **implementado**, no solo
diseñado. Esto es un cambio de alcance grande (nuevas tablas, lógica de generación periódica
de comprobantes, dos numeraciones fiscales separadas con implicancias contables/AFIP reales
para dos razones sociales distintas). Antes de implementarlo hace falta una decisión de
negocio no técnica: **¿qué esquema de precio se va a usar con prestadora-original en concreto, y con qué
periodicidad se emite?** — sin eso, el módulo se construiría sin poder validarlo contra un
caso real. Recomendación: aprobar primero el diseño de tablas de la sección 3.5, definir ese
dato de negocio, y recién ahí implementar la generación de comprobantes.

### 4.4 Vínculo 1:1 `auth.users` ↔ `usuarios`

Ver 1.6 — una persona no puede hoy pertenecer a dos prestadoras con el mismo email. Señalado,
no bloqueante para el primer cliente adicional a prestadora-original; revisar si en algún momento hay un
caso de negocio real que lo necesite.

### 4.5 Orden de trabajo sugerido (no vinculante, para discutir)

1. Aprobar sección 3.1-3.4 (entidad `prestadoras`, compliance, roles) y la decisión 4.1.
2. Ejecutar pasos 1-6 de la sección 2 (aislamiento de datos) — es lo que habilita tener un
   segundo cliente real sin arriesgar los datos de prestadora-original.
3. Recién después, con un caso de negocio concreto en mano, abordar 3.5 (facturación) según
   4.3.
4. Branding por tenant (logo, textos parametrizados) y multi-moneda en la UI pública, en
   paralelo o después de 3, según cuándo haya un segundo cliente real esperando eso.

---

## Estado de este documento

Es un **plan propuesto**, no una decisión tomada ni código implementado. El sistema sigue
siendo mono-tenant (prestadora-original) en producción. Ningún paso de la sección 2 ni tabla de la
sección 3 se creó todavía contra Supabase real. Requiere aprobación explícita del usuario,
idealmente punto por punto de la sección 4, antes de generar la primera migración SQL real.

---

## Tabla de trazabilidad — estado consolidado

| Punto pedido | Sección del documento |
|---|---|
| Orden de migración priorizado por exigencia regulatoria | Resumen ejecutivo de la Sección 1 + Sección 2 (párrafo de cierre y pasos 2-6) |
| Resolución de `configuracion_empresa` (`CHECK (id = 1)`) sin downtime | Sección 3.2 (diseño de `configuracion_prestadora`) + Sección 2, paso 7 |
| Cómo se puebla `prestadora_id` en los datos existentes de prestadora-original sin intervención manual fila por fila | Sección 2, paso 3 (`UPDATE` masivo con el id de la prestadora prestadora-original, un solo script) |
| Orden de reescritura de policies RLS existentes | Sección 2, paso 5 |
| Diseño de la entidad `prestadoras` | Sección 3.1 |
| Diseño del módulo de compliance documental (checklist, vencimientos, registro inmutable de verificación) | Sección 3.3 |
| Diseño de facturación dual (plan de facturación por prestadora + comprobantes con emisor PLM/prestadora-original y numeración propia) | Sección 3.5 |
| Esquema de roles nuevo (`administrador de prestadora`, `financiador` contemplado sin implementar) | Sección 3.4 |
| Columna de moneda en los 7 campos monetarios relevados | Sección 3.8 (los 6 restantes) + Sección 3.5 (facturación nueva) + Sección 3.7 (`escalas_legales`) |
| `escalas_legales` — jurisdicción + moneda | Sección 3.7 |
| Decisión de centralización RLS (`current_tenant()`/`es_superadmin()`) | Sección 3.6 |

Todas las filas resueltas — ninguna queda en PENDIENTE.
