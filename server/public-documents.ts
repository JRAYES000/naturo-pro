/**
 * server/public-documents.ts — page publique d'un devis ou d'une facture (lot 2b).
 *
 * Un document porte un jeton (invoices.public_token). Le lien envoyé à la cliente
 * ouvre une page où elle consulte le document, télécharge le PDF et :
 *   - accepte un devis (nom saisi + case « bon pour accord ») ou le refuse ;
 *   - règle une facture par carte (Stripe Checkout, clé de la praticienne).
 * Rendu HTML côté serveur (même style que htmlFeedbackPage), fonctions pures testées.
 */
import { formatPriceCents } from "./invoices";
import { zonedDateKey } from "./timezone";

type DocLike = {
  docType?: string | null;
  status: string;
  number: string;
  issueDate: number;
  dueDate?: number | null;
  paidAt?: number | null;
  totalCents: number;
  subtotalCents: number;
  vatCents: number;
  vatEnabled?: boolean | null;
  clientFirstName?: string | null;
  clientLastName?: string | null;
  clientCompanyName?: string | null;
  quoteDecidedAt?: number | null;
  quoteSignerName?: string | null;
};
type ItemLike = { description: string; quantity: number; unitPriceCents: number; totalCents: number };

export type QuoteState = "open" | "accepted" | "refused" | "expired" | "cancelled";

