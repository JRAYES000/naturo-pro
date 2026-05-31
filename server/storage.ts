/**
 * server/storage.ts — Database access layer
 *
 * Uses the Drizzle `db` instance from ./db (SQLite or MySQL depending on the
 * DB_DRIVER environment variable).  All methods are async/await.
 *
 * Dual-driver notes
 * ─────────────────
 * • SQLite Drizzle  : supports .returning() — we use it for inserts/updates.
 * • MySQL Drizzle   : no .returning() — we re-select after write operations.
 *   The `insertOrUpdate` helpers below abstract that difference.
 *
 * • .get() is SQLite-only.  We use the `first()` helper instead (works on
 *   both drivers since db.select()... always returns a Promise<Row[]>).
 */

import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import {
  users, appointmentCategories, availabilitySlots, clients, appointments,
  consultationNotes, sessions, invoices, invoiceItems, emailTemplates,
} from "@shared/schema-active";
import type {
  User, InsertUser, AppointmentCategory, InsertCategory, AvailabilitySlot,
  InsertAvailability, Client, InsertClient, Appointment, InsertAppointment,
  ConsultationNote, InsertNote, Session, Invoice, InsertInvoice,
  InvoiceItem, InsertInvoiceItem, EmailTemplate,
} from "@shared/schema-active";
import { eq, and, gte, lte, desc, like, or, sql } from "drizzle-orm";
import { db, DB_DRIVER } from "./db";

// Compat dual ESM/CJS : tsx (dev) utilise import.meta.url ; esbuild bundle en CJS
// où import.meta vaut {} → fallback sur __filename (natif CJS).
const require = createRequire(import.meta.url || __filename);

// Re-export db so that routes.ts can import it directly (backwards-compat)
export { db };

