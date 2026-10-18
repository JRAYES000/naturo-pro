/**
 * server/routes/referral.ts — parrainage entre praticiennes (lot 3c, parité naturooo).
 *
 * GET /api/referral                 code et lien personnels, consœurs parrainées
 * GET /api/public/referral/:code    prénom et initiale de la marraine (page d'inscription)
 *
 * Le lien /inscription?parrain=CODE rattache le nouveau compte à sa marraine
 * (users.referred_by_user_id). La récompense (mois offert…) reste à décider :
 * referral_rewarded_at est prévu pour la tracer.
 */
import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, type AuthedRequest } from "../auth";
import { hasFullAccess } from "@shared/plan-access";

/** « Marie Dupont » → « Marie D. » : assez pour reconnaître, sans exposer le nom complet. */
export function shortName(name: string | null | undefined): string {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "Une praticienne";
  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

export function referralStatus(u: { plan: string | null; trialEndsAt: number | null }): "abonnée" | "en essai" | "compte gratuit" {
  if (u.plan === "active") return "abonnée";
  return hasFullAccess(u) ? "en essai" : "compte gratuit";
}

export function registerReferralRoutes(app: Express): void {
  app.get("/api/referral", requireAuth, async (req: AuthedRequest, res) => {
    const code = await storage.ensureReferralCode(req.userId!);
    const appUrl = process.env.APP_URL || "https://app.ecole-naturo.fr";
    const filleules = await storage.listReferredUsers(req.userId!);
    res.json({
      code,
      link: `${appUrl}/inscription?parrain=${code}`,
      referrals: filleules.map((u: any) => ({ name: shortName(u.name), createdAt: u.createdAt, status: referralStatus(u), rewarded: !!u.referralRewardedAt })),
    });
  });

  app.get("/api/public/referral/:code", async (req, res) => {
    const code = String(req.params.code || "");
    if (!/^[A-Za-z0-9]{4,16}$/.test(code)) return res.status(404).json({ message: "Code inconnu" });
    const u = await storage.getUserByReferralCode(code);
    if (!u) return res.status(404).json({ message: "Code inconnu" });
    res.json({ name: shortName(u.name) });
  });
}
