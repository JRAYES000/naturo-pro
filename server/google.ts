// Google Calendar wrapper — full implementation with calendar event push/update/delete.
// Gracefully no-ops when credentials are missing.
import crypto from "crypto";
import { createRequire } from "node:module";
// Compat dual ESM/CJS : tsx (dev) utilise import.meta.url ; esbuild bundle en CJS
// où import.meta vaut {} → fallback sur __filename (natif CJS).
const require = createRequire(import.meta.url || __filename);

let google: any = null;
try { google = require("googleapis").google; } catch {}

const STATE_SECRET = process.env.SESSION_SECRET || "naturo-pro-dev-secret";

export type GoogleTokens = {
  access_token?: string | null;
  refresh_token?: string | null;
  scope?: string | null;
  token_type?: string | null;
  expiry_date?: number | null;
  id_token?: string | null;
};

export function isGoogleConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && google);
}

function defaultRedirectUri() {
  return process.env.GOOGLE_REDIRECT_URI || "http://localhost:5000/api/auth/google/callback";
}

export function getOAuth2Client(redirectUri?: string) {
  if (!isGoogleConfigured()) return null;
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri || defaultRedirectUri()
  );
}

// --- State signing (CSRF + carries userId across redirect) ---
export function signState(payload: Record<string, any>): string {
  const json = JSON.stringify({ ...payload, ts: Date.now() });
  const b64 = Buffer.from(json).toString("base64url");
  const sig = crypto.createHmac("sha256", STATE_SECRET).update(b64).digest("base64url");
  return `${b64}.${sig}`;
}

export function verifyState(state: string, maxAgeMs = 10 * 60 * 1000): Record<string, any> | null {
  if (!state || typeof state !== "string") return null;
  const [b64, sig] = state.split(".");
  if (!b64 || !sig) return null;
  const expected = crypto.createHmac("sha256", STATE_SECRET).update(b64).digest("base64url");
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(Buffer.from(b64, "base64url").toString("utf8"));
    if (typeof payload.ts !== "number" || Date.now() - payload.ts > maxAgeMs) return null;
    return payload;
  } catch {
    return null;
  }
}

// --- Auth URL with embedded state ---
export function getAuthUrl(state: string, scope: string[] = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/calendar.events",
]) {
  const oauth2 = getOAuth2Client();
  if (!oauth2) return null;
  return oauth2.generateAuthUrl({
    access_type: "offline",
    scope,
    prompt: "consent", // force refresh_token issuance every time
    state,
  });
}

// --- Token exchange ---
export async function getTokensFromCode(code: string): Promise<GoogleTokens | null> {
  const oauth2 = getOAuth2Client();
  if (!oauth2) return null;
  const { tokens } = await oauth2.getToken(code);
  return tokens as GoogleTokens;
}

// Decode (without verifying signature — Google issued it on our request) the id_token to extract email.
export function decodeIdTokenEmail(id_token?: string | null): string | null {
  if (!id_token) return null;
  const parts = id_token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return payload.email || null;
  } catch {
    return null;
  }
}

// --- Authenticated client from stored tokens, with auto-refresh hook ---
export function clientFromTokens(tokens: GoogleTokens, onRefresh?: (t: GoogleTokens) => void) {
  const oauth2 = getOAuth2Client();
  if (!oauth2) return null;
  oauth2.setCredentials(tokens);
  if (onRefresh) {
    oauth2.on("tokens", (newTokens: GoogleTokens) => {
      // Google returns refresh_token only on first consent; keep the old one if missing.
      const merged: GoogleTokens = {
        ...tokens,
        ...newTokens,
        refresh_token: newTokens.refresh_token || tokens.refresh_token,
      };
      onRefresh(merged);
    });
  }
  return oauth2;
}

// --- Calendar operations ---
// Description Naturo Pro markers — let us recognize our own events on import side
// and update them in place rather than duplicating.
export const NATURO_DESC_MARKER = "\n\n— Créé par Naturo Pro";

export type CalendarEventInput = {
  summary: string;
  description?: string;
  location?: string | null;
  startAt: number; // ms epoch
  endAt: number;   // ms epoch
  attendeeEmail?: string | null;
  timeZone?: string; // default Europe/Paris
};

