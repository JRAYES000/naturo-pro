/**
 * server/routes/portal.ts — espace cliente (lot 3a, parité naturooo).
 *
 * Connexion sans mot de passe : la cliente reçoit un lien par email (demandé depuis
 * /#/espace/connexion/:slug, ou envoyé par sa praticienne), échangé contre une
 * session de 30 jours (cookie httpOnly « naturo_portal », distinct de celui des
 * praticiennes). L'espace montre ses rendez-vous, factures et devis, programmes
 * (étape du jour, relevé d'observance), questionnaires à remplir, bilans et
 * documents partagés.
 *
 * Publiques : POST /api/public/portal/request-link, POST /api/public/portal/exchange
 * Cliente   : /api/portal/* (cookie)
 * Praticienne : POST /api/clients/:id/portal-invite, GET /api/programmes/:id/checkins
 */
import type { Express, NextFunction, Request, Response } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { requireAuth, type AuthedRequest } from "../auth";
import { sendEmail } from "../email";
import { zonedDateKey } from "../timezone";
import { publicDocumentUrl } from "../public-documents";
import {
  PORTAL_COOKIE, PORTAL_SESSION_TTL_MS, PORTAL_LINK_TTL_MS, PORTAL_INVITE_TTL_MS,
  newPortalToken, hashPortalToken, programStages, currentStage, adherenceStats, addDays, DAY_RE,
  type ProgramSection,
} from "../portal";
import { getEmailConfigOrSystem } from "./helpers/email-sending";
import { bookingLimiter } from "./limiters";

type PortalRequest = Request & { portal?: { userId: number; clientId: number; tokenHash: string } };

function appUrl(): string {
  return process.env.APP_URL || "https://app.ecole-naturo.fr";
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Email du lien de connexion (rendu pur, testé). */
export function renderPortalLinkEmail(opts: { firstName?: string | null; practitionerName: string; url: string; invite: boolean; validity: string }) {
  const subject = opts.invite
    ? `${opts.practitionerName} vous ouvre votre espace personnel`
    : `Votre lien de connexion — ${opts.practitionerName}`;
  const intro = opts.invite
    ? `${opts.practitionerName} vous invite dans votre espace personnel : vos rendez-vous, vos programmes, vos documents et vos factures, au même endroit.`
    : "Voici votre lien pour accéder à votre espace personnel.";
  const lines = [`Bonjour${opts.firstName ? ` ${opts.firstName}` : ""},`, intro, `Ce lien est valable ${opts.validity} et ne sert qu'une fois.`];
  const html = lines.map((l) => `<p>${esc(l)}</p>`).join("")
    + `<p style="margin:20px 0"><a href="${esc(opts.url)}" style="display:inline-block;background:#186749;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px">Ouvrir mon espace</a></p>`
    + `<p style="font-size:13px;color:#6b7a76">Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.</p>`;
  const text = [...lines, "", `Ouvrir mon espace : ${opts.url}`, "", "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message."].join("\n");
  return { subject, html, text };
}

async function sendPortalLink(user: any, client: any, ttlMs: number, invite: boolean): Promise<{ url: string; emailed: boolean }> {
  const token = newPortalToken();
  await storage.createPortalToken({ userId: user.id, clientId: client.id, tokenHash: hashPortalToken(token), kind: "link", expiresAt: Date.now() + ttlMs });
  const url = `${appUrl()}/#/espace/acces/${token}`;
  const cfg = getEmailConfigOrSystem(user);
  if (!cfg || !client.email) return { url, emailed: false };
  const mail = renderPortalLinkEmail({
    firstName: client.firstName, practitionerName: user.emailFromName || user.name, url, invite,
    validity: invite ? "7 jours" : "30 minutes",
  });
  const r = await sendEmail(cfg, client.email, mail.subject, mail.html, mail.text);
  if (!r.ok) console.error(`[portal] lien non envoyé cliente=${client.id} : ${r.error}`);
  return { url, emailed: r.ok };
}

function setPortalCookie(res: Response, token: string) {
  res.cookie(PORTAL_COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: PORTAL_SESSION_TTL_MS, path: "/",
  });
}

async function requirePortal(req: PortalRequest, res: Response, next: NextFunction) {
  const token = (req as any).cookies?.[PORTAL_COOKIE];
  if (!token) return res.status(401).json({ message: "Session expirée : demandez un nouveau lien de connexion." });
  const tokenHash = hashPortalToken(token);
  const t = await storage.getPortalToken(tokenHash);
  if (!t || t.kind !== "session" || t.expiresAt < Date.now()) {
    return res.status(401).json({ message: "Session expirée : demandez un nouveau lien de connexion." });
  }
  const client = await storage.getClient(t.clientId);
  if (!client || client.userId !== t.userId) return res.status(401).json({ message: "Espace introuvable." });
  req.portal = { userId: t.userId, clientId: t.clientId, tokenHash };
  next();
}

