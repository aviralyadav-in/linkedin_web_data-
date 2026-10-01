# LinkedIn Contacts (frontend)

`linkedin-2` wali script jo contacts PostgreSQL (`linkedin_db` → `contacts` table) mein save karti hai, unhe yeh Next.js + Prisma app browser mein dikhata hai. **Commands** page se scraper ki commands bhi yahin se chal jaati hain, terminal ke bina.

Yeh app database se **sirf padhta hai**. Table `linkedin-2/linkedin_feed.py` banati hai, isliye yahan kabhi `prisma migrate` ya `prisma db push` mat chalana.

## Chalana

Do cheezein chalni chahiye:

```powershell
# 1. scraper API (linkedin-2 folder mein)
cd C:\Users\Hp\Desktop\linkedin-2
python api.py

# 2. yeh dashboard (doosre terminal mein)
cd C:\Users\Hp\Desktop\linkedin-data
npm run dev
```

Browser mein kholo: http://localhost:3000. API band ho to contacts phir bhi dikhenge, bas Commands page "API offline" batayega.

Dashboard sirf isi computer par khulta hai (`127.0.0.1`), same Wi-Fi ke doosre device se nahi. Wajah: Commands page se koi bhi aapke LinkedIn account par scraper chala sakta hai. Phone ya doosre device se kholna ho to pehle `.env` mein `DASHBOARD_USER` / `DASHBOARD_PASSWORD` set karo, phir `npm run start -- -H 0.0.0.0` chalao.

### Production mode (thoda tez)

```powershell
npm run build
npm run start
```

## Page par kya hai

**Contacts (`/`)**
- **Sidebar:** type ke filters (All, Email, Phone, WhatsApp, Telegram) ginti ke saath, naye aaye contacts, Refresh aur dark/light mode.
- **Commands link:** sidebar mein scraper ki live haalat (Ready / Chal raha hai / API offline). Run naye contacts save kare ya khatam ho, to table apne aap refresh hoti hai.
- **User comments link:** sidebar mein, naye User comments tab ke liye.
- **Search, CSV download, rows select karna**, aur har row par Open / Copy / Share.

**Commands (`/commands`)**
- Page ki saari likhai English mein hai. Sirf logs mein scraper ka apna output waise hi dikhta hai.
- Ek hi card hai, **New run**, jismein chaaron steps hain: 1 Home feed (scrolls), 2 Posts you commented on, 3 More posts by those authors, 4 Posts those authors commented on. Steps 2–4 switch se ON/OFF hote hain (step 2 band ho to 3 aur 4 bhi nahi chalte), aur har value `−` / `+` se ya type karke do (0 se 500 tak).
- Card par dikhta hai ki feed ke baad zyada se zyada kitne posts khulenge, run lagbhag kitna lamba ho sakta hai, aur barabar ki terminal command (`$ python linkedin_feed.py ...`, copy button ke saath). **Reset to defaults** se default values wapas aa jaati hain.
- **Start run** dabao: daayein panel mein status, samay, naye contacts, current step aur live logs. **Stop run** se command ruk jaati hai.
- Ek waqt mein ek hi command chalti hai; tab tak Start run band rehta hai.
- **Recent runs:** kisi par click karo to uske logs dikhenge.
- **LinkedIn login on a server:** server ke liye session file upload aur **Check login**.

**User comments (`/comments`)**
- Commands aur User comments page ke header mein tabs hain, ek se doosre par jaane ke liye.
- Kisi LinkedIn account ka username (jaise `satyanadella`) ya profile URL do, aur **Find comments** dabao. `linkedin-2` ka `linkedin_comments.py` us account ke Activity → Comments page se uske saare comments laata hai. Contacts database mein kuch save nahi hota.
- **Get:** **All comments** (saare comments, post ke saath) ya **Only contacts** (comments mein mile email, phone number, WhatsApp, Telegram, wahi rules jo scraper contacts database ke liye use karta hai; button **Find contacts** ho jaata hai).
- **Max comments** (1 se 5000, sabse naye pehle). **Unlimited** switch on karo to box chhup jaata hai aur account ke saare comments aate hain (bade accounts mein ghante lag sakte hain); off karo to box wapas. LinkedIn yeh list har baar load karte waqt kuch comments chhod deta hai, isliye list hamesha 5 baar padhi jaati hai aur sab jod diye jaate hain.
- Comments aate-aate dikhte hain: date, comment ka text, reply ho to kis comment ka, aur post (author, text) ke saath **Open comment** / **Open post** links. **Stop** se lookup ruk jaata hai; jitne mile, woh rehte hain.
- **Only contacts** ke results: har contact ek baar (type badge ke saath), kitne comments mein mila, aur sabse naya comment jisme woh hai (**Open comment** link). Har contact ke saath **Open** (mail / call / WhatsApp / Telegram) aur **Copy** buttons. Contacts database mein ye bhi save nahi hote.
- Results mein search, aur **CSV** download (search kiya ho to sirf wahi rows; Only contacts mein contacts ki CSV).
- **Earlier lookups:** pichhle lookups, click karo to unke comments. Commands page ki Recent runs mein bhi dikhte hain (**Open in User comments** link ke saath).

## Setup

`.env` mein yeh values hain (git mein nahi jaati, `.gitignore` mein `.env*` hai):

