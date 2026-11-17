# Virtuoso CMS

Competition Management System (CMS) for **Virtuoso**, presented by the Department of Business Administration, St. Joseph's College of Commerce (Autonomous), Bengaluru (4–5 December 2026).

## Current Stage: Stage 2A — Competition Structure Implementation

Stage 2A builds on the Stage 1B secure organiser workspace (`super_admin` and `event_coordinator`) to implement the core competition and participant structure:

- **Events (`/events`, `/events/[eventId]`):** Create, edit, view, activate, deactivate, and archive events with configurable `entry_mode`, `codename_mode`, and optional variable team size bounds (`min_team_size`, `max_team_size`).
- **Rounds (`/events/[eventId]/rounds/[roundId]`):** Create, edit, reorder transactionally, and lock/unlock rounds within an event with blueprint-aligned `scoring_method`, `attribution_mode`, and `status`.
- **Judging Criteria:** Add, edit, reorder, and delete rubric criteria (`display_order`, `name`, `max_points`, `weight`, `rubric_guidance`) with lock protection and automatic Stage 3 `scores` protection.
- **Contingents & Participants (`/contingents`, `/participants`):** Manage institutional contingents with variable team sizes, independent individual participants (optional `contingent_id`), and external registration references.
- **Event Entries:** Register and manage event entries enforcing strict `contingent` XOR `participant` integrity, duplicate prevention, and event `entry_mode` compatibility.

Modules deferred to later stages (Stage 2B/3+): CSV/Excel import, codename generation, file uploads/Storage, judging/scoring entry, tabulation/advancement, and the separate Competitor Portal.

## Tech Stack

- **Framework:** Next.js App Router (Next.js 16 `proxy.ts` + Server Components & Actions)
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS v4
- **Auth & Database:** Supabase Auth + PostgreSQL (`@supabase/ssr`, `@supabase/supabase-js`)
- **Linting:** ESLint (`eslint-config-next`)
- **Icons:** Lucide React

## Project Structure

```text
src/
  app/
    actions/        Server Actions for auth, accounts, competition structure, and registry
    admin/          Super Admin pages (/admin/accounts, /admin/audit-logs)
    events/         Events, rounds, judging criteria, and event entries pages
    contingents/    Contingent registry and member rosters
    participants/   Participant registry (contingent members and independent individuals)
    login/          Organiser sign-in page (public registration disabled)
    modules/        Protected placeholder routes for upcoming CMS modules
    access-denied/
  components/       Layout shell, auth forms, admin views, and Stage 2A workspaces
  lib/
    audit/          Server-only audit logger and payload sanitizer
    auth/           Authoritative guards, access evaluation policy, and account rules
    competition/    Stage 2A server/shared validators
    supabase/       Browser, server SSR, and server-only Admin clients
  types/            Shared TypeScript types
  proxy.ts          Next.js 16 session refresh proxy
supabase/
  migrations/       Version-controlled incremental SQL migrations (0001, 0002, 0003)
  README.md         Migration order and initial Super Admin bootstrap instructions
tests/
  stage1b-auth.test.mjs
  stage2a-competition.test.mjs
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
