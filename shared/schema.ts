import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users — naturopathes
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  googleId: text("google_id"),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  bio: text("bio").default(""),
  photoUrl: text("photo_url"),
  phone: text("phone"),
  specialties: text("specialties").default("[]"), // JSON array
  address: text("address"),
  city: text("city"),
  createdAt: integer("created_at").notNull(),
  googleCalendarToken: text("google_calendar_token"), // JSON
  googleCalendarEmail: text("google_calendar_email"),
  emailRemindersEnabled: integer("email_reminders_enabled", { mode: "boolean" }).default(true),
  publicPageEnabled: integer("public_page_enabled", { mode: "boolean" }).default(true),
  primaryColor: text("primary_color").default("#186749"),
  accentColor: text("accent_color").default("#17EC9B"),
  // Apparence — préférence de thème de l'interface ("light" par défaut, "dark" sinon).
  themePreference: text("theme_preference").default("light"),
  // Réseaux sociaux affichés sur la page publique (optionnels).
  instagram: text("instagram"),
  facebook: text("facebook"),
  websiteUrl: text("website_url"),
  // Phase 0.7 — Email rappels via Resend
  resendApiKey: text("resend_api_key"),                       // clé personnelle de la praticienne (chiffrée plus tard)
  emailFromAddress: text("email_from_address"),               // ex "noreply@ecole-naturo.fr"
  emailFromName: text("email_from_name"),                     // ex "Cabinet Naturo Julien Rayes"
  dailyRecapEnabled: integer("daily_recap_enabled", { mode: "boolean" }).default(true),
  reminderHourLocal: integer("reminder_hour_local").default(10), // heure locale Europe/Bucharest
  recapHourLocal: integer("recap_hour_local").default(10),
  // Paiements en ligne (Stripe) — clé secrète perso + acompte (% du tarif, 0 = désactivé)
  stripeSecretKey: text("stripe_secret_key"),
  stripeDepositPercent: integer("stripe_deposit_percent").default(0),
  // Phase 1 — Facturation
  billingCompanyName: text("billing_company_name"),
  billingSiret: text("billing_siret"),
  billingAddress: text("billing_address"),
  billingPostalCode: text("billing_postal_code"),
  billingCity: text("billing_city"),
  billingCountry: text("billing_country").default("France"),
  billingIban: text("billing_iban"),
  billingBic: text("billing_bic"),
  billingLogoBase64: text("billing_logo_base64"),
  billingVatEnabled: integer("billing_vat_enabled", { mode: "boolean" }).default(false),
  billingVatRate: integer("billing_vat_rate").default(2000), // 2000 = 20.00%
  billingLegalMention: text("billing_legal_mention"),
  billingPaymentTerms: text("billing_payment_terms"),
  autoInvoiceOnCompleted: integer("auto_invoice_on_completed", { mode: "boolean" }).default(false),
  invoiceCounterYear: integer("invoice_counter_year").default(0),
  invoiceCounterValue: integer("invoice_counter_value").default(0),
  // Phase 3 Lot 1 — Multi-tenant SaaS
  plan: text("plan").notNull().default("trial"),
  trialEndsAt: integer("trial_ends_at"),
  emailVerifiedAt: integer("email_verified_at"),
  emailVerifyToken: text("email_verify_token"),
  emailVerifyExpiresAt: integer("email_verify_expires_at"),
  passwordResetToken: text("password_reset_token"),
  passwordResetExpiresAt: integer("password_reset_expires_at"),
  onboardingCompletedAt: integer("onboarding_completed_at"),
  // Avis Google — lien de dépôt d'avis + activation de l'envoi automatique
  googleReviewUrl: text("google_review_url"),
  reviewRequestEnabled: integer("review_request_enabled", { mode: "boolean" }).default(false),
});

// Invoices
export const invoices = sqliteTable("invoices", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  number: text("number").notNull(),
  status: text("status").notNull().default("draft"),
  issueDate: integer("issue_date").notNull(),
  dueDate: integer("due_date"),
  appointmentId: integer("appointment_id"),
  clientId: integer("client_id"),
  clientFirstName: text("client_first_name"),
  clientLastName: text("client_last_name"),
  clientEmail: text("client_email"),
  clientAddress: text("client_address"),
  clientPostalCode: text("client_postal_code"),
  clientCity: text("client_city"),
  subtotalCents: integer("subtotal_cents").notNull().default(0),
  vatCents: integer("vat_cents").notNull().default(0),
  totalCents: integer("total_cents").notNull().default(0),
  vatRate: integer("vat_rate").notNull().default(0),
  vatEnabled: integer("vat_enabled", { mode: "boolean" }).notNull().default(false),
  paymentMethod: text("payment_method"),
  paidAt: integer("paid_at"),
  sentAt: integer("sent_at"),
  notes: text("notes"),
  practitionerSnapshot: text("practitioner_snapshot"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const invoiceItems = sqliteTable("invoice_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  invoiceId: integer("invoice_id").notNull(),
  position: integer("position").notNull().default(0),
  description: text("description").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitPriceCents: integer("unit_price_cents").notNull().default(0),
  totalCents: integer("total_cents").notNull().default(0),
});

// Appointment categories
export const appointmentCategories = sqliteTable("appointment_categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(),
  durationMinutes: integer("duration_minutes").notNull().default(60),
  priceCents: integer("price_cents").notNull().default(0),
  location: text("location").default("cabinet"), // cabinet | visio | domicile
  color: text("color").default("#186749"),
  description: text("description"),
  isActive: integer("is_active", { mode: "boolean" }).default(true),
});

