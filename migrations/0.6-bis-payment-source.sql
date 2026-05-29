-- Migration Phase 0.6 BIS — Sync bidirectionnel Google Calendar
-- Ajoute les colonnes paymentStatus, paymentAmountCents et source à la table appointments
-- À exécuter sur la base MySQL de production

ALTER TABLE appointments
  ADD COLUMN payment_status VARCHAR(20) DEFAULT 'unpaid' AFTER reminder_sent,
  ADD COLUMN payment_amount_cents INT DEFAULT 0 AFTER payment_status,
  ADD COLUMN source VARCHAR(20) DEFAULT 'manual' AFTER payment_amount_cents;

-- Index pour accélérer la jointure googleEventId par user (lookup côté sync inverse)
CREATE INDEX idx_appt_user_google_event ON appointments (user_id, google_event_id);

-- Vérification
SELECT COUNT(*) AS total_rdv,
       SUM(CASE WHEN source = 'google' THEN 1 ELSE 0 END) AS rdv_google,
       SUM(CASE WHEN payment_status = 'paid' THEN 1 ELSE 0 END) AS rdv_payes
FROM appointments;
