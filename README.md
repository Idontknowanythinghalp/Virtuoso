# Virtuoso CMS

Competition Management System (CMS) for **Virtuoso 2026** (*Heirs of the Solstice*), the national-level business and commerce competition presented by the **Department of Business Administration, St. Joseph's College of Commerce (Autonomous), Bengaluru** (4–5 December 2026).

This application provides an authenticated **Organiser CMS** for managing competition operations and an authenticated **Team / Participant Portal** for viewing live round briefs and published standings.

<<<<<<< HEAD
---

## 1. System A vs. System B Distinction

=======
I also have below the file structure + the supabase details for better understanding in the future.

---

## 1. System A vs. System B Distinction

>>>>>>> 1c3955cff922142dd1df114418d9009d2b5c1d9d
Virtuoso 2026 intentionally separates public registration/payments from internal competition operations:

- **System A (External, SJCC-Owned):** The separate registration and payment portal used by colleges to register and pay fees. System A is **not** part of this repository, and this CMS does **not** replace, modify, host, or sync directly with System A over a live API.
- **System B (This Repository — Virtuoso CMS):** The operational competition management system and participant portal. Registration records enter System B via validated `.csv` or macro-free `.xlsx` exports prepared from System A and uploaded through the Organiser Import workspace (`/imports`).

---

## 2. Technology Stack & Architecture

- **Framework:** Next.js 16 (`next` `^16.4.6`, App Router, Server Components, Server Actions, Route Handlers, and `src/proxy.ts` session refresh proxy)
- **Language:** TypeScript (strict mode)
- **UI & Styling:** React 19, Tailwind CSS v4 (`@tailwindcss/postcss`), Lucide React icons (`lucide-react`)
- **Backend & Auth:** Supabase (`@supabase/ssr`, `@supabase/supabase-js`) — Supabase Auth, PostgreSQL with Row Level Security (RLS) and transactional RPCs, and Supabase Private Storage
- **Spreadsheet Parsing:** Custom RFC-4180 CSV parser + `read-excel-file` (macro-free `.xlsx` support)
- **Validation & Testing:** ESLint (`eslint-config-next`), TypeScript (`tsc --noEmit`), and Node.js built-in test runner (`node --test`)
- **Packaging:** `next.config.ts` configured with `output: "standalone"` and `images: { unoptimized: true }`

### Architectural Boundaries

- **Server-first access control:** All protected routes enforce authentication and role/session checks on the server (`src/lib/auth/guards.ts` for organisers, `src/lib/auth/team-guards.ts` for teams) in addition to `src/proxy.ts` cookie refresh.
- **Strict account isolation:** Organiser accounts (`public.profiles`) and participant team accounts (`public.team_accounts`) are mutually exclusive at both the database trigger layer and the Next.js session layer. An active organiser session cannot access `/team/*` routes, and a team session cannot access organiser routes.
- **Service-role isolation:** `SUPABASE_SERVICE_ROLE_KEY` is restricted to server-only code (`import "server-only"`) and the local admin CLI (`scripts/team-account-cli.mjs`). It is never exposed to browser components.

---

## 3. Main Implemented Features

### Organiser CMS
- **Organiser Authentication & Audit Logs (`/login`, `/admin/accounts`, `/admin/audit-logs`):** Email/password sign-in (public self-registration disabled), active-profile verification, Super Admin provisioning/role/activation controls, and immutable, append-only audit logs.
- **Competition Structure & Registry (`/events`, `/contingents`, `/participants`):** Manage events (active/draft/archived, `contingent` / `individual` / `hybrid` entry modes, `event_wide` / `per_round` codename modes), rounds (ordering, lock controls, rubric criteria metadata), contingents, participants, and event entries.
- **Registration Data Imports (`/imports` & `/api/imports/*`):** Eight-step workflow supporting `.csv` and `.xlsx` uploads, header mapping, field validation, preview against existing records, conflict resolution, and atomic idempotent execution via `public.execute_registration_import` with immutable `registration_imports` history.
- **Codename Management (`/events/[eventId]/codenames`):** Generate, manually assign, and overwrite anonymous codenames (`event_wide` or `per_round`) with audit trail protection against mode tampering.
- **Round Release Management (`/events/[eventId]`, `/events/[eventId]/rounds/[roundId]`):** Configure round duration (`1`–`1,440` minutes), release rounds manually, enforce database-clock expiry at read time, manually close/reopen rounds, and track `round_release_sessions` history.
- **Private Round PDF Documents (`/events/[eventId]/rounds/[roundId]`):** Super Admin-only upload of multiple PDF briefs/prompts per round (up to 25 MB each) using short-lived signed upload URLs direct to the private `competition-documents` Storage bucket, followed by server-side `%PDF-` header verification, rename, replacement, and removal.
- **Overall Leaderboard & Snapshot Publication (`/events/[eventId]/leaderboard`):** Organisers maintain draft numeric contingent scores (`-1,000,000,000` to `1,000,000,000`, up to 4 decimal places) with optional internal notes (max 500 characters). Standard competition rankings (`1, 1, 3`) are computed automatically; unscored teams remain unranked. Super Admins atomically publish or unpublish immutable snapshots for participants.
- **Team Account Operations CLI (`npm run team:admin`):** Super Admin CLI (`scripts/team-account-cli.mjs`) to create contingent team accounts, reset passwords, activate/deactivate accounts, inspect active device sessions, and revoke individual or all sessions (max 4 concurrent active sessions per team account).