function esc(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const dateFr = (ms: number | null | undefined) =>
  ms ? new Date(ms).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Paris" }) : "";

/** Un devis est valable jusqu'au jour inclus de sa date de validité (heure de Paris). */
export function quoteIsExpired(doc: Pick<DocLike, "dueDate">, now = Date.now()): boolean {
  return !!doc.dueDate && zonedDateKey(now) > zonedDateKey(doc.dueDate);
}

export function quoteState(doc: DocLike, now = Date.now()): QuoteState {
  if (doc.status === "cancelled") return "cancelled";
  if (doc.status === "accepted") return "accepted";
  if (doc.status === "refused") return "refused";
  if (doc.status === "expired" || quoteIsExpired(doc, now)) return "expired";
  return "open";
}

/** Facture émise, non réglée, d'un montant positif : payable en ligne. */
export function invoicePayable(doc: DocLike): boolean {
  return (doc.docType || "invoice") === "invoice"
    && (doc.status === "issued" || doc.status === "sent")
    && doc.totalCents > 0;
}

/** Visible publiquement : un devis (même brouillon) ou un document émis. */
export function publiclyVisible(doc: DocLike): boolean {
  return doc.docType === "devis" || doc.status !== "draft";
}

export function publicDocumentUrl(token: string, appUrl = process.env.APP_URL || "https://app.ecole-naturo.fr"): string {
  return `${appUrl}/api/public/doc/${token}`;
}

const STYLE = `
  body { margin:0; background:#f7faf9; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; color:#1a1a1a; }
  .wrap { max-width:720px; margin:0 auto; padding:24px 16px 40px; }
  .card { background:#fff; border:1px solid #dfe8e4; border-radius:12px; padding:24px; margin-bottom:16px; }
  .brand { color:#186749; font-weight:700; font-size:15px; margin:0 0 4px; }
  h1 { margin:0 0 6px; font-size:22px; color:#1b4332; }
  .muted { color:#5b6b66; font-size:14px; margin:0; }
  table { width:100%; border-collapse:collapse; margin-top:16px; font-size:14px; }
  th { text-align:left; color:#5b6b66; font-weight:600; border-bottom:1px solid #dfe8e4; padding:8px 4px; }
  td { padding:8px 4px; border-bottom:1px solid #eef3f1; vertical-align:top; }
  .num { text-align:right; white-space:nowrap; }
  .totals { margin-top:12px; margin-left:auto; max-width:280px; font-size:14px; }
  .totals div { display:flex; justify-content:space-between; padding:3px 0; }
  .totals .grand { font-weight:700; font-size:17px; color:#1b4332; border-top:1px solid #dfe8e4; margin-top:4px; padding-top:8px; }
  .notice { border-radius:10px; padding:14px 16px; margin-bottom:16px; font-size:15px; line-height:1.5; }
  .ok { background:#d1f0e0; color:#0f4d35; border:1px solid #9ad4b7; }
  .warn { background:#fff4d6; color:#7a5800; border:1px solid #ecd28c; }
  .err { background:#fde2e2; color:#922020; border:1px solid #f0b4b4; }
  .btn, button { display:inline-block; border:1px solid transparent; border-radius:10px; padding:12px 18px; font-size:15px; font-weight:700; cursor:pointer; text-decoration:none; font-family:inherit; }
  .primary { background:#186749; color:#fff; }
  .secondary { background:#fff; color:#186749; border-color:#186749; }
  .danger { background:#fff; color:#922020; border-color:#e3a3a3; }
  label { display:block; font-size:14px; font-weight:600; margin:12px 0 6px; }
  input[type=text], textarea { width:100%; box-sizing:border-box; border:1px solid #c9d6d1; border-radius:10px; padding:10px 12px; font-size:15px; font-family:inherit; }
  .check { display:flex; gap:8px; align-items:flex-start; font-weight:500; }
  .check input { margin-top:3px; }
  .actions { display:flex; flex-wrap:wrap; gap:10px; margin-top:16px; }
  details summary { cursor:pointer; color:#922020; font-weight:600; margin-top:16px; }
  .footer { text-align:center; font-size:12px; color:#6b7a76; margin-top:24px; }
`;

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<title>${esc(title)}</title>
<style>${STYLE}</style></head>
<body><div class="wrap">${body}
<p class="footer">Document transmis via Naturo Pro</p>
</div></body></html>`;
}

export type PageNotice = "accepted" | "refused" | "paid" | "cancelled_payment" | "error";

export function renderPublicDocumentPage(opts: {
  doc: DocLike;
  items: ItemLike[];
  token: string;
  practitionerName: string;
  practitionerContact?: string | null;
  onlinePayment: boolean;
  notice?: PageNotice | null;
  errorMessage?: string | null;
  now?: number;
}): string {
  const { doc, token } = opts;
  const now = opts.now ?? Date.now();
  const kind = doc.docType === "devis" ? "devis" : doc.docType === "avoir" ? "avoir" : "facture";
  const label = kind === "devis" ? "Devis" : kind === "avoir" ? "Avoir" : "Facture";
  const client = doc.clientCompanyName || `${doc.clientFirstName || ""} ${doc.clientLastName || ""}`.trim();
  const base = `/api/public/doc/${encodeURIComponent(token)}`;
  const contact = opts.practitionerContact ? ` (${esc(opts.practitionerContact)})` : "";

  const notices: Record<PageNotice, string> = {
    accepted: `<div class="notice ok">Merci ! Votre accord est enregistré. ${esc(opts.practitionerName)} en est informée.</div>`,
    refused: `<div class="notice warn">Votre réponse est enregistrée. ${esc(opts.practitionerName)} en est informée.</div>`,
    paid: `<div class="notice ok">Paiement reçu, merci ! Votre facture est réglée.</div>`,
    cancelled_payment: `<div class="notice warn">Paiement annulé : rien n'a été débité. Vous pouvez réessayer quand vous le souhaitez.</div>`,
    error: `<div class="notice err">${esc(opts.errorMessage || "Une erreur est survenue.")}</div>`,
  };

  const meta = [`${kind === "facture" ? "Émise" : "Émis"} le ${dateFr(doc.issueDate)}`];
  if (kind === "devis" && doc.dueDate) meta.push(`valable jusqu'au ${dateFr(doc.dueDate)}`);
  if (kind === "facture" && doc.dueDate) meta.push(`échéance le ${dateFr(doc.dueDate)}`);

  const rows = opts.items.map((it) => `<tr><td>${esc(it.description)}</td><td class="num">${it.quantity}</td>`
    + `<td class="num">${esc(formatPriceCents(it.unitPriceCents))}</td><td class="num">${esc(formatPriceCents(it.totalCents))}</td></tr>`).join("");
  const totals = doc.vatEnabled
    ? `<div><span>Total HT</span><span>${esc(formatPriceCents(doc.subtotalCents))}</span></div>`
      + `<div><span>TVA</span><span>${esc(formatPriceCents(doc.vatCents))}</span></div>`
      + `<div class="grand"><span>Total TTC</span><span>${esc(formatPriceCents(doc.totalCents))}</span></div>`
    : `<div class="grand"><span>Total</span><span>${esc(formatPriceCents(doc.totalCents))}</span></div>`;

  let action = "";
  if (kind === "devis") {
    const state = quoteState(doc, now);
    if (state === "open") {
      action = `<div class="card"><h2 style="margin:0 0 4px;font-size:18px;color:#1b4332">Votre réponse</h2>
<p class="muted">En acceptant, vous donnez votre accord sur ce devis (« bon pour accord »).</p>
<form method="post" action="${base}/accept">
  <label for="signer">Nom et prénom</label>
  <input type="text" id="signer" name="signerName" required minlength="2" maxlength="120" autocomplete="name" value="${esc(`${doc.clientFirstName || ""} ${doc.clientLastName || ""}`.trim())}">
  <label class="check"><input type="checkbox" name="consent" value="1" required> J'accepte ce devis : bon pour accord.</label>
  <div class="actions"><button type="submit" class="primary">Accepter le devis</button></div>
</form>
<details><summary>Refuser le devis</summary>
<form method="post" action="${base}/refuse">
  <label for="reason">Motif (facultatif)</label>
  <textarea id="reason" name="reason" rows="3" maxlength="1000"></textarea>
  <div class="actions"><button type="submit" class="danger">Refuser le devis</button></div>
</form></details></div>`;
    } else if (state === "accepted") {
      action = `<div class="notice ok">Devis accepté${doc.quoteDecidedAt ? ` le ${dateFr(doc.quoteDecidedAt)}` : ""}${doc.quoteSignerName ? ` par ${esc(doc.quoteSignerName)}` : ""}.</div>`;
    } else if (state === "refused") {
      action = `<div class="notice warn">Devis refusé${doc.quoteDecidedAt ? ` le ${dateFr(doc.quoteDecidedAt)}` : ""}.</div>`;
    } else if (state === "expired") {
      action = `<div class="notice warn">Ce devis a expiré${doc.dueDate ? ` le ${dateFr(doc.dueDate)}` : ""}. Contactez ${esc(opts.practitionerName)}${contact} pour en obtenir un nouveau.</div>`;
    } else {
      action = `<div class="notice warn">Ce devis a été annulé.</div>`;
    }
  } else if (kind === "facture") {
    if (doc.status === "paid") {
      action = `<div class="notice ok">Facture réglée${doc.paidAt ? ` le ${dateFr(doc.paidAt)}` : ""}. Merci !</div>`;
    } else if (doc.status === "cancelled") {
      action = `<div class="notice warn">Cette facture a été annulée.</div>`;
    } else if (invoicePayable(doc) && opts.onlinePayment) {
      action = `<div class="card"><h2 style="margin:0 0 4px;font-size:18px;color:#1b4332">Régler en ligne</h2>
<p class="muted">Paiement sécurisé par carte bancaire (Stripe).</p>
<form method="post" action="${base}/pay"><div class="actions"><button type="submit" class="primary">Payer ${esc(formatPriceCents(doc.totalCents))} par carte</button></div></form></div>`;
    } else if (invoicePayable(doc)) {
      action = `<div class="notice warn">Le paiement en ligne n'est pas proposé pour cette facture : réglez-la directement auprès de ${esc(opts.practitionerName)}${contact}.</div>`;
    }
  }

  const body = `${opts.notice ? notices[opts.notice] : ""}
<div class="card">
  <p class="brand">${esc(opts.practitionerName)}</p>
  <h1>${label} ${esc(doc.number)}</h1>
  <p class="muted">${esc(meta.join(" · "))}${client ? ` · pour ${esc(client)}` : ""}</p>
  <table><thead><tr><th>Désignation</th><th class="num">Qté</th><th class="num">Prix unitaire</th><th class="num">Total</th></tr></thead>
  <tbody>${rows}</tbody></table>
  <div class="totals">${totals}</div>
  <div class="actions"><a class="btn secondary" href="${base}/pdf">Télécharger le PDF</a></div>
</div>
${action}`;
  return page(`${label} ${doc.number} — ${opts.practitionerName}`, body);
}

