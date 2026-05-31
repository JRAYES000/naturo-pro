/**
 * server/routes/email-templates.ts — domaine Email templates (Phase 3.5-C)
 *
 * Extrait de server/routes.ts (Phase 4.0 — split par domaine). Handlers verbatim,
 * comportement strictement identique. Les 3 "kinds" (confirmation, reminder_d1,
 * cancellation) sont éditables en DB par l'utilisateur, avec fallback sur
 * getDefaultTemplate(kind). Aucun seed au démarrage : les défauts sont lus à la volée.
 *
 * NB : routes.ts importait defaults/render en lazy `await import` "pour éviter les
 * deps circulaires" — ces deux modules sont des feuilles sans imports, donc aucun
 * cycle réel. On repasse en imports statiques (register reste synchrone).
 */

import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { requireAuth, type AuthedRequest } from "../auth";
import { formatRdvTime } from "../email";
import { getDefaultTemplate } from "../email-templates/defaults";
import { renderTemplate } from "../email-templates/render";

const VALID_KINDS = ["confirmation", "reminder_d1", "cancellation"] as const;
type ValidKind = typeof VALID_KINDS[number];

function isValidKind(k: unknown): k is ValidKind {
  return typeof k === "string" && (VALID_KINDS as readonly string[]).includes(k);
}

