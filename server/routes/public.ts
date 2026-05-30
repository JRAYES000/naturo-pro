/**
 * server/routes/public.ts — domaine Public / Booking / Manage (Phase 4.0)
 *
 * Extrait de server/routes.ts (dernier domaine du split). Handlers verbatim,
 * comportement strictement identique. Routes NON authentifiées (page publique,
 * réservation, confirmation/annulation par token, gestion de RDV par token).
 *
 * Regroupe 3 blocs qui étaient dispersés dans routes.ts :
 *   - Page publique + booking : /_self, /:slug, /:slug/availability, /:slug/book
 *   - Tokens RDV (HTML)        : /api/rdv/confirm/:token, /api/rdv/cancel/:token
 *   - Manage (PHASE 3.5-B)     : /api/public/manage/:token(+/cancel,/slots,/reschedule)
 *
 * `ctx` (RouteContext) fournit APP_URL (liens email) et bookingLimiter.
 *
 * Note historique : `bookingLimiter` était défini mais JAMAIS appliqué à
 * POST /:slug/book (dead code détecté au refactor étape 12). Branché à l'étape 12.5
 * (commit séparé, changement de comportement assumé) → 1er changement d'inventaire
 * depuis l'étape 0. Endpoint public non-auth créant des données DB = cible spam.
 *
 * Le rate-limit /api/public reste aussi assuré par `app.use("/api/public", publicLimiter)`
 * côté routes.ts ; les routes /api/rdv/* ne sont couvertes que par l'apiLimiter global.
 */

import type { Express } from "express";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { storage } from "../storage";
import { type AuthedRequest } from "../auth";
import { sendEmail, renderClientCancellationEmail, formatRdvDate } from "../email";
import { renderUserTemplate } from "../email-templates/render-user";
import type { TemplateVars } from "../email-templates/render";
import { syncApptToGoogle } from "./helpers/google-sync";
import { getEmailConfigForUser, sendBookingConfirmationEmail } from "./helpers/email-sending";
import { escapeHtmlMin, htmlFeedbackPage } from "./helpers/html";
import type { RouteContext } from "./_context";

