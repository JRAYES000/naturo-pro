/**
 * server/routes/broadcasts.ts — message groupé à toutes les clientes (lot 2b).
 *
 * GET  /api/broadcasts        historique, nombre de destinataires, quota du jour
 * POST /api/broadcasts/test   envoi d'essai à la praticienne elle-même
 * POST /api/broadcasts        envoi à toutes les clientes (en tâche de fond)
 *
 * Expéditeur : la configuration email de la praticienne, sinon la configuration
 * système au nom de la praticienne (réponses vers son adresse). Les quotas
 * (BROADCAST_LIMITS) protègent la réputation du domaine d'envoi.
 */
import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { requireAuth, type AuthedRequest } from "../auth";
import { sendEmail, getSystemEmailConfig, type EmailConfig, type SendResult } from "../email";
import {
  BROADCAST_LIMITS, broadcastRecipients, renderBroadcastEmail, unsubscribeHeaders, unsubscribeUrl,
} from "../broadcast";
import { getEmailConfigForUser } from "./helpers/email-sending";
import type { Client } from "@shared/schema-active";

/** Configuration d'envoi d'une praticienne : la sienne, sinon le système à son nom. */
export function broadcastEmailConfig(user: any): EmailConfig | null {
  const own = getEmailConfigForUser(user);
  if (own) return own;
  const sys = getSystemEmailConfig();
  if (!sys) return null;
  return { ...sys, fromName: user.emailFromName || user.name || sys.fromName, replyTo: user.emailReplyTo || user.email || null };
}

const practitionerName = (user: any) => user.emailFromName || user.name || "votre praticienne";

/**
 * Envoie le message à chaque destinataire, une par une (débit limité), consigne
 * l'envoi dans le journal de suivi de chaque cliente et met à jour le compteur.
 * Exporté pour les tests (envoi et pause injectables).
 */
export async function runBroadcast(
  broadcastId: number,
  user: any,
  recipients: Client[],
  message: { subject: string; body: string },
  deps: {
    send?: (cfg: EmailConfig, to: string, subject: string, html: string, text: string, headers: Record<string, string>) => Promise<SendResult>;
    pause?: (ms: number) => Promise<void>;
  } = {},
): Promise<{ sent: number; failed: number }> {
  const cfg = broadcastEmailConfig(user);
  const send = deps.send ?? ((c, to, s, h, t, hd) => sendEmail(c, to, s, h, t, undefined, hd));
  const pause = deps.pause ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < recipients.length; i++) {
    const c = recipients[i];
    try {
      if (!cfg) throw new Error("Configuration email manquante");
      const url = unsubscribeUrl(await storage.ensureClientOptOutToken(c.id));
      const mail = renderBroadcastEmail({ subject: message.subject, body: message.body, client: c, practitionerName: practitionerName(user), unsubscribeUrl: url });
      const r = await send(cfg, c.email!, mail.subject, mail.html, mail.text, unsubscribeHeaders(url));
      if (!r.ok) throw new Error(r.error);
      sent++;
      await storage.createClientFollowup({ userId: user.id, clientId: c.id, kind: "email", content: `Message groupé : ${message.subject}`, occurredAt: Date.now() });
    } catch (e: any) {
      failed++;
      console.error(`[broadcast ${broadcastId}] cliente=${c.id} :`, e?.message || e);
    }
    // Compteur visible pendant l'envoi (toutes les 10 clientes et à la fin).
    if ((i + 1) % 10 === 0) await storage.updateBroadcast(broadcastId, { sentCount: sent, failedCount: failed } as any);
    if (i < recipients.length - 1) await pause(BROADCAST_LIMITS.pauseMs);
  }
  await storage.updateBroadcast(broadcastId, {
    sentCount: sent, failedCount: failed, status: sent ? "sent" : "failed", finishedAt: Date.now(),
  } as any);
  return { sent, failed };
}

const messageSchema = z.object({
  subject: z.string().trim().min(1, "Objet manquant").max(BROADCAST_LIMITS.subjectMax),
  body: z.string().trim().min(1, "Message vide").max(BROADCAST_LIMITS.bodyMax),
});

