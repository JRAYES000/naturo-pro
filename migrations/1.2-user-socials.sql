-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 1.2 — réseaux sociaux sur users (page publique)
-- ─────────────────────────────────────────────────────────────────────────────
-- Ajoute Instagram, Facebook et site web, affichés sur la page publique du
-- praticien. Appliqué automatiquement au démarrage en MySQL (cf. storage.ts,
-- bloc DB_DRIVER === "mysql"). Ce fichier sert de trace / application manuelle.
-- Faire un dump avant (cf. docs/DEPLOY.md).

ALTER TABLE users
  ADD COLUMN instagram VARCHAR(255) NULL,
  ADD COLUMN facebook VARCHAR(255) NULL,
  ADD COLUMN website_url VARCHAR(255) NULL;
