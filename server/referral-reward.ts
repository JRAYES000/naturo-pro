/**
 * server/referral-reward.ts — récompense du parrainage (décision du 19/10/2026) :
 * quand une filleule s'abonne, la marraine et la filleule reçoivent chacune un mois
 * offert.
 *
 *   - abonnée (plan « active » avec client Stripe) : crédit d'un mois sur son solde
 *     Stripe, imputé sur sa prochaine facture ;
 *   - sinon (essai en cours ou socle gratuit) : 30 jours d'accès complet ajoutés.
 *
 * Une seule fois par filleule : referral_rewarded_at est posé AVANT d'accorder
 * (un webhook Stripe peut être rejoué).
 */
import { storage } from "./storage";
import { sendEmail, getSystemEmailConfig } from "./email";
import { getSubscriptionConfig, createCustomerCredit } from "./stripe-subscription";
import { renderPractitionerNotice } from "./public-documents";

export const REFERRAL_REWARD_DAYS = 30;
/** Prix d'un mois d'abonnement, en centimes (crédit Stripe). */
export const REFERRAL_REWARD_CENTS = Number(process.env.REFERRAL_REWARD_CENTS || 1900);

export type GrantResult = { mode: "credit" | "trial" | "skipped"; until?: number };

type Deps = { credit?: typeof createCustomerCredit; now?: number; sendMail?: boolean };

/** Un mois offert, sous la forme qui convient à la situation de la praticienne. */
export async function grantFreeMonth(user: any, description: string, deps: Deps = {}): Promise<GrantResult> {
  const now = deps.now ?? Date.now();
  if (!user || user.plan === "suspended") return { mode: "skipped" };
  const cfg = getSubscriptionConfig();
  if (user.plan === "active" && user.stripeCustomerId && cfg.secretKey) {
    const r = await (deps.credit ?? createCustomerCredit)({
      secretKey: cfg.secretKey, customerId: user.stripeCustomerId, amountCents: REFERRAL_REWARD_CENTS, description,
    });
    if ("error" in r) throw new Error(`Crédit Stripe refusé : ${r.error}`);
    return { mode: "credit" };
  }
  if (user.plan === "active") return { mode: "skipped" }; // abonnée sans client Stripe : à traiter à la main
  // Essai en cours prolongé, ou socle gratuit rouvert pour 30 jours d'accès complet.
  const base = user.plan === "trial" && user.trialEndsAt && user.trialEndsAt > now ? user.trialEndsAt : now;
  const until = base + REFERRAL_REWARD_DAYS * 86400000;
  await storage.updateUser(user.id, { plan: "trial", trialEndsAt: until } as any);
  return { mode: "trial", until };
}

function rewardMessage(r: GrantResult, quoi: string): string {
  if (r.mode === "credit") return `${quoi} : votre prochaine facture d'abonnement est réduite d'un mois (${(REFERRAL_REWARD_CENTS / 100).toFixed(2).replace(".", ",")} €).`;
  if (r.mode === "trial") return `${quoi} : votre accès complet à Naturo Pro est prolongé jusqu'au ${new Date(r.until!).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}.`;
  return "";
}

async function notify(user: any, lines: string[]) {
  const cfg = getSystemEmailConfig();
  if (!cfg || !user?.email || !lines.length) return;
  const appUrl = process.env.APP_URL || "https://app.ecole-naturo.fr";
  const mail = renderPractitionerNotice({ subject: "Un mois offert grâce au parrainage", lines, linkUrl: `${appUrl}/#/app/settings`, linkLabel: "Voir mon parrainage" });
  const r = await sendEmail(cfg, user.email, mail.subject, mail.html, mail.text);
  if (!r.ok) console.error(`[parrainage] email non envoyé user=${user.id} : ${r.error}`);
}

/**
 * Récompense d'une filleule qui vient de s'abonner, et de sa marraine. null si
 * rien à faire (pas de marraine, déjà récompensée, ou course perdue).
 */
export async function rewardReferral(filleuleId: number, deps: Deps = {}): Promise<{ filleule: GrantResult; marraine: GrantResult | null } | null> {
  const filleule: any = await storage.getUserById(filleuleId);
  if (!filleule?.referredByUserId || filleule.referralRewardedAt) return null;
  if (!(await storage.claimReferralReward(filleuleId, deps.now ?? Date.now()))) return null;
  const marraine: any = await storage.getUserById(filleule.referredByUserId);

  let rFilleule: GrantResult = { mode: "skipped" };
  try {
    rFilleule = await grantFreeMonth(filleule, `Parrainage : mois offert (inscrite avec le lien de ${marraine?.name || "une consœur"})`, deps);
  } catch (e: any) {
    console.error(`[parrainage] filleule=${filleuleId} :`, e?.message || e);
  }
  let rMarraine: GrantResult | null = null;
  if (marraine) {
    try {
      rMarraine = await grantFreeMonth(marraine, `Parrainage : mois offert (${filleule.name} s'est abonnée)`, deps);
    } catch (e: any) {
      rMarraine = { mode: "skipped" };
      console.error(`[parrainage] marraine=${marraine.id} :`, e?.message || e);
    }
  }
  console.log(`[parrainage] filleule=${filleuleId} → ${rFilleule.mode}, marraine=${marraine?.id ?? "-"} → ${rMarraine?.mode ?? "-"}`);

  if (deps.sendMail !== false) {
    await notify(filleule, [rewardMessage(rFilleule, "Merci d'avoir rejoint Naturo Pro sur recommandation")].filter(Boolean)).catch(() => undefined);
    if (marraine && rMarraine) {
      await notify(marraine, [rewardMessage(rMarraine, `${filleule.name} s'est abonnée grâce à vous`)].filter(Boolean)).catch(() => undefined);
    }
  }
  return { filleule: rFilleule, marraine: rMarraine };
}
