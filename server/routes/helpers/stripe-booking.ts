/**
 * server/routes/helpers/stripe-booking.ts
 *
 * Création du rendez-vous à partir d'une Checkout Session Stripe PAYÉE.
 *
 * Cette logique vivait uniquement dans le handler `success_url`. Conséquence : si
 * le client payait puis fermait son onglet, perdait sa connexion ou que la
 * redirection échouait, l'acompte était encaissé et AUCUN rendez-vous n'était créé
 * — sans que ni le client ni le praticien en soient informés.
 *
 * Elle est désormais partagée entre deux appelants :
 *   - GET /api/public/pay/success   (chemin nominal, immédiat)
 *   - reconcilierPaiementsStripe()  (rattrapage périodique, cf. routes/cron.ts)
 *
 * ⚠️ L'idempotence NE repose PAS sur l'existence du rendez-vous. La suppression d'un
 * RDV est physique (storage.deleteAppointment) : si la praticienne supprimait un
 * rendez-vous réglé par acompte — doublon, no-show, ou client remboursé depuis le
 * tableau de bord Stripe —, la ligne disparaissait, le rattrapage ne voyait plus la
 * session comme traitée et RECRÉAIT le rendez-vous, avec un nouvel événement Google
 * Agenda et un second email au client, toutes les 30 minutes pendant 48 h. Un
 * remboursement Stripe ne repasse pas `payment_status` à autre chose que « paid »,
 * donc rien ne l'arrêtait.
 *
 * Le marqueur durable est la table `stripe_processed_sessions`, jamais purgée avec le
 * rendez-vous : une session traitée le reste, même si son RDV est supprimé ensuite.
 */

import { storage } from "../../storage";
import { listRecentPaidSessions } from "../../stripe";
import { syncApptToGoogle } from "./google-sync";
import { sendBookingConfirmationEmail, sendNewBookingNotificationEmail } from "./email-sending";

export type ResultatSessionPayee =
  | { statut: "cree"; appointmentId: number }
  | { statut: "deja_traitee" }
  | { statut: "creneau_pris" }
  | { statut: "donnees_invalides" };

/**
 * Crée le rendez-vous correspondant à une session Stripe payée.
 * `session` doit déjà avoir payment_status === "paid" (vérifié par l'appelant).
 */
export async function creerRdvDepuisSessionPayee(
  user: any,
  session: any,
): Promise<ResultatSessionPayee> {
  const sessionId = String(session?.id || "");
  if (!sessionId) return { statut: "donnees_invalides" };

  // Idempotence — deux verrous complémentaires :
  //  1. le marqueur durable, qui survit à la suppression du rendez-vous ;
  //  2. le rendez-vous lui-même, pour les sessions payées AVANT la mise en place du
  //     marqueur (elles n'en ont pas et ne doivent pas être recréées).
  if (await storage.isStripeSessionProcessed(sessionId)) return { statut: "deja_traitee" };
  if (await storage.getAppointmentByStripeSessionId(sessionId)) return { statut: "deja_traitee" };

  const m = session.metadata || {};
  const categoryId = Number(m.categoryId);
  const startAt = Number(m.startAt);
  const cat = categoryId ? await storage.getCategory(categoryId) : null;
  if (!cat || cat.userId !== user.id || !startAt) return { statut: "donnees_invalides" };

  const endAt = startAt + cat.durationMinutes * 60000;

  // Le créneau a pu être pris entre le paiement et la création (best-effort).
  const sameDay = await storage.listAppointments(user.id, startAt - 86400000, endAt + 86400000);
  if (sameDay.some((a) => a.status !== "cancelled" && startAt < a.endAt && endAt > a.startAt)) {
    return { statut: "creneau_pris" };
  }

  // Pose le marqueur AVANT de créer : l'insertion échoue sur la contrainte UNIQUE si
  // une autre exécution (success_url et rattrapage lancés en même temps, ou deux
  // workers Passenger) a déjà pris la session. Celle qui perd s'arrête ici, sans
  // créer de doublon — ce que le simple check-then-insert précédent ne garantissait pas.
  if (!(await storage.markStripeSessionProcessed(user.id, sessionId, null))) {
    return { statut: "deja_traitee" };
  }

  const depositCents = Number(m.depositCents) || Number(session.amount_total) || 0;
  let appt = await storage.createAppointment({
    userId: user.id, clientId: null, categoryId,
    startAt, endAt, status: "confirmed",
    clientFirstName: m.firstName || "", clientLastName: m.lastName || "",
    clientEmail: m.email || null, clientPhone: m.phone || null,
    notesBefore: m.notes || null,
    location: cat.location, googleEventId: null, reminderSent: false,
    paymentStatus: "paid", paymentAmountCents: depositCents,
    stripeSessionId: sessionId, depositAmountCents: depositCents,
  } as any);

  const eventId = await syncApptToGoogle("create", user.id, appt);
  if (eventId) {
    const refreshed = await storage.updateAppointment(appt.id, { googleEventId: eventId } as any);
    if (refreshed) appt = refreshed;
  }
  if (m.email) {
    void sendBookingConfirmationEmail(user, appt, cat).catch((e) =>
      console.error("[stripe-booking] email de confirmation:", e),
    );
  }
  // Lot 3 — notification praticienne, y compris pour les RDV repêchés par le
  // rattrapage périodique (créés sans aucun passage par l'interface).
  void sendNewBookingNotificationEmail(user, appt, cat, { depositCents }).catch((e) =>
    console.error("[stripe-booking] notification praticienne:", e),
  );
  return { statut: "cree", appointmentId: appt.id };
}

/**
 * Rattrapage : repêche les acomptes payés dont le rendez-vous n'a jamais été créé
 * (client qui ferme son onglet avant la redirection, réseau coupé, etc.).
 *
 * Fenêtre volontairement large (48 h par défaut) et sans état : l'idempotence par
 * stripe_session_id rend le passage rejouable autant de fois qu'on veut.
 * Best-effort de bout en bout — une panne Stripe ne doit jamais faire tomber le cron.
 */
export async function reconcilierPaiementsStripe(
  fenetreMs = 48 * 3600 * 1000,
): Promise<{ examines: number; crees: number; conflits: number }> {
  const bilan = { examines: 0, crees: 0, conflits: 0 };
  const depuis = Date.now() - fenetreMs;

  let praticiens: any[] = [];
  try {
    praticiens = (await storage.listAllUsers()).filter((u: any) => u.stripeSecretKey);
  } catch (e: any) {
    console.error("[stripe-reconcile] lecture des praticiens:", e?.message || e);
    return bilan;
  }

  for (const u of praticiens) {
    try {
      for (const session of await listRecentPaidSessions(u.stripeSecretKey, depuis)) {
        bilan.examines++;
        const r = await creerRdvDepuisSessionPayee(u, session);
        if (r.statut === "cree") {
          bilan.crees++;
          console.warn(
            `[stripe-reconcile] acompte payé sans RDV rattrapé — praticien=${u.id} ` +
              `session=${session.id} rdv=${r.appointmentId}`,
          );
        } else if (r.statut === "creneau_pris") {
          bilan.conflits++;
          console.error(
            `[stripe-reconcile] acompte payé mais créneau déjà pris — praticien=${u.id} ` +
              `session=${session.id} : remboursement à traiter manuellement`,
          );
        }
      }
    } catch (e: any) {
      console.error(`[stripe-reconcile] praticien=${u.id}:`, e?.message || e);
    }
  }
  return bilan;
}
