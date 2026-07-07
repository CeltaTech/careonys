-- Etapa 1 (MySQL en Railway) — ver docs/DATA_MODEL.md, sección "Etapa 1"
-- Ejecutar una sola vez contra la base de datos de Railway antes de levantar el backend.

CREATE TABLE IF NOT EXISTS solicitudes (
  id INT AUTO_INCREMENT PRIMARY KEY,
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
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS postulaciones (
  id INT AUTO_INCREMENT PRIMARY KEY,
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
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
