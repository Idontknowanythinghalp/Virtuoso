# Virtuoso CMS

Competition Management System (CMS) for **Virtuoso**, presented by the Department of Business Administration, St. Joseph's College of Commerce (Autonomous), Bengaluru (4–5 December 2026).

## Implemented Stages (Stages 0–3A)

- **Stage 1B — Organiser Auth & Audit Logs:**
  - Restricted organiser sign-in (`/login`), role-based access (`super_admin`, `event_coordinator`), active-profile enforcement, account provisioning/deactivation (`/admin/accounts`), and immutable audit logging (`/admin/audit-logs`).
- **Stage 2A — Competition Structure & Registry:**
  - Events, rounds, judging criteria, lock controls, contingents, participants, and event entries enforcing contingent/individual integrity (`/events`, `/contingents`, `/participants`).
- **Stage 2B.1 & 2B.2 — Safe Registration Imports (`/imports`):**
  - Eight-step `.csv` / macro-free `.xlsx` import preparation, preview, conflict resolution, and atomic idempotent execution via `public.execute_registration_import` with persistent `registration_imports` history.
- **Stage 2B.3 — Codename Management:**
  - Event-wide and per-round anonymous codename generation, manual assignment, and audited overwrite corrections (`assign_event_codenames`, `upsert_entry_codename`).
- **Stage 2C — Round Release Management:**
  - Manual round release, whole-minute duration (`1`–`1,440` minutes), read-time expiry enforcement, manual close/reopen lifecycle, and immutable `round_release_sessions` history.
- **Stage 3A — Overall Leaderboard (`/events/[eventId]/leaderboard`):**
  - Manually maintained per-event contingent rankings keyed authoritatively by `position` (ties supported with deterministic tie ordering), flexible text `display_value`, optional organiser notes (max 500 characters, no silent truncation), and atomic audited RPCs.

## Tech Stack

- **Framework:** Next.js App Router (Next.js 16 `proxy.ts` + Server Components, Server Actions & Route Handlers)
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
    actions/        Server Actions (auth, accounts, competition, registry, codenames, round-release, leaderboard)
    api/imports/    Protected Stage 2B.1 & 2B.2 endpoints (parse, preview, execute, history)
    admin/          Super Admin pages (/admin/accounts, /admin/audit-logs)
    events/         Events, rounds, judging criteria, entries, release management & overall leaderboard
    contingents/    Contingent registry and member rosters
    participants/   Participant registry (contingent members and independent individuals)
    imports/        Stage 2B.1 & 2B.2 Registration Import & Execution workspace
    login/          Organiser sign-in page (public registration disabled)
    modules/        Protected module routes
    access-denied/
  components/       Layout shell, auth forms, admin views, competition & leaderboard workspaces
  lib/
    audit/          Server-only audit logger and payload sanitizer
    auth/           Authoritative guards, access evaluation policy, and account rules
    codenames/      Codename generation & validation
    competition/    Stage 2A & 2C validators and round-release helpers
    imports/        Stage 2B.1/2B.2 parser, field catalog, validator, planner, and request helpers
    leaderboard/    Leaderboard validation and server-only read helpers
    supabase/       Browser, server SSR, and server-only Admin clients
  types/            Shared TypeScript types
  proxy.ts          Next.js 16 session refresh proxy
supabase/
  migrations/       Incremental SQL migrations (0001 through 0008)
  README.md         Migration order and initial Super Admin bootstrap instructions
scripts/
  export-zip.mjs    Builds a clean source archive excluding dependencies, build cache, and .env secrets
tests/
  stage1b-auth.test.mjs
  stage2a-competition.test.mjs
  stage2b1-imports.test.mjs
  stage2b2-imports.test.mjs
  stage2b3-codenames.test.mjs
  stage2c-round-release.test.mjs
  stage3a-leaderboard.test.mjs
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
3. Apply the SQL migrations in strict order (`0001` through `0008`, see `supabase/README.md`) and bootstrap your first Super Admin.
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
6. Create a clean source `.zip` archive locally (excluding `node_modules/`, `.next/`, and `.env.local`):
   ```bash
   npm run export:zip
   ```
