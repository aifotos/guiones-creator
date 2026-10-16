-- Fase 3: el cliente puede editar, aprobar y comentar sus guiones.

-- Quién hizo el último cambio ('admin' o 'cliente') y cuándo lo aprobó el cliente.
ALTER TABLE guiones ADD COLUMN editado_por TEXT NOT NULL DEFAULT 'admin';
ALTER TABLE guiones ADD COLUMN aprobado INTEGER;

CREATE TABLE comentarios (
  id        TEXT PRIMARY KEY,
  guion_id  TEXT NOT NULL REFERENCES guiones(id) ON DELETE CASCADE,
  autor     TEXT NOT NULL CHECK (autor IN ('admin', 'cliente')),
  texto     TEXT NOT NULL,
  creado    INTEGER NOT NULL
);
CREATE INDEX comentarios_por_guion ON comentarios(guion_id, creado);
