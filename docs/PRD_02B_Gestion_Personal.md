# PRD_02B — Gestión de Personal (Ausencias, Cobertura, Escalas legales)

> Este PRD **extiende el Padrón de Asistentes del Panel, no es un módulo separado** — vive en la misma navegación, mismo rol de acceso
> (Admin_prestadora; Coordinador solo lectura de su zona, sin acceso a montos — ver
> `SECURITY.md`).

## Por qué existe este módulo

El Asistente es monotributista o trabajador independiente: se lo contrata para una tarea, y la
contratación termina porque se completó, porque se canceló o porque él desistió. Careonys no
lleva relación de dependencia, cese, liquidación final ni telegrama: eso es de un módulo de
sueldos y jornales.

Lo que sí lleva es lo que pasa mientras la persona trabaja: cuándo falta, quién la cubre, qué
documentación tiene que mantener al día, y los valores legales con los que se hace cada cuenta,
versionados por fecha y nunca escritos en el código.

## Alcance funcional

| # | Función |
|---|---|
| 1 | Gestión de ausencias (enfermedad/accidente inculpable, licencias) |
| 2 | Guardias de cobertura (reemplazo temporal por ausencia) |
| 3 | Constancia de ausencia justificada en PDF |
| 4 | Tabla versionada de valores legales (`escalas_legales`) |
| 5 | Notificaciones de vencimientos de documentación (catálogo configurable por prestadora) |

## Glosario nuevo (sumar al de `CLAUDE.md`)

| Término | Definición |
|---|---|
| Escala legal | Un valor normativo versionado (tope, valor de referencia, etc.), nunca hardcodeado |
| Guardia de cobertura | Guardia cubierta por un Asistente sustituto mientras el titular está ausente |

## Modelo de datos

Tablas `asistentes` (columnas `fecha_alta`, `fecha_baja`, `horas_semanales`),
`remuneraciones_asistente`, `datos_reservados_asistente`, `escalas_legales`, `ausencias`,
`guardias_cobertura`. Sus columnas se consultan en la base en vivo — no reproducir aquí para
evitar que las dos fuentes diverjan.

`horas_semanales` es el máximo de horas por semana que la persona acepta trabajar.

Dos partes del Legajo del Asistente no están en `asistentes`, y cada una exige un permiso configurable para
poder leerse:

- Lo que cobra —la unidad con que se le mide el trabajo (hora, guardia o semana), el valor de
  cada una, el de la hora extra y cada cuánto cobra— está en `remuneraciones_asistente`, detrás
  de `ver_pagos_asistente`.
- Lo reservado —`motivo_exclusion_directo`, `motivo_exclusion_intermediacion`— está en
  `datos_reservados_asistente`, detrás de `ver_datos_reservados_asistente`.

Están separadas porque las reglas de acceso de la base filtran filas y no columnas: dentro del
Legajo del Asistente no hay forma de exigir un permiso para un dato y no para el resto.

Los vencimientos de documentación del Asistente (Monotributo, ART, Seguro, Certificado de
Antecedentes Penales u otros que agregue cada prestadora) ya no viven como columnas de
`asistentes` — pasaron a las tablas `tipos_documento_asistente`/`documentos_asistente`,
configurables por prestadora sin límite de cantidad.

Regla que más se rompe (repetida a propósito): toda lectura de `escalas_legales` filtra por
`vigencia_desde <= fecha_del_hecho AND (vigencia_hasta IS NULL OR vigencia_hasta >=
fecha_del_hecho)` — la fecha del hecho que se está calculando, **nunca** la fecha actual del
sistema.

## Ausencias y cobertura

Flujo:

1. Se registra una ausencia (`ausencias`, tipo enfermedad/accidente/licencia/no justificada).
2. Si hay certificado médico, se sube a Storage (`certificado_url`).
3. Sistema identifica guardias afectadas por el rango de fechas (`guardias_afectadas`).
4. Coordinador asigna un Asistente sustituto por guardia afectada. El turno sigue teniendo una
   sola persona —la que lo hace—, así que la guardia pasa a nombre del sustituto y queda escrito
   en `guardias_cobertura` a quién le tocaba, con qué causa y con qué `costo_adicional`.
5. Esas guardias las cobra quien las hizo, con su propio valor, que puede no ser el del titular,
   y al titular no le suman nada.
6. Al cerrar la ausencia (`fecha_fin`), se recalculan `dias_computados`.
7. Se notifica a Coordinador y Cliente del cambio de Asistente asignado.

Durante la licencia, el Asistente no tiene guardias: las que caen en esos días no aparecen en su
aplicación, no puede abrirlas ni empezarlas y no le llega su recordatorio. Quedan con el
Coordinador, entre las guardias por cubrir. Si el Coordinador lo convoca antes, anota la vuelta en
el Panel y las guardias desde ese día vuelven a aparecer (`backend/src/utils/guardiaDeLicencia.js`).

## Constancia de ausencia

Desde la solapa de ausencias se descarga en PDF la constancia de ausencia justificada, armada con
los datos de la ausencia ya cargada (`panel/src/lib/constanciaDeAusencia.js`). Se genera en el
navegador con jsPDF y no se guarda en la base.

## Navegación

Dentro del Padrón de Asistentes del panel, la pestaña "Ausencias y Cobertura" — no
crear un ítem de navegación de primer nivel separado.

## Fuera de alcance (explícito)

- Relación de dependencia, cese, liquidación final, telegrama y certificados laborales: son del
  módulo de sueldos y jornales.
- Integración bancaria de pagos.
- Integración con AFIP (Mi Simplificación, Monotributo, etc.).
- Firma digital de documentos generados.

## Checklist de aceptación

- [ ] Toda consulta a `escalas_legales` usa la fecha del hecho, no la fecha actual
- [ ] RLS: `escalas_legales`/`ausencias`/`guardias_cobertura` invisibles para `asistente`/`cliente`
- [ ] Ninguna guardia que cae en una licencia aparece en la aplicación del Asistente que está de licencia
