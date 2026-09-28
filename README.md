# LinkedIn Contacts (frontend)

`linkedin-2` wali script jo contacts PostgreSQL (`linkedin_db` → `contacts` table) mein save karti hai, unhe yeh Next.js + Prisma app browser mein dikhata hai.

Yeh app database se **sirf padhta hai**. Table `linkedin-2/linkedin_feed.py` banati hai, isliye yahan kabhi `prisma migrate` ya `prisma db push` mat chalana.

## Chalana

```powershell
cd C:\Users\Hp\Desktop\linkedin-data
npm run dev
```

Browser mein kholo: http://localhost:3000

Naya data dekhne ke liye bas page refresh karo. Page har baar database se taaza data laata hai.

### Production mode (thoda tez)

```powershell
npm run build
npm run start
```

## Page par kya hai

- **Tiles:** All, Email, Phone, WhatsApp aur Telegram ki ginti. Kisi tile par click karo to sirf wahi type dikhega.
- **Search:** email, number ya username ka koi bhi hissa likho.
- **Open:** email → mail app, phone → call, WhatsApp number → `wa.me`, Telegram username → `t.me`.
- **Copy:** value clipboard mein copy ho jaati hai.

## Setup (pehle se ho chuka hai)

- `.env` mein `DATABASE_URL` hai, wahi jo `linkedin-2/.env` mein hai. Password badlo to dono jagah badalna.
- `.env` git mein nahi jaati (`.gitignore` mein `.env*` hai).
- Prisma client `npm install` ke baad apne aap banta hai (`postinstall: prisma generate`). Haath se banana ho to: `npx prisma generate`.

## Files

| File | Kaam |
|---|---|
| `prisma/schema.prisma` | `contacts` table ka model (`type`, `value`) |
| `prisma.config.ts` | Prisma CLI ke liye database URL (`.env` se) |
| `src/lib/prisma.ts` | Database connection (sirf server par) |
| `src/app/page.tsx` | Database se contacts padhta hai |
| `src/app/contacts-table.tsx` | Tiles, search aur table |
| `src/app/error.tsx` | Database band ho to message |

## Agar page par error aaye

"Data load nahi ho paya" dikhe to:
- PostgreSQL service chal rahi hai ya nahi, check karo.
- `.env` ka `DATABASE_URL` sahi hai ya nahi, check karo.
