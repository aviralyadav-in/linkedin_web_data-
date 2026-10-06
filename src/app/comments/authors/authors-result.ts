import type { AuthorsResult, Run } from "@/lib/scraper-types";

export const authorsHref = (runId: string) => `/comments/authors?run=${encodeURIComponent(runId)}`;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// What a "User comments account data" run (linkedin_authors.py) came to. It reads the account's comments, then
// opens the profile of every author of the posts they are on and reads its About section and Contact info (and when
// those have no contacts, the author's newest posts). Exit codes as
// linkedin_comments.py: 0 = done, 2 = not a username / profile URL, 4 = LinkedIn didn't open, 5 = no such profile,
// 1 = didn't finish (what was found until then is saved). `result` (the result file, when loaded) has the totals.
export function authorsResult(run: Run, result?: AuthorsResult | null) {
  const n = run.comments_found ?? 0;
  const comments = plural(n, "comment");
  const authors = run.authors_found ?? result?.authors.length ?? 0;
  const read = run.profiles_read ?? 0;
  const toRead = result?.profiles_total ?? authors;
  const contacts = plural(run.contacts_found ?? 0, "contact");
  const reached = result?.posts !== null && result?.posts !== undefined;
  if (run.status === "running") {
    if (!reached) return n ? `Reading the account's comments... ${comments} so far.` : "Opening the profile's comments...";
    return `Reading the authors' About, Contact info and posts... ${read} of ${toRead} done, ${contacts} so far.`;
  }
  const saved = `${contacts} from ${plural(read, "author")} saved`;
  if (run.status === "succeeded") {
    const atLimit = !!run.limit && n >= run.limit && result?.reached_end !== true;
    const limitNote = atLimit
      ? " Max comments was reached, so the posts of older comments weren't looked at: raise it or turn on Unlimited."
      : "";
    if (!n) return "LinkedIn showed no comments for this account.";
    if (!authors) return `Read ${comments}: none is on a post by someone else.${limitNote}`;
    const what = run.contacts_found
      ? `Found ${contacts} in the About sections, Contact info and posts of ${plural(read, "author")}.`
      : `Read the About sections, Contact info and posts of ${plural(read, "author")}: no email, phone number, WhatsApp, Telegram or mentioned LinkedIn profile in them.`;
    return `${what} ${plural(authors, "author")} wrote the posts of ${comments}.${limitNote}`;
  }
  if (run.exit_code === 5) return "That LinkedIn profile wasn't found. Check the username or URL.";
  if (run.exit_code === 4) {
    return "LinkedIn didn't open. This is usually an internet or DNS problem: check the connection and try again.";
  }
  if (run.exit_code === 2) return "That isn't a LinkedIn username or profile URL.";
  if (run.status === "stopped") return `Stopped. ${saved}.`;
  if (run.status === "interrupted") return `Interrupted because the scraper API stopped. ${saved}.`;
  return `Didn't finish. ${saved}; the scraper output says why.`;
}
