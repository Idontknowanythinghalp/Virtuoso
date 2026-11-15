import React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { CmsModuleDefinition } from "@/types/cms";

interface ModuleOverviewGridProps {
  modules: CmsModuleDefinition[];
}

export function ModuleOverviewGrid({ modules }: ModuleOverviewGridProps) {
  return (
    <section aria-labelledby="modules-heading" className="space-y-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <h2
            id="modules-heading"
            className="font-display text-lg font-semibold tracking-tight text-slate-900"
          >
            Planned CMS Modules
          </h2>
          <p className="text-sm text-slate-600">
            Placeholder navigation surfaces reserved for upcoming Virtuoso CMS
            stages.
          </p>
        </div>
        <span className="font-mono text-xs tabular-nums text-slate-500">
          {modules.length} module placeholders
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {modules.map((mod, index) => (
          <Link
            key={mod.slug}
            href={mod.href}
            className="group flex flex-col justify-between rounded-lg border border-slate-200 bg-white p-5 transition-colors hover:border-slate-300 hover:bg-slate-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
          >
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                <span className="font-mono tabular-nums">
                  {String(index + 1).padStart(2, "0")} · {mod.stageLabel}
                </span>
                <span className="font-medium text-slate-600">{mod.status}</span>
              </div>

              <h3 className="font-display text-base font-semibold text-slate-900 group-hover:text-[#4B0507]">
                {mod.title}
              </h3>

              <p className="text-sm leading-relaxed text-slate-600">
                {mod.summary}
              </p>
            </div>

            <div className="mt-5 flex items-center gap-1.5 border-t border-slate-100 pt-3 text-xs font-medium text-slate-700 group-hover:text-[#4B0507]">
              <span>Open module placeholder</span>
              <ArrowRight
                className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