// ── SQLite-only: auto-create tables on first startup ─────────────────────────
// In MySQL mode the tables are created via `npm run db:push:mysql`.
if (DB_DRIVER !== "mysql") {
  // require() is synchronous, compatible with any tsconfig module target.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const BetterSqlite = require("better-sqlite3") as typeof import("better-sqlite3");
  const raw = new BetterSqlite("data.db");
  raw.pragma("journal_mode = WAL");
  raw.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT,
      google_id TEXT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      bio TEXT DEFAULT '',
      photo_url TEXT,
      phone TEXT,
      specialties TEXT DEFAULT '[]',
      address TEXT,
      city TEXT,
      created_at INTEGER NOT NULL,
      google_calendar_token TEXT,
      google_calendar_email TEXT,
      email_reminders_enabled INTEGER DEFAULT 1,
      public_page_enabled INTEGER DEFAULT 1,
      primary_color TEXT DEFAULT '#186749',
      accent_color TEXT DEFAULT '#17EC9B',
      instagram TEXT,
      facebook TEXT,
      website_url TEXT,
      resend_api_key TEXT,
      email_from_address TEXT,
      email_from_name TEXT,
      daily_recap_enabled INTEGER DEFAULT 1,
      reminder_hour_local INTEGER DEFAULT 10,
      recap_hour_local INTEGER DEFAULT 10,
      billing_company_name TEXT,
      billing_siret TEXT,
      billing_address TEXT,
      billing_postal_code TEXT,
      billing_city TEXT,
      billing_country TEXT DEFAULT 'France',
      billing_iban TEXT,
      billing_bic TEXT,
      billing_logo_base64 TEXT,
      billing_vat_enabled INTEGER DEFAULT 0,
      billing_vat_rate INTEGER DEFAULT 2000,
      billing_legal_mention TEXT,
      billing_payment_terms TEXT,
      auto_invoice_on_completed INTEGER DEFAULT 0,
      invoice_counter_year INTEGER DEFAULT 0,
      invoice_counter_value INTEGER DEFAULT 0,
      plan TEXT NOT NULL DEFAULT 'trial',
      trial_ends_at INTEGER,
      email_verified_at INTEGER,
      email_verify_token TEXT,
      email_verify_expires_at INTEGER,
      password_reset_token TEXT,
      password_reset_expires_at INTEGER,
      onboarding_completed_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS appointment_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL DEFAULT 60,
      price_cents INTEGER NOT NULL DEFAULT 0,
      location TEXT DEFAULT 'cabinet',
      color TEXT DEFAULT '#186749',
      description TEXT,
      is_active INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS availability_slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      day_of_week INTEGER NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      date_of_birth TEXT,
      address TEXT,
      allergies TEXT,
      antecedents TEXT,
      lifestyle_notes TEXT,
      pense_bete TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      client_id INTEGER,
      category_id INTEGER,
      start_at INTEGER NOT NULL,
      end_at INTEGER NOT NULL,
      status TEXT DEFAULT 'confirmed',
      client_first_name TEXT,
      client_last_name TEXT,
      client_email TEXT,
      client_phone TEXT,
      notes_before TEXT,
      location TEXT,
      google_event_id TEXT,
      reminder_sent INTEGER DEFAULT 0,
      reminder_sent_at INTEGER,
      confirm_token TEXT,
      cancel_token TEXT,
      client_confirmed_at INTEGER,
      client_cancelled_at INTEGER,
      payment_status TEXT DEFAULT 'unpaid',
      payment_amount_cents INTEGER DEFAULT 0,
      source TEXT DEFAULT 'manual',
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS consultation_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      appointment_id INTEGER,
      client_id INTEGER,
      user_id INTEGER NOT NULL,
      motif TEXT,
      anamnese TEXT,
      bilan TEXT,
      conseils_alimentaires TEXT,
      hygiene_de_vie TEXT,
      suivi TEXT,
      notes_libres TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      number TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      issue_date INTEGER NOT NULL,
      due_date INTEGER,
      appointment_id INTEGER,
      client_id INTEGER,
      client_first_name TEXT,
      client_last_name TEXT,
      client_email TEXT,
      client_address TEXT,
      client_postal_code TEXT,
      client_city TEXT,
      subtotal_cents INTEGER NOT NULL DEFAULT 0,
      vat_cents INTEGER NOT NULL DEFAULT 0,
      total_cents INTEGER NOT NULL DEFAULT 0,
      vat_rate INTEGER NOT NULL DEFAULT 0,
      vat_enabled INTEGER NOT NULL DEFAULT 0,
      payment_method TEXT,
      paid_at INTEGER,
      sent_at INTEGER,
      notes TEXT,
      practitioner_snapshot TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      description TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price_cents INTEGER NOT NULL DEFAULT 0,
      total_cents INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS email_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      kind TEXT NOT NULL,
      subject TEXT NOT NULL,
      body_html TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(user_id, kind)
    );
    CREATE TABLE IF NOT EXISTS anamnesis_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      questions TEXT NOT NULL DEFAULT '[]',
      is_active INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS anamnesis_responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      template_id INTEGER,
      client_id INTEGER,
      appointment_id INTEGER,
      token TEXT NOT NULL,
      answers TEXT,
      submitted_at INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS programs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      client_id INTEGER NOT NULL,
      appointment_id INTEGER,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '[]',
      status TEXT DEFAULT 'draft',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS client_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      client_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      mime_type TEXT,
      size_bytes INTEGER,
      data_base64 TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);
  // PHASE 3.5-B — Manage token : colonnes appointments (best-effort migration SQLite)
  const apptMigCols = [
    "reminder_sent_at INTEGER",
    "confirm_token TEXT",
    "cancel_token TEXT",
    "client_confirmed_at INTEGER",
    "client_cancelled_at INTEGER",
    "payment_status TEXT DEFAULT 'unpaid'",
    "payment_amount_cents INTEGER DEFAULT 0",
    "source TEXT DEFAULT 'manual'",
    "google_meet_link TEXT",
  ];
  for (const col of apptMigCols) {
    try { raw.exec(`ALTER TABLE appointments ADD COLUMN ${col}`); } catch { /* already exists */ }
  }
  // Phase 1 — colonnes facturation sur users (best-effort migration SQLite)
  const billingCols = [
    "billing_company_name TEXT",
    "billing_siret TEXT",
    "billing_address TEXT",
    "billing_postal_code TEXT",
    "billing_city TEXT",
    "billing_country TEXT DEFAULT 'France'",
    "billing_iban TEXT",
    "billing_bic TEXT",
    "billing_logo_base64 TEXT",
    "billing_vat_enabled INTEGER DEFAULT 0",
    "billing_vat_rate INTEGER DEFAULT 2000",
    "billing_legal_mention TEXT",
    "billing_payment_terms TEXT",
    "auto_invoice_on_completed INTEGER DEFAULT 0",
    "invoice_counter_year INTEGER DEFAULT 0",
    "invoice_counter_value INTEGER DEFAULT 0",
  ];
  for (const col of billingCols) {
    try { raw.exec(`ALTER TABLE users ADD COLUMN ${col}`); } catch { /* already exists */ }
  }
  // Phase 0.7 — colonnes email Resend sur users (best-effort migration SQLite)
  const resendCols = [
    "resend_api_key TEXT",
    "email_from_address TEXT",
    "email_from_name TEXT",
    "daily_recap_enabled INTEGER DEFAULT 1",
    "reminder_hour_local INTEGER DEFAULT 10",
    "recap_hour_local INTEGER DEFAULT 10",
  ];
  for (const col of resendCols) {
    try { raw.exec(`ALTER TABLE users ADD COLUMN ${col}`); } catch { /* already exists */ }
  }
  // Phase 3 Lot 1 — colonnes SaaS sur users (best-effort migration SQLite)
  const saasCols = [
    "plan TEXT NOT NULL DEFAULT 'trial'",
    "trial_ends_at INTEGER",
    "email_verified_at INTEGER",
    "email_verify_token TEXT",
    "email_verify_expires_at INTEGER",
    "password_reset_token TEXT",
    "password_reset_expires_at INTEGER",
    "onboarding_completed_at INTEGER",
  ];
  for (const col of saasCols) {
    try { raw.exec(`ALTER TABLE users ADD COLUMN ${col}`); } catch { /* already exists */ }
  }
  // Réseaux sociaux sur users (best-effort migration SQLite)
  const socialCols = ["instagram TEXT", "facebook TEXT", "website_url TEXT"];
  for (const col of socialCols) {
    try { raw.exec(`ALTER TABLE users ADD COLUMN ${col}`); } catch { /* already exists */ }
  }
  raw.close();
}

