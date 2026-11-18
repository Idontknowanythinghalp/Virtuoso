# Virtuoso CMS

Competition Management System (CMS) for **Virtuoso**, presented by the Department of Business Administration, St. Joseph's College of Commerce (Autonomous), Bengaluru (4–5 December 2026).

## Current Stage: Stage 2B.2 — Safe Registration Import Execution

Stage 2B.2 extends the Stage 2B.1 preparation workspace on `/imports` into a complete, atomic, non-destructive registration import execution workflow:

- **Import Preparation & Execution (`/imports`):** Eight-step organiser workflow:
  1. Select Target Event
  2. Upload `.csv` or macro-free `.xlsx` file
  3. Inspect Detected Columns
  4. Map Source Columns to Stage 2A Fields
  5. Run Server-Side Validation
  6. Review Preview, Skip Rows, & Resolve Existing CMS Matches (Reuse, Approved Allowlisted Field Updates, or Skip) + Inspect Missing-from-File CMS Entries
  7. Confirm Execution (with idempotency key & pre-execution summary)
  8. Execution Summary & Persistent Per-Event Import History
- **Non-Destructive Guarantees:** Existing `event_entries` operational statuses, codenames, scores, judge assignments, advancement, ties, and results are never modified or deleted. Existing event entries absent from an uploaded file are flagged and retained untouched.
- **Database Atomicity & Idempotency:** Executed inside a single PostgreSQL transaction via `public.execute_registration_import` (Migration `0004`) with per-event `pg_advisory_xact_lock`, completed idempotency key protection, immutable `registration_imports` history, and non-PII `audit_logs` tracking (`initiated`, `completed`, `failed`, `approved_updates_applied`).

### Completed Stage 2A & 2B.1 Modules

- **Events (`/events`, `/events/[eventId]`):** Create, edit, view, activate, deactivate, and archive events with configurable `entry_mode`, `codename_mode`, and optional variable team size bounds.
- **Rounds (`/events/[eventId]/rounds/[roundId]`):** Create, edit, reorder transactionally, and lock/unlock rounds within an event.
- **Judging Criteria:** Add, edit, reorder, and delete rubric criteria with lock protection and Stage 3 `scores` protection.
- **Contingents & Participants (`/contingents`, `/participants`):** Manage institutional contingents, independent individual participants, and external registration references.
- **Event Entries:** Register and manage event entries enforcing strict `contingent` XOR `participant` integrity.

Modules deferred to later stages (Stage 3+): Codename generation/assignment, file uploads/Storage, judging/scoring entry, tabulation/advancement, and the separate Competitor Portal.

## Tech Stack

- **Framework:** Next.js App Router (Next.js 16 `proxy.ts` + Server Components & Route Handlers)
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS v4
- **Auth & Database:** Supabase Auth + PostgreSQL (`@supabase/ssr`, `@supabase/supabase-js`)
- **Spreadsheet Parsing:** Custom RFC-4180 CSV parser + `read-excel-file` (macro-free `.xlsx` reader)
- **Linting:** ESLint (`eslint-config-next`)
- **Icons:** Lucide React

## Project Structure

```text
src/
  app/
    actions/        Server Actions for auth, accounts, competition structure, and registry
    api/imports/    Protected Stage 2B.1 & 2B.2 endpoints (parse, preview, execute, history)
    admin/          Super Admin pages (/admin/accounts, /admin/audit-logs)
    events/         Events, rounds, judging criteria, and event entries pages
    contingents/    Contingent registry and member rosters
    participants/   Participant registry (contingent members and independent individuals)
    imports/        Stage 2B.1 & 2B.2 Registration Import & Execution workspace
    login/          Organiser sign-in page (public registration disabled)
    modules/        Protected placeholder routes for upcoming CMS modules
    access-denied/
  components/       Layout shell, auth forms, admin views, Stage 2A & 2B workspaces
  lib/
    audit/          Server-only audit logger and payload sanitizer
    auth/           Authoritative guards, access evaluation policy, and account rules
    competition/    Stage 2A server/shared validators
    imports/        Stage 2B.1/2B.2 parser, field catalog, validator, planner, and request helpers
    supabase/       Browser, server SSR, and server-only Admin clients
  types/            Shared TypeScript types
  proxy.ts          Next.js 16 session refresh proxy
supabase/
  migrations/       Version-controlled incremental SQL migrations (0001, 0002, 0003, 0004)
  README.md         Migration order and initial Super Admin bootstrap instructions
tests/
  stage1b-auth.test.mjs
  stage2a-competition.test.mjs
  stage2b1-imports.test.mjs
  stage2b2-imports.test.mjs
```

## Local Setup & Verification

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env.local` and fill in your `virtuoso` Supabase project values:
   ```bash
   cp .env.example .env.local
   ```
3. Apply the SQL migrations in order (`supabase/README.md`: `0001`, `0002`, `0003`, then `0004`) and bootstrap your first Super Admin.
4. Start the development server (port `3000`):
   ```bash
   npm run dev
   ```
5. Run all verification checks:
   ```bash
   npm run lint
   npm run typecheck
   npm test
   npm run build
   ```
