/**
 * server/routes/helpers/google-sync.ts
 *
 * Synchronisation Google Calendar (push local→Google, import Google→local).
 * Extrait de server/routes.ts (Phase 4.0 — split par domaine). Comportement identique.
 */

import { storage } from "../../storage";
import {
  isGoogleConfigured,
  pushEventToCalendar, updateEventInCalendar, deleteEventFromCalendar,
  listEventsFromCalendar, formatRdvDescription,
  type GoogleTokens, type CalendarEventInput, type GoogleEventLite,
} from "../../google";

// ---------- Internal helper: sync an appointment to Google Calendar ----------
// Skip syncing RDV that originate from Google to avoid loops.
export async function syncApptToGoogle(
  op: "create" | "update" | "delete",
  userId: number,
  appt: any,
): Promise<string | null | undefined> {
  if (!isGoogleConfigured()) return undefined;
  if (appt?.source === "google") return undefined; // imported events are read-only locally
  const u = await storage.getUserById(userId);
  if (!u?.googleCalendarToken) return undefined;
  let tokens: GoogleTokens;
  try { tokens = JSON.parse(u.googleCalendarToken); } catch { return undefined; }

  const onRefresh = (newTokens: GoogleTokens) => {
    storage.updateUser(userId, { googleCalendarToken: JSON.stringify(newTokens) }).catch(() => {});
  };

  // Fetch enriched data: category, client, last note
  let category: any = null;
  let client: any = null;
  let note: any = null;
  if (appt.categoryId) {
    try { category = await storage.getCategory(appt.categoryId); } catch {}
  }
  if (appt.clientId) {
    try { client = await storage.getClient(appt.clientId); } catch {}
  }
  try { note = await storage.getNoteByAppointment(appt.id); } catch {}

  const noteSummary = note
    ? [note.motif, note.bilan, note.suivi].filter((s: any) => !!s).join(" • ").slice(0, 500)
    : null;

  const fullName = client
    ? `${client.firstName || ""} ${client.lastName || ""}`.trim()
    : `${appt.clientFirstName || ""} ${appt.clientLastName || ""}`.trim();

  const description = formatRdvDescription({
    practitionerName: u.name,
    categoryName: category?.name || null,
    durationMinutes: category?.durationMinutes || (appt.endAt && appt.startAt ? Math.round((appt.endAt - appt.startAt) / 60000) : null),
    priceCents: category?.priceCents || 0,
    paymentStatus: appt.paymentStatus || "unpaid",
    paymentAmountCents: appt.paymentAmountCents || 0,
    clientFullName: fullName || null,
    clientEmail: client?.email || appt.clientEmail || null,
    clientPhone: client?.phone || appt.clientPhone || null,
    clientId: client?.id || appt.clientId || null,
    appUrl: process.env.APP_URL || "https://app.ecole-naturo.fr",
    noteSummary,
    notesBefore: appt.notesBefore || null,
    location: appt.location || null,
  });

  const summary = fullName
    ? `RDV ${category?.name ? `— ${category.name} — ` : "— "}${fullName}`
    : (category?.name ? `RDV — ${category.name}` : "Rendez-vous");

  const ev: CalendarEventInput = {
    summary,
    description,
    location: appt.location,
    startAt: appt.startAt,
    endAt: appt.endAt,
    attendeeEmail: client?.email || appt.clientEmail || null,
    timeZone: "Europe/Paris",
  };

  // Visio → on demande à Google un lien Meet, sauf si le RDV en a déjà un.
  const isVisio =
    (appt.location || "").toLowerCase() === "visio" ||
    (category?.location || "").toLowerCase() === "visio";
  const addMeet = isVisio && !appt.googleMeetLink;

  // Persiste le lien Meet renvoyé par Google sur le RDV (best effort).
  const persistMeet = async (meetLink: string | null) => {
    if (meetLink && !appt.googleMeetLink) {
      try { await storage.updateAppointment(appt.id, { googleMeetLink: meetLink } as any); } catch {}
    }
  };

  try {
    if (op === "create") {
      const { eventId, meetLink } = await pushEventToCalendar(tokens, ev, onRefresh, addMeet);
      await persistMeet(meetLink);
      return eventId;
    } else if (op === "update" && appt.googleEventId) {
      const { meetLink } = await updateEventInCalendar(tokens, appt.googleEventId, ev, onRefresh, addMeet);
      await persistMeet(meetLink);
      return appt.googleEventId;
    } else if (op === "update" && !appt.googleEventId) {
      const { eventId, meetLink } = await pushEventToCalendar(tokens, ev, onRefresh, addMeet);
      await persistMeet(meetLink);
      return eventId;
    } else if (op === "delete" && appt.googleEventId) {
      await deleteEventFromCalendar(tokens, appt.googleEventId, onRefresh);
      return null;
    }
  } catch (e: any) {
    console.error("[google] syncApptToGoogle failed:", e?.message || e);
  }
  return undefined;
}