// ── MySQL-only: migrations best-effort au démarrage ──────────────────────────
// Équivalent des `ALTER TABLE` best-effort SQLite ci-dessus, pour la prod MySQL.
// Fire-and-forget : ne bloque pas le démarrage du serveur, et un échec (colonne
// déjà migrée, droits, etc.) est silencieux — au pire la migration n'a pas lieu,
// jamais de crash. Idempotent : ré-appliquer un MODIFY au même type ne fait rien.
if (DB_DRIVER === "mysql") {
  void (async () => {
    // Migration 1.1 — consultation_notes.client_id nullable (RDV walk-in sans client).
    // Cf. migrations/1.1-consultation-note-nullable-client.sql
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any).execute(
        sql`ALTER TABLE consultation_notes MODIFY client_id INT NULL`,
      );
      console.log("[db][migrate] consultation_notes.client_id → NULL (ok ou déjà appliqué)");
    } catch (e: any) {
      console.warn("[db][migrate] consultation_notes.client_id MODIFY échoué (best-effort):", e?.message || e);
    }
    // Migration 1.2 — colonnes réseaux sociaux sur users (page publique).
    // Cf. migrations/1.2-user-socials.sql. ADD COLUMN n'est pas idempotent en MySQL
    // → chaque colonne dans son try/catch (échoue silencieusement si déjà présente).
    for (const ddl of [
      "ALTER TABLE users ADD COLUMN instagram VARCHAR(255) NULL",
      "ALTER TABLE users ADD COLUMN facebook VARCHAR(255) NULL",
      "ALTER TABLE users ADD COLUMN website_url VARCHAR(255) NULL",
      // Visio — lien Google Meet généré automatiquement par Google Agenda
      "ALTER TABLE appointments ADD COLUMN google_meet_link VARCHAR(512) NULL",
      // Lot métier (Phase 0) — création des tables si absentes (idempotent via IF NOT EXISTS)
      `CREATE TABLE IF NOT EXISTS anamnesis_templates (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        questions TEXT NOT NULL,
        is_active TINYINT(1) DEFAULT 1,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS anamnesis_responses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        template_id INT,
        client_id INT,
        appointment_id INT,
        token VARCHAR(64) NOT NULL,
        answers TEXT,
        submitted_at BIGINT,
        created_at BIGINT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS programs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        client_id INT NOT NULL,
        appointment_id INT,
        title VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        status VARCHAR(20) DEFAULT 'draft',
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS client_documents (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        client_id INT NOT NULL,
        filename VARCHAR(255) NOT NULL,
        mime_type VARCHAR(128),
        size_bytes INT,
        data_base64 LONGTEXT NOT NULL,
        created_at BIGINT NOT NULL
      )`,
    ]) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (db as any).execute(sql.raw(ddl));
        console.log(`[db][migrate] ${ddl} (ok)`);
      } catch (e: any) {
        // Colonne déjà présente = cas normal après la 1re exécution.
        console.warn(`[db][migrate] ${ddl} ignoré (best-effort):`, e?.message || e);
      }
    }
  })();
}

// ── Dual-driver write helpers ─────────────────────────────────────────────────

/**
 * Perform an INSERT and return the inserted row.
 *
 * SQLite: uses .returning() (single round-trip).
 * MySQL : inserts then re-selects by auto-generated id.
 */
async function dbInsertReturning<T extends { id: number }>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  values: any,
): Promise<T> {
  if (DB_DRIVER !== "mysql") {
    // SQLite path — .returning() is supported
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await (db as any).insert(table).values(values).returning();
    return rows[0] as T;
  }
  // MySQL path — insert then re-select
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await (db as any).insert(table).values(values);
  // mysql2 result[0] is a ResultSetHeader with insertId
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const insertId: number = (result as any)[0]?.insertId ?? result?.insertId;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = await (db as any).select().from(table).where(eq(table.id, insertId));
  return rows[0] as T;
}

