-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 1.5 — table ai_chat_messages (Assistant IA Mistral)
-- ─────────────────────────────────────────────────────────────────────────────
-- Crée la table de l'assistant IA naturopathie : une ligne = un message,
-- conversation continue unique par utilisatrice (scopée par user_id), triée par
-- created_at. En MySQL les tables ne sont PAS auto-créées au démarrage
-- (cf. storage.ts : bootstrap SQLite uniquement) → appliquer ce fichier
-- manuellement sur la base prod. Faire un dump avant (cf. docs/DEPLOY.md).
-- Additif / non destructif (CREATE TABLE IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS ai_chat_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  role VARCHAR(16) NOT NULL,
  content TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  INDEX idx_ai_chat_user_created (user_id, created_at)
);
