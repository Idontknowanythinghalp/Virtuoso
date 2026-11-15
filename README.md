# Virtuoso CMS

Competition Management System (CMS) for **Virtuoso**, presented by the Department of Business Administration, St. Joseph's College of Commerce (Autonomous), Bengaluru.

## Current Stage: Stage 1A — Next.js Foundation

This repository establishes the clean Next.js App Router foundation for the Virtuoso CMS. Authentication, Supabase integration, database schemas, and competition workflows are intentionally deferred to subsequent stages.

## Tech Stack

- **Framework:** Next.js (App Router)
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS v4
- **Linting:** ESLint (`eslint-config-next`)
- **Icons:** Lucide React

## Project Structure

```text
src/
  app/          App Router layouts, global styles, and route pages
  components/   Reusable CMS layout and UI components
  features/     Future modular CMS domain features
  lib/          Shared configuration and navigation utilities
  types/        Shared TypeScript interfaces and type definitions
public/
  brand/        Institutional SJCC, BBA, and Virtuoso brand assets
```

## Local Development

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy the environment placeholder file:
   ```bash
   cp .env.example .env.local
   ```
3. Start the development server (runs on port `3000`):
   ```bash
   npm run dev
   ```
4. Verify linting, type-checking, and production build:
   ```bash
   npm run lint
   npm run typecheck
   npm run build
   ```