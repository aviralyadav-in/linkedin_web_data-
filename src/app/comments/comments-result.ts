import type { Run } from "@/lib/scraper-types";

export const commentsHref = (runId: string) => `/comments?run=${encodeURIComponent(runId)}`;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// What a User comments run came to. linkedin_comments.py exits 0 = done, 2 = not a username / profile URL,
// 4 = LinkedIn didn't open, 5 = no such profile, 1 = didn't finish (the comments found until then are saved).
// `reachedEnd` (from the result file, when known) tells "the account has no more" from "stopped at the limit".
// An "Only contacts" run (contacts_only) also counts the contacts found in the comments it read.
export function commentsResult(run: Run, reachedEnd?: boolean) {
  const n = run.comments_found ?? 0;
  const found = plural(n, "comment");
  const contacts = run.contacts_only ? plural(run.contacts_found ?? 0, "contact") : null;
  const saved = contacts ? `${contacts} from ${found}` : found;
  if (run.status === "running") {
    if (!n) return "Opening the profile's comments...";
    return contacts ? `Looking for contacts... ${contacts} in ${found} so far.` : `Collecting comments... ${found} so far.`;
  }
  if (run.status === "succeeded") {
    if (!n) return "LinkedIn showed no comments for this account.";
    const atLimit = !!run.limit && n >= run.limit && reachedEnd !== true;
    if (!contacts) {
      return atLimit
        ? `Found ${found}, the Max comments limit. Older comments weren't read: raise Max comments or turn on Unlimited to get them.`
        : `Found ${found}.`;
    }
    const limit = atLimit ? ", the Max comments limit" : "";
    const what = run.contacts_found
      ? `Found ${contacts} in ${found}${limit}.`
      : `Read ${found}${limit}: none has an email, phone number, WhatsApp or Telegram.`;
    return atLimit ? `${what} Older comments weren't read: raise Max comments or turn on Unlimited to search them too.` : what;
  }
  if (run.exit_code === 5) return "That LinkedIn profile wasn't found. Check the username or URL.";
  if (run.exit_code === 4) {
    return "LinkedIn didn't open. This is usually an internet or DNS problem: check the connection and try again.";
  }
  if (run.exit_code === 2) return "That isn't a LinkedIn username or profile URL.";
  if (run.status === "stopped") return `Stopped. ${saved} saved.`;
  if (run.status === "interrupted") return `Interrupted because the scraper API stopped. ${saved} saved.`;
  return `Didn't finish. ${saved} saved; the scraper output says why.`;
}
