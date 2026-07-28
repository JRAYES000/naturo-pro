-- Migration 1.9 — Unicité du numéro de facture par praticien
--
-- La numérotation séquentielle sans doublon est une obligation légale française
-- (art. 242 nonies A du CGI). Le compteur (users.invoice_counter_value) était lu
-- puis écrit en deux requêtes : deux créations simultanées obtenaient le même
-- numéro. Le compteur est désormais incrémenté atomiquement, et cette contrainte
-- garantit qu'aucun doublon ne peut être inséré même en cas de course.
--
-- ⚠️ Vérifier l'absence de doublons AVANT d'exécuter :
--   SELECT user_id, number, COUNT(*) FROM invoices GROUP BY user_id, number HAVING COUNT(*) > 1;
-- (vérifié vide en production le 28/07/2026, 3 factures)
--
-- Appliqué automatiquement au boot par runMysqlMigrations (best-effort) ; ce
-- fichier reste la trace exécutable pour une base repartie de zéro.

CREATE UNIQUE INDEX uniq_invoice_user_number ON invoices (user_id, number);
