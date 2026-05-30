-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 1.1 — consultation_notes.client_id nullable
-- ─────────────────────────────────────────────────────────────────────────────
-- Bug corrigé : prendre une note sur un RDV "walk-in" (sans fiche client liée)
-- échouait avec "NOT NULL constraint failed: consultation_notes.client_id".
-- Une note peut légitimement ne pas être rattachée à un client enregistré.
--
-- À exécuter sur la prod MySQL (les nouvelles installs SQLite sont déjà correctes
-- via le DDL bootstrap de storage.ts). Faire un dump avant (cf. docs/DEPLOY.md).

ALTER TABLE consultation_notes
  MODIFY COLUMN client_id INT NULL;
