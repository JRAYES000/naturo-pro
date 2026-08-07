import { test, expect, type Page } from "@playwright/test";

/**
 * Le parcours de la cliente, de bout en bout, dans un vrai navigateur.
 *
 * C'est le chemin le plus exposé du produit : non authentifié, partagé par lien, et
 * emprunté majoritairement depuis un téléphone. Trois défauts corrigés le 28/07/2026
 * n'étaient visibles QUE par ce biais.
 */

const SLUG = "marie-dupont";

/** Attend que la page publique de la praticienne soit rendue. */
async function ouvrirPagePublique(page: Page) {
  await page.goto(`/#/p/${SLUG}`);
  await expect(page.getByRole("heading", { name: "Marie Dupont" })).toBeVisible();
}

test.describe("Page publique", () => {
  test("affiche la praticienne et ses prestations", async ({ page }) => {
    await ouvrirPagePublique(page);
    await expect(page.getByText("Première consultation")).toBeVisible();
    await expect(page.getByRole("link", { name: /Prendre rendez-vous/i }).first()).toBeVisible();
  });

  test("n'expose aucune donnée privée de la praticienne", async ({ page }) => {
    await ouvrirPagePublique(page);
    const texte = (await page.locator("body").innerText()).toLowerCase();
    // L'email et le téléphone du cabinet ne doivent pas figurer sur la page publique.
    expect(texte).not.toContain("marie@demo.fr");
    expect(texte).not.toMatch(/resend|stripe|sk_/);
  });

  test("un praticien inexistant ne casse pas la page", async ({ page }) => {
    await page.goto("/#/p/slug-qui-nexiste-vraiment-pas");
    // Message d'erreur lisible, pas un écran blanc ni une trace technique.
    await expect(page.locator("body")).not.toBeEmpty();
    const texte = await page.locator("body").innerText();
    expect(texte.length).toBeGreaterThan(20);
    expect(texte).not.toMatch(/undefined|\[object Object\]|TypeError/);
  });
});

test.describe("URL partagée sans hash", () => {
  /**
   * `app.ecole-naturo.fr/p/mon-slug` est la forme qu'une praticienne partage
   * naturellement — c'est celle que l'application lui affiche. Elle rendait une page
   * ENTIÈREMENT BLANCHE : les balises <script src="./assets/…"> se résolvaient en
   * /p/assets/… , le catch-all renvoyait index.html, et le module ne s'exécutait pas.
   */
  test("mène à la page de la praticienne, pas à la page d'accueil", async ({ page }) => {
    await page.goto(`/p/${SLUG}`);
    await expect(page.getByRole("heading", { name: "Marie Dupont" })).toBeVisible();
    // Action 8 (scope resserré, 07/08/2026) : /p/:slug est désormais une route
    // publique en URL propre, en dehors du hash router — elle ne doit PLUS
    // retomber sur #/p/{slug} après chargement du JS (c'était le bug d'origine
    // que ce test attendait comme comportement correct avant ce fix).
    await expect(page).toHaveURL(new RegExp(`/p/${SLUG}$`));
    expect(new URL(page.url()).hash, "l'URL doit rester propre, sans hash").toBe("");
  });

  test("la page n'est jamais blanche", async ({ page }) => {
    const erreurs: string[] = [];
    page.on("pageerror", (e) => erreurs.push(e.message));
    await page.goto(`/p/${SLUG}`);
    await expect(page.locator("#root")).not.toBeEmpty();
    expect(erreurs, `erreurs JS : ${erreurs.join(" | ")}`).toEqual([]);
  });
});

