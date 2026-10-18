/**
 * server/routes/stats.ts — Statistiques & exports comptables (lecture seule)
 *
 * GET /api/stats/overview?from=&to=   — KPIs agrégés sur la période
 * GET /api/stats/recettes.csv?from=&to= — livre des recettes (encaissements) en CSV
 * GET /api/stats/ventes.csv?from=&to=   — journal des factures émises en CSV
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
import { signedTotalCents, isProvisionalNumber } from "../einvoicing/document";
import { paymentMethodLabel } from "../invoices";

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
      // Factures sur la période (filtre par issueDate via opts.from / opts.to).
      // Les devis (Lot 4) n'ont pas de valeur comptable : exclus de tous les KPIs.
      const invoices = (await storage.listInvoices(req.userId!, { from, to }))
        .filter((i) => (i as any).docType !== "devis");

      // Un avoir vient en déduction (montant positif en base, signé ici).
      const caEncaisseCents = invoices
        .filter((i) => i.status === "paid")
        .reduce((s, i) => s + signedTotalCents(i), 0);

      // Émises et non réglées. Un brouillon n'est pas encore une facture : il n'entre
      // pas dans le prévisionnel (un brouillon d'avoir le rendait même négatif).
      const caPrevuCents = invoices
        .filter((i) => i.status === "issued" || i.status === "sent")
        .reduce((s, i) => s + signedTotalCents(i), 0);

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
      // Perf (audit D, 30/07) : `appts.find(...)` dans cette boucle refaisait un scan
      // linéaire de TOUS les RDV de la période pour CHAQUE facture payée liée à un RDV
      // — un balayage O(factures × RDV). Sur un praticien avec plusieurs années
      // d'historique (factures ET RDV en volume), ce coût croît en carré. Un index
      // Map construit une seule fois ramène le lookup à O(1) par facture.
      const apptById = new Map(appts.map((a) => [a.id, a]));
      const invByCatId = new Map<number, number>(); // catId → CA encaissé cumulé
      for (const inv of invoices) {
        if (inv.status !== "paid") continue;
        if (!inv.appointmentId) continue;
        const appt = apptById.get(inv.appointmentId);
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

  // ── GET /api/stats/revenue-monthly ───────────────────────────────────────
  // CA encaissé (factures payées, hors devis) par mois sur 12 mois glissants —
  // alimente le graphique du tableau de bord (Lot 4).
  app.get("/api/stats/revenue-monthly", requireAuth, async (req: AuthedRequest, res) => {
    try {
      const now = new Date();
      const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1);
      const invoices = await storage.listInvoices(req.userId!, { from: start, status: "paid" });
      const byMonth = new Map<string, number>();
      for (let i = 0; i < 12; i++) {
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11 + i, 1));
        byMonth.set(d.toISOString().slice(0, 7), 0);
      }
      for (const inv of invoices) {
        if ((inv as any).docType === "devis") continue;
        const key = new Date(inv.issueDate).toISOString().slice(0, 7);
        if (byMonth.has(key)) byMonth.set(key, (byMonth.get(key) || 0) + signedTotalCents(inv));
      }
      res.json(Array.from(byMonth.entries()).map(([month, caCents]) => ({ month, caCents })));
    } catch (e: any) {
      console.error("[stats/revenue-monthly]", e?.message || e);
      res.status(500).json({ message: "Erreur calcul revenus mensuels" });
    }
  });

  // ── GET /api/stats/recettes.csv — livre des recettes ─────────────────────
  // Obligation du micro-entrepreneur : registre CHRONOLOGIQUE des encaissements
  // (date d'encaissement, référence de la pièce, client, nature, mode de règlement,
  // montant). Il se tient donc par date de PAIEMENT, pas d'émission : une facture
  // de décembre réglée en janvier est une recette de janvier. Un avoir remboursé
  // y figure en négatif.
  app.get("/api/stats/recettes.csv", requireAuth, async (req: AuthedRequest, res) => {
    const from = req.query.from ? Number(req.query.from) : startOfCurrentMonthMs();
    const to = req.query.to ? Number(req.query.to) : endOfCurrentMonthMs();

    try {
      const encaissees = (await storage.listInvoices(req.userId!, { status: "paid" }))
        .filter((i) => (i as any).docType !== "devis" && i.paidAt && i.paidAt >= from && i.paidAt <= to)
        .sort((a, b) => (a.paidAt! - b.paidAt!) || a.id - b.id);

      const NATURE: Record<string, string> = { services: "Prestation de services", goods: "Vente de biens", mixed: "Mixte" };
      const header = ["Date d'encaissement", "Pièce", "Client", "Nature", "Mode de règlement", "Montant (€)"];
      const rows = encaissees.map((inv) => {
        const client = (inv as any).clientCompanyName
          || `${inv.clientFirstName || ""} ${inv.clientLastName || ""}`.trim();
        const piece = `${(inv as any).docType === "avoir" ? "Avoir" : "Facture"} ${inv.number}`;
        return [
          csvField(fmtDate(inv.paidAt)),
          csvField(piece),
          csvField(client),
          csvField(NATURE[(inv as any).operationCategory || "services"] || NATURE.services),
          csvField(paymentMethodLabel(inv.paymentMethod)),
          csvField((signedTotalCents(inv) / 100).toFixed(2)),
        ].join(",");
      });

      const csv = [header.map(csvField).join(","), ...rows].join("\r\n");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="livre-des-recettes.csv"');
      // BOM UTF-8 pour ouverture correcte dans Excel / LibreOffice
      res.send("\uFEFF" + csv);
    } catch (e: any) {
      console.error("[stats/recettes.csv]", e?.message || e);
      res.status(500).json({ message: "Erreur export CSV" });
    }
  });

  // ── GET /api/stats/ventes.csv — journal des factures émises ──────────────
  // Factures et avoirs ÉMIS sur la période (par date d'émission), pour le comptable.
  app.get("/api/stats/ventes.csv", requireAuth, async (req: AuthedRequest, res) => {
    const from = req.query.from ? Number(req.query.from) : startOfCurrentMonthMs();
    const to = req.query.to ? Number(req.query.to) : endOfCurrentMonthMs();

    try {
      const emises = (await storage.listInvoices(req.userId!, { from, to }))
        .filter((i) => (i as any).docType !== "devis" && i.status !== "draft" && !isProvisionalNumber(i.number))
        .sort((a, b) => (a.issueDate - b.issueDate) || a.id - b.id);

      const STATUS_LABELS: Record<string, string> = { issued: "Émise", sent: "Envoyée", paid: "Payée", cancelled: "Annulée" };
      const header = ["Date d'émission", "Numéro", "Type", "Client", "SIREN client", "HT (€)", "TVA (€)", "TTC (€)", "Statut"];
      const rows = emises.map((inv) => {
        const sign = (inv as any).docType === "avoir" ? -1 : 1;
        const client = (inv as any).clientCompanyName
          || `${inv.clientFirstName || ""} ${inv.clientLastName || ""}`.trim();
        return [
          csvField(fmtDate(inv.issueDate)),
          csvField(inv.number),
          csvField((inv as any).docType === "avoir" ? "Avoir" : "Facture"),
          csvField(client),
          csvField((inv as any).clientSiren || ""),
          csvField(((sign * Math.abs(inv.subtotalCents || 0)) / 100).toFixed(2)),
          csvField(((sign * Math.abs(inv.vatCents || 0)) / 100).toFixed(2)),
          csvField(((sign * Math.abs(inv.totalCents || 0)) / 100).toFixed(2)),
          csvField(STATUS_LABELS[inv.status] || inv.status),
        ].join(",");
      });

      const csv = [header.map(csvField).join(","), ...rows].join("\r\n");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="factures-emises.csv"');
      res.send("\uFEFF" + csv);
    } catch (e: any) {
      console.error("[stats/ventes.csv]", e?.message || e);
      res.status(500).json({ message: "Erreur export CSV" });
    }
  });
}
