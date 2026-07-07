# PRD_02 — Panel de Administración

> Fuente: `prestadora-original_DOCUMENTO_UNICO_v1.md` Parte N. Etapa 2 del build order. Herramienta
> interna — solo Admin y Coordinador acceden. SPA separada del sitio público, deployada
> en el mismo Vercel. Acceso: `admin.prestadora-originalsalud.com.ar` (o `/admin`).

## Stack

React 18 + Vite. Auth: Supabase Auth (email + password, sin magic link — ver
`SECURITY.md`). En esta etapa se migra de MySQL a Supabase: el sitio público sigue en
Express/MySQL, el panel ya usa Supabase directamente.

## Roles y permisos

| Rol | Ve | Hace |
|---|---|---|
| Admin | Todo | Todo |
| Coordinador | Sus asignaciones, sus zonas | Gestionar guardias y Asistentes de su zona |

## Módulos

### Módulo 1 — Dashboard
Métricas en tiempo real: postulaciones recibidas hoy/semana, solicitudes pendientes,
guardias activas ahora, Asistentes disponibles, clientes activas, alertas de IA sin
resolver.

### Módulo 2 — Postulaciones de Asistentes
Lista (nombre, especialidad, zona, fecha, situación fiscal, estado) + filtros (texto,
especialidad, zona, estado, disponibilidad urgencias). Acciones: ver perfil, cambiar
estado (con nota), email automático al Asistente, iniciar verificación (avanza las 5
etapas — tabla `verificaciones_asistente` en `DATA_MODEL.md`). Vista mapa con Asistentes
del plantel activo agrupados por zona; al llegar una solicitud, filtra automáticamente los
más cercanos.

### Módulo 3 — Solicitudes de Servicio (Clientes)
Lista (nombre, teléfono, localidad, tipo de servicio, modalidad, fecha, estado) + filtros.
Acciones: ver detalle, asignar Asistente (por zona + especialidad + disponibilidad),
cambiar estado, click-to-call, nota interna.

### Módulo 4 — Plantel de Asistentes

Lista de Asistentes verificados y activos (nombre, especialidades, zonas, estado,
monotributo activo, seguro vencimiento, guardias activas) + filtros.

Perfil individual: datos personales, etapas de verificación con fechas, guardias
históricas, evaluaciones recibidas, estado de monotributo/seguro, botón generar/ver
Certificado QR.

**Este módulo se extiende, no se reemplaza, por `PRD_02B_Gestion_Personal.md`** —
el vínculo laboral dual-track (monotributo/dependencia), el simulador de costos y el
motor de cese viven dentro de este mismo módulo.

### Módulo 5 — Clientes y Pacientes
Lista de clientes activas; por cliente: contacto, pacientes, guardias activas, historial
de reportes, alertas activas.

### Módulo 6 — Guardias
Vista calendario + lista (fecha, Asistente, paciente, modalidad, estado). Estado en
tiempo real: última ubicación GPS si la guardia está activa, tiempo transcurrido desde
check-in, alerta automática si check-in sin check-out después de X horas. Cada estado
(programada/activa/completada/cancelada) usa color automático — ver "Estados visuales de
guardias" en `DESIGN_SYSTEM.md` — para escaneo visual rápido en la vista calendario.

### Módulo 7 — Reportes y Alertas (IA Nivel 2)
Lista de alertas activas (ROJA/AMARILLA) por paciente. Clic → ver reportes que generaron
la alerta. Marcar resuelta (con nota). Historial de alertas resueltas.

### Módulo 8 — Configuración
Datos de la empresa, **precios por modalidad** (se cargan desde acá, nunca hardcodeados),
zonas de cobertura activas, usuarios del panel (crear/modificar Coordinadores),
configuración de notificaciones.

Nota de arquitectura a futuro (no construir todavía, no bloquea Etapa 2): si el panel
llega a ofrecerse a distintas coordinaciones u obras sociales con alcances distintos, vale
la pena que los módulos del panel sean activables/desactivables por configuración (patrón
visto en el Back Office de GlamourOS) en vez de si-el-rol-lo-permite hardcodeado en cada
componente. Evaluar solo si surge ese escenario de negocio, no diseñar para él ahora.

## Flujo de asignación de guardia

1. Llega solicitud → aparece en Módulo 3 como "Nueva".
2. Coordinador abre la solicitud.
3. Sistema sugiere Asistentes por zona + especialidad + disponibilidad.
4. Coordinador selecciona Asistente.
5. Notificación al Asistente (email; push cuando la PWA esté lista).
6. Asistente confirma → guardia "Programada".
7. Check-in GPS en fecha/hora acordada → "Activa".
8. Reporte diario + check-out → "Completada".

## Notificaciones automáticas

| Evento | Notifica a |
|---|---|
| Nueva solicitud de servicio | Admin + Coordinador de turno |
| Nueva postulación de Asistente | Admin |
| Asistente no hizo check-in en horario | Coordinador + Admin |
| Guardia activa sin check-out +2hs del horario pactado | Coordinador + Admin |
| Alerta IA Nivel 2 ROJA | Coordinador + Cliente |
| Alerta IA Nivel 2 AMARILLA | Coordinador |
| Seguro del Asistente vence en 30 días | Admin |
| Monotributo del Asistente no activo | Admin |

## Datos y RLS

Ver `DATA_MODEL.md` para las tablas que este panel lee/escribe y `SECURITY.md` para las
políticas RLS exactas. Ningún dato de `escalas_legales`/`ceses` es visible fuera de Admin
(y Coordinador solo si el PRD de Gestión de Personal lo habilita explícitamente para su
zona — por defecto, no).