### Participant / Team Portal (`/team/*`)
- **Contingent Sign-In (`/team/login`):** Sign in with contingent team code + password (up to 4 concurrent device sessions; single-device sign-out preserves other active team devices).
- **Team Dashboard (`/team`):** Displays contingent identity, active device session status, and registered/checked-in events.
- **Current Rounds & Private Document Viewer (`/team/rounds`):** Lists only currently live (unexpired, open) rounds for the contingent's active events and opens attached PDFs inside an accessible modal viewer using short-lived (60-second) signed Storage URLs.
- **Event Standings (`/team/leaderboard`):** Displays published leaderboard snapshots for eligible events, highlighting ties and the signed-in contingent, with lightweight 12-second publication-version polling and manual refresh.

---

## 4. User Roles & Permissions

| Role / Account Type | Table | Capabilities & Restrictions |
|---|---|---|
| **Super Admin** (`super_admin`) | `public.profiles` | Full organiser access plus `/admin/accounts`, `/admin/audit-logs`, round PDF management (`upload`, `rename`, `replace`, `remove`), leaderboard `publish` / `unpublish`, and `npm run team:admin` CLI operations. Protected by last-active-Super-Admin database safeguards. |
| **Event Coordinator** (`event_coordinator`) | `public.profiles` | Organiser access to `/`, `/events`, `/contingents`, `/participants`, `/imports`, round releases, codenames, and draft leaderboard entry/score edits. Currently provisioned with `scope_mode = 'all_events'`. Cannot manage accounts, audit logs, round PDFs, or leaderboard publication. |
| **Team Account** (Participant) | `public.team_accounts` | Access strictly scoped to `/team`, `/team/rounds`, and `/team/leaderboard` for their single linked active contingent. Cannot access any organiser or admin routes. |

---

## 5. Important Application Routes

