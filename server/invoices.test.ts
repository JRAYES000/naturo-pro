/**
 * Tests unitaires — server/invoices.ts (calculs purs, formatage, numérotation).
 * Runner : node:test (intégré Node 24), lancé via `npm run test` (tsx --test).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeInvoiceTotals, computeItemTotal,
  buildInvoiceNumber, getYearFromMs,
  formatPriceCents, formatVatRate,
  paymentMethodLabel, invoiceStatusLabel,
  buildPractitionerSnapshot,
  renderInvoiceEmail,
} from "./invoices";

test("computeInvoiceTotals — sans TVA", () => {
  const t = computeInvoiceTotals([{ description: "C", quantity: 1, unitPriceCents: 1000 }], false, 2000);
  assert.deepEqual(t, { subtotalCents: 1000, vatCents: 0, totalCents: 1000 });
});

test("computeInvoiceTotals — TVA 20%", () => {
  const t = computeInvoiceTotals([{ description: "C", quantity: 1, unitPriceCents: 1000 }], true, 2000);
  assert.deepEqual(t, { subtotalCents: 1000, vatCents: 200, totalCents: 1200 });
});

test("computeInvoiceTotals — TVA 5,5% (arrondi au centime)", () => {
  const t = computeInvoiceTotals([{ description: "C", quantity: 1, unitPriceCents: 1000 }], true, 550);
  assert.equal(t.vatCents, 55); // round(1000 * 550 / 10000) = round(55)
});

test("computeInvoiceTotals — somme de plusieurs lignes", () => {
  const t = computeInvoiceTotals([
    { description: "A", quantity: 2, unitPriceCents: 1500 },
    { description: "B", quantity: 1, unitPriceCents: 500 },
  ], false, 0);
  assert.equal(t.subtotalCents, 3500);
});

test("computeInvoiceTotals — quantités/prix planchés (floor + clamp ≥ 0)", () => {
  const t = computeInvoiceTotals([
    { description: "frac", quantity: 2.9, unitPriceCents: 999.9 },
    { description: "neg", quantity: -5, unitPriceCents: -100 },
  ], false, 2000);
  assert.equal(t.subtotalCents, 1998); // floor(2.9)=2 * floor(999.9)=999 ; ligne neg → 0
});

test("computeItemTotal — floor et clamp", () => {
  assert.equal(computeItemTotal(3, 500), 1500);
  assert.equal(computeItemTotal(2.9, 100), 200);
  assert.equal(computeItemTotal(-1, 100), 0);
  assert.equal(computeItemTotal(1, -50), 0);
});

test("buildInvoiceNumber — padding 4 chiffres, pas de troncature au-delà", () => {
  assert.equal(buildInvoiceNumber(2026, 1), "FACT-2026-0001");
  assert.equal(buildInvoiceNumber(2026, 42), "FACT-2026-0042");
  assert.equal(buildInvoiceNumber(2026, 12345), "FACT-2026-12345");
});

test("getYearFromMs — bascule d'année en TZ Europe/Bucharest (UTC+2 hiver)", () => {
  // 31 déc 2025 23:00 UTC → 01:00 le 1er janv 2026 à Bucarest → année 2026
  assert.equal(getYearFromMs(Date.UTC(2025, 11, 31, 23, 0, 0)), 2026);
  // 31 déc 2025 21:00 UTC → 23:00 le 31 déc à Bucarest → année 2025
  assert.equal(getYearFromMs(Date.UTC(2025, 11, 31, 21, 0, 0)), 2025);
});

test("formatPriceCents — virgule décimale + symbole €", () => {
  assert.equal(formatPriceCents(1250), "12,50 €");
  assert.equal(formatPriceCents(0), "0,00 €");
  assert.equal(formatPriceCents(99), "0,99 €");
  assert.equal(formatPriceCents(-1250), "-12,50 €");
});

test("formatVatRate — entier sans décimale, sinon 2 décimales", () => {
  assert.equal(formatVatRate(2000), "20 %");
  assert.equal(formatVatRate(550), "5,50 %"); // toFixed(2) → "5,50"
});

test("paymentMethodLabel — libellés FR + défaut", () => {
  assert.equal(paymentMethodLabel("cash"), "Espèces");
  assert.equal(paymentMethodLabel("check"), "Chèque");
  assert.equal(paymentMethodLabel("transfer"), "Virement");
  assert.equal(paymentMethodLabel("card"), "Carte bancaire");
  assert.equal(paymentMethodLabel(null), "—");
  assert.equal(paymentMethodLabel("inconnu"), "—");
});

test("invoiceStatusLabel — libellés FR, fallback sur la valeur brute", () => {
  assert.equal(invoiceStatusLabel("draft"), "Brouillon");
  assert.equal(invoiceStatusLabel("paid"), "Payée");
  assert.equal(invoiceStatusLabel(null), "—");
  assert.equal(invoiceStatusLabel("custom"), "custom");
});

test("buildPractitionerSnapshot — valeurs par défaut (France, TVA 2000, non assujetti)", () => {
  const s = buildPractitionerSnapshot({ name: "Marie", email: "m@x.fr", phone: "06" } as any);
  assert.equal(s.name, "Marie");
  assert.equal(s.country, "France");
  assert.equal(s.vatRate, 2000);
  assert.equal(s.vatEnabled, false);
  assert.equal(s.siret, null);
});

test("buildPractitionerSnapshot — surcharges facturation", () => {
  const s = buildPractitionerSnapshot({
    name: "Marie", email: "m@x.fr", phone: "06",
    billingVatEnabled: 1, billingVatRate: 550, billingCountry: "Belgique", billingSiret: "123",
  } as any);
  assert.equal(s.vatEnabled, true);
  assert.equal(s.vatRate, 550);
  assert.equal(s.country, "Belgique");
  assert.equal(s.siret, "123");
});

test("renderInvoiceEmail — sujet, montant et échappement HTML", () => {
  const out = renderInvoiceEmail({
    invoiceNumber: "FACT-2026-0007",
    totalCents: 12000,
    practitionerName: "Marie Dupont",
    clientFirstName: "<b>Léa</b>",
    notes: "Merci & à bientôt",
  });
  assert.equal(out.subject, "Facture FACT-2026-0007 — Marie Dupont");
  assert.ok(out.html.includes("FACT-2026-0007"));
  assert.ok(out.html.includes("120,00 €"));
  // XSS : le prénom est échappé
  assert.ok(out.html.includes("&lt;b&gt;Léa&lt;/b&gt;"));
  assert.equal(out.html.includes("<b>Léa</b>"), false);
  // & échappé dans les notes
  assert.ok(out.html.includes("Merci &amp; à bientôt"));
  // Version texte
  assert.ok(out.text.includes("120,00 €"));
  assert.ok(out.text.includes("FACT-2026-0007"));
});
