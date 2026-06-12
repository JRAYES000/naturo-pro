import {
  mysqlTable,
  varchar,
  text,
  longtext,
  int,
  boolean,
  bigint,
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── Users — naturopathes ─────────────────────────────────────────────────────
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }),
  googleId: varchar("google_id", { length: 255 }),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  bio: text("bio").default(""),
  photoUrl: text("photo_url"),
  phone: varchar("phone", { length: 50 }),
  specialties: text("specialties").default("[]"), // JSON array
  address: text("address"),
  city: varchar("city", { length: 255 }),
  // Unix ms stored as bigint (matches SQLite integer behaviour)
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  googleCalendarToken: text("google_calendar_token"), // JSON
  googleCalendarEmail: varchar("google_calendar_email", { length: 255 }),
  emailRemindersEnabled: boolean("email_reminders_enabled").notNull().default(true),
  publicPageEnabled: boolean("public_page_enabled").notNull().default(true),
  primaryColor: varchar("primary_color", { length: 20 }).default("#186749"),
  accentColor: varchar("accent_color", { length: 20 }).default("#17EC9B"),
  // Réseaux sociaux affichés sur la page publique (optionnels).
  instagram: varchar("instagram", { length: 255 }),
  facebook: varchar("facebook", { length: 255 }),
  websiteUrl: varchar("website_url", { length: 255 }),
  // Phase 0.7 — Email rappels via Resend
  resendApiKey: varchar("resend_api_key", { length: 255 }),
  emailFromAddress: varchar("email_from_address", { length: 255 }),
  emailFromName: varchar("email_from_name", { length: 255 }),
  dailyRecapEnabled: boolean("daily_recap_enabled").notNull().default(true),
  reminderHourLocal: int("reminder_hour_local").notNull().default(10),
  recapHourLocal: int("recap_hour_local").notNull().default(10),
  // Paiements en ligne (Stripe)
  stripeSecretKey: varchar("stripe_secret_key", { length: 255 }),
  stripeDepositPercent: int("stripe_deposit_percent").default(0),
  // Phase 1 — Facturation
  billingCompanyName: varchar("billing_company_name", { length: 255 }),
  billingSiret: varchar("billing_siret", { length: 32 }),
  billingAddress: text("billing_address"),
  billingPostalCode: varchar("billing_postal_code", { length: 20 }),
  billingCity: varchar("billing_city", { length: 255 }),
  billingCountry: varchar("billing_country", { length: 100 }).default("France"),
  billingIban: varchar("billing_iban", { length: 64 }),
  billingBic: varchar("billing_bic", { length: 32 }),
  billingLogoBase64: text("billing_logo_base64"), // image stockée en base64 (data URL)
  billingVatEnabled: boolean("billing_vat_enabled").notNull().default(false),
  billingVatRate: int("billing_vat_rate").notNull().default(2000), // 2000 = 20.00%, stocké *100
  billingLegalMention: text("billing_legal_mention"), // mention légale custom (sinon défaut)
  billingPaymentTerms: text("billing_payment_terms"), // conditions de paiement
  autoInvoiceOnCompleted: boolean("auto_invoice_on_completed").notNull().default(false),
  invoiceCounterYear: int("invoice_counter_year").notNull().default(0),
  invoiceCounterValue: int("invoice_counter_value").notNull().default(0),
  // Phase 3 Lot 1 — Multi-tenant SaaS
  plan: varchar("plan", { length: 32 }).notNull().default("trial"),
  trialEndsAt: bigint("trial_ends_at", { mode: "number" }),
  emailVerifiedAt: bigint("email_verified_at", { mode: "number" }),
  emailVerifyToken: varchar("email_verify_token", { length: 128 }),
  emailVerifyExpiresAt: bigint("email_verify_expires_at", { mode: "number" }),
  passwordResetToken: varchar("password_reset_token", { length: 128 }),
  passwordResetExpiresAt: bigint("password_reset_expires_at", { mode: "number" }),
  onboardingCompletedAt: bigint("onboarding_completed_at", { mode: "number" }),
  // Avis Google — lien de dépôt d'avis + activation de l'envoi automatique
  googleReviewUrl: varchar("google_review_url", { length: 512 }),
  reviewRequestEnabled: boolean("review_request_enabled").notNull().default(false),
  // Apparence — préférence de thème de l'interface ("dark" par défaut, "light" sinon).
  themePreference: varchar("theme_preference", { length: 16 }).notNull().default("dark"),
});

