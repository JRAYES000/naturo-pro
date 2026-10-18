/**
 * Lot 3a — espace cliente : programme par étapes, observance, bilans notés, lien
 * de connexion à usage unique, rendez-vous retrouvés par l'adresse email.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import {
  programStages, currentStage, adherenceStats, addDays, daysBetween, parseScoring, scoreAnswers,
  newPortalToken, hashPortalToken, PORTAL_LINK_TTL_MS,
} from "./portal";
import { renderPortalLinkEmail } from "./routes/portal";
import { storage } from "./storage";

test("dates civiles : ajout de jours et écart, passage de mois et d'année", () => {
  assert.equal(addDays("2026-10-30", 3), "2026-11-02");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(daysBetween("2026-10-01", "2026-10-31"), 30);
});

test("programme par étapes : bornes des sections datées, étape du jour", () => {
  const content = [
    { section: "Détox douce", items: ["Eau citronnée"], durationDays: 7 },
    { section: "Conseils permanents", items: ["Marche"] },
    { section: "Reminéralisation", items: ["Légumes verts"], durationDays: 14 },
  ];
  const stages = programStages(content, "2026-10-01");
  assert.deepEqual(stages.map((s) => [s.start, s.end]), [["2026-10-01", "2026-10-07"], [null, null], ["2026-10-08", "2026-10-21"]]);
  assert.equal(currentStage(stages, "2026-10-05")?.section, "Détox douce");
  assert.equal(currentStage(stages, "2026-10-08")?.section, "Reminéralisation");
  assert.equal(currentStage(stages, "2026-10-22"), null, "programme terminé");
  assert.equal(currentStage(stages, "2026-09-30"), null, "pas encore commencé");
  assert.deepEqual(programStages(content, null).map((s) => s.start), [null, null, null], "sans date de début : non daté");
});

test("observance : taux sur la fenêtre, énergie moyenne, série de jours suivis", () => {
  const checkins = [
    { day: "2026-10-19", adherence: 2, energy: 4 },
    { day: "2026-10-18", adherence: 2, energy: 3 },
    { day: "2026-10-17", adherence: 1, energy: null },
    { day: "2026-10-16", adherence: 0, energy: 2 },
    { day: "2026-09-01", adherence: 0, energy: 1 },
  ];
  const s = adherenceStats(checkins, "2026-10-19");
  assert.equal(s.checkinDays, 4, "le relevé de septembre sort de la fenêtre de 14 jours");
  assert.equal(s.rate, 63, "(1 + 1 + 0,5 + 0) / 4");
  assert.equal(s.energyAvg, 3);
  assert.equal(s.streak, 2);
  assert.equal(adherenceStats([], "2026-10-19").rate, null);
  assert.equal(adherenceStats([{ day: "2026-10-18", adherence: 2 }], "2026-10-19").streak, 1, "série valable jusqu'à hier");
});

test("bilan noté : score 0-100, échelle inversée, paliers", () => {
  const scoring = parseScoring(JSON.stringify({ higherIsBetter: true, bands: [{ upTo: 100, label: "Bonne vitalité" }, { upTo: 39, label: "Fatigue marquée" }, { upTo: 69, label: "Vitalité moyenne" }] }))!;
  assert.deepEqual(scoring.bands.map((b) => b.upTo), [39, 69, 100], "paliers triés");
  const questions = [
    { id: "q1", type: "scale" }, { id: "q2", type: "scale", reverse: true }, { id: "q3", type: "text" },
  ];
  assert.deepEqual(scoreAnswers(questions, { q1: 10, q2: 1, q3: "x" }, scoring), { score: 100, label: "Bonne vitalité" });
  assert.deepEqual(scoreAnswers(questions, { q1: 1, q2: 10 }, scoring), { score: 0, label: "Fatigue marquée" });
  assert.deepEqual(scoreAnswers(questions, { q1: 6, q2: 6 }, scoring), { score: 50, label: "Vitalité moyenne" });
  assert.equal(scoreAnswers(questions, { q3: "texte" }, scoring), null, "aucune échelle répondue");
  assert.equal(parseScoring("pas du json"), null);
  assert.equal(parseScoring(null), null);
});

test("email du lien de connexion : invitation et lien demandé", () => {
  const inv = renderPortalLinkEmail({ firstName: "Léa", practitionerName: "Marie <Dupont>", url: "https://app/x", invite: true, validity: "7 jours" });
  assert.match(inv.subject, /vous ouvre votre espace/);
  assert.match(inv.html, /Marie &lt;Dupont&gt;/);
  assert.match(inv.text, /valable 7 jours/);
  const lien = renderPortalLinkEmail({ practitionerName: "Marie", url: "https://app/x", invite: false, validity: "30 minutes" });
  assert.match(lien.subject, /lien de connexion/);
  assert.match(lien.text, /Ouvrir mon espace : https:\/\/app\/x/);
});

let userId = 0;
after(async () => { if (userId) await storage.deleteUserCascade(userId); });

test("lien de connexion : usage unique, expiration ; rendez-vous retrouvés par l'email", async () => {
  const now = Date.now();
  const u = await storage.createUser({
    email: `portail-${now}@example.invalid`, passwordHash: "x", googleId: null, name: "Portail Test", slug: `portail-${now}`,
    bio: "", photoUrl: null, phone: null, specialties: "[]", address: null, city: null, createdAt: now, plan: "trial",
  } as any);
  userId = u.id;
  const c = await storage.createClient(u.id, { firstName: "Léa", lastName: "M", email: `lea-${now}@example.invalid` } as any);

  const token = newPortalToken();
  assert.match(token, /^[a-f0-9]{64}$/);
  await storage.createPortalToken({ userId: u.id, clientId: c.id, tokenHash: hashPortalToken(token), kind: "link", expiresAt: now + PORTAL_LINK_TTL_MS });
  const premier = await storage.consumePortalLink(hashPortalToken(token));
  assert.equal(premier?.clientId, c.id);
  assert.equal(await storage.consumePortalLink(hashPortalToken(token)), null, "second clic refusé");

  const expire = newPortalToken();
  await storage.createPortalToken({ userId: u.id, clientId: c.id, tokenHash: hashPortalToken(expire), kind: "link", expiresAt: now - 1 });
  assert.equal(await storage.consumePortalLink(hashPortalToken(expire)), null, "lien expiré refusé");

  const session = newPortalToken();
  await storage.createPortalToken({ userId: u.id, clientId: c.id, tokenHash: hashPortalToken(session), kind: "session", expiresAt: now + 1000 });
  assert.equal(await storage.consumePortalLink(hashPortalToken(session)), null, "une session n'est pas un lien");

  // Réservé en ligne sans fiche liée, avec la même adresse (casse différente).
  await storage.createAppointment({ userId: u.id, clientId: null, startAt: now + 86400000, endAt: now + 90000000, status: "confirmed", clientEmail: c.email!.toUpperCase() } as any);
  await storage.createAppointment({ userId: u.id, clientId: c.id, startAt: now + 2 * 86400000, endAt: now + 2 * 86400000 + 3600000, status: "confirmed" } as any);
  await storage.createAppointment({ userId: u.id, clientId: null, startAt: now + 3 * 86400000, endAt: now + 3 * 86400000 + 3600000, status: "confirmed", clientEmail: "autre@example.invalid" } as any);
  assert.equal((await storage.listAppointmentsForPortal(u.id, c.id, c.email)).length, 2);

  // Observance : un relevé par jour, le second remplace le premier.
  const p = await storage.createProgram({ userId: u.id, clientId: c.id, title: "Programme", content: "[]", status: "sent" } as any);
  await storage.upsertProgramCheckin({ userId: u.id, programId: p.id, clientId: c.id, day: "2026-10-19", adherence: 1, energy: 3, note: null });
  await storage.upsertProgramCheckin({ userId: u.id, programId: p.id, clientId: c.id, day: "2026-10-19", adherence: 2, energy: 4, note: "Bien" });
  const rel = await storage.listProgramCheckins(p.id);
  assert.equal(rel.length, 1);
  assert.equal(rel[0].adherence, 2);
  await storage.deleteProgram(p.id);
  assert.equal((await storage.listProgramCheckins(p.id)).length, 0, "relevés supprimés avec le programme");
});
