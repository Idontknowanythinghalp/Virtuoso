import type { CmsModuleDefinition, CmsModuleSlug } from "@/types/cms";

export const CMS_MODULES: CmsModuleDefinition[] = [
  {
    slug: "competitions",
    href: "/events",
    title: "Events, Rounds & Leaderboards",
    shortTitle: "Events",
    stageLabel: "Competition Setup",
    status: "Active",
    summary:
      "Configure competition events, timed round releases, case PDFs, blind codenames, and draft-to-publish leaderboards.",
    plannedScope: [
      "Event definitions, status lifecycle, and entry/codename modes",
      "Timed round releases, countdown windows, and secure case PDFs",
      "Draft-to-publish numeric leaderboards with automatic tie ranking",
    ],
  },
  {
    slug: "contingents",
    href: "/contingents",
    title: "Contingents & Team Portals",
    shortTitle: "Contingents",
    stageLabel: "Team Registry",
    status: "Active",
    summary:
      "Manage institutional contingents, variable team rosters, team leads, and participant portal credentials.",
    plannedScope: [
      "Contingent and institution records with optional team size rules",
      "Team portal credential provisioning and single-session enforcement",
      "Strict contingent XOR participant event entries",
    ],
  },
  {
    slug: "participants",
    href: "/participants",
    title: "Participants Registry",
    shortTitle: "Participants",
    stageLabel: "Participant Records",
    status: "Active",
    summary:
      "Register contingent team members or independent individual participants and review event assignments.",
    plannedScope: [
      "Individual participants with or without contingent membership",
      "Cross-event roster verification and contact tracking",
      "Safe edit and deletion rules protecting registered entries",
    ],
  },
  {
    slug: "imports",
    href: "/imports",
    title: "Registration Imports",
    shortTitle: "Imports",
    stageLabel: "Data Pipeline",
    status: "Active",
    summary:
      "Upload college registration CSV or XLSX files, validate rows against server rules, and commit idempotent batches.",
    plannedScope: [
      "Column mapping and preview validation before database writes",
      "Explicit approval gate for existing record updates",
      "Atomic batch commits with import history tracking",
    ],
  },
];

const LEGACY_CMS_MODULES: CmsModuleDefinition[] = [
  {
    slug: "judging-scoring",
    href: "/events",
    title: "Events & Judging Criteria",
    shortTitle: "Scoring",
    stageLabel: "Competition Setup",
    status: "Active",
    summary:
      "Manage round rubrics, scoring methods, and event leaderboards from the Events workspace.",
    plannedScope: [
      "Ordered rounds with scoring method, attribution mode, and lock state",
      "Rubric criteria with max points, weights, and score-lock protection",
      "Draft-to-publish numeric leaderboards per event",
    ],
  },
  {
    slug: "results",
    href: "/events",
    title: "Leaderboards & Publication",
    shortTitle: "Results",
    stageLabel: "Publication Control",
    status: "Active",
    summary:
      "Manage draft numeric scores, preview automatic tie rankings, and publish official snapshots to participants.",
    plannedScope: [
      "Deterministic competition ranking (1, 1, 3) with unranked handling",
      "Super Admin publish and unpublish controls per event",
      "Live automatic updates in the Team Portal",
    ],
  },
  {
    slug: "media-vault",
    href: "/events",
    title: "Round Releases & Case PDFs",
    shortTitle: "Files",
    stageLabel: "Document Delivery",
    status: "Active",
    summary:
      "Upload round case briefs, manage timed round release windows, and control participant PDF access.",
    plannedScope: [
      "PDF upload validation, rename, replacement, and removal",
      "Server-authoritative round countdowns and manual reopen controls",
      "Authenticated in-portal document viewing for active teams",
    ],
  },
  {
    slug: "access-audit",
    href: "/admin/audit-logs",
    title: "Roles & Audit Log",
    shortTitle: "Access & Audit",
    stageLabel: "Security & Governance",
    status: "Active",
    summary:
      "Manage organiser accounts and inspect append-only audit records across competition operations.",
    plannedScope: [
      "Supabase authentication and role-based access control",
      "Row-level security enforcement across organiser and team routes",
      "Immutable audit trail for administrative and publication actions",
    ],
  },
];

export function getCmsModuleBySlug(
  slug: string,
): CmsModuleDefinition | undefined {
  return (
    CMS_MODULES.find((item) => item.slug === (slug as CmsModuleSlug)) ??
    LEGACY_CMS_MODULES.find((item) => item.slug === (slug as CmsModuleSlug))
  );
}
