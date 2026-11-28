# Virtuoso CMS

Competition Management System (CMS) for **Virtuoso 2026** (*Heirs of the Solstice*), the national-level business and commerce competition presented by the **Department of Business Administration, St. Joseph's College of Commerce (Autonomous), Bengaluru** (4–5 December 2026).

This application provides an authenticated **Organiser CMS** for managing competition operations and an authenticated **Team / Participant Portal** for viewing live round briefs and published standings.

---

## 1. System A vs. System B Distinction

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
