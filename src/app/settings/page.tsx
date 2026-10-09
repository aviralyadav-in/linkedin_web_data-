import type { Metadata } from "next";
import { connection } from "next/server";

import CommandsPanel from "../commands/commands-panel";
import { loadPanel, loadSession } from "../commands/load";

export const metadata: Metadata = { title: "Settings · LinkedIn Contacts" };

// The LinkedIn login on a server (upload a session file, check the login): the Commands page's card, on a page of
// its own, next to a card with the session the server has.
export default async function SettingsPage() {
  // ask the scraper API on every request, never a build-time snapshot
  await connection();
  const panel = await loadPanel();
  const session = panel.initialLink === "online" ? await loadSession() : null;
  return <CommandsPanel {...panel} page="settings" initialSession={session} />;
}
