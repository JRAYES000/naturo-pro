-- Phase 0.7 — Rappels J-1 + récap praticienne (MySQL Hostinger)
-- À exécuter UNE FOIS sur prod après déploiement du code

-- ─── Users : configuration Resend + heures locales ──────────────────────────
ALTER TABLE users
  ADD COLUMN resend_api_key VARCHAR(255) NULL,
  ADD COLUMN email_from_address VARCHAR(255) NULL,
  ADD COLUMN email_from_name VARCHAR(255) NULL,
  ADD COLUMN daily_recap_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN reminder_hour_local INT NOT NULL DEFAULT 10,
  ADD COLUMN recap_hour_local INT NOT NULL DEFAULT 8;

-- ─── Appointments : tokens publics + timestamps confirmation/annulation ────
ALTER TABLE appointments
  ADD COLUMN reminder_sent_at BIGINT NULL,
  ADD COLUMN confirm_token VARCHAR(64) NULL,
  ADD COLUMN cancel_token VARCHAR(64) NULL,
  ADD COLUMN client_confirmed_at BIGINT NULL,
  ADD COLUMN client_cancelled_at BIGINT NULL;

-- Index pour lookup rapide des tokens (lecture publique sans login)
CREATE INDEX idx_appt_confirm_token ON appointments (confirm_token);
CREATE INDEX idx_appt_cancel_token  ON appointments (cancel_token);

-- Index pour le job des rappels (RDV à venir non-encore notifiés)
CREATE INDEX idx_appt_reminder_pending ON appointments (start_at, reminder_sent);
