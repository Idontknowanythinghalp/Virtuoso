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
      className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 self-start rounded-md border border-[#D9AD61]/60 bg-[#401010] px-4 py-2 text-xs font-semibold whitespace-nowrap text-[#F5F0EC] transition-colors hover:border-[#D9AD61] hover:bg-[#D9AD61] hover:text-[#200000] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D9AD61] focus-visible:ring-offset-2 focus-visible:ring-offset-[#200000] disabled:cursor-not-allowed disabled:opacity-60 sm:self-auto"
    >
      <RefreshCw
        className={`h-3.5 w-3.5 shrink-0 ${isPending ? "animate-spin" : ""}`}
        aria-hidden="true"
      />
      <span>{isPending ? "Refreshing..." : "Refresh Rounds"}</span>
    </button>
  );
}
