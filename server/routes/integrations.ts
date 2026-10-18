/**
 * server/routes/integrations.ts — Brevo (lot 3b) : contacts et rappels SMS avec le
 * compte Brevo de la praticienne.
 *
 * GET    /api/integrations/brevo           état, listes, crédits SMS
 * POST   /api/integrations/brevo           { apiKey } connexion (clé vérifiée, stockée chiffrée)
 * PATCH  /api/integrations/brevo           { listId?, smsSender?, smsRemindersEnabled? }
 * DELETE /api/integrations/brevo           déconnexion
 * POST   /api/integrations/brevo/sync      clientes → liste Brevo
 * POST   /api/integrations/brevo/test-sms  { phone } SMS d'essai
 */
import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { requireAuth, type AuthedRequest } from "../auth";
import { sealToken, openToken } from "../einvoicing/token-crypto";
import {
  BrevoError, brevoAccount, brevoLists, brevoNameAttributes, brevoUpsertContact, brevoSendSms,
  normalizePhone, validSmsSender, toGsm, renderSmsReminder,
} from "../brevo";
import { broadcastRecipients } from "../broadcast";
import { zonedTimeKey } from "../timezone";
import { getLocalDayBounds } from "./helpers/reminders";

export const BREVO_PURPOSE = "brevo-api-key";

export function brevoKeyOf(user: any): string | null {
  return openToken(user?.brevoApiKey, BREVO_PURPOSE);
}

const fail = (res: any, e: any) => {
  const status = e instanceof BrevoError ? (e.status === 401 ? 400 : 502) : 500;
  res.status(status).json({ message: e?.message || "Erreur Brevo" });
};

/**
 * Rappels SMS de la veille (cron, à l'heure des rappels de la praticienne).
 * Idempotent : sms_reminder_sent_at est posé après un envoi réussi.
 */
export async function sendSmsRemindersForUser(user: any, deps: { send?: typeof brevoSendSms } = {}): Promise<{ sent: number; skipped: number; errors: number }> {
  const out = { sent: 0, skipped: 0, errors: 0 };
  const key = brevoKeyOf(user);
  if (!key || !user.smsRemindersEnabled || !validSmsSender(user.brevoSmsSender)) return out;
  const send = deps.send ?? brevoSendSms;
  const appUrl = process.env.APP_URL || "https://app.ecole-naturo.fr";
  const { from, to } = getLocalDayBounds(1);
  for (const a of await storage.listAppointmentsForSmsReminder(user.id, from, to)) {
    const recipient = normalizePhone(a.clientPhone);
    if (!recipient) { out.skipped++; continue; }
    try {
      const manage = await storage.ensureCancelToken(a.id);
      const day = new Date(a.startAt).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris" });
      const content = renderSmsReminder({
        practitionerName: user.emailFromName || user.name, dateText: day, timeText: zonedTimeKey(a.startAt).replace(":", "h"),
        manageUrl: `${appUrl}/#/manage/${manage}`,
      });
      await send(key, { sender: user.brevoSmsSender, recipient, content, tag: "rappel-rdv" });
      await storage.updateAppointment(a.id, { smsReminderSentAt: Date.now() } as any);
      out.sent++;
    } catch (e: any) {
      out.errors++;
      console.error(`[sms-reminder] user=${user.id} appt=${a.id}:`, e?.message || e);
    }
  }
  return out;
}

