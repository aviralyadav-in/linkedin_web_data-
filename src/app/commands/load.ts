import "server-only";

import { scraperConfigured, scraperFetch } from "@/lib/scraper";
import type { CommandsResponse, Run, ScraperStatus, SessionStatus } from "@/lib/scraper-types";

import type { Link } from "./commands-panel";

async function load<T>(path: string): Promise<T | null> {
  try {
    const res = await scraperFetch(path);
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

// Settings: the LinkedIn login on the scraper's machine (null from an API that doesn't tell it yet)
export const loadSession = () => load<SessionStatus>("session");

// What the Commands and Settings pages start with: the scraper API's state, its commands and the run history.
export async function loadPanel() {
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

  return {
    configured,
    initialLink: link,
    initialCommands: commands,
    initialStatus: status,
    initialRuns: history?.runs ?? null,
  };
}
