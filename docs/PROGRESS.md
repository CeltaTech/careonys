# PROGRESS.md — Estado real del proyecto

> Se actualiza al final de cada sesión de trabajo (paso 8 del protocolo de `CLAUDE.md`).
> Este archivo refleja el estado real del código, no el estado deseado — si algo no está
> hecho, dice 🔴 No iniciado, aunque haya PRD escrito para eso.

## Estado por etapa

| Etapa | Descripción | Estado |
|---|---|---|
| 0 | Setup: repo, estructura, variables de entorno | 🟢 Completo |
| 1 | Sitio web público (páginas + formularios + backend) | 🟡 En progreso |
| 2 | Panel de administración | 🔴 No iniciado |
| 2B | Gestión de Personal (vínculo/cese/riesgo/cobertura) | 🔴 No iniciado |
| 3 | PWA Asistentes (login, guardias, GPS, reporte + IA) | 🔴 No iniciado |
| 4 | PWA Clientes (login, reportes, alertas) | 🔴 No iniciado |
| 5 | Planillas IOMA (PDF) | 🔴 No iniciado |
| 6 | Perfil público del Asistente con QR | 🔴 No iniciado |

Convención: 🔴 No iniciado · 🟡 En progreso · 🟢 Completo y en producción.

## Última tarea completada

Etapa 1 en progreso: las 8 páginas del sitio público (`PRD_01_Sitio_Web.md`) construidas y
enrutadas, componentes globales (Header/Footer/WhatsAppButton/LanguageSelector), i18n
completo es-AR/en/pt-BR vía contexto React, formularios de Solicitá tu Servicio y Trabajá
con Nosotros con los 4 estados y anti-doble-envío, backend Express con las dos rutas POST
contra MySQL + email al coordinador. Build, lint y arranque de dev server/backend
verificados sin errores. Pendiente: contenido real de imágenes/fotografía propia, dominio,
variables de entorno reales, y despliegue (Vercel/Railway) — queda en el checklist de
lanzamiento de `PRD_01_Sitio_Web.md`.

## Decisiones tomadas durante el desarrollo

_Registrar acá cualquier decisión técnica tomada durante el desarrollo que no estaba en
ningún PRD original._

| Fecha | Decisión | Motivo |
|---|---|---|
| 2026-07-07 | Se incorporaron 4 patrones de UI/arquitectura de un análisis externo (brief de GlamourOS, ERP para salones de belleza — proyecto ajeno a prestadora-original, solo se tomaron ideas puntuales): (1) teléfono siempre como link `wa.me/` — `DESIGN_SYSTEM.md`; (2) listas largas agrupadas por categoría — `DESIGN_SYSTEM.md`; (3) checklist de onboarding con % de completitud para el Filtro prestadora-original — `PRD_03_Reclutamiento.md`; (4) colores automáticos por estado de guardia — `DESIGN_SYSTEM.md` + `PRD_02_Panel_Admin.md` Módulo 6. También se registró como nota de arquitectura a futuro (no built) la idea de módulos activables por configuración — `PRD_02_Panel_Admin.md` Módulo 8. | Ninguna de estas ideas viene de un PRD original de prestadora-original — se documentan para que quede claro el origen y no se pierdan en la próxima sesión |
| 2026-07-07 | Se descartó explícitamente la gamificación de Asistentes (niveles/rankings/puntos) vista en el mismo análisis externo | Contradice la regla anti-subordinación de `CLAUDE.md` (riesgo legal art. 23 LCT / precedente Cabify) — dejar registrado para que no se reproponga sin resolver antes el riesgo legal |
| 2026-07-07 | Se agrega un quinto rol, `Superadmin`, con login propio y acceso técnico por encima de `Admin` (configuración profunda, alta/baja de elementos sensibles, uso de IA para diagnóstico/corrección de errores) — actualizado en `CONTEXT.md`, `SECURITY.md` y `CLAUDE.md` (raíz) | Decisión de negocio explícita del dueño del proyecto, no estaba en ningún PRD original |
| 2026-07-07 | Se registra como principio de negocio que el modelo debe operar con muy poca gente administrando, por lo que automatizar con IA todo lo que no comprometa el riesgo legal es deseable — puede llevar a re-priorizar algunos niveles de IA que `BUILD_ORDER.md` marca como "Diferida", a evaluar caso por caso cuando se llegue a esa etapa | Decisión de negocio explícita — condiciona el alcance de futuras etapas de IA |
| 2026-07-07 | Se agregó a `DESIGN_SYSTEM.md` un benchmark estético (no solo de prestaciones) de EnCasa, Cuidarlos, Medincare y Cuidando en Casa, con recomendaciones concretas para diferenciarse visualmente (fondos de color completo, fotografía propia con dirección de arte, micro-interacciones, iconografía propia) — se detectaron además dos competidores no presentes en el corpus de negocio original: `Cuidarnos` (UTEP/Movimiento Evita) y `Cuidando en Casa` | Pedido explícito del usuario: superar ampliamente a los competidores desde lo estético, no solo desde las prestaciones |
| 2026-07-07 | Se amplió el benchmark estético con 14 sitios adicionales que aportó el usuario (Ver Salud, Casamed Salud, Situ Care, Home Care BA, Continuum, Cuidarte Argentina, InDom, +Vida Salud, API Cuidados Domiciliarios, Amparando Salud, Cuidar Buenos Aires, más perfiles de Instagram de Go Home y CuidArteBien) y se detectó un vacío: ningún PRD original define identidad visual para Instagram — se agregó una sección nueva en `DESIGN_SYSTEM.md` al respecto | El usuario señaló explícitamente que Instagram no se había tenido en cuenta hasta ahora |
| 2026-07-07 | Limitación técnica declarada: las herramientas de investigación de esta sesión no pueden evaluar Instagram con el mismo nivel de detalle que un sitio web (contenido JS-renderizado, sin acceso a grilla/calidad visual real) — el análisis de esos perfiles es superficial (cadencia, tipo de contenido), no un juicio de calidad visual completo | Transparencia sobre el alcance real del análisis, para que no se tome como definitivo sin revisión manual |
| 2026-07-07 | Un agente en segundo plano relevó ~15 competidores adicionales desde el ángulo de prestaciones/funcionalidades (no estético) mientras se trabajaba en Etapa 0; se guardó como `docs/COMPETIDORES_PRESTACIONES.md`. Hallazgo relevante: **CUIDARnos** (cooperativa impulsada por UTEP/Grobocopatel, lanzamiento 2026) es el primer competidor que reivindica públicamente GPS/geolocalización, aunque en fase piloto (~450 cuidadoras, AMBA) — matiza (sin invalidar) el claim de posicionamiento de prestadora-original de "nadie tiene GPS". También se detectó que `Cuidando en Casa` opera un Centro de Día físico en La Plata, coincidiendo directamente con la zona objetivo de prestadora-original | Pedido del usuario de investigar prestaciones de competidores como fuente de conocimiento para generación futura de contenidos |
| 2026-07-07 | Se inició Etapa 0 (setup): `git init` en `Workspace/`, `.gitignore` y `README.md` raíz, `sitio-web/` scaffolded con Vite + React (fijado a React 18 por ser el stack decidido en `CONTEXT.md`, no React 19 que es el default actual de create-vite), `vite-plugin-pwa@^1.3.0` (única versión compatible con Vite 8), variables CSS/i18n creados en `sitio-web/src/`, `backend/` scaffolded con Express (Node 22) y `nodemailer` fijado a `^9.0.3` por vulnerabilidades de severidad alta en la rama 6.x | Siguiente paso natural tras completar la documentación, ejecutado de forma autónoma por pedido explícito del usuario ("continúa solo sin detenerte a pedir permisos") |
| 2026-07-07 | Construida Etapa 1 completa (primera pasada): 8 páginas de `PRD_01_Sitio_Web.md`, i18n vía `LocaleContext` (React Context + localStorage, no prop-drilling), config centralizada de datos de contacto/precios (`config/siteConfig.js`, placeholders `[DEFINIR]` hasta que el negocio confirme), `vite-plugin-pwa` configurado en `vite.config.js` con manifest real, fuentes Playfair Display + DM Sans cargadas en `index.html`. Diseño aplicó las recomendaciones del benchmark estético de `DESIGN_SYSTEM.md`: bloques de sección con `--fondo-alt` y hero con fondo azul oscuro degradado (no fondo blanco corrido como todos los competidores relevados) | Ejecución del PRD_01, con las recomendaciones de diferenciación visual ya documentadas aplicadas desde el primer commit, no como retrofit posterior |

