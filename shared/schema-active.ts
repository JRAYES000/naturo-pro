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

import * as sqliteSchema from "./schema";
import * as mysqlSchema from "./schema-mysql";

const DB_DRIVER = (process.env.DB_DRIVER ?? "sqlite").toLowerCase();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const activeSchema: any = DB_DRIVER === "mysql" ? mysqlSchema : sqliteSchema;

// Tables
export const users = activeSchema.users;
export const appointmentCategories = activeSchema.appointmentCategories;
export const availabilitySlots = activeSchema.availabilitySlots;
export const clients = activeSchema.clients;
export const appointments = activeSchema.appointments;
export const consultationNotes = activeSchema.consultationNotes;
export const sessions = activeSchema.sessions;
export const invoices = activeSchema.invoices;
export const invoiceItems = activeSchema.invoiceItems;
// PHASE 3.5-C — Email templates
export const emailTemplates = activeSchema.emailTemplates;
// Lot métier (Phase 0)
export const anamnesisTemplates = activeSchema.anamnesisTemplates;
export const anamnesisResponses = activeSchema.anamnesisResponses;
export const programs = activeSchema.programs;
export const clientDocuments = activeSchema.clientDocuments;
export const naturalSolutions = activeSchema.naturalSolutions;
export const packages = activeSchema.packages;
export const aiChatMessages = activeSchema.aiChatMessages;

// Zod insert schemas
export const insertUserSchema = activeSchema.insertUserSchema;
export const insertCategorySchema = activeSchema.insertCategorySchema;
export const insertAvailabilitySchema = activeSchema.insertAvailabilitySchema;
export const insertClientSchema = activeSchema.insertClientSchema;
export const insertAppointmentSchema = activeSchema.insertAppointmentSchema;
export const insertNoteSchema = activeSchema.insertNoteSchema;
export const insertInvoiceSchema = activeSchema.insertInvoiceSchema;
export const insertInvoiceItemSchema = activeSchema.insertInvoiceItemSchema;
export const insertEmailTemplateSchema = activeSchema.insertEmailTemplateSchema;
export const insertAnamnesisTemplateSchema = activeSchema.insertAnamnesisTemplateSchema;
export const insertAnamnesisResponseSchema = activeSchema.insertAnamnesisResponseSchema;
export const insertProgramSchema = activeSchema.insertProgramSchema;
export const insertClientDocumentSchema = activeSchema.insertClientDocumentSchema;
export const insertNaturalSolutionSchema = activeSchema.insertNaturalSolutionSchema;
export const insertPackageSchema = activeSchema.insertPackageSchema;
export const insertAiChatMessageSchema = activeSchema.insertAiChatMessageSchema;

// Re-exports types : on importe toujours depuis le schéma SQLite pour les types
// (ils sont identiques entre les deux schémas, et TypeScript a besoin d'imports
// statiques pour résoudre les types).
export type {
  User, InsertUser, PublicUser, AppointmentCategory, InsertCategory, AvailabilitySlot,
  InsertAvailability, Client, InsertClient, Appointment, InsertAppointment,
  ConsultationNote, InsertNote, Session,
  Invoice, InsertInvoice, InvoiceItem, InsertInvoiceItem,
  EmailTemplate, InsertEmailTemplate,
  AnamnesisTemplate, InsertAnamnesisTemplate,
  AnamnesisResponse, InsertAnamnesisResponse,
  Program, InsertProgram,
  ClientDocument, InsertClientDocument,
  NaturalSolution, InsertNaturalSolution,
  Package, InsertPackage,
  AiChatMessage, InsertAiChatMessage,
} from "./schema";
