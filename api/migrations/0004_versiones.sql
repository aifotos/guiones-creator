-- Copias del guion cada vez que cambia quién lo edita (tú → cliente o cliente → tú).
-- Con ellas se ve exactamente qué cambió el cliente: tachado lo que borró, en verde lo que añadió.
CREATE TABLE versiones (
  id        TEXT PRIMARY KEY,
  guion_id  TEXT NOT NULL REFERENCES guiones(id) ON DELETE CASCADE,
  version   INTEGER NOT NULL,
  autor     TEXT NOT NULL CHECK (autor IN ('admin', 'cliente')),
  titulo    TEXT NOT NULL,
  formato   TEXT NOT NULL,
  contenido TEXT NOT NULL,
  creado    INTEGER NOT NULL
);
CREATE INDEX versiones_por_guion ON versiones(guion_id, version DESC);
