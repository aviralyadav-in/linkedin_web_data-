import type { Run } from "@/lib/scraper-types";

export const commentsHref = (runId: string) => `/comments?run=${encodeURIComponent(runId)}`;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// What a User comments run came to. linkedin_comments.py exits 0 = done, 2 = not a username / profile URL,
// 4 = LinkedIn didn't open, 5 = no such profile, 1 = didn't finish (what was found until then is saved).
// `reachedEnd` (from the result file, when known) tells "the account has no more" from "stopped at the limit".
// An "Only contacts" run (contacts_only) counts the contacts found: in the comments it read and, when the scraper
// also reads the profile's About section and the account's posts (posts_found is there), in those. Max comments
// is a limit for the comments only: the posts are all read.
export function commentsResult(run: Run, reachedEnd?: boolean) {
  const n = run.comments_found ?? 0;
  const found = plural(n, "comment");
  const contacts = run.contacts_only ? plural(run.contacts_found ?? 0, "contact") : null;
  const posts = run.contacts_only && run.posts_found !== undefined ? run.posts_found : null;
  const read = posts === null ? found : `${found} and ${plural(posts, "post")}`;
  const saved = contacts ? `${contacts} from ${read}` : found;
  if (run.status === "running") {
    if (!n && !posts) return contacts && posts !== null ? "Opening the profile..." : "Opening the profile's comments...";
    return contacts ? `Looking for contacts... ${contacts} in ${read} so far.` : `Collecting comments... ${found} so far.`;
  }
  if (run.status === "succeeded") {
    const atLimit = !!run.limit && n >= run.limit && reachedEnd !== true;
    if (!contacts) {
      if (!n) return "LinkedIn showed no comments for this account.";
      return atLimit
        ? `Found ${found}, the Max comments limit. Older comments weren't read: raise Max comments or turn on Unlimited to get them.`
        : `Found ${found}.`;
    }
    if (posts === null) {
      if (!n) return "LinkedIn showed no comments for this account.";
      const limit = atLimit ? ", the Max comments limit" : "";
      const what = run.contacts_found
        ? `Found ${contacts} in ${found}${limit}.`
        : `Read ${found}${limit}: none has an email, phone number, WhatsApp or Telegram.`;
      return atLimit ? `${what} Older comments weren't read: raise Max comments or turn on Unlimited to search them too.` : what;
    }
    const where = `${found}, ${plural(posts, "post")} and the About section`;
    const what = run.contacts_found
      ? `Found ${contacts} in ${where}.`
      : `Searched ${where}: no email, phone number, WhatsApp, Telegram or mentioned LinkedIn profile in them.`;
    return atLimit
      ? `${what} Max comments was reached, so older comments weren't read: raise it or turn on Unlimited to search them too.`
      : what;
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
