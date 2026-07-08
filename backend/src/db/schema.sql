-- Etapa 1 (Supabase / Postgres) — ver docs/DATA_MODEL.md, sección "Etapa 1"
-- Ejecutar una sola vez en el SQL Editor de Supabase antes de levantar el backend.

CREATE TABLE IF NOT EXISTS solicitudes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  telefono VARCHAR(30) NOT NULL,
  email VARCHAR(100) NOT NULL,
  nombre_paciente VARCHAR(100),
  localidad VARCHAR(100) NOT NULL,
  tipo_servicio VARCHAR(100) NOT NULL,
  modalidad VARCHAR(50) NOT NULL,
  dias_horario VARCHAR(200) NOT NULL,
  descripcion TEXT,
  canal VARCHAR(50) DEFAULT 'web',
  creado_en TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS postulaciones (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  telefono VARCHAR(30) NOT NULL,
  email VARCHAR(100) NOT NULL,
  especialidades TEXT NOT NULL,
  zonas TEXT NOT NULL,
  disponibilidad TEXT NOT NULL,
  anios_experiencia VARCHAR(20),
  situacion_fiscal VARCHAR(50) NOT NULL,
  como_conocio VARCHAR(100),
  mensaje TEXT,
  estado VARCHAR(30) DEFAULT 'pendiente',
  canal VARCHAR(50) DEFAULT 'web',
  creado_en TIMESTAMPTZ DEFAULT now()
);

-- RLS estricta desde el día uno (regla 8 de CLAUDE.md): nadie lee/escribe vía API pública
-- (anon/authenticated). El backend Express escribe con la Service Role Key, que bypassea
-- RLS por diseño. Cuando exista el rol Admin/Coordinador (Etapa 2), se agregan policies de
-- SELECT para esos roles específicos.
ALTER TABLE solicitudes ENABLE ROW LEVEL SECURITY;
ALTER TABLE postulaciones ENABLE ROW LEVEL SECURITY;