export function renderUnavailablePage(): string {
  return page("Document indisponible", `<div class="notice warn">Ce document n'est pas disponible. Le lien est peut-être incomplet : vérifiez-le ou contactez votre praticienne.</div>`);
}

/** Page de désinscription des messages groupés (bouton, puis confirmation). */
export function renderUnsubscribePage(opts: { practitionerName: string; token: string; done: boolean }): string {
  const base = `/api/public/unsubscribe/${encodeURIComponent(opts.token)}`;
  const body = opts.done
    ? `<div class="notice ok">C'est fait : vous ne recevrez plus les messages groupés de ${esc(opts.practitionerName)}. Les emails liés à vos rendez-vous (confirmation, rappel) continuent d'arriver.</div>`
    : `<div class="card"><p class="brand">${esc(opts.practitionerName)}</p><h1>Se désinscrire</h1>
<p class="muted">Vous ne recevrez plus les messages groupés de ${esc(opts.practitionerName)}. Les emails liés à vos rendez-vous continueront d'arriver.</p>
<form method="post" action="${base}"><div class="actions"><button type="submit" class="primary">Me désinscrire</button></div></form></div>`;
  return page("Désinscription", body);
}

/** Notification à la praticienne (devis accepté ou refusé, facture réglée en ligne). */
export function renderPractitionerNotice(opts: { subject: string; lines: string[]; linkUrl?: string | null; linkLabel?: string | null }): { subject: string; html: string; text: string } {
  const html = opts.lines.map((l) => `<p>${esc(l)}</p>`).join("")
    + (opts.linkUrl ? `<p><a href="${esc(opts.linkUrl)}">${esc(opts.linkLabel || opts.linkUrl)}</a></p>` : "");
  const text = [...opts.lines, ...(opts.linkUrl ? ["", `${opts.linkLabel || "Lien"} : ${opts.linkUrl}`] : [])].join("\n");
  return { subject: opts.subject, html, text };
}
