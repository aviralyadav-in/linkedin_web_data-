import { connection } from "next/server";

import { prisma } from "@/lib/prisma";

import Dashboard, { type SourceRow } from "./dashboard";

export default async function Home() {
  // read the table on every request, so rows the scraper adds show up on refresh
  await connection();
  const [contacts, sources] = await Promise.all([
    prisma.contact.findMany({ orderBy: [{ type: "asc" }, { value: "asc" }] }),
    commentContacts(),
  ]);

  return <Dashboard contacts={contacts} sources={sources} />;
}

// Which account's comments each contact came from (User comments, Only contacts). linkedin_comments.py creates the
// table with its first such lookup, so it may not exist yet.
async function commentContacts(): Promise<SourceRow[]> {
  const [{ found }] = await prisma.$queryRaw<{ found: boolean }[]>`
    SELECT to_regclass('comment_contacts') IS NOT NULL AS found`;
  if (!found) return [];
  return prisma.$queryRaw<SourceRow[]>`SELECT username, type, value FROM comment_contacts ORDER BY username`;
}
