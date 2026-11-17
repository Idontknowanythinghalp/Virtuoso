"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Award,
  Building2,
  ClipboardCheck,
  FileSearch,
  FileSpreadsheet,
  FolderArchive,
  LayoutDashboard,
  LogOut,
  Menu,
  Scale,
  ShieldCheck,
  UserCheck,
  UserCog,
  Users,
  X,
} from "lucide-react";
import { CMS_MODULES } from "@/lib/navigation";
import { siteConfig } from "@/lib/site-config";
import type { BreadcrumbItem, CmsModuleSlug } from "@/types/cms";
import { formatOrganiserRole, type OrganiserSessionUser } from "@/types/auth";
import { BrandMark } from "@/components/cms/BrandMark";
import { signOutOrganiserAction } from "@/app/actions/auth";

interface CmsShellProps {
  breadcrumbs: BreadcrumbItem[];
  user: OrganiserSessionUser;
  children: React.ReactNode;
}

const MODULE_ICONS: Record<CmsModuleSlug, React.ReactNode> = {
  competitions: <Award className="h-4 w-4 shrink-0" aria-hidden="true" />,
  contingents: <Users className="h-4 w-4 shrink-0" aria-hidden="true" />,
  "judging-scoring": <Scale className="h-4 w-4 shrink-0" aria-hidden="true" />,
  results: (
    <ClipboardCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
  ),
  "media-vault": (
    <FolderArchive className="h-4 w-4 shrink-0" aria-hidden="true" />
  ),
  "access-audit": (
    <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
  ),
};

