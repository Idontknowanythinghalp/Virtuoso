import React from "react";
import Link from "next/link";
import { Trophy } from "lucide-react";

export function TeamStandingsNavLink({
  isActive = false,
}: {
  isActive?: boolean;
}) {
  return (
    <Link
      href="/team/leaderboard"
      aria-current={isActive ? "page" : undefined}
      className={`border-b-2 py-2.5 text-sm font-medium transition-colors ${
        isActive
          ? "border-[#4B0507] font-semibold text-[#4B0507]"
          : "border-transparent text-slate-600 hover:text-slate-900"
      }`}
    >
      Leaderboard
    </Link>
  );
}

export function TeamStandingsDashboardCard() {
  return (
    <section
      aria-labelledby="standings-heading"
      className="rounded-lg border border-slate-200 bg-white p-6 shadow-xs"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-amber-200 bg-amber-50 text-amber-700">
            <Trophy className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h2
              id="standings-heading"
              className="font-display text-base font-bold text-slate-900"
            >
              Event Standings
            </h2>
            <p className="text-sm leading-relaxed text-slate-600">
              View official published standings, positions, and scores for your
              registered competition events.
            </p>
          </div>
        </div>
        <Link
          href="/team/leaderboard"
          className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-md bg-[#4B0507] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#380305] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507] focus-visible:ring-offset-2"
        >
          View Standings
        </Link>
      </div>
    </section>
  );
}
