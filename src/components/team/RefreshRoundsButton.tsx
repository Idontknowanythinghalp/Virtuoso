"use client";

import React, { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

export function RefreshRoundsButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleRefresh() {
    if (isPending) {
      return;
    }
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleRefresh}
      disabled={isPending}
      aria-busy={isPending}
      className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 self-start rounded-md border border-[#4B0507]/30 bg-white px-4 py-2 text-xs font-semibold whitespace-nowrap text-[#4B0507] transition-colors hover:border-[#4B0507] hover:bg-[#4B0507] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 sm:self-auto"
    >
      <RefreshCw
        className={`h-3.5 w-3.5 shrink-0 ${isPending ? "animate-spin" : ""}`}
        aria-hidden="true"
      />
      <span>{isPending ? "Refreshing..." : "Refresh Rounds"}</span>
    </button>
  );
}
