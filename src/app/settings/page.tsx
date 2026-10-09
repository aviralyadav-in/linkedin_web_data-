import type { Metadata } from "next";
import { connection } from "next/server";

import CommandsPanel from "../commands/commands-panel";
import { loadPanel } from "../commands/load";

export const metadata: Metadata = { title: "Settings · LinkedIn Contacts" };

// The LinkedIn login on a server (upload a session file, check the login): the Commands page's card, on a page of
// its own, with the run panel that follows those jobs.
export default async function SettingsPage() {
  // ask the scraper API on every request, never a build-time snapshot
  await connection();
  return <CommandsPanel {...await loadPanel()} page="settings" />;
}
