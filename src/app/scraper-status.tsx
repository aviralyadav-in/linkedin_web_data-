"use client";

import { useEffect, useRef } from "react";

import type { ScraperStatus as Status } from "@/lib/scraper-types";

// Watches the scraper API: while a run saves contacts, and when it ends, `onNewData` reloads the
// contacts table. Called once, from the dashboard (the sidebar it used to live in is rendered twice).
export function useScraperWatch(onNewData: () => void) {
  const onNewDataRef = useRef(onNewData);
  useEffect(() => {
    onNewDataRef.current = onNewData;
  });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let lastKey: string | null = null; // run id + contacts found + status at the last check
    const tick = async () => {
      let busy = false;
      if (!document.hidden) {
        try {
          const res = await fetch("/api/scraper/status", { cache: "no-store" });
          if (cancelled) return;
          if (res.ok) {
            const s: Status = await res.json();
            if (cancelled) return;
            busy = s.busy;
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
          // API offline: the next tick tries again
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
}
