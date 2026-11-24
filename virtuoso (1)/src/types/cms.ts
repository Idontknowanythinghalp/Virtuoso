export type CmsModuleSlug =
  | "competitions"
  | "contingents"
  | "judging-scoring"
  | "results"
  | "media-vault"
  | "access-audit";

export type ModuleStageStatus = "Active" | "Scaffolded" | "Planned";

export interface CmsModuleDefinition {
  slug: CmsModuleSlug;
  href: string;
  title: string;
  shortTitle: string;
  stageLabel: string;
  status: ModuleStageStatus;
  summary: string;
  plannedScope: string[];
}

export interface BreadcrumbItem {
  label: string;
  href?: string;
}