export function registerPublicRoutes(app: Express, ctx: RouteContext): void {
  const APP_URL = ctx.APP_URL;

  // ---------- PUBLIC ----------
  // Phase 3 Lot 2 — Variante "tenant courant" pour les sous-domaines personnels.
  // Le frontend utilise cette route quand il détecte qu'il est sur {slug}.app.ecole-naturo.fr
  // (le slug est déjà résolu côté serveur via le middleware subdomainTenant).
  app.get("/api/public/_self", async (req: AuthedRequest, res) => {
    if (req.tenantNotFound) return res.status(404).json({ message: "Page introuvable" });
    if (!req.tenantUserId) return res.status(404).json({ message: "Page introuvable" });
    const u = await storage.getUserById(req.tenantUserId);
    if (!u || !u.publicPageEnabled) return res.status(404).json({ message: "Page introuvable" });
    const cats = (await storage.listCategories(u.id)).filter(c => c.isActive);
    res.json({
      naturo: {
        name: u.name, slug: u.slug, bio: u.bio, photoUrl: u.photoUrl,
        city: u.city, address: u.address,
        specialties: JSON.parse(u.specialties || "[]"),
        primaryColor: u.primaryColor, accentColor: u.accentColor,
        instagram: u.instagram || null, facebook: u.facebook || null, websiteUrl: u.websiteUrl || null,
      },
      categories: cats,
    });
  });

  app.get("/api/public/:slug", async (req, res) => {
    const u = await storage.getUserBySlug(req.params.slug);
    if (!u || !u.publicPageEnabled) return res.status(404).json({ message: "Page introuvable" });
    const cats = (await storage.listCategories(u.id)).filter(c => c.isActive);
    res.json({
      naturo: {
        name: u.name, slug: u.slug, bio: u.bio, photoUrl: u.photoUrl,
        city: u.city, address: u.address,
        specialties: JSON.parse(u.specialties || "[]"),
        primaryColor: u.primaryColor, accentColor: u.accentColor,
        instagram: u.instagram || null, facebook: u.facebook || null, websiteUrl: u.websiteUrl || null,
      },
      categories: cats,
    });
  });

  // Compute available slots for a slug between from..to (timestamps ms)
  app.get("/api/public/:slug/availability", async (req, res) => {
    const u = await storage.getUserBySlug(req.params.slug);
    if (!u || !u.publicPageEnabled) return res.status(404).json({ message: "Page introuvable" });
    const from = req.query.from ? Number(req.query.from) : Date.now();
    const to = req.query.to ? Number(req.query.to) : (Date.now() + 21 * 86400000);
    const durationMin = Math.max(15, Number(req.query.duration || 60));
    const stepMin = 30;

    const avail = await storage.listAvailability(u.id);
    const appts = await storage.listAppointments(u.id, from, to);
    const apptRanges = appts.filter(a => a.status !== "cancelled").map(a => [a.startAt, a.endAt] as [number, number]);

    const slotsByDay: Record<string, string[]> = {};
    const minBookHorizon = Date.now() + 2 * 3600 * 1000;

    for (let t = from; t <= to; t += 86400000) {
      const d = new Date(t); d.setHours(0, 0, 0, 0);
      const dow = d.getDay();
      const todays = avail.filter(a => a.dayOfWeek === dow);
      for (const a of todays) {
        const [sh, sm] = a.startTime.split(":").map(Number);
        const [eh, em] = a.endTime.split(":").map(Number);
        const start = new Date(d); start.setHours(sh, sm, 0, 0);
        const end = new Date(d); end.setHours(eh, em, 0, 0);
        for (let cur = start.getTime(); cur + durationMin * 60000 <= end.getTime(); cur += stepMin * 60000) {
          if (cur < minBookHorizon) continue;
          const slotEnd = cur + durationMin * 60000;
          const overlaps = apptRanges.some(([s, e]) => cur < e && slotEnd > s);
          if (overlaps) continue;
          const key = new Date(cur).toISOString().slice(0, 10);
          if (!slotsByDay[key]) slotsByDay[key] = [];
          slotsByDay[key].push(new Date(cur).toISOString());
        }
      }
    }
    res.json({ slotsByDay });
  });

  app.post("/api/public/:slug/book", ctx.bookingLimiter, async (req, res) => {
    // String() : coercion type-only (no-op runtime). L'ajout du middleware fait
    // inférer req.params.slug en string|string[] par les typings Express → cast.
    const u = await storage.getUserBySlug(String(req.params.slug));
    if (!u || !u.publicPageEnabled) return res.status(404).json({ message: "Page introuvable" });

    const schema = z.object({
      categoryId: z.number().int(),
      startAt: z.number().int(),
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      email: z.string().email(),
      phone: z.string().min(4),
      notes: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalide", errors: parsed.error.errors });
    const { categoryId, startAt, firstName, lastName, email, phone, notes } = parsed.data;

    const cat = await storage.getCategory(categoryId);
    if (!cat || cat.userId !== u.id) return res.status(400).json({ message: "Catégorie invalide" });
    if (startAt < Date.now() + 2 * 3600 * 1000) return res.status(400).json({ message: "Créneau trop proche" });

    const endAt = startAt + cat.durationMinutes * 60000;
    // Check no overlap
    const sameDayAppts = await storage.listAppointments(u.id, startAt - 86400000, endAt + 86400000);
    const overlap = sameDayAppts.some(a => a.status !== "cancelled" && startAt < a.endAt && endAt > a.startAt);
    if (overlap) return res.status(409).json({ message: "Ce créneau n'est plus disponible" });

    let appt = await storage.createAppointment({
      userId: u.id, clientId: null, categoryId,
      startAt, endAt, status: "confirmed",
      clientFirstName: firstName, clientLastName: lastName,
      clientEmail: email, clientPhone: phone,
      notesBefore: notes || null,
      location: cat.location, googleEventId: null, reminderSent: false,
    });

    // Push to Google Calendar if practitioner has connected
    const eventId = await syncApptToGoogle("create", u.id, appt);
    if (eventId) {
      const refreshed = await storage.updateAppointment(appt.id, { googleEventId: eventId });
      if (refreshed) appt = refreshed;
    }

    // ── Phase 3.5-A : email de confirmation au client ────────────────────────
    // Envoyé uniquement si le client a fourni une adresse email.
    // Wrap en try/catch : un échec d'email ne bloque JAMAIS la création du RDV.
    if (email) {
      void sendBookingConfirmationEmail(u, appt, cat).catch((e) =>
        console.error("[booking-confirm] unexpected:", e),
      );
    }

    res.json({ appointment: appt, category: cat });
  });

  app.get("/api/rdv/confirm/:token", async (req, res) => {
    const token = req.params.token;
    const appt = await storage.getAppointmentByConfirmToken(token);
    if (!appt) {
      return res.status(404).type("html").send(htmlFeedbackPage(
        "error",
        "Lien invalide ou expiré",
        "Ce lien de confirmation n'est pas valide. Si vous avez un doute, contactez directement votre praticienne.",
      ));
    }
    if ((appt as any).clientCancelledAt) {
      return res.type("html").send(htmlFeedbackPage(
        "warning",
        "Rendez-vous déjà annulé",
        "Ce rendez-vous a déjà été annulé via le lien d'annulation.",
      ));
    }
    const dateText = formatRdvDate(appt.startAt);
    if (!(appt as any).clientConfirmedAt) {
      await storage.updateAppointment(appt.id, { clientConfirmedAt: Date.now() } as any);
    }
    return res.type("html").send(htmlFeedbackPage(
      "success",
      "Présence confirmée — merci",
      `Votre présence est bien confirmée pour le <strong>${escapeHtmlMin(dateText)}</strong>. À très vite.`,
    ));
  });

  // ─── Endpoint public : annulation client par token ──────────────────────────
  app.get("/api/rdv/cancel/:token", async (req, res) => {
    const token = req.params.token;
    const appt = await storage.getAppointmentByCancelToken(token);
    if (!appt) {
      return res.status(404).type("html").send(htmlFeedbackPage(
        "error",
        "Lien invalide ou expiré",
        "Ce lien d'annulation n'est pas valide. Contactez directement votre praticienne pour annuler.",
      ));
    }
    if ((appt as any).clientCancelledAt) {
      const dateText = formatRdvDate(appt.startAt);
      return res.type("html").send(htmlFeedbackPage(
        "warning",
        "Rendez-vous déjà annulé",
        `Votre rendez-vous du ${escapeHtmlMin(dateText)} a déjà été annulé. Si c'est une erreur, contactez votre praticienne.`,
      ));
    }

    const dateText = formatRdvDate(appt.startAt);
    await storage.updateAppointment(appt.id, {
      clientCancelledAt: Date.now(),
      status: "cancelled",
    } as any);

    // Prévenir la praticienne par email
    try {
      const user = await storage.getUserById(appt.userId);
      const cfg = user ? getEmailConfigForUser(user) : null;
      if (user && cfg && user.email) {
        let clientName = `${appt.clientFirstName || ""} ${appt.clientLastName || ""}`.trim();
        if (appt.clientId) {
          const c = await storage.getClient(appt.clientId);
          if (c) clientName = `${c.firstName || ""} ${c.lastName || ""}`.trim();
        }
        const { subject, html, text } = renderClientCancellationEmail({
          practitionerFirstName: (user.name || user.email).split(" ")[0],
          clientName: clientName || "(client inconnu)",
          rdvDateText: dateText,
          appUrl: APP_URL,
        });
        await sendEmail(cfg, user.email, subject, html, text);
      }
    } catch (e: any) {
      console.error("[cancel-notify]", e?.message || e);
    }

    return res.type("html").send(htmlFeedbackPage(
      "success",
      "Rendez-vous annulé",
      `Votre rendez-vous du ${escapeHtmlMin(dateText)} a bien été annulé. Votre praticienne a été prévenue. À bientôt.`,
    ));
  });

  // ────── PHASE 3.5-B — Public manage routes ──────────────────────────────────
  // Toutes sous /api/public/* => déjà couvertes par publicLimiter (60/min/IP)

  /**
   * GET /api/public/manage/:token
   * Retourne les infos du RDV associé au cancelToken.
   * 404 si token invalide ou RDV passé ET non annulé.
   */
  app.get("/api/public/manage/:token", async (req, res) => {
    const token = req.params.token;
    const appt = await storage.getAppointmentByCancelToken(token);
    if (!appt) return res.status(404).json({ message: "Lien invalide ou expiré" });

    const now = Date.now();
    const isPast = appt.startAt < now;
    const isCancelled = appt.status === "cancelled" || !!(appt as any).clientCancelledAt;

    // RDV passé et non annulé => 404
    if (isPast && !isCancelled) return res.status(404).json({ message: "Ce lien n'est plus valide (RDV passé)" });

    const user = await storage.getUserById(appt.userId);
    const cat = appt.categoryId ? await storage.getCategory(appt.categoryId) : null;

    const canCancel = !isCancelled && !isPast;
    const canReschedule = !isCancelled && !isPast;

    res.json({
      appointment: {
        id: appt.id,
        date: appt.startAt,
        time: appt.startAt,
        duration: cat ? cat.durationMinutes : Math.round(((appt as any).endAt - appt.startAt) / 60000),
        categoryName: cat ? cat.name : null,
        practitionerName: user ? user.name : null,
        practitionerSlug: user ? user.slug : null,
        address: user ? (user.address || user.city || null) : null,
        status: appt.status || "confirmed",
        startAt: appt.startAt,
        endAt: (appt as any).endAt,
        clientFirstName: appt.clientFirstName,
        clientLastName: appt.clientLastName,
      },
      canCancel,
      canReschedule,
    });
  });

  /**
   * POST /api/public/manage/:token/cancel
   * Annule le RDV. 409 si déjà annulé.
   */
  app.post("/api/public/manage/:token/cancel", async (req, res) => {
    const token = req.params.token;
    const appt = await storage.getAppointmentByCancelToken(token);
    if (!appt) return res.status(404).json({ message: "Lien invalide ou expiré" });

    const isCancelled = appt.status === "cancelled" || !!(appt as any).clientCancelledAt;
    if (isCancelled) return res.status(409).json({ message: "Ce RDV est déjà annulé" });

    const isPast = appt.startAt < Date.now();
    if (isPast) return res.status(409).json({ message: "Ce RDV est déjà passé" });

    await storage.updateAppointment(appt.id, {
      status: "cancelled",
      clientCancelledAt: Date.now(),
    } as any);

    // Notifier la praticienne — PHASE 3.5.5 : try DB-editable template first, fallback hardcodé
    try {
      const user = await storage.getUserById(appt.userId);
      const cfg = user ? getEmailConfigForUser(user) : null;
      if (user && cfg && user.email) {
        let clientName = `${appt.clientFirstName || ""} ${appt.clientLastName || ""}`.trim();
        let clientEmailAddr = appt.clientEmail || "";
        if (appt.clientId) {
          const c = await storage.getClient(appt.clientId);
          if (c) {
            clientName = `${c.firstName || ""} ${c.lastName || ""}`.trim();
            clientEmailAddr = c.email || clientEmailAddr;
          }
        }
        const rdvDateText = formatRdvDate(appt.startAt);
        const fallback = renderClientCancellationEmail({
          practitionerFirstName: (user.name || user.email).split(" ")[0],
          clientName: clientName || "(client inconnu)",
          rdvDateText,
          appUrl: APP_URL,
        });

        const cat = appt.categoryId ? await storage.getCategory(appt.categoryId) : null;
        const startDate = new Date(appt.startAt);
        const hh = String(startDate.getHours()).padStart(2, "0");
        const mm = String(startDate.getMinutes()).padStart(2, "0");
        const tplVars: TemplateVars = {
          "client.name": clientName || "(client inconnu)",
          "client.email": clientEmailAddr,
          "appointment.date": rdvDateText,
          "appointment.time": `${hh}:${mm}`,
          "appointment.duration": cat?.durationMinutes ? `${cat.durationMinutes} min` : "",
          "appointment.category": cat?.name || "",
          "appointment.address": appt.location || cat?.location || "",
          "practitioner.name": user.name || user.email || "",
          "practitioner.email": user.email || "",
          "cancelLink": "",
        };
        const userTpl = await renderUserTemplate(user.id, "cancellation", tplVars);
        const subject = userTpl?.subject ?? fallback.subject;
        const html = userTpl?.html ?? fallback.html;
        const text = fallback.text;
        await sendEmail(cfg, user.email, subject, html, text);
      }
    } catch (e: any) {
      console.error("[manage/cancel-notify]", e?.message || e);
    }

    res.json({ ok: true, message: "RDV annulé avec succès" });
  });

  /**
   * GET /api/public/manage/:token/slots?from=YYYY-MM-DD&to=YYYY-MM-DD
   * Retourne les créneaux dispos du même praticien.
   * Par défaut : 7 jours à partir d'aujourd'hui.
   */
  app.get("/api/public/manage/:token/slots", async (req, res) => {
    const token = req.params.token;
    const appt = await storage.getAppointmentByCancelToken(token);
    if (!appt) return res.status(404).json({ message: "Lien invalide ou expiré" });

    const isCancelled = appt.status === "cancelled" || !!(appt as any).clientCancelledAt;
    if (isCancelled) return res.status(409).json({ message: "RDV déjà annulé" });

    const u = await storage.getUserById(appt.userId);
    if (!u) return res.status(404).json({ message: "Praticien introuvable" });

    const cat = appt.categoryId ? await storage.getCategory(appt.categoryId) : null;
    const durationMin = cat ? cat.durationMinutes : 60;

    // Fenêtre par défaut : 7 jours
    const fromParam = req.query.from ? new Date(req.query.from as string).getTime() : Date.now();
    const toParam = req.query.to ? new Date(req.query.to as string).getTime() : (Date.now() + 7 * 86400000);
    const from = isNaN(fromParam) ? Date.now() : fromParam;
    const to = isNaN(toParam) ? (Date.now() + 7 * 86400000) : toParam;
    const stepMin = 30;

    const avail = await storage.listAvailability(u.id);
    const existing = await storage.listAppointments(u.id, from, to);
    // Exclure le RDV courant de la liste des conflits (il sera remplacé)
    const apptRanges = existing
      .filter(a => a.status !== "cancelled" && a.id !== appt.id)
      .map(a => [a.startAt, (a as any).endAt] as [number, number]);

    const slotsByDay: Record<string, string[]> = {};
    const minBookHorizon = Date.now() + 2 * 3600 * 1000;

    for (let t = from; t <= to; t += 86400000) {
      const d = new Date(t); d.setHours(0, 0, 0, 0);
      const dow = d.getDay();
      const todays = avail.filter(a => a.dayOfWeek === dow);
      for (const a of todays) {
        const [sh, sm] = a.startTime.split(":").map(Number);
        const [eh, em] = a.endTime.split(":").map(Number);
        const start = new Date(d); start.setHours(sh, sm, 0, 0);
        const end = new Date(d); end.setHours(eh, em, 0, 0);
        for (let cur = start.getTime(); cur + durationMin * 60000 <= end.getTime(); cur += stepMin * 60000) {
          if (cur < minBookHorizon) continue;
          const slotEnd = cur + durationMin * 60000;
          const overlaps = apptRanges.some(([s, e]) => cur < e && slotEnd > s);
          if (overlaps) continue;
          const key = new Date(cur).toISOString().slice(0, 10);
          if (!slotsByDay[key]) slotsByDay[key] = [];
          slotsByDay[key].push(new Date(cur).toISOString());
        }
      }
    }

    res.json({ slotsByDay, durationMinutes: durationMin });
  });

  /**
   * POST /api/public/manage/:token/reschedule
   * Body: { newStartMs: number }
   * Annule l'ancien RDV, crée un nouveau, retourne le nouveau token.
   */
  app.post("/api/public/manage/:token/reschedule", async (req, res) => {
    const token = req.params.token;
    const appt = await storage.getAppointmentByCancelToken(token);
    if (!appt) return res.status(404).json({ message: "Lien invalide ou expiré" });

    const isCancelled = appt.status === "cancelled" || !!(appt as any).clientCancelledAt;
    if (isCancelled) return res.status(409).json({ message: "Ce RDV est déjà annulé" });

    const isPast = appt.startAt < Date.now();
    if (isPast) return res.status(409).json({ message: "Ce RDV est déjà passé" });

    const rescheduleSchema = z.object({ newStartMs: z.number().int() });
    const parsed = rescheduleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "newStartMs requis" });
    const { newStartMs } = parsed.data;

    if (newStartMs < Date.now() + 2 * 3600 * 1000) {
      return res.status(400).json({ message: "Créneau trop proche" });
    }

    const u = await storage.getUserById(appt.userId);
    if (!u) return res.status(404).json({ message: "Praticien introuvable" });

    const cat = appt.categoryId ? await storage.getCategory(appt.categoryId) : null;
    const durationMin = cat ? cat.durationMinutes : Math.round(((appt as any).endAt - appt.startAt) / 60000);
    const newEndMs = newStartMs + durationMin * 60000;

    // Vérifier non-chevauchement (exclusion du RDV actuel)
    const sameDayAppts = await storage.listAppointments(u.id, newStartMs - 86400000, newEndMs + 86400000);
    const overlap = sameDayAppts.some(a =>
      a.status !== "cancelled" && a.id !== appt.id && newStartMs < (a as any).endAt && newEndMs > a.startAt
    );
    if (overlap) return res.status(409).json({ message: "Ce créneau n'est plus disponible" });

    // Annuler l'ancien RDV
    await storage.updateAppointment(appt.id, {
      status: "cancelled",
      clientCancelledAt: Date.now(),
    } as any);

    // Générer un nouveau cancelToken
    const newCancelToken = randomBytes(16).toString("hex");

    // Créer le nouveau RDV
    const newAppt = await storage.createAppointment({
      userId: appt.userId,
      clientId: appt.clientId,
      categoryId: appt.categoryId,
      startAt: newStartMs,
      endAt: newEndMs,
      status: "confirmed",
      clientFirstName: appt.clientFirstName,
      clientLastName: appt.clientLastName,
      clientEmail: appt.clientEmail,
      clientPhone: appt.clientPhone,
      notesBefore: appt.notesBefore,
      location: appt.location,
      googleEventId: null,
      reminderSent: false,
      cancelToken: newCancelToken,
    } as any);

    res.json({
      ok: true,
      newToken: newCancelToken,
      appointment: {
        id: newAppt.id,
        startAt: newAppt.startAt,
        endAt: (newAppt as any).endAt,
        status: newAppt.status,
      },
    });
  });
}