export function registerEmailTemplateRoutes(app: Express): void {
  /**
   * GET /api/email-templates
   * Retourne les 3 templates (custom ou défaut) pour l'utilisateur connecté.
   */
  app.get("/api/email-templates", requireAuth, async (req: AuthedRequest, res) => {
    try {
      const userId = req.userId!;
      const saved = await storage.listEmailTemplates(userId);
      const byKind: Record<string, any> = {};
      for (const t of saved) byKind[t.kind] = t;

      const result = VALID_KINDS.map((kind) => {
        if (byKind[kind]) return byKind[kind];
        const def = getDefaultTemplate(kind);
        return { id: null, userId, kind, subject: def.subject, bodyHtml: def.bodyHtml, updatedAt: null, isDefault: true };
      });
      res.json(result);
    } catch (e: any) {
      console.error("[email-templates GET list]", e);
      res.status(500).json({ message: "Erreur serveur" });
    }
  });

  /**
   * GET /api/email-templates/:kind
   * Retourne un template spécifique (custom ou défaut).
   */
  app.get("/api/email-templates/:kind", requireAuth, async (req: AuthedRequest, res) => {
    try {
      const kind = req.params.kind;
      if (!isValidKind(kind)) return res.status(400).json({ message: "kind invalide (confirmation|reminder_d1|cancellation)" });
      const userId = req.userId!;
      const saved = await storage.getEmailTemplate(userId, kind);
      if (saved) return res.json(saved);
      const def = getDefaultTemplate(kind);
      return res.json({ id: null, userId, kind, subject: def.subject, bodyHtml: def.bodyHtml, updatedAt: null, isDefault: true });
    } catch (e: any) {
      console.error("[email-templates GET :kind]", e);
      res.status(500).json({ message: "Erreur serveur" });
    }
  });

  /**
   * GET /api/email-templates/:kind/default
   * Retourne TOUJOURS le modèle par défaut (fragment), peu importe le custom
   * enregistré. Sert au bouton « Réinitialiser au modèle par défaut ».
   */
  app.get("/api/email-templates/:kind/default", requireAuth, async (req: AuthedRequest, res) => {
    const kind = req.params.kind;
    if (!isValidKind(kind)) return res.status(400).json({ message: "kind invalide" });
    const def = getDefaultTemplate(kind);
    res.json({ subject: def.subject, bodyHtml: def.bodyHtml });
  });

  /**
   * PUT /api/email-templates/:kind
   * Upsert (crée ou met à jour) un template pour l'utilisateur connecté.
   * Body: { subject: string, bodyHtml: string }
   */
  app.put("/api/email-templates/:kind", requireAuth, async (req: AuthedRequest, res) => {
    try {
      const kind = req.params.kind;
      if (!isValidKind(kind)) return res.status(400).json({ message: "kind invalide (confirmation|reminder_d1|cancellation)" });
      const schema = z.object({
        subject: z.string().min(1).max(500),
        bodyHtml: z.string().min(1),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Données invalides", errors: parsed.error.flatten() });
      const result = await storage.upsertEmailTemplate(req.userId!, kind, parsed.data);
      res.json(result);
    } catch (e: any) {
      console.error("[email-templates PUT]", e);
      res.status(500).json({ message: "Erreur serveur" });
    }
  });

  /**
   * POST /api/email-templates/:kind/preview
   * Retourne le template interpolé avec un vrai RDV ou des données fictives.
   * Body: { appointmentId?: number }
   * Response: { subject: string, html: string }
   */
  app.post("/api/email-templates/:kind/preview", requireAuth, async (req: AuthedRequest, res) => {
    try {
      const kind = req.params.kind;
      if (!isValidKind(kind)) return res.status(400).json({ message: "kind invalide" });
      const userId = req.userId!;
      const user = await storage.getUserById(userId);
      if (!user) return res.status(401).json({ message: "Non autorisé" });

      // Si le client fournit un brouillon (subject/bodyHtml), on prévisualise
      // CELUI-CI (modifications en cours, non encore enregistrées). Sinon, on
      // retombe sur le template sauvé, puis le défaut.
      const draftSubject = typeof req.body?.subject === "string" ? req.body.subject : null;
      const draftBody = typeof req.body?.bodyHtml === "string" ? req.body.bodyHtml : null;
      const saved = await storage.getEmailTemplate(userId, kind);
      const template = (draftSubject !== null && draftBody !== null)
        ? { subject: draftSubject, bodyHtml: draftBody }
        : saved ?? {
            subject: getDefaultTemplate(kind).subject,
            bodyHtml: getDefaultTemplate(kind).bodyHtml,
          };

      // Données fictives par défaut
      let vars: Parameters<typeof renderTemplate>[1] = {
        "client.name": "Marie Dupont",
        "client.email": "marie@exemple.fr",
        "appointment.date": "samedi 9 mai 2026",
        "appointment.time": "14h00",
        "appointment.duration": "60 min",
        "appointment.category": "Consultation naturopathie",
        "appointment.address": user.address ? `${user.address}, ${user.city || ""}`.trim().replace(/,$/, "") : "",
        "practitioner.name": user.name,
        "practitioner.email": user.email,
        "cancelLink": "https://exemple.fr/annuler/XXXXX",
      };

      // Si un appointmentId est fourni, on essaie de charger le vrai RDV
      const { appointmentId } = req.body || {};
      if (appointmentId && typeof appointmentId === "number") {
        const appt = await storage.getAppointment(appointmentId);
        if (appt && (appt as any).userId === userId) {
          const cat = appt.categoryId ? await storage.getCategory(appt.categoryId) : null;
          const client = appt.clientId ? await storage.getClient(appt.clientId) : null;
          const dateText = new Intl.DateTimeFormat("fr-FR", {
            timeZone: "Europe/Paris",
            weekday: "long", day: "numeric", month: "long", year: "numeric",
          }).format(new Date(appt.startAt));
          const timeText = formatRdvTime(appt.startAt);
          const durationMin = cat?.durationMinutes
            ? `${cat.durationMinutes} min`
            : appt.endAt && appt.startAt ? `${Math.round((appt.endAt - appt.startAt) / 60000)} min` : "";
          vars = {
            "client.name": client ? `${client.firstName} ${client.lastName}` : (appt.clientFirstName ? `${appt.clientFirstName} ${appt.clientLastName || ""}`.trim() : "Marie Dupont"),
            "client.email": client?.email || appt.clientEmail || "marie@exemple.fr",
            "appointment.date": dateText,
            "appointment.time": timeText,
            "appointment.duration": durationMin,
            "appointment.category": cat?.name || "",
            "appointment.address": appt.location || (user.address ? `${user.address}, ${user.city || ""}`.trim().replace(/,$/, "") : ""),
            "practitioner.name": user.name,
            "practitioner.email": user.email,
            "cancelLink": (appt as any).cancelToken ? `${req.protocol}://${req.get("host")}/api/public/cancel/${(appt as any).cancelToken}` : "https://exemple.fr/annuler/TOKEN",
          };
        }
      }

      const rendered = renderTemplate(template, vars);
      res.json(rendered);
    } catch (e: any) {
      console.error("[email-templates preview]", e);
      res.status(500).json({ message: "Erreur serveur" });
    }
  });
}