function buildEventBody(ev: CalendarEventInput, addMeet = false) {
  const tz = ev.timeZone || "Europe/Paris";
  // Make sure every Naturo-created event carries the marker (idempotent)
  let description = ev.description || "";
  if (!description.includes(NATURO_DESC_MARKER)) description += NATURO_DESC_MARKER;
  const body: any = {
    summary: ev.summary,
    description,
    location: ev.location || undefined,
    start: { dateTime: new Date(ev.startAt).toISOString(), timeZone: tz },
    end: { dateTime: new Date(ev.endAt).toISOString(), timeZone: tz },
    attendees: ev.attendeeEmail ? [{ email: ev.attendeeEmail }] : undefined,
    reminders: { useDefault: true },
  };
  // Visio : demande à Google de générer automatiquement un lien Google Meet.
  // requestId stable (dérivé du créneau) → idempotent si l'appel est rejoué.
  if (addMeet) {
    body.conferenceData = {
      createRequest: {
        requestId: `naturo-meet-${ev.startAt}-${ev.endAt}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }
  return body;
}

/** Extrait l'URL Google Meet d'un événement renvoyé par l'API Calendar. */
function extractMeetLink(data: any): string | null {
  if (!data) return null;
  if (typeof data.hangoutLink === "string" && data.hangoutLink) return data.hangoutLink;
  const entry = data.conferenceData?.entryPoints?.find(
    (e: any) => e.entryPointType === "video" && e.uri,
  );
  return entry?.uri || null;
}

// --- Helper: format a rich event description from RDV data ---
export type RdvDescriptionData = {
  practitionerName?: string | null;
  categoryName?: string | null;
  durationMinutes?: number | null;
  priceCents?: number | null;
  paymentStatus?: string | null;       // unpaid | paid | partial
  paymentAmountCents?: number | null;
  clientFullName?: string | null;
  clientEmail?: string | null;
  clientPhone?: string | null;
  clientId?: number | null;
  appUrl?: string | null;              // base URL of the app, e.g. https://app.ecole-naturo.fr
  noteSummary?: string | null;
  notesBefore?: string | null;
  location?: string | null;
};

function formatPrice(cents?: number | null): string {
  if (!cents || cents <= 0) return "—";
  return (cents / 100).toFixed(2).replace(".", ",") + " €";
}

function formatPaymentStatus(status?: string | null, amountCents?: number | null): string {
  switch ((status || "unpaid").toLowerCase()) {
    case "paid":    return "Payé" + (amountCents ? ` (${formatPrice(amountCents)})` : "");
    case "partial": return "Partiel" + (amountCents ? ` (${formatPrice(amountCents)})` : "");
    default:        return "Non payé";
  }
}

export function formatRdvDescription(d: RdvDescriptionData): string {
  const lines: string[] = [];
  if (d.categoryName)   lines.push(`Prestation : ${d.categoryName}`);
  if (d.durationMinutes) lines.push(`Durée : ${d.durationMinutes} min`);
  if (d.priceCents)     lines.push(`Tarif : ${formatPrice(d.priceCents)}`);
  lines.push(`Paiement : ${formatPaymentStatus(d.paymentStatus, d.paymentAmountCents)}`);
  if (d.clientFullName) lines.push(`Client : ${d.clientFullName}`);
  if (d.clientEmail)    lines.push(`Email : ${d.clientEmail}`);
  if (d.clientPhone)    lines.push(`Téléphone : ${d.clientPhone}`);
  if (d.location)       lines.push(`Lieu : ${d.location}`);
  if (d.notesBefore)    lines.push(`\nNote pré-RDV : ${d.notesBefore}`);
  if (d.noteSummary)    lines.push(`\nNote de consultation : ${d.noteSummary}`);
  if (d.clientId && d.appUrl) {
    lines.push(`\nFiche cliente : ${d.appUrl.replace(/\/$/, "")}/#/app/clients/${d.clientId}`);
  }
  return lines.join("\n");
}

// --- Sanitize Google Calendar description (HTML/RTF/boilerplate -> clean text) ---
// Google Calendar accepts arbitrary HTML in event descriptions (Gmail/Outlook auto-create
// events with rich Word/Outlook HTML). We strip tags, decode entities, collapse whitespace,
// drop Google Calendar boilerplate, and cap length so notesBefore stays human-readable.
const GCAL_BOILERPLATE_PATTERNS: RegExp[] = [
  /To see detailed information for automatically created events[\s\S]*$/i,
  /Pour afficher des informations détaillées[\s\S]*$/i,
  /Para ver información detallada[\s\S]*$/i,
  /This event was created from an email[\s\S]*$/i,
  /Cet événement a été créé à partir d['’]un (?:e-?mail|message)[\s\S]*$/i,
];

export function sanitizeDescription(input: string | null | undefined): string | null {
  if (!input) return null;
  let s = String(input);

  // If it looks like HTML, strip it.
  const looksHtml = /<[a-z!\/][\s\S]*?>/i.test(s) || /&[a-z#0-9]+;/i.test(s);
  if (looksHtml) {
    // Remove style/script blocks entirely
    s = s.replace(/<(style|script)[\s\S]*?<\/\1>/gi, "");
    // Convert <br> and block-closing tags to newlines
    s = s.replace(/<br\s*\/?>/gi, "\n");
    s = s.replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n");
    s = s.replace(/<li[^>]*>/gi, "• ");
    // Convert <a href="URL">label</a> → "label (URL)" if URL adds info
    s = s.replace(
      /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
      (_m, href: string, label: string) => {
        const text = label.replace(/<[^>]+>/g, "").trim();
        if (!text) return href;
        if (text === href || text.includes(href) || href.includes(text)) return text;
        return `${text} (${href})`;
      },
    );
    // Drop all remaining tags (including unclosed/truncated ones from Google Calendar)
    s = s.replace(/<[^>]+>/g, "");
    // Defensive: strip any leftover '<tag…' fragments that lack a closing '>' (truncated HTML)
    s = s.replace(/<\/?[a-z][^<]*$/gi, "");
    // Decode the most common HTML entities
    s = s
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&hellip;/gi, "…")
      .replace(/&[a-z]+;/gi, " ")
      .replace(/&#(\d+);/g, (_m, n: string) => {
        const code = parseInt(n, 10);
        return Number.isFinite(code) ? String.fromCharCode(code) : "";
      });
  }

  // Drop Google Calendar boilerplate
  for (const re of GCAL_BOILERPLATE_PATTERNS) s = s.replace(re, "");

  // Strip the Naturo marker if it leaked in
  s = s.replace(/—\s*Créé par Naturo Pro\s*$/i, "");

  // Collapse whitespace: trim each line, drop empty repeats
  s = s
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l, i, arr) => l.length > 0 || (arr[i - 1] && arr[i - 1].length > 0))
    .join("\n")
    .trim();

  if (!s) return null;
  // Hard cap to keep notesBefore reasonable (DB column allows much more)
  if (s.length > 2000) s = s.slice(0, 2000) + "…";
  return s;
}

