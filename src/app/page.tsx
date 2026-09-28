import { connection } from "next/server";

import { prisma } from "@/lib/prisma";

import Dashboard from "./dashboard";

export default async function Home() {
  // read the table on every request, so rows the scraper adds show up on refresh
  await connection();
  const contacts = await prisma.contact.findMany({ orderBy: [{ type: "asc" }, { value: "asc" }] });

  return <Dashboard contacts={contacts} />;
}