| Naam | Kya hai |
|---|---|
| `DATABASE_URL` | Wahi jo `linkedin-2/.env` mein hai. Password badlo to dono jagah badalna. |
| `SCRAPER_API_URL` | Scraper API ka address, default `http://127.0.0.1:8000` |
| `SCRAPER_API_TOKEN` | Wahi jo `linkedin-2/.env` mein `API_TOKEN` hai |
| `DASHBOARD_USER`, `DASHBOARD_PASSWORD` | Dono set hon to poora dashboard username/password maangta hai. **Server par, ya jab bhi dashboard doosre device se khul sakta ho, zaroor set karo**, warna koi bhi aapke contacts dekh sakta hai aur scraper chala sakta hai. Sirf apne PC par (default `127.0.0.1`) zaroorat nahi. |

Password ke liye letters aur numbers sabse safe hain. Next.js `.env` padhte waqt `$` ke baad wala hissa gayab kar deta hai aur `#` ke baad sab comment maan leta hai: `$` ho to `\$` likho, `#` ho to poora password `"double quotes"` mein likho. Agar password is wajah se khaali ho jaaye, to dashboard khulega hi nahi aur yahi batayega.

Token kabhi browser tak nahi jaata: browser sirf is app ke `/api/scraper/*` routes ko call karta hai, aur yeh app server par token jodkar API ko bhejta hai.

Prisma client `npm install` ke baad apne aap banta hai (`postinstall: prisma generate`). Haath se banana ho to: `npx prisma generate`.

## Server par live karna

Pehle `linkedin-2/README.md` ke "Server par live karna" wale steps se scraper API chalao. Phir isi server par:

```bash
# Node.js 20+ chahiye
cd ~/linkedin-data
npm ci
# .env mein DATABASE_URL, SCRAPER_API_URL, SCRAPER_API_TOKEN, DASHBOARD_USER, DASHBOARD_PASSWORD
npm run build
npm run start            # port 3000
```

Isse bhi service bana do (`/etc/systemd/system/linkedin-data.service`):

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

Dashboard server par bhi sirf `127.0.0.1:3000` par sunta hai. Bahar se HTTPS ke saath kholne ke liye aage [Caddy](https://caddyserver.com) lagao, woh certificate khud le leta hai:

1. Domain ka A record server ke IP par point karo, aur server ke firewall mein ports 80 aur 443 kholo.
2. `sudo apt install caddy` (Caddy ki site par diye steps se). Yeh apne aap service ki tarah chalta hai.
3. `/etc/caddy/Caddyfile` mein sirf yeh rakho:

   ```
   aapka-domain.com {
       reverse_proxy 127.0.0.1:3000
   }
   ```

4. `sudo systemctl reload caddy`, phir https://aapka-domain.com kholo.

Bina HTTPS ke dashboard ka password network par saaf padha ja sakta hai.

## Files

| File | Kaam |
|---|---|
| `prisma/schema.prisma` | `contacts` table ka model (`type`, `value`) |
| `prisma.config.ts` | Prisma CLI ke liye database URL (`.env` se) |
| `src/lib/prisma.ts` | Database connection (sirf server par) |
| `src/lib/scraper.ts` | Scraper API ko call karna, token ke saath (sirf server par) |
| `src/lib/scraper-types.ts` | Scraper API ke data ke types |
| `src/lib/contact-links.ts` | Contact ka link (mailto, tel, wa.me, t.me), contacts table aur User comments dono mein |
| `src/app/page.tsx` | Database se contacts padhta hai |
| `src/app/dashboard.tsx` | Contacts ka poora UI: sidebar, search, table, CSV |
| `src/app/scraper-status.tsx` | Sidebar ka Commands link, scraper ki live haalat ke saath |
| `src/app/commands/page.tsx` | Commands page: API se commands, status aur history laata hai |
| `src/app/commands/commands-panel.tsx` | Commands page ka UI: New run card, run panel, logs, history, session |
| `src/app/comments/page.tsx` | User comments page: API se status aur pichhle lookups laata hai |
| `src/app/comments/comments-panel.tsx` | User comments ka UI: form (All comments / Only contacts, Unlimited), results, search, CSV, pichhle lookups |
| `src/app/comments/comments-result.ts` | Comments run ka nateeja (dono pages par) |
| `src/app/page-tabs.tsx` | Commands / User comments tabs |
| `src/app/api/scraper/[...path]/route.ts` | Browser se scraper API tak ka raasta (sirf allowed calls) |
| `src/proxy.ts` | Optional username/password (`DASHBOARD_USER` / `DASHBOARD_PASSWORD`) |
| `src/app/loading.tsx`, `src/app/commands/loading.tsx`, `src/app/comments/loading.tsx` | Load hote waqt skeleton |
| `src/app/error.tsx`, `src/app/not-found.tsx` | Database band ho to message, aur 404 page |

## Agar kuch kaam na kare

- **"Database se connect nahi ho paya":** PostgreSQL service chal rahi hai ya nahi, aur `.env` ka `DATABASE_URL` sahi hai ya nahi, check karo.
- **Commands page par "API offline":** `linkedin-2` folder mein `python api.py` chalao (server par `sudo systemctl status linkedin-api` / `sudo systemctl restart linkedin-api`). Page apne aap dobara try karta rehta hai.
- **"API token match nahi karta" / "The API token doesn't match":** API chal raha hai lekin token alag hai. `SCRAPER_API_TOKEN` aur `linkedin-2/.env` ka `API_TOKEN` ek jaise hone chahiye. Badalne ke baad dono app restart karo.
- **Run mein "LinkedIn login needed":** PC par ho to khuli Chrome window mein login karo. Server par ho to Stop karo aur Commands page se session file upload karo.