/**
 * Perform an UPDATE and return the updated row (or undefined if not found).
 *
 * SQLite: uses .returning().
 * MySQL : updates then re-selects.
 */
async function dbUpdateReturning<T extends { id: number }>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: any,
  id: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  patch: any,
): Promise<T | undefined> {
  if (DB_DRIVER !== "mysql") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await (db as any).update(table).set(patch).where(eq(table.id, id)).returning();
    return rows[0] as T | undefined;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).update(table).set(patch).where(eq(table.id, id));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = await (db as any).select().from(table).where(eq(table.id, id));
  return rows[0] as T | undefined;
}

// ── first() helper ────────────────────────────────────────────────────────────
// Replaces .get() which is SQLite-only.
async function first<T>(queryPromise: Promise<T[]>): Promise<T | undefined> {
  const rows = await queryPromise;
  return rows[0];
}

// ── Interface ─────────────────────────────────────────────────────────────────
export interface IStorage {
  // Users
  getUserById(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserBySlug(slug: string): Promise<User | undefined>;
  createUser(data: InsertUser & { createdAt: number }): Promise<User>;
  updateUser(id: number, patch: Partial<User>): Promise<User | undefined>;
  countUsers(): Promise<number>;
  listUsersWithGoogleToken(): Promise<User[]>;
  listUsersWithEmailConfig(): Promise<User[]>;
  // Phase 3 Lot 4 — admin
  listAllUsers(): Promise<User[]>;
  countAppointmentsForUser(userId: number): Promise<number>;
  countClientsForUser(userId: number): Promise<number>;
  countInvoicesForUser(userId: number): Promise<number>;
  getUserByEmailVerifyToken(token: string): Promise<User | undefined>;
  getUserByPasswordResetToken(token: string): Promise<User | undefined>;

  // Sessions
  createSession(userId: number, token: string, expiresAt: number): Promise<Session>;
  getSessionByToken(token: string): Promise<Session | undefined>;
  deleteSession(token: string): Promise<void>;

  // Categories
  listCategories(userId: number): Promise<AppointmentCategory[]>;
  getCategory(id: number): Promise<AppointmentCategory | undefined>;
  createCategory(data: InsertCategory): Promise<AppointmentCategory>;
  updateCategory(id: number, patch: Partial<AppointmentCategory>): Promise<AppointmentCategory | undefined>;
  deleteCategory(id: number): Promise<void>;

  // Availability
  listAvailability(userId: number): Promise<AvailabilitySlot[]>;
  replaceAvailability(userId: number, slots: InsertAvailability[]): Promise<AvailabilitySlot[]>;

  // Clients
  listClients(userId: number, search?: string): Promise<Client[]>;
  getClient(id: number): Promise<Client | undefined>;
  findClientByEmail(userId: number, email: string): Promise<Client | undefined>;
  createClient(userId: number, data: InsertClient): Promise<Client>;
  updateClient(id: number, patch: Partial<Client>): Promise<Client | undefined>;
  deleteClient(id: number): Promise<void>;

  // Appointments
  listAppointments(userId: number, from?: number, to?: number): Promise<Appointment[]>;
  getAppointment(id: number): Promise<Appointment | undefined>;
  getAppointmentByGoogleEventId(userId: number, googleEventId: string): Promise<Appointment | undefined>;
  listAppointmentsWithGoogleEventId(userId: number, from: number, to: number): Promise<Appointment[]>;
  getAppointmentByConfirmToken(token: string): Promise<Appointment | undefined>;
  getAppointmentByCancelToken(token: string): Promise<Appointment | undefined>;
  // PHASE 3.5-B — Manage token
  setCancelToken(appointmentId: number, token: string): Promise<Appointment | undefined>;
  ensureCancelToken(appointmentId: number): Promise<string>;
  listAppointmentsForReminder(userId: number, fromMs: number, toMs: number): Promise<Appointment[]>;
  createAppointment(data: InsertAppointment): Promise<Appointment>;
  updateAppointment(id: number, patch: Partial<Appointment>): Promise<Appointment | undefined>;
  deleteAppointment(id: number): Promise<void>;
  listClientAppointments(clientId: number): Promise<Appointment[]>;

  // Notes
  getNoteByAppointment(appointmentId: number): Promise<ConsultationNote | undefined>;
  getNote(id: number): Promise<ConsultationNote | undefined>;
  listClientNotes(clientId: number): Promise<ConsultationNote[]>;
  createNote(data: InsertNote & { createdAt: number; updatedAt: number }): Promise<ConsultationNote>;
  updateNote(id: number, patch: Partial<ConsultationNote>): Promise<ConsultationNote | undefined>;

  // Phase 3 Lot 5 — GDPR : export + cascade delete
  listNotesForUser(userId: number): Promise<ConsultationNote[]>;
  deleteUserCascade(userId: number): Promise<void>;

  // Phase 3 — Reminders log
  listAppointmentsForReminderLog(userId: number, fromTs: number, toTs: number): Promise<Appointment[]>;

  // Invoices
  listInvoices(userId: number, opts?: { status?: string; from?: number; to?: number; clientId?: number }): Promise<Invoice[]>;
  getInvoice(id: number): Promise<Invoice | undefined>;
  getInvoiceItems(invoiceId: number): Promise<InvoiceItem[]>;
  createInvoice(data: InsertInvoice & { createdAt: number; updatedAt: number }): Promise<Invoice>;
  updateInvoice(id: number, patch: Partial<Invoice>): Promise<Invoice | undefined>;
  deleteInvoice(id: number): Promise<void>;
  replaceInvoiceItems(invoiceId: number, items: InsertInvoiceItem[]): Promise<InvoiceItem[]>;
  getInvoiceByAppointment(appointmentId: number): Promise<Invoice | undefined>;
  nextInvoiceCounter(userId: number, year: number): Promise<number>;

  // PHASE 3.5-C — Email templates
  getEmailTemplate(userId: number, kind: string): Promise<EmailTemplate | undefined>;
  listEmailTemplates(userId: number): Promise<EmailTemplate[]>;
  upsertEmailTemplate(userId: number, kind: string, data: { subject: string; bodyHtml: string }): Promise<EmailTemplate>;
}

// ── Implementation ────────────────────────────────────────────────────────────
export class DatabaseStorage implements IStorage {
  // ── Users ──────────────────────────────────────────────────────────────────
  async getUserById(id: number): Promise<User | undefined> {
    return first(db.select().from(users).where(eq(users.id, id)));
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return first(db.select().from(users).where(eq(users.email, email.toLowerCase())));
  }

