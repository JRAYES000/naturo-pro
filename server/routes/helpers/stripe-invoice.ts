/**
 * server/routes/helpers/stripe-invoice.ts — règlement d'une facture par une
 * Checkout Session Stripe PAYÉE (lien de paiement, lot 2b).
 *
 * Deux appelants, comme pour les acomptes (stripe-booking.ts) :
 *   - GET /api/public/doc/:token/paid   (retour success_url, immédiat)
 *   - reconcilierPaiementsStripe()      (rattrapage périodique si l'onglet est fermé)
 *
 * Idempotence : le marqueur durable stripe_processed_sessions (contrainte UNIQUE),
 * posé AVANT la mise à jour de la facture.
 */
import { storage } from "../../storage";
import { sendEmail } from "../../email";
import { formatPriceCents } from "../../invoices";
import { reportPaymentIfTransmitted } from "../../einvoicing/service";
import { renderPractitionerNotice } from "../../public-documents";
import { getEmailConfigOrSystem } from "./email-sending";

export type ResultatReglement = "reglee" | "deja_traitee" | "invalide";

/** Métadonnées posées sur la session : reconnaît un paiement de facture. */
export function isInvoiceSession(session: any): boolean {
  return session?.metadata?.kind === "invoice" && !!Number(session?.metadata?.invoiceId);
}

export async function reglerFactureDepuisSession(user: any, session: any, paidAt = Date.now()): Promise<ResultatReglement> {
  const sessionId = String(session?.id || "");
  if (!sessionId || !isInvoiceSession(session) || session.payment_status !== "paid") return "invalide";
  const inv = await storage.getInvoice(Number(session.metadata.invoiceId));
  if (!inv || inv.userId !== user.id || (inv.docType || "invoice") !== "invoice") return "invalide";

  if (await storage.isStripeSessionProcessed(sessionId)) return "deja_traitee";
  if (!(await storage.markStripeSessionProcessed(user.id, sessionId, null))) return "deja_traitee";

  const montant = formatPriceCents(Number(session.amount_total) || inv.totalCents);
  let updated = inv;
  if (inv.status === "issued" || inv.status === "sent") {
    updated = (await storage.updateInvoice(inv.id, {
      status: "paid", paidAt, paymentMethod: "card", onlinePaymentSessionId: sessionId,
    } as any)) ?? inv;
    if (updated.einvoiceExternalId && !updated.einvoicePaidReportedAt) {
      await reportPaymentIfTransmitted(updated).catch((e) => console.error("[stripe-invoice] encaissement plateforme :", e?.message || e));
    }
  } else {
    // Réglée entre-temps par un autre moyen, ou annulée : l'argent est encaissé quand
    // même. On ne réécrit pas la facture ; la praticienne est prévenue pour rembourser.
    console.warn(`[stripe-invoice] paiement en ligne sur une facture ${inv.status} — facture=${inv.id} session=${sessionId}`);
  }

  if (inv.clientId) {
    await storage.createClientFollowup({
      userId: user.id, clientId: inv.clientId, kind: "note",
      content: `Facture ${inv.number} réglée en ligne par carte (${montant}).`, occurredAt: paidAt,
    }).catch(() => undefined);
  }

  const cfg = getEmailConfigOrSystem(user);
  if (cfg && user.email) {
    const appUrl = process.env.APP_URL || "https://app.ecole-naturo.fr";
    const client = inv.clientCompanyName || `${inv.clientFirstName || ""} ${inv.clientLastName || ""}`.trim() || "Votre cliente";
    const doublon = inv.status === "issued" || inv.status === "sent" ? null
      : `Attention : cette facture était déjà « ${inv.status === "paid" ? "payée" : "annulée"} » avant ce paiement. Vérifiez s'il faut rembourser depuis votre tableau de bord Stripe.`;
    const mail = renderPractitionerNotice({
      subject: `Facture ${inv.number} réglée en ligne — ${montant}`,
      lines: [`${client} vient de régler la facture ${inv.number} par carte (${montant}).`, ...(doublon ? [doublon] : [])],
      linkUrl: `${appUrl}/#/app/invoices/${inv.id}`,
      linkLabel: "Voir la facture",
    });
    const r = await sendEmail(cfg, user.email, mail.subject, mail.html, mail.text);
    if (!r.ok) console.error(`[stripe-invoice] notification facture=${inv.id} : ${r.error}`);
  }
  return "reglee";
}