// ─── Invoices ──────────────────────────────────────────────────────────────────
export const invoices = mysqlTable("invoices", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  number: varchar("number", { length: 32 }).notNull(), // FACT-2026-0001
  status: varchar("status", { length: 20 }).notNull().default("draft"), // draft | sent | paid | cancelled
  issueDate: bigint("issue_date", { mode: "number" }).notNull(),
  dueDate: bigint("due_date", { mode: "number" }),
  // Lien optionnel
  appointmentId: int("appointment_id"),
  clientId: int("client_id"),
  // Snapshot client (toujours rempli, même si client supprimé plus tard)
  clientFirstName: varchar("client_first_name", { length: 255 }),
  clientLastName: varchar("client_last_name", { length: 255 }),
  clientEmail: varchar("client_email", { length: 255 }),
  clientAddress: text("client_address"),
  clientPostalCode: varchar("client_postal_code", { length: 20 }),
  clientCity: varchar("client_city", { length: 255 }),
  // Totaux (en centimes)
  subtotalCents: int("subtotal_cents").notNull().default(0), // HT
  vatCents: int("vat_cents").notNull().default(0),
  totalCents: int("total_cents").notNull().default(0), // TTC
  vatRate: int("vat_rate").notNull().default(0), // *100, ex 2000 = 20%
  vatEnabled: boolean("vat_enabled").notNull().default(false),
  // Paiement
  paymentMethod: varchar("payment_method", { length: 20 }), // cash | check | transfer | card
  paidAt: bigint("paid_at", { mode: "number" }),
  sentAt: bigint("sent_at", { mode: "number" }),
  notes: text("notes"),
  // Snapshot praticienne (au moment de l'émission, figé même si Settings change ensuite)
  practitionerSnapshot: text("practitioner_snapshot"), // JSON: nom, SIRET, adresse, IBAN, etc.
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});

export const invoiceItems = mysqlTable("invoice_items", {
  id: int("id").autoincrement().primaryKey(),
  invoiceId: int("invoice_id").notNull(),
  position: int("position").notNull().default(0),
  description: text("description").notNull(),
  quantity: int("quantity").notNull().default(1), // entiers
  unitPriceCents: int("unit_price_cents").notNull().default(0), // HT par unité
  totalCents: int("total_cents").notNull().default(0), // qty * unit_price (HT)
});

// ─── Appointment categories ───────────────────────────────────────────────────
export const appointmentCategories = mysqlTable("appointment_categories", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  durationMinutes: int("duration_minutes").notNull().default(60),
  priceCents: int("price_cents").notNull().default(0),
  location: varchar("location", { length: 50 }).default("cabinet"), // cabinet | visio | domicile
  color: varchar("color", { length: 20 }).default("#186749"),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
});

// ─── Availability slots — recurring weekly ────────────────────────────────────
export const availabilitySlots = mysqlTable("availability_slots", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  dayOfWeek: int("day_of_week").notNull(), // 0=Sun..6=Sat
  startTime: varchar("start_time", { length: 10 }).notNull(), // "09:00"
  endTime: varchar("end_time", { length: 10 }).notNull(),     // "12:00"
});