test.describe("Tunnel de réservation", () => {
  /**
   * Le lien « Réserver » d'une prestation portait la prestation en query (`?cat=3`).
   * En routage par hash, un clic normal la perdait (la cliente repartait de l'étape 1)
   * et un lien copié-collé donnait « 404 Page introuvable ».
   */
  test("le lien d'une prestation la présélectionne", async ({ page }) => {
    await ouvrirPagePublique(page);
    const lienReserver = page.locator('[data-testid^="button-book-"]').first();
    const href = await lienReserver.getAttribute("href");
    expect(href, "le lien doit porter la prestation dans le CHEMIN").toMatch(/\/book\/\d+$/);

    await lienReserver.click();
    // On arrive directement au choix de la DATE : l'étape « choisissez une prestation »
    // a bien été sautée grâce à la présélection.
    await expect(page.getByRole("heading", { name: /Choisissez une date/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Choisissez une prestation/i })).toHaveCount(0);
  });

  test("un lien de réservation copié-collé ne donne pas une 404", async ({ page }) => {
    await ouvrirPagePublique(page);
    const href = await page.locator('[data-testid^="button-book-"]').first().getAttribute("href");
    // Navigation directe, comme un lien collé dans une bio Instagram ou un mail.
    await page.goto(href!.replace(/^#/, "/#"));
    await expect(page.getByText(/Page introuvable/i)).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /Choisissez une date/i })).toBeVisible();
  });

  test("réservation complète jusqu'à la confirmation", async ({ page }) => {
    await ouvrirPagePublique(page);
    await page.locator('[data-testid^="button-book-"]').first().click();

    await expect(page.getByRole("heading", { name: /Choisissez une date/i })).toBeVisible();
    await page.locator('[data-testid^="button-day-"]').first().click();

    await expect(page.getByRole("heading", { name: /Choisissez un créneau/i })).toBeVisible();
    await page.locator('[data-testid^="button-slot-"]').first().click();

    await expect(page.getByRole("heading", { name: /Vos coordonnées/i })).toBeVisible();
    const marque = Date.now();
    await page.getByTestId("input-firstName").fill("Playwright");
    await page.getByTestId("input-lastName").fill("Test");
    await page.getByTestId("input-email").fill(`pw-${marque}@example.invalid`);
    await page.getByTestId("input-phone").fill("0612345678");

    await page.getByRole("button", { name: /Confirmer le rendez-vous/i }).click();
    await expect(page.getByRole("heading", { name: /C'est confirmé/i })).toBeVisible({ timeout: 15_000 });
  });

  test("le bouton de confirmation reste inactif tant que le formulaire est incomplet", async ({ page }) => {
    await ouvrirPagePublique(page);
    await page.locator('[data-testid^="button-book-"]').first().click();
    await page.locator('[data-testid^="button-day-"]').first().click();
    await page.locator('[data-testid^="button-slot-"]').first().click();
    await expect(page.getByRole("button", { name: /Confirmer le rendez-vous/i })).toBeDisabled();
  });
});

test.describe("Fuseau horaire", () => {
  /**
   * Les créneaux étaient affichés avec le fuseau du NAVIGATEUR, alors que les emails
   * sont rendus en heure de Paris : une cliente en outre-mer réservait « 11:00 » et
   * recevait un mail disant « 09:00 ».
   *
   * Ce test ne vaut que dans le projet « bureau-autre-fuseau » (Indian/Reunion, UTC+4).
   */
  test("les heures restent celles du cabinet, quel que soit le fuseau de la visiteuse", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "bureau-autre-fuseau", "projet dédié au décalage");

    await ouvrirPagePublique(page);
    await page.locator('[data-testid^="button-book-"]').first().click();
    await page.locator('[data-testid^="button-day-"]').first().click();

    const premier = page.locator('[data-testid^="button-slot-"]').first();
    const iso = (await premier.getAttribute("data-testid"))!.replace("button-slot-", "");
    const affiche = (await premier.innerText()).trim();

    const attendu = new Date(iso).toLocaleTimeString("fr-FR", {
      timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    });
    const fuseauVisiteuse = new Date(iso).toLocaleTimeString("fr-FR", {
      timeZone: "Indian/Reunion", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    });

    expect(affiche, "l'heure affichée doit être celle de Paris").toBe(attendu);
    expect(affiche, "et surtout PAS celle du navigateur").not.toBe(fuseauVisiteuse);
    await expect(page.getByTestId("text-timezone-notice")).toBeVisible();
  });
});
