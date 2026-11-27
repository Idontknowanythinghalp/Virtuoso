import React from "react";
import Link from "next/link";
import { ArrowRight, Trophy } from "lucide-react";

export function TeamStandingsNavLink({
  isActive = false,
}: {
  isActive?: boolean;
}) {
  return (
    <Link
      href="/team/leaderboard"
      aria-current={isActive ? "page" : undefined}
      className={`inline-flex min-h-11 shrink-0 items-center border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D9AD61] focus-visible:ring-inset ${
        isActive
          ? "border-[#D9AD61] font-semibold text-[#D9AD61]"
          : "border-transparent font-medium text-[#B9AAA5] hover:border-[#542525] hover:text-[#F5F0EC]"
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
      className="flex h-full flex-col justify-between gap-4 rounded-lg border border-[#542525] bg-[#2B0808] p-5 sm:p-6"
    >
      <div className="flex items-start gap-3.5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[#542525] bg-[#350A0A] text-[#D9AD61]">
          <Trophy className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <h2
            id="standings-heading"
            className="font-display text-base font-bold text-[#F5F0EC]"
          >
            Event Standings
          </h2>
          <p className="text-sm leading-relaxed text-[#B9AAA5]">
            View official published standings, positions, and scores for your
            registered competition events.
          </p>
        </div>
      </div>

      <div className="pt-1">
        <Link
          href="/team/leaderboard"
          className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md border border-[#D9AD61]/70 bg-[#401010] px-4 py-2 text-sm font-semibold whitespace-nowrap text-[#F5F0EC] transition-colors hover:border-[#D9AD61] hover:bg-[#D9AD61] hover:text-[#200000] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D9AD61] focus-visible:ring-offset-2 focus-visible:ring-offset-[#2B0808] sm:w-auto"
        >
          <span>View Standings</span>
          <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