// --- List events in a window (used for inbound sync from Google) ---
export type GoogleEventLite = {
  id: string;
  summary: string;
  description?: string | null;
  location?: string | null;
  startAt: number; // ms epoch
  endAt: number;   // ms epoch
  attendees?: { email?: string | null; displayName?: string | null }[];
  status?: string | null; // confirmed | tentative | cancelled
  isAllDay: boolean;
  isCreatedByNaturo: boolean;
  updatedAtMs: number;
};

export async function listEventsFromCalendar(
  tokens: GoogleTokens,
  rangeStartMs: number,
  rangeEndMs: number,
  onRefresh?: (t: GoogleTokens) => void,
  maxResults = 250,
): Promise<GoogleEventLite[] | null> {
  if (!isGoogleConfigured()) return null;
  const auth = clientFromTokens(tokens, onRefresh);
  if (!auth) return null;
  const calendar = google.calendar({ version: "v3", auth });
  const out: GoogleEventLite[] = [];
  let pageToken: string | undefined = undefined;
  try {
    do {
      const res: any = await calendar.events.list({
        calendarId: "primary",
        timeMin: new Date(rangeStartMs).toISOString(),
        timeMax: new Date(rangeEndMs).toISOString(),
        singleEvents: true,
        orderBy: "startTime",
        maxResults: Math.min(250, maxResults - out.length),
        showDeleted: false,
        pageToken,
      });
      for (const e of res.data?.items || []) {
        if (!e.id) continue;
        const isAllDay = !!(e.start?.date && !e.start?.dateTime);
        const startStr = e.start?.dateTime || e.start?.date;
        const endStr = e.end?.dateTime || e.end?.date;
        if (!startStr || !endStr) continue;
        out.push({
          id: e.id,
          summary: e.summary || "(sans titre)",
          description: sanitizeDescription(e.description),
          location: e.location || null,
          startAt: new Date(startStr).getTime(),
          endAt: new Date(endStr).getTime(),
          attendees: (e.attendees || []).map((a: any) => ({
            email: a.email || null,
            displayName: a.displayName || null,
          })),
          status: e.status || null,
          isAllDay,
          isCreatedByNaturo: !!(e.description && e.description.includes(NATURO_DESC_MARKER)),
          updatedAtMs: e.updated ? new Date(e.updated).getTime() : Date.now(),
        });
        if (out.length >= maxResults) break;
      }
      pageToken = res.data?.nextPageToken;
    } while (pageToken && out.length < maxResults);
  } catch (e: any) {
    console.error("[google] list events failed:", e?.message || e);
    return null;
  }
  return out;
}

