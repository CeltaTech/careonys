# Historial de decisiones de CLAUDE.md

> Registra por qué cambió una regla vigente de `CLAUDE.md`. La regla vigente en sí vive solo en `CLAUDE.md` (§10) — este archivo guarda el "antes" y el motivo, no vuelve a describir el estado actual en detalle.

## Glosario: "Cumplimiento normativo" → "Documentación" (2026-07-18)

- **Decía antes:** "Cumplimiento normativo (documental, por Prestadora)".
- **Dice ahora:** "Documentación (vencimientos documentales de Asistentes, por Prestadora)".
- **Motivo:** el Desarrollador señaló que "Cumplimiento normativo" no es descriptivo del concepto real (el tablero de vencimientos de documentos de Asistentes — Monotributo, ART, Seguro, etc.), y pidió reemplazarlo por "Documentación" en el glosario y en todo el sistema.
- **Alcance del cambio:** término renombrado en el glosario de `CLAUDE.md`, en el código y textos del Panel (página, ruta, componente, claves de i18n en los 3 idiomas) y en el catálogo de módulos comerciales (`catalogo_modulos`, tabla y schema). El identificador técnico interno (`key = 'compliance'`) se mantuvo sin cambios — mismo criterio ya usado antes para el módulo de Guardias (`key = 'evv'` se mantuvo aunque su nombre visible pasó a "Verificación de Guardias"): el `key` es un identificador técnico estable, no un término de negocio visible.
- **No reintroducir:** "compliance" ni "cumplimiento normativo" como término visible o clave nueva para este concepto — usar siempre "Documentación".

## Rediseño visual y funcional completo del Panel (2026-07-18)

- **Decía antes:** identidad visual "no negociable" en `docs/DESIGN_SYSTEM.md` — tipografía Playfair Display (títulos) + DM Sans (cuerpo), paleta en hex (`--azul-oscuro: #1F4E79`, etc.), tarjetas con `border-left: 4px` de acento, sidebar de 220px con highlight de fondo en el link activo. Guardias se veía como lista agrupada por día. Comunicación existía solo como un hilo de chat embebido en la ficha de cada Asistente, sin bandeja global.
- **Dice ahora:** tipografía Public Sans (títulos y cuerpo), paleta en `oklch()` (ver `docs/DESIGN_SYSTEM.md`), tarjetas con `border: 1px solid var(--borde-card)`, sidebar de 232px con indicador de punto para el link activo. Guardias se gestiona con una grilla semanal (asistentes × días) con reasignación por drag-and-drop nativo. Comunicación suma una bandeja global (`/comunicacion`, lista de Asistentes por último mensaje + hilo activo), además del hilo por Asistente ya existente — ambos comparten el mismo componente (`HiloComunicacion`).
- **Motivo:** directiva explícita del Desarrollador, quien consideró el Panel vigente "totalmente horrible e inoperativo" y proporcionó un mockup de referencia estética/funcional ("Careonys Coordinator Dashboard"). Alcance definido por el Desarrollador como "visual y funcional completo", no una pantalla piloto.
- **Qué se preservó sin cambios:** aislamiento multi-tenant y RLS, contrato del componente `EstadoLista` (loading/error/vacío/listo), glosario de negocio (los términos del mockup en inglés/prohibidos — "Cuidadores", "Clientes", "Compliance" — se tradujeron a Asistente/Cliente/Documentación, nunca se copiaron), multiidioma (toda clave nueva sumada a `es-AR`/`en`/`pt-BR` en el mismo commit), las dos convenciones de UX de `docs/DESIGN_SYSTEM.md` (links `wa.me` para teléfonos, listas largas agrupadas nunca con scroll infinito), y las clases de color de estado semántico (`.guardia-programada`, `.badge-vigente`, etc. — mismo rol, solo valores oklch).
- **Excluido explícitamente:** la columna "sin asignar" de la grilla de Guardias del mockup — `guardias.asistente_id` es `NOT NULL` en el schema (`backend/src/db/schema_modulo6_guardias.sql`), ese estado no existe en el dominio real y no se inventó.
- **No reintroducir:** Playfair Display, DM Sans, ni colores en hex literal fuera de las variables `oklch()` de `docs/DESIGN_SYSTEM.md`, para este identidad visual del Panel.
