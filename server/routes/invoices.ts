/**
 * server/routes/invoices.ts — domaine Invoices (facturation)
 *
 * CRUD facture + émission + PDF Factur-X + XML + envoi email.
 *
 * Réforme facturation électronique 2026 :
 *  - un brouillon porte un numéro PROVISOIRE (BROUILLON-…) ; le numéro légal FACT-
 *    n'est attribué qu'à l'émission (storage.issueInvoice) ;
 *  - une facture ou un avoir émis se télécharge en Factur-X (PDF/A-3 + XML EN 16931) ;
 *  - un avoir est un document à part entière (docType « avoir », montants positifs)
 *    qui cite la facture qu'il corrige (creditedInvoiceId → BT-25/BT-26).
 *
 * ⚠️ GET /api/invoices/:id/pdf renvoie du binaire (application/pdf via res.send).
 */

import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { requireAuth, type AuthedRequest } from "../auth";
import { sendEmail } from "../email";
import {
  computeInvoiceTotals, computeItemTotal, buildPractitionerSnapshot,
  getYearFromMs, generateInvoicePdf, generateFacturxXml, renderInvoiceEmail,
  buildDevisNumber, nextDevisSeq,
  type PractitionerSnapshot,
} from "../invoices";
import {
  buildInvoiceDocument, categoryFromKinds, provisionalNumber, CLIENT_KINDS,
} from "../einvoicing/document";
import { checkInvoice } from "../einvoicing/compliance";
import { sirenFrom, siretFrom, normalizeVatNumber } from "../einvoicing/identifiers";
import { createInvoiceFromAppointment, clientBillingFields } from "./helpers/invoices";
import { reportPaymentIfTransmitted } from "../einvoicing/service";
import { getEmailConfigForUser } from "./helpers/email-sending";
import { publicDocumentUrl, invoicePayable } from "../public-documents";
import type { Invoice } from "@shared/schema-active";

function parseSnapshot(inv: Invoice): PractitionerSnapshot {
  try {
    return JSON.parse(inv.practitionerSnapshot || "{}");
  } catch {
    return {} as PractitionerSnapshot;
  }
}

/** Facture corrigée par un avoir (numéro + date), si elle existe chez la même praticienne. */
async function creditedOf(inv: Invoice): Promise<Invoice | null> {
  if (!inv.creditedInvoiceId) return null;
  const c = await storage.getInvoice(inv.creditedInvoiceId);
  return c && c.userId === inv.userId ? c : null;
}

/** Normalise SIREN/SIRET saisis dans un même champ. */
function companyIds(raw: string | null | undefined): { clientSiren: string | null; clientSiret: string | null } {
  return { clientSiren: sirenFrom(raw), clientSiret: siretFrom(raw) };
}

