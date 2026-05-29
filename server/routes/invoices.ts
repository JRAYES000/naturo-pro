/**
 * server/routes/invoices.ts — domaine Invoices (Phase 1 facturation)
 *
 * Extrait de server/routes.ts (Phase 4.0 — split par domaine). Handlers verbatim,
 * comportement strictement identique. CRUD facture + PDF + envoi email.
 *
 * ⚠️ GET /api/invoices/:id/pdf stream du binaire (Content-Type application/pdf via
 * res.send(buffer)) — handler conservé tel quel, ne pas toucher au streaming.
 *
 * Imports : lib ../invoices (calculs + génération PDF + rendu email), helpers
 * createInvoiceFromAppointment (pré-remplissage depuis RDV) et getEmailConfigForUser.
 */

import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { requireAuth, type AuthedRequest } from "../auth";
import { sendEmail } from "../email";
import {
  computeInvoiceTotals, computeItemTotal, buildPractitionerSnapshot,
  buildInvoiceNumber, getYearFromMs, generateInvoicePdf, renderInvoiceEmail,
  type PractitionerSnapshot,
} from "../invoices";
import { createInvoiceFromAppointment } from "./helpers/invoices";
import { getEmailConfigForUser } from "./helpers/email-sending";

export function registerInvoiceRoutes(app: Express): void {
  // Helper interne : créer une facture à partir d'un RDV (utilisé par auto-hook + endpoint manuel)
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

  // GET /api/invoices/:id
  app.get("/api/invoices/:id", requireAuth, async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const inv = await storage.getInvoice(id);
    if (!inv || inv.userId !== req.userId) return res.status(404).json({ message: "Introuvable" });
    const items = await storage.getInvoiceItems(id);
    res.json({ ...inv, items });
  });

  // POST /api/invoices  (création manuelle libre)
  const invoiceItemSchema = z.object({
    description: z.string().min(1),
    quantity: z.number().min(0).default(1),
    unitPriceCents: z.number().int().nonnegative().default(0),
  });
  const invoiceCreateSchema = z.object({
    clientId: z.number().int().positive().nullable().optional(),
    appointmentId: z.number().int().positive().nullable().optional(),
    clientFirstName: z.string().optional(),
    clientLastName: z.string().optional(),
    clientEmail: z.string().optional(),
    clientAddress: z.string().nullable().optional(),
    clientPostalCode: z.string().nullable().optional(),
    clientCity: z.string().nullable().optional(),
    issueDate: z.number().optional(),
    dueDate: z.number().nullable().optional(),
    notes: z.string().nullable().optional(),
    items: z.array(invoiceItemSchema).min(1),
  });
  app.post("/api/invoices", requireAuth, async (req: AuthedRequest, res) => {
    const parsed = invoiceCreateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Données invalides", errors: parsed.error.flatten() });
    const data = parsed.data;
    const user = await storage.getUserById(req.userId!);
    if (!user) return res.status(401).json({ message: "Non authentifié" });

    let clientFirstName = data.clientFirstName || "";
    let clientLastName = data.clientLastName || "";
    let clientEmail = data.clientEmail || "";
    let clientAddress = data.clientAddress ?? null;
    let clientPostalCode = data.clientPostalCode ?? null;
    let clientCity = data.clientCity ?? null;
    if (data.clientId) {
      const c = await storage.getClient(data.clientId);
      if (c && c.userId === req.userId) {
        clientFirstName = clientFirstName || c.firstName || "";
        clientLastName = clientLastName || c.lastName || "";
        clientEmail = clientEmail || c.email || "";
        clientAddress = clientAddress ?? ((c as any).address || null);
        clientPostalCode = clientPostalCode ?? ((c as any).postalCode || null);
        clientCity = clientCity ?? ((c as any).city || null);
      }
    }

    const vatEnabled = !!user.billingVatEnabled;
    const vatRate = user.billingVatRate ?? 2000;
    const totals = computeInvoiceTotals(data.items, vatEnabled, vatRate);
    const issueDate = data.issueDate || Date.now();
    const year = getYearFromMs(issueDate);
    const counter = await storage.nextInvoiceCounter(req.userId!, year);
    const number = buildInvoiceNumber(year, counter);
    const snapshot = buildPractitionerSnapshot(user);

    const inv = await storage.createInvoice({
      userId: req.userId!,
      number,
      status: "draft",
      issueDate,
      dueDate: data.dueDate ?? null,
      appointmentId: data.appointmentId ?? null,
      clientId: data.clientId ?? null,
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
      notes: data.notes ?? null,
      practitionerSnapshot: JSON.stringify(snapshot),
      createdAt: issueDate,
      updatedAt: issueDate,
    } as any);

    await storage.replaceInvoiceItems(inv.id, data.items.map((it, i) => ({
      invoiceId: inv.id,
      position: i,
      description: it.description,
      quantity: it.quantity,
      unitPriceCents: it.unitPriceCents,
      totalCents: computeItemTotal(it.quantity, it.unitPriceCents),
    })) as any);

    const items = await storage.getInvoiceItems(inv.id);
    res.status(201).json({ ...inv, items });
  });

  // POST /api/invoices/from-appointment/:id  (création pré-remplie depuis un RDV)
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

  // PATCH /api/invoices/:id  (statut, paiement, lignes, notes)
  const invoicePatchSchema = z.object({
    status: z.enum(["draft", "sent", "paid", "cancelled"]).optional(),
    paymentMethod: z.enum(["cash", "check", "transfer", "card"]).nullable().optional(),
    paidAt: z.number().nullable().optional(),
    dueDate: z.number().nullable().optional(),
    notes: z.string().nullable().optional(),
    items: z.array(invoiceItemSchema).optional(),
    clientFirstName: z.string().optional(),
    clientLastName: z.string().optional(),
    clientEmail: z.string().optional(),
    clientAddress: z.string().nullable().optional(),
    clientPostalCode: z.string().nullable().optional(),
    clientCity: z.string().nullable().optional(),
  });
  app.patch("/api/invoices/:id", requireAuth, async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const inv = await storage.getInvoice(id);
    if (!inv || inv.userId !== req.userId) return res.status(404).json({ message: "Introuvable" });
    const parsed = invoicePatchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Données invalides", errors: parsed.error.flatten() });
    const data = parsed.data;
    const patch: any = {};
    if (data.status !== undefined) patch.status = data.status;
    if (data.paymentMethod !== undefined) patch.paymentMethod = data.paymentMethod;
    if (data.paidAt !== undefined) patch.paidAt = data.paidAt;
    if (data.dueDate !== undefined) patch.dueDate = data.dueDate;
    if (data.notes !== undefined) patch.notes = data.notes;
    if (data.clientFirstName !== undefined) patch.clientFirstName = data.clientFirstName;
    if (data.clientLastName !== undefined) patch.clientLastName = data.clientLastName;
    if (data.clientEmail !== undefined) patch.clientEmail = data.clientEmail;
    if (data.clientAddress !== undefined) patch.clientAddress = data.clientAddress;
    if (data.clientPostalCode !== undefined) patch.clientPostalCode = data.clientPostalCode;
    if (data.clientCity !== undefined) patch.clientCity = data.clientCity;

    // Auto-set paidAt si status passe à paid sans date
    if (data.status === "paid" && !inv.paidAt && data.paidAt === undefined) {
      patch.paidAt = Date.now();
    }

    // Si lignes mises à jour, recalculer totaux
    if (data.items) {
      const totals = computeInvoiceTotals(data.items, !!inv.vatEnabled, inv.vatRate ?? 0);
      patch.subtotalCents = totals.subtotalCents;
      patch.vatCents = totals.vatCents;
      patch.totalCents = totals.totalCents;
      await storage.replaceInvoiceItems(id, data.items.map((it, i) => ({
        invoiceId: id,
        position: i,
        description: it.description,
        quantity: it.quantity,
        unitPriceCents: it.unitPriceCents,
        totalCents: computeItemTotal(it.quantity, it.unitPriceCents),
      })) as any);
    }
    const updated = await storage.updateInvoice(id, patch);
    if (!updated) return res.status(404).json({ message: "Introuvable" });
    const items = await storage.getInvoiceItems(id);
    res.json({ ...updated, items });
  });

  // DELETE /api/invoices/:id
  app.delete("/api/invoices/:id", requireAuth, async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const inv = await storage.getInvoice(id);
    if (!inv || inv.userId !== req.userId) return res.status(404).json({ message: "Introuvable" });
    await storage.deleteInvoice(id);
    res.json({ ok: true });
  });

  // GET /api/invoices/:id/pdf
  app.get("/api/invoices/:id/pdf", requireAuth, async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const inv = await storage.getInvoice(id);
    if (!inv || inv.userId !== req.userId) return res.status(404).json({ message: "Introuvable" });
    const items = await storage.getInvoiceItems(id);
    let snapshot: PractitionerSnapshot;
    try {
      snapshot = JSON.parse(inv.practitionerSnapshot || "{}");
    } catch {
      snapshot = {} as any;
    }
    try {
      const pdf = await generateInvoicePdf(inv as any, items as any, snapshot);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${inv.number}.pdf"`);
      res.send(pdf);
    } catch (e: any) {
      console.error("[invoice pdf]", e?.message || e);
      res.status(500).json({ message: "Erreur génération PDF" });
    }
  });

  // POST /api/invoices/:id/send  (envoi par email avec PDF en pièce jointe)
  app.post("/api/invoices/:id/send", requireAuth, async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const inv = await storage.getInvoice(id);
    if (!inv || inv.userId !== req.userId) return res.status(404).json({ message: "Introuvable" });
    if (!inv.clientEmail) return res.status(400).json({ message: "Email du client manquant" });
    const user = await storage.getUserById(req.userId!);
    const cfg = user ? getEmailConfigForUser(user) : null;
    if (!cfg) return res.status(400).json({ message: "Configuration email manquante (clé Resend + adresse expéditeur)" });
    const items = await storage.getInvoiceItems(id);
    let snapshot: PractitionerSnapshot;
    try {
      snapshot = JSON.parse(inv.practitionerSnapshot || "{}");
    } catch {
      snapshot = {} as any;
    }
    try {
      const pdf = await generateInvoicePdf(inv as any, items as any, snapshot);
      const email = renderInvoiceEmail({
        invoiceNumber: inv.number,
        clientFirstName: inv.clientFirstName || "",
        practitionerName: snapshot.companyName || user?.name || "votre praticienne",
        totalCents: inv.totalCents,
        notes: inv.notes,
      });
      const r = await sendEmail(cfg, inv.clientEmail, email.subject, email.html, email.text, [{
        filename: `${inv.number}.pdf`,
        content: pdf,
        contentType: "application/pdf",
      }]);
      if (!r.ok) return res.status(502).json({ message: r.error || "Erreur envoi" });
      const patch: any = { sentAt: Date.now() };
      if (inv.status === "draft") patch.status = "sent";
      const updated = await storage.updateInvoice(id, patch);
      res.json({ ok: true, invoice: updated });
    } catch (e: any) {
      console.error("[invoice send]", e?.message || e);
      res.status(500).json({ message: e?.message || "Erreur envoi facture" });
    }
  });
}
