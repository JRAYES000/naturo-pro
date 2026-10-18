/**
 * Lot 2b — liens publics des documents : page du devis / de la facture, décision
 * sur un devis, règlement en ligne par Stripe (succès et rattrapage), conversion
 * d'un devis accepté, expiration, journal de suivi et message groupé.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { storage } from "../storage";
import {
  renderPublicDocumentPage, quoteState, quoteIsExpired, invoicePayable, publiclyVisible, renderUnsubscribePage,
} from "../public-documents";
import { reglerFactureDepuisSession, isInvoiceSession } from "./helpers/stripe-invoice";
import { expireQuotes } from "./cron";
import { runBroadcast } from "./broadcasts";
import { broadcastRecipients, personalize, renderBroadcastEmail, textToHtml } from "../broadcast";
import { zonedTimeToUtc } from "../timezone";

const JOUR = 86400000;
const base = {
  number: "DEVIS-2026-0001", issueDate: Date.UTC(2026, 9, 1, 10), totalCents: 12000, subtotalCents: 12000, vatCents: 0,
  vatEnabled: false, clientFirstName: "Léa", clientLastName: "Martin",
};
const items = [{ description: "Bilan <script>alert(1)</script>", quantity: 1, unitPriceCents: 12000, totalCents: 12000 }];

test("page publique — devis ouvert : formulaire d'accord, contenu échappé", () => {
  const html = renderPublicDocumentPage({
    doc: { ...base, docType: "devis", status: "sent", dueDate: Date.now() + 10 * JOUR }, items, token: "a".repeat(32),
    practitionerName: "Marie <Dupont>", onlinePayment: true,
  });
  assert.match(html, /Accepter le devis/);
  assert.match(html, /name="signerName"/);
  assert.match(html, /\/api\/public\/doc\/a{32}\/accept/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /Bilan &lt;script&gt;/);
  assert.match(html, /Marie &lt;Dupont&gt;/);
  assert.match(html, /noindex/);
});

test("page publique — devis accepté, expiré, facture payable ou non", () => {
  const accepte = renderPublicDocumentPage({
    doc: { ...base, docType: "devis", status: "accepted", quoteDecidedAt: Date.UTC(2026, 9, 3, 10), quoteSignerName: "Léa Martin" },
    items, token: "b".repeat(32), practitionerName: "Marie", onlinePayment: false,
  });
  assert.match(accepte, /Devis accepté le 03\/10\/2026 par Léa Martin/);
  assert.doesNotMatch(accepte, /name="signerName"/);

  const expire = renderPublicDocumentPage({
    doc: { ...base, docType: "devis", status: "sent", dueDate: Date.UTC(2026, 0, 10, 11) },
    items, token: "c".repeat(32), practitionerName: "Marie", onlinePayment: false,
  });
  assert.match(expire, /Ce devis a expiré/);

  const facture = { ...base, docType: "invoice", number: "FACT-2026-0001", status: "sent" };
  const avecStripe = renderPublicDocumentPage({ doc: facture, items, token: "d".repeat(32), practitionerName: "Marie", onlinePayment: true });
  assert.match(avecStripe, /Payer 120,00 € par carte/);
  const sansStripe = renderPublicDocumentPage({ doc: facture, items, token: "d".repeat(32), practitionerName: "Marie", onlinePayment: false });
  assert.doesNotMatch(sansStripe, /par carte/);
  assert.match(sansStripe, /n'est pas proposé/);
  const payee = renderPublicDocumentPage({ doc: { ...facture, status: "paid", paidAt: Date.UTC(2026, 9, 5, 10) }, items, token: "d".repeat(32), practitionerName: "Marie", onlinePayment: true });
  assert.match(payee, /Facture réglée le 05\/10\/2026/);
});

test("états d'un devis et documents visibles", () => {
  // Valable jusqu'au 10/01 inclus (heure de Paris), expiré le 11/01.
  const echeance = zonedTimeToUtc(2026, 1, 10, 12, 0);
  assert.equal(quoteIsExpired({ dueDate: echeance }, zonedTimeToUtc(2026, 1, 10, 23, 59)), false);
  assert.equal(quoteIsExpired({ dueDate: echeance }, zonedTimeToUtc(2026, 1, 11, 0, 1)), true);
  assert.equal(quoteState({ ...base, docType: "devis", status: "refused" }), "refused");
  assert.equal(quoteState({ ...base, docType: "devis", status: "draft" }), "open");
  assert.equal(invoicePayable({ ...base, docType: "invoice", status: "issued" }), true);
  assert.equal(invoicePayable({ ...base, docType: "invoice", status: "draft" }), false);
  assert.equal(invoicePayable({ ...base, docType: "avoir", status: "issued" }), false);
  assert.equal(publiclyVisible({ ...base, docType: "invoice", status: "draft" }), false);
  assert.equal(publiclyVisible({ ...base, docType: "devis", status: "draft" }), true);
  assert.match(renderUnsubscribePage({ practitionerName: "Marie", token: "e".repeat(32), done: true }), /ne recevrez plus/);
});

test("message groupé — destinataires, personnalisation, HTML", () => {
  const liste = [
    { id: 1, firstName: "Léa", lastName: "M", email: "lea@exemple.fr" },
    { id: 2, firstName: "Doublon", lastName: "M", email: "LEA@exemple.fr" },
    { id: 3, firstName: "Archivée", lastName: "A", email: "a@exemple.fr", archivedAt: 1 },
    { id: 4, firstName: "Désinscrite", lastName: "D", email: "d@exemple.fr", emailOptOutAt: 1 },
    { id: 5, firstName: "Sans", lastName: "Email", email: null },
    { id: 6, firstName: "Invalide", lastName: "I", email: "pas-un-email" },
    { id: 7, firstName: "Zoé", lastName: "Z", email: "zoe@exemple.fr" },
  ];
  assert.deepEqual(broadcastRecipients(liste).map((c) => c.id), [1, 7]);
  assert.equal(personalize("Bonjour {prenom} {Nom}, {Prénom} !", { firstName: "Léa", lastName: "Martin" }), "Bonjour Léa Martin, Léa !");
  assert.equal(textToHtml("Un <b>\n\nVoir https://exemple.fr/atelier."),
    '<p style="font-size:15px;line-height:1.6;margin:0 0 14px">Un &lt;b&gt;</p><p style="font-size:15px;line-height:1.6;margin:0 0 14px">Voir <a href="https://exemple.fr/atelier">https://exemple.fr/atelier</a>.</p>');
  const mail = renderBroadcastEmail({ subject: "Fermeture, {prenom}", body: "Bonjour {prenom},\nLe cabinet ferme.", client: { firstName: "Léa" }, practitionerName: "Marie", unsubscribeUrl: "https://app/x" });
  assert.equal(mail.subject, "Fermeture, Léa");
  assert.match(mail.text, /Bonjour Léa,\nLe cabinet ferme\./);
  assert.match(mail.text, /Ne plus recevoir ces messages : https:\/\/app\/x/);
});

// ── Intégration (SQLite) ─────────────────────────────────────────────────────
let user: any;
let autre: any;
let client: any;
before(async () => {
  const now = Date.now();
  user = await storage.createUser({
    email: `docs-${now}@example.invalid`, passwordHash: "x", googleId: null, name: "Docs Test", slug: `docs-${now}`,
    bio: "", photoUrl: null, phone: null, specialties: "[]", address: null, city: null, createdAt: now, plan: "trial",
  } as any);
  autre = await storage.createUser({
    email: `docs2-${now}@example.invalid`, passwordHash: "x", googleId: null, name: "Autre", slug: `docs2-${now}`,
    bio: "", photoUrl: null, phone: null, specialties: "[]", address: null, city: null, createdAt: now, plan: "trial",
  } as any);
  client = await storage.createClient(user.id, { firstName: "Léa", lastName: "Martin", email: `lea-${now}@example.invalid` } as any);
});
after(async () => {
  if (user) await storage.deleteUserCascade(user.id);
  if (autre) await storage.deleteUserCascade(autre.id);
});

function facture(over: Record<string, unknown> = {}) {
  const now = Date.now();
  return storage.createInvoice({
    userId: user.id, number: `FACT-T-${now}-${Math.random().toString(36).slice(2, 7)}`, docType: "invoice", status: "sent",
    issueDate: now, clientId: client.id, clientFirstName: "Léa", clientLastName: "Martin",
    subtotalCents: 12000, vatCents: 0, totalCents: 12000, vatRate: 0, vatEnabled: false, createdAt: now, updatedAt: now, ...over,
  } as any);
}

test("jeton public — créé une fois, retrouvé, propre au document", async () => {
  const inv = await facture();
  const t1 = await storage.ensureInvoicePublicToken(inv.id);
  const t2 = await storage.ensureInvoicePublicToken(inv.id);
  assert.match(t1, /^[a-f0-9]{32}$/);
  assert.equal(t1, t2);
  assert.equal((await storage.getInvoiceByPublicToken(t1))?.id, inv.id);
  assert.equal(await storage.getInvoiceByPublicToken("0".repeat(32)), undefined);
});

test("règlement en ligne — facture payée une seule fois, journal de suivi", async () => {
  const inv = await facture();
  const session = { id: `cs_test_${inv.id}_${Date.now()}`, payment_status: "paid", amount_total: 12000, metadata: { kind: "invoice", invoiceId: String(inv.id) } };
  assert.equal(isInvoiceSession(session), true);
  assert.equal(isInvoiceSession({ metadata: { categoryId: "3" } }), false);
  assert.equal(await reglerFactureDepuisSession(user, session, Date.UTC(2026, 9, 18, 9)), "reglee");
  const apres = await storage.getInvoice(inv.id);
  assert.equal(apres?.status, "paid");
  assert.equal(apres?.paymentMethod, "card");
  assert.equal(apres?.paidAt, Date.UTC(2026, 9, 18, 9));
  assert.equal((apres as any)?.onlinePaymentSessionId, session.id);
  // Retour success_url puis rattrapage : une seule écriture.
  assert.equal(await reglerFactureDepuisSession(user, session), "deja_traitee");
  // La session d'une autre praticienne ne règle rien.
  assert.equal(await reglerFactureDepuisSession(autre, { ...session, id: `${session.id}_b` }), "invalide");
  // Session non payée : rien.
  assert.equal(await reglerFactureDepuisSession(user, { ...session, id: `${session.id}_c`, payment_status: "unpaid" }), "invalide");
  const suivi = await storage.listClientFollowups(client.id);
  assert.ok(suivi.some((f) => f.content.includes(`Facture ${inv.number} réglée en ligne`)));
});

test("expiration des devis envoyés, pas des devis acceptés", async () => {
  const hier = Date.now() - 2 * JOUR;
  const ouvert = await facture({ docType: "devis", status: "sent", dueDate: hier, number: `DEVIS-T-${Date.now()}-1` });
  const accepte = await facture({ docType: "devis", status: "accepted", dueDate: hier, number: `DEVIS-T-${Date.now()}-2` });
  const futur = await facture({ docType: "devis", status: "sent", dueDate: Date.now() + 5 * JOUR, number: `DEVIS-T-${Date.now()}-3` });
  await expireQuotes();
  assert.equal((await storage.getInvoice(ouvert.id))?.status, "expired");
  assert.equal((await storage.getInvoice(accepte.id))?.status, "accepted");
  assert.equal((await storage.getInvoice(futur.id))?.status, "sent");
});

test("message groupé — envoi à chaque destinataire, désinscription, compteurs", async () => {
  const now = Date.now();
  const u = await storage.updateUser(user.id, { resendApiKey: "re_test", emailFromAddress: "cabinet@exemple.fr" } as any);
  const zoe = await storage.createClient(user.id, { firstName: "Zoé", lastName: "Z", email: `zoe-${now}@example.invalid` } as any);
  const recipients = broadcastRecipients(await storage.listClients(user.id));
  assert.equal(recipients.length, 2);
  const b = await storage.createBroadcast({ userId: user.id, subject: "Fermeture", body: "Bonjour {prenom}", recipientCount: recipients.length });
  const envois: Array<{ to: string; text: string; headers: Record<string, string> }> = [];
  const res = await runBroadcast(b.id, u, recipients, { subject: "Fermeture", body: "Bonjour {prenom}" }, {
    send: async (_cfg, to, _s, _h, text, headers) => {
      envois.push({ to, text, headers });
      return to.startsWith("zoe") ? { ok: false, error: "refusé" } : { ok: true, id: "x" };
    },
    pause: async () => undefined,
  });
  assert.deepEqual(res, { sent: 1, failed: 1 });
  assert.equal(envois.length, 2);
  const lea = envois.find((e) => e.to === client.email)!;
  assert.match(lea.text, /^Bonjour Léa/);
  assert.match(lea.headers["List-Unsubscribe"], /\/api\/public\/unsubscribe\/[a-f0-9]{32}>$/);
  assert.equal(lea.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  const fin = (await storage.listBroadcasts(user.id))[0];
  assert.equal(fin.status, "sent");
  assert.equal(fin.sentCount, 1);
  assert.equal(fin.failedCount, 1);
  // Le jeton du lien retrouve la cliente.
  const token = lea.headers["List-Unsubscribe"].match(/([a-f0-9]{32})>$/)![1];
  assert.equal((await storage.getClientByOptOutToken(token))?.id, client.id);
  // Archivée ou désinscrite : plus destinataire.
  await storage.updateClient(zoe.id, { archivedAt: Date.now() } as any);
  await storage.updateClient(client.id, { emailOptOutAt: Date.now() } as any);
  assert.equal(broadcastRecipients(await storage.listClients(user.id)).length, 0);
});

test("suppression d'une cliente : son journal de suivi part avec elle", async () => {
  const c = await storage.createClient(user.id, { firstName: "Temp", lastName: "T", email: null } as any);
  await storage.createClientFollowup({ userId: user.id, clientId: c.id, kind: "appel", content: "Rappel", occurredAt: Date.now() });
  assert.equal((await storage.listClientFollowups(c.id)).length, 1);
  await storage.deleteClient(c.id);
  assert.equal((await storage.listClientFollowups(c.id)).length, 0);
});
