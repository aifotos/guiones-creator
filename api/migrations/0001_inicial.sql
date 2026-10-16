-- Cada cliente tiene un link secreto (token). Si se desactiva, el link deja de funcionar.
CREATE TABLE clientes (
  id          TEXT PRIMARY KEY,
  nombre      TEXT NOT NULL,
  token       TEXT NOT NULL UNIQUE,
  activo      INTEGER NOT NULL DEFAULT 1,
  creado      INTEGER NOT NULL,
  actualizado INTEGER NOT NULL
);

-- El contenido (bloques y personajes) va en JSON. "version" sube con cada guardado
-- para que dos personas editando a la vez no se pisen sin darse cuenta.
CREATE TABLE guiones (
  id          TEXT PRIMARY KEY,
  cliente_id  TEXT NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  titulo      TEXT NOT NULL DEFAULT '',
  formato     TEXT NOT NULL DEFAULT 'video',
  contenido   TEXT NOT NULL DEFAULT '{}',
  version     INTEGER NOT NULL DEFAULT 1,
  creado      INTEGER NOT NULL,
  actualizado INTEGER NOT NULL
);
CREATE INDEX guiones_por_cliente ON guiones(cliente_id, actualizado DESC);

-- Freno a quien intente adivinar la contraseña: intentos fallidos por IP.
CREATE TABLE intentos_login (
  ip       TEXT PRIMARY KEY,
  fallos   INTEGER NOT NULL,
  desde    INTEGER NOT NULL
);
