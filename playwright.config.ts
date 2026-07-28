import { defineConfig, devices } from "@playwright/test";

/**
 * Tests de parcours dans un VRAI navigateur.
 *
 * Complète `npm run test:e2e` (89 vérifications en HTTP) : ce qui est ici ne peut pas
 * être vérifié autrement qu'avec un navigateur — routage par hash, rendu, fuseau horaire
 * du poste de la visiteuse, affichage mobile. Plusieurs défauts corrigés le 28/07 étaient
 * précisément de cette nature :
 *   - page blanche sur `/p/mon-slug` (assets en chemin relatif) ;
 *   - « 404 Page introuvable » sur le lien « Réserver » copié ;
 *   - créneaux affichés dans le fuseau du navigateur au lieu de celui du cabinet.
 *
 * Le serveur est démarré automatiquement (`webServer`), sur SQLite jetable.
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false, // un seul serveur, une seule base SQLite
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  timeout: 30_000,

  use: {
    baseURL: process.env.BASE_URL || "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "fr-FR",
  },

  projects: [
    // Se connecte une seule fois ; les projets suivants réutilisent la session.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "bureau",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
    {
      // La majorité des clientes réservent depuis leur téléphone.
      name: "mobile",
      use: { ...devices["Pixel 7"] },
      dependencies: ["setup"],
    },
    {
      // Visiteuse dans un autre fuseau : les heures affichées doivent rester
      // celles du cabinet (Europe/Paris), pas celles de son téléphone.
      name: "bureau-autre-fuseau",
      use: { ...devices["Desktop Chrome"], timezoneId: "Indian/Reunion" },
      dependencies: ["setup"],
    },
  ],

  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000/api/auth/me",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: { DB_DRIVER: "sqlite", NODE_ENV: "development", PORT: "3000" },
      },
});
