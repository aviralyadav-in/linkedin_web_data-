import type { Metadata } from "next";
import { connection } from "next/server";

import { scraperConfigured, scraperFetch } from "@/lib/scraper";
import type { Run, ScraperStatus } from "@/lib/scraper-types";

import type { Link } from "../commands/commands-panel";
import CommentsPanel from "./comments-panel";

export const metadata: Metadata = { title: "User comments · LinkedIn Contacts" };

export default async function CommentsPage() {
  // ask the scraper API on every request, never a build-time snapshot
  await connection();
  const configured = scraperConfigured();

  // tell "API not reachable" apart from "API rejects our token", they need different fixes
  let link: Link = "offline";
  let status: ScraperStatus | null = null;
  let history: { runs: Run[] } | null = null;
  if (configured) {
    try {
      const res = await scraperFetch("status");
      if (res.ok) {
        status = (await res.json()) as ScraperStatus;
        link = "online";
      } else if (res.status === 401) {
        link = "token";
      }
      if (link === "online") {
        const runs = await scraperFetch("runs");
        history = runs.ok ? ((await runs.json()) as { runs: Run[] }) : null;
      }
    } catch {
      // offline: the panel says so and keeps retrying
    }
  }

  return (
    <CommentsPanel
      configured={configured}
      initialLink={link}
      initialStatus={status}
      initialRuns={history?.runs ?? null}
    />
  );
}
