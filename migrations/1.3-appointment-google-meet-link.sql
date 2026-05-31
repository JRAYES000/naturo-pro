-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 1.3 — lien Google Meet sur appointments (RDV en visio)
-- ─────────────────────────────────────────────────────────────────────────────
-- Stocke l'URL Google Meet générée automatiquement par Google Agenda lors de la
-- création de l'événement, pour les rendez-vous dont le lieu est « visio ».
-- Affichée au client (email de confirmation / rappel J-1) et au praticien (agenda).
-- Appliqué automatiquement au démarrage en MySQL (cf. storage.ts, bloc
-- DB_DRIVER === "mysql"). Ce fichier sert de trace / application manuelle.
-- Faire un dump avant (cf. docs/DEPLOY.md).

ALTER TABLE appointments
  ADD COLUMN google_meet_link VARCHAR(512) NULL;
