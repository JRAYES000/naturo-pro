# Feature Design: Multiple AI Assistant Discussions

**Date:** 2026-06-13  
**Feature:** Transform the single AI chat thread into multiple, categorized discussions linked to clients or thematic topics.

---

## Overview

Currently, /app/chat is a single conversation thread per practitioner, scoped by userId. This design refactors it into **multiple discussions**, each optionally linked to a client record or a thematic category. Goal: enable practitioners to retrieve and re-read past conversations with specific clients (to prepare for follow-up consultations) or by topic.

---

## Success Criteria

- ✅ Practitioners can create multiple discussions, each titled and categorized.
- ✅ A discussion links to **either** a specific client **or** a thematic topic (not both, not neither).
- ✅ The assistant reads client context (medical history, allergies, lifestyle notes) when a discussion is client-linked.
- ✅ Existing messages migrate to a default « Discussion générale » (no data loss).
- ✅ New discussions auto-generate title + category from the first question (minimal manual input).
- ✅ Practitioners can browse and reopen old discussions without re-asking.
- ✅ Client detail page shows linked discussions + quick access to create one.

---

## Scope & Out of Scope

### In Scope
- Database schema: i_discussions table, discussionId column on i_chat_messages.
- Discussion CRUD (create, read, update/rename, delete).
- Auto-generation of title and category from first question using AI.
- Predefined thematic categories (dropdown) + « Autre… » option.
- Client-linked discussions: inject client context into Mistral prompt.
- RGPD: very discrete banner showing what client data is used.
- Two-way navigation: Assistant ↔ ClientDetail.
- Migration of existing messages to « Discussion générale ».

### Out of Scope
- Discussion archiving (delete only, for now).
- Sharing discussions between practitioners.
- Advanced search across discussions (simple filter/sort in v1).
- Discussion templates or suggestions.

---

## Data Model

### New Table: ai_discussions

userId, clientId, title, category, createdAt, updatedAt, deletedAt (soft delete)

### Updated Table: ai_chat_messages

Add discussionId column with FK to ai_discussions.

---

## Predefined Thematic Categories

1. Sommeil & insomnie
2. Digestion & intestin
3. Stress, émotions & nervosité
4. Immunité
5. Détox & émonctoires
6. Hormonal & cycle féminin
7. Énergie & fatigue
8. Peau
9. Articulations & douleurs
10. Poids & alimentation
11. Circulation
12. Respiratoire
13. Autre…

---

## UI Design

### Assistant Page Layout

Two-column: left sidebar (discussions grouped by client/theme), right conversation pane.

Sidebar sections:
- Par cliente (sorted alphabetically)
- Par thématique (sorted by date, newest first)

Each discussion item: title (editable pencil) + date.

### Starting a New Discussion

Modal with two options:
- Option A: Select a client → auto-linked
- Option B: Select/enter a thematic category

First message auto-generates title + category via Mistral.

### Zero-Input from ClientDetail

Button « Demander à l'assistant » on client detail creates discussion already linked, no modal.

### Client Detail Page

New section « Discussions avec l'assistant » lists all linked discussions.

---

## RGPD & Client Data

When client-linked, inject compact context:
- First name, age, medical history, allergies, lifestyle notes, notes
- Exclude: email, phone, address, billing

Discrete single-line banner (gray, no background):
« ℹ️ Fiche cliente utilisée pour personnaliser les réponses. »

No explicit consent per-client in v1 (Mistral is EU-based, data is healthcare).

---

## Backend Routes

- GET /api/discussions → grouped list (by client / by theme)
- POST /api/discussions → create discussion, auto-generate title/category
- PATCH /api/discussions/:id → rename
- DELETE /api/discussions/:id → soft delete
- POST /api/discussions/:id/messages → send message, inject client context if needed

---

## Auto-Generation: Title & Category

On first message send:
1. Call Mistral to generate title (5-8 words, French, conversational)
2. Call Mistral to classify into predefined categories (or « Autre… »)
3. Update discussion record
4. Proceed with normal message flow

Cost: 2 lightweight Mistral calls (~50 tokens each).

---

## Migration: Existing Messages

Create default discussion per practitioner:
- title: « Discussion générale »
- category: « Historique »
- clientId: NULL

Assign all existing messages to this default discussion. No data loss.

---

## Frontend Components

### New
- DiscussionsList.tsx (left sidebar)
- DiscussionModal.tsx (new discussion picker)
- RgpdBanner.tsx (discrete client context banner)

### Updated
- Chat.tsx → AssistantDiscussions.tsx (two-column layout)
- ClientDetail.tsx (add discussions section + button)

### State (TanStack Query)
- useDiscussions()
- useCreateDiscussion()
- useDeleteDiscussion()
- useRenameDiscussion()

---

## Testing

- Unit: title/category generation, CRUD operations, grouping logic
- Integration: discussion creation + first message → title/category generated, client context injected
- Drift: schema validation (new table, new column)

---

## Timeline

~2–3 weeks full-stack (DB, backend, frontend, tests).
