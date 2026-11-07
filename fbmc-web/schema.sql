-- Base de datos del FBMC (Cloudflare D1)
-- Instalación nueva: pegar y ejecutar una sola vez en D1 > (tu base de datos) > Console.
-- Si ya tenías la tabla antigua "fmbc", NO ejecutes esto: ejecuta solo la línea de abajo.
--   ALTER TABLE fmbc RENAME TO fbmc;
-- Para poder publicar lienzos como ejemplos, si tu tabla ya existía ejecuta una vez:
--   ALTER TABLE fbmc ADD COLUMN publico INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS fbmc (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  creado        TEXT    NOT NULL DEFAULT (datetime('now')),
  para          TEXT,
  por           TEXT,
  fecha_modelo  TEXT,
  casillas      INTEGER,
  pais          TEXT,
  datos         TEXT    NOT NULL,
  resumen_md    TEXT,
  publico       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_fbmc_creado ON fbmc (creado);
