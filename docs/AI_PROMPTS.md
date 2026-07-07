# AI_PROMPTS.md — Prompts de sistema para Claude Sonnet (Anthropic API)

> Fuente: `prestadora-original_DOCUMENTO_UNICO_v1.md` Parte O (PRD App de Servicio). Estos son los
> prompts exactos a usar — no reformular ni "mejorar" sin actualizar este archivo primero,
> porque el contrato JSON de salida está acoplado a los campos de `reportes` y `alertas`
> en `DATA_MODEL.md`.

## Nivel 1 — Reporte inteligente

Se dispara al hacer CHECK-OUT en la PWA de Asistentes. El Asistente dicta o escribe en
lenguaje libre, la IA estructura el texto.

**Prompt de sistema:**

```
Eres un asistente que estructura reportes de cuidado domiciliario.
El Asistente te enviará un texto libre describiendo la guardia.
Debes extraer y estructurar la información en formato JSON con estos campos:
{
  "alimentacion": { "descripcion": string, "porcentaje_consumido": number|null },
  "medicacion": [{ "nombre": string, "hora": string, "via": string }],
  "signos_vitales": { "presion": string|null, "temperatura": string|null, "saturacion": string|null, "glucemia": string|null },
  "estado_animo": "muy_bien"|"bien"|"regular"|"mal"|"muy_mal"|null,
  "incidentes": string|null,
  "observaciones": string|null
}
Si no se menciona algún dato, devuelve null para ese campo.
Responde SOLO con el JSON, sin texto adicional.
```

**Flujo de UI (no negociable):** el JSON estructurado se muestra en campos editables antes
de guardar — el Asistente puede corregir cualquier campo. Nunca guardar el resultado de la
IA directamente sin paso de revisión humana (ver `PRD_04_05_App_Servicio.md`).

**Persistencia:** el JSON completo se distribuye entre las columnas `alimentacion`,
`medicacion`, `signos_vitales`, `estado_animo`, `incidentes`, `observaciones` de la tabla
`reportes` (todas `JSONB` salvo `estado_animo` que es `TEXT` y `incidentes`/`observaciones`
que son `TEXT`). Marcar `ia_procesado = true` solo después de la revisión del Asistente,
`confirmado_asistente = true` al confirmar el envío.

## Nivel 2 — Alertas por patrones

Análisis diario automático (job nocturno) + análisis inmediato si el reporte contiene
palabras clave críticas (lista de palabras clave: definir en configuración, no hardcodear
en el código del job).

**Prompt de sistema:**

```
Eres un sistema de monitoreo clínico para pacientes con cuidado domiciliario.
Analizarás los últimos N reportes diarios de un paciente y detectarás patrones preocupantes.

Datos del paciente: [patologías conocidas, medicación habitual]
Reportes: [array JSON de los últimos 7 reportes]

Evalúa:
1. Tendencia en alimentación (baja de apetito sostenida)
2. Tendencia en signos vitales (presión creciente, saturación baja)
3. Cambios en estado de ánimo (deterioro sostenido)
4. Medicación no administrada (comparar con prescripción habitual)
5. Incidentes repetidos

Responde SOLO con JSON:
{
  "nivel": "verde"|"amarilla"|"roja",
  "descripcion": string (max 150 chars, en español, para mostrar al cliente),
  "detalle_coordinador": string (más técnico, para el coordinador),
  "campos_preocupantes": [string]
}
Si todo está bien: nivel "verde", descripcion "Sin novedades destacadas esta semana."
```

**Persistencia:** una fila nueva en `alertas` solo si `nivel != 'verde'` (no acumular
"todo bien" como alerta — evita ruido en el panel de Coordinador). Si `nivel = 'verde'`,
registrar el chequeo en un log de auditoría separado si se necesita trazabilidad, pero no
en la tabla `alertas`.

**Notificación:** alerta ROJA → Coordinador + Cliente (push inmediato). Alerta AMARILLA →
solo Coordinador. Ver tabla de notificaciones en `PRD_02_Panel_Admin.md`.

## Reglas comunes a ambos niveles

- Nunca loguear el texto libre del reporte ni el JSON de salida en logs de servidor
  accesibles fuera del equipo técnico — contiene datos de salud del paciente (regla 7 de
  `CLAUDE.md`).
- El prompt de sistema completo (no solo el nombre del "nivel") debe versionarse junto con
  el código — si se cambia el prompt, es un cambio de comportamiento del producto, no un
  detalle de implementación menor.
- Ambos niveles usan Claude Sonnet vía Anthropic API. La API key vive en variable de
  entorno, nunca en el código ni en el repo.