// ---------- Internal helper: import events FROM Google Calendar ----------
// Reconciles the user's Google Calendar with local appointments in a 6-month window.
// - Creates local RDV from new Google events (auto-create client if invitee email matches, otherwise blocked RDV without client)
// - Updates local RDV when Google event changed
// - Soft-deletes local Google-sourced RDV when Google event was removed
// - Does NOT touch RDV created in Naturo Pro (source !== 'google') except when Naturo originally pushed them — those are matched via googleEventId.
export async function importFromGoogleForUser(userId: number): Promise<{
  created: number; updated: number; deleted: number; skipped: number; total: number;
}> {
  const stats = { created: 0, updated: 0, deleted: 0, skipped: 0, total: 0 };
  const u = await storage.getUserById(userId);
  if (!u?.googleCalendarToken) return stats;
  let tokens: GoogleTokens;
  try { tokens = JSON.parse(u.googleCalendarToken); } catch { return stats; }

  const onRefresh = (newTokens: GoogleTokens) => {
    storage.updateUser(userId, { googleCalendarToken: JSON.stringify(newTokens) }).catch(() => {});
  };

  const now = Date.now();
  const THREE_MONTHS = 90 * 24 * 60 * 60 * 1000;
  const rangeStart = now - THREE_MONTHS;
  const rangeEnd = now + THREE_MONTHS;

  const events: GoogleEventLite[] | null = await listEventsFromCalendar(tokens, rangeStart, rangeEnd, onRefresh, 250);
  if (!events) return stats;
  stats.total = events.length;

  // Build set of remote event ids for delete-detection
  const remoteIds = new Set(events.map(e => e.id));

  for (const ev of events) {
    const existing = await storage.getAppointmentByGoogleEventId(userId, ev.id);
    if (existing) {
      // It already exists locally. Update only if Google is the source of truth (RDV de source 'google').
      if (existing.source === "google") {
        const patch: any = {
          startAt: ev.startAt,
          endAt: ev.endAt,
          location: ev.location || existing.location,
          // For Google-sourced RDV, Google is the source of truth: always overwrite
          // notesBefore (including with null) so cleanup of bad legacy descriptions propagates.
          notesBefore: ev.isCreatedByNaturo
            ? existing.notesBefore
            : (ev.description ? ev.description.slice(0, 4000) : null),
          status: ev.status === "cancelled" ? "cancelled" : (existing.status === "blocked" ? "blocked" : "confirmed"),
        };
        // Update title only if it changed and was not Naturo-created
        if (!ev.isCreatedByNaturo) {
          // Try to extract a human title; for blocked events we keep clientFirstName/Last as is.
        }
        await storage.updateAppointment(existing.id, patch);
        stats.updated++;
      } else {
        // Naturo-originated, just leave it (we own the source-of-truth here)
        stats.skipped++;
      }
      continue;
    }

    // No local match → import this Google event as a new local RDV.
    // Skip events Naturo created itself (just to be safe on first sync if marker present and event is a duplicate of an upcoming RDV without googleEventId)
    if (ev.isCreatedByNaturo) { stats.skipped++; continue; }

    // Try to match an attendee email → client
    let clientId: number | null = null;
    let clientFirst: string | null = null;
    let clientLast: string | null = null;
    let clientEmail: string | null = null;
    const attendees = ev.attendees || [];
    const guestEmail = attendees.find(a => a.email && a.email.toLowerCase() !== (u.googleCalendarEmail || "").toLowerCase())?.email || null;

    if (guestEmail) {
      const existingClient = await storage.findClientByEmail(userId, guestEmail);
      if (existingClient) {
        clientId = existingClient.id;
        clientFirst = existingClient.firstName;
        clientLast = existingClient.lastName;
        clientEmail = existingClient.email;
      } else {
        // auto-create client from invitee
        const displayName = attendees.find(a => a.email === guestEmail)?.displayName || guestEmail;
        const parts = displayName.split(/\s+/);
        const firstName = parts[0] || "Invité";
        const lastName = parts.slice(1).join(" ") || "Google";
        const created = await storage.createClient(userId, {
          firstName, lastName,
          email: guestEmail.toLowerCase(),
          phone: null, dateOfBirth: null, address: null,
          allergies: null, antecedents: null, lifestyleNotes: null,
          penseBete: "Créé automatiquement depuis Google Calendar",
        } as any);
        clientId = created.id;
        clientFirst = firstName;
        clientLast = lastName;
        clientEmail = guestEmail;
      }
    } else {
      // No invitee → RDV bloquant (vacances/perso). Use the event title as label.
      clientFirst = ev.summary.slice(0, 80);
      clientLast = "";
    }

    const status = clientId
      ? (ev.status === "cancelled" ? "cancelled" : "confirmed")
      : "blocked";

    try {
      await storage.createAppointment({
        userId,
        clientId,
        categoryId: null,
        startAt: ev.startAt,
        endAt: ev.endAt,
        status,
        clientFirstName: clientFirst,
        clientLastName: clientLast,
        clientEmail,
        clientPhone: null,
        notesBefore: ev.description ? ev.description.slice(0, 4000) : null,
        location: ev.location,
        googleEventId: ev.id,
        reminderSent: false,
        paymentStatus: "unpaid",
        paymentAmountCents: 0,
        source: "google",
      } as any);
      stats.created++;
    } catch (e: any) {
      console.error("[google] import create RDV failed:", e?.message || e);
    }
  }

  // Delete local Google-sourced RDV that no longer exist remotely (only within window)
  try {
    const localGoogleAppts = await storage.listAppointmentsWithGoogleEventId(userId, rangeStart, rangeEnd);
    for (const a of localGoogleAppts) {
      if (!a.googleEventId) continue;
      if (a.source !== "google") continue; // never delete Naturo-originated RDV
      if (!remoteIds.has(a.googleEventId)) {
        await storage.deleteAppointment(a.id);
        stats.deleted++;
      }
    }
  } catch (e: any) {
    console.error("[google] delete reconciliation failed:", e?.message || e);
  }

  return stats;
}