export function registerBroadcastRoutes(app: Express): void {
  app.get("/api/broadcasts", requireAuth, async (req: AuthedRequest, res) => {
    const user = await storage.getUserById(req.userId!);
    if (!user) return res.status(401).json({ message: "Non authentifié" });
    const history = await storage.listBroadcasts(req.userId!, 20);
    const since = Date.now() - 24 * 3600 * 1000;
    const recipients = broadcastRecipients(await storage.listClients(req.userId!));
    res.json({
      history,
      recipients: Math.min(recipients.length, BROADCAST_LIMITS.maxRecipients),
      totalEligible: recipients.length,
      sentLast24h: history.filter((b) => b.createdAt >= since).length,
      maxPerDay: BROADCAST_LIMITS.maxPerDay,
      maxRecipients: BROADCAST_LIMITS.maxRecipients,
      emailReady: !!broadcastEmailConfig(user),
    });
  });

  app.post("/api/broadcasts/test", requireAuth, async (req: AuthedRequest, res) => {
    const parsed = messageSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message || "Données invalides" });
    const user = await storage.getUserById(req.userId!);
    if (!user?.email) return res.status(400).json({ message: "Adresse email du compte manquante" });
    const cfg = broadcastEmailConfig(user);
    if (!cfg) return res.status(400).json({ message: "Envoi d'email non configuré" });
    const prenom = (user.name || "").trim().split(/\s+/)[0] || "";
    const url = unsubscribeUrl("exemple");
    const mail = renderBroadcastEmail({ ...parsed.data, client: { firstName: prenom, lastName: "" }, practitionerName: practitionerName(user), unsubscribeUrl: url });
    const r = await sendEmail(cfg, user.email, `[Essai] ${mail.subject}`, mail.html, mail.text);
    if (!r.ok) return res.status(502).json({ message: r.error || "Échec de l'envoi" });
    res.json({ ok: true, to: user.email });
  });

  app.post("/api/broadcasts", requireAuth, async (req: AuthedRequest, res) => {
    const parsed = messageSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message || "Données invalides" });
    const user = await storage.getUserById(req.userId!);
    if (!user) return res.status(401).json({ message: "Non authentifié" });
    if (!broadcastEmailConfig(user)) return res.status(400).json({ message: "Envoi d'email non configuré" });

    const since = Date.now() - 24 * 3600 * 1000;
    const recent = (await storage.listBroadcasts(req.userId!, 10)).filter((b) => b.createdAt >= since);
    if (recent.length >= BROADCAST_LIMITS.maxPerDay) {
      return res.status(429).json({ message: `Limite atteinte : ${BROADCAST_LIMITS.maxPerDay} messages groupés par 24 heures.` });
    }
    // Un envoi « en cours » depuis plus d'une heure a été interrompu (redémarrage) : il ne bloque plus.
    if (recent.some((b) => b.status === "sending" && b.createdAt > Date.now() - 3600 * 1000)) {
      return res.status(409).json({ message: "Un message groupé est déjà en cours d'envoi." });
    }
    const recipients = broadcastRecipients(await storage.listClients(req.userId!)).slice(0, BROADCAST_LIMITS.maxRecipients);
    if (!recipients.length) return res.status(400).json({ message: "Aucune cliente avec une adresse email à qui écrire." });

    const b = await storage.createBroadcast({ userId: req.userId!, ...parsed.data, recipientCount: recipients.length });
    // Réponse immédiate ; l'envoi (≈ 0,6 s par cliente) continue en arrière-plan.
    res.status(202).json({ id: b.id, recipientCount: recipients.length });
    void runBroadcast(b.id, user, recipients, parsed.data).catch(async (e) => {
      console.error(`[broadcast ${b.id}]`, e?.message || e);
      await storage.updateBroadcast(b.id, { status: "failed", finishedAt: Date.now() } as any).catch(() => undefined);
    });
  });
}