const parseContent = (raw: string | null | undefined): ProgramSection[] => {
  try {
    const v = JSON.parse(raw || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

export function registerPortalRoutes(app: Express): void {
  // ── Connexion ──────────────────────────────────────────────────────────────
  app.post("/api/public/portal/request-link", bookingLimiter, async (req, res) => {
    const parsed = z.object({ slug: z.string().min(1).max(100), email: z.string().email().max(255) }).safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: "Adresse email invalide" });
    // Réponse identique que la cliente existe ou non : pas d'énumération des fiches.
    const user = await storage.getUserBySlug(parsed.data.slug.toLowerCase());
    if (user) {
      const client = await storage.findClientByEmail(user.id, parsed.data.email.trim().toLowerCase());
      if (client && !client.archivedAt) await sendPortalLink(user, client, PORTAL_LINK_TTL_MS, false).catch((e) => console.error("[portal]", e?.message || e));
    }
    res.json({ ok: true });
  });

  app.post("/api/public/portal/exchange", bookingLimiter, async (req, res) => {
    const token = String(req.body?.token || "");
    if (!/^[a-f0-9]{64}$/.test(token)) return res.status(400).json({ message: "Lien invalide." });
    const link = await storage.consumePortalLink(hashPortalToken(token));
    if (!link) return res.status(410).json({ message: "Ce lien a expiré ou a déjà servi. Demandez-en un nouveau." });
    const session = newPortalToken();
    await storage.createPortalToken({
      userId: link.userId, clientId: link.clientId, tokenHash: hashPortalToken(session), kind: "session",
      expiresAt: Date.now() + PORTAL_SESSION_TTL_MS,
    });
    await storage.updateClient(link.clientId, { portalLastSeenAt: Date.now() } as any);
    setPortalCookie(res, session);
    res.json({ ok: true });
  });

  app.post("/api/portal/logout", async (req: PortalRequest, res) => {
    const token = (req as any).cookies?.[PORTAL_COOKIE];
    if (token) await storage.deletePortalToken(hashPortalToken(token));
    res.clearCookie(PORTAL_COOKIE, { path: "/" });
    res.json({ ok: true });
  });

  // ── Tableau de bord ────────────────────────────────────────────────────────
  app.get("/api/portal/me", requirePortal, async (req: PortalRequest, res) => {
    const { userId, clientId } = req.portal!;
    const [user, client] = await Promise.all([storage.getUserById(userId), storage.getClient(clientId)]);
    if (!user || !client) return res.status(401).json({ message: "Espace introuvable." });
    const now = Date.now();
    if (!client.portalLastSeenAt || now - client.portalLastSeenAt > 3600_000) {
      await storage.updateClient(clientId, { portalLastSeenAt: now } as any);
    }

    const appts = await storage.listAppointmentsForPortal(userId, clientId, client.email);
    const upcoming = [];
    for (const a of appts.filter((x) => x.startAt >= now && x.status !== "cancelled" && x.status !== "blocked").reverse()) {
      const manage = await storage.ensureCancelToken(a.id).catch(() => null);
      const cat = a.categoryId ? await storage.getCategory(a.categoryId) : null;
      upcoming.push({ id: a.id, startAt: a.startAt, endAt: a.endAt, status: a.status, location: a.location, categoryName: cat?.name ?? null, manageUrl: manage ? `/#/manage/${manage}` : null });
    }
    const past = appts.filter((x) => x.startAt < now && x.status !== "cancelled" && x.status !== "blocked").slice(0, 5)
      .map((a) => ({ id: a.id, startAt: a.startAt }));

    const docs = (await storage.listInvoices(userId, { clientId }))
      .filter((i) => (i.docType === "devis" ? i.status !== "draft" && i.status !== "cancelled" : i.status !== "draft"));
    const invoices = [];
    for (const i of docs.slice(0, 30)) {
      const token = await storage.ensureInvoicePublicToken(i.id);
      invoices.push({ id: i.id, docType: i.docType, number: i.number, status: i.status, issueDate: i.issueDate, totalCents: i.totalCents, url: publicDocumentUrl(token, "") });
    }

    const programmes = (await storage.listPrograms(userId, clientId)).filter((p) => p.status === "sent")
      .map((p) => ({ id: p.id, title: p.title, startDate: p.startDate ?? null, updatedAt: p.updatedAt }));

    const responses = await storage.listAnamnesisResponses(userId, clientId);
    const templates = new Map<number, string>();
    for (const r of responses) {
      if (r.templateId && !templates.has(r.templateId)) templates.set(r.templateId, (await storage.getAnamnesisTemplate(r.templateId))?.name ?? "Questionnaire");
    }
    const questionnaires = responses.filter((r) => !r.submittedAt)
      .map((r) => ({ id: r.id, name: templates.get(r.templateId ?? 0) ?? "Questionnaire", url: `/#/anamnese/${r.token}`, createdAt: r.createdAt }));
    const bilans = responses.filter((r) => r.submittedAt && r.score != null)
      .map((r) => ({ id: r.id, name: templates.get(r.templateId ?? 0) ?? "Bilan", score: r.score, label: r.scoreLabel, submittedAt: r.submittedAt }));

    const documents = (await storage.listClientDocuments(userId, clientId)).filter((d: any) => d.sharedWithClient)
      .map((d) => ({ id: d.id, filename: d.filename, sizeBytes: d.sizeBytes, createdAt: d.createdAt }));

    res.json({
      client: { firstName: client.firstName, lastName: client.lastName, email: client.email },
      practitioner: { name: user.name, slug: user.slug, photoUrl: user.photoUrl ?? null, phone: user.phone ?? null, email: user.emailReplyTo || user.email },
      bookingUrl: `/p/${user.slug}`,
      upcoming, past, invoices, programmes, questionnaires, bilans, documents,
    });
  });

  // ── Programme : étapes et observance ───────────────────────────────────────
  async function portalProgram(req: PortalRequest, res: Response) {
    const p = await storage.getProgram(Number(req.params.id));
    if (!p || p.userId !== req.portal!.userId || p.clientId !== req.portal!.clientId || p.status !== "sent") {
      res.status(404).json({ message: "Programme introuvable" });
      return null;
    }
    return p;
  }

  app.get("/api/portal/programmes/:id", requirePortal, async (req: PortalRequest, res) => {
    const p = await portalProgram(req, res);
    if (!p) return;
    const today = zonedDateKey(Date.now());
    const stages = programStages(parseContent(p.content), p.startDate);
    const checkins = await storage.listProgramCheckins(p.id);
    res.json({
      id: p.id, title: p.title, startDate: p.startDate ?? null, today,
      stages, current: currentStage(stages, today)?.index ?? null,
      checkins: checkins.slice(0, 60).map((c) => ({ day: c.day, adherence: c.adherence, energy: c.energy, note: c.note })),
      stats: adherenceStats(checkins, today),
    });
  });

  const checkinSchema = z.object({
    day: z.string().regex(DAY_RE).optional(),
    adherence: z.number().int().min(0).max(2),
    energy: z.number().int().min(1).max(5).nullable().optional(),
    note: z.string().trim().max(1000).nullable().optional(),
  });
  app.post("/api/portal/programmes/:id/checkins", requirePortal, async (req: PortalRequest, res) => {
    const p = await portalProgram(req, res);
    if (!p) return;
    const parsed = checkinSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: "Relevé invalide" });
    const today = zonedDateKey(Date.now());
    const day = parsed.data.day ?? today;
    // Aujourd'hui ou les deux jours précédents (un oubli se rattrape), jamais l'avenir.
    if (day > today || day < addDays(today, -2)) return res.status(400).json({ message: "Relevé possible pour aujourd'hui ou les deux jours précédents." });
    const c = await storage.upsertProgramCheckin({
      userId: p.userId, programId: p.id, clientId: p.clientId!, day, adherence: parsed.data.adherence,
      energy: parsed.data.energy ?? null, note: parsed.data.note || null,
    });
    res.json({ day: c.day, adherence: c.adherence, energy: c.energy, note: c.note });
  });

  // ── Document partagé ───────────────────────────────────────────────────────
  app.get("/api/portal/documents/:id", requirePortal, async (req: PortalRequest, res) => {
    const d = await storage.getClientDocument(Number(req.params.id));
    if (!d || d.userId !== req.portal!.userId || d.clientId !== req.portal!.clientId || !(d as any).sharedWithClient) {
      return res.status(404).json({ message: "Document introuvable" });
    }
    const buf = Buffer.from(d.dataBase64, "base64");
    res.setHeader("Content-Type", d.mimeType || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(d.filename)}"`);
    res.setHeader("Cache-Control", "no-store");
    res.send(buf);
  });

  // ── Côté praticienne ───────────────────────────────────────────────────────
  app.post("/api/clients/:id/portal-invite", requireAuth, async (req: AuthedRequest, res) => {
    const client = await storage.getClient(Number(req.params.id));
    if (!client || client.userId !== req.userId) return res.status(404).json({ message: "Introuvable" });
    if (!client.email) return res.status(400).json({ message: "Ajoutez d'abord l'adresse email de la cliente." });
    const user = await storage.getUserById(req.userId!);
    if (!user) return res.status(401).json({ message: "Non authentifié" });
    const r = await sendPortalLink(user, client, PORTAL_INVITE_TTL_MS, true);
    await storage.createClientFollowup({ userId: user.id, clientId: client.id, kind: "email", content: "Invitation à l'espace cliente envoyée.", occurredAt: Date.now() }).catch(() => undefined);
    res.json({ ok: true, emailed: r.emailed, url: r.url });
  });

  app.get("/api/programmes/:id/checkins", requireAuth, async (req: AuthedRequest, res) => {
    const p = await storage.getProgram(Number(req.params.id));
    if (!p || p.userId !== req.userId) return res.status(404).json({ message: "Introuvable" });
    const today = zonedDateKey(Date.now());
    const checkins = await storage.listProgramCheckins(p.id);
    const stages = programStages(parseContent(p.content), p.startDate);
    res.json({
      today, stages, current: currentStage(stages, today)?.index ?? null,
      checkins: checkins.slice(0, 90).map((c) => ({ day: c.day, adherence: c.adherence, energy: c.energy, note: c.note })),
      stats: adherenceStats(checkins, today), stats30: adherenceStats(checkins, today, 30),
    });
  });
}
