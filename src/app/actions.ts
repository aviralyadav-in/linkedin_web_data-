"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";

import { dashboardLogin } from "@/lib/dashboard-auth";
import { prisma } from "@/lib/prisma";

const TYPES = new Set(["telegram", "email", "phone", "whatsapp", "linkedin"]);
const MAX_ROWS = 1000; // the page sends at most 500 at a time

// Deletes contacts from the contacts table and refreshes the page. Their rows in comment_contacts (Filter by user)
// go with them: that table's foreign key says ON DELETE CASCADE. Anyone who can POST to the dashboard can call
// this, so it checks the login itself too (not only proxy.ts) and takes nothing but type/value pairs.
export async function deleteContacts(rows: unknown): Promise<{ deleted: number } | { error: string }> {
  const login = dashboardLogin((await headers()).get("authorization"));
  if (login !== "open" && login !== "ok") throw new Error("Login required");

  if (!Array.isArray(rows) || rows.length === 0 || rows.length > MAX_ROWS) {
    return { error: `Send 1 to ${MAX_ROWS} contacts at a time.` };
  }
  const keys: { type: string; value: string }[] = [];
  for (const row of rows) {
    const { type, value } = (row ?? {}) as Record<string, unknown>;
    if (typeof type !== "string" || !TYPES.has(type) || typeof value !== "string" || !value) {
      return { error: "That isn't a contact from the table." };
    }
    keys.push({ type, value });
  }

  try {
    const { count } = await prisma.contact.deleteMany({ where: { OR: keys } });
    refresh();
    return { deleted: count };
  } catch (e) {
    console.error("Deleting contacts failed:", e);
    return { error: "The database didn't delete them. Is PostgreSQL running?" };
  }
}
