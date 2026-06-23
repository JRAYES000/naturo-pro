-- Migration 1.8 — Carrousels en images (Studio contenu)
-- Ajoute le stockage des visuels de carrousel sur content_posts :
--   slides_json      : JSON CarouselDeck (slides + caption + hashtags)
--   background_image : data-URL base64 de l'unique fond généré (peut dépasser 64 Ko → LONGTEXT)
-- Best-effort / idempotent : à exécuter une fois sur la prod MySQL.
-- Si une colonne existe déjà, ignorer l'erreur "Duplicate column name".

ALTER TABLE content_posts ADD COLUMN slides_json TEXT NULL;
ALTER TABLE content_posts ADD COLUMN background_image LONGTEXT NULL;
