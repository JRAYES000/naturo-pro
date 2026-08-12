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
import { storage, serialiserParUser } from "../storage";
import { type AuthedRequest } from "../auth";
import { sendEmail, renderClientCancellationEmail, formatRdvDate } from "../email";
import { createCheckoutSession, retrieveCheckoutSession } from "../stripe";
import { renderUserTemplate } from "../email-templates/render-user";
import type { TemplateVars } from "../email-templates/render";
import { syncApptToGoogle } from "./helpers/google-sync";
import { getEmailConfigOrSystem, sendBookingConfirmationEmail, sendNewBookingNotificationEmail } from "./helpers/email-sending";
import { creerRdvDepuisSessionPayee } from "./helpers/stripe-booking";
import { escapeHtmlMin, htmlFeedbackPage } from "./helpers/html";
import { zonedCivilDays, zonedDateKey, zonedTimeToUtc, zonedTimeKey } from "../timezone";
import type { RouteContext } from "./_context";

// Fenêtre maximale interrogeable en une requête de créneaux. Sans borne,
// `?to=999999999999999` faisait tourner la boucle jour-par-jour ~11 millions de
// fois : Node étant mono-thread, tout le site gelait — sur une route publique
// non authentifiée, où publicLimiter autorise 60 req/min.
const MAX_SLOT_WINDOW_MS = 90 * 86400000;

// Borne des timestamps que Date sait représenter (±8 640 000 000 000 000 ms).
// Elle est indispensable sur `from` LUI-MÊME, pas seulement sur l'écart to−from :
// au-delà de ~1,21e24 l'ulp du float64 dépasse 86400000, donc le `t += 86400000` de
// la boucle appelante ne fait PLUS avancer `t` — boucle infinie, event loop mort
// définitivement (pire que la version non bornée, qui finissait par se terminer).
// En deçà de 8.64e15 l'ulp vaut au plus 2 ms : la progression est garantie.
const MAX_TIMESTAMP_MS = 8.64e15;

/**
 * Normalise et borne une fenêtre [from, to] issue de la query string.
 * Valeurs absentes, non numériques ou hors plage Date → maintenant / + defaultSpanMs.
 * `to` est ramené dans [from, from + MAX_SLOT_WINDOW_MS].
 *
 * Terminaison garantie de la boucle appelante : au plus 91 itérations.
 */
export function clampSlotWindow(rawFrom: number, rawTo: number, defaultSpanMs: number): { from: number; to: number } {
  const usable = (n: number) => Number.isFinite(n) && Math.abs(n) <= MAX_TIMESTAMP_MS;
  const from = usable(rawFrom) ? rawFrom : Date.now();
  const end = usable(rawTo) ? rawTo : from + defaultSpanMs;
  // Le `to` calculé doit lui aussi rester dans la plage Date : avec from = 8.64e15,
  // from + 21 jours la dépasse, et `new Date(to)` devient Invalid Date → zonedParts
  // lève RangeError → 500 sur une route publique.
  const to = Math.min(Math.max(end, from), from + MAX_SLOT_WINDOW_MS, MAX_TIMESTAMP_MS);
  return { from: Math.min(from, to), to };
}

/**
 * Créneaux libres d'un praticien sur une fenêtre, groupés par jour LOCAL.
 *
 * Source unique : /availability et /manage/:token/slots en avaient chacun une copie
 * mot pour mot. Les deux calculaient les heures d'ouverture dans le fuseau du
 * *process* (setHours) et rangeaient les créneaux sous leur date *UTC* — en
 * production (serveur en UTC), une plage saisie « 09:00–17:00 » était servie
 * décalée, et un créneau après minuit heure de Paris atterrissait la veille.
 *
 * `busy` : intervalles [début, fin] déjà occupés (RDV non annulés).
 */
/** Lot 5 — la date civile "YYYY-MM-DD" tombe-t-elle dans une période bloquée (bornes incluses) ? */
export function isDateBlocked(dateKey: string, blocked: Array<{ startDate: string; endDate: string }>): boolean {
  return blocked.some((b) => dateKey >= b.startDate && dateKey <= b.endDate);
}

