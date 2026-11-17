import React from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Layers } from "lucide-react";
import { CmsShell } from "@/components/layout/CmsShell";
import { AuthNoticeBanner } from "@/components/cms/AuthNoticeBanner";
import { getCmsModuleBySlug } from "@/lib/navigation";
import { siteConfig } from "@/lib/site-config";
import { requireActiveUser } from "@/lib/auth/guards";
import { ALL_ORGANISER_ROLES } from "@/lib/auth/policy";

export const dynamic = "force-dynamic";

interface ModulePlaceholderPageProps {
  params: Promise<{ slug: string }>;
}

export default async function ModulePlaceholderPage({
  params,
}: ModulePlaceholderPageProps) {
  const { sessionUser } = await requireActiveUser(ALL_ORGANISER_ROLES, {
    routeLabel: "/modules/[slug]",
  });

  const { slug } = await params;
  if (slug === "competitions") {
    redirect("/events");
  }
  if (slug === "contingents") {
    redirect("/contingents");
  }

  const cmsModule = getCmsModuleBySlug(slug);

  if (!cmsModule) {
    notFound();
  }

  return (
    <CmsShell
      user={sessionUser}
      breadcrumbs={[
        { label: siteConfig.appName, href: "/" },
        { label: "Planned Modules", href: "/" },
        { label: cmsModule.title },
      ]}
    >
      <section className="space-y-2 border-b border-slate-200 pb-6">
        <p className="text-xs font-medium text-[#4B0507]">
          {cmsModule.stageLabel} · {cmsModule.status} (Not Yet Implemented)
        </p>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          {cmsModule.title}
        </h1>
        <p className="max-w-3xl text-sm leading-relaxed text-slate-600 sm:text-base">
          {cmsModule.summary}
        </p>
      </section>

      <AuthNoticeBanner user={sessionUser} />

      <section
        aria-label={`${cmsModule.title} module status`}
        className="rounded-lg border border-slate-200 bg-white p-6 sm:p-8"
      >
        <div className="max-w-2xl space-y-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-700">
            <Layers className="h-5 w-5" aria-hidden="true" />
          </div>

          <div className="space-y-2">
            <h2 className="font-display text-lg font-semibold text-slate-900">
              Module Not Yet Implemented
            </h2>
            <p className="text-sm leading-relaxed text-slate-600">
              This route is protected by organiser authentication and reserved
              for a later Virtuoso CMS stage beyond Stage 2A. Upcoming stages
              will cover:
            </p>
          </div>

          <ul className="space-y-2 border-t border-slate-100 pt-4 text-sm text-slate-700">
            {cmsModule.plannedScope.map((item) => (
              <li key={item} className="flex items-start gap-2.5">
                <span
                  className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#4B0507]"
                  aria-hidden="true"
                />
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <div className="pt-2">
            <Link
              href="/"
              className="inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium whitespace-nowrap text-slate-800 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
            >
              <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Return to System Overview</span>
            </Link>
          </div>
        </div>
      </section>
    </CmsShell>
  );
}
