/**
 * server/routes/helpers/invoices.ts
 *
 * Création d'une facture brouillon à partir d'un rendez-vous, et recopie des
 * coordonnées de facturation d'une fiche cliente.
 *
 * NB : distinct de server/invoices.ts (qui contient les helpers de calcul/PDF).
 * Ce module est la couche d'orchestration côté routes.
 */

import { storage } from "../../storage";
import {
  computeInvoiceTotals, computeItemTotal, buildPractitionerSnapshot,
  type InvoiceItemDraft,
} from "../../invoices";
import { provisionalNumber, clientKind } from "../../einvoicing/document";
import { sirenFrom, siretFrom, normalizeVatNumber } from "../../einvoicing/identifiers";
import type { Client, Invoice } from "@shared/schema-active";

/**
 * Coordonnées de facturation recopiées d'une fiche cliente dans la facture (figées
 * ensuite). Une cliente « entreprise », « association » ou « public » porte sa
 * raison sociale, son SIREN/SIRET et son n° de TVA dans des champs structurés —
 * ils alimentent le Factur-X (BT-44, BT-47, BT-48) au lieu d'être collés dans l'adresse.
 */
export function clientBillingFields(c: Client): Record<string, any> {
  const kind = clientKind(c.clientType);
  const pro = kind !== "particulier";
  return {
    clientFirstName: c.firstName || "",
    clientLastName: c.lastName || "",
    clientEmail: c.email || "",
    clientAddress: c.address || null,
    clientPostalCode: c.postalCode || null,
    clientCity: c.city || null,
    clientCountry: null,
    clientType: kind,
    clientCompanyName: pro ? c.companyName || null : null,
    clientSiren: pro ? sirenFrom(c.companySiret) : null,
    clientSiret: pro ? siretFrom(c.companySiret) : null,
    clientVatNumber: pro ? normalizeVatNumber(c.companyVatNumber) : null,
  };
}

export async function createInvoiceFromAppointment(
  userId: number,
  appt: any,
  user: any,
): Promise<Invoice> {
  // Fiche cliente si liée, sinon les coordonnées saisies sur le RDV
  let client: Record<string, any> = {
    clientFirstName: appt.clientFirstName || "",
    clientLastName: appt.clientLastName || "",
    clientEmail: appt.clientEmail || "",
    clientType: "particulier",
  };
  if (appt.clientId) {
    const c = await storage.getClient(appt.clientId);
    if (c && c.userId === userId) client = clientBillingFields(c);
  }

  // Catégorie : prix par défaut et libellé de la ligne
  let unitPriceCents = appt.paymentAmountCents || 0;
  let description = "Consultation";
  if (appt.categoryId) {
    const cat = await storage.getCategory(appt.categoryId);
    if (cat) {
      if (!unitPriceCents) unitPriceCents = cat.priceCents || 0;
      description = cat.name || description;
    }
  }

  const items: InvoiceItemDraft[] = [{ description, quantity: 1, unitPriceCents }];
  const vatEnabled = !!user.billingVatEnabled;
  const vatRate = user.billingVatRate ?? 2000;
  const totals = computeInvoiceTotals(items, vatEnabled, vatRate);
  const now = Date.now();

  // Brouillon : numéro provisoire, le numéro légal est attribué à l'émission.
  const inv = await storage.createInvoice({
    userId,
    status: "draft",
    docType: "invoice",
    number: provisionalNumber(now),
    issueDate: now,
    dueDate: null,
    // La séance est la date de la prestation (mention obligatoire si elle diffère
    // de la date d'émission).
    serviceDate: appt.startAt ?? null,
    appointmentId: appt.id,
    clientId: appt.clientId || null,
    ...client,
    subtotalCents: totals.subtotalCents,
    vatCents: totals.vatCents,
    totalCents: totals.totalCents,
    vatRate,
    vatEnabled,
    paymentMethod: null,
    paidAt: null,
    sentAt: null,
    notes: null,
    practitionerSnapshot: JSON.stringify(buildPractitionerSnapshot(user)),
    createdAt: now,
    updatedAt: now,
  } as any);

  await storage.replaceInvoiceItems(inv.id, items.map((it, i) => ({
    invoiceId: inv.id,
    position: i,
    description: it.description,
    quantity: it.quantity,
    unitPriceCents: it.unitPriceCents,
    totalCents: computeItemTotal(it.quantity, it.unitPriceCents),
    kind: "service",
  })) as any);

  return inv;
}