export function computeSlotsByDay(opts: {
  avail: Array<{ dayOfWeek: number; startTime: string; endTime: string }>;
  busy: Array<[number, number]>;
  from: number;
  to: number;
  durationMin: number;
  stepMin?: number;
  // Lot 5 (QC Disponibilité) — congés / fermetures ponctuelles : aucun créneau
  // proposé sur ces dates, sans toucher au planning hebdomadaire récurrent.
  blocked?: Array<{ startDate: string; endDate: string }>;
}): Record<string, string[]> {
  const { avail, busy, from, to, durationMin, stepMin = 30, blocked = [] } = opts;
  const slotsByDay: Record<string, string[]> = {};
  const minBookHorizon = Date.now() + 2 * 3600 * 1000;

  for (const jour of zonedCivilDays(from, to)) {
    const jourKey = `${jour.year}-${String(jour.month).padStart(2, "0")}-${String(jour.day).padStart(2, "0")}`;
    if (isDateBlocked(jourKey, blocked)) continue;
    for (const a of avail) {
      if (a.dayOfWeek !== jour.weekday) continue;
      const [sh, sm] = a.startTime.split(":").map(Number);
      const [eh, em] = a.endTime.split(":").map(Number);
      const start = zonedTimeToUtc(jour.year, jour.month, jour.day, sh, sm);
      const end = zonedTimeToUtc(jour.year, jour.month, jour.day, eh, em);
      for (let cur = start; cur + durationMin * 60000 <= end; cur += stepMin * 60000) {
        if (cur < minBookHorizon) continue;
        const slotEnd = cur + durationMin * 60000;
        if (busy.some(([s, e]) => cur < e && slotEnd > s)) continue;
        const key = zonedDateKey(cur);
        (slotsByDay[key] ||= []).push(new Date(cur).toISOString());
      }
    }
  }
  return slotsByDay;
}

/**
 * Le créneau demandé fait-il partie de ceux que le praticien propose réellement ?
 *
 * Ni POST /:slug/book ni POST /manage/:token/reschedule ne le vérifiaient : ils se
 * contentaient du non-chevauchement et de l'horizon de 2 h. Un POST fabriqué à la main
 * (ou un lien de report bricolé) plaçait donc un rendez-vous un dimanche à 3 h du matin,
 * hors de toute plage d'ouverture. On réutilise le calcul qui sert à AFFICHER les
 * créneaux : ce qui n'est pas proposé n'est pas réservable.
 */
