/**
 * Emplacement de la session enregistrée par `tests/auth.setup.ts`.
 *
 * Module ordinaire, pas un fichier de test : Playwright refuse qu'un spec importe un
 * autre fichier de test. Chemin relatif à la racine du projet (Playwright s'exécute
 * toujours depuis là), ce qui évite l'ambiguïté de `__dirname` entre ESM et CJS.
 */
export const FICHIER_SESSION = "tests/.auth/praticienne.json";
