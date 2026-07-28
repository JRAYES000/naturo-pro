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
  anamnesisTemplates, anamnesisResponses, programs, clientDocuments, naturalSolutions,
  packages, aiChatMessages, aiDiscussions, aiChatUsage,
  assistantSettings, kbDocuments, kbChunks, contentPosts, stripeProcessedSessions,
} from "@shared/schema-active";
import type {
  User, InsertUser, AppointmentCategory, InsertCategory, AvailabilitySlot,
  InsertAvailability, Client, InsertClient, Appointment, InsertAppointment,
  ConsultationNote, InsertNote, Session, Invoice, InsertInvoice,
  InvoiceItem, InsertInvoiceItem, EmailTemplate,
  AnamnesisTemplate, InsertAnamnesisTemplate, AnamnesisResponse, InsertAnamnesisResponse,
  Program, InsertProgram, ClientDocument, InsertClientDocument,
  NaturalSolution, InsertNaturalSolution,
  Package, InsertPackage, AiChatMessage, AiChatUsage,
  AssistantSettings, KbDocument, KbChunk, ContentPost,
} from "@shared/schema-active";
import type { AiDiscussion } from "@shared/schema";
import { eq, and, gte, lte, desc, like, or, sql, isNull } from "drizzle-orm";
import { db, DB_DRIVER } from "./db";
import { rankThemes } from "./social-content";
// Fonction pure (formatage du numéro) — pas de cycle : invoices.ts n'importe pas storage.
import { buildInvoiceNumber, invoiceNumberPrefix } from "./invoices";

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
      client_id INTEGER,
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
    CREATE TABLE IF NOT EXISTS natural_solutions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Plante',
      properties TEXT,
      contraindications TEXT,
      usage_notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS packages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      client_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      total_sessions INTEGER NOT NULL,
      used_sessions INTEGER NOT NULL DEFAULT 0,
      price_cents INTEGER DEFAULT 0,
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    -- Assistant IA (Naturobot) et base de connaissances.
    -- Ces six tables manquaient au bloc SQLite : sur une base vierge (clone du dépôt,
    -- intégration continue), le Naturobot était entièrement cassé et deleteUserCascade
    -- levait « no such table: ai_chat_messages » — donc la suppression de compte RGPD
    -- échouait. Invisible en production, où elles existent via les migrations MySQL.
    CREATE TABLE IF NOT EXISTS ai_discussions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      client_id INTEGER,
      theme TEXT,
      title TEXT NOT NULL DEFAULT 'Nouvelle discussion',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ai_chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      discussion_id INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ai_chat_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      day TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS assistant_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      custom_instructions TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS kb_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      filename TEXT,
      mime_type TEXT,
      char_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'ready',
      error TEXT,
      folder TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS kb_chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL,
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      embedding TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS content_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      channel TEXT NOT NULL,
      format TEXT NOT NULL,
      theme TEXT,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'brouillon',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      published_at INTEGER
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
    "stripe_session_id TEXT",
    "deposit_amount_cents INTEGER",
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
  // Avis Google — colonnes sur users et appointments (best-effort migration SQLite)
  const reviewUserCols = [
    "google_review_url TEXT",
    "review_request_enabled INTEGER DEFAULT 0",
  ];
  for (const col of reviewUserCols) {
    try { raw.exec(`ALTER TABLE users ADD COLUMN ${col}`); } catch { /* already exists */ }
  }
  try { raw.exec(`ALTER TABLE appointments ADD COLUMN review_email_sent_at INTEGER`); } catch { /* already exists */ }
  // Unicité du numéro de facture par praticien (obligation légale, art. 242 nonies A CGI).
  try { raw.exec(`CREATE UNIQUE INDEX IF NOT EXISTS uniq_invoice_user_number ON invoices (user_id, number)`); } catch { /* déjà présent */ }
  // Index de recherche — cf. migrations/2.1-indexes.sql pour la version MySQL.
  for (const ddl of [
    `CREATE INDEX IF NOT EXISTS idx_clients_user ON clients (user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_appt_user_start ON appointments (user_id, start_at)`,
    `CREATE INDEX IF NOT EXISTS idx_notes_user ON consultation_notes (user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_notes_client ON consultation_notes (client_id)`,
    `CREATE INDEX IF NOT EXISTS idx_notes_appointment ON consultation_notes (appointment_id)`,
    `CREATE INDEX IF NOT EXISTS idx_avail_user ON availability_slots (user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_categories_user ON appointment_categories (user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_email_templates_user ON email_templates (user_id, kind)`,
    `CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at)`,
    `CREATE INDEX IF NOT EXISTS idx_anamnesis_tpl_user ON anamnesis_templates (user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_anamnesis_resp_user ON anamnesis_responses (user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_anamnesis_resp_token ON anamnesis_responses (token)`,
    `CREATE INDEX IF NOT EXISTS idx_programs_user ON programs (user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_programs_client ON programs (client_id)`,
    `CREATE INDEX IF NOT EXISTS idx_client_docs_user_client ON client_documents (user_id, client_id)`,
    `CREATE INDEX IF NOT EXISTS idx_natural_solutions_user ON natural_solutions (user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_packages_user_client ON packages (user_id, client_id)`,
    `CREATE INDEX IF NOT EXISTS idx_ai_discussions_user ON ai_discussions (user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_content_posts_user ON content_posts (user_id, status)`,
  ]) {
    try { raw.exec(ddl); } catch { /* déjà présent */ }
  }
  // Marqueur durable des sessions Stripe traitées (cf. shared/schema.ts).
  try {
    raw.exec(`CREATE TABLE IF NOT EXISTS stripe_processed_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      session_id TEXT NOT NULL UNIQUE,
      appointment_id INTEGER,
      created_at INTEGER NOT NULL
    )`);
  } catch { /* déjà présent */ }
  // Paiements Stripe — colonnes sur users (best-effort migration SQLite)
  const stripeUserCols = [
    "stripe_secret_key TEXT",
    "stripe_deposit_percent INTEGER DEFAULT 0",
  ];
  for (const col of stripeUserCols) {
    try { raw.exec(`ALTER TABLE users ADD COLUMN ${col}`); } catch { /* already exists */ }
  }
  // Apparence — préférence de thème (light par défaut) (best-effort migration SQLite)
  try { raw.exec(`ALTER TABLE users ADD COLUMN theme_preference TEXT DEFAULT 'light'`); } catch { /* already exists */ }
  // Studio contenu — voix de marque (ton + audience) sur users (best-effort migration SQLite)
  for (const col of ["marketing_tone TEXT", "marketing_audience TEXT", "studio_intro_seen_at INTEGER"]) {
    try { raw.exec(`ALTER TABLE users ADD COLUMN ${col}`); } catch { /* déjà présent */ }
  }
  raw.close();
}

