# LinkedIn Contacts (frontend)

The `linkedin-2` script saves contacts in PostgreSQL (`linkedin_db` → `contacts` table). This Next.js + Prisma app shows those contacts in the browser. From the **Commands** page you can also run the scraper's commands right here, without a terminal.

This app reads contacts from the database, and only removes the contacts you **Delete** from the dashboard. `linkedin-2/linkedin_feed.py` creates the table, so never run `prisma migrate` or `prisma db push` here.

## Running

Two things need to be running:

```powershell
# 1. scraper API (in the linkedin-2 folder)
cd C:\Users\Hp\Desktop\linkedin-2
python api.py

# 2. this dashboard (in a second terminal)
cd C:\Users\Hp\Desktop\linkedin-data
npm run dev
```

Open in the browser: http://localhost:3000. If the API is off, the contacts still show; only the Commands page will say "API offline".

The dashboard opens only on this computer (`127.0.0.1`), not from another device on the same Wi-Fi. The reason: from the Commands page, anyone can run the scraper on your LinkedIn account. To open it from a phone or another device, first set `DASHBOARD_USER` / `DASHBOARD_PASSWORD` in `.env`, then run `npm run start -- -H 0.0.0.0`.

### Production mode (a bit faster)

```powershell
npm run build
npm run start
```

## What is on the page

**Contacts (`/`)**
- **Sidebar:** filters by type (All, Email, Phone, WhatsApp, Telegram, LinkedIn) with counts, newly added contacts, Refresh, and dark/light mode. In **All**, the table lists the rows in this same order (Email first, LinkedIn last). **LinkedIn** = URLs of profiles / pages mentioned in a post or comment.
- **Filter by user:** a dropdown next to the search box above the table, listing the accounts (usernames) that had **Only contacts** lookups on User comments. Pick an account and the table shows only the contacts found by its lookup (comments, About section, posts) (the type filters and their counts also work only within it); remove the filter with the `×` next to `· from <username>` at the top. The CSV gives the same rows (`contacts_<username>.csv`). This list comes from the database's `comment_contacts` table.
- **Commands link:** in the sidebar, with the scraper's live status (Ready / Running / API offline). When a run (or a User comments Only contacts lookup) saves new contacts or finishes, the table refreshes by itself.
- **User comments link:** in the sidebar, for the new User comments tab.
- **Search, CSV download, selecting rows**, and Open / Copy / Share / Delete on each row.
- **Delete:** a row's trash button removes that one contact from the database, and selecting rows and pressing **Delete selected** removes all the selected contacts. A dialog asks you to confirm first. The selected contacts include ones that a filter or search hides right now, and the dialog says how many. A contact's `comment_contacts` entries are removed with it (so it also disappears from Filter by user). A delete can't be undone, but if a later run finds the same contact again, it is saved again.

