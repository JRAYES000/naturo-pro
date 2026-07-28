# migrations/ — historique, plus utilisé

Ces fichiers `.sql` retracent l'évolution du schéma **avant** le 28 juillet 2026. Ils
étaient exécutés à la main sur la production, et recopiés en parallèle dans un bloc
`try/catch` de `server/storage.ts` — d'où la duplication qui a fini par diverger.

Ils sont conservés pour la mémoire du projet. **Ne les rejouez pas.**

## Où ça se passe maintenant

| | Source de vérité | Application |
|---|---|---|
| Développement (SQLite) | `shared/schema.ts` | `npm run db:push` (auto via `predev` / `pretest`) |
| Production (MySQL) | `shared/schema-mysql.ts` | `migrations-mysql/`, appliquées au démarrage |

## Ajouter une colonne ou une table

1. Déclarez-la dans `shared/schema.ts` **et** `shared/schema-mysql.ts`
   (plus `shared/schema-active.ts` s'il s'agit d'une nouvelle table).
2. `npm run db:generate:mysql` — produit le fichier de migration versionné.
3. Relisez le SQL généré. Committez-le.
4. Au prochain déploiement, il s'applique tout seul et s'inscrit dans `__drizzle_migrations`.

Un test (`shared/schema-drift.test.ts`) échoue si les deux schémas divergent, si une table
avec `user_id` échappe au cascade RGPD, ou si une table déclarée n'est pas créée.

## Amorçage du 28/07/2026

Le schéma de production correspondait déjà exactement au schéma Drizzle — vérifié colonne
par colonne, aucune dérive. La migration `0000` a donc été inscrite comme appliquée sans
être rejouée. Trois index ont été réconciliés au passage : deux doublons créés la veille
(`uniq_invoice_user_number`, `idx_email_templates_user`) et un nom auto-généré par MySQL
aligné sur celui attendu par Drizzle.
