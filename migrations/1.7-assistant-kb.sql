-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 1.7 — assistant : instructions globales + base de connaissances (RAG)
-- ─────────────────────────────────────────────────────────────────────────────
-- Trois tables additives (non destructives) :
--   • assistant_settings — 1 ligne, instructions personnalisées du formateur.
--   • kb_documents       — supports de cours curatés par l'admin (PDF/texte/markdown).
--   • kb_chunks          — chunks vectorisés (embedding mistral-embed en JSON).
-- ⚠️ MySQL : les colonnes TEXT (custom_instructions, embedding) n'ont pas de DEFAULT.

CREATE TABLE IF NOT EXISTS assistant_settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  custom_instructions TEXT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS kb_documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  filename VARCHAR(255),
  mime_type VARCHAR(127),
  char_count INT NOT NULL DEFAULT 0,
  status VARCHAR(16) NOT NULL DEFAULT 'ready',
  error TEXT,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS kb_chunks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  document_id INT NOT NULL,
  chunk_index INT NOT NULL,
  content TEXT NOT NULL,
  embedding TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  INDEX idx_kb_chunks_document_id (document_id)
);
