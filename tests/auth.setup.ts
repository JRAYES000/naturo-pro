import { test as setup, expect } from "@playwright/test";
import { FICHIER_SESSION } from "./session";

/**
 * Se connecte UNE SEULE FOIS et enregistre la session pour tous les tests authentifiés.
 *
 * Pourquoi : `authLimiter` autorise 10 tentatives par quart d'heure et par IP — une
 * protection anti-force brute légitime. Se reconnecter dans chaque test épuisait le
 * quota dès le troisième projet, et les tests échouaient sur un 429 qui n'avait rien
 * à voir avec ce qu'ils vérifiaient. C'est le motif recommandé par Playwright.
 */

setup("authentifier la praticienne de démonstration", async ({ page }) => {
  await page.goto("/#/login");
  await page.getByPlaceholder("vous@exemple.fr").fill("marie@demo.fr");
  await page.getByPlaceholder("••••••••").fill("demo1234");
  await page.getByRole("button", { name: /Se connecter/i }).click();
  await expect(page.getByText(/Bonjour Marie/i)).toBeVisible({ timeout: 20_000 });
  await page.context().storageState({ path: FICHIER_SESSION });
});
