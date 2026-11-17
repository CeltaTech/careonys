# Careonys

> Leer `CLAUDE.md` antes de tocar cualquier código. Protocolo de sesión completo ahí.

## Estructura del repo

```
careonys/
├── CLAUDE.md          ← reglas no negociables, leer primero
├── docs/              ← PRDs, contexto técnico, plan hasta producción, documentos legales
├── sitio-web/         ← sitio público: una página estática (index.html) que arma construir.mjs
├── backend/           ← backend de las tres aplicaciones (Node + Express)
├── panel/             ← Panel de la Prestadora (React + Vite)
├── pwa-asistentes/    ← aplicación de los Asistentes (React + Vite)
├── pwa-clientes/      ← aplicación de los Clientes (React + Vite)
├── supabase/          ← configuración del CLI, migraciones, esquema declarado y datos de siembra
├── scripts/           ← pruebas y verificaciones que corren a mano y en .github/workflows/
├── herramientas/      ← barrido de textos, direcciones y pantallas huérfanos; registro de indicaciones
└── .github/workflows/ ← publicación, respaldo diario y verificaciones automáticas
```

Las tareas que faltan están en `docs/PLAN_HASTA_PRODUCCION.md`.

## Cómo levantar el entorno de desarrollo

```
node sitio-web/construir.mjs
cd backend && npm install && npm run dev
cd panel && npm install && npm run dev
cd pwa-asistentes && npm install && npm run dev
cd pwa-clientes && npm install && npm run dev
```

`sitio-web/construir.mjs` deja la página lista en `sitio-web/dist/`. En `backend/`, `panel/`,
`pwa-asistentes/` y `pwa-clientes/`, copiar `.env.example` a `.env.local` y completar los valores
reales antes de levantar (nunca subir un `.env` — ver `.gitignore` y la regla «Toda credencial vive
en variable de entorno» de `F:\proyectos\celtatech\CLAUDE.md`).
