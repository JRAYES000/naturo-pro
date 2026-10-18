/**
 * Lot 3b — Brevo (numéros, expéditeur, SMS, appels API simulés, rappels SMS
 * idempotents) et import IA d'anciennes notes (validation de la réponse du modèle).
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import {
  normalizePhone, validSmsSender, toGsm, renderSmsReminder, pickNameAttributes, brevoSendSms, brevoAccount, BrevoError,
} from "./brevo";
import { buildNotesImportMessages, parseImportedConsultations } from "./notes-import";
import { sendSmsRemindersForUser, BREVO_PURPOSE } from "./routes/integrations";
import { sealToken } from "./einvoicing/token-crypto";
import { getLocalDayBounds } from "./routes/helpers/reminders";
import { storage } from "./storage";

test("numéros : format international sans « + » attendu par Brevo", () => {
  assert.equal(normalizePhone("06 12 34 56 78"), "33612345678");
  assert.equal(normalizePhone("06.12.34.56.78"), "33612345678");
  assert.equal(normalizePhone("+33 6 12 34 56 78"), "33612345678");
  assert.equal(normalizePhone("+33 (0)6 12 34 56 78"), "33612345678");
  assert.equal(normalizePhone("0033612345678"), "33612345678");
  assert.equal(normalizePhone("+32 470 12 34 56"), "32470123456");
  assert.equal(normalizePhone("12 34"), null);
  assert.equal(normalizePhone(""), null);
  assert.equal(normalizePhone(null), null);
});

test("expéditeur SMS : 3 à 11 caractères alphanumériques, au moins une lettre", () => {
  assert.equal(validSmsSender("Naturo"), true);
  assert.equal(validSmsSender("MarieNaturo"), true);
  assert.equal(validSmsSender("MarieNaturo1"), false, "12 caractères");
  assert.equal(validSmsSender("Marie D"), false, "espace");
  assert.equal(validSmsSender("Méline"), false, "accent");
  assert.equal(validSmsSender("123456"), false, "chiffres seuls");
});

test("SMS de rappel : sans accents, tient en un SMS avec le lien de gestion", () => {
  assert.equal(toGsm("Hélène « Sœur » — à bientôt"), 'Helene "Soeur" - a bientot');
  const sms = renderSmsReminder({
    practitionerName: "Marie Dupont", dateText: "mardi 21 octobre", timeText: "14h30",
    manageUrl: "https://app.ecole-naturo.fr/#/manage/0123456789abcdef0123456789abcdef",
  });
  assert.match(sms, /^Rappel : RDV avec Marie Dupont demain mardi 21 octobre a 14h30\. Pour deplacer ou annuler : https:/);
  assert.ok(sms.length <= 160, `${sms.length} caractères`);
  assert.doesNotMatch(sms, /[éèàù]/);
});

test("attributs de nom selon la langue du compte Brevo", () => {
  assert.deepEqual(pickNameAttributes(new Set(["PRENOM", "NOM", "SMS"])), { first: "PRENOM", last: "NOM" });
  assert.deepEqual(pickNameAttributes(new Set(["FIRSTNAME", "LASTNAME"])), { first: "FIRSTNAME", last: "LASTNAME" });
  assert.deepEqual(pickNameAttributes(new Set(["EMAIL"])), { first: null, last: null });
});

function fakeFetch(handler: (url: string, init: any) => { status: number; body?: unknown }) {
  const original = globalThis.fetch;
  const calls: Array<{ url: string; init: any }> = [];
  globalThis.fetch = (async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    const r = handler(String(url), init);
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status, headers: { "Content-Type": "application/json" } });
  }) as any;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

test("client Brevo : envoi SMS sur /transactionalSMS/send, crédits SMS, clé refusée", async () => {
  const f = fakeFetch((url) => (url.endsWith("/account")
    ? { status: 200, body: { email: "m@x.fr", companyName: "Cabinet", plan: [{ type: "free", credits: 300 }, { type: "sms", credits: 42 }] } }
    : { status: 201, body: { messageId: 1511882900100020 } }));
  try {
    const r = await brevoSendSms("cle", { sender: "Naturo", recipient: "33612345678", content: "Bonjour" });
    assert.equal(r.messageId, "1511882900100020");
    assert.equal(f.calls[0].url, "https://api.brevo.com/v3/transactionalSMS/send");
    assert.equal(f.calls[0].init.headers["api-key"], "cle");
    assert.deepEqual(JSON.parse(f.calls[0].init.body), { sender: "Naturo", recipient: "33612345678", content: "Bonjour", type: "transactional" });
    assert.deepEqual(await brevoAccount("cle"), { email: "m@x.fr", companyName: "Cabinet", smsCredits: 42 });
  } finally {
    f.restore();
  }
  const g = fakeFetch(() => ({ status: 401, body: { code: "unauthorized", message: "Key not found" } }));
  try {
    await assert.rejects(brevoAccount("mauvaise"), (e: any) => e instanceof BrevoError && e.status === 401 && /refusée/.test(e.message));
  } finally {
    g.restore();
  }
});

test("import IA : réponse validée (balises, dates impossibles, rubriques vides)", () => {
  const raw = "```json\n" + JSON.stringify({
    consultations: [
      { date: "2024-03-12", motif: "Fatigue", anamnese: "Dort mal", bilan: "", conseilsAlimentaires: "Moins de café", hygieneDeVie: "", suivi: "Revoir dans 1 mois", notesLibres: "" },
      { date: "2099-01-01", motif: "", anamnese: "", bilan: "Terrain acide", conseilsAlimentaires: "", hygieneDeVie: "", suivi: "", notesLibres: "" },
      { date: "2024-02-30x", motif: "", anamnese: "", bilan: "", conseilsAlimentaires: "", hygieneDeVie: "", suivi: "", notesLibres: "" },
      { date: null, motif: 42, notesLibres: "Divers" },
    ],
  }) + "\n```";
  const out = parseImportedConsultations(raw, "2026-10-19");
  assert.equal(out.length, 3, "l'entrée sans contenu est écartée");
  assert.equal(out[0].date, "2024-03-12");
  assert.equal(out[0].suivi, "Revoir dans 1 mois");
  assert.equal(out[1].date, null, "date dans le futur écartée");
  assert.equal(out[2].motif, "", "valeur non textuelle ignorée");
  assert.equal(out[2].notesLibres, "Divers");
  assert.deepEqual(parseImportedConsultations("pas du json", "2026-10-19"), []);
  const msgs = buildNotesImportMessages("Le 12/03/2024 : fatigue.", "Léa Martin", "2026-10-19");
  assert.match(msgs[0].content, /N'invente rien/);
  assert.match(msgs[0].content, /2026-10-19/);
  assert.match(msgs[1].content, /Léa Martin/);
});

let userId = 0;
after(async () => { if (userId) await storage.deleteUserCascade(userId); });

test("rappels SMS de la veille : envoyés une fois, uniquement aux RDV confirmés avec téléphone", async () => {
  const now = Date.now();
  const u = await storage.createUser({
    email: `sms-${now}@example.invalid`, passwordHash: "x", googleId: null, name: "Marie Test", slug: `sms-${now}`,
    bio: "", photoUrl: null, phone: null, specialties: "[]", address: null, city: null, createdAt: now, plan: "trial",
  } as any);
  userId = u.id;
  const user = await storage.updateUser(u.id, { brevoApiKey: sealToken("cle-brevo", BREVO_PURPOSE), brevoSmsSender: "Naturo", smsRemindersEnabled: true } as any);
  const { from } = getLocalDayBounds(1);
  const midi = from + 12 * 3600_000;
  await storage.createAppointment({ userId: u.id, startAt: midi, endAt: midi + 3600_000, status: "confirmed", clientPhone: "06 12 34 56 78" } as any);
  await storage.createAppointment({ userId: u.id, startAt: midi + 3600_000, endAt: midi + 7200_000, status: "pending", clientPhone: "0611111111" } as any);
  await storage.createAppointment({ userId: u.id, startAt: midi + 7200_000, endAt: midi + 3 * 3600_000, status: "confirmed", clientPhone: null } as any);
  const envois: any[] = [];
  const send = async (key: string, sms: any) => { envois.push({ key, ...sms }); return { messageId: "1" }; };
  assert.deepEqual(await sendSmsRemindersForUser(user, { send }), { sent: 1, skipped: 0, errors: 0 });
  assert.equal(envois[0].key, "cle-brevo");
  assert.equal(envois[0].recipient, "33612345678");
  assert.equal(envois[0].sender, "Naturo");
  assert.match(envois[0].content, /^Rappel : RDV avec Marie Test demain .+ a 12h00\. Pour deplacer ou annuler : https:\/\/.+\/#\/manage\/[a-f0-9]{32}$/);
  assert.deepEqual(await sendSmsRemindersForUser(user, { send }), { sent: 0, skipped: 0, errors: 0 }, "déjà envoyé");
  assert.deepEqual(await sendSmsRemindersForUser({ ...user, smsRemindersEnabled: false }, { send }), { sent: 0, skipped: 0, errors: 0 });
});
