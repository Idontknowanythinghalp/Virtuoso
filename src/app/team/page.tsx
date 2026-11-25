import React from "react";
import { LogOut, ShieldCheck } from "lucide-react";
import { logoutTeamAction } from "@/app/actions/team-auth";
import { requireActiveTeam } from "@/lib/auth/team-guards";
import { siteConfig } from "@/lib/site-config";
import { BrandMark } from "@/components/cms/BrandMark";

export const dynamic = "force-dynamic";

export default async function TeamPortalPage() {
  const team = await requireActiveTeam({ nextPath: "/team" });

  return (
    <div className="flex min-h-screen flex-col justify-between bg-[#F8FAFC]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <BrandMark
              src="/brand/virtuoso-emblem.png"
              alt="Virtuoso Emblem"
              className="h-9 w-9 shrink-0 rounded-md border border-slate-200 bg-[#200000] object-contain p-1"
              fallbackLabel="V"
            />
            <div>
              <p className="text-xs font-medium text-[#4B0507]">
                {siteConfig.institution}
              </p>
              <p className="font-display text-base font-bold text-slate-900">
                Virtuoso Team Portal
              </p>
            </div>
          </div>

          <form action={logoutTeamAction}>
            <button
              type="submit"
              className="inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
            >
              <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Sign Out</span>
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center px-4 py-10 sm:px-6">
        <section
          aria-labelledby="team-session-heading"
          className="rounded-lg border border-slate-200 bg-white p-6 sm:p-8"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <h1
                id="team-session-heading"
                className="font-display text-xl font-bold text-slate-900"
              >
                Team Session Active
              </h1>
              <p className="text-sm text-slate-600">
                Signed in on this device for your registered Virtuoso
                contingent.
              </p>
            </div>
          </div>

          <dl className="mt-6 grid gap-4 border-t border-slate-100 pt-6 sm:grid-cols-3">
            <div>
              <dt className="text-xs font-medium text-slate-500">Team Code</dt>
              <dd className="mt-1 font-mono text-sm font-semibold text-slate-900">
                {team.contingentCode}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Contingent</dt>
              <dd className="mt-1 text-sm font-medium text-slate-900">
                {team.contingentName}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">
                Institution
              </dt>
              <dd className="mt-1 text-sm text-slate-800">
                {team.institutionName}
              </dd>
            </div>
          </dl>

          <p className="mt-6 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600">
            Signing out ends only this device&apos;s session. Other authorised
            devices signed in for your contingent remain active up to the
            4-device limit.
          </p>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 text-xs text-slate-500 sm:px-6">
          <span>{siteConfig.department}</span>
          <span>4–5 December 2026</span>
        </div>
      </footer>
    </div>
  );
}