export type PushEventResult = { eventId: string | null; meetLink: string | null };

export async function pushEventToCalendar(
  tokens: GoogleTokens,
  ev: CalendarEventInput,
  onRefresh?: (t: GoogleTokens) => void,
  addMeet = false,
): Promise<PushEventResult> {
  if (!isGoogleConfigured()) return { eventId: null, meetLink: null };
  const auth = clientFromTokens(tokens, onRefresh);
  if (!auth) return { eventId: null, meetLink: null };
  const calendar = google.calendar({ version: "v3", auth });
  try {
    const res = await calendar.events.insert({
      calendarId: "primary",
      conferenceDataVersion: addMeet ? 1 : 0,
      requestBody: buildEventBody(ev, addMeet),
    });
    return { eventId: res.data?.id || null, meetLink: extractMeetLink(res.data) };
  } catch (e: any) {
    console.error("[google] insert event failed:", e?.message || e);
    return { eventId: null, meetLink: null };
  }
}

export type UpdateEventResult = { ok: boolean; meetLink: string | null };

export async function updateEventInCalendar(
  tokens: GoogleTokens,
  eventId: string,
  ev: CalendarEventInput,
  onRefresh?: (t: GoogleTokens) => void,
  addMeet = false,
): Promise<UpdateEventResult> {
  if (!isGoogleConfigured()) return { ok: false, meetLink: null };
  const auth = clientFromTokens(tokens, onRefresh);
  if (!auth) return { ok: false, meetLink: null };
  const calendar = google.calendar({ version: "v3", auth });
  try {
    // Sans conferenceDataVersion=1, un éventuel lien Meet déjà présent est préservé
    // (Google ignore conferenceData dans la requête). On ne met 1 que pour EN AJOUTER un.
    const res = await calendar.events.update({
      calendarId: "primary",
      eventId,
      conferenceDataVersion: addMeet ? 1 : 0,
      requestBody: buildEventBody(ev, addMeet),
    });
    return { ok: true, meetLink: extractMeetLink(res.data) };
  } catch (e: any) {
    console.error("[google] update event failed:", e?.message || e);
    return { ok: false, meetLink: null };
  }
}

export async function deleteEventFromCalendar(
  tokens: GoogleTokens,
  eventId: string,
  onRefresh?: (t: GoogleTokens) => void
): Promise<boolean> {
  if (!isGoogleConfigured()) return false;
  const auth = clientFromTokens(tokens, onRefresh);
  if (!auth) return false;
  const calendar = google.calendar({ version: "v3", auth });
  try {
    await calendar.events.delete({ calendarId: "primary", eventId });
    return true;
  } catch (e: any) {
    // 404/410 means already gone — treat as success
    const code = e?.response?.status || e?.code;
    if (code === 404 || code === 410) return true;
    console.error("[google] delete event failed:", e?.message || e);
    return false;
  }
}
