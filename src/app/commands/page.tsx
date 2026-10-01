import type { Metadata } from "next";
import { connection } from "next/server";

import { scraperConfigured, scraperFetch } from "@/lib/scraper";
import type { CommandsResponse, Run, ScraperStatus } from "@/lib/scraper-types";

import CommandsPanel, { type Link } from "./commands-panel";

export const metadata: Metadata = { title: "Commands · LinkedIn Contacts" };

async function load<T>(path: string): Promise<T | null> {
  try {
    const res = await scraperFetch(path);
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

export default async function CommandsPage() {
  // ask the scraper API on every request, never a build-time snapshot
  await connection();
  const configured = scraperConfigured();

  // tell "API not reachable" apart from "API rejects our token", they need different fixes
  let link: Link = "offline";
  let status: ScraperStatus | null = null;
  if (configured) {
    try {
      const res = await scraperFetch("status");
      if (res.ok) {
        status = (await res.json()) as ScraperStatus;
        link = "online";
      } else if (res.status === 401) {
        link = "token";
      }
    } catch {
      // offline: the panel says so and keeps retrying
    }
  }
  const [commands, history] =
    link === "online"
      ? await Promise.all([load<CommandsResponse>("commands"), load<{ runs: Run[] }>("runs")])
      : [null, null];

  return (
    <CommandsPanel
      configured={configured}
      initialLink={link}
      initialCommands={commands}
      initialStatus={status}
      initialRuns={history?.runs ?? null}
    />
  );
}
