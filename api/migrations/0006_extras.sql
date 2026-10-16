-- Fase 6.
-- Fecha (ms) a partir de la cual el link del cliente deja de funcionar; vacío = no caduca.
ALTER TABLE clientes ADD COLUMN caduca INTEGER;

-- Tus plantillas: guiones guardados como punto de partida para otros nuevos.
CREATE TABLE plantillas (
  id        TEXT PRIMARY KEY,
  nombre    TEXT NOT NULL,
  formato   TEXT NOT NULL,
  contenido TEXT NOT NULL,
  creado    INTEGER NOT NULL
);
