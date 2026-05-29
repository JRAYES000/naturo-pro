// ─────────────────────────────────────────────────────────────────────────────
// server/ics.ts — Générateur de fichier iCalendar (RFC 5545)
// Phase 3.5-A — Confirmation email avec pièce jointe .ics
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Formate un timestamp ms epoch en date ICS UTC : YYYYMMDDTHHmmSSZ
 */
function toIcsDateTime(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return (
    `${d.getUTCFullYear()}` +
    `${pad(d.getUTCMonth() + 1)}` +
    `${pad(d.getUTCDate())}` +
    `T` +
    `${pad(d.getUTCHours())}` +
    `${pad(d.getUTCMinutes())}` +
    `${pad(d.getUTCSeconds())}` +
    `Z`
  );
}

/**
 * Échappe le texte pour les propriétés ICS selon RFC 5545 §3.3.11.
 * Remplace backslash, virgule, point-virgule, et retours à la ligne.
 */
function escapeIcsText(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Plie les lignes ICS à 75 octets maximum (RFC 5545 §3.1).
 * Les lignes de continuation commencent par un espace.
 */
function foldIcsLine(line: string): string {
  // RFC 5545: fold at 75 chars (not bytes, but we keep it simple for ASCII-dominant content)
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  chunks.push(line.slice(0, 75));
  let pos = 75;
  while (pos < line.length) {
    chunks.push(" " + line.slice(pos, pos + 74));
    pos += 74;
  }
  return chunks.join("\r\n");
}

export interface IcsOptions {
  uid: string;
  startMs: number;
  durationMin: number;
  summary: string;
  description: string;
  location?: string | null;
  organizerName: string;
  organizerEmail: string;
  attendeeName: string;
  attendeeEmail: string;
}

/**
 * Génère le contenu d'un fichier .ics pour un RDV donné.
 * Conforme RFC 5545, METHOD:REQUEST.
 */
export function buildIcsForAppointment(opts: IcsOptions): string {
  const now = toIcsDateTime(Date.now());
  const dtStart = toIcsDateTime(opts.startMs);
  const dtEnd = toIcsDateTime(opts.startMs + opts.durationMin * 60 * 1000);

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Naturo Pro//Booking//FR",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${escapeIcsText(opts.uid)}`,
    `DTSTAMP:${now}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeIcsText(opts.summary)}`,
    `DESCRIPTION:${escapeIcsText(opts.description)}`,
  ];

  if (opts.location) {
    lines.push(`LOCATION:${escapeIcsText(opts.location)}`);
  }

  lines.push(
    `ORGANIZER;CN=${escapeIcsText(opts.organizerName)}:mailto:${opts.organizerEmail}`,
    `ATTENDEE;CN=${escapeIcsText(opts.attendeeName)};RSVP=FALSE:mailto:${opts.attendeeEmail}`,
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  );

  // Fold long lines and join with CRLF (RFC 5545 §3.1)
  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}
