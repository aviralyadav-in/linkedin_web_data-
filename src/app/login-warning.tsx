"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import type { SessionStatus } from "@/lib/scraper-types";

// A bar at the top of every page while the server's LinkedIn login doesn't work: it has no session, or the newest
// login check (the daily one the API starts by itself, or one started by hand) found it logged out. Not on
// Settings, whose session card says the same. Asked again every few minutes while the tab is open.
export default function LoginWarning() {
  const pathname = usePathname();
  const [session, setSession] = useState<SessionStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch("/api/scraper/session", { cache: "no-store" });
        // not set up, unreachable or an older API: no bar (the scraper pages say what is wrong)
        if (!cancelled) setSession(res.ok ? ((await res.json()) as SessionStatus) : null);
      } catch {
        if (!cancelled) setSession(null);
      }
    };
    load();
    const timer = setInterval(load, 5 * 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (!session || pathname === "/settings") return null;
  const check = session.last_check;
  const loggedOut = session.session && check?.status === "failed" && check.exit_code === 3;
  if (session.session && !loggedOut) return null;

  return (
    <div
      role="alert"
      className="flex w-full items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 sm:px-6 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-200"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4 shrink-0"
        aria-hidden="true"
      >
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0ZM12 9v4m0 4h.01" />
      </svg>
      <span className="min-w-0 flex-1">
        {loggedOut
          ? "The LinkedIn login on the server has stopped working: the last login check found it logged out. Runs there can't read LinkedIn until a new session is uploaded."
          : "There is no LinkedIn session on the server, so runs there can't log in to LinkedIn. Upload one."}
      </span>
      <Link href="/settings" className="shrink-0 font-semibold underline underline-offset-2">
        Open Settings
      </Link>
    </div>
  );
}