// ── MySQL-only: migrations best-effort au démarrage ──────────────────────────
// Équivalent des `ALTER TABLE` best-effort SQLite ci-dessus, pour la prod MySQL.
// Un échec (colonne déjà migrée, droits, etc.) est silencieux — au pire la
// migration n'a pas lieu, jamais de crash. Idempotent : ré-appliquer un MODIFY
// au même type ne fait rien.
//
// ⚠️ Ordre de démarrage : ces migrations créent notamment la table
// `natural_solutions`. Le seed (`seedNaturalSolutions` dans solutions-seed.ts)
// la requête au boot. On expose donc `migrationsReady` : index.ts l'attend AVANT
// de lancer les seeds, ce qui garantit que les tables existent (sinon, sur une
// base MySQL vierge, le 1er seed échouait en best-effort et ne s'appliquait qu'au
// boot suivant). En SQLite, les tables sont déjà créées synchroniquement ci-dessus,
// donc `migrationsReady` vaut `Promise.resolve()` (no-op, aucun impact sur le dev).
async function runMysqlMigrations(): Promise<void> {
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
        client_id INT,
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
      `CREATE TABLE IF NOT EXISTS natural_solutions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(80) NOT NULL DEFAULT 'Plante',
        properties TEXT,
        contraindications TEXT,
        usage_notes TEXT,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS packages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        client_id INT NOT NULL,
        name VARCHAR(255) NOT NULL,
        total_sessions INT NOT NULL,
        used_sessions INT NOT NULL DEFAULT 0,
        price_cents INT DEFAULT 0,
        notes TEXT,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      )`,
      // Avis Google — nouvelles colonnes
      "ALTER TABLE users ADD COLUMN google_review_url VARCHAR(512) NULL",
      "ALTER TABLE users ADD COLUMN review_request_enabled TINYINT(1) NOT NULL DEFAULT 0",
      "ALTER TABLE appointments ADD COLUMN review_email_sent_at BIGINT NULL",
      // Paiements Stripe (acompte à la réservation)
      "ALTER TABLE users ADD COLUMN stripe_secret_key VARCHAR(255) NULL",
      "ALTER TABLE users ADD COLUMN stripe_deposit_percent INT DEFAULT 0",
      "ALTER TABLE appointments ADD COLUMN stripe_session_id VARCHAR(255) NULL",
      "ALTER TABLE appointments ADD COLUMN deposit_amount_cents INT NULL",
      // Apparence — préférence de thème de l'interface (light par défaut)
      "ALTER TABLE users ADD COLUMN theme_preference VARCHAR(16) NOT NULL DEFAULT 'light'",
      // Assistant IA — rangement des supports de cours par dossier source (arborescence Google Drive)
      "ALTER TABLE kb_documents ADD COLUMN folder VARCHAR(255) NULL",
      // Assistant IA — discussions (fil par sujet)
      `CREATE TABLE IF NOT EXISTS ai_discussions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        client_id INT NULL,
        theme VARCHAR(120) NULL,
        title VARCHAR(255) NOT NULL DEFAULT 'Nouvelle discussion',
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      )`,
      "ALTER TABLE ai_chat_messages ADD COLUMN discussion_id INT NULL",
      // Studio contenu — posts générés (brouillons, à publier, publiés)
      `CREATE TABLE IF NOT EXISTS content_posts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        channel VARCHAR(32) NOT NULL,
        format VARCHAR(32) NOT NULL,
        theme VARCHAR(200) NULL,
        title VARCHAR(255) NOT NULL,
        body TEXT NOT NULL,
        status VARCHAR(24) NOT NULL DEFAULT 'brouillon',
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        published_at BIGINT NULL
      )`,
      // Studio contenu — voix de marque (ton + audience) sur users
      "ALTER TABLE users ADD COLUMN marketing_tone VARCHAR(64) NULL",
      "ALTER TABLE users ADD COLUMN marketing_audience VARCHAR(255) NULL",
      "ALTER TABLE users ADD COLUMN studio_intro_seen_at BIGINT NULL",
      // Carrousels en images (migration 1.8) — visuels stockés sur content_posts
      "ALTER TABLE content_posts ADD COLUMN slides_json TEXT NULL",
      "ALTER TABLE content_posts ADD COLUMN background_image LONGTEXT NULL",
      // Unicité du numéro de facture par praticien (art. 242 nonies A CGI). Vérifié
      // sans doublon en production avant ajout ; en cas de doublon préexistant le
      // DDL échoue en best-effort et la contrainte n'est pas posée — d'où le retry
      // applicatif dans storage.createInvoiceNumbered, qui ne dépend pas d'elle.
      "CREATE UNIQUE INDEX uniq_invoice_user_number ON invoices (user_id, number)",
      // ── Index de recherche (migration 2.1). MySQL n'a pas de CREATE INDEX IF NOT
      // EXISTS : après la première application, chaque DDL échoue et est journalisé
      // en best-effort, comme les ALTER TABLE au-dessus. Comportement assumé.
      "CREATE INDEX idx_clients_user ON clients (user_id)",
      "CREATE INDEX idx_appt_user_start ON appointments (user_id, start_at)",
      "CREATE INDEX idx_notes_user ON consultation_notes (user_id)",
      "CREATE INDEX idx_notes_client ON consultation_notes (client_id)",
      "CREATE INDEX idx_notes_appointment ON consultation_notes (appointment_id)",
      "CREATE INDEX idx_avail_user ON availability_slots (user_id)",
      "CREATE INDEX idx_categories_user ON appointment_categories (user_id)",
      "CREATE INDEX idx_email_templates_user ON email_templates (user_id, kind)",
      "CREATE INDEX idx_sessions_expires ON sessions (expires_at)",
      "CREATE INDEX idx_anamnesis_tpl_user ON anamnesis_templates (user_id)",
      "CREATE INDEX idx_anamnesis_resp_user ON anamnesis_responses (user_id)",
      "CREATE INDEX idx_anamnesis_resp_token ON anamnesis_responses (token)",
      "CREATE INDEX idx_programs_user ON programs (user_id)",
      "CREATE INDEX idx_programs_client ON programs (client_id)",
      "CREATE INDEX idx_client_docs_user_client ON client_documents (user_id, client_id)",
      "CREATE INDEX idx_natural_solutions_user ON natural_solutions (user_id)",
      "CREATE INDEX idx_packages_user_client ON packages (user_id, client_id)",
      "CREATE INDEX idx_ai_discussions_user ON ai_discussions (user_id)",
      "CREATE INDEX idx_content_posts_user ON content_posts (user_id, status)",
      // Marqueur durable des sessions Stripe traitées — survit à la suppression du RDV.
      `CREATE TABLE IF NOT EXISTS stripe_processed_sessions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        session_id VARCHAR(255) NOT NULL UNIQUE,
        appointment_id INT NULL,
        created_at BIGINT NOT NULL,
        INDEX idx_sps_user (user_id)
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
}

// Backfill : rattache les messages legacy (discussion_id NULL) à une discussion
// « Discussion générale » par praticienne. Idempotent : ne fait rien si tout est rattaché.
export async function backfillLegacyDiscussions(): Promise<void> {
  try {
    const orphans = await storage.listLegacyChatUserIds(); // userIds ayant des messages sans discussionId
    for (const userId of orphans) {
      const disc = await storage.createDiscussion({
        userId, clientId: null, theme: null, title: "Discussion générale",
      });
      await storage.assignLegacyMessagesToDiscussion(userId, disc.id);
    }
    if (orphans.length) console.log(`[db][backfill] ${orphans.length} fil(s) legacy → « Discussion générale »`);
  } catch (e: any) {
    console.warn("[db][backfill] discussions legacy (best-effort) :", e?.message || e);
  }
}

/**
 * Promesse résolue lorsque les migrations MySQL best-effort sont terminées.
 * En SQLite (dev), no-op résolu immédiatement. index.ts l'attend avant de seeder.
 * Ne rejette jamais : chaque DDL est gardé par son propre try/catch.
 * Chaîne ensuite le backfill des discussions legacy (idempotent, best-effort).
 */
export const migrationsReady: Promise<void> =
  (DB_DRIVER === "mysql" ? runMysqlMigrations() : Promise.resolve()).then(() =>
    backfillLegacyDiscussions(),
  );

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

/**
 * Toutes les tables portant une colonne `user_id`, dans l'ordre de suppression
 * du cascade RGPD (`deleteUserCascade`). `users` est exclue : elle est supprimée
 * en dernier, à part.
 *
 * Cette liste EST le droit à l'effacement (RGPD art. 17). L'ancienne version du
 * cascade en couvrait 7 sur 18 : les documents clients (PDF d'analyses, donc des
 * données de santé au sens de l'art. 9), les anamnèses, les programmes, les
 * forfaits et l'historique IA survivaient à la suppression du compte, alors que
 * la réponse affichait « toutes vos données ont été supprimées ».
 *
 * Exhaustivité vérifiée par shared/schema-drift.test.ts : ajouter une table avec
 * un `user_id` sans l'ajouter ici fait échouer les tests.
 *
 * NB : natural_solutions contient aussi les solutions GLOBALES (user_id NULL),
 * qui ne matchent pas `eq(userId, …)` et sont donc préservées. Voulu.
 */
export const USER_SCOPED_TABLES = [
  invoices,
  consultationNotes,
  appointments,
  clients,
  appointmentCategories,
  availabilitySlots,
  sessions,
  anamnesisResponses,
  anamnesisTemplates,
  programs,
  clientDocuments,
  packages,
  naturalSolutions,
  emailTemplates,
  aiChatMessages,
  aiDiscussions,
  aiChatUsage,
  contentPosts,
  stripeProcessedSessions,
] as const;

/**
 * Sérialise les tâches d'un même utilisateur : une chaîne de promesses par userId.
 * Node est mono-thread, donc il suffit d'enchaîner — aucune primitive de verrou.
 * Utilisé par la numérotation des factures, où lire et incrémenter le compteur
 * doivent former un tout indivisible.
 */
const filesParUser = new Map<number, Promise<unknown>>();
export function serialiserParUser<T>(userId: number, tache: () => Promise<T>): Promise<T> {
  const precedent = filesParUser.get(userId) ?? Promise.resolve();
  // .catch() sur le maillon précédent : un échec ne doit pas bloquer la file.
  const suivant = precedent.then(tache, tache);
  // On mémorise une version « neutralisée » pour ne pas propager d'unhandled rejection.
  filesParUser.set(userId, suivant.catch(() => undefined));
  return suivant;
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
  purgeExpiredSessions(): Promise<number>;
  deleteSessionsForUser(userId: number): Promise<void>;

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
  listAllAppointments(userId: number): Promise<Appointment[]>;
  getAppointment(id: number): Promise<Appointment | undefined>;
  getAppointmentByGoogleEventId(userId: number, googleEventId: string): Promise<Appointment | undefined>;
  listAppointmentsWithGoogleEventId(userId: number, from: number, to: number): Promise<Appointment[]>;
  getAppointmentByConfirmToken(token: string): Promise<Appointment | undefined>;
  getAppointmentByCancelToken(token: string): Promise<Appointment | undefined>;
  getAppointmentByStripeSessionId(sessionId: string): Promise<Appointment | undefined>;
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

  // Avis Google — RDV passés depuis ≥ 2j sans demande d'avis envoyée
  listAppointmentsForReviewRequest(userId: number, beforeMs: number): Promise<Appointment[]>;

  // Invoices
  listInvoices(userId: number, opts?: { status?: string; from?: number; to?: number; clientId?: number }): Promise<Invoice[]>;
  getInvoice(id: number): Promise<Invoice | undefined>;
  getInvoiceItems(invoiceId: number): Promise<InvoiceItem[]>;
  createInvoice(data: InsertInvoice & { createdAt: number; updatedAt: number }): Promise<Invoice>;
  updateInvoice(id: number, patch: Partial<Invoice>): Promise<Invoice | undefined>;
  deleteInvoice(id: number): Promise<void>;
  replaceInvoiceItems(invoiceId: number, items: InsertInvoiceItem[]): Promise<InvoiceItem[]>;
  getInvoiceByAppointment(appointmentId: number): Promise<Invoice | undefined>;
  isStripeSessionProcessed(sessionId: string): Promise<boolean>;
  markStripeSessionProcessed(userId: number, sessionId: string, appointmentId: number | null): Promise<boolean>;
  nextInvoiceCounter(userId: number, year: number): Promise<number>;
  createInvoiceNumbered(year: number, data: Omit<InsertInvoice, "number"> & { createdAt: number; updatedAt: number }): Promise<Invoice>;

  // PHASE 3.5-C — Email templates
  getEmailTemplate(userId: number, kind: string): Promise<EmailTemplate | undefined>;
  listEmailTemplates(userId: number): Promise<EmailTemplate[]>;
  upsertEmailTemplate(userId: number, kind: string, data: { subject: string; bodyHtml: string }): Promise<EmailTemplate>;

  // Anamnèse — templates et réponses
  listAnamnesisTemplates(userId: number): Promise<AnamnesisTemplate[]>;
  getAnamnesisTemplate(id: number): Promise<AnamnesisTemplate | undefined>;
  createAnamnesisTemplate(data: InsertAnamnesisTemplate & { userId: number }): Promise<AnamnesisTemplate>;
  updateAnamnesisTemplate(id: number, patch: Partial<AnamnesisTemplate>): Promise<AnamnesisTemplate | undefined>;
  deleteAnamnesisTemplate(id: number): Promise<void>;
  createAnamnesisResponse(data: Omit<InsertAnamnesisResponse, "createdAt"> & { userId: number; token: string }): Promise<AnamnesisResponse>;
  getAnamnesisResponseByToken(token: string): Promise<AnamnesisResponse | undefined>;
  updateAnamnesisResponse(id: number, patch: Partial<AnamnesisResponse>): Promise<AnamnesisResponse | undefined>;
  listAnamnesisResponses(userId: number, clientId?: number): Promise<AnamnesisResponse[]>;

  // Programmes d'hygiène de vie
  listPrograms(userId: number, clientId?: number): Promise<Program[]>;
  getProgram(id: number): Promise<Program | undefined>;
  createProgram(data: InsertProgram & { userId: number }): Promise<Program>;
  updateProgram(id: number, patch: Partial<Program>): Promise<Program | undefined>;
  deleteProgram(id: number): Promise<void>;

  // Documents client
  listClientDocuments(userId: number, clientId: number): Promise<Omit<ClientDocument, "dataBase64">[]>;
  getClientDocument(id: number): Promise<ClientDocument | undefined>;
  createClientDocument(data: InsertClientDocument): Promise<ClientDocument>;
  deleteClientDocument(id: number): Promise<void>;

  // Base de solutions naturelles (globales + perso du praticien)
  listNaturalSolutions(userId: number): Promise<NaturalSolution[]>;
  getNaturalSolution(id: number): Promise<NaturalSolution | undefined>;
  createNaturalSolution(data: InsertNaturalSolution): Promise<NaturalSolution>;
  updateNaturalSolution(id: number, patch: Partial<NaturalSolution>): Promise<NaturalSolution | undefined>;
  deleteNaturalSolution(id: number): Promise<void>;
  countGlobalNaturalSolutions(): Promise<number>;

  // Forfaits / carnets de séances
  listPackages(userId: number, clientId?: number): Promise<Package[]>;
  getPackage(id: number): Promise<Package | undefined>;
  createPackage(data: InsertPackage & { userId: number }): Promise<Package>;
  updatePackage(id: number, patch: Partial<Package>): Promise<Package | undefined>;
  deletePackage(id: number): Promise<void>;

  // Assistant IA — discussions
  listDiscussions(userId: number): Promise<AiDiscussion[]>;
  getDiscussion(id: number): Promise<AiDiscussion | undefined>;
  createDiscussion(d: { userId: number; clientId: number | null; theme: string | null; title?: string }): Promise<AiDiscussion>;
  updateDiscussion(id: number, patch: Partial<{ title: string; theme: string | null; clientId: number | null }>): Promise<AiDiscussion | undefined>;
  touchDiscussion(id: number): Promise<void>;
  deleteDiscussion(id: number): Promise<void>;
  detachClientFromDiscussions(clientId: number): Promise<void>;
  // Assistant IA — messages (scopés par discussion)
  listDiscussionMessages(discussionId: number, limit?: number): Promise<AiChatMessage[]>;
  createDiscussionMessage(d: { discussionId: number; userId: number; role: string; content: string }): Promise<AiChatMessage>;
  // Backfill legacy
  listLegacyChatUserIds(): Promise<number[]>;
  assignLegacyMessagesToDiscussion(userId: number, discussionId: number): Promise<void>;
  // Quota (inchangé)
  incrementAiChatUsage(userId: number, day: string): Promise<number>;

  // Assistant IA — instructions globales + base de connaissances (RAG)
  getAssistantInstructions(): Promise<string>;
  setAssistantInstructions(text: string): Promise<void>;
  listKbDocuments(): Promise<KbDocument[]>;
  createKbDocument(d: { title: string; filename: string | null; mimeType: string | null; charCount: number; status: string; error: string | null; folder?: string | null }): Promise<KbDocument>;
  deleteKbDocument(id: number): Promise<void>;
  insertKbChunks(rows: { documentId: number; chunkIndex: number; content: string; embedding: string }[]): Promise<void>;
  listAllKbChunks(): Promise<KbChunk[]>;

  // Studio contenu
  createContentPost(d: { userId: number; channel: string; format: string; theme: string | null; title: string; body: string; slidesJson?: string | null; backgroundImage?: string | null }): Promise<ContentPost>;
  listContentPosts(userId: number, status?: string): Promise<Omit<ContentPost, "backgroundImage">[]>;
  getContentPostBackground(id: number): Promise<{ userId: number; backgroundImage: string | null } | undefined>;
  getContentPost(id: number): Promise<ContentPost | undefined>;
  updateContentPost(id: number, patch: { body?: string; status?: string }): Promise<ContentPost | undefined>;
  deleteContentPost(id: number): Promise<void>;
  getClientThemeStats(userId: number, sinceMs: number): Promise<Array<{ theme: string; count: number }>>;
  updateUserMarketing(userId: number, patch: { marketingTone: string | null; marketingAudience: string | null }): Promise<void>;
  markStudioIntroSeen(userId: number): Promise<void>;
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
    // invoice_items est la seule table sans user_id : on passe par les factures.
    const userInvoices = await db.select({ id: invoices.id }).from(invoices).where(eq(invoices.userId, userId));
    for (const inv of userInvoices) {
      await db.delete(invoiceItems).where(eq(invoiceItems.invoiceId, inv.id));
    }
    // Puis TOUTES les tables portant un user_id (cf. USER_SCOPED_TABLES).
    for (const table of USER_SCOPED_TABLES) {
      await db.delete(table).where(eq((table as any).userId, userId));
    }
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

  /** Supprime les sessions expirées. Rien ne les purgeait : la table grossissait sans fin. */
  async purgeExpiredSessions(): Promise<number> {
    const expirees = await db.select({ id: sessions.id }).from(sessions)
      .where(lte(sessions.expiresAt, Date.now()));
    if (expirees.length) await db.delete(sessions).where(lte(sessions.expiresAt, Date.now()));
    return expirees.length;
  }

  /** Révoque toutes les sessions d'un utilisateur (changement de mot de passe). */
  async deleteSessionsForUser(userId: number): Promise<void> {
    await db.delete(sessions).where(eq(sessions.userId, userId));
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

  /**
   * Supprime une fiche cliente ET tout ce qui s'y rattache.
   *
   * Seule la ligne `clients` était supprimée : les comptes-rendus de consultation, les
   * documents de santé (PDF d'analyses), les réponses d'anamnèse, les programmes et les
   * forfaits restaient en base indéfiniment — et les rendez-vous à venir gardaient leur
   * client_id, donc les rappels automatiques continuaient de partir à une personne
   * censée avoir été effacée. C'est le droit à l'effacement (RGPD art. 17) appliqué à
   * une cliente, pas seulement au compte de la praticienne.
   *
   * Les rendez-vous sont CONSERVÉS (ils portent l'historique comptable et le lien avec
   * les factures) mais détachés : client_id passe à NULL et les coordonnées nominatives
   * sont vidées.
   */
  async deleteClient(id: number): Promise<void> {
    await db.delete(consultationNotes).where(eq(consultationNotes.clientId, id));
    await db.delete(clientDocuments).where(eq(clientDocuments.clientId, id));
    await db.delete(anamnesisResponses).where(eq(anamnesisResponses.clientId, id));
    await db.delete(programs).where(eq(programs.clientId, id));
    await db.delete(packages).where(eq(packages.clientId, id));
    await db.update(appointments)
      .set({ clientId: null, clientFirstName: null, clientLastName: null, clientEmail: null, clientPhone: null } as any)
      .where(eq(appointments.clientId, id));
    await db.delete(clients).where(eq(clients.id, id));
  }

  // ── Appointments ───────────────────────────────────────────────────────────
  /**
   * Rendez-vous d'un praticien. Sans bornes, la fenêtre par défaut couvre 12 mois
   * glissants : l'agenda appelait la route sans paramètres et rapatriait TOUT
   * l'historique à chaque ouverture, pour n'en afficher qu'une semaine.
   */
  async listAppointments(userId: number, from?: number, to?: number): Promise<Appointment[]> {
    const now = Date.now();
    const debut = from ?? now - 365 * 86400000;
    const fin = to ?? now + 365 * 86400000;
    return db.select().from(appointments).where(and(
      eq(appointments.userId, userId),
      gte(appointments.startAt, debut),
      lte(appointments.startAt, fin),
    ));
  }

  /** Variante explicitement NON bornée — export RGPD uniquement. */
  async listAllAppointments(userId: number): Promise<Appointment[]> {
    return db.select().from(appointments).where(eq(appointments.userId, userId));
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

  async getAppointmentByStripeSessionId(sessionId: string): Promise<Appointment | undefined> {
    if (!sessionId) return undefined;
    return first(db.select().from(appointments).where(eq(appointments.stripeSessionId, sessionId)));
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

  /** RDV terminés (status='completed' ou endAt passé) depuis ≥ beforeMs, sans demande d'avis déjà envoyée. */
  async listAppointmentsForReviewRequest(userId: number, beforeMs: number): Promise<Appointment[]> {
    const rows = await db
      .select()
      .from(appointments)
      .where(
        and(
          eq(appointments.userId, userId),
          lte(appointments.endAt, beforeMs),
        ),
      );
    return rows.filter((a: any) =>
      (a.status === "completed" || (a.status !== "cancelled" && a.status !== "blocked")) &&
      !a.reviewEmailSentAt &&
      (a.clientEmail || a.clientId),
    ) as Appointment[];
  }

  /** Une session Stripe a-t-elle déjà donné lieu à un rendez-vous ? (marqueur durable) */
  async isStripeSessionProcessed(sessionId: string): Promise<boolean> {
    const row = await first(
      db.select({ id: stripeProcessedSessions.id })
        .from(stripeProcessedSessions)
        .where(eq(stripeProcessedSessions.sessionId, sessionId)),
    );
    return !!row;
  }

  /**
   * Marque une session Stripe comme traitée. Idempotent : une seconde insertion viole
   * la contrainte UNIQUE et est avalée — c'est justement le signal « déjà traité ».
   * Renvoie true si CE appel a posé le marqueur (donc si l'appelant peut créer le RDV).
   */
  async markStripeSessionProcessed(userId: number, sessionId: string, appointmentId: number | null): Promise<boolean> {
    try {
      await db.insert(stripeProcessedSessions).values({
        userId, sessionId, appointmentId, createdAt: Date.now(),
      });
      return true;
    } catch (e: any) {
      const signature = `${e?.code || ""} ${e?.message || e}`;
      if (/UNIQUE|ER_DUP_ENTRY|Duplicate entry|SQLITE_CONSTRAINT/i.test(signature)) return false;
      throw e;
    }
  }

  async nextInvoiceCounter(userId: number, year: number): Promise<number> {
    // Le prochain numéro est DÉDUIT des factures déjà émises pour cette année-là,
    // et non d'un compteur stocké sur users.
    //
    // Les colonnes users.invoice_counter_{year,value} ne mémorisaient qu'UNE seule
    // année. Émettre une facture antidatée sur l'exercice précédent (cas courant en
    // janvier : les séances de décembre) écrasait le compteur de l'année en cours,
    // qui repartait ensuite à 1 et entrait en collision avec les numéros existants.
    // Elles sont conservées en base (données de production) mais ne sont plus ni
    // lues ni écrites.
    //
    // Cette fonction est en LECTURE SEULE : la concurrence est traitée en amont par
    // serialiserParUser et, en dernier ressort, par l'index UNIQUE(user_id, number)
    // avec retry — cf. createInvoiceNumbered.
    const prefixe = invoiceNumberPrefix(year);
    const rows: Array<{ number: string }> = await db
      .select({ number: invoices.number })
      .from(invoices)
      .where(and(eq(invoices.userId, userId), like(invoices.number, `${prefixe}%`)));

    let max = 0;
    for (const r of rows) {
      const n = Number(String(r.number).slice(prefixe.length));
      if (Number.isInteger(n) && n > max) max = n;
    }
    return max + 1;
  }

  /**
   * Crée une facture en lui attribuant son numéro.
   *
   * Trois protections empilées, parce qu'aucune ne suffit seule :
   *
   *  1. `nextInvoiceCounter` incrémente atomiquement (plus de read-modify-write).
   *  2. Les créations d'un MÊME praticien sont sérialisées en mémoire. Sans ça,
   *     l'incrément et la relecture du compteur ne forment pas un tout : sous
   *     N appels concurrents, les N incréments s'exécutent d'abord et les N
   *     lectures renvoient toutes la même valeur finale. Mesuré : 8 créations
   *     simultanées produisaient 8 fois le même numéro.
   *  3. L'index UNIQUE(user_id, number) est le filet de sécurité — il couvre le
   *     cas multi-process (plusieurs workers Passenger), que le verrou mémoire ne
   *     voit pas. Le perdant est rejeté par la base et retenté avec un numéro frais.
   *
   * ponytail: verrou en mémoire, donc efficace dans un seul process. Si l'app passe
   * à plusieurs workers, c'est (3) qui tient — au prix de quelques retries. Passer à
   * un verrou en base (SELECT … FOR UPDATE) seulement si ces retries deviennent visibles.
   */
  async createInvoiceNumbered(
    year: number,
    data: Omit<InsertInvoice, "number"> & { createdAt: number; updatedAt: number },
  ): Promise<Invoice> {
    const userId = (data as any).userId as number;
    return serialiserParUser(userId, async () => {
      let derniere: unknown;
      for (let tentative = 1; tentative <= 8; tentative++) {
        const number = buildInvoiceNumber(year, await this.nextInvoiceCounter(userId, year));
        try {
          return await this.createInvoice({ ...data, number } as any);
        } catch (e: any) {
          const signature = `${e?.code || ""} ${e?.message || e}`;
          if (!/UNIQUE|ER_DUP_ENTRY|Duplicate entry|SQLITE_CONSTRAINT/i.test(signature)) throw e;
          derniere = e;
          console.warn(`[facture] numéro ${number} déjà pris, nouvel essai (${tentative}/8)`);
        }
      }
      throw derniere;
    });
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

  // ── Anamnèse — Templates ───────────────────────────────────────────────────

  async listAnamnesisTemplates(userId: number): Promise<AnamnesisTemplate[]> {
    return db
      .select()
      .from(anamnesisTemplates)
      .where(eq(anamnesisTemplates.userId, userId))
      .orderBy(desc(anamnesisTemplates.createdAt));
  }

  async getAnamnesisTemplate(id: number): Promise<AnamnesisTemplate | undefined> {
    return first(db.select().from(anamnesisTemplates).where(eq(anamnesisTemplates.id, id)));
  }

  async createAnamnesisTemplate(
    data: InsertAnamnesisTemplate & { userId: number },
  ): Promise<AnamnesisTemplate> {
    const now = Date.now();
    return dbInsertReturning<AnamnesisTemplate>(anamnesisTemplates, {
      ...data,
      createdAt: now,
      updatedAt: now,
    });
  }

  async updateAnamnesisTemplate(
    id: number,
    patch: Partial<AnamnesisTemplate>,
  ): Promise<AnamnesisTemplate | undefined> {
    return dbUpdateReturning<AnamnesisTemplate>(anamnesisTemplates, id, {
      ...patch,
      updatedAt: Date.now(),
    });
  }

  async deleteAnamnesisTemplate(id: number): Promise<void> {
    await db.delete(anamnesisTemplates).where(eq(anamnesisTemplates.id, id));
  }

  // ── Anamnèse — Réponses ────────────────────────────────────────────────────

  async createAnamnesisResponse(
    data: Omit<InsertAnamnesisResponse, "createdAt"> & { userId: number; token: string },
  ): Promise<AnamnesisResponse> {
    return dbInsertReturning<AnamnesisResponse>(anamnesisResponses, {
      ...data,
      createdAt: Date.now(),
    });
  }

  async getAnamnesisResponseByToken(token: string): Promise<AnamnesisResponse | undefined> {
    return first(
      db.select().from(anamnesisResponses).where(eq(anamnesisResponses.token, token)),
    );
  }

  async updateAnamnesisResponse(
    id: number,
    patch: Partial<AnamnesisResponse>,
  ): Promise<AnamnesisResponse | undefined> {
    return dbUpdateReturning<AnamnesisResponse>(anamnesisResponses, id, patch);
  }

  async listAnamnesisResponses(userId: number, clientId?: number): Promise<AnamnesisResponse[]> {
    const conds = [eq(anamnesisResponses.userId, userId)];
    if (clientId !== undefined) conds.push(eq(anamnesisResponses.clientId, clientId));
    return db
      .select()
      .from(anamnesisResponses)
      .where(and(...conds))
      .orderBy(desc(anamnesisResponses.createdAt));
  }

  // ── Programmes d'hygiène de vie ────────────────────────────────────────────

  async listPrograms(userId: number, clientId?: number): Promise<Program[]> {
    const conds = [eq(programs.userId, userId)];
    if (clientId !== undefined) conds.push(eq(programs.clientId, clientId));
    return db.select().from(programs).where(and(...conds)).orderBy(desc(programs.createdAt));
  }

  async getProgram(id: number): Promise<Program | undefined> {
    return first(db.select().from(programs).where(eq(programs.id, id)));
  }

  async createProgram(data: InsertProgram & { userId: number }): Promise<Program> {
    const now = Date.now();
    return dbInsertReturning<Program>(programs, { ...data, createdAt: now, updatedAt: now });
  }

  async updateProgram(id: number, patch: Partial<Program>): Promise<Program | undefined> {
    return dbUpdateReturning<Program>(programs, id, { ...patch, updatedAt: Date.now() });
  }

  async deleteProgram(id: number): Promise<void> {
    await db.delete(programs).where(eq(programs.id, id));
  }

  // ── Documents client ───────────────────────────────────────────────────────

  async listClientDocuments(userId: number, clientId: number): Promise<Omit<ClientDocument, "dataBase64">[]> {
    return db
      .select({
        id: clientDocuments.id,
        userId: clientDocuments.userId,
        clientId: clientDocuments.clientId,
        filename: clientDocuments.filename,
        mimeType: clientDocuments.mimeType,
        sizeBytes: clientDocuments.sizeBytes,
        createdAt: clientDocuments.createdAt,
      })
      .from(clientDocuments)
      .where(and(eq(clientDocuments.userId, userId), eq(clientDocuments.clientId, clientId)))
      .orderBy(desc(clientDocuments.createdAt));
  }

  async getClientDocument(id: number): Promise<ClientDocument | undefined> {
    return first(db.select().from(clientDocuments).where(eq(clientDocuments.id, id)));
  }

  async createClientDocument(data: InsertClientDocument): Promise<ClientDocument> {
    return dbInsertReturning<ClientDocument>(clientDocuments, { ...data, createdAt: Date.now() });
  }

  async deleteClientDocument(id: number): Promise<void> {
    await db.delete(clientDocuments).where(eq(clientDocuments.id, id));
  }

  // ── Base de solutions naturelles ─────────────────────────────────────────────

  async listNaturalSolutions(userId: number): Promise<NaturalSolution[]> {
    // Globales (user_id NULL) + entrées perso du praticien.
    return db
      .select()
      .from(naturalSolutions)
      .where(or(sql`${naturalSolutions.userId} IS NULL`, eq(naturalSolutions.userId, userId)))
      .orderBy(naturalSolutions.category, naturalSolutions.name);
  }

  async getNaturalSolution(id: number): Promise<NaturalSolution | undefined> {
    return first(db.select().from(naturalSolutions).where(eq(naturalSolutions.id, id)));
  }

  async createNaturalSolution(data: InsertNaturalSolution): Promise<NaturalSolution> {
    const now = Date.now();
    return dbInsertReturning<NaturalSolution>(naturalSolutions, { ...data, createdAt: now, updatedAt: now });
  }

  async updateNaturalSolution(id: number, patch: Partial<NaturalSolution>): Promise<NaturalSolution | undefined> {
    return dbUpdateReturning<NaturalSolution>(naturalSolutions, id, { ...patch, updatedAt: Date.now() });
  }

  async deleteNaturalSolution(id: number): Promise<void> {
    await db.delete(naturalSolutions).where(eq(naturalSolutions.id, id));
  }

  async countGlobalNaturalSolutions(): Promise<number> {
    const rows = await db.select({ id: naturalSolutions.id }).from(naturalSolutions).where(sql`${naturalSolutions.userId} IS NULL`);
    return rows.length;
  }

  // ── Forfaits / carnets de séances ──────────────────────────────────────────

  async listPackages(userId: number, clientId?: number): Promise<Package[]> {
    const conds = [eq(packages.userId, userId)];
    if (clientId !== undefined) conds.push(eq(packages.clientId, clientId));
    return db.select().from(packages).where(and(...conds)).orderBy(desc(packages.createdAt));
  }

  async getPackage(id: number): Promise<Package | undefined> {
    return first(db.select().from(packages).where(eq(packages.id, id)));
  }

  async createPackage(data: InsertPackage & { userId: number }): Promise<Package> {
    const now = Date.now();
    return dbInsertReturning<Package>(packages, { ...data, createdAt: now, updatedAt: now });
  }

  async updatePackage(id: number, patch: Partial<Package>): Promise<Package | undefined> {
    return dbUpdateReturning<Package>(packages, id, { ...patch, updatedAt: Date.now() });
  }

  async deletePackage(id: number): Promise<void> {
    await db.delete(packages).where(eq(packages.id, id));
  }

  // ── Assistant IA — discussions ───────────────────────────────────────────────
  async listDiscussions(userId: number): Promise<AiDiscussion[]> {
    return db.select().from(aiDiscussions)
      .where(eq(aiDiscussions.userId, userId))
      .orderBy(desc(aiDiscussions.updatedAt), desc(aiDiscussions.id));
  }
  async getDiscussion(id: number): Promise<AiDiscussion | undefined> {
    return first(db.select().from(aiDiscussions).where(eq(aiDiscussions.id, id)));
  }
  async createDiscussion(d: { userId: number; clientId: number | null; theme: string | null; title?: string }): Promise<AiDiscussion> {
    const now = Date.now();
    return dbInsertReturning<AiDiscussion>(aiDiscussions, {
      userId: d.userId, clientId: d.clientId, theme: d.theme,
      title: d.title ?? "Nouvelle discussion", createdAt: now, updatedAt: now,
    });
  }
  async updateDiscussion(id: number, patch: Partial<{ title: string; theme: string | null; clientId: number | null }>): Promise<AiDiscussion | undefined> {
    await db.update(aiDiscussions).set({ ...patch, updatedAt: Date.now() }).where(eq(aiDiscussions.id, id));
    return this.getDiscussion(id);
  }
  async touchDiscussion(id: number): Promise<void> {
    await db.update(aiDiscussions).set({ updatedAt: Date.now() }).where(eq(aiDiscussions.id, id));
  }
  async deleteDiscussion(id: number): Promise<void> {
    await db.delete(aiChatMessages).where(eq(aiChatMessages.discussionId, id));
    await db.delete(aiDiscussions).where(eq(aiDiscussions.id, id));
  }
  async detachClientFromDiscussions(clientId: number): Promise<void> {
    await db.update(aiDiscussions).set({ clientId: null }).where(eq(aiDiscussions.clientId, clientId));
  }

  // ── Studio contenu ───────────────────────────────────────────────────────────
  async createContentPost(d: { userId: number; channel: string; format: string; theme: string | null; title: string; body: string; slidesJson?: string | null; backgroundImage?: string | null }): Promise<ContentPost> {
    const now = Date.now();
    return dbInsertReturning<ContentPost>(contentPosts, {
      userId: d.userId, channel: d.channel, format: d.format, theme: d.theme,
      title: d.title, body: d.body, status: "brouillon",
      slidesJson: d.slidesJson ?? null, backgroundImage: d.backgroundImage ?? null,
      createdAt: now, updatedAt: now, publishedAt: null,
    });
  }

  /**
   * Liste les contenus SANS le fond d'image (`background_image`, LONGTEXT jusqu'à 4 Mo
   * de base64 par post). Un `select()` complet faisait descendre plusieurs dizaines de
   * Mo à chaque ouverture de la bibliothèque. Le fond est servi à la demande par
   * getContentPostBackground, quand l'utilisateur affiche ou télécharge les visuels.
   */
  async listContentPosts(userId: number, status?: string): Promise<Omit<ContentPost, "backgroundImage">[]> {
    const where = status
      ? and(eq(contentPosts.userId, userId), eq(contentPosts.status, status))
      : eq(contentPosts.userId, userId);
    return db.select({
      id: contentPosts.id, userId: contentPosts.userId, channel: contentPosts.channel,
      format: contentPosts.format, theme: contentPosts.theme, title: contentPosts.title,
      body: contentPosts.body, status: contentPosts.status, slidesJson: contentPosts.slidesJson,
      createdAt: contentPosts.createdAt, updatedAt: contentPosts.updatedAt,
      publishedAt: contentPosts.publishedAt,
    }).from(contentPosts).where(where)
      .orderBy(desc(contentPosts.updatedAt), desc(contentPosts.id));
  }

  /** Fond d'image d'un contenu, chargé à la demande (cf. listContentPosts). */
  async getContentPostBackground(id: number): Promise<{ userId: number; backgroundImage: string | null } | undefined> {
    return first(
      db.select({ userId: contentPosts.userId, backgroundImage: contentPosts.backgroundImage })
        .from(contentPosts).where(eq(contentPosts.id, id)),
    );
  }

  async getContentPost(id: number): Promise<ContentPost | undefined> {
    return first(db.select().from(contentPosts).where(eq(contentPosts.id, id)));
  }

  async updateContentPost(id: number, patch: { body?: string; status?: string }): Promise<ContentPost | undefined> {
    const set: any = { updatedAt: Date.now() };
    if (patch.body !== undefined) set.body = patch.body;
    if (patch.status !== undefined) {
      set.status = patch.status;
      if (patch.status === "publie") set.publishedAt = Date.now();
    }
    return dbUpdateReturning<ContentPost>(contentPosts, id, set);
  }

  async deleteContentPost(id: number): Promise<void> {
    await db.delete(contentPosts).where(eq(contentPosts.id, id));
  }

  async getClientThemeStats(userId: number, sinceMs: number): Promise<Array<{ theme: string; count: number }>> {
    const rows = await db
      .select({ theme: aiDiscussions.theme, count: sql<number>`count(*)` })
      .from(aiDiscussions)
      .where(and(eq(aiDiscussions.userId, userId), gte(aiDiscussions.createdAt, sinceMs)))
      .groupBy(aiDiscussions.theme);
    return rankThemes(rows as Array<{ theme: string | null; count: number }>);
  }

  async updateUserMarketing(userId: number, patch: { marketingTone: string | null; marketingAudience: string | null }): Promise<void> {
    await db.update(users).set({ marketingTone: patch.marketingTone, marketingAudience: patch.marketingAudience }).where(eq(users.id, userId));
  }

  async markStudioIntroSeen(userId: number): Promise<void> {
    await db.update(users).set({ studioIntroSeenAt: Date.now() }).where(eq(users.id, userId));
  }

  // ── Assistant IA — messages ──────────────────────────────────────────────────
  async listDiscussionMessages(discussionId: number, limit = 200): Promise<AiChatMessage[]> {
    const rows = await db.select().from(aiChatMessages)
      .where(eq(aiChatMessages.discussionId, discussionId))
      .orderBy(desc(aiChatMessages.createdAt), desc(aiChatMessages.id))
      .limit(limit);
    return rows.reverse();
  }
  async createDiscussionMessage(d: { discussionId: number; userId: number; role: string; content: string }): Promise<AiChatMessage> {
    return dbInsertReturning<AiChatMessage>(aiChatMessages, { ...d, createdAt: Date.now() });
  }
  // ── Backfill legacy ──────────────────────────────────────────────────────────
  async listLegacyChatUserIds(): Promise<number[]> {
    const rows = await db.selectDistinct({ userId: aiChatMessages.userId })
      .from(aiChatMessages).where(isNull(aiChatMessages.discussionId));
    return rows.map((r: { userId: number }) => r.userId);
  }
  async assignLegacyMessagesToDiscussion(userId: number, discussionId: number): Promise<void> {
    await db.update(aiChatMessages).set({ discussionId })
      .where(and(eq(aiChatMessages.userId, userId), isNull(aiChatMessages.discussionId)));
  }

  async incrementAiChatUsage(userId: number, day: string): Promise<number> {
    const existing = await first<AiChatUsage>(
      db.select().from(aiChatUsage).where(and(eq(aiChatUsage.userId, userId), eq(aiChatUsage.day, day))),
    );
    if (existing) {
      await db.update(aiChatUsage).set({ count: existing.count + 1 }).where(eq(aiChatUsage.id, existing.id));
      return existing.count + 1;
    }
    await dbInsertReturning<AiChatUsage>(aiChatUsage, { userId, day, count: 1 });
    return 1;
  }

  // ── Assistant IA — instructions globales + base de connaissances (RAG) ───────
  // Singleton : on opère toujours sur la ligne d'id le plus bas (la canonique),
  // jamais sur un id codé en dur (qui pouvait ne pas exister → chaque save créait
  // une ligne orpheline et getAssistantInstructions renvoyait toujours "").
  async getAssistantInstructions(): Promise<string> {
    const row = await first<AssistantSettings>(db.select().from(assistantSettings).orderBy(assistantSettings.id));
    return row?.customInstructions ?? "";
  }

  async setAssistantInstructions(text: string): Promise<void> {
    const row = await first<AssistantSettings>(db.select().from(assistantSettings).orderBy(assistantSettings.id));
    if (row) await db.update(assistantSettings).set({ customInstructions: text, updatedAt: Date.now() }).where(eq(assistantSettings.id, row.id));
    else await dbInsertReturning<AssistantSettings>(assistantSettings, { customInstructions: text, updatedAt: Date.now() });
  }

  async listKbDocuments(): Promise<KbDocument[]> {
    return db.select().from(kbDocuments).orderBy(desc(kbDocuments.createdAt), desc(kbDocuments.id));
  }

  async createKbDocument(d: { title: string; filename: string | null; mimeType: string | null; charCount: number; status: string; error: string | null; folder?: string | null }): Promise<KbDocument> {
    return dbInsertReturning<KbDocument>(kbDocuments, { ...d, folder: d.folder ?? null, createdAt: Date.now() });
  }

  async deleteKbDocument(id: number): Promise<void> {
    await db.delete(kbChunks).where(eq(kbChunks.documentId, id));
    await db.delete(kbDocuments).where(eq(kbDocuments.id, id));
  }

  async insertKbChunks(rows: { documentId: number; chunkIndex: number; content: string; embedding: string }[]): Promise<void> {
    for (const r of rows) await dbInsertReturning<KbChunk>(kbChunks, { ...r, createdAt: Date.now() });
  }

  async listAllKbChunks(): Promise<KbChunk[]> {
    return db.select().from(kbChunks);
  }
}

export const storage = new DatabaseStorage();
