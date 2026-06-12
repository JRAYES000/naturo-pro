-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 1.4 — préférence de thème de l'interface sur users
-- ─────────────────────────────────────────────────────────────────────────────
-- Ajoute la colonne theme_preference ("dark" par défaut, "light" sinon), pilotée
-- depuis Paramètres → Apparence. Le dark mode est désormais le défaut pour tout le
-- monde ; chaque praticien peut basculer en mode clair. Appliqué automatiquement au
-- démarrage en MySQL (cf. storage.ts, bloc DB_DRIVER === "mysql"). Ce fichier sert
-- de trace / application manuelle. Faire un dump avant (cf. docs/DEPLOY.md).

ALTER TABLE users
  ADD COLUMN theme_preference VARCHAR(16) NOT NULL DEFAULT 'dark';
