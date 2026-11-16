import React from "react";
import Link from "next/link";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { CmsShell } from "@/components/layout/CmsShell";
import { requireActiveUser } from "@/lib/auth/guards";
import { ALL_ORGANISER_ROLES } from "@/lib/auth/policy";
import { siteConfig } from "@/lib/site-config";
import { formatOrganiserRole } from "@/types/auth";

export const dynamic = "force-dynamic";

export default async function AccessDeniedPage() {
  const { sessionUser } = await requireActiveUser(ALL_ORGANISER_ROLES, {
    routeLabel: "/access-denied",
  });

  return (
    <CmsShell
      user={sessionUser}
      breadcrumbs={[
        { label: siteConfig.appName, href: "/" },
        { label: "Access Denied" },
      ]}
    >
      <section className="rounded-lg border border-red-200 bg-white p-6 sm:p-8">
        <div className="max-w-xl space-y-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-md border border-red-200 bg-red-50 text-red-700">
            <ShieldAlert className="h-5 w-5" aria-hidden="true" />
          </div>

          <div className="space-y-2">
            <h1 className="font-display text-xl font-bold text-slate-900">
              Super Admin Permission Required
            </h1>
            <p className="text-sm leading-relaxed text-slate-600">
              Your current role is{" "}
              <span className="font-medium text-slate-900">
                {formatOrganiserRole(sessionUser.role)}
              </span>
              . Organiser account provisioning and audit log inspection are
              restricted exclusively to active Super Admins.
            </p>
          </div>

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
