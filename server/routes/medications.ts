/**
 * server/routes/medications.ts — recherche dans la base publique des médicaments.
 *
 * GET  /api/medications?q=          recherche (praticienne connectée)
 * POST /api/admin/bdpm/refresh      rechargement immédiat du fichier ANSM (admin)
 *
 * La source et la date de mise à jour accompagnent chaque réponse : la Licence
 * ouverte demande de les citer.
 */
import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, requireAdmin, type AuthedRequest } from "../auth";
import { normalizeSearch, refreshBdpmIfStale } from "../bdpm";

export function registerMedicationRoutes(app: Express): void {
  app.get("/api/medications", requireAuth, async (req: AuthedRequest, res) => {
    const q = normalizeSearch(String(req.query.q || "")).slice(0, 80);
    const updatedAt = await storage.lastMedicationsUpdate();
    if (q.length < 2) return res.json({ results: [], source: { label: "BDPM (ANSM)", updatedAt } });
    const rows = await storage.searchMedications(q.split(" "), 15);
    res.json({
      results: rows.map((m) => ({ cis: m.cis, name: m.name, form: m.form, routes: m.routes, holder: m.holder, commercialized: m.commercialized })),
      source: { label: "BDPM (ANSM)", updatedAt },
    });
  });

  app.post("/api/admin/bdpm/refresh", requireAuth, requireAdmin, async (_req: AuthedRequest, res) => {
    try {
      res.json(await refreshBdpmIfStale(true));
    } catch (e: any) {
      console.error("[bdpm]", e?.message || e);
      res.status(502).json({ message: e?.message || "Téléchargement de la BDPM impossible" });
    }
  });
}
