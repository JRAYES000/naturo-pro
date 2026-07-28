-- Migration 2.0 — Marqueur durable des sessions Stripe traitées
--
-- Le rattrapage des acomptes (reconcilierPaiementsStripe) déterminait qu'une
-- session Stripe avait été traitée en cherchant un rendez-vous portant son
-- stripe_session_id. Or la suppression d'un rendez-vous est PHYSIQUE : supprimer
-- un RDV réglé par acompte (doublon, no-show, client remboursé) effaçait cette
-- trace, et le rattrapage recréait le rendez-vous — nouvel événement Google
-- Agenda et second email de confirmation — toutes les 30 min pendant 48 h.
-- Un remboursement Stripe ne repasse pas payment_status à autre chose que "paid".
--
-- Cette table n'est jamais purgée avec le rendez-vous. La contrainte UNIQUE sur
-- session_id sert aussi de verrou : deux exécutions concurrentes (success_url +
-- rattrapage, ou deux workers) ne peuvent pas créer deux rendez-vous.
--
-- Appliquée automatiquement au boot par runMysqlMigrations (best-effort) ; ce
-- fichier reste la trace exécutable pour une base repartie de zéro.

CREATE TABLE IF NOT EXISTS stripe_processed_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  session_id VARCHAR(255) NOT NULL UNIQUE,
  appointment_id INT NULL,
  created_at BIGINT NOT NULL,
  INDEX idx_sps_user (user_id)
);
