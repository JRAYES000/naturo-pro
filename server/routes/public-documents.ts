/**
 * server/routes/public-documents.ts — liens publics des documents (lot 2b).
 *
 * GET  /api/public/doc/:token          page du devis ou de la facture
 * GET  /api/public/doc/:token/pdf      PDF (Factur-X pour un document émis)
 * POST /api/public/doc/:token/accept   devis accepté (nom + « bon pour accord »)
 * POST /api/public/doc/:token/refuse   devis refusé (motif facultatif)
 * POST /api/public/doc/:token/pay      facture → Stripe Checkout (clé de la praticienne)
 * GET  /api/public/doc/:token/paid     retour Stripe : facture marquée réglée
 * GET|POST /api/public/unsubscribe/:token  désinscription des messages groupés
 *
 * Formulaires HTML classiques (urlencoded) et redirections 303 : la page se recharge
 * sans renvoyer le formulaire. Le jeton (128 bits) est le seul secret du lien.
 */
import type { Express, Response } from "express";
import { storage } from "../storage";
import { sendEmail } from "../email";
import { generateInvoicePdf, buildPractitionerSnapshot, type PractitionerSnapshot } from "../invoices";
import { createCheckoutSession, retrieveCheckoutSession } from "../stripe";
import {
  renderPublicDocumentPage, renderUnavailablePage, renderUnsubscribePage, renderPractitionerNotice,
  quoteState, invoicePayable, publiclyVisible, type PageNotice,
} from "../public-documents";
import { reglerFactureDepuisSession } from "./helpers/stripe-invoice";
import { getEmailConfigOrSystem } from "./helpers/email-sending";
import type { Invoice } from "@shared/schema-active";

const TOKEN_RE = /^[a-f0-9]{32}$/;
const NOTICES: PageNotice[] = ["accepted", "refused", "paid", "cancelled_payment", "error"];

function appUrl(): string {
  return process.env.APP_URL || "https://app.ecole-naturo.fr";
}

function snapshotOf(inv: Invoice, user: any): PractitionerSnapshot {
  // Devis en brouillon : identité ACTUELLE (comme l'aperçu de la praticienne).
  if (inv.status === "draft" && user) return buildPractitionerSnapshot(user);
  try {
    return JSON.parse(inv.practitionerSnapshot || "{}");
  } catch {
    return buildPractitionerSnapshot(user);
  }
}

function sendHtml(res: Response, status: number, html: string) {
  res.status(status).setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cache-Control", "no-store");
  res.type("html").send(html);
}

async function load(token: string) {
  if (!TOKEN_RE.test(token)) return null;
  const inv = await storage.getInvoiceByPublicToken(token);
  if (!inv || !publiclyVisible(inv)) return null;
  const user = await storage.getUserById(inv.userId);
  if (!user) return null;
  return { inv, user, snapshot: snapshotOf(inv, user) };
}

const practitionerName = (snap: PractitionerSnapshot, user: any) => snap.companyName || snap.name || user?.name || "Votre praticienne";

async function notifyPractitioner(user: any, subject: string, lines: string[], invoiceId: number) {
  const cfg = getEmailConfigOrSystem(user);
  if (!cfg || !user?.email) return;
  const mail = renderPractitionerNotice({ subject, lines, linkUrl: `${appUrl()}/#/app/invoices/${invoiceId}`, linkLabel: "Voir le document" });
  const r = await sendEmail(cfg, user.email, mail.subject, mail.html, mail.text);
  if (!r.ok) console.error(`[public-doc] notification document=${invoiceId} : ${r.error}`);
}