export function registerInvoiceRoutes(app: Express): void {
  // GET /api/invoices?status=&from=&to=&clientId=
  app.get("/api/invoices", requireAuth, async (req: AuthedRequest, res) => {
    const opts: any = {};
    if (req.query.status) opts.status = String(req.query.status);
    if (req.query.from) opts.from = Number(req.query.from);
    if (req.query.to) opts.to = Number(req.query.to);
    if (req.query.clientId) opts.clientId = Number(req.query.clientId);
    const list = await storage.listInvoices(req.userId!, opts);
    res.json(list);
  });

  // GET /api/invoices/:id — facture + lignes + contrôle de conformité
  app.get("/api/invoices/:id", requireAuth, async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const inv = await storage.getInvoice(id);
    if (!inv || inv.userId !== req.userId) return res.status(404).json({ message: "Introuvable" });
    const items = await storage.getInvoiceItems(id);
    const credited = await creditedOf(inv);
    // Brouillon : contrôle avec l'identité ACTUELLE de la praticienne (le snapshot
    // sera rafraîchi à l'émission). Émise : avec l'identité figée dans la facture.
    let seller: PractitionerSnapshot = parseSnapshot(inv);
    if (inv.status === "draft") {
      const user = await storage.getUserById(req.userId!);
      if (user) seller = buildPractitionerSnapshot(user);
    }
    const doc = buildInvoiceDocument(inv, items, seller, credited);
    const converted = inv.convertedInvoiceId ? await storage.getInvoice(inv.convertedInvoiceId) : null;
    res.json({
      ...inv,
      items,
      credited: credited ? { id: credited.id, number: credited.number, issueDate: credited.issueDate } : null,
      compliance: checkInvoice(doc, seller),
      // Lot 2b — lien public (devis à accepter, facture à régler) et facture issue du devis.
      publicUrl: inv.publicToken ? publicDocumentUrl(inv.publicToken) : null,
      convertedInvoice: converted && converted.userId === inv.userId ? { id: converted.id, number: converted.number, status: converted.status } : null,
    });
  });

  const invoiceItemSchema = z.object({
    description: z.string().min(1),
    // Entier : la colonne invoice_items.quantity est un INT. Le schéma acceptait un
    // décimal, que computeItemTotal tronquait ensuite en silence — saisir « 1,5 »
    // facturait 1 et « 0,5 » facturait 0,00 €, sans le moindre avertissement.
    quantity: z.number().int().min(1).default(1),
    unitPriceCents: z.number().int().nonnegative().default(0),
    kind: z.enum(["service", "goods"]).default("service"),
  });
  const clientFieldsSchema = {
    clientFirstName: z.string().optional(),
    clientLastName: z.string().optional(),
    clientEmail: z.string().optional(),
    clientAddress: z.string().nullable().optional(),
    clientPostalCode: z.string().nullable().optional(),
    clientCity: z.string().nullable().optional(),
    clientCountry: z.string().nullable().optional(),
    clientType: z.enum(CLIENT_KINDS as [string, ...string[]]).nullable().optional(),
    clientCompanyName: z.string().nullable().optional(),
    // SIREN ou SIRET : un seul champ de saisie, normalisé côté serveur.
    clientCompanyId: z.string().nullable().optional(),
    clientVatNumber: z.string().nullable().optional(),
  };
  const invoiceCreateSchema = z.object({
    clientId: z.number().int().positive().nullable().optional(),
    appointmentId: z.number().int().positive().nullable().optional(),
    ...clientFieldsSchema,
    issueDate: z.number().optional(),
    dueDate: z.number().nullable().optional(),
    serviceDate: z.number().nullable().optional(),
    notes: z.string().nullable().optional(),
    items: z.array(invoiceItemSchema).min(1),
    // Devis : même structure, numérotation séparée, hors comptabilité.
    docType: z.enum(["invoice", "devis"]).optional(),
  });

  const itemRows = (invoiceId: number, items: z.infer<typeof invoiceItemSchema>[]) =>
    items.map((it, i) => ({
      invoiceId,
      position: i,
      description: it.description,
      quantity: it.quantity,
      unitPriceCents: it.unitPriceCents,
      totalCents: computeItemTotal(it.quantity, it.unitPriceCents),
      kind: it.kind,
    }));

  // POST /api/invoices — brouillon de facture (numéro provisoire) ou devis
  app.post("/api/invoices", requireAuth, async (req: AuthedRequest, res) => {
    const parsed = invoiceCreateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Données invalides", errors: parsed.error.flatten() });
    const data = parsed.data;
    const user = await storage.getUserById(req.userId!);
    if (!user) return res.status(401).json({ message: "Non authentifié" });

    let client: Record<string, any> = {};
    if (data.clientId) {
      const c = await storage.getClient(data.clientId);
      if (c && c.userId === req.userId) client = clientBillingFields(c);
    }
    const pick = <T>(v: T | undefined, fallback: T) => (v !== undefined ? v : fallback);
    const ids = data.clientCompanyId !== undefined
      ? companyIds(data.clientCompanyId)
      : { clientSiren: client.clientSiren ?? null, clientSiret: client.clientSiret ?? null };

    const vatEnabled = !!user.billingVatEnabled;
    const vatRate = user.billingVatRate ?? 2000;
    const totals = computeInvoiceTotals(data.items, vatEnabled, vatRate);
    const now = Date.now();
    const issueDate = data.docType === "devis" ? (data.issueDate || now) : now;
    const year = getYearFromMs(issueDate);

    const base = {
      userId: req.userId!,
      status: "draft",
      issueDate,
      dueDate: data.dueDate ?? null,
      serviceDate: data.serviceDate ?? null,
      appointmentId: data.appointmentId ?? null,
      clientId: data.clientId ?? null,
      clientFirstName: pick(data.clientFirstName, client.clientFirstName ?? ""),
      clientLastName: pick(data.clientLastName, client.clientLastName ?? ""),
      clientEmail: pick(data.clientEmail, client.clientEmail ?? ""),
      clientAddress: pick(data.clientAddress, client.clientAddress ?? null),
      clientPostalCode: pick(data.clientPostalCode, client.clientPostalCode ?? null),
      clientCity: pick(data.clientCity, client.clientCity ?? null),
      clientCountry: pick(data.clientCountry, client.clientCountry ?? null),
      clientType: pick(data.clientType, client.clientType ?? "particulier"),
      clientCompanyName: pick(data.clientCompanyName, client.clientCompanyName ?? null),
      clientSiren: ids.clientSiren,
      clientSiret: ids.clientSiret,
      clientVatNumber: normalizeVatNumber(pick(data.clientVatNumber, client.clientVatNumber ?? null)),
      subtotalCents: totals.subtotalCents,
      vatCents: totals.vatCents,
      totalCents: totals.totalCents,
      vatRate,
      vatEnabled,
      paymentMethod: null,
      paidAt: null,
      sentAt: null,
      notes: data.notes ?? null,
      practitionerSnapshot: JSON.stringify(buildPractitionerSnapshot(user)),
      createdAt: now,
      updatedAt: now,
    };

    let inv;
    if (data.docType === "devis") {
      // Numérotation devis : max existant + 1 sur le préfixe DEVIS-YYYY-, retry
      // sur l'index UNIQUE(user_id, number) en cas de course.
      // ponytail: pas de sérialisation par user ici — l'index unique suffit à ce volume.
      const numbers = (await storage.listInvoices(req.userId!)).map((i) => i.number);
      let derniere: unknown;
      for (let seq = nextDevisSeq(numbers, year), tentative = 0; tentative < 8; tentative++, seq++) {
        try {
          inv = await storage.createInvoice({ ...base, docType: "devis", number: buildDevisNumber(year, seq) } as any);
          break;
        } catch (e: any) {
          const signature = `${e?.code || ""} ${e?.message || e}`;
          if (!/UNIQUE|ER_DUP_ENTRY|Duplicate entry|SQLITE_CONSTRAINT/i.test(signature)) throw e;
          derniere = e;
        }
      }
      if (!inv) throw derniere;
    } else {
      // Brouillon : numéro provisoire, hors séquence légale. Le numéro FACT- est
      // attribué à l'émission (POST /api/invoices/:id/issue, envoi ou changement de statut).
      inv = await storage.createInvoice({ ...base, docType: "invoice", number: provisionalNumber(now) } as any);
    }

    await storage.replaceInvoiceItems(inv.id, itemRows(inv.id, data.items) as any);
    const items = await storage.getInvoiceItems(inv.id);
    res.status(201).json({ ...inv, items });
  });

  // POST /api/invoices/from-appointment/:id  (brouillon pré-rempli depuis un RDV)
  app.post("/api/invoices/from-appointment/:id", requireAuth, async (req: AuthedRequest, res) => {
    const apptId = Number(req.params.id);
    const appt = await storage.getAppointment(apptId);
    if (!appt || appt.userId !== req.userId) return res.status(404).json({ message: "RDV introuvable" });
    const existing = await storage.getInvoiceByAppointment(apptId);
    if (existing) {
      const items = await storage.getInvoiceItems(existing.id);
      return res.status(200).json({ ...existing, items, alreadyExists: true });
    }
    const user = await storage.getUserById(req.userId!);
    if (!user) return res.status(401).json({ message: "Non authentifié" });
    const inv = await createInvoiceFromAppointment(req.userId!, appt, user);
    const items = await storage.getInvoiceItems(inv.id);
    res.status(201).json({ ...inv, items });
  });

  /**
   * Émission d'un brouillon : numéro légal, date d'émission, identité de la praticienne
   * figée à jour, catégorie d'opération et totaux recalculés avec le régime de TVA en
   * vigueur (un avoir garde la TVA de la facture qu'il corrige).
   */
  async function issueDraft(inv: Invoice, userId: number, status: "issued" | "sent" | "paid", extra: Record<string, unknown> = {}) {
    const user = await storage.getUserById(userId);
    if (!user) throw new Error("Praticienne introuvable");
    const items = await storage.getInvoiceItems(inv.id);
    const patch: Record<string, unknown> = {
      ...extra,
      status,
      practitionerSnapshot: JSON.stringify(buildPractitionerSnapshot(user)),
      operationCategory: categoryFromKinds(items.map((i) => i.kind)),
    };
    if (inv.docType !== "avoir") {
      const vatEnabled = !!user.billingVatEnabled;
      const vatRate = user.billingVatRate ?? 2000;
      const totals = computeInvoiceTotals(items as any, vatEnabled, vatRate);
      Object.assign(patch, { vatEnabled, vatRate, ...totals });
    }
    if (status === "paid" && !extra.paidAt) patch.paidAt = Date.now();
    return storage.issueInvoice(inv.id, userId, Date.now(), patch as any);
  }

  // POST /api/invoices/:id/issue — émission explicite (sans envoi)
  app.post("/api/invoices/:id/issue", requireAuth, async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const inv = await storage.getInvoice(id);
    if (!inv || inv.userId !== req.userId) return res.status(404).json({ message: "Introuvable" });
    if (inv.docType === "devis") return res.status(400).json({ message: "Un devis ne s'émet pas : convertissez-le en facture." });
    if (inv.status !== "draft") return res.status(409).json({ message: "Ce document est déjà émis." });
    const items = await storage.getInvoiceItems(id);
    if (!items.length || items.every((i) => !i.totalCents)) {
      return res.status(400).json({ message: "Ajoutez au moins une ligne d'un montant positif avant d'émettre." });
    }
    const updated = await issueDraft(inv, req.userId!, "issued");
    res.json({ ...updated, items: await storage.getInvoiceItems(id) });
  });

  // POST /api/invoices/:id/avoir — avoir (brouillon) sur une facture émise
  app.post("/api/invoices/:id/avoir", requireAuth, async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const inv = await storage.getInvoice(id);
    if (!inv || inv.userId !== req.userId) return res.status(404).json({ message: "Introuvable" });
    if (inv.docType === "devis") return res.status(400).json({ message: "Un devis ne donne pas lieu à un avoir : modifiez-le directement." });
    if (inv.docType === "avoir") return res.status(400).json({ message: "On ne crée pas d'avoir sur un avoir." });
    if (inv.status === "draft") return res.status(400).json({ message: "Cette facture est encore en brouillon : modifiez-la directement plutôt que de créer un avoir." });

    const now = Date.now();
    const sourceItems = await storage.getInvoiceItems(id);
    const avoir = await storage.createInvoice({
      userId: req.userId!,
      status: "draft",
      docType: "avoir",
      number: provisionalNumber(now),
      issueDate: now,
      dueDate: null,
      serviceDate: inv.serviceDate ?? null,
      appointmentId: null,
      clientId: inv.clientId ?? null,
      clientFirstName: inv.clientFirstName,
      clientLastName: inv.clientLastName,
      clientEmail: inv.clientEmail,
      clientAddress: inv.clientAddress,
      clientPostalCode: inv.clientPostalCode,
      clientCity: inv.clientCity,
      clientCountry: inv.clientCountry ?? null,
      clientType: inv.clientType ?? "particulier",
      clientCompanyName: inv.clientCompanyName ?? null,
      clientSiren: inv.clientSiren ?? null,
      clientSiret: inv.clientSiret ?? null,
      clientVatNumber: inv.clientVatNumber ?? null,
      // Montants positifs : c'est le type « avoir » qui porte le sens (déduction).
      subtotalCents: Math.abs(inv.subtotalCents || 0),
      vatCents: Math.abs(inv.vatCents || 0),
      totalCents: Math.abs(inv.totalCents || 0),
      vatRate: inv.vatRate,
      vatEnabled: inv.vatEnabled,
      paymentMethod: null,
      paidAt: null,
      sentAt: null,
      notes: null,
      creditedInvoiceId: inv.id,
      practitionerSnapshot: inv.practitionerSnapshot,
      createdAt: now,
      updatedAt: now,
    } as any);
    await storage.replaceInvoiceItems(avoir.id, sourceItems.map((it, i) => ({
      invoiceId: avoir.id,
      position: i,
      description: it.description,
      quantity: Math.abs(it.quantity || 1),
      unitPriceCents: Math.abs(it.unitPriceCents || 0),
      totalCents: Math.abs(it.totalCents || 0),
      kind: it.kind || "service",
    })) as any);
    const items = await storage.getInvoiceItems(avoir.id);
    res.status(201).json({ ...avoir, items });
  });

  // POST /api/invoices/:id/convert — devis → NOUVEAU brouillon de facture (numéro à
  // l'émission). Le devis est conservé (accepté, relié à la facture) : un devis signé
  // est une pièce à garder, il n'est plus transformé en place.
  app.post("/api/invoices/:id/convert", requireAuth, async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const devis = await storage.getInvoice(id);
    if (!devis || devis.userId !== req.userId) return res.status(404).json({ message: "Introuvable" });
    if (devis.docType !== "devis") return res.status(400).json({ message: "Seul un devis peut être converti en facture." });
    if (devis.status === "refused" || devis.status === "cancelled") {
      return res.status(409).json({ message: "Ce devis est refusé ou annulé : il ne se convertit pas en facture." });
    }
    if (devis.convertedInvoiceId) {
      const existante = await storage.getInvoice(devis.convertedInvoiceId);
      if (existante && existante.userId === req.userId) {
        return res.json({ ...existante, items: await storage.getInvoiceItems(existante.id), alreadyConverted: true });
      }
    }
    const user = await storage.getUserById(req.userId!);
    if (!user) return res.status(401).json({ message: "Non authentifié" });
    const now = Date.now();
    const sourceItems = await storage.getInvoiceItems(id);
    const facture = await storage.createInvoice({
      userId: req.userId!, status: "draft", docType: "invoice", number: provisionalNumber(now),
      issueDate: now, dueDate: null, serviceDate: devis.serviceDate ?? null,
      appointmentId: devis.appointmentId ?? null, clientId: devis.clientId ?? null,
      clientFirstName: devis.clientFirstName, clientLastName: devis.clientLastName, clientEmail: devis.clientEmail,
      clientAddress: devis.clientAddress, clientPostalCode: devis.clientPostalCode, clientCity: devis.clientCity,
      clientCountry: devis.clientCountry ?? null, clientType: devis.clientType ?? "particulier",
      clientCompanyName: devis.clientCompanyName ?? null, clientSiren: devis.clientSiren ?? null,
      clientSiret: devis.clientSiret ?? null, clientVatNumber: devis.clientVatNumber ?? null,
      subtotalCents: devis.subtotalCents, vatCents: devis.vatCents, totalCents: devis.totalCents,
      vatRate: devis.vatRate, vatEnabled: devis.vatEnabled,
      paymentMethod: null, paidAt: null, sentAt: null,
      notes: `Selon devis ${devis.number}.`,
      practitionerSnapshot: JSON.stringify(buildPractitionerSnapshot(user)),
      createdAt: now, updatedAt: now,
    } as any);
    await storage.replaceInvoiceItems(facture.id, sourceItems.map((it, i) => ({
      invoiceId: facture.id, position: i, description: it.description, quantity: it.quantity,
      unitPriceCents: it.unitPriceCents, totalCents: it.totalCents, kind: it.kind || "service",
    })) as any);
    await storage.updateInvoice(id, {
      convertedInvoiceId: facture.id,
      ...(devis.status === "accepted" ? {} : { status: "accepted", quoteDecidedAt: now }),
    } as any);
    res.status(201).json({ ...facture, items: await storage.getInvoiceItems(facture.id) });
  });

  // POST /api/invoices/:id/share-link — lien public du document (créé au premier appel) :
  // la cliente y accepte le devis ou règle la facture en ligne.
  app.post("/api/invoices/:id/share-link", requireAuth, async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const inv = await storage.getInvoice(id);
    if (!inv || inv.userId !== req.userId) return res.status(404).json({ message: "Introuvable" });
    if (inv.docType !== "devis" && inv.status === "draft") {
      return res.status(409).json({ message: "Émettez d'abord ce document : un brouillon n'a pas de lien public." });
    }
    const user = await storage.getUserById(req.userId!);
    const token = await storage.ensureInvoicePublicToken(id);
    res.json({
      url: publicDocumentUrl(token),
      payable: invoicePayable(inv) && !!(user as any)?.stripeSecretKey,
    });
  });

  // PATCH /api/invoices/:id  (contenu du brouillon, statut, paiement, notes)
  const invoicePatchSchema = z.object({
    // accepted / refused / expired : statuts propres au devis (lot 2b).
    status: z.enum(["draft", "issued", "sent", "paid", "cancelled", "accepted", "refused", "expired"]).optional(),
    paymentMethod: z.enum(["cash", "check", "transfer", "card"]).nullable().optional(),
    paidAt: z.number().nullable().optional(),
    dueDate: z.number().nullable().optional(),
    serviceDate: z.number().nullable().optional(),
    notes: z.string().nullable().optional(),
    items: z.array(invoiceItemSchema).optional(),
    ...clientFieldsSchema,
  });
  app.patch("/api/invoices/:id", requireAuth, async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const inv = await storage.getInvoice(id);
    if (!inv || inv.userId !== req.userId) return res.status(404).json({ message: "Introuvable" });
    const parsed = invoicePatchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Données invalides", errors: parsed.error.flatten() });
    const data = parsed.data;

    // Statuts du devis : réservés au devis, et un devis n'est jamais « émis » ni « payé ».
    const quoteOnly = ["accepted", "refused", "expired"];
    if (data.status && inv.docType !== "devis" && quoteOnly.includes(data.status)) {
      return res.status(400).json({ message: "Ce statut ne s'applique qu'à un devis." });
    }
    if (data.status && inv.docType === "devis" && (data.status === "issued" || data.status === "paid")) {
      return res.status(400).json({ message: "Un devis ne s'émet pas et ne se règle pas : convertissez-le en facture." });
    }

    // ── Immuabilité d'une facture ÉMISE ────────────────────────────────────
    // Une facture émise ne se modifie plus : le PDF détenu par la cliente ferait foi
    // contre un document que l'application ressortirait différent (montant, lignes,
    // identité). En France, une facture émise se corrige par un avoir, pas en la
    // réécrivant. Seuls le suivi de règlement et les notes restent ouverts.
    const contentFields = ["items", "clientFirstName", "clientLastName", "clientEmail", "clientAddress",
      "clientPostalCode", "clientCity", "clientCountry", "clientType", "clientCompanyName", "clientCompanyId",
      "clientVatNumber", "serviceDate"] as const;
    if (inv.status !== "draft") {
      const touches = contentFields.filter((c) => (data as any)[c] !== undefined);
      if (touches.length) {
        return res.status(409).json({
          message: `Ce document est ${inv.status === "paid" ? "payé" : "émis"} : son contenu ne peut plus être modifié. `
            + `Créez un avoir ou un nouveau document. (champs refusés : ${touches.join(", ")})`,
        });
      }
      if (data.status === "draft") {
        return res.status(409).json({ message: "Un document émis ne repasse pas en brouillon : créez un avoir pour le corriger." });
      }
    }

    // Contenu du brouillon (avant une éventuelle émission dans la même requête).
    if (inv.status === "draft") {
      const content: Record<string, unknown> = {};
      for (const f of ["clientFirstName", "clientLastName", "clientEmail", "clientAddress", "clientPostalCode",
        "clientCity", "clientCountry", "clientType", "clientCompanyName", "serviceDate"] as const) {
        if (data[f] !== undefined) content[f] = data[f];
      }
      if (data.clientCompanyId !== undefined) Object.assign(content, companyIds(data.clientCompanyId));
      if (data.clientVatNumber !== undefined) content.clientVatNumber = normalizeVatNumber(data.clientVatNumber);
      if (data.items) {
        const totals = computeInvoiceTotals(data.items, !!inv.vatEnabled, inv.vatRate ?? 0);
        Object.assign(content, totals);
        await storage.replaceInvoiceItems(id, itemRows(id, data.items) as any);
      }
      if (Object.keys(content).length) await storage.updateInvoice(id, content as any);
    }

    const tracking: Record<string, unknown> = {};
    if (data.paymentMethod !== undefined) tracking.paymentMethod = data.paymentMethod;
    if (data.paidAt !== undefined) tracking.paidAt = data.paidAt;
    if (data.dueDate !== undefined) tracking.dueDate = data.dueDate;
    if (data.notes !== undefined) tracking.notes = data.notes;

    let updated: Invoice | undefined;
    const issuing = inv.docType !== "devis" && inv.status === "draft"
      && (data.status === "issued" || data.status === "sent" || data.status === "paid");
    if (issuing) {
      const fresh = (await storage.getInvoice(id))!;
      updated = await issueDraft(fresh, req.userId!, data.status as "issued" | "sent" | "paid", tracking);
    } else {
      if (data.status !== undefined) tracking.status = data.status;
      // Devis : décision saisie par la praticienne (accord oral, email…) ou devis rouvert.
      if (inv.docType === "devis" && data.status && data.status !== inv.status) {
        if (data.status === "accepted" || data.status === "refused") {
          Object.assign(tracking, { quoteDecidedAt: Date.now(), quoteSignerName: null, quoteDecisionNote: null });
        } else if (data.status === "sent") {
          Object.assign(tracking, { quoteDecidedAt: null, quoteSignerName: null, quoteDecisionNote: null });
        }
      }
      // Auto-set paidAt si le statut passe à « payé » sans date
      if (data.status === "paid" && !inv.paidAt && data.paidAt === undefined) tracking.paidAt = Date.now();
      updated = Object.keys(tracking).length ? await storage.updateInvoice(id, tracking as any) : await storage.getInvoice(id);
    }
    if (!updated) return res.status(404).json({ message: "Introuvable" });
    if (updated.status === "paid" && updated.einvoiceExternalId && !updated.einvoicePaidReportedAt) {
      // Statut « Encaissée » transmis à la plateforme agréée ; un échec n'empêche pas
      // d'enregistrer le règlement (nouvel essai au prochain enregistrement).
      await reportPaymentIfTransmitted(updated).catch((e) => console.error("[einvoicing] encaissement :", e?.message || e));
      updated = (await storage.getInvoice(id)) ?? updated;
    }
    const items = await storage.getInvoiceItems(id);
    res.json({ ...updated, items });
  });

  // DELETE /api/invoices/:id
  app.delete("/api/invoices/:id", requireAuth, async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const inv = await storage.getInvoice(id);
    if (!inv || inv.userId !== req.userId) return res.status(404).json({ message: "Introuvable" });
    // Une facture émise ne se supprime pas : elle porte un numéro de la séquence légale.
    // On l'annule (statut « cancelled ») ou on émet un avoir. Un brouillon, lui, n'a
    // jamais reçu de numéro légal : le supprimer ne crée aucun trou.
    if (inv.status !== "draft") {
      return res.status(409).json({
        message: "Une facture émise ne peut pas être supprimée. Créez un avoir pour l'annuler tout en conservant sa trace comptable.",
      });
    }
    await storage.deleteInvoice(id);
    res.json({ ok: true });
  });

  // GET /api/invoices/:id/pdf — Factur-X (PDF/A-3 + XML) pour un document émis
  app.get("/api/invoices/:id/pdf", requireAuth, async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const inv = await storage.getInvoice(id);
    if (!inv || inv.userId !== req.userId) return res.status(404).json({ message: "Introuvable" });
    const items = await storage.getInvoiceItems(id);
    let snapshot = parseSnapshot(inv);
    if (inv.status === "draft") {
      const user = await storage.getUserById(req.userId!);
      if (user) snapshot = buildPractitionerSnapshot(user);
    }
    try {
      const pdf = await generateInvoicePdf(inv, items, snapshot, await creditedOf(inv));
      const name = inv.status === "draft" && inv.docType !== "devis" ? `brouillon-${inv.id}` : inv.number;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${name}.pdf"`);
      res.send(pdf);
    } catch (e: any) {
      console.error("[invoice pdf]", e?.message || e);
      res.status(500).json({ message: "Erreur génération PDF" });
    }
  });

  // GET /api/invoices/:id/facturx.xml — XML CII seul (logiciel comptable, plateforme)
  app.get("/api/invoices/:id/facturx.xml", requireAuth, async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const inv = await storage.getInvoice(id);
    if (!inv || inv.userId !== req.userId) return res.status(404).json({ message: "Introuvable" });
    if (inv.docType === "devis" || inv.status === "draft") {
      return res.status(409).json({ message: "Le XML Factur-X n'existe que pour une facture ou un avoir émis." });
    }
    const items = await storage.getInvoiceItems(id);
    const xml = generateFacturxXml(inv, items, parseSnapshot(inv), await creditedOf(inv));
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${inv.number}.xml"`);
    res.send(xml);
  });

  // POST /api/invoices/:id/send  (envoi par email, PDF Factur-X en pièce jointe ;
  // un brouillon est d'abord émis)
  app.post("/api/invoices/:id/send", requireAuth, async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    let inv = await storage.getInvoice(id);
    if (!inv || inv.userId !== req.userId) return res.status(404).json({ message: "Introuvable" });
    if (!inv.clientEmail) return res.status(400).json({ message: "Email du client manquant" });
    const user = await storage.getUserById(req.userId!);
    const cfg = user ? getEmailConfigForUser(user) : null;
    if (!cfg) return res.status(400).json({ message: "Configuration email manquante (clé Resend + adresse expéditeur)" });
    try {
      if (inv.status === "draft" && inv.docType !== "devis") {
        const items = await storage.getInvoiceItems(id);
        if (!items.length || items.every((i) => !i.totalCents)) {
          return res.status(400).json({ message: "Ajoutez au moins une ligne d'un montant positif avant d'envoyer." });
        }
        inv = (await issueDraft(inv, req.userId!, "issued"))!;
      }
      const items = await storage.getInvoiceItems(id);
      const snapshot = inv.docType === "devis" && inv.status === "draft" && user ? buildPractitionerSnapshot(user) : parseSnapshot(inv);
      const pdf = await generateInvoicePdf(inv, items, snapshot, await creditedOf(inv));
      // Lot 2b — lien public : un devis s'accepte en ligne ; une facture se règle par
      // carte si la praticienne a branché Stripe.
      let action: { url: string; label: string } | null = null;
      if (inv.docType === "devis" && inv.status !== "cancelled") {
        action = { url: publicDocumentUrl(await storage.ensureInvoicePublicToken(id)), label: "Consulter et accepter le devis" };
      } else if (invoicePayable(inv) && (user as any)?.stripeSecretKey) {
        action = { url: publicDocumentUrl(await storage.ensureInvoicePublicToken(id)), label: "Régler en ligne" };
      }
      const email = renderInvoiceEmail({
        invoiceNumber: inv.number,
        clientFirstName: inv.clientFirstName || "",
        practitionerName: snapshot.companyName || user?.name || "votre praticienne",
        totalCents: inv.totalCents,
        notes: inv.notes,
        isDevis: inv.docType === "devis",
        isAvoir: inv.docType === "avoir",
        actionUrl: action?.url ?? null,
        actionLabel: action?.label ?? null,
      });
      const r = await sendEmail(cfg, inv.clientEmail!, email.subject, email.html, email.text, [{
        filename: `${inv.number}.pdf`,
        content: pdf,
        contentType: "application/pdf",
      }]);
      if (!r.ok) return res.status(502).json({ message: r.error || "Erreur envoi" });
      const patch: any = { sentAt: Date.now() };
      if (inv.status === "draft" || inv.status === "issued") patch.status = "sent";
      const updated = await storage.updateInvoice(id, patch);
      res.json({ ok: true, invoice: updated });
    } catch (e: any) {
      console.error("[invoice send]", e?.message || e);
      res.status(500).json({ message: e?.message || "Erreur envoi facture" });
    }
  });
}
