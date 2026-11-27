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

4. Sign in at `/login` and confirm access to `/admin/accounts` and `/admin/audit-logs`. Additional coordinators and Super Admins can then be provisioned from `/admin/accounts`.

---

## 10. Team Authentication & Session Management

- **Synthetic Auth Identity:** Team accounts do not use participant email addresses for login. Each team account uses an internal synthetic Supabase Auth email (`team-<team_account_id>@team.virtuoso.invalid`), while participants sign in at `/team/login` with their **Contingent Team Code** and password.
- **Session Cap (Max 4 Devices):** `register_team_session(...)` issues a `virtuoso_session_id` stored in Supabase Auth `user_metadata` and `public.team_sessions`, enforcing a strict limit of **4 concurrent active sessions** per team account without auto-evicting existing devices.
- **Automatic Revocation:** Deactivating a team account or its parent contingent triggers automatic session revocation (`revoke_team_sessions_on_deactivation`, `revoke_team_sessions_on_contingent_deactivation`).
- **Admin CLI:** Manage team credentials and device slots locally with:
  ```bash
  npm run team:admin help
  ```
  Supports `create`, `reset-password`, `activate`, `deactivate`, `sessions`, `revoke-session`, and `revoke-all-sessions` (requires Super Admin login; `create` and `reset-password` also require `SUPABASE_SERVICE_ROLE_KEY`).

---

## 11. Storage Bucket & Private Document Handling

- **Bucket:** `competition-documents` (`public = false`, max `26214400` bytes / 25 MiB, `application/pdf` only).
- **Upload Flow:**
  1. Super Admin requests an upload intent (`requestRoundDocumentUploadIntentAction` / `requestRoundDocumentReplaceIntentAction`).
  2. Server mints a non-overwriting signed upload token (`createSignedUploadUrl(..., { upsert: false })`).
  3. Browser uploads the PDF directly to Supabase Storage (avoiding Next.js request size limits).
  4. Server inspects the uploaded object via `info()` and bounded Range read to verify size, `application/pdf` MIME type, and `%PDF-` header bytes before inserting/updating `public.competition_documents`.
- **Participant View Flow:** When a team opens a PDF on `/team/rounds`, `viewParticipantRoundDocumentAction` verifies active team session + contingent eligibility + live round window (`is_round_currently_live_for_teams`), then generates a 60-second inline signed URL (clamped between 15 and 120 seconds).

---

## 12. Backup & Recovery Considerations

- **Use Supabase Automated Backups / PITR:** Enable daily backups (or Point-in-Time Recovery) in your Supabase project before event day.
- **Back up Storage alongside Postgres:** `competition_documents` stores metadata pointers (`storage_object_path`) referencing objects in the `competition-documents` bucket; ensure Storage objects are preserved when restoring a database backup.
- **Never run destructive resets on live data:** Avoid `supabase db reset` on staging/production databases, as it wipes `audit_logs`, `registration_imports`, `team_accounts`, and `leaderboard_published_entries`. Apply forward migrations only.

---

## 13. Troubleshooting Common Setup Issues

- **"Migration has not been applied yet" banners (`42P01`, `PGRST205`, or `42883`):** Check that all required migrations (`0001`–`0003` and `202611170004`–`202611270013`) were applied in order.
- **Errors creating `registration_imports` or `competition_documents` constraints:** The legacy `202611160004_stage2b_data_operations.sql` draft was likely run before `202611170004` or `202611260011`. Do not run `202611160004` on fresh setups; reconcile the legacy table columns manually before re-running `202611170004` / `202611260011`.
- **"Server is missing `SUPABASE_SERVICE_ROLE_KEY`" / Team login or PDF upload fails:** Verify `SUPABASE_SERVICE_ROLE_KEY` is set in `.env.local` (locally) and Vercel server environment variables (production), without a `NEXT_PUBLIC_` prefix.
- **"Organiser accounts cannot access team routes" on `/team/login`:** Organisers and team accounts cannot share a browser session simultaneously. Sign out of the Organiser CMS or use a private/incognito browser window when testing the Team Portal.
- **"Maximum 4 active device sessions reached" on team sign-in:** An existing device must sign out via the Team Portal, or a Super Admin must inspect and revoke a slot using `npm run team:admin sessions` / `revoke-session`.
- **Participant sees "No active rounds" or missing PDFs:** Verify the event status is `active`, the contingent's `event_entries.status` is `registered` or `checked_in`, the round has an open unexpired `round_release_sessions` window (`status = 'live'`), and any PDFs are marked `status = 'active'` on that round.
