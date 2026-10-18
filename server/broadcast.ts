/**
 * server/broadcast.ts — message groupé à toutes les clientes (lot 2b, parité naturooo).
 *
 * Fermeture du cabinet, nouvel atelier, changement d'adresse : la praticienne écrit
 * une fois, chaque cliente reçoit son email personnalisé ({prenom}). Chaque envoi
 * porte un lien de désinscription (et l'en-tête List-Unsubscribe en un clic) :
 * une cliente désinscrite ne reçoit plus les messages groupés, mais toujours les
 * emails de ses rendez-vous. Fonctions pures, testées ; l'envoi est dans
 * routes/broadcasts.ts.
 */

export const BROADCAST_LIMITS = {
  /** Messages groupés par praticienne sur 24 h glissantes. */
  maxPerDay: 2,
  maxRecipients: 1000,
  subjectMax: 150,
  bodyMax: 10_000,
  /** Pause entre deux envois : Resend limite le débit par compte. */
  pauseMs: 600,
};

type ClientLike = {
  id: number;
  firstName: string;
  lastName: string;
  email?: string | null;
  archivedAt?: number | null;
  emailOptOutAt?: number | null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Clientes destinataires : email valide, ni archivée ni désinscrite, une fois par adresse. */
export function broadcastRecipients<T extends ClientLike>(clients: T[]): T[] {
  const vues = new Set<string>();
  const out: T[] = [];
  for (const c of clients) {
    const email = (c.email || "").trim().toLowerCase();
    if (!email || !EMAIL_RE.test(email) || c.archivedAt || c.emailOptOutAt || vues.has(email)) continue;
    vues.add(email);
    out.push(c);
  }
  return out;
}

/** Remplace {prenom} et {nom} (insensible à la casse, accents tolérés). */
export function personalize(text: string, c: { firstName?: string | null; lastName?: string | null }): string {
  return text
    .replace(/\{\s*pr[ée]nom\s*\}/gi, (c.firstName || "").trim())
    .replace(/\{\s*nom\s*\}/gi, (c.lastName || "").trim());
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Texte brut → HTML : paragraphes, retours à la ligne et liens cliquables. */
export function textToHtml(text: string): string {
  return text.replace(/\r\n/g, "\n").split(/\n{2,}/).map((para) => {
    const html = esc(para.trim())
      .replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, '<a href="$1">$1</a>')
      .replace(/\n/g, "<br>");
    return html ? `<p style="font-size:15px;line-height:1.6;margin:0 0 14px">${html}</p>` : "";
  }).join("");
}

export function renderBroadcastEmail(opts: {
  subject: string;
  body: string;
  client: { firstName?: string | null; lastName?: string | null };
  practitionerName: string;
  unsubscribeUrl: string;
}): { subject: string; html: string; text: string } {
  const subject = personalize(opts.subject, opts.client).trim();
  const body = personalize(opts.body, opts.client).trim();
  const pied = `Vous recevez ce message en tant que cliente de ${opts.practitionerName}.`;
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(subject)}</title></head>
<body style="margin:0;background:#f7faf9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
<div style="background:#fff;border-radius:12px;padding:28px 24px;border:1px solid #e3ece8">${textToHtml(body)}</div>
<p style="font-size:12px;color:#6b7a76;text-align:center;margin-top:20px">${esc(pied)}<br>
<a href="${esc(opts.unsubscribeUrl)}" style="color:#6b7a76">Ne plus recevoir ces messages</a></p>
</div></body></html>`;
  const text = `${body}\n\n--\n${pied}\nNe plus recevoir ces messages : ${opts.unsubscribeUrl}`;
  return { subject, html, text };
}

/** En-têtes de désinscription en un clic (RFC 8058), attendus par Gmail et Yahoo. */
export function unsubscribeHeaders(url: string): Record<string, string> {
  return { "List-Unsubscribe": `<${url}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
}

export function unsubscribeUrl(token: string, appUrl = process.env.APP_URL || "https://app.ecole-naturo.fr"): string {
  return `${appUrl}/api/public/unsubscribe/${token}`;
}
