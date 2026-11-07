-- Base de datos del FMBC (Cloudflare D1)
-- Pegar y ejecutar una sola vez en: D1 > fmbc-db > Console
CREATE TABLE IF NOT EXISTS fmbc (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  creado        TEXT    NOT NULL DEFAULT (datetime('now')),
  para          TEXT,
  por           TEXT,
  fecha_modelo  TEXT,
  casillas      INTEGER,
  pais          TEXT,
  datos         TEXT    NOT NULL,
  resumen_md    TEXT
);
CREATE INDEX IF NOT EXISTS idx_fmbc_creado ON fmbc (creado);
