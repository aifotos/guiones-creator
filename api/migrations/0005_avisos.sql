-- WhatsApp del cliente (opcional): para que "Avisar por WhatsApp" abra directamente su chat.
ALTER TABLE clientes ADD COLUMN telefono TEXT NOT NULL DEFAULT '';

-- Ajustes de la app, como el chat de Telegram al que llegan tus avisos.
CREATE TABLE ajustes (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