  async getUserBySlug(slug: string): Promise<User | undefined> {
    return first(db.select().from(users).where(eq(users.slug, slug)));
  }

  async getUserByEmailVerifyToken(token: string): Promise<User | undefined> {
    return first(db.select().from(users).where(eq(users.emailVerifyToken, token)));
  }

  async getUserByPasswordResetToken(token: string): Promise<User | undefined> {
    return first(db.select().from(users).where(eq(users.passwordResetToken, token)));
  }

  async listNotesForUser(userId: number): Promise<ConsultationNote[]> {
    return await db.select().from(consultationNotes).where(eq(consultationNotes.userId, userId));
  }

  async deleteUserCascade(userId: number): Promise<void> {
    // Ordre de suppression respectant les FK : invoice_items → invoices →
    // notes → appointments → clients → categories → availability → sessions → user.
    // Les invoice_items sont récupérés via les invoices du user.
    const userInvoices = await db.select({ id: invoices.id }).from(invoices).where(eq(invoices.userId, userId));
    for (const inv of userInvoices) {
      await db.delete(invoiceItems).where(eq(invoiceItems.invoiceId, inv.id));
    }
    await db.delete(invoices).where(eq(invoices.userId, userId));
    await db.delete(consultationNotes).where(eq(consultationNotes.userId, userId));
    await db.delete(appointments).where(eq(appointments.userId, userId));
    await db.delete(clients).where(eq(clients.userId, userId));
    await db.delete(appointmentCategories).where(eq(appointmentCategories.userId, userId));
    await db.delete(availabilitySlots).where(eq(availabilitySlots.userId, userId));
    await db.delete(sessions).where(eq(sessions.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
  }

  async createUser(data: InsertUser & { createdAt: number }): Promise<User> {
    return dbInsertReturning<User>(users, { ...data, email: data.email.toLowerCase() });
  }

  async updateUser(id: number, patch: Partial<User>): Promise<User | undefined> {
    return dbUpdateReturning<User>(users, id, patch);
  }

  async countUsers(): Promise<number> {
    const rows = await db.select({ c: sql<number>`count(*)` }).from(users);
    return rows[0]?.c ?? 0;
  }

  async listUsersWithGoogleToken(): Promise<User[]> {
    const rows = await db.select().from(users);
    return rows.filter((u: any) => !!u.googleCalendarToken) as User[];
  }

  async listUsersWithEmailConfig(): Promise<User[]> {
    const rows = await db.select().from(users);
    return rows.filter((u: any) => !!u.resendApiKey && !!u.emailFromAddress) as User[];
  }

  // Phase 3 Lot 4 — admin
  async listAllUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(desc(users.createdAt));
  }

  async countAppointmentsForUser(userId: number): Promise<number> {
    const rows = await db.select({ c: sql<number>`count(*)` }).from(appointments).where(eq(appointments.userId, userId));
    return Number(rows[0]?.c ?? 0);
  }

  async countClientsForUser(userId: number): Promise<number> {
    const rows = await db.select({ c: sql<number>`count(*)` }).from(clients).where(eq(clients.userId, userId));
    return Number(rows[0]?.c ?? 0);
  }

  async countInvoicesForUser(userId: number): Promise<number> {
    const rows = await db.select({ c: sql<number>`count(*)` }).from(invoices).where(eq(invoices.userId, userId));
    return Number(rows[0]?.c ?? 0);
  }

  // ── Sessions ───────────────────────────────────────────────────────────────
  async createSession(userId: number, token: string, expiresAt: number): Promise<Session> {
    return dbInsertReturning<Session>(sessions, { userId, token, expiresAt });
  }

  async getSessionByToken(token: string): Promise<Session | undefined> {
    return first(db.select().from(sessions).where(eq(sessions.token, token)));
  }

  async deleteSession(token: string): Promise<void> {
    await db.delete(sessions).where(eq(sessions.token, token));
  }

  // ── Categories ─────────────────────────────────────────────────────────────
  async listCategories(userId: number): Promise<AppointmentCategory[]> {
    return db
      .select()
      .from(appointmentCategories)
      .where(eq(appointmentCategories.userId, userId));
  }

  async getCategory(id: number): Promise<AppointmentCategory | undefined> {
    return first(
      db.select().from(appointmentCategories).where(eq(appointmentCategories.id, id)),
    );
  }

  async createCategory(data: InsertCategory): Promise<AppointmentCategory> {
    return dbInsertReturning<AppointmentCategory>(appointmentCategories, data);
  }

  async updateCategory(id: number, patch: Partial<AppointmentCategory>): Promise<AppointmentCategory | undefined> {
    return dbUpdateReturning<AppointmentCategory>(appointmentCategories, id, patch);
  }

  async deleteCategory(id: number): Promise<void> {
    await db.delete(appointmentCategories).where(eq(appointmentCategories.id, id));
  }

  // ── Availability ───────────────────────────────────────────────────────────
  async listAvailability(userId: number): Promise<AvailabilitySlot[]> {
    return db
      .select()
      .from(availabilitySlots)
      .where(eq(availabilitySlots.userId, userId));
  }

  async replaceAvailability(userId: number, slots: InsertAvailability[]): Promise<AvailabilitySlot[]> {
    await db.delete(availabilitySlots).where(eq(availabilitySlots.userId, userId));
    if (slots.length === 0) return [];
    const inserted: AvailabilitySlot[] = [];
    for (const s of slots) {
      const row = await dbInsertReturning<AvailabilitySlot>(availabilitySlots, { ...s, userId });
      inserted.push(row);
    }
    return inserted;
  }

  // ── Clients ────────────────────────────────────────────────────────────────
  async listClients(userId: number, search?: string): Promise<Client[]> {
    if (search && search.trim()) {
      const q = `%${search.trim().toLowerCase()}%`;
      return db
        .select()
        .from(clients)
        .where(
          and(
            eq(clients.userId, userId),
            or(
              like(sql`lower(${clients.firstName})`, q),
              like(sql`lower(${clients.lastName})`, q),
              like(sql`lower(${clients.email})`, q),
            ),
          ),
        );
    }
    return db
      .select()
      .from(clients)
      .where(eq(clients.userId, userId))
      .orderBy(desc(clients.createdAt));
  }

  async getClient(id: number): Promise<Client | undefined> {
    return first(db.select().from(clients).where(eq(clients.id, id)));
  }

  async findClientByEmail(userId: number, email: string): Promise<Client | undefined> {
    if (!email) return undefined;
    return first(
      db
        .select()
        .from(clients)
        .where(and(eq(clients.userId, userId), eq(clients.email, email.toLowerCase()))),
    );
  }

  async createClient(userId: number, data: InsertClient): Promise<Client> {
    return dbInsertReturning<Client>(clients, { ...data, userId, createdAt: Date.now() });
  }

  async updateClient(id: number, patch: Partial<Client>): Promise<Client | undefined> {
    return dbUpdateReturning<Client>(clients, id, patch);
  }

  async deleteClient(id: number): Promise<void> {
    await db.delete(clients).where(eq(clients.id, id));
  }

  // ── Appointments ───────────────────────────────────────────────────────────
  async listAppointments(userId: number, from?: number, to?: number): Promise<Appointment[]> {
    const conds = [eq(appointments.userId, userId)];
    if (from) conds.push(gte(appointments.startAt, from));
    if (to) conds.push(lte(appointments.startAt, to));
    return db.select().from(appointments).where(and(...conds));
  }

  async getAppointment(id: number): Promise<Appointment | undefined> {
    return first(db.select().from(appointments).where(eq(appointments.id, id)));
  }

  async getAppointmentByGoogleEventId(userId: number, googleEventId: string): Promise<Appointment | undefined> {
    return first(
      db
        .select()
        .from(appointments)
        .where(and(eq(appointments.userId, userId), eq(appointments.googleEventId, googleEventId))),
    );
  }

  async getAppointmentByConfirmToken(token: string): Promise<Appointment | undefined> {
    if (!token) return undefined;
    return first(db.select().from(appointments).where(eq(appointments.confirmToken, token)));
  }

  async getAppointmentByCancelToken(token: string): Promise<Appointment | undefined> {
    if (!token) return undefined;
    return first(db.select().from(appointments).where(eq(appointments.cancelToken, token)));
  }

  /** RDV pour lesquels il faut envoyer un rappel J-1 (RDV du jour suivant non encore notifié). */
  async listAppointmentsForReminder(userId: number, fromMs: number, toMs: number): Promise<Appointment[]> {
    const rows = await db
      .select()
      .from(appointments)
      .where(
        and(
          eq(appointments.userId, userId),
          gte(appointments.startAt, fromMs),
          lte(appointments.startAt, toMs),
        ),
      );
    // Filter en mémoire pour rester compatible SQLite + MySQL (booleans diffèrent)
    return rows.filter((a: any) =>
      !a.reminderSent
      && a.status !== "cancelled"
      && a.status !== "blocked"
      && a.clientCancelledAt == null
      && (a.clientEmail || a.clientId), // nécessite un email accessible (direct ou via client)
    ) as Appointment[];
  }

  async listAppointmentsWithGoogleEventId(userId: number, from: number, to: number): Promise<Appointment[]> {
    const rows = await db
      .select()
      .from(appointments)
      .where(
        and(
          eq(appointments.userId, userId),
          gte(appointments.startAt, from),
          lte(appointments.startAt, to),
        ),
      );
    return rows.filter((a: any) => !!a.googleEventId) as Appointment[];
  }

  async createAppointment(data: InsertAppointment): Promise<Appointment> {
    return dbInsertReturning<Appointment>(appointments, { ...data, createdAt: Date.now() });
  }

  async updateAppointment(id: number, patch: Partial<Appointment>): Promise<Appointment | undefined> {
    return dbUpdateReturning<Appointment>(appointments, id, patch);
  }

  async deleteAppointment(id: number): Promise<void> {
    await db.delete(appointments).where(eq(appointments.id, id));
  }

  async listClientAppointments(clientId: number): Promise<Appointment[]> {
    return db
      .select()
      .from(appointments)
      .where(eq(appointments.clientId, clientId))
      .orderBy(desc(appointments.startAt));
  }

  // ── Notes ──────────────────────────────────────────────────────────────────
  async getNoteByAppointment(appointmentId: number): Promise<ConsultationNote | undefined> {
    return first(
      db
        .select()
        .from(consultationNotes)
        .where(eq(consultationNotes.appointmentId, appointmentId)),
    );
  }

  async getNote(id: number): Promise<ConsultationNote | undefined> {
    return first(db.select().from(consultationNotes).where(eq(consultationNotes.id, id)));
  }

  async listClientNotes(clientId: number): Promise<ConsultationNote[]> {
    return db
      .select()
      .from(consultationNotes)
      .where(eq(consultationNotes.clientId, clientId))
      .orderBy(desc(consultationNotes.createdAt));
  }

  async createNote(data: InsertNote & { createdAt: number; updatedAt: number }): Promise<ConsultationNote> {
    return dbInsertReturning<ConsultationNote>(consultationNotes, data);
  }

  async updateNote(id: number, patch: Partial<ConsultationNote>): Promise<ConsultationNote | undefined> {
    return dbUpdateReturning<ConsultationNote>(consultationNotes, id, { ...patch, updatedAt: Date.now() });
  }

  // ── Invoices ──────────────────────────────────────────────────────────────
  async listInvoices(
    userId: number,
    opts?: { status?: string; from?: number; to?: number; clientId?: number },
  ): Promise<Invoice[]> {
    const conds = [eq(invoices.userId, userId)];
    if (opts?.status) conds.push(eq(invoices.status, opts.status));
    if (opts?.from) conds.push(gte(invoices.issueDate, opts.from));
    if (opts?.to) conds.push(lte(invoices.issueDate, opts.to));
    if (opts?.clientId) conds.push(eq(invoices.clientId, opts.clientId));
    return db.select().from(invoices).where(and(...conds)).orderBy(desc(invoices.issueDate), desc(invoices.id));
  }

  async getInvoice(id: number): Promise<Invoice | undefined> {
    return first(db.select().from(invoices).where(eq(invoices.id, id)));
  }

  async getInvoiceItems(invoiceId: number): Promise<InvoiceItem[]> {
    const rows = await db
      .select()
      .from(invoiceItems)
      .where(eq(invoiceItems.invoiceId, invoiceId));
    return (rows as InvoiceItem[]).slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  }

  async createInvoice(data: InsertInvoice & { createdAt: number; updatedAt: number }): Promise<Invoice> {
    return dbInsertReturning<Invoice>(invoices, data);
  }

  async updateInvoice(id: number, patch: Partial<Invoice>): Promise<Invoice | undefined> {
    return dbUpdateReturning<Invoice>(invoices, id, { ...patch, updatedAt: Date.now() });
  }

  async deleteInvoice(id: number): Promise<void> {
    await db.delete(invoiceItems).where(eq(invoiceItems.invoiceId, id));
    await db.delete(invoices).where(eq(invoices.id, id));
  }

  async replaceInvoiceItems(invoiceId: number, items: InsertInvoiceItem[]): Promise<InvoiceItem[]> {
    await db.delete(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId));
    if (items.length === 0) return [];
    const inserted: InvoiceItem[] = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const row = await dbInsertReturning<InvoiceItem>(invoiceItems, {
        ...it,
        invoiceId,
        position: typeof it.position === "number" ? it.position : i,
      });
      inserted.push(row);
    }
    return inserted;
  }

