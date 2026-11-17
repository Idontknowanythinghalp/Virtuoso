# Virtuoso CMS

Competition Management System (CMS) for **Virtuoso**, presented by the Department of Business Administration, St. Joseph's College of Commerce (Autonomous), Bengaluru (4–5 December 2026).

## Current Stage: Stage 2B.1 — Registration Import Preparation

Stage 2B.1 builds on the Stage 1B secure organiser workspace (`super_admin` and `event_coordinator`) and Stage 2A competition structure to add safe, server-validated registration import preparation (preview only, prior to Stage 2B.2 database execution):

- **Import Preparation (`/imports`):** Six-step organiser workflow to select a Stage 2A event, upload `.csv` or macro-free `.xlsx` exports from the external college registration system, inspect detected columns (including duplicate column headings and skipped blank rows), flexibly map source columns to `contingents`, `participants`, and `event_entries` fields, mark required fields, and review a server-validated import preview.
- **Stage 2B.1 Boundaries:** Uploaded files are parsed and validated on the server without writing records to the database, generating/assigning codenames, or uploading source files to Supabase Storage.

### Completed Stage 2A Modules

- **Events (`/events`, `/events/[eventId]`):** Create, edit, view, activate, deactivate, and archive events with configurable `entry_mode`, `codename_mode`, and optional variable team size bounds (`min_team_size`, `max_team_size`).
- **Rounds (`/events/[eventId]/rounds/[roundId]`):** Create, edit, reorder transactionally, and lock/unlock rounds within an event with blueprint-aligned `scoring_method`, `attribution_mode`, and `status`.
- **Judging Criteria:** Add, edit, reorder, and delete rubric criteria (`display_order`, `name`, `max_points`, `weight`, `rubric_guidance`) with lock protection and automatic Stage 3 `scores` protection.
- **Contingents & Participants (`/contingents`, `/participants`):** Manage institutional contingents with variable team sizes, independent individual participants (optional `contingent_id`), and external registration references.
- **Event Entries:** Register and manage event entries enforcing strict `contingent` XOR `participant` integrity, duplicate prevention, and event `entry_mode` compatibility.

Modules deferred to later stages (Stage 2B.2/3+): Committing validated imports to database tables, codename generation/assignment, file uploads/Storage, judging/scoring entry, tabulation/advancement, and the separate Competitor Portal.

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
    api/imports/    Protected Stage 2B.1 endpoints for file parsing and preview validation
    admin/          Super Admin pages (/admin/accounts, /admin/audit-logs)
    events/         Events, rounds, judging criteria, and event entries pages
    contingents/    Contingent registry and member rosters
    participants/   Participant registry (contingent members and independent individuals)
    imports/        Stage 2B.1 Registration Import Preparation workspace
    login/          Organiser sign-in page (public registration disabled)
    modules/        Protected placeholder routes for upcoming CMS modules
    access-denied/
  components/       Layout shell, auth forms, admin views, Stage 2A & 2B.1 workspaces
  lib/
    audit/          Server-only audit logger and payload sanitizer
    auth/           Authoritative guards, access evaluation policy, and account rules
    competition/    Stage 2A server/shared validators
    imports/        Stage 2B.1 CSV/XLSX parser, field catalog, and batch validator
    supabase/       Browser, server SSR, and server-only Admin clients
  types/            Shared TypeScript types
  proxy.ts          Next.js 16 session refresh proxy
supabase/
  migrations/       Version-controlled incremental SQL migrations (0001, 0002, 0003)
  README.md         Migration order and initial Super Admin bootstrap instructions
tests/
  stage1b-auth.test.mjs
  stage2a-competition.test.mjs
  stage2b1-imports.test.mjs
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
3. Apply the SQL migrations in order (`supabase/README.md`: `0001`, `0002`, then `0003`) and bootstrap your first Super Admin.
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