async function creneauProposable(
  userId: number, startMs: number, durationMin: number, exclureApptId?: number,
): Promise<boolean> {
  const avail = await storage.listAvailability(userId);
  if (!avail.length) return false;
  const finJournee = startMs + 86400000;
  const existants = await storage.listAppointments(userId, startMs - 86400000, finJournee);
  const busy = existants
    .filter((a) => a.status !== "cancelled" && a.id !== exclureApptId)
    .map((a) => [a.startAt, (a as any).endAt] as [number, number]);
  const blocked = await storage.listBlockedDates(userId);
  const proposes = computeSlotsByDay({ avail, busy, from: startMs, to: startMs, durationMin, blocked });
  return (proposes[zonedDateKey(startMs)] || []).includes(new Date(startMs).toISOString());
}

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
    // Le test de truthiness reproduit l'ancien comportement : `?from=` (vide) doit
    // valoir « absent » → maintenant. Sans lui, Number("") vaut 0 et la fenêtre
    // basculait en 1970, renvoyant un praticien sans aucune disponibilité.
    const { from, to } = clampSlotWindow(
      req.query.from ? Number(req.query.from) : NaN,
      req.query.to ? Number(req.query.to) : NaN,
      21 * 86400000,
    );
    const durationMin = Math.max(15, Number(req.query.duration || 60));

    const avail = await storage.listAvailability(u.id);
    const appts = await storage.listAppointments(u.id, from, to);
    const busy = appts.filter(a => a.status !== "cancelled").map(a => [a.startAt, a.endAt] as [number, number]);
    const blocked = await storage.listBlockedDates(u.id);

    res.json({ slotsByDay: computeSlotsByDay({ avail, busy, from, to, durationMin, blocked }) });
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
    if (!(await creneauProposable(u.id, startAt, cat.durationMinutes))) {
      return res.status(409).json({ message: "Ce créneau n'est plus disponible" });
    }

    // ── Acompte Stripe : si activé, on redirige vers le paiement AVANT de créer le RDV.
    //    Le RDV ne sera créé qu'au retour (success_url) une fois le paiement confirmé.
    const depositPercent = (u as any).stripeDepositPercent || 0;
    const stripeKey = (u as any).stripeSecretKey || "";
    if (stripeKey && depositPercent > 0 && cat.priceCents > 0) {
      const depositCents = Math.round((cat.priceCents * depositPercent) / 100);
      if (depositCents > 0) {
        const APP = process.env.APP_URL || "https://app.ecole-naturo.fr";
        const session = await createCheckoutSession(stripeKey, {
          amountCents: depositCents,
          productName: `Acompte — ${cat.name} (${u.name})`,
          customerEmail: email,
          successUrl: `${APP}/api/public/pay/success?u=${u.id}&session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${APP}/api/public/pay/cancel`,
          metadata: {
            userId: String(u.id), categoryId: String(categoryId), startAt: String(startAt),
            firstName, lastName, email, phone, notes: notes || "", depositCents: String(depositCents),
          },
        });
        if ("url" in session) return res.json({ checkoutUrl: session.url });
        // Échec Stripe → on log et on retombe sur une réservation normale (ne jamais bloquer le client).
        console.error("[booking][stripe] création session échouée:", session.error);
      }
    }

    // Sérialisé par praticien : entre le contrôle de disponibilité et l'insertion, deux
    // réservations simultanées sur le dernier créneau passaient toutes les deux.
    const reservation = await serialiserParUser(u.id, async () => {
      if (!(await creneauProposable(u.id, startAt, cat.durationMinutes))) return null;
      return storage.createAppointment({
        userId: u.id, clientId: null, categoryId,
        startAt, endAt, status: "confirmed",
        clientFirstName: firstName, clientLastName: lastName,
        clientEmail: email, clientPhone: phone,
        notesBefore: notes || null,
        location: cat.location, googleEventId: null, reminderSent: false,
      });
    });
    if (!reservation) return res.status(409).json({ message: "Ce créneau n'est plus disponible" });
    let appt = reservation;

    // Jeton de gestion (annulation / report) créé DÈS la réservation. Il ne l'était
    // qu'au moment d'envoyer l'email de confirmation, après le `return` du cas « aucune
    // config email » : une praticienne sans email configuré, ou un envoi en échec,
    // laissait sa cliente sans aucun moyen d'annuler en ligne. Idempotent.
    try {
      await storage.ensureCancelToken(appt.id);
    } catch (e: any) {
      console.warn("[booking] ensureCancelToken:", e?.message || e);
    }

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

    // Lot 3 — la praticienne est prévenue de toute réservation en ligne : elle ne
    // l'était qu'en cas d'annulation ou de report, et sans synchro Google une
    // réservation pouvait passer totalement inaperçue.
    void sendNewBookingNotificationEmail(u, appt, cat).catch((e) =>
      console.error("[booking-notif]", e),
    );

    // Lot 5 (QC Page publique) — le frontend ne doit plus affirmer « une
    // confirmation a été envoyée » sans savoir si un envoi est seulement possible.
    res.json({ appointment: appt, category: cat, emailConfigured: !!getEmailConfigOrSystem(u) });
  });

  // ── Retour de paiement Stripe (acompte) ──────────────────────────────────────
  // success_url : on récupère la session avec la clé du praticien pour confirmer
  // le paiement, puis on crée le RDV (idempotent via stripe_session_id).
  app.get("/api/public/pay/success", async (req, res) => {
    const fail = (msg: string) =>
      res.status(400).type("html").send(htmlFeedbackPage("error", "Paiement", msg));
    const userId = Number(req.query.u);
    const sessionId = String(req.query.session_id || "");
    if (!userId || !sessionId) return fail("Lien de retour invalide.");
    const u = await storage.getUserById(userId);
    if (!u || !(u as any).stripeSecretKey) return fail("Praticien introuvable.");

    // Idempotence : si le RDV a déjà été créé pour cette session, afficher le succès.
    const already = await storage.getAppointmentByStripeSessionId(sessionId);
    if (already) {
      return res.type("html").send(htmlFeedbackPage("success", "Rendez-vous confirmé",
        "Votre acompte a été reçu et votre rendez-vous est confirmé. À très vite !"));
    }

    const session = await retrieveCheckoutSession((u as any).stripeSecretKey, sessionId);
    if (!session) return fail("Impossible de vérifier le paiement auprès de Stripe.");
    if (session.payment_status !== "paid") {
      return res.type("html").send(htmlFeedbackPage("warning", "Paiement non finalisé",
        "Votre paiement n'a pas été confirmé. Votre rendez-vous n'a pas été réservé."));
    }

    // Création déléguée au helper partagé : le rattrapage périodique
    // (reconcilierPaiementsStripe) emprunte exactement le même chemin, ce qui évite
    // qu'un acompte payé reste sans rendez-vous si le client ferme son onglet ici.
    const r = await creerRdvDepuisSessionPayee(u, session);
    if (r.statut === "donnees_invalides") return fail("Données de réservation invalides.");
    if (r.statut === "creneau_pris") {
      return res.type("html").send(htmlFeedbackPage("warning", "Créneau indisponible",
        "Ce créneau vient d'être réservé entre-temps. Votre acompte vous sera remboursé — contactez votre praticien."));
    }
    return res.type("html").send(htmlFeedbackPage("success", "Rendez-vous confirmé",
      "Votre acompte a été reçu et votre rendez-vous est confirmé. Vous allez recevoir un email de confirmation. À très vite !"));
  });

  app.get("/api/public/pay/cancel", async (_req, res) => {
    res.type("html").send(htmlFeedbackPage("warning", "Paiement annulé",
      "Votre rendez-vous n'a pas été réservé (paiement annulé). Vous pouvez relancer la réservation quand vous le souhaitez."));
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
  /**
   * GET /api/rdv/cancel/:token — page de CONFIRMATION, sans effet de bord.
   *
   * Cette route annulait le rendez-vous directement sur un GET. Or les messageries
   * pré-chargent les liens des emails pour les analyser (Outlook Safe Links, passerelles
   * antivirus d'entreprise, aperçus mobiles) : le rendez-vous disparaissait de l'agenda
   * sans que personne n'ait cliqué, la cliente se présentait sur un créneau libéré et la
   * praticienne recevait un « X a annulé » qui n'avait jamais eu lieu.
   *
   * L'annulation réelle passe désormais par la page de gestion, qui la déclenche en POST
   * après un clic explicite (et envoie les emails). Un GET ne modifie plus rien.
   */
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
    const dateText = formatRdvDate(appt.startAt);
    if ((appt as any).clientCancelledAt || appt.status === "cancelled") {
      return res.type("html").send(htmlFeedbackPage(
        "warning",
        "Rendez-vous déjà annulé",
        `Votre rendez-vous du ${escapeHtmlMin(dateText)} a déjà été annulé. Si c'est une erreur, contactez votre praticienne.`,
      ));
    }
    return res.type("html").send(htmlFeedbackPage(
      "warning",
      "Confirmer l'annulation",
      `Votre rendez-vous du <strong>${escapeHtmlMin(dateText)}</strong> n'est pas encore annulé.<br><br>` +
        `<a href="${APP_URL}/#/manage/${encodeURIComponent(token)}" ` +
        `style="display:inline-block;padding:12px 24px;border-radius:12px;background:#186749;color:#fff;` +
        `text-decoration:none;font-weight:700">Gérer mon rendez-vous</a><br><br>` +
        `<span style="font-size:13px;color:#6b7a76">Vous pourrez l'annuler ou le reporter depuis cette page.</span>`,
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
        primaryColor: user ? (user.primaryColor || null) : null,
        accentColor: user ? (user.accentColor || null) : null,
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

    // Annulation par le client — 2 emails :
    //   1) au CLIENT  : confirmation d'annulation (template éditable "cancellation")
    //   2) au PRATICIEN : notification "tel client a annulé" (hardcodé)
    try {
      const user = await storage.getUserById(appt.userId);
      // Clé du praticien si configurée, sinon clé système — sans le fallback, une
      // praticienne sans config Resend n'était jamais prévenue des annulations.
      const cfg = user ? getEmailConfigOrSystem(user) : null;
      if (user && cfg) {
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
        const cat = appt.categoryId ? await storage.getCategory(appt.categoryId) : null;
        // Heure LOCALE au fuseau applicatif, et non celle du process (UTC en prod).
        const heureRdv = zonedTimeKey(appt.startAt);

        // 1) Confirmation d'annulation au CLIENT (template éditable "cancellation").
        if (clientEmailAddr) {
          const tplVars: TemplateVars = {
            "client.name": clientName || "(client inconnu)",
            "client.email": clientEmailAddr,
            "appointment.date": rdvDateText,
            "appointment.time": heureRdv,
            "appointment.duration": cat?.durationMinutes ? `${cat.durationMinutes} min` : "",
            "appointment.category": cat?.name || "",
            "appointment.address": appt.location || cat?.location || "",
            "practitioner.name": user.name || user.email || "",
            "practitioner.email": user.email || "",
            "cancelLink": "",
          };
          const userTpl = await renderUserTemplate(user.id, "cancellation", tplVars);
          if (userTpl) {
            await sendEmail(cfg, clientEmailAddr, userTpl.subject, userTpl.html);
          }
        }

        // 2) Notification d'annulation au PRATICIEN (hardcodé, non éditable).
        if (user.email) {
          const notif = renderClientCancellationEmail({
            practitionerFirstName: (user.name || user.email).split(" ")[0],
            clientName: clientName || "(client inconnu)",
            rdvDateText,
            appUrl: APP_URL,
          });
          await sendEmail(cfg, user.email, notif.subject, notif.html, notif.text);
        }
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

    // Fenêtre par défaut : 7 jours, bornée à MAX_SLOT_WINDOW_MS (cf. clampSlotWindow).
    const { from, to } = clampSlotWindow(
      req.query.from ? new Date(String(req.query.from)).getTime() : NaN,
      req.query.to ? new Date(String(req.query.to)).getTime() : NaN,
      7 * 86400000,
    );
    const avail = await storage.listAvailability(u.id);
    const existing = await storage.listAppointments(u.id, from, to);
    // Exclure le RDV courant de la liste des conflits (il sera remplacé)
    const busy = existing
      .filter(a => a.status !== "cancelled" && a.id !== appt.id)
      .map(a => [a.startAt, (a as any).endAt] as [number, number]);
    const blocked = await storage.listBlockedDates(u.id);

    res.json({
      slotsByDay: computeSlotsByDay({ avail, busy, from, to, durationMin, blocked }),
      durationMinutes: durationMin,
    });
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

    // Le nouveau créneau doit être RÉELLEMENT proposé (plage d'ouverture + non occupé),
    // pas seulement libre : sans ça un report pouvait tomber un dimanche à 3 h du matin.
    if (!(await creneauProposable(u.id, newStartMs, durationMin, appt.id))) {
      return res.status(409).json({ message: "Ce créneau n'est plus disponible" });
    }

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

    // Google Agenda : retirer l'ancien créneau, poser le nouveau. Sans ça, la
    // praticienne gardait l'ancien rendez-vous bloqué dans son agenda et ne voyait
    // jamais le nouveau — elle n'était pas là au moment du report.
    try {
      await syncApptToGoogle("delete", appt.userId, appt as any);
      const eventId = await syncApptToGoogle("create", appt.userId, newAppt);
      if (eventId) await storage.updateAppointment(newAppt.id, { googleEventId: eventId } as any);
    } catch (e: any) {
      console.error("[reschedule][google]", e?.message || e);
    }

    // Confirmation à la cliente pour le NOUVEAU créneau (avec .ics et lien de gestion),
    // exactement comme une réservation. Elle n'en recevait aucune.
    try {
      const cat2 = newAppt.categoryId ? await storage.getCategory(newAppt.categoryId) : null;
      if (newAppt.clientEmail) {
        void sendBookingConfirmationEmail(u, newAppt, cat2).catch((e) =>
          console.error("[reschedule][confirm]", e),
        );
      }
      // Notification à la praticienne : son planning vient de changer sans elle.
      const cfg = getEmailConfigOrSystem(u);
      if (cfg && u.email) {
        const nom = `${newAppt.clientFirstName || ""} ${newAppt.clientLastName || ""}`.trim() || "(cliente inconnue)";
        await sendEmail(
          cfg, u.email,
          `Rendez-vous reporté — ${nom}`,
          `<p>Bonjour,</p><p><strong>${escapeHtmlMin(nom)}</strong> a reporté son rendez-vous.</p>` +
            `<p>Ancien créneau : ${escapeHtmlMin(formatRdvDate(appt.startAt))}<br>` +
            `Nouveau créneau : <strong>${escapeHtmlMin(formatRdvDate(newAppt.startAt))}</strong></p>` +
            `<p><a href="${APP_URL}/#/app/agenda">Voir mon agenda</a></p>`,
        );
      }
    } catch (e: any) {
      console.error("[reschedule][email]", e?.message || e);
    }

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