  async getInvoiceByAppointment(appointmentId: number): Promise<Invoice | undefined> {
    return first(db.select().from(invoices).where(eq(invoices.appointmentId, appointmentId)));
  }

  // ── Reminders log ─────────────────────────────────────────────────────────
  /** Retourne les RDV de la plage [fromTs, toTs] pour la vue logs rappels. */
  async listAppointmentsForReminderLog(userId: number, fromTs: number, toTs: number): Promise<Appointment[]> {
    return db
      .select()
      .from(appointments)
      .where(
        and(
          eq(appointments.userId, userId),
          gte(appointments.startAt, fromTs),
          lte(appointments.startAt, toTs),
        ),
      )
      .orderBy(desc(appointments.startAt));
  }

  async nextInvoiceCounter(userId: number, year: number): Promise<number> {
    const u = await this.getUserById(userId);
    if (!u) throw new Error("User introuvable");
    const currentYear = (u as any).invoiceCounterYear ?? 0;
    const currentValue = (u as any).invoiceCounterValue ?? 0;
    const next = currentYear === year ? currentValue + 1 : 1;
    await this.updateUser(userId, {
      invoiceCounterYear: year,
      invoiceCounterValue: next,
    } as any);
    return next;
  }

  // ── PHASE 3.5-B — Manage token ———————————————————————————————————————
  /** Persiste un token d'annulation/report sur un RDV. */
  async setCancelToken(appointmentId: number, token: string): Promise<Appointment | undefined> {
    return dbUpdateReturning<Appointment>(appointments, appointmentId, { cancelToken: token } as any);
  }

