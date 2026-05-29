-- Migration 0.7-recap-default-10
-- Aligne le défaut de recap_hour_local sur 10 (cohérence avec reminder_hour_local).
-- Les utilisateurs existants qui avaient encore la valeur par défaut 8
-- (et qui n'ont jamais touché ce champ) sont mis à jour à 10.

ALTER TABLE users
  MODIFY COLUMN recap_hour_local INT NOT NULL DEFAULT 10;

-- Met à jour les utilisateurs qui ont encore la valeur 8 par défaut historique.
-- (Ne touche pas ceux qui ont volontairement choisi une autre heure).
UPDATE users SET recap_hour_local = 10 WHERE recap_hour_local = 8;
