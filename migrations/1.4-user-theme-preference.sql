-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 1.4 — préférence de thème de l'interface sur users
-- ─────────────────────────────────────────────────────────────────────────────
-- Ajoute la colonne theme_preference ("light" par défaut, "dark" sinon), pilotée
-- depuis Paramètres → Apparence. Le thème clair est le défaut pour tout le monde ;
-- chaque praticien peut basculer en mode sombre. Appliqué automatiquement au
-- démarrage en MySQL (cf. storage.ts, bloc DB_DRIVER === "mysql"). Ce fichier sert
-- de trace / application manuelle. Faire un dump avant (cf. docs/DEPLOY.md).
--
-- NB historique : la colonne a d'abord été déployée avec DEFAULT 'dark' (le défaut
-- initial), puis basculée en 'light'. Cf. migrations/1.4b-theme-default-light.sql
-- pour le passage du défaut à 'light' + la réinitialisation des lignes existantes.

ALTER TABLE users
  ADD COLUMN theme_preference VARCHAR(16) NOT NULL DEFAULT 'light';
