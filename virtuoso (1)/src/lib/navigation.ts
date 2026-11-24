import type { CmsModuleDefinition, CmsModuleSlug } from "@/types/cms";

export const CMS_MODULES: CmsModuleDefinition[] = [
  {
    slug: "competitions",
    href: "/events",
    title: "Events & Rounds",
    shortTitle: "Events",
    stageLabel: "Stage 2A Active",
    status: "Active",
    summary:
      "Configure competition events, entry modes, codename settings, round structures, and judging criteria.",
    plannedScope: [
      "Event definitions, status lifecycle, and entry/codename modes",
      "Ordered rounds with scoring method, attribution mode, and lock state",
      "Rubric criteria with max points, weights, and score-lock protection",
    ],
  },
  {
    slug: "contingents",
    href: "/contingents",
    title: "Contingents & Participants",
    shortTitle: "Contingents",
    stageLabel: "Stage 2A Active",
    status: "Active",
    summary:
      "Manage institutional contingents, variable team rosters, independent individual participants, and event entries.",
    plannedScope: [
      "Contingent and institution records with optional team size rules",
      "Individual participants with or without contingent membership",
      "Strict contingent XOR participant event entries",
    ],
  },
  {
    slug: "judging-scoring",
    href: "/modules/judging-scoring",
    title: "Judging & Scoring",
    shortTitle: "Scoring",
    stageLabel: "Evaluation Engine",
    status: "Planned",
    summary:
      "Controlled score entry, judge sheet locks, and server-validated tabulation.",
    plannedScope: [
      "Judge-scoped score submission forms",
      "Server-side validation and duplicate-submission protection",
      "Score lock approvals by authorized coordinators",
    ],
  },
  {
    slug: "results",
    href: "/modules/results",
    title: "Results & Standings",
    shortTitle: "Results",
    stageLabel: "Publication Control",
    status: "Planned",
    summary:
      "Review verified tabulations, resolve ties, and approve official round standings.",
    plannedScope: [
      "Deterministic score aggregation and tie-break rules",
      "Coordinator review before publication",
      "Exportable official result sheets",
    ],
  },
  {
    slug: "media-vault",
    href: "/modules/media-vault",
    title: "Submissions & Files",
    shortTitle: "Files",
    stageLabel: "Storage Integration",
    status: "Planned",
    summary:
      "Structured handling for case decks, round prompts, and official fest documents.",
    plannedScope: [
      "Authorized upload policies and file-type validation",
      "Controlled access to round briefs and submissions",
      "Retention and archive workflows",
    ],
  },
  {
    slug: "access-audit",
    href: "/modules/access-audit",
    title: "Roles & Audit Log",
    shortTitle: "Access & Audit",
    stageLabel: "Security & Governance",
    status: "Planned",
    summary:
      "Role-based access provisioning, session controls, and immutable action history.",
    plannedScope: [
      "Supabase authentication and role-based access control",
      "Row-level security enforcement",
      "Immutable audit trail for administrative and scoring actions",
    ],
  },
];

export function getCmsModuleBySlug(
  slug: string,
): CmsModuleDefinition | undefined {
  return CMS_MODULES.find((item) => item.slug === (slug as CmsModuleSlug));
}