// ─── Clients ──────────────────────────────────────────────────────────────────
export const clients = mysqlTable("clients", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  firstName: varchar("first_name", { length: 255 }).notNull(),
  lastName: varchar("last_name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  dateOfBirth: varchar("date_of_birth", { length: 20 }),
  address: text("address"),
  allergies: text("allergies"),
  antecedents: text("antecedents"),
  lifestyleNotes: text("lifestyle_notes"),
  penseBete: text("pense_bete"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

// ─── Appointments ─────────────────────────────────────────────────────────────
export const appointments = mysqlTable("appointments", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  clientId: int("client_id"),
  categoryId: int("category_id"),
  startAt: bigint("start_at", { mode: "number" }).notNull(), // unix ms
  endAt: bigint("end_at", { mode: "number" }).notNull(),
  status: varchar("status", { length: 20 }).default("confirmed"), // confirmed/cancelled/completed/blocked
  clientFirstName: varchar("client_first_name", { length: 255 }),
  clientLastName: varchar("client_last_name", { length: 255 }),
  clientEmail: varchar("client_email", { length: 255 }),
  clientPhone: varchar("client_phone", { length: 50 }),
  notesBefore: text("notes_before"),
  location: varchar("location", { length: 50 }),
  googleEventId: varchar("google_event_id", { length: 255 }),
  googleMeetLink: varchar("google_meet_link", { length: 512 }),
  stripeSessionId: varchar("stripe_session_id", { length: 255 }),
  depositAmountCents: int("deposit_amount_cents"),
  reminderSent: boolean("reminder_sent").notNull().default(false),
  reminderSentAt: bigint("reminder_sent_at", { mode: "number" }),
  // Phase 0.7 — Tokens publics pour confirmer/annuler depuis l'email
  confirmToken: varchar("confirm_token", { length: 64 }),
  cancelToken: varchar("cancel_token", { length: 64 }),
  clientConfirmedAt: bigint("client_confirmed_at", { mode: "number" }),
  clientCancelledAt: bigint("client_cancelled_at", { mode: "number" }),
  paymentStatus: varchar("payment_status", { length: 20 }).default("unpaid"), // unpaid | paid | partial
  paymentAmountCents: int("payment_amount_cents").default(0),
  source: varchar("source", { length: 20 }).default("manual"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  // Avis Google — timestamp d'envoi de la demande (idempotence)
  reviewEmailSentAt: bigint("review_email_sent_at", { mode: "number" }),
});

// ─── Consultation notes ───────────────────────────────────────────────────────
export const consultationNotes = mysqlTable("consultation_notes", {
  id: int("id").autoincrement().primaryKey(),
  appointmentId: int("appointment_id"),
  // Nullable : une note peut concerner un RDV "walk-in" sans fiche client liée.
  clientId: int("client_id"),
  userId: int("user_id").notNull(),
  motif: text("motif"),
  anamnese: text("anamnese"),
  bilan: text("bilan"),
  conseilsAlimentaires: text("conseils_alimentaires"),
  hygieneDeVie: text("hygiene_de_vie"),
  suivi: text("suivi"),
  notesLibres: text("notes_libres"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});

// ─── Sessions for auth ────────────────────────────────────────────────────────
export const sessions = mysqlTable("sessions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  token: varchar("token", { length: 128 }).notNull().unique(),
  expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
});

// PHASE 3.5-C — Email templates
export const emailTemplates = mysqlTable("email_templates", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  kind: varchar("kind", { length: 50 }).notNull(),
  subject: varchar("subject", { length: 500 }).notNull(),
  bodyHtml: text("body_html").notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});

// ─── Lot métier (Phase 0) — Anamnèse, Programmes, Documents ───────────────────
export const anamnesisTemplates = mysqlTable("anamnesis_templates", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  questions: text("questions").notNull(), // JSON
  isActive: boolean("is_active").default(true),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});

export const anamnesisResponses = mysqlTable("anamnesis_responses", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  templateId: int("template_id"),
  clientId: int("client_id"),
  appointmentId: int("appointment_id"),
  token: varchar("token", { length: 64 }).notNull(),
  answers: text("answers"), // JSON
  submittedAt: bigint("submitted_at", { mode: "number" }),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const programs = mysqlTable("programs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  clientId: int("client_id"),
  appointmentId: int("appointment_id"),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(), // JSON
  status: varchar("status", { length: 20 }).default("draft"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});

export const clientDocuments = mysqlTable("client_documents", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  clientId: int("client_id").notNull(),
  filename: varchar("filename", { length: 255 }).notNull(),
  mimeType: varchar("mime_type", { length: 128 }),
  sizeBytes: int("size_bytes"),
  dataBase64: longtext("data_base64").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

// ─── Forfaits / carnets de séances prépayées ─────────────────────────────────
export const packages = mysqlTable("packages", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  clientId: int("client_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  totalSessions: int("total_sessions").notNull(),
  usedSessions: int("used_sessions").notNull().default(0),
  priceCents: int("price_cents").default(0),
  notes: text("notes"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});

export const naturalSolutions = mysqlTable("natural_solutions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id"),
  name: varchar("name", { length: 255 }).notNull(),
  category: varchar("category", { length: 80 }).notNull().default("Plante"),
  properties: text("properties"),
  contraindications: text("contraindications"),
  usageNotes: text("usage_notes"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});

// ─── Insert schemas (same names as schema.ts so imports are swappable) ────────
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertCategorySchema = createInsertSchema(appointmentCategories).omit({ id: true });
export const insertAvailabilitySchema = createInsertSchema(availabilitySlots).omit({ id: true });
export const insertClientSchema = createInsertSchema(clients).omit({ id: true, createdAt: true, userId: true });
export const insertAppointmentSchema = createInsertSchema(appointments).omit({ id: true, createdAt: true });
export const insertNoteSchema = createInsertSchema(consultationNotes).omit({ id: true, createdAt: true, updatedAt: true });
export const insertInvoiceSchema = createInsertSchema(invoices).omit({ id: true, createdAt: true, updatedAt: true });
export const insertInvoiceItemSchema = createInsertSchema(invoiceItems).omit({ id: true });
export const insertEmailTemplateSchema = createInsertSchema(emailTemplates).omit({ id: true });
export const insertAnamnesisTemplateSchema = createInsertSchema(anamnesisTemplates).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAnamnesisResponseSchema = createInsertSchema(anamnesisResponses).omit({ id: true, createdAt: true });
export const insertProgramSchema = createInsertSchema(programs).omit({ id: true, createdAt: true, updatedAt: true });
export const insertClientDocumentSchema = createInsertSchema(clientDocuments).omit({ id: true, createdAt: true });
export const insertNaturalSolutionSchema = createInsertSchema(naturalSolutions).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPackageSchema = createInsertSchema(packages).omit({ id: true, createdAt: true, updatedAt: true });

// ─── Types (same names as schema.ts so imports are swappable) ─────────────────
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
export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type InsertEmailTemplate = z.infer<typeof insertEmailTemplateSchema>;
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