### Organiser & Admin Routes
| Route | Minimum Role | Purpose |
|---|---|---|
| `/login` | Public | Organiser email/password sign-in |
| `/access-denied` | Signed-in / Public | Role or inactive-account access notice |
| `/` | Any active organiser | CMS overview and quick navigation |
| `/events` | Any active organiser | Events directory and creation |
| `/events/[eventId]` | Any active organiser | Event configuration, rounds, entries, release status |
| `/events/[eventId]/rounds/[roundId]` | Any active organiser | Round details, rubric criteria metadata, release lifecycle, Super Admin PDF management |
| `/events/[eventId]/codenames` | Any active organiser | Event-wide or per-round codename assignment & overrides |
| `/events/[eventId]/leaderboard` | Any active organiser | Draft numeric scores & Super Admin snapshot publication |
| `/contingents` | Any active organiser | Contingent registry & creation |
| `/contingents/[contingentId]` | Any active organiser | Contingent details, member roster, event entries |
| `/participants` | Any active organiser | Participant registry |
| `/participants/[participantId]` | Any active organiser | Participant details & entries |
| `/imports` | Any active organiser | Active 8-step CSV/XLSX registration import & history workspace |
| `/registration-import` | Any active organiser | Legacy unlinked Stage 2B import UI (see [Database Setup](#9-database-setup-instructions)) |
| `/modules/[slug]` | Any active organiser | Redirects (`competitions`, `contingents`, `participants`, `imports`) and informational cards for legacy module slugs |
| `/admin/accounts` | `super_admin` | Organiser account creation, role/activation management |
| `/admin/audit-logs` | `super_admin` | Filterable immutable audit log viewer |

### Participant / Team Portal Routes
| Route | Access | Purpose |
|---|---|---|
| `/team/login` | Unauthenticated / Non-organiser | Contingent team code + password sign-in |
| `/team` | Active team session | Contingent dashboard & registered events |
| `/team/rounds` | Active team session | Currently live rounds & inline private PDF viewer |
| `/team/leaderboard` | Active team session | Published event standings snapshots (auto-polls every 12s) |

### API Route Handlers
| Route | Auth & Purpose |
|---|---|
| `/api/imports/parse` | Active organiser — parses uploaded `.csv` / `.xlsx` headers and rows |
| `/api/imports/preview` | Active organiser — previews import plan against current database records |
| `/api/imports/execute` | Active organiser — executes atomic idempotent import RPC |
| `/api/imports/history` | Active organiser — returns past `registration_imports` runs |
| `/api/stage1a-bundle` | Legacy local helper that serves `/tmp/virtuoso-stage1a-inc.bundle` if present on disk (`404` otherwise) |

---

## 6. Project Directory Structure

```text
.
├── .env.example                 # Template for required and optional environment variables
├── next.config.ts               # Next.js configuration (standalone output, unoptimized images)
├── package.json                 # Dependencies and npm scripts
├── public/
│   ├── brand/                   # SJCC, BBA, and Virtuoso emblem assets
│   └── assets/aistudio/         # Visual reference assets
├── scripts/
│   ├── export-zip.mjs           # Creates clean source zip excluding secrets, node_modules, .next
│   └── team-account-cli.mjs     # Super Admin CLI for contingent team accounts & sessions
├── src/
│   ├── proxy.ts                 # Next.js 16 session refresh proxy
│   ├── app/
│   │   ├── actions/             # Server Actions (auth, accounts, competition, registry, codenames, round-release, leaderboard, documents, team-*)
│   │   ├── admin/               # /admin/accounts, /admin/audit-logs
│   │   ├── api/                 # /api/imports/* and legacy /api/stage1a-bundle
│   │   ├── contingents/         # Contingent list and detail pages
│   │   ├── events/              # Events, rounds, codenames, and leaderboard pages
│   │   ├── imports/             # Active registration import workflow
│   │   ├── modules/[slug]/      # Legacy module redirect/placeholder routes
│   │   ├── participants/        # Participant list and detail pages
│   │   ├── registration-import/ # Legacy Stage 2B import route (targets older 202611160004 schema)
│   │   └── team/                # Scoped Team Portal (/team/login, /team, /team/rounds, /team/leaderboard)
│   ├── components/              # UI components grouped by admin, auth, cms, competition, imports, layout, team
│   ├── lib/                     # Business logic, validators, guards, storage, polling, Supabase clients
│   └── types/                   # Shared TypeScript interfaces and enums
├── supabase/
│   ├── migrations/              # Ordered SQL schema, RPC, RLS, and storage migrations (14 files)
│   └── README.md                # Detailed database setup, migration inventory, RLS, and troubleshooting guide
└── tests/                       # 18 automated unit/structural test suites (.test.mjs + TS alias loader)
```

<<<<<<< HEAD
---

## 7. Local Development Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Create local environment configuration:**
   ```bash
   cp .env.example .env.local
   ```
   Fill in your Supabase project values in `.env.local` (never commit `.env.local`).

3. **Prepare the Supabase database:**
   Follow [`supabase/README.md`](supabase/README.md) to configure Auth, apply the database migrations safely in order, and bootstrap your initial Super Admin account.

4. **Start the development server (runs on port `3000`):**
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000/login` for the Organiser CMS or `http://localhost:3000/team/login` for the Team Portal.

5. **Optional — Create a clean source ZIP archive:**
   ```bash
   npm run export:zip
   ```
   Generates `virtuoso-cms-export.zip` while excluding `.git`, `.next`, `node_modules`, `.vercel`, and all `.env*` files except `.env.example`.

---

## 8. Required Environment Variables

All variable names are declared in `.env.example`. **Never commit real keys or passwords.**

| Variable | Exposure | Required? | Purpose |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public (browser & server) | Yes | Base URL of your Supabase project |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public (browser & server) | Yes | Supabase anonymous/publishable key for SSR & browser clients |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server-only** (never prefix with `NEXT_PUBLIC_`) | Yes | Used on the server and in `scripts/team-account-cli.mjs` for organiser provisioning, team login/contingent verification, private Storage uploads/signed URLs, and participant read RPCs |
| `NEXT_PUBLIC_APP_NAME` | Public | Optional | Display name override in UI/metadata (defaults to `"Virtuoso CMS"`) |
| `VIRTUOSO_ADMIN_EMAIL` | Local CLI | Optional | Convenience default Super Admin email for `npm run team:admin` (still prompts securely for password) |
| `NEXT_PUBLIC_APP_URL` | Public | Optional | Declared in `.env.example` for base app URL documentation (not currently read by `src/` code) |
| `APP_URL` | Server | Optional | Declared in `.env.example` for optional hosting URL reference (not currently read by `src/` code) |

---

## 9. Database Setup Instructions

Database schema, PostgreSQL RPCs, Row Level Security (RLS), and private Storage bucket rules live in `supabase/migrations/`.

**Important migration note:** `supabase/migrations/` contains 14 files, including an early Stage 2B draft (`202611160004_stage2b_data_operations.sql`) that was superseded by `202611170004_stage2b2_registration_imports.sql`, `202611200005_stage2b3_codenames.sql`, and `202611260011_stage43a_competition_documents.sql`. On a fresh database, **skip `202611160004_stage2b_data_operations.sql`** and apply the authoritative migrations (`0001`–`0003`, then `202611170004` through `202611270013`) in strict chronological order.

See [`supabase/README.md`](supabase/README.md) for the complete migration inventory, incremental application instructions, initial Super Admin bootstrap SQL, and team account CLI setup.

---

## 10. Testing & Quality-Check Commands

All scripts below are defined in `package.json`:

| Command | Action |
|---|---|
| `npm run lint` | Runs `eslint .` across the codebase |
| `npm run typecheck` | Runs TypeScript type checking (`tsc --noEmit`) |
| `npm test` | Runs all 18 test suites in `tests/` (`stage1b-auth` through `stage44e-numeric-leaderboard`) using `tests/ts-alias-loader.mjs` |
| `npm run build` | Builds the production Next.js bundle (`NODE_ENV=production next build`) |
| `npm run start` | Starts the production server on `0.0.0.0:3000` |
| `npm run team:admin` | Launches the interactive Super Admin CLI for contingent team accounts & device sessions |
| `npm run export:zip` | Builds `virtuoso-cms-export.zip` without build artifacts or secrets |

---

## 11. Vercel Deployment Overview

1. **Apply Supabase setup first:** Ensure all required migrations (`0001`–`0003` and `202611170004`–`202611270013`) are applied to your production Supabase project, public email sign-up is disabled, and the initial Super Admin profile exists.
2. **Configure Vercel project:** Connect the repository in Vercel using the default Next.js framework preset (`npm run build`).
3. **Add Environment Variables in Vercel:** Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-side only, Encrypted), and optionally `NEXT_PUBLIC_APP_NAME`.
4. **Verify Supabase Auth URLs:** Set your Vercel production domain as the Site URL / allowed redirect origin in Supabase Authentication settings if needed.
5. **Run pre-deploy checks locally:** Confirm `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` succeed before promoting a release.

---

## 12. Current Limitations & Deliberately Excluded Functionality

The following items are **not implemented in V1** by design (or remain deferred/legacy):

- **No Judge Portal or Per-Judge Scoring:** There is no judge user role, judge login, scorecard submission flow, or `public.scores` table. The `judging_criteria` table stores rubric metadata only.
- **No Automated Round Advancement:** Organisers manage entries and round release windows manually; the system does not auto-promote or auto-eliminate teams between rounds.
- **Manual Leaderboard Scoring:** Organisers enter and update numeric event scores manually in the draft leaderboard, and a Super Admin explicitly publishes/unpublishes snapshots for participants.
- **Per-Event Coordinator Scoping:** Although `profiles.scope_mode` includes schema support for `'assigned_events'`, all provisioned organisers currently operate with `scope_mode = 'all_events'`.
- **No System A Direct Integration or Payments:** Registration sync happens strictly via exported `.csv` / `.xlsx` files on `/imports`.
- **Legacy Artifacts Still Present in Repo:**
  - `/registration-import` (`src/app/registration-import/page.tsx`) targets the superseded `202611160004` schema and is not linked in the main sidebar; always use `/imports`.
  - `/api/stage1a-bundle` (`src/app/api/stage1a-bundle/route.ts`) is an unused local helper checking `/tmp/virtuoso-stage1a-inc.bundle`.
  - `src/lib/auth/policy.ts` and `src/features/README.md` reference future placeholder slugs (such as `judging` / `notifications`) that are not active operational modules.
=======




---
# Supabase README


---

### Complete Replacement: `supabase/README.md`

# Virtuoso CMS — Supabase Database, Auth & Storage Guide

This document describes the Supabase backend used by **Virtuoso CMS** (System B) and the **Team / Participant Portal**. It reflects the actual SQL migrations in `supabase/migrations/` and server-side integrations in `src/`.

---

## 1. Role of Supabase in the Architecture

Supabase provides three core backend services for Virtuoso CMS:

1. **PostgreSQL Database & RPCs:** Stores organiser profiles, immutable audit logs, competition structure (`events`, `rounds`, `judging_criteria`), participant registry (`contingents`, `participants`, `event_entries`), import history, codenames, timed round release sessions, draft/published leaderboards, team accounts/sessions, and round PDF metadata. Complex multi-table writes run atomically inside PostgreSQL `SECURITY DEFINER` / `SECURITY INVOKER` functions.
2. **Supabase Auth:** Authenticates both **organisers** (real institutional email + password) and **team accounts** (contingent code + password mapped server-side to an internal synthetic auth email).
3. **Supabase Storage:** Hosts private round PDF documents in the `competition-documents` bucket, accessed only via short-lived signed upload tokens and short-lived signed view URLs generated on the server.

---

## 2. Supabase Project Configuration

Configure the following in your Supabase Dashboard before using the app:

1. **Authentication → Providers → Email:**
   - Enable **Email** sign-in.
   - **Disable "Allow new users to sign up"** so visitors cannot self-register organiser or team accounts.
   - Provisioned accounts created by the CMS (`admin.auth.admin.createUser`) automatically set `email_confirm: true`.
2. **Authentication → URL Configuration:**
   - Set **Site URL** to your local (`http://localhost:3000`) or production Vercel URL.
3. **Storage:**
   - Do **not** make the `competition-documents` bucket public. Migration `202611260011` creates it with `public = false`, a 25 MiB (`26214400` bytes) file limit, and `application/pdf` MIME restriction.

---

## 3. Required Environment Variables

Declare these in `.env.local` (locally) and in Vercel Project Settings (production). Never commit secret values.

| Variable | Where Used | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Browser, SSR, Admin client, Team CLI | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser, SSR, Team CLI | Public anon key used by SSR/browser clients and user-scoped RPCs |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server-only** (`src/lib/supabase/admin.ts`) & `scripts/team-account-cli.mjs` | Admin operations: organiser creation, team login/contingent verification, direct PDF upload inspection & signed URLs, and `service_role`-gated participant RPCs |
| `VIRTUOSO_ADMIN_EMAIL` | Local CLI (`scripts/team-account-cli.mjs`) | Optional default Super Admin email prompt when running `npm run team:admin` |

---

## 4. Complete Ordered Migration Inventory

There are **14 SQL files** in `supabase/migrations/`. Pay special attention to file #4 (`202611160004`), which is a legacy Stage 2B draft superseded by later migrations.

| # | Migration File | Status | Purpose & Key Objects |
|---|---|---|---|
| 1 | `202611160001_stage1b_profiles.sql` | **Apply** | Creates `public.profiles`, `set_updated_at()`, `prevent_last_super_admin_loss()`, `is_active_organiser()`, `is_active_super_admin()`, and profile RLS policies. |
| 2 | `202611160002_stage1b_audit_logs.sql` | **Apply** | Enables `pgcrypto`, creates `public.audit_logs`, `prevent_audit_log_mutation()` trigger (append-only), and Super Admin-only `SELECT` RLS. |
| 3 | `202611160003_stage2a_competition_structure.sql` | **Apply** | Creates `events`, `rounds`, `judging_criteria`, `contingents`, `participants`, `event_entries`, lock/XOR triggers, `reorder_event_rounds()`, `reorder_round_criteria()`, and active-organiser RLS. |
| 4 | `202611160004_stage2b_data_operations.sql` | **Legacy / Skip on fresh setup** | Early Stage 2B draft defining older schemas for `registration_imports`, `codenames`, and `competition_documents`. **Superseded** by `202611170004`, `202611200005`, and `202611260011`. Do **not** run this before `202611170004` / `202611260011` on a fresh DB (see note below). |
| 5 | `202611170004_stage2b2_registration_imports.sql` | **Apply** | Authoritative `public.registration_imports` table (with `source_filename`, `event_id`, `idempotency_key`), immutability trigger, and atomic `execute_registration_import(...)` RPC. |
| 6 | `202611200005_stage2b3_codenames.sql` | **Apply** | Authoritative `public.entry_codenames` table, `protect_event_codename_mode()` trigger, `assign_event_codenames()`, and `upsert_entry_codename()`. |
| 7 | `202611210006_fix_event_wide_codename_functions.sql` | **Apply** | Fixes `v_round` assignment in `assign_event_codenames()` and `upsert_entry_codename()` for `event_wide` audit logging. |
| 8 | `202611220007_stage2c_round_release_management.sql` | **Apply** | Adds `duration_minutes` (`1`–`1440`) and `'closed'` status to `rounds`; creates `public.round_release_sessions`, `get_db_server_timestamp()`, `is_round_currently_live_for_teams()`, and `configure_round_duration` / `release_round` / `close_round_release` / `reopen_round_release` / `reconcile_expired_round_release`. |
| 9 | `202611220008_stage3a_overall_leaderboard.sql` | **Apply** | Creates `public.leaderboard_entries`, `validate_leaderboard_entry_integrity()`, notes/position checks, and initial leaderboard RPCs (later superseded by `0013`). |
| 10 | `202611240009_stage3b1_team_accounts.sql` | **Apply** | Creates `public.team_accounts` and `public.team_sessions` (4-session limit), mutual-exclusion triggers vs `profiles`, deactivation revocation triggers, JWT helpers, and `register_team_session()` / `revoke_current_team_session()`. |
| 11 | `202611250010_stage3b3_team_account_operations.sql` | **Apply** | Creates Super Admin team-account RPCs (`assert_team_admin_actor`, `admin_preflight_team_account_creation`, `admin_create_team_account`, `admin_resolve_active_team_account`, `admin_record_team_password_reset`, `admin_set_team_account_active`, `admin_list_team_sessions`, `admin_revoke_team_session`, `admin_revoke_all_team_sessions`). |
| 12 | `202611260011_stage43a_competition_documents.sql` | **Apply** | Authoritative `public.competition_documents` table, Super Admin-only RLS, private `competition-documents` Storage bucket (`26214400` bytes, `application/pdf`), and restrictive `storage.objects` deny policies for `anon` / `authenticated`. |
| 13 | `202611270012_stage44d_leaderboard_publication.sql` | **Apply** | Creates `public.leaderboard_publications`, Super Admin-only `publish_event_leaderboard()` & `unpublish_event_leaderboard()`, and initial `get_participant_leaderboards_for_contingent()`. |
| 14 | `202611270013_stage44e_numeric_leaderboard_snapshots.sql` | **Apply** | Adds `score numeric(16,4)` to `leaderboard_entries` (making `position` / `display_value` nullable), creates `public.leaderboard_published_entries` immutable snapshot table, revokes legacy `add_leaderboard_entry` / `update_leaderboard_entry`, adds `add_numeric_leaderboard_entry` / `update_numeric_leaderboard_entry`, and updates `publish_event_leaderboard`, `unpublish_event_leaderboard`, and `get_participant_leaderboards_for_contingent`. |

> **Why `202611160004_stage2b_data_operations.sql` must be skipped on fresh setups:** Both `202611170004` (`registration_imports`) and `202611260011` (`competition_documents`) use `CREATE TABLE IF NOT EXISTS`. If `202611160004` runs first, it creates incompatible legacy column layouts (`file_name` instead of `source_filename` on `registration_imports`; nullable `round_id` without `status`/`original_filename`/`storage_object_path` on `competition_documents`), causing subsequent index and constraint statements in `202611170004` and `202611260011` to fail.

---

## 5. Applying Migrations Safely (Incremental Order)

Never reset an existing database as part of normal setup or updates. Apply migrations incrementally in timestamp order using the **Supabase Dashboard → SQL Editor** (or CLI when matching your project's migration history):

1. On a **new/fresh** database, execute files in this exact sequence:
   - `202611160001_stage1b_profiles.sql`
   - `202611160002_stage1b_audit_logs.sql`
   - `202611160003_stage2a_competition_structure.sql`
   - *(Skip `202611160004_stage2b_data_operations.sql`)*
   - `202611170004_stage2b2_registration_imports.sql`
   - `202611200005_stage2b3_codenames.sql`
   - `202611210006_fix_event_wide_codename_functions.sql`
   - `202611220007_stage2c_round_release_management.sql`
   - `202611220008_stage3a_overall_leaderboard.sql`
   - `202611240009_stage3b1_team_accounts.sql`
   - `202611250010_stage3b3_team_account_operations.sql`
   - `202611260011_stage43a_competition_documents.sql`
   - `202611270012_stage44d_leaderboard_publication.sql`
   - `202611270013_stage44e_numeric_leaderboard_snapshots.sql`
2. On an **already-running** database, check which migrations have already been applied and run only the newer unapplied migration files in chronological order.

---

## 6. Key Database Tables & Relationships

- **Organiser & Audit**
  - `public.profiles` (`id` FK → `auth.users`): `email`, `full_name`, `role` (`super_admin` | `event_coordinator`), `scope_mode` (`all_events` | `assigned_events`), `is_active`.
  - `public.audit_logs`: Append-only trail (`actor_user_id`, `actor_email`, `action`, `entity_type`, `entity_id`, `before_data`, `after_data`, `metadata`). Updates and deletes are blocked by trigger.
- **Competition Structure & Registry**
  - `public.events`: Event metadata (`code`, `name`, `entry_mode`, `codename_mode`, `status`).
  - `public.rounds` (FK → `events`): Ordered rounds (`round_number`, `status`, `is_locked`, `duration_minutes`, `active_session_id`).
  - `public.judging_criteria` (FK → `rounds`): Rubric metadata (`name`, `max_score`, `weight_percent`, `display_order`). *Note: Scoring submission (`scores` table) is not part of V1.*
  - `public.contingents`: College teams (`contingent_code`, `name`, `institution_name`, `is_active`).
  - `public.participants` (nullable FK → `contingents`): Individual participants; `is_contingent_lead` enforced uniquely per contingent.
  - `public.event_entries` (FK → `events`, XOR FK → `contingents` OR `participants`): Links either a contingent or an individual to an event (`status`: `registered`, `checked_in`, `withdrawn`, `disqualified`), validated against `events.entry_mode` by trigger.
- **Data Operations & Releases**
  - `public.registration_imports` (FK → `events`): Immutable batch import history with per-event `idempotency_key`.
  - `public.entry_codenames` (FK → `events`, `event_entries`, nullable `rounds`): Anonymous codenames scoped either `event_wide` (`round_id IS NULL`) or `per_round`.
  - `public.round_release_sessions` (FK → `events`, `rounds`): Historical & active timed release windows (`session_number`, `started_at`, `expires_at`, `ended_at`, `end_reason`). Partial unique index allows at most one open session per round.
- **Leaderboards**
  - `public.leaderboard_entries` (FK → `events`, `contingents`): Organiser-maintained draft scores (`score numeric(16,4)`, optional `notes` up to 500 chars; legacy `position`/`display_value` columns remain nullable).
  - `public.leaderboard_publications` (PK/FK → `events`): Tracks publication visibility (`is_published`, `published_at`, `published_by`, `unpublished_at`, `unpublished_by`).
  - `public.leaderboard_published_entries` (FK → `events`, `contingents`): Immutable published snapshot rows (`rank`, `score`, `published_at`, `published_by`), populated atomically using `rank() OVER (ORDER BY score DESC NULLS LAST)`.
- **Team Portal & Documents**
  - `public.team_accounts` (`id` FK → `auth.users`, unique FK → `contingents`): Participant team credentials link (`contingent_code`, `is_active`, `password_updated_at`).
  - `public.team_sessions` (FK → `team_accounts`, `contingents`): Tracks device sessions (`session_id`, `expires_at`, `revoked_at`, `revoke_reason`). Maximum 4 active non-expired, unrevoked sessions per `team_account_id`.
  - `public.competition_documents` (FK → `(round_id, event_id)` → `rounds`): Private PDF document records (`title`, `original_filename`, `storage_bucket`, `storage_object_path`, `file_size_bytes`, `mime_type`, `status`: `active` | `archived`).

---

## 7. Key Database Functions & RPCs

| Function / RPC | Purpose |
|---|---|
| `is_active_organiser()`, `is_active_super_admin()` | RLS helper predicates verifying active profile status and role |
| `reorder_event_rounds(...)`, `reorder_round_criteria(...)` | Transactional ordering updates for rounds and rubric criteria |
| `execute_registration_import(...)` | Advisory-locked, idempotent import execution creating/updating contingents, participants, and entries |
| `assign_event_codenames(...)`, `upsert_entry_codename(...)` | Batch and audited single-entry codename assignment respecting `codename_mode` |
| `get_db_server_timestamp()`, `is_round_currently_live_for_teams(uuid)` | Authoritative database clock read and live-window evaluation predicate |
| `configure_round_duration(...)`, `release_round(...)`, `close_round_release(...)`, `reopen_round_release(...)`, `reconcile_expired_round_release(...)` | Timed round release lifecycle RPCs with row locking and audit logging |
| `add_numeric_leaderboard_entry(...)`, `update_numeric_leaderboard_entry(...)`, `remove_leaderboard_entry(...)` | Draft numeric score CRUD (legacy `add_leaderboard_entry` and `update_leaderboard_entry` were revoked in `0013`) |
| `publish_event_leaderboard(...)`, `unpublish_event_leaderboard(...)` | Super Admin-only atomic snapshot publishing (computes `1, 1, 3` ranks via SQL `rank()`) and unpublishing |
| `get_participant_leaderboards_for_contingent(uuid)` | `service_role`-only RPC returning published leaderboard snapshots for a contingent's eligible active/archived events |
| `register_team_session(...)`, `revoke_current_team_session(...)`, `is_active_team_session()`, `current_team_contingent_id()` | Concurrent 4-session enforcement and JWT `virtuoso_session_id` verification |
| `admin_*` team RPCs (`admin_create_team_account`, `admin_set_team_account_active`, `admin_list_team_sessions`, `admin_revoke_team_session`, `admin_revoke_all_team_sessions`, etc.) | Super Admin operations invoked by `npm run team:admin` (`scripts/team-account-cli.mjs`) |

---

## 8. Row Level Security (RLS) & Access Control Overview

- **Organiser tables (`events`, `rounds`, `judging_criteria`, `contingents`, `participants`, `event_entries`, `registration_imports`, `entry_codenames`, `round_release_sessions`, `leaderboard_entries`, `leaderboard_published_entries`):** Enabled for active organisers (`is_active_organiser()`). Team accounts have no direct RLS access to these tables; participant reads go through server-side queries/RPCs using `service_role` after verifying an active team session.
- **Super Admin-only tables:** `audit_logs` (`SELECT` only for `is_active_super_admin()`), `competition_documents`, `leaderboard_publications` (write/RPC restricted to `is_active_super_admin()`), `team_accounts`, and `team_sessions` (direct team session registration/revocation happens via `SECURITY DEFINER` RPCs).
- **Storage (`storage.objects`):** Explicit deny-all RLS policies block direct `anon` and `authenticated` access to `competition-documents`. All browser uploads use server-minted signed upload tokens, and all reads use server-minted 60-second signed view URLs.

---

## 9. Organiser Authentication & Initial Super Admin Bootstrap

Public sign-ups must stay disabled. Never hardcode a Super Admin password in code or SQL files. To create your first Super Admin after applying migrations:

1. In **Supabase Dashboard → Authentication → Users → Add user → Create new user**, create a user with their institutional email and strong unique password, with **Auto Confirm User** checked.
2. Copy the new user's **User UID** (`UUID`).
3. Run the following in **Supabase Dashboard → SQL Editor** (replacing the placeholders):

```sql
INSERT INTO public.profiles (id, full_name, email, role, scope_mode, is_active)
VALUES (
  '<PASTE-AUTH-USER-UUID>',
  '<Full Name>',
  '<super-admin-email@example.edu>',
  'super_admin',
  'all_events',
  true
);

INSERT INTO public.audit_logs (actor_user_id, actor_email, action, entity_type, entity_id, after_data, metadata)
VALUES (
  '<PASTE-AUTH-USER-UUID>',
  '<super-admin-email@example.edu>',
  'account.initial_super_admin_provisioned',
  'profile',
  '<PASTE-AUTH-USER-UUID>',
  jsonb_build_object('role', 'super_admin', 'scope_mode', 'all_events', 'is_active', true),
  jsonb_build_object('source', 'manual_supabase_bootstrap')
);
```


--- 
---

### Summary of Documentation Review

1. **What was corrected**
   - Updated `README.md` from outdated Stage 0–3A documentation (which previously listed only migrations `0001`–`0008`, `position`/`display_value` leaderboards, and omitted the Team Portal) to reflect the final codebase, including numeric draft + snapshot leaderboards (`0013`), publication state (`0012`), private round PDFs (`0011`), and the Team Portal.
   - Updated `supabase/README.md` from `0001`–`0011` to all 14 files in `supabase/migrations/`, replacing the outdated Stage 3A leaderboard description and correcting `npm` script / file counts.
   - Corrected the migration guidance in `supabase/README.md` so `202611160004_stage2b_data_operations.sql` is explicitly flagged as a superseded legacy draft that must be skipped on fresh database setups (because running it before `202611170004` or `202611260011` creates incompatible schemas).
   - Added explicit V1 exclusions (no judge portal, no per-judge scoring/`scores` table, no automated round advancement, no System A live sync/payments, and `scope_mode = 'all_events'` for all organisers).

2. **What was newly documented**
   - Clear System A vs. System B separation.
   - Full Participant / Team Portal (`/team/login`, `/team`, `/team/rounds`, `/team/leaderboard`) including inline modal PDF viewing, 60s signed URLs, and 12s publication-version polling.
   - Team account architecture (`team_accounts`, `team_sessions`, synthetic auth emails, 4-device limit, deactivation triggers) and the `npm run team:admin` CLI (`scripts/team-account-cli.mjs`).
   - All `package.json` commands (`dev`, `build`, `start`, `lint`, `typecheck`, `test` across 18 test files, `team:admin`, `export:zip`), all `.env.example` variables, full route tables, directory layout, Vercel deployment overview, Storage/backup considerations, and troubleshooting steps.
   - Legacy routes still present in the repository (`/registration-import` and `/api/stage1a-bundle`) so student maintainers know why they exist and not to treat `/registration-import` as the active import flow.

3. **Information that could not be verified from the workspace**
   - Live Supabase Dashboard project configuration (Auth provider toggles, redirect URLs, PITR/backup tier, and which migrations are currently applied in any external live database) and live Vercel project settings/deployment logs cannot be observed directly from the local filesystem.
   - `NEXT_PUBLIC_APP_URL` and `APP_URL` are present in `.env.example`, though grep confirmed neither is currently referenced in `src/` or `scripts/`.

4. **Remaining documentation gaps**
   - There is no user-facing competition schedule/rules reference or separate operations runbook for `scripts/team-account-cli.mjs` subcommand flags beyond `npm run team:admin help` and the CLI summary documented above.
   - Legacy files (`/registration-import`, `src/app/actions/registration-import.ts`, `src/lib/import/*`, `supabase/migrations/202611160004_stage2b_data_operations.sql`, `/api/stage1a-bundle`, and `src/features/README.md`) remain in the codebase untouched as requested; a future cleanup pass could archive or remove them if no longer needed.

  
>>>>>>> 1c3955cff922142dd1df114418d9009d2b5c1d9d