// Availability slots — recurring weekly
export const availabilitySlots = sqliteTable("availability_slots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  dayOfWeek: integer("day_of_week").notNull(), // 0=Sun..6=Sat
  startTime: text("start_time").notNull(), // "09:00"
  endTime: text("end_time").notNull(),     // "12:00"
});

// Clients
export const clients = sqliteTable("clients", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  dateOfBirth: text("date_of_birth"),
  address: text("address"),
  allergies: text("allergies"),
  antecedents: text("antecedents"),
  lifestyleNotes: text("lifestyle_notes"),
  penseBete: text("pense_bete"),
  createdAt: integer("created_at").notNull(),
});

// Appointments
export const appointments = sqliteTable("appointments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  clientId: integer("client_id"),
  categoryId: integer("category_id"),
  startAt: integer("start_at").notNull(), // unix ms
  endAt: integer("end_at").notNull(),
  status: text("status").default("confirmed"), // confirmed/cancelled/completed/blocked
  clientFirstName: text("client_first_name"),
  clientLastName: text("client_last_name"),
  clientEmail: text("client_email"),
  clientPhone: text("client_phone"),
  notesBefore: text("notes_before"),
  location: text("location"),
  googleEventId: text("google_event_id"),
  googleMeetLink: text("google_meet_link"),
  stripeSessionId: text("stripe_session_id"),
  depositAmountCents: integer("deposit_amount_cents"),
  reminderSent: integer("reminder_sent", { mode: "boolean" }).default(false),
  reminderSentAt: integer("reminder_sent_at"),
  // Phase 0.7 — Tokens publics pour confirmer/annuler depuis l'email
  confirmToken: text("confirm_token"),
  // PHASE 3.5-B — Manage token : 32 hex chars (16 bytes randomBytes), nullable, sans default
  cancelToken: text("cancel_token"),
  clientConfirmedAt: integer("client_confirmed_at"),
  clientCancelledAt: integer("client_cancelled_at"),
  // Paiement (Phase 0.6 BIS, en attendant Phase 1 facturation)
  paymentStatus: text("payment_status").default("unpaid"), // unpaid | paid | partial
  paymentAmountCents: integer("payment_amount_cents").default(0),
  // Origine du RDV : manual (saisi dans Naturo) | google (importé de Google Calendar) | public (book public)
  source: text("source").default("manual"),
  createdAt: integer("created_at").notNull(),
  // Avis Google — timestamp d'envoi de la demande (idempotence)
  reviewEmailSentAt: integer("review_email_sent_at"),
});