export function CmsShell({ breadcrumbs, user, children }: CmsShellProps) {
  const pathname = usePathname();
  const [openAtPathname, setOpenAtPathname] = useState<string | null>(null);
  const mobileNavOpen = openAtPathname === pathname;
  const isSuperAdmin = user.role === "super_admin";

  useEffect(() => {
    if (!mobileNavOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenAtPathname(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileNavOpen]);

  const sidebarContent = (
    <div className="flex h-full flex-col justify-between bg-white">
      <div className="space-y-6 p-4">
        <Link
          href="/"
          className="flex items-center gap-3 rounded-md px-2 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
        >
          <BrandMark
            src="/brand/virtuoso-emblem.png"
            alt="Virtuoso Emblem"
            className="h-9 w-9 shrink-0 rounded-md border border-slate-200 bg-[#200000] object-contain p-1"
            fallbackLabel="V"
          />
          <div className="min-w-0">
            <span className="block truncate font-display text-sm font-bold tracking-tight text-slate-900">
              {siteConfig.appName}
            </span>
            <span className="block truncate text-xs text-slate-500">
              SJCC · Business Admin
            </span>
          </div>
        </Link>

        <nav aria-label="CMS Workspace Navigation" className="space-y-6">
          <div className="space-y-1">
            <p className="px-2.5 text-xs font-medium text-slate-500">
              Workspace
            </p>
            <Link
              href="/"
              className={`flex min-h-10 items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507] ${
                pathname === "/"
                  ? "bg-[#4B0507] text-white"
                  : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <LayoutDashboard className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="truncate">System Overview</span>
            </Link>
          </div>

          <div className="space-y-1">
            <p className="px-2.5 text-xs font-medium text-slate-500">
              Competition Structure
            </p>
            <ul className="space-y-1">
              <li>
                <Link
                  href="/events"
                  className={`flex min-h-10 items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507] ${
                    pathname === "/events" || pathname.startsWith("/events/")
                      ? "bg-[#4B0507] text-white"
                      : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  <Award className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">Events &amp; Rounds</span>
                </Link>
              </li>
              <li>
                <Link
                  href="/contingents"
                  className={`flex min-h-10 items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507] ${
                    pathname === "/contingents" ||
                    pathname.startsWith("/contingents/")
                      ? "bg-[#4B0507] text-white"
                      : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  <Building2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">Contingents</span>
                </Link>
              </li>
              <li>
                <Link
                  href="/participants"
                  className={`flex min-h-10 items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507] ${
                    pathname === "/participants" ||
                    pathname.startsWith("/participants/")
                      ? "bg-[#4B0507] text-white"
                      : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  <UserCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">Participants</span>
                </Link>
              </li>
              <li>
                <Link
                  href="/imports"
                  className={`flex min-h-10 items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507] ${
                    pathname === "/imports" || pathname.startsWith("/imports/")
                      ? "bg-[#4B0507] text-white"
                      : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  <FileSpreadsheet
                    className="h-4 w-4 shrink-0"
                    aria-hidden="true"
                  />
                  <span className="truncate">Import Preparation</span>
                </Link>
              </li>
            </ul>
          </div>

          {isSuperAdmin ? (
            <div className="space-y-1">
              <p className="px-2.5 text-xs font-medium text-slate-500">
                Administration
              </p>
              <ul className="space-y-1">
                <li>
                  <Link
                    href="/admin/accounts"
                    className={`flex min-h-10 items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507] ${
                      pathname === "/admin/accounts"
                        ? "bg-[#4B0507] text-white"
                        : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    <UserCog className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">Organiser Accounts</span>
                  </Link>
                </li>
                <li>
                  <Link
                    href="/admin/audit-logs"
                    className={`flex min-h-10 items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507] ${
                      pathname === "/admin/audit-logs"
                        ? "bg-[#4B0507] text-white"
                        : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    <FileSearch
                      className="h-4 w-4 shrink-0"
                      aria-hidden="true"
                    />
                    <span className="truncate">Audit Log</span>
                  </Link>
                </li>
              </ul>
            </div>
          ) : null}

          <div className="space-y-1">
            <p className="px-2.5 text-xs font-medium text-slate-500">
              Planned Modules
            </p>
            <ul className="space-y-1">
              {CMS_MODULES.filter((mod) => mod.status !== "Active").map(
                (mod) => {
                  const isActive = pathname === mod.href;
                  return (
                    <li key={mod.slug}>
                      <Link
                        href={mod.href}
                        className={`flex min-h-10 items-center justify-between gap-2 rounded-md px-2.5 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507] ${
                          isActive
                            ? "bg-[#4B0507] text-white"
                            : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-2.5">
                          {MODULE_ICONS[mod.slug]}
                          <span className="truncate">{mod.title}</span>
                        </span>
                      </Link>
                    </li>
                  );
                },
              )}
            </ul>
          </div>
        </nav>
      </div>

      <div className="space-y-4 border-t border-slate-200 p-4">
        <div className="space-y-1">
          <p className="truncate text-sm font-medium text-slate-900">
            {user.fullName}
          </p>
          <p className="truncate text-xs text-slate-500">
            {formatOrganiserRole(user.role)}
          </p>
        </div>

        <form action={signOutOrganiserAction}>
          <button
            type="submit"
            className="flex min-h-10 w-full items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium whitespace-nowrap text-slate-800 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
          >
            <LogOut className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Sign Out</span>
          </button>
        </form>

        <div className="border-t border-slate-100 pt-3">
          <div className="flex items-center gap-3">
            <BrandMark
              src="/brand/sjcc-logo.png"
              alt="St. Joseph's College of Commerce"
              className="h-7 w-7 shrink-0 rounded bg-[#200000] object-contain p-0.5"
              fallbackLabel="SJCC"
            />
            <BrandMark
              src="/brand/bba-logo.png"
              alt="Department of Business Administration"
              className="h-7 w-auto max-w-[72px] shrink-0 rounded bg-[#200000] object-contain px-1.5 py-0.5"
              fallbackLabel="BBA"
            />
          </div>
          <p className="mt-2 text-xs leading-snug text-slate-500">
            {siteConfig.institution}
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 lg:grid lg:grid-cols-[260px_1fr]">
      {/* Desktop Sidebar */}
      <aside className="hidden border-r border-slate-200 bg-white lg:sticky lg:top-0 lg:block lg:h-screen lg:overflow-y-auto">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileNavOpen ? (
        <div
          className="fixed inset-0 z-50 flex lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Mobile navigation"
        >
          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={() => setOpenAtPathname(null)}
            className="fixed inset-0 bg-slate-900/40"
          />
          <aside className="relative z-10 flex h-full w-72 max-w-[85vw] flex-col border-r border-slate-200 bg-white shadow-lg">
            <div className="flex items-center justify-end border-b border-slate-200 px-3 py-2">
              <button
                type="button"
                onClick={() => setOpenAtPathname(null)}
                aria-label="Close navigation menu"
                className="inline-flex h-10 w-10 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">{sidebarContent}</div>
          </aside>
        </div>
      ) : null}

      {/* Main Column */}
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setOpenAtPathname(pathname)}
              aria-label="Open navigation menu"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507] lg:hidden"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>

            <nav
              aria-label="Breadcrumb"
              className="flex min-w-0 items-center gap-2 text-sm"
            >
              {breadcrumbs.map((crumb, index) => {
                const isLast = index === breadcrumbs.length - 1;
                return (
                  <React.Fragment key={`${crumb.label}-${index}`}>
                    {index > 0 ? (
                      <span className="text-slate-400" aria-hidden="true">
                        /
                      </span>
                    ) : null}
                    {crumb.href && !isLast ? (
                      <Link
                        href={crumb.href}
                        className="truncate whitespace-nowrap text-slate-500 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507]"
                      >
                        {crumb.label}
                      </Link>
                    ) : (
                      <span
                        className={`truncate whitespace-nowrap ${
                          isLast
                            ? "font-semibold text-slate-900"
                            : "text-slate-500"
                        }`}
                      >
                        {crumb.label}
                      </span>
                    )}
                  </React.Fragment>
                );
              })}
            </nav>
          </div>

          <div className="flex shrink-0 items-center gap-4 text-xs text-slate-600">
            <span className="hidden max-w-[180px] truncate font-medium text-slate-900 sm:inline">
              {user.fullName}
            </span>
            <span className="hidden text-slate-300 sm:inline" aria-hidden="true">
              ·
            </span>
            <span className="whitespace-nowrap font-medium text-[#4B0507]">
              {formatOrganiserRole(user.role)}
            </span>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 space-y-8 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
