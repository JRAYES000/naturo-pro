-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 1.6 — table ai_chat_usage (quota quotidien de l'assistant IA)
-- ─────────────────────────────────────────────────────────────────────────────
-- Compteur de messages assistant par utilisatrice et par jour, pour borner le
-- coût Mistral (limite AI_DAILY_LIMIT, défaut 50/jour). Additif / non destructif.

CREATE TABLE IF NOT EXISTS ai_chat_usage (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  day VARCHAR(10) NOT NULL,
  count INT NOT NULL DEFAULT 0,
  INDEX idx_ai_usage_user_day (user_id, day)
);
