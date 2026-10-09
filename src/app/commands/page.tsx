import type { Metadata } from "next";
import { connection } from "next/server";

import CommandsPanel from "./commands-panel";
import { loadPanel } from "./load";

export const metadata: Metadata = { title: "Commands · LinkedIn Contacts" };

export default async function CommandsPage() {
  // ask the scraper API on every request, never a build-time snapshot
  await connection();
  return <CommandsPanel {...await loadPanel()} />;
}
