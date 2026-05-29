/**
 * server/routes/helpers/invoices.ts
 *
 * Création d'une facture brouillon à partir d'un rendez-vous.
 * Extrait de server/routes.ts (Phase 4.0 — split par domaine). Comportement identique.
 *
 * NB : distinct de server/invoices.ts (qui contient les helpers de calcul/PDF).
 * Ce module est la couche d'orchestration côté routes.
 */

import { storage } from "../../storage";
import {
  computeInvoiceTotals, computeItemTotal, buildPractitionerSnapshot,
  buildInvoiceNumber, getYearFromMs,
  type InvoiceItemDraft,
} from "../../invoices";
import type { Invoice } from "@shared/schema-active";

export async function createInvoiceFromAppointment(
  userId: number,
  appt: any,
  user: any,
): Promise<Invoice> {
  // Récupérer le client si lié, sinon utiliser snapshot du RDV
  let clientFirstName = appt.clientFirstName || "";
  let clientLastName = appt.clientLastName || "";
  let clientEmail = appt.clientEmail || "";
  let clientAddress: string | null = null;
  let clientPostalCode: string | null = null;
  let clientCity: string | null = null;
  if (appt.clientId) {
    const c = await storage.getClient(appt.clientId);
    if (c) {
      clientFirstName = c.firstName || clientFirstName;
      clientLastName = c.lastName || clientLastName;
      clientEmail = c.email || clientEmail;
      clientAddress = (c as any).address || null;
      clientPostalCode = (c as any).postalCode || null;
      clientCity = (c as any).city || null;
    }
  }

  // Récupérer la catégorie pour le prix par défaut
  let unitPriceCents = appt.paymentAmountCents || 0;
  let description = "Consultation";
  if (appt.categoryId) {
    const cat = await storage.getCategory(appt.categoryId);
    if (cat) {
      if (!unitPriceCents) unitPriceCents = cat.priceCents || 0;
      description = cat.name || description;
    }
  }

  const items: InvoiceItemDraft[] = [{
    description,
    quantity: 1,
    unitPriceCents,
  }];
  const vatEnabled = !!user.billingVatEnabled;
  const vatRate = user.billingVatRate ?? 2000;
  const totals = computeInvoiceTotals(items, vatEnabled, vatRate);
  const issueDate = Date.now();
  const year = getYearFromMs(issueDate);
  const counter = await storage.nextInvoiceCounter(userId, year);
  const number = buildInvoiceNumber(year, counter);
  const snapshot = buildPractitionerSnapshot(user);

  const inv = await storage.createInvoice({
    userId,
    number,
    status: "draft",
    issueDate,
    dueDate: null,
    appointmentId: appt.id,
    clientId: appt.clientId || null,
    clientFirstName,
    clientLastName,
    clientEmail,
    clientAddress,
    clientPostalCode,
    clientCity,
    subtotalCents: totals.subtotalCents,
    vatCents: totals.vatCents,
    totalCents: totals.totalCents,
    vatRate,
    vatEnabled,
    paymentMethod: null,
    paidAt: null,
    sentAt: null,
    notes: null,
    practitionerSnapshot: JSON.stringify(snapshot),
    createdAt: issueDate,
    updatedAt: issueDate,
  } as any);

  await storage.replaceInvoiceItems(inv.id, items.map((it, i) => ({
    invoiceId: inv.id,
    position: i,
    description: it.description,
    quantity: it.quantity,
    unitPriceCents: it.unitPriceCents,
    totalCents: computeItemTotal(it.quantity, it.unitPriceCents),
  })) as any);

  return inv;
}
