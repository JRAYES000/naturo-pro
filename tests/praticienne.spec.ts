import { test, expect } from "@playwright/test";
import { FICHIER_SESSION } from "./session";

/**
 * Parcours de la praticienne dans un vrai navigateur.
 *
 * Le compte de démonstration (marie@demo.fr) est créé par le seed au premier démarrage.
 */

const EMAIL = "marie@demo.fr";
const MDP = "demo1234";

async function seConnecter(page: import("@playwright/test").Page) {
  await page.goto("/#/login");
  await page.getByPlaceholder("vous@exemple.fr").fill(EMAIL);
  await page.getByPlaceholder("••••••••").fill(MDP);
  await page.getByRole("button", { name: /Se connecter/i }).click();
  await expect(page.getByText(/Bonjour Marie/i)).toBeVisible({ timeout: 15_000 });
}

test.describe("Connexion", () => {
  test("un mot de passe correct mène au tableau de bord", async ({ page }) => {
    await seConnecter(page);
    await expect(page.getByText(/Votre cabinet, en un coup d'œil/i)).toBeVisible();
  });

  test("un mot de passe erroné affiche une erreur lisible, pas un écran cassé", async ({ page }) => {
    await page.goto("/#/login");
    await page.getByPlaceholder("vous@exemple.fr").fill(EMAIL);
    await page.getByPlaceholder("••••••••").fill("mauvais-mot-de-passe");
    await page.getByRole("button", { name: /Se connecter/i }).click();
    await expect(page.getByText(/incorrect|invalide|erreur/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/#\/login/);
  });

  test("une page protégée renvoie vers la connexion quand on n'est pas identifié", async ({ page }) => {
    await page.goto("/#/app/agenda");
    await expect(page).toHaveURL(/#\/login/, { timeout: 10_000 });
  });
});

test.describe("Navigation authentifiée", () => {
  // Session enregistrée par le projet « setup » : aucune reconnexion, donc aucun
  // risque d'épuiser le rate-limiter anti-force-brute (10 tentatives / 15 min / IP).
  test.use({ storageState: FICHIER_SESSION });

  /**
   * `ProtectedRoute` bloquait le rendu sur `isFetching`, donc tout refetch de
   * /api/auth/me démontait l'arbre et réaffichait « Chargement… ». Ici on vérifie
   * qu'une navigation entre pages n'entraîne pas d'écran de chargement persistant.
   */
  test("passer d'une page à l'autre n'affiche pas d'écran de chargement bloquant", async ({ page }) => {
    for (const [lien, attendu] of [
      ["/#/app/clients", /Clients/i],
      ["/#/app/agenda", /Agenda|Rendez-vous/i],
      ["/#/app/invoices", /Factures/i],
      ["/#/app/settings", /Réglages|Paramètres/i],
    ] as Array<[string, RegExp]>) {
      await page.goto(lien);
      await expect(page.getByText(/^Chargement…$/)).toHaveCount(0, { timeout: 10_000 });
      await expect(page.locator("body")).toContainText(attendu, { timeout: 10_000 });
    }
  });

  test("aucune erreur JavaScript sur les pages principales", async ({ page }) => {
    const erreurs: string[] = [];
    page.on("pageerror", (e) => erreurs.push(`${page.url()} → ${e.message}`));
    for (const lien of ["/#/app", "/#/app/clients", "/#/app/agenda", "/#/app/invoices"]) {
      await page.goto(lien);
      await page.waitForTimeout(600);
    }
    expect(erreurs, erreurs.join("\n")).toEqual([]);
  });
});