export function registerPublicDocumentRoutes(app: Express): void {
  app.get("/api/public/doc/:token", async (req, res) => {
    const ctx = await load(String(req.params.token));
    if (!ctx) return sendHtml(res, 404, renderUnavailablePage());
    const { inv, user, snapshot } = ctx;
    const items = await storage.getInvoiceItems(inv.id);
    const ok = String(req.query.ok || "");
    sendHtml(res, 200, renderPublicDocumentPage({
      doc: inv, items, token: inv.publicToken!,
      practitionerName: practitionerName(snapshot, user),
      practitionerContact: snapshot.email || snapshot.phone || null,
      onlinePayment: !!(user as any).stripeSecretKey,
      notice: NOTICES.includes(ok as PageNotice) ? (ok as PageNotice) : null,
      errorMessage: ok === "error" ? String(req.query.msg || "").slice(0, 200) || null : null,
    }));
  });

  app.get("/api/public/doc/:token/pdf", async (req, res) => {
    const ctx = await load(String(req.params.token));
    if (!ctx) return sendHtml(res, 404, renderUnavailablePage());
    const { inv, snapshot } = ctx;
    try {
      const items = await storage.getInvoiceItems(inv.id);
      const credited = inv.creditedInvoiceId ? await storage.getInvoice(inv.creditedInvoiceId) : null;
      const pdf = await generateInvoicePdf(inv, items, snapshot, credited && credited.userId === inv.userId ? credited : null);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${inv.number}.pdf"`);
      res.setHeader("X-Robots-Tag", "noindex, nofollow");
      res.send(pdf);
    } catch (e: any) {
      console.error("[public-doc pdf]", e?.message || e);
      sendHtml(res, 500, renderUnavailablePage());
    }
  });

  // ── Devis : décision de la cliente ─────────────────────────────────────────
  app.post("/api/public/doc/:token/accept", async (req, res) => {
    const token = String(req.params.token);
    const ctx = await load(token);
    if (!ctx || ctx.inv.docType !== "devis") return sendHtml(res, 404, renderUnavailablePage());
    const { inv, user } = ctx;
    const back = (q: string) => res.redirect(303, `/api/public/doc/${token}?${q}`);
    if (quoteState(inv) !== "open") return back("ok=error&msg=" + encodeURIComponent("Ce devis n'attend plus de réponse."));
    const signer = String(req.body?.signerName || "").replace(/\s+/g, " ").trim().slice(0, 120);
    if (signer.length < 2 || !req.body?.consent) {
      return back("ok=error&msg=" + encodeURIComponent("Indiquez votre nom et cochez « bon pour accord » pour accepter."));
    }
    const now = Date.now();
    await storage.updateInvoice(inv.id, { status: "accepted", quoteDecidedAt: now, quoteSignerName: signer, quoteDecisionNote: null } as any);
    if (inv.clientId) {
      await storage.createClientFollowup({ userId: user.id, clientId: inv.clientId, kind: "note", content: `Devis ${inv.number} accepté en ligne par ${signer}.`, occurredAt: now }).catch(() => undefined);
    }
    void notifyPractitioner(user, `Devis ${inv.number} accepté`, [
      `${signer} vient d'accepter le devis ${inv.number} en ligne (bon pour accord).`,
      "Vous pouvez le convertir en facture depuis Naturo Pro.",
    ], inv.id).catch(() => undefined);
    back("ok=accepted");
  });

  app.post("/api/public/doc/:token/refuse", async (req, res) => {
    const token = String(req.params.token);
    const ctx = await load(token);
    if (!ctx || ctx.inv.docType !== "devis") return sendHtml(res, 404, renderUnavailablePage());
    const { inv, user } = ctx;
    const back = (q: string) => res.redirect(303, `/api/public/doc/${token}?${q}`);
    if (quoteState(inv) !== "open") return back("ok=error&msg=" + encodeURIComponent("Ce devis n'attend plus de réponse."));
    const reason = String(req.body?.reason || "").trim().slice(0, 1000) || null;
    const now = Date.now();
    await storage.updateInvoice(inv.id, { status: "refused", quoteDecidedAt: now, quoteSignerName: null, quoteDecisionNote: reason } as any);
    if (inv.clientId) {
      await storage.createClientFollowup({ userId: user.id, clientId: inv.clientId, kind: "note", content: `Devis ${inv.number} refusé en ligne${reason ? ` : « ${reason} »` : "."}`, occurredAt: now }).catch(() => undefined);
    }
    const client = inv.clientCompanyName || `${inv.clientFirstName || ""} ${inv.clientLastName || ""}`.trim() || "Votre cliente";
    void notifyPractitioner(user, `Devis ${inv.number} refusé`, [
      `${client} a refusé le devis ${inv.number}.`,
      ...(reason ? [`Motif : « ${reason} »`] : []),
    ], inv.id).catch(() => undefined);
    back("ok=refused");
  });

  // ── Facture : paiement en ligne ─────────────────────────────────────────────
  app.post("/api/public/doc/:token/pay", async (req, res) => {
    const token = String(req.params.token);
    const ctx = await load(token);
    if (!ctx) return sendHtml(res, 404, renderUnavailablePage());
    const { inv, user, snapshot } = ctx;
    const back = (q: string) => res.redirect(303, `/api/public/doc/${token}?${q}`);
    const key = (user as any).stripeSecretKey || "";
    if (!invoicePayable(inv) || !key) return back("ok=error&msg=" + encodeURIComponent("Cette facture ne peut pas être réglée en ligne."));
    const session = await createCheckoutSession(key, {
      amountCents: inv.totalCents,
      productName: `Facture ${inv.number} — ${practitionerName(snapshot, user)}`,
      customerEmail: inv.clientEmail || null,
      successUrl: `${appUrl()}/api/public/doc/${token}/paid?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${appUrl()}/api/public/doc/${token}?ok=cancelled_payment`,
      metadata: { kind: "invoice", userId: String(user.id), invoiceId: String(inv.id), number: inv.number },
    });
    if ("url" in session) return res.redirect(303, session.url);
    console.error("[public-doc pay] session Stripe :", session.error);
    back("ok=error&msg=" + encodeURIComponent("Le paiement en ligne est momentanément indisponible. Réessayez plus tard."));
  });

  app.get("/api/public/doc/:token/paid", async (req, res) => {
    const token = String(req.params.token);
    const ctx = await load(token);
    if (!ctx) return sendHtml(res, 404, renderUnavailablePage());
    const { inv, user } = ctx;
    const back = (q: string) => res.redirect(303, `/api/public/doc/${token}?${q}`);
    const sessionId = String(req.query.session_id || "");
    const key = (user as any).stripeSecretKey || "";
    if (!sessionId || !key) return back("ok=error&msg=" + encodeURIComponent("Lien de retour invalide."));
    const session = await retrieveCheckoutSession(key, sessionId);
    if (!session || String(session.metadata?.invoiceId) !== String(inv.id)) {
      return back("ok=error&msg=" + encodeURIComponent("Impossible de vérifier le paiement auprès de Stripe."));
    }
    if (session.payment_status !== "paid") return back("ok=cancelled_payment");
    await reglerFactureDepuisSession(user, session);
    back("ok=paid");
  });

  // ── Désinscription des messages groupés ───────────────────────────────────
  async function unsubscribe(req: any, res: Response, apply: boolean) {
    const token = String(req.params.token);
    const client = TOKEN_RE.test(token) ? await storage.getClientByOptOutToken(token) : undefined;
    if (!client) return sendHtml(res, 404, renderUnavailablePage());
    const user = await storage.getUserById(client.userId);
    const name = (user as any)?.emailFromName || user?.name || "votre praticienne";
    if (apply && !client.emailOptOutAt) {
      await storage.updateClient(client.id, { emailOptOutAt: Date.now() } as any);
      await storage.createClientFollowup({ userId: client.userId, clientId: client.id, kind: "email", content: "Désinscription des messages groupés (lien de l'email).", occurredAt: Date.now() }).catch(() => undefined);
    }
    sendHtml(res, 200, renderUnsubscribePage({ practitionerName: name, token, done: apply || !!client.emailOptOutAt }));
  }
  app.get("/api/public/unsubscribe/:token", (req, res) => unsubscribe(req, res, false));
  // POST : bouton de la page, ou désinscription en un clic des messageries (RFC 8058).
  app.post("/api/public/unsubscribe/:token", (req, res) => unsubscribe(req, res, true));
}
