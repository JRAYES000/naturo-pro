/**
 * server/routes/stats.ts — Statistiques & exports comptables (lecture seule)
 *
 * GET /api/stats/overview?from=&to=   — KPIs agrégés sur la période
 * GET /api/stats/recettes.csv?from=&to= — journal des recettes au format CSV
 *
 * Toutes les données sont calculées à partir des méthodes storage existantes :
 *   - storage.listInvoices      → CA encaissé, CA prévu, top prestations
 *   - storage.listAppointments  → nb RDV, nb annulés
 *   - storage.listCategories    → noms de prestations
 *
 * Aucune nouvelle table, aucune requête Drizzle directe.
 */

import type { Express } from "express";
import { requireAuth, type AuthedRequest } from "../auth";
import { storage } from "../storage";

/** Début du mois courant en ms (minuit UTC). */
function startOfCurrentMonthMs(): number {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

/** Fin du mois courant en ms (dernier instant UTC). */
function endOfCurrentMonthMs(): number {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() + 1, 1);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime() - 1;
}

/** Échappe un champ CSV : entoure de guillemets si nécessaire. */
function csvField(value: string | null | undefined): string {
  const v = value == null ? "" : String(value);
  // Si le champ contient guillemets, virgules, ou sauts de ligne : entourer + doubler les "
  if (v.includes('"') || v.includes(",") || v.includes("\n") || v.includes("\r")) {
    return '"' + v.replace(/"/g, '""') + '"';
  }
  return v;
}

/** Formate un timestamp ms en date locale FR "JJ/MM/AAAA". */
function fmtDate(ms: number | null | undefined): string {
  if (!ms) return "";
  return new Date(ms).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function registerStatsRoutes(app: Express): void {
  // ── GET /api/stats/overview ──────────────────────────────────────────────
  app.get("/api/stats/overview", requireAuth, async (req: AuthedRequest, res) => {
    const from = req.query.from ? Number(req.query.from) : startOfCurrentMonthMs();
    const to = req.query.to ? Number(req.query.to) : endOfCurrentMonthMs();

    try {
      // Factures sur la période (filtre par issueDate via opts.from / opts.to)
      const invoices = await storage.listInvoices(req.userId!, { from, to });

      const caEncaisseCents = invoices
        .filter((i) => i.status === "paid")
        .reduce((s, i) => s + (i.totalCents || 0), 0);

      const caPrevuCents = invoices
        .filter((i) => i.status === "sent" || i.status === "draft")
        .reduce((s, i) => s + (i.totalCents || 0), 0);

      // RDV sur la période
      const appts = await storage.listAppointments(req.userId!, from, to);
      const nbRdv = appts.filter((a) => a.status !== "cancelled" && a.status !== "blocked").length;
      const nbRdvAnnules = appts.filter((a) => a.status === "cancelled").length;

      // Top prestations depuis les RDV (categoryId → nom)
      const cats = await storage.listCategories(req.userId!);
      const catMap = new Map<number, string>();
      for (const c of cats) catMap.set(c.id, c.name);

      // Comptage par catégorie (ignore RDV bloqués/annulés)
      const countByCat = new Map<number, number>();
      for (const a of appts) {
        if (a.status === "cancelled" || a.status === "blocked") continue;
        const catId = a.categoryId;
        if (!catId) continue;
        countByCat.set(catId, (countByCat.get(catId) || 0) + 1);
      }

      // Enrichir avec le CA des factures payées liées aux RDV de chaque catégorie
      const invByCatId = new Map<number, number>(); // catId → CA encaissé cumulé
      for (const inv of invoices) {
        if (inv.status !== "paid") continue;
        if (!inv.appointmentId) continue;
        const appt = appts.find((a) => a.id === inv.appointmentId);
        if (!appt?.categoryId) continue;
        invByCatId.set(appt.categoryId, (invByCatId.get(appt.categoryId) || 0) + (inv.totalCents || 0));
      }

      const topPrestations = Array.from(countByCat.entries())
        .map(([catId, count]) => ({
          name: catMap.get(catId) || `Prestation #${catId}`,
          count,
          caCents: invByCatId.get(catId) || 0,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      res.json({
        caEncaisseCents,
        caPrevuCents,
        nbRdv,
        nbRdvAnnules,
        topPrestations,
      });
    } catch (e: any) {
      console.error("[stats/overview]", e?.message || e);
      res.status(500).json({ message: "Erreur calcul statistiques" });
    }
  });

  // ── GET /api/stats/recettes.csv ──────────────────────────────────────────
  app.get("/api/stats/recettes.csv", requireAuth, async (req: AuthedRequest, res) => {
    const from = req.query.from ? Number(req.query.from) : startOfCurrentMonthMs();
    const to = req.query.to ? Number(req.query.to) : endOfCurrentMonthMs();

    try {
      const invoices = await storage.listInvoices(req.userId!, { from, to });

      const STATUS_LABELS: Record<string, string> = {
        draft: "Brouillon",
        sent: "Envoyée",
        paid: "Payée",
        cancelled: "Annulée",
      };

      const header = ["Date", "Numéro", "Client", "Montant (€)", "Statut"];
      const rows = invoices.map((inv) => {
        const clientName = `${inv.clientFirstName || ""} ${inv.clientLastName || ""}`.trim() || "";
        const montant = inv.totalCents != null ? (inv.totalCents / 100).toFixed(2) : "0.00";
        const statut = STATUS_LABELS[inv.status] || inv.status;
        return [
          csvField(fmtDate(inv.issueDate)),
          csvField(inv.number),
          csvField(clientName),
          csvField(montant),
          csvField(statut),
        ].join(",");
      });

      const csv = [header.map(csvField).join(","), ...rows].join("\r\n");

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="recettes.csv"');
      // BOM UTF-8 pour ouverture correcte dans Excel / LibreOffice
      res.send("﻿" + csv);
    } catch (e: any) {
      console.error("[stats/recettes.csv]", e?.message || e);
      res.status(500).json({ message: "Erreur export CSV" });
    }
  });
}