export function registerIntegrationRoutes(app: Express): void {
  app.get("/api/integrations/brevo", requireAuth, async (req: AuthedRequest, res) => {
    const u: any = await storage.getUserById(req.userId!);
    if (!u) return res.status(401).json({ message: "Non authentifié" });
    const key = brevoKeyOf(u);
    const base = {
      connected: !!key, listId: u.brevoListId ?? null, smsSender: u.brevoSmsSender ?? null,
      smsRemindersEnabled: !!u.smsRemindersEnabled, lastSyncAt: u.brevoLastSyncAt ?? null, lastSyncCount: u.brevoLastSyncCount ?? null,
    };
    if (!key) return res.json({ ...base, account: null, lists: [], error: u.brevoApiKey ? "Clé illisible : reconnectez Brevo." : null });
    try {
      const [account, lists] = await Promise.all([brevoAccount(key), brevoLists(key)]);
      res.json({ ...base, account, lists, error: null });
    } catch (e: any) {
      res.json({ ...base, account: null, lists: [], error: e?.message || "Brevo injoignable" });
    }
  });

  app.post("/api/integrations/brevo", requireAuth, async (req: AuthedRequest, res) => {
    const parsed = z.object({ apiKey: z.string().trim().min(20).max(200) }).safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: "Clé API Brevo invalide" });
    try {
      const account = await brevoAccount(parsed.data.apiKey);
      await storage.updateUser(req.userId!, { brevoApiKey: sealToken(parsed.data.apiKey, BREVO_PURPOSE) } as any);
      res.json({ ok: true, account });
    } catch (e: any) {
      fail(res, e);
    }
  });

  app.patch("/api/integrations/brevo", requireAuth, async (req: AuthedRequest, res) => {
    const parsed = z.object({
      listId: z.number().int().positive().nullable().optional(),
      smsSender: z.string().trim().max(11).nullable().optional(),
      smsRemindersEnabled: z.boolean().optional(),
    }).safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: "Données invalides" });
    const u: any = await storage.getUserById(req.userId!);
    if (!brevoKeyOf(u)) return res.status(409).json({ message: "Connectez d'abord votre compte Brevo." });
    const d = parsed.data;
    if (d.smsSender && !validSmsSender(d.smsSender)) {
      return res.status(400).json({ message: "Nom d'expéditeur : 3 à 11 lettres ou chiffres, sans espace ni accent." });
    }
    const sender = d.smsSender !== undefined ? d.smsSender || null : u.brevoSmsSender;
    if (d.smsRemindersEnabled && !validSmsSender(sender)) {
      return res.status(400).json({ message: "Choisissez d'abord le nom d'expéditeur des SMS." });
    }
    const patch: Record<string, unknown> = {};
    if (d.listId !== undefined) patch.brevoListId = d.listId;
    if (d.smsSender !== undefined) patch.brevoSmsSender = d.smsSender || null;
    if (d.smsRemindersEnabled !== undefined) patch.smsRemindersEnabled = d.smsRemindersEnabled;
    await storage.updateUser(req.userId!, patch as any);
    res.json({ ok: true });
  });

  app.delete("/api/integrations/brevo", requireAuth, async (req: AuthedRequest, res) => {
    await storage.updateUser(req.userId!, { brevoApiKey: null, brevoListId: null, smsRemindersEnabled: false } as any);
    res.json({ ok: true });
  });

  app.post("/api/integrations/brevo/sync", requireAuth, async (req: AuthedRequest, res) => {
    const u: any = await storage.getUserById(req.userId!);
    const key = brevoKeyOf(u);
    if (!key) return res.status(409).json({ message: "Connectez d'abord votre compte Brevo." });
    if (!u.brevoListId) return res.status(400).json({ message: "Choisissez la liste Brevo à alimenter." });
    try {
      const attrs = await brevoNameAttributes(key);
      // Mêmes règles que le message groupé : email valide, ni archivée ni désinscrite.
      const recipients = broadcastRecipients(await storage.listClients(req.userId!));
      let synced = 0, failed = 0;
      for (const c of recipients) {
        const attributes: Record<string, string> = {};
        if (attrs.first && c.firstName) attributes[attrs.first] = c.firstName;
        if (attrs.last && c.lastName) attributes[attrs.last] = c.lastName;
        try {
          await brevoUpsertContact(key, { email: c.email!.trim().toLowerCase(), attributes, listId: u.brevoListId });
          synced++;
        } catch (e: any) {
          failed++;
          if (e instanceof BrevoError && e.status === 401) throw e;
        }
      }
      await storage.updateUser(req.userId!, { brevoLastSyncAt: Date.now(), brevoLastSyncCount: synced } as any);
      res.json({ ok: true, synced, failed, total: recipients.length });
    } catch (e: any) {
      fail(res, e);
    }
  });

  app.post("/api/integrations/brevo/test-sms", requireAuth, async (req: AuthedRequest, res) => {
    const u: any = await storage.getUserById(req.userId!);
    const key = brevoKeyOf(u);
    if (!key) return res.status(409).json({ message: "Connectez d'abord votre compte Brevo." });
    if (!validSmsSender(u.brevoSmsSender)) return res.status(400).json({ message: "Choisissez d'abord le nom d'expéditeur des SMS." });
    const recipient = normalizePhone(req.body?.phone || u.phone);
    if (!recipient) return res.status(400).json({ message: "Numéro de téléphone invalide." });
    try {
      const content = renderSmsReminder({
        practitionerName: u.emailFromName || u.name, dateText: "mardi 21 octobre", timeText: "14h30",
        manageUrl: `${process.env.APP_URL || "https://app.ecole-naturo.fr"}/#/manage/exemple`,
      });
      await brevoSendSms(key, { sender: u.brevoSmsSender, recipient, content: toGsm(`[Essai] ${content}`), tag: "essai" });
      res.json({ ok: true, recipient });
    } catch (e: any) {
      fail(res, e);
    }
  });
}