  /**
   * Retourne le cancelToken existant du RDV, ou en génère un nouveau (32 hex chars),
   * le persiste, et le retourne. À appeler juste avant l’envoi de l’email de confirmation.
   *
   * Signature : ensureCancelToken(appointmentId: number): Promise<string>
   * Import    : import { storage } from "./storage";
   *             const token = await storage.ensureCancelToken(appt.id);
   */
  async ensureCancelToken(appointmentId: number): Promise<string> {
    const appt = await this.getAppointment(appointmentId);
    if (!appt) throw new Error(`Appointment ${appointmentId} introuvable`);
    const existing = (appt as any).cancelToken as string | null | undefined;
    if (existing) return existing;
    const newToken = randomBytes(16).toString("hex"); // 32 chars hex
    await this.setCancelToken(appointmentId, newToken);
    return newToken;
  }

  // ── PHASE 3.5-C — Email templates ─────────────────────────────────────

  async getEmailTemplate(userId: number, kind: string): Promise<EmailTemplate | undefined> {
    return first(
      db.select().from(emailTemplates).where(
        and(eq(emailTemplates.userId, userId), eq(emailTemplates.kind, kind)),
      ),
    );
  }

  async listEmailTemplates(userId: number): Promise<EmailTemplate[]> {
    return db.select().from(emailTemplates).where(eq(emailTemplates.userId, userId));
  }

  async upsertEmailTemplate(
    userId: number,
    kind: string,
    data: { subject: string; bodyHtml: string },
  ): Promise<EmailTemplate> {
    const existing = await this.getEmailTemplate(userId, kind);
    if (existing) {
      const updated = await dbUpdateReturning<EmailTemplate>(emailTemplates, existing.id, {
        subject: data.subject,
        bodyHtml: data.bodyHtml,
        updatedAt: Date.now(),
      });
      return updated!;
    }
    return dbInsertReturning<EmailTemplate>(emailTemplates, {
      userId,
      kind,
      subject: data.subject,
      bodyHtml: data.bodyHtml,
      updatedAt: Date.now(),
    });
  }
}

export const storage = new DatabaseStorage();