// Consultation notes
export const consultationNotes = sqliteTable("consultation_notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  appointmentId: integer("appointment_id"),
  // Nullable : une note peut concerner un RDV "walk-in" sans fiche client liée.
  clientId: integer("client_id"),
  userId: integer("user_id").notNull(),
  motif: text("motif"),
  anamnese: text("anamnese"),
  bilan: text("bilan"),
  conseilsAlimentaires: text("conseils_alimentaires"),
  hygieneDeVie: text("hygiene_de_vie"),
  suivi: text("suivi"),
  notesLibres: text("notes_libres"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

// Sessions for auth
export const sessions = sqliteTable("sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: integer("expires_at").notNull(),
});

// ─── Lot métier (Phase 0) — Anamnèse, Programmes, Documents ───────────────────
// Anamnèse : modèles de questionnaires d'intake (questions = JSON).
export const anamnesisTemplates = sqliteTable("anamnesis_templates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  questions: text("questions").notNull().default("[]"), // JSON: [{id,label,type,options?,required?}]
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

// Anamnèse : réponses d'une cliente (saisie via lien public par token).
export const anamnesisResponses = sqliteTable("anamnesis_responses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  templateId: integer("template_id"),
  clientId: integer("client_id"),
  appointmentId: integer("appointment_id"),
  token: text("token").notNull(), // lien public de saisie
  answers: text("answers"), // JSON: { [questionId]: value }
  submittedAt: integer("submitted_at"),
  createdAt: integer("created_at").notNull(),
});

// Programmes d'hygiène de vie (protocole construit pour une cliente).
export const programs = sqliteTable("programs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  clientId: integer("client_id"),
  appointmentId: integer("appointment_id"),
  title: text("title").notNull(),
  content: text("content").notNull().default("[]"), // JSON: [{section,items[]}]
  status: text("status").default("draft"), // draft | sent
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

// Documents attachés à une fiche cliente (stockés en base64).
export const clientDocuments = sqliteTable("client_documents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  clientId: integer("client_id").notNull(),
  filename: text("filename").notNull(),
  mimeType: text("mime_type"),
  sizeBytes: integer("size_bytes"),
  dataBase64: text("data_base64").notNull(),
  createdAt: integer("created_at").notNull(),
});

// Forfaits / carnets de séances prépayées
export const packages = sqliteTable("packages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  clientId: integer("client_id").notNull(),
  name: text("name").notNull(),
  totalSessions: integer("total_sessions").notNull(),
  usedSessions: integer("used_sessions").notNull().default(0),
  priceCents: integer("price_cents").default(0),
  notes: text("notes"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

// Base de solutions naturelles (catalogue de référence : plantes, HE, compléments…)
// userId null = entrée globale fournie par l'app ; non-null = entrée perso du praticien.
export const naturalSolutions = sqliteTable("natural_solutions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id"),
  name: text("name").notNull(),
  category: text("category").notNull().default("Plante"),
  properties: text("properties"),
  contraindications: text("contraindications"),
  usageNotes: text("usage_notes"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertCategorySchema = createInsertSchema(appointmentCategories).omit({ id: true });
export const insertAvailabilitySchema = createInsertSchema(availabilitySlots).omit({ id: true });
export const insertClientSchema = createInsertSchema(clients).omit({ id: true, createdAt: true, userId: true });
export const insertAppointmentSchema = createInsertSchema(appointments).omit({ id: true, createdAt: true });
export const insertNoteSchema = createInsertSchema(consultationNotes).omit({ id: true, createdAt: true, updatedAt: true });
export const insertInvoiceSchema = createInsertSchema(invoices).omit({ id: true, createdAt: true, updatedAt: true });
export const insertInvoiceItemSchema = createInsertSchema(invoiceItems).omit({ id: true });
export const insertAnamnesisTemplateSchema = createInsertSchema(anamnesisTemplates).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAnamnesisResponseSchema = createInsertSchema(anamnesisResponses).omit({ id: true, createdAt: true });
export const insertProgramSchema = createInsertSchema(programs).omit({ id: true, createdAt: true, updatedAt: true });
export const insertClientDocumentSchema = createInsertSchema(clientDocuments).omit({ id: true, createdAt: true });
export const insertNaturalSolutionSchema = createInsertSchema(naturalSolutions).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPackageSchema = createInsertSchema(packages).omit({ id: true, createdAt: true, updatedAt: true });

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type AppointmentCategory = typeof appointmentCategories.$inferSelect;
export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type AvailabilitySlot = typeof availabilitySlots.$inferSelect;
export type InsertAvailability = z.infer<typeof insertAvailabilitySchema>;
export type Client = typeof clients.$inferSelect;
export type InsertClient = z.infer<typeof insertClientSchema>;
export type Appointment = typeof appointments.$inferSelect;
export type InsertAppointment = z.infer<typeof insertAppointmentSchema>;
export type ConsultationNote = typeof consultationNotes.$inferSelect;
export type InsertNote = z.infer<typeof insertNoteSchema>;
export type Session = typeof sessions.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type InvoiceItem = typeof invoiceItems.$inferSelect;
export type InsertInvoiceItem = z.infer<typeof insertInvoiceItemSchema>;
export type AnamnesisTemplate = typeof anamnesisTemplates.$inferSelect;
export type InsertAnamnesisTemplate = z.infer<typeof insertAnamnesisTemplateSchema>;
export type AnamnesisResponse = typeof anamnesisResponses.$inferSelect;
export type InsertAnamnesisResponse = z.infer<typeof insertAnamnesisResponseSchema>;
export type Program = typeof programs.$inferSelect;
export type InsertProgram = z.infer<typeof insertProgramSchema>;
export type ClientDocument = typeof clientDocuments.$inferSelect;
export type InsertClientDocument = z.infer<typeof insertClientDocumentSchema>;
export type NaturalSolution = typeof naturalSolutions.$inferSelect;
export type InsertNaturalSolution = z.infer<typeof insertNaturalSolutionSchema>;
export type Package = typeof packages.$inferSelect;
export type InsertPackage = z.infer<typeof insertPackageSchema>;

// Public-facing user shape (no secrets)
export type PublicUser = Omit<User, "passwordHash" | "googleCalendarToken" | "googleId">;

// PHASE 3.5-C — Email templates
// Trois templates éditables par praticienne : confirmation RDV, rappel J-1, annulation.
// Si aucune entrée n'existe en DB pour {userId, kind}, le serveur retourne le template par défaut.
export const emailTemplates = sqliteTable("email_templates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  kind: text("kind").notNull(), // 'confirmation' | 'reminder_d1' | 'cancellation'
  subject: text("subject").notNull(),
  bodyHtml: text("body_html").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const insertEmailTemplateSchema = createInsertSchema(emailTemplates).omit({ id: true });

export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type InsertEmailTemplate = z.infer<typeof insertEmailTemplateSchema>;
