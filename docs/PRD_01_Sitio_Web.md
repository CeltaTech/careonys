# PRD_01 — Sitio Web Público

> Fuente: `prestadora-original_DOCUMENTO_UNICO_v1.md` Parte M. Condensado para ejecución directa.
> Etapa 1 del build order. Ver stack en `CONTEXT.md`.

## Objetivo

Puerta de entrada al negocio. Dos públicos: clientes que buscan el servicio + Asistentes
que quieren trabajar. Mobile-first.

URL objetivo: prestadora-originalsalud.com.ar (dominio a confirmar).

## Estructura de archivos

```
frontend/
├── public/{favicon.ico, logo192.png, manifest.json}
├── src/
│   ├── main.jsx
│   ├── App.jsx                 ← Router + Header + Footer + rutas
│   ├── i18n/translations.js    ← objeto T, es-AR/en/pt-BR
│   ├── styles/{variables.css, global.css, components.css}
│   ├── components/{Header,Footer,WhatsAppButton,LanguageSelector}.jsx
│   ├── components/ui/{Button,FormField,Alert}.jsx
│   └── pages/{Home,Servicios,ElFiltro,SolicitaServicio,TrabajaConNosotros,Contacto,Privacidad,Terminos}.jsx

backend/
├── server.js
├── routes/{solicitudServicio.js, postulacionAsistente.js}
├── db/connection.js
└── utils/email.js
```

## Páginas

### 1. Home (`/`)
- **Hero**: imagen de fondo, overlay oscuro, `T.hero_title` ("Cuida tus afectos" — forma
  imperativa correcta para esta pieza, ver regla de slogan en `CONTEXT.md`), `T.hero_subtitle`,
  CTA primario → `/solicita-servicio`, CTA secundario → `/trabaja-con-nosotros`.
- **Propuesta de valor** (3 iconos): Asistentes verificados / Reporte diario / Certificado
  QR verificable — sin nombrar el proceso interno de verificación (ver nota más abajo).
- **Cómo funciona** (3 pasos): Consultás → Coordinamos → Empezamos.
- **Preview de servicios** (3 cards) → botón "Ver todos" → `/servicios`.
- **CTA final** sobre fondo `--azul-oscuro`.

### 2. Servicios (`/servicios`)
Grid de 8 cards de servicios (Asistente Integral, Enfermería domiciliaria, Internación
domiciliaria, Cuidados paliativos, Kinesiología, Acompañamiento en sanatorio, Teleasistencia,
Alquiler de equipamiento). Tabla de modalidades/precios: **todas las celdas de precio
muestran "A consultar"** hasta que haya un benchmark de precio validado — los precios se
cargan desde config, nunca hardcodeados (regla 1 de `CLAUDE.md`).

### 3. Página `/el-filtro` — eliminada (corrección 2026-07-08)
Esta sección describía originalmente una página pública dedicada a "El Filtro prestadora-original"
("Solo el 10% supera el Filtro prestadora-original", timeline de las 5 etapas). Se sacó del sitio
público el 2026-07-08: el proceso interno de verificación de Asistentes (uso interno,
llamado "Proceso de Incorporación de Asistentes" dentro del Panel) **nunca se menciona en el
sitio público, ni con ese nombre ni con un nombre genérico inventado** — ver `CLAUDE.md`.
La página, el nav link y la sección de la Home que la mencionaban fueron eliminados del
código. Lo único que puede comunicarse públicamente es el hecho de estar "Verificado por
prestadora-original" (ej. en el Certificado QR del Asistente), sin nombrar el proceso.

### 4. Solicitá tu servicio (`/solicita-servicio`)
Formulario → tabla de campos:

| Campo | Tipo | Obligatorio |
|---|---|---|
| Nombre completo | text | Sí |
| Teléfono/WhatsApp | tel | Sí |
| Email | email | Sí |
| Nombre del paciente | text | No |
| Localidad del servicio | text | Sí |
| Tipo de servicio | select | Sí |
| Modalidad | select (6/8/12/24hs) | Sí |
| Días y horario | text | Sí |
| Descripción de la situación | textarea (max 500) | No |
| Acepto Política de Privacidad | checkbox | Sí (bloquea envío si no está tildado) |

`POST /api/solicitud-servicio` → guarda en MySQL tabla `solicitudes` (ver `DATA_MODEL.md`)
→ email al coordinador → botón deshabilitado durante envío (regla 5) → mensaje de éxito:
"Recibimos tu consulta. Te respondemos en menos de 2 horas."

### 5. Trabajá con nosotros (`/trabaja-con-nosotros`)
Formulario de postulación → tabla de campos (nombre, teléfono, email, profesión/especialidad
select múltiple, zonas checkboxes, disponibilidad horaria checkboxes, años de experiencia,
situación fiscal select, cómo nos conociste, mensaje libre, checkbox de privacidad).

`POST /api/postulacion-asistente` → guarda en MySQL tabla `postulaciones` → email al
coordinador.

### 6. Contacto (`/contacto`)
Teléfono click-to-call, WhatsApp directo, email mailto, zona de cobertura, horario de
atención — todos estos valores se cargan de config, no se hardcodean (todavía tienen
placeholders `[DEFINIR]` en el PRD original).

### 7-8. Privacidad / Términos
Texto placeholder hasta redacción legal definitiva. Incluir nota visible: "Este documento
está en proceso de revisión legal."

## Componentes globales

- **Header**: logo (placeholder), nav (Inicio/Servicios/Trabajá con
  Nosotros/Contacto — sin link a "El Filtro", removido 2026-07-08), selector de idioma
  ES/EN/PT, hamburguesa en mobile, sticky.
- **Footer**: logo pequeño, links, copyright, habilitación GCBA (pendiente de trámite).
- **Botón WhatsApp flotante**: icono verde, z-index alto, abre `wa.me/[NÚMERO]` con
  mensaje predefinido — una línea en `App.jsx`.

## Backend — schema MySQL

Ver `DATA_MODEL.md`, sección "Etapa 1 (MySQL en Railway)" — tablas `solicitudes` y
`postulaciones`.

## SEO — meta tags por página

| Página | Title | Description |
|---|---|---|
| `/` | prestadora-original Salud — Cuidado domiciliario verificado en CABA y GBA | Asistentes Integrales certificados. Reporte diario para el cliente. Precios públicos. Cuida tus afectos. |
| `/servicios` | Servicios de cuidado domiciliario — prestadora-original Salud | Asistente Integral, enfermería, internación domiciliaria, kinesiología y más. CABA y GBA. |
| `/solicita-servicio` | Solicitá tu servicio — prestadora-original Salud | Completá el formulario y te respondemos en menos de 2 horas. |
| `/trabaja-con-nosotros` | Trabajá con prestadora-original — Asistentes Integrales y profesionales de la salud | Trabajo registrado, honorarios acordados, certificación propia. |

## Checklist de lanzamiento

- [ ] Dominio configurado en Vercel
- [ ] Variables de entorno cargadas en Vercel y Railway
- [ ] WhatsApp Business activo con número real
- [ ] Email de contacto real configurado en Nodemailer
- [ ] Teléfono real en Contacto
- [ ] PWA instalable en Android (Chrome) y iOS (Safari)
- [ ] Formularios probados con datos reales (envío + email al coordinador)
- [ ] SEO verificado con Google Search Console
- [ ] Analytics configurado (GA4 o Plausible)
- [ ] SSL activo (automático en Vercel)
- [ ] Privacidad y Términos con texto placeholder publicados
