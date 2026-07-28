-- Migration 2.1 — Index manquants
--
-- Les tables créées par le bloc best-effort de runMysqlMigrations ne portaient AUCUN
-- index en dehors de leur clé primaire, et les schémas Drizzle n'en déclaraient pas
-- non plus. Conséquences mesurables :
--   - GET /api/public/anamnese/:token faisait un scan complet d'anamnesis_responses,
--     sur une route publique NON authentifiée ;
--   - listClients, listPrograms, listPackages, listContentPosts scannaient leur table
--     entière à chaque appel ;
--   - la purge des sessions expirées scannait toute la table sessions.
--
-- Appliqués automatiquement au boot par runMysqlMigrations (best-effort) ; ce fichier
-- reste la trace exécutable pour une base repartie de zéro.
--
-- ⚠️ MySQL n'a pas de CREATE INDEX IF NOT EXISTS : relancer ce fichier sur une base
-- déjà migrée produit des erreurs « Duplicate key name », sans danger.

CREATE INDEX idx_clients_user ON clients (user_id);
CREATE INDEX idx_appt_user_start ON appointments (user_id, start_at);
CREATE INDEX idx_notes_user ON consultation_notes (user_id);
CREATE INDEX idx_notes_client ON consultation_notes (client_id);
CREATE INDEX idx_notes_appointment ON consultation_notes (appointment_id);
CREATE INDEX idx_avail_user ON availability_slots (user_id);
CREATE INDEX idx_categories_user ON appointment_categories (user_id);
CREATE INDEX idx_email_templates_user ON email_templates (user_id, kind);
CREATE INDEX idx_sessions_expires ON sessions (expires_at);
CREATE INDEX idx_anamnesis_tpl_user ON anamnesis_templates (user_id);
CREATE INDEX idx_anamnesis_resp_user ON anamnesis_responses (user_id);
CREATE INDEX idx_anamnesis_resp_token ON anamnesis_responses (token);
CREATE INDEX idx_programs_user ON programs (user_id);
CREATE INDEX idx_programs_client ON programs (client_id);
CREATE INDEX idx_client_docs_user_client ON client_documents (user_id, client_id);
CREATE INDEX idx_natural_solutions_user ON natural_solutions (user_id);
CREATE INDEX idx_packages_user_client ON packages (user_id, client_id);
CREATE INDEX idx_ai_discussions_user ON ai_discussions (user_id);
CREATE INDEX idx_content_posts_user ON content_posts (user_id, status);