**Commands (`/commands`)**
- All the text on the page is in English. Only the logs show the scraper's own output as it is.
- There is one card, **New run**, with all four steps: 1 Home feed (scrolls), 2 Posts you commented on, 3 More posts by those authors, 4 Posts those authors commented on. Steps 2–4 are turned ON/OFF with a switch (if step 2 is off, 3 and 4 don't run either), and you set each value with `−` / `+` or by typing it (0 to 500).
- The card shows the most posts that will be opened after the feed, roughly how long the run can take, and the matching terminal command (`$ python linkedin_feed.py ...`, with a copy button). **Reset to defaults** brings back the default values.
- Press **Start run**: the right panel shows the status, time, new contacts, current step and live logs. **Stop run** stops the command.
- Only one command runs at a time; until it ends, Start run stays disabled.
- **Recent runs:** click one to see its logs.
- **LinkedIn login on a server:** session file upload for a server, and **Check login**.

**User comments (`/comments`)**
- The Commands and User comments pages have tabs in the header to go from one to the other.
- Enter a LinkedIn account's username (like `satyanadella`) or profile URL, and press **Find comments**. `linkedin_comments.py` in `linkedin-2` gets all of that account's comments from its Activity → Comments page. Comments are not saved in the database; only the contacts from **Only contacts** also go into the `contacts` table (see below).
- **Get:** **All comments** (all comments, with their post) or **Only contacts** (email, phone number, WhatsApp, Telegram and mentioned LinkedIn profiles, with the same rules the scraper uses for the contacts database; the button becomes **Find contacts**). Only contacts searches three places: the account's **comments**, the **About section** of its profile, and **all its posts** (each post with all its comments). Max comments applies only to comments; all the posts are read, about half a minute per post.
- **Max comments** (1 to 5000, newest first). Turn the **Unlimited** switch on and the box hides and all the account's comments are fetched (big accounts can take hours); turn it off and the box comes back. Each time LinkedIn loads this list, it leaves out some comments, so the list is read up to 5 times and everything is combined; it stops at the first pass that finds no new comment.
- Comments show up as they come in: the date, the comment text, which comment it replies to (if it is a reply), and the post (author, text), with **Open comment** / **Open post** links. **Stop** stops the lookup; the comments found so far stay.
- **Only contacts** results: counts at the top (Contacts, Comments read, Posts read), then each contact once (with a type badge) and where it was found: in the account's comment (in how many comments, the newest comment, an **Open comment** link), in its post or in a comment on the post (**Open post** link), or in the About section (**Open profile** link). Each contact has **Open** (mail / call / WhatsApp / Telegram / LinkedIn profile) and **Copy** buttons. These contacts are also saved in the database's contacts table (with that account's username), so they also show in the main page's table.
- Search in the results, and **CSV** download (if you searched, only those rows; in Only contacts, a CSV of the contacts).
- **Earlier lookups:** past lookups; click one to see its comments. They also show in Recent runs on the Commands page (with an **Open in User comments** link).

## Setup

`.env` has these values (it doesn't go into git; `.gitignore` has `.env*`):

| Name | What it is |
|---|---|
| `DATABASE_URL` | The same as in `linkedin-2/.env`. If you change the password, change it in both places. |
| `SCRAPER_API_URL` | The scraper API's address, default `http://127.0.0.1:8000` |
| `SCRAPER_API_TOKEN` | The same as `API_TOKEN` in `linkedin-2/.env` |
| `DASHBOARD_USER`, `DASHBOARD_PASSWORD` | If both are set, the whole dashboard asks for a username/password. **On a server, or whenever the dashboard can be opened from another device, be sure to set them**, or anyone can see your contacts and run the scraper. Not needed when it runs only on your own PC (default `127.0.0.1`). |

Letters and numbers are the safest for a password. When Next.js reads `.env`, it drops the part after a `$` and treats everything after a `#` as a comment: if there is a `$`, write `\$`; if there is a `#`, put the whole password in `"double quotes"`. If the password ends up empty because of this, the dashboard won't open at all and will say so.

The token never reaches the browser: the browser only calls this app's `/api/scraper/*` routes, and this app adds the token on the server and sends the call on to the API.

The Prisma client is generated by itself after `npm install` (`postinstall: prisma generate`). To generate it by hand: `npx prisma generate`.

## Going live on a server

First start the scraper API with the steps in "Going live on a server" in `linkedin-2/README.md`. Then, on the same server:

```bash
# Needs Node.js 20+
cd ~/linkedin-data
npm ci
# in .env: DATABASE_URL, SCRAPER_API_URL, SCRAPER_API_TOKEN, DASHBOARD_USER, DASHBOARD_PASSWORD
npm run build
npm run start            # port 3000
```

Make this a service too (`/etc/systemd/system/linkedin-data.service`):

```ini
[Unit]
Description=LinkedIn contacts dashboard
After=network.target linkedin-api.service

[Service]
User=ubuntu
WorkingDirectory=/home/ubuntu/linkedin-data
ExecStart=/usr/bin/npm run start
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now linkedin-data
```

On the server too, the dashboard listens only on `127.0.0.1:3000`. To open it from outside with HTTPS, put [Caddy](https://caddyserver.com) in front of it; it gets the certificate by itself:

1. Point the domain's A record at the server's IP, and open ports 80 and 443 in the server's firewall.
2. `sudo apt install caddy` (using the steps on Caddy's site). It runs as a service by itself.
3. Put only this in `/etc/caddy/Caddyfile`:

   ```
   your-domain.com {
       reverse_proxy 127.0.0.1:3000
   }
   ```

4. `sudo systemctl reload caddy`, then open https://your-domain.com.

Without HTTPS, the dashboard password can be read in plain text on the network.

## Files

| File | What it does |
|---|---|
| `prisma/schema.prisma` | Model of the `contacts` table (`type`, `value`) |
| `prisma.config.ts` | Database URL for the Prisma CLI (from `.env`) |
| `src/lib/prisma.ts` | Database connection (server only) |
| `src/lib/scraper.ts` | Calls the scraper API, with the token (server only) |
| `src/lib/scraper-types.ts` | Types for the scraper API's data |
| `src/lib/contact-links.ts` | A contact's link (mailto, tel, wa.me, t.me, LinkedIn profile), in both the contacts table and User comments |
| `src/app/page.tsx` | Reads contacts from the database, and from `comment_contacts` which contact came from which account |
| `src/app/dashboard.tsx` | The whole contacts UI: sidebar, search, table, CSV, Delete |
| `src/app/actions.ts` | Delete: removes the selected contacts from the database (Server Action, checks the login again first) |
| `src/app/scraper-status.tsx` | The sidebar's Commands link, with the scraper's live status |
| `src/app/commands/page.tsx` | Commands page: gets the commands, status and history from the API |
| `src/app/commands/commands-panel.tsx` | Commands page UI: New run card, run panel, logs, history, session |
| `src/app/comments/page.tsx` | User comments page: gets the status and past lookups from the API |
| `src/app/comments/comments-panel.tsx` | User comments UI: form (All comments / Only contacts, Unlimited), results, search, CSV, past lookups |
| `src/app/comments/comments-result.ts` | The result of a comments run (on both pages) |
| `src/app/page-tabs.tsx` | Commands / User comments tabs |
| `src/app/api/scraper/[...path]/route.ts` | The path from the browser to the scraper API (allowed calls only) |
| `src/proxy.ts` | Optional username/password (`DASHBOARD_USER` / `DASHBOARD_PASSWORD`) |
| `src/lib/dashboard-auth.ts` | Checks that username/password, for both `proxy.ts` and Delete |
| `src/components/ui/select.tsx` | shadcn/ui Select (Radix UI), used for Filter by user |
| `src/lib/utils.ts` | shadcn's `cn()` class helper |
| `src/app/loading.tsx`, `src/app/commands/loading.tsx`, `src/app/comments/loading.tsx` | Skeleton while loading |
| `src/app/error.tsx`, `src/app/not-found.tsx` | Message when the database is down, and the 404 page |

## If something doesn't work

- **"Couldn't connect to the database":** check whether the PostgreSQL service is running, and whether `DATABASE_URL` in `.env` is correct.
- **"API offline" on the Commands page:** run `python api.py` in the `linkedin-2` folder (on a server: `sudo systemctl status linkedin-api` / `sudo systemctl restart linkedin-api`). The page keeps retrying by itself.
- **"The API token doesn't match":** the API is running but the token is different. `SCRAPER_API_TOKEN` and `API_TOKEN` in `linkedin-2/.env` must be the same. After changing them, restart both apps.
- **"LinkedIn login needed" in a run:** on a PC, log in in the open Chrome window. On a server, press Stop and upload a session file from the Commands page.
