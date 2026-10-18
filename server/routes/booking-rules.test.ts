/**
 * Règles de réservation en ligne (parité naturooo) : indisponibilités par plage
 * horaire et récurrentes, délai minimum, horizon, emails de décision et
 * expiration des demandes non validées sous 48 h.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { computeSlotsByDay, isSlotBlocked, bookingRules } from "./public";
import { renderBookingDecisionEmail } from "./helpers/email-sending";
import { expirePendingBookings, PENDING_BOOKING_TTL_MS } from "./cron";
import { zonedTimeToUtc, zonedDateKey } from "../timezone";
import { storage } from "../storage";

const MERCREDI = { dayOfWeek: 3, startTime: "09:00", endTime: "12:00" };
function mercrediDans(jours: number) {
  const d = new Date(Date.now() + jours * 86400000);
  while (d.getUTCDay() !== 3) d.setUTCDate(d.getUTCDate() + 1);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
}
const heure = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

test("isSlotBlocked — journée entière, plage horaire, jours de la semaine", () => {
  const journee = [{ startDate: "2026-11-02", endDate: "2026-11-06" }];
  assert.equal(isSlotBlocked("2026-11-04", 3, 600, 660, journee), true);
  assert.equal(isSlotBlocked("2026-11-07", 6, 600, 660, journee), false);

  const apresMidi = [{ startDate: "2026-11-01", endDate: "2026-12-31", startTime: "14:00", endTime: "18:00", weekdays: "3" }];
  assert.equal(isSlotBlocked("2026-11-04", 3, 14 * 60, 15 * 60, apresMidi), true, "mercredi 14 h bloqué");
  assert.equal(isSlotBlocked("2026-11-04", 3, 13 * 60, 14 * 60, apresMidi), false, "fin à 14 h : pas de chevauchement");
  assert.equal(isSlotBlocked("2026-11-04", 3, 13 * 60 + 30, 14 * 60 + 30, apresMidi), true, "chevauchement partiel");
  assert.equal(isSlotBlocked("2026-11-05", 4, 15 * 60, 16 * 60, apresMidi), false, "jeudi libre");
});

test("computeSlotsByDay — plage récurrente bloquée, délai minimum et horizon", () => {
  const { y, m, d } = mercrediDans(10);
  const debut = zonedTimeToUtc(y, m, d, 9, 0);
  const key = zonedDateKey(debut);
  const blocked = [{ startDate: key, endDate: key, startTime: "10:00", endTime: "11:00", weekdays: "3" }];
  const slots = computeSlotsByDay({ avail: [MERCREDI], busy: [], from: debut, to: debut, durationMin: 60, blocked });
  assert.deepEqual((slots[key] || []).map(heure), ["09:00", "11:00"]);

  // Délai minimum de 30 jours : le mercredi à J+10 n'est plus réservable.
  const tropTot = computeSlotsByDay({ avail: [MERCREDI], busy: [], from: debut, to: debut, durationMin: 60, minNoticeMs: 30 * 86400000 });
  assert.deepEqual(tropTot[key] ?? [], []);
  // Horizon de 5 jours : J+10 est trop loin.
  const tropLoin = computeSlotsByDay({ avail: [MERCREDI], busy: [], from: debut, to: debut, durationMin: 60, maxAheadMs: 5 * 86400000 });
  assert.deepEqual(tropLoin[key] ?? [], []);
});

test("bookingRules — valeurs par défaut identiques au comportement historique", () => {
  const r = bookingRules({});
  assert.equal(r.minNoticeMs, 2 * 3600000);
  assert.equal(r.maxAheadMs, null);
  assert.equal(r.cancelNoticeMs, 0);
  assert.equal(r.requiresApproval, false);
  assert.equal(r.newClientsAllowed, true);
  const custom = bookingRules({ bookingMinNoticeHours: 0, bookingMaxDaysAhead: 30, bookingCancelNoticeHours: 24, bookingRequiresApproval: true, bookingNewClientsAllowed: false });
  assert.equal(custom.minNoticeMs, 0);
  assert.equal(custom.maxAheadMs, 30 * 86400000);
  assert.equal(custom.cancelNoticeMs, 24 * 3600000);
  assert.equal(custom.requiresApproval, true);
  assert.equal(custom.newClientsAllowed, false);
});

test("emails de décision — demande reçue, refusée avec message, expirée", () => {
  const base = { firstName: "Léa", practitionerName: "Marie Dupont", rdvDateText: "mercredi 4 novembre à 10:00", categoryName: "Bilan", bookingUrl: "https://app.exemple.fr/p/marie" };
  const p = renderBookingDecisionEmail({ ...base, kind: "pending" });
  assert.match(p.subject, /reçue/);
  assert.match(p.text, /dès son acceptation/);
  const r = renderBookingDecisionEmail({ ...base, kind: "refused", message: "Je vous propose <jeudi>" });
  assert.match(r.text, /Je vous propose <jeudi>/);
  assert.match(r.html, /&lt;jeudi&gt;/);
  assert.match(r.text, /autre créneau : https:\/\/app\.exemple\.fr\/p\/marie/);
  const e = renderBookingDecisionEmail({ ...base, kind: "expired" });
  assert.match(e.subject, /expirée/);
});

let userId: number;
before(async () => {
  const now = Date.now();
  const u = await storage.createUser({
    email: `regles-${now}@example.invalid`, passwordHash: "x", googleId: null,
    name: "Règles Test", slug: `regles-${now}`, bio: "", photoUrl: null, phone: null,
    specialties: "[]", address: null, city: null, createdAt: now, plan: "trial",
  } as any);
  userId = u.id;
});
after(async () => {
  if (userId) await storage.deleteUserCascade(userId);
});

test("expirePendingBookings — sans réponse sous 48 h, ou créneau passé : la demande expire", async () => {
  const start = Date.now() + 7 * 86400000;
  const demande = await storage.createAppointment({ userId, startAt: start, endAt: start + 3600000, status: "pending", clientFirstName: "A" } as any);
  // À l'horloge réelle : créée à l'instant, créneau dans 7 jours → reste en attente.
  await expirePendingBookings(Date.now());
  assert.equal((await storage.getAppointment(demande.id))?.status, "pending");
  // 48 h plus tard (horloge simulée) : expirée.
  await expirePendingBookings(demande.createdAt + PENDING_BOOKING_TTL_MS + 1000);
  assert.equal((await storage.getAppointment(demande.id))?.status, "cancelled");
  // Créneau déjà passé : expirée sans attendre 48 h.
  const passee = await storage.createAppointment({ userId, startAt: Date.now() - 3600000, endAt: Date.now(), status: "pending", clientFirstName: "B" } as any);
  await expirePendingBookings(Date.now());
  assert.equal((await storage.getAppointment(passee.id))?.status, "cancelled");
});
