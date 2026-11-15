import type { CmsModuleDefinition, CmsModuleSlug } from "@/types/cms";

export const CMS_MODULES: CmsModuleDefinition[] = [
  {
    slug: "competitions",
    href: "/modules/competitions",
    title: "Events & Rounds",
    shortTitle: "Events",
    stageLabel: "Core Competition Module",
    status: "Planned",
    summary:
      "Configure competition tracks, round structures, eligibility rules, and judging criteria.",
    plannedScope: [
      "Event definitions and round progression workflows",
      "Rubric criteria and maximum score weights",
      "Schedule slots and venue assignments",
    ],
  },
  {
    slug: "contingents",
    href: "/modules/contingents",
    title: "Contingents & Teams",
    shortTitle: "Contingents",
    stageLabel: "Participant Registry",
    status: "Planned",
    summary:
      "Manage verified institutional contingents, team codes, and check-in attendance.",
    plannedScope: [
      "Institutional contingent roster verification",
      "Team allocation to competition rounds",
      "On-campus check-in and disqualification state tracking",
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
