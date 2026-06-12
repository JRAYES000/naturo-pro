-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 1.4b — thème clair par défaut (bascule depuis le défaut initial 'dark')
-- ─────────────────────────────────────────────────────────────────────────────
-- La colonne users.theme_preference avait d'abord été déployée avec DEFAULT 'dark',
-- ce qui a écrit 'dark' sur toutes les lignes existantes. On bascule le défaut sur
-- 'light' et on réinitialise les comptes encore sur l'ancien défaut 'dark' (la
-- fonctionnalité de bascule étant toute récente, aucun choix utilisateur réel n'est
-- écrasé). À exécuter UNE SEULE FOIS (ne pas mettre dans la migration de démarrage,
-- sinon le UPDATE écraserait les choix "dark" faits ensuite par les utilisateurs).
-- Faire un dump avant (cf. docs/DEPLOY.md).

UPDATE users SET theme_preference = 'light' WHERE theme_preference = 'dark';
ALTER TABLE users ALTER COLUMN theme_preference SET DEFAULT 'light';
