"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type { ScraperStatus as Status } from "@/lib/scraper-types";

type State = { kind: "loading" | "off" | "offline" | "token" | "idle" | "busy"; text: string };

const DOT: Record<State["kind"], string> = {
  loading: "bg-zinc-300 dark:bg-zinc-600",
  off: "bg-zinc-300 dark:bg-zinc-600",
  offline: "bg-red-500",
  token: "bg-amber-500",
  idle: "bg-emerald-500",
  busy: "bg-sky-500 animate-pulse",
};

// Sidebar link to the Commands page showing the scraper's live state. While a run saves contacts,
// and when it ends, `onNewData` reloads the contacts table.
export default function ScraperStatus({ onNewData }: { onNewData: () => void }) {
  const [state, setState] = useState<State>({ kind: "loading", text: "Checking status..." });
  const onNewDataRef = useRef(onNewData);
  const linkRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    onNewDataRef.current = onNewData;
  });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let lastKey: string | null = null; // run id + contacts found + status at the last check
    const tick = async () => {
      // The sidebar exists twice (desktop and mobile drawer) and one copy is display:none; only the
      // copy on screen polls, so the table isn't refreshed twice for every change.
      if (linkRef.current?.offsetParent === null) {
        timer = setTimeout(tick, 3000);
        return;
      }
      let busy = false;
      if (!document.hidden) {
        try {
          const res = await fetch("/api/scraper/status", { cache: "no-store" });
          if (cancelled) return;
          if (res.status === 503) setState({ kind: "off", text: "API not configured" });
          else if (res.status === 401) setState({ kind: "token", text: "API token mismatch" });
          else if (!res.ok) setState({ kind: "offline", text: "Scraper API offline" });
          else {
            const s: Status = await res.json();
            if (cancelled) return;
            busy = s.busy;
            setState(
              s.current
                ? { kind: "busy", text: `Running: ${s.current.title}` }
                : { kind: "idle", text: "Ready to run a command" },
            );
            const run = s.current ?? s.last;
            // scrapes, and User comments lookups for contacts: both add to the table
            const key =
              run?.kind === "scrape"
                ? `${run.id}:${run.new_contacts}:${run.status}`
                : run?.kind === "comments" && run.contacts_only
                  ? `${run.id}:${run.contacts_found}:${run.status}`
                  : (lastKey ?? ""); // seen once: a run that starts later refreshes the table even if it ends fast
            if (lastKey !== null && key !== lastKey) onNewDataRef.current();
            lastKey = key;
          }
        } catch {
          if (!cancelled) setState({ kind: "offline", text: "Scraper API offline" });
        }
      }
      if (!cancelled) timer = setTimeout(tick, busy ? 5000 : 15000);
    };
    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  return (
    <Link
      ref={linkRef}
      href="/commands"
      className="flex items-center gap-3 rounded-lg border border-zinc-200 px-3 py-2 text-sm transition-colors hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-500"
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
        <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z" />
      </svg>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">Commands</span>
        <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">{state.text}</span>
      </span>
      <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[state.kind]}`} aria-hidden="true" />
    </Link>
  );
}
