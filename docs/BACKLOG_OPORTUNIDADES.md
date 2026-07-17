# BACKLOG_OPORTUNIDADES.md — Ideas futuras, post-MVP

> Este documento junta ideas de producto que **no se implementan ahora**. Se retoman recién
> cuando el proyecto pase la etapa del MVP, por decisión explícita del Desarrollador
> (2026-07-12). No confundir con `docs/PENDIENTES.md` (que son ítems abiertos que sí bloquean
> o requieren decisión/acción en el corto plazo).

## Nota importante sobre alcance de negocio

**TODA PRESTADORA TRABAJA CON AMBOS ESQUEMAS — CUIDADO DIRECTO Y MATCH — DESDE EL MINUTO 1.**
Ninguna de las ideas de abajo es "match, para más adelante": el modelo match ya
está activo desde el lanzamiento, igual que el directo (`CLAUDE.md` líneas 11 y 18). Que estas
ideas estén en un backlog post-MVP es solo por tamaño/prioridad de la idea puntual, no por ser
del esquema match. Ver memoria `feedback_match_y_directo_dia_uno`.

## Origen

Surgidas de un análisis comparativo de cuidarlos.com (match argentino de cuidadores),
hecho a pedido del Desarrollador el 2026-07-11/12. Ninguna de estas ideas está aprobada para
construir — quedan anotadas para evaluación futura.

## Ideas

### 1. Score comparativo de Asistentes — visible solo para Admin

Un puntaje interno de calidad/desempeño de cada Asistente, **visible únicamente por el rol
Admin** (no por Coordinador, no por el propio Asistente, no por Clientes) — aclarado
explícitamente por el Desarrollador (2026-07-12). Esto reduce el riesgo de indicio de
subordinación del art. 23 LCT frente a la versión "ranking visible/badges" que `CLAUDE.md`
prohíbe explícitamente (sección "Nunca hardcodear"/riesgo legal), porque el Asistente nunca
lo ve ni sufre una consecuencia automática por él. Aun así, antes de construirlo hay que
resolver con el mismo cuidado que el resto del sistema:
- Que el score sea solo informativo para el Admin, y que ninguna acción automática (asignación
  de guardias, exclusión, oferta de guardias) dependa de él sin que medie una decisión humana
  explícita — si en algún momento sí dependiera, ahí sí se activa el riesgo legal completo que
  `CLAUDE.md` describe (caso Cabify).
- Qué variables lo componen (no debería incluir "rechazo de guardias", que `CLAUDE.md`
  prohíbe explícitamente penalizar).

### 2. Videollamada de entrevista integrada, sin compartir datos de contacto

Permitir que un Cliente entreviste a un Asistente por videollamada dentro de la app/Panel,
sin exponer teléfono ni email de ninguna de las dos partes. Relación Cliente↔Asistente en
etapa de selección — no toca la relación de trabajo en curso, así que no pisa el riesgo del
art. 23 LCT. Diferencial de privacidad interesante para el modelo match.

### 3. Cursos para clientes sobre cuidado de personas mayores

Línea de negocio adicional (contenido educativo pago o de valor agregado) — decisión de
negocio, no solo de producto. Requiere aprobación de alcance/precio antes de diseñar nada.

### 4. "Gestor del cuidado" — rol humano dedicado a monitorear un caso

Un rol tipo Coordinador pero dedicado 1 a 1 a acompañar a un Cliente en particular (más
cercano a un servicio premium). Definir si es un rol nuevo o una variante de Coordinador
existente.

### 5. Acompañamiento online

Servicio de compañía/conversación remota para el Paciente, complementario a las guardias
presenciales. Definir si lo presta un Asistente Integral o un rol distinto.

## Cómo se relaciona con el resto del proyecto

- Análisis original: conversación del 2026-07-11/12 sobre cuidarlos.com (no hay documento de
  esa comparación completa aparte de esta lista — el detalle de precios/features de cuidarlos
  está solo en el historial de esa conversación).
- `docs/PENDIENTES.md` no lista estos ítems porque no bloquean nada ni tienen fecha — viven
  acá hasta que se decida promover alguno a un PRD real.
- Memoria `project_ia_oportunidades` — si alguna de estas ideas suma IA en el futuro, cruzar
  contra esa nota y contra `feedback_tres_relaciones_distintas` antes de diseñarla.
