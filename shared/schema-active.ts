/**
 * shared/schema-active.ts — Schéma actif selon DB_DRIVER
 *
 * Ce fichier re-exporte dynamiquement le schéma SQLite ou MySQL en fonction
 * de la variable d'environnement DB_DRIVER. C'est utilisé par server/storage.ts
 * et server/routes.ts pour qu'ils utilisent les bonnes définitions de tables
 * (mysqlTable vs sqliteTable) selon l'environnement.
 *
 * Sur Hostinger, DB_DRIVER=mysql → exports depuis schema-mysql.ts
 * Sur pplx.app preview, DB_DRIVER non défini → exports depuis schema.ts (SQLite)
 *
 * Les types et noms d'exports sont identiques entre les deux schémas.
 */

const DB_DRIVER = (process.env.DB_DRIVER ?? "sqlite").toLowerCase();

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
const activeSchema: any =
  DB_DRIVER === "mysql"
    ? require("./schema-mysql")
    : require("./schema");

// Tables
export const users = activeSchema.users;
export const appointmentCategories = activeSchema.appointmentCategories;
export const availabilitySlots = activeSchema.availabilitySlots;
export const clients = activeSchema.clients;
export const appointments = activeSchema.appointments;
export const consultationNotes = activeSchema.consultationNotes;
export const sessions = activeSchema.sessions;
export const emailLog = activeSchema.emailLog;
export const invoices = activeSchema.invoices;
export const invoiceItems = activeSchema.invoiceItems;
// PHASE 3.5-C — Email templates
export const emailTemplates = activeSchema.emailTemplates;

// Zod insert schemas
export const insertUserSchema = activeSchema.insertUserSchema;
export const insertCategorySchema = activeSchema.insertCategorySchema;
export const insertAvailabilitySchema = activeSchema.insertAvailabilitySchema;
export const insertClientSchema = activeSchema.insertClientSchema;
export const insertAppointmentSchema = activeSchema.insertAppointmentSchema;
export const insertNoteSchema = activeSchema.insertNoteSchema;
export const insertEmailTemplateSchema = activeSchema.insertEmailTemplateSchema;

// Re-exports types : on importe toujours depuis le schéma SQLite pour les types
// (ils sont identiques entre les deux schémas, et TypeScript a besoin d'imports
// statiques pour résoudre les types).
export type {
  User, InsertUser, AppointmentCategory, InsertCategory, AvailabilitySlot,
  InsertAvailability, Client, InsertClient, Appointment, InsertAppointment,
  ConsultationNote, InsertNote, Session, EmailLog,
  Invoice, InsertInvoice, InvoiceItem, InsertInvoiceItem,
  EmailTemplate, InsertEmailTemplate,
} from "./schema";