## Problemas conocidos / deuda técnica

_Registrar acá bugs conocidos o deuda técnica para la próxima sesión._

| Descripción | Prioridad | Estado |
|---|---|---|
| — | — | — |

## Archivos creados/modificados por sesión

_Una entrada por sesión de trabajo, más reciente primero._

| Fecha | Sesión | Archivos |
|---|---|---|
| 2026-07-07 | Etapa 1: sitio web público completo (primera pasada) | `sitio-web/src/pages/*` (8 páginas), `sitio-web/src/components/*` (Header, Footer, WhatsAppButton, LanguageSelector, ui/{Button,FormField,Alert}), `sitio-web/src/i18n/LocaleContext.jsx`, `sitio-web/src/config/siteConfig.js`, `sitio-web/src/hooks/useFormSubmit.js`, `sitio-web/vite.config.js` (PWA), `sitio-web/index.html` (fuentes + meta), `sitio-web/src/styles/{global,components}.css` (reescritos), `backend/src/routes/{solicitudServicio,postulacionAsistente}.js`, `backend/src/db/{connection,schema}.sql`, `backend/src/utils/email.js`, `backend/src/server.js` (rutas conectadas) |
| 2026-07-07 | Etapa 0: setup inicial de repo y estructura | `CLAUDE.md` (movido a raíz), `.gitignore`, `README.md`, `docs/COMPETIDORES_PRESTACIONES.md`, `sitio-web/` (scaffold Vite+React+Router, `src/styles/{variables,global,components}.css`, `src/i18n/translations.js`, `.env.example`), `backend/` (scaffold Express, `src/server.js`, `.env.example`, `.gitignore`) |
| 2026-07-07 | Generación de documentación técnica en `Workspace/docs/` (sin código todavía) | `CLAUDE.md`, `CONTEXT.md`, `DESIGN_SYSTEM.md`, `DATA_MODEL.md`, `AI_PROMPTS.md`, `SECURITY.md`, `PRD_01_Sitio_Web.md`, `PRD_02_Panel_Admin.md`, `PRD_02B_Gestion_Personal.md`, `PRD_03_Reclutamiento.md`, `PRD_04_05_App_Servicio.md`, `BUILD_ORDER.md`, `PROGRESS.md` |
