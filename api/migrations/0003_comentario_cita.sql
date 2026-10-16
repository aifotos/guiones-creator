-- Comentarios sobre una frase concreta: el bloque y el texto que el cliente seleccionó.
-- JSON {"bloque": "<id del bloque>", "texto": "<frase>"}; vacío si es un comentario general.
ALTER TABLE comentarios ADD COLUMN cita TEXT;
