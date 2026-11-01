# MarAIne

Sea safety, catch records and coastal care for Marinduque, Philippines.

The project has three parts that share one Supabase backend:

| Part | Folder | Who uses it | Runs on |
|---|---|---|---|
| **Mobile app** (Expo / React Native) | `onboarding/` | Fisherfolk, seaweed farmers, Bantay Dagat, tourists, community members | Phone (Expo Go) or browser, port **8082** |
| **Admin dashboard** (Next.js) | repository root | MAO, LGU and BFAR staff | Browser, port **3000** |
| **Backend** (Supabase) | `supabase/` | Both apps | Supabase cloud |

> **SAMPLE DATA.** The seed (`supabase/migrations/004_seed.sql`) uses real Marinduque places and species, but the
> people, boats, licenses, zone outlines, catches and reports are fictional. Zone outlines are not official ordinances.

## Quick start (Supabase is already set up)

Use this when the Supabase project exists and you have both `.env.local` files (root and `onboarding/`).
You need **Node.js 20 or newer**. Open **two terminals**, one for each app.

**Terminal 1: admin dashboard**

```powershell
cd C:\path\to\MarAIne
npm install
npm run dev
```

Open http://localhost:3000/admin and sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env.local`.

**Terminal 2: mobile app**

```powershell
cd C:\path\to\MarAIne\onboarding
npm install
npx expo start --web --port 8082
```

- **In a browser:** open http://localhost:8082.
- **On a phone:** install **Expo Go**, join the same Wi-Fi as the computer, and scan the QR code in the terminal.

Always run Expo commands **inside `onboarding/`**. The root folder is the Next.js project, so Expo fails there.

### Test logins

The root `.env.local` holds up to five test accounts. Each one must exist in Supabase > Authentication > Users.

| Variables | Use them for |
|---|---|
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Admin dashboard at `/admin` |
| `FISHER_EMAIL` / `FISHER_PASSWORD` | Mobile app as a fisher |
| `PIC_EMAIL` / `PIC_PASSWORD` | Mobile app as a PIC (records catches for others) |
| `TOURIST_EMAIL` / `TOURIST_PASSWORD` | Mobile app; choose **Tourist / Visitor** during setup |
| `BANTAY_EMAIL` / `BANTAY_PASSWORD` | Mobile app; choose **Bantay Dagat** during setup |

To add a test account: Supabase > Authentication > Users > **Add user**, tick **Auto Confirm User**, then set its
role in the SQL Editor (step 4 of the full setup). Do not create users by inserting into `auth.users` from the SQL
Editor: Supabase blocks writes to `auth.identities`. Re-running `004_seed.sql` removes the sample fisher and PIC.

### Using the mobile app

1. **Welcome**, then **Get started**.
2. **Choose your language**: English or Tagalog. The whole app follows it. Change it later in **More**.
3. Read the short slides, then type a **nickname**. Home greets you with it.
4. **Choose a role.** Each role gets its own five tabs. A **Tourist** gets the Discover map and the Gallery.
5. **Choose a town**, allow location and alerts if you want them, then sign in or skip.

The round **chat button** opens the MarAIne assistant. Drag it to move it.

## Common problems

| What you see | Cause | Fix |
|---|---|---|
| Admin pages have no styling (plain text, blue links) | `npm run build` ran while `npm run dev` was running and overwrote `.next` | Stop the dev server, delete the `.next` folder, run `npm run dev` again |
| `expo start` fails | It was started in the root folder | `cd onboarding` first |
| "Port 8082 is in use" | An old Expo server is still running | Close its terminal, or find it with `Get-NetTCPConnection -LocalPort 8082` and run `Stop-Process -Id <id>` |
| A phone cannot open the app | `localhost` only works on this computer | Use this computer's Wi-Fi IP (from `ipconfig`) and allow Node.js through the Windows firewall on private networks |
| Old screens still show | The browser cached the old bundle | Hard refresh: Ctrl + Shift + R |
| "Invalid login credentials" | The account does not exist or is not confirmed | Check Supabase > Authentication > Users |
| "Email rate limit exceeded" on sign up | Supabase sends only a few confirmation emails per hour | Wait, or add the user in the Dashboard with **Auto Confirm User** |
| Chat replies are marked "Quick answer from the app" | The `sea-guide` AI function is not deployed | See "AI chat assistant" below. The built-in answers work until then |

## Full setup (new Supabase project, about 15 minutes)

### 1. Create a Supabase project
[supabase.com/dashboard](https://supabase.com/dashboard) > New project. Region: Southeast Asia (Singapore).
Save the database password.

### 2. Run the migrations, in order

| Order | File | What it does |
|---|---|---|
| 1 | `001_schema.sql` | PostGIS, enums, tables, indexes |
| 2 | `002_functions_triggers.sql` | Catch checking trigger, QR tokens, role helpers, GeoJSON views |
| 3 | `003_rls.sql` | Row Level Security, public QR trace, storage buckets |
| 4 | `004_seed.sql` | SAMPLE DATA (safe to re-run) |
| 5 | `005_analytics.sql` | `overview_stats()` for the dashboard Overview |
| 6 | `006_sms.sql` | `ingest_sms_catch()` for SMS logging, private settings schema |
| 7 | `007_anomalies.sql` | `anomaly_review()`: evidence behind each AI-assisted check |
| 8 | `008_offline_recorded_at.sql` | `catches.recorded_at`, so logs saved offline are not treated as late |
| 9 | `009_onboarding.sql` | `onboarded_at`, preferred language and requested role on profiles |
| 10 | `010_visitor_capacity.sql` | Visitor capacity, time limit, hours and fees per coastal site; tourist check-in (all limits start empty) |

**Option A: SQL Editor (simplest).** Dashboard > SQL Editor > New query. Paste the whole of each file, click
**Run**, wait for "Success", then do the next file.

**Option B: Supabase CLI** (installed as a dev dependency):

```powershell
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push
```

`<project-ref>` is the `xxxx` in `https://xxxx.supabase.co`.

> Before using a real production database, delete `004_seed.sql` (or run it once in the SQL Editor instead).

### 3. Verify
Paste `supabase/verify.sql` into the SQL Editor and run it. Each block lists what you should see, including:

- 30 fishers, 2 PIC, 20 boats, 4 zones, 10 species, 159 catches, 8 reports, 6 gallery items
- All four catch statuses present (the exact split shifts with today's date, because closed seasons and
  license expiry depend on it)
- RLS is `true` on all 8 tables; 3 storage buckets exist

### 4. Create the admin user
1. Dashboard > Authentication > Users > **Add user** > Create new user. Enter an email and a password and tick
   **Auto Confirm User**.
2. In the SQL Editor:

```sql
update public.profiles
   set role = 'admin', full_name = 'MAO Admin', municipality = 'Boac'
 where id = (select id from auth.users where email = 'you@example.com');
```

Every new sign-up starts as `fisher`. Only this SQL (or another admin) can grant `admin` or `pic`.

### 5. Admin dashboard environment
```powershell
Copy-Item .env.example .env.local
```
Fill in the URL and publishable key from Dashboard > Project Settings > API Keys. The dashboard never needs the
`sb_secret_...` key.

**SMS webhook:** put a long random value in `SMS_WEBHOOK_SECRET`
(`node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"`), then store its hash once:

```sql
insert into private.settings (key, value)
values ('sms_webhook_secret_hash', extensions.crypt('<same secret>', extensions.gen_salt('bf')))
on conflict (key) do update set value = excluded.value;
```

### 6. Mobile app environment
```powershell
cd onboarding
Copy-Item .env.example .env.local
```

| Variable | Value |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Same as `NEXT_PUBLIC_SUPABASE_URL` |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Same as `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
| `EXPO_PUBLIC_SITE_URL` | Address of the admin web app (optional) |
| `EXPO_PUBLIC_SAMPLE_DATA` | `true` while the database holds the seed |

Everything in this file is bundled into the app, so it holds public values only.

### 7. AI chat assistant (optional)
The chat calls the Supabase Edge Function `supabase/functions/sea-guide`, which uses the Claude API. Without it,
the app answers common questions from built-in text.

```powershell
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase secrets set ANTHROPIC_API_KEY=<your key>
npx supabase functions deploy sea-guide --no-verify-jwt
```

The Anthropic key stays on Supabase as a secret. Never put it in an `EXPO_PUBLIC_` variable.

### 8. Generate types (only after changing the SQL)
```powershell
npx supabase gen types typescript --project-id <project-ref> --schema public > lib/database.types.ts
```

### 9. Run
See the quick start at the top.

## Quality checks

```powershell
# admin dashboard (stop npm run dev first: build overwrites .next)
npm run lint
npm run build

# mobile app
cd onboarding
npm run typecheck
npm run lint
```

## Mobile app notes
- **Offline first.** Catches, reports and farm records save on the phone and send when there is signal. The phone
  sends `recorded_at` (migration 008), so a catch saved on time but sent days later is not a late entry.
- **Weather and sea data** come from Open-Meteo; no key is needed. For storm warnings, people should follow PAGASA.
- **Maps** use OpenStreetMap tiles, limited to Marinduque. The tourist map uses NAMRIA/PSA town boundaries
  (via OCHA, CC BY-IGO) and pins for coastal places only.
- **Language.** Tagalog text lives in `onboarding/src/i18n/fil.ts`, keyed by the English text.
- **Photos.** Place photos are in `onboarding/assets/places` and `onboarding/assets/gallery`, each with a credit.
  Get the owner's permission before publishing a photo you did not take.

## How catch checking works

A database trigger (`evaluate_catch` in `002_functions_triggers.sql`) runs on every insert, whether the catch comes
from the app, SMS or a PIC. It cannot be bypassed from the client.

| Rule | Flag code | Result |
|---|---|---|
| Inside an active restricted zone | `restricted_zone` | flagged for review |
| Inside an active marine sanctuary | `sanctuary` | flagged for review |
| License expired before the catch date | `license_expired` | flagged for review |
| No license on record | `license_missing` | flagged for review |
| Species in its yearly closed season | `closed_season` | flagged for review |
| Below minimum legal size | `undersized` | flagged for review |
| Logged > 48 h late **with no reason** | `late_entry` | flagged for review |
| AI-assisted (rule-based): > 100 kg per gross ton of the boat | `anomaly_large_catch` | flagged for review |
| AI-assisted (rule-based): 3rd+ log within 300 m of a protected boundary in 14 days | `anomaly_near_boundary` | flagged for review |
| Inside a pollution zone | none | `zone_status = pollution` (an advisory, not a flag) |

The **AI-assisted checks** page (`/admin/anomalies`) shows the numbers behind each pattern, for example
"260 kg on a 2.2 GT boat = 118.2 kg per ton (limit 100)". These are published rules, not machine learning, and they
only put a log up for review. Thresholds live in `evaluate_catch()` (002), `anomaly_review()` (007) and
`lib/anomalies/rules.ts`; change all three together.

No flags and a location gives `verified`. No flags but no location (an SMS log) gives `pending`.

## Biodiversity trend rule

Defined in `lib/analytics/biodiversity.ts` and shown in the map legend.

1. Waters are split into grid cells of 0.05 degrees (about 5.5 km).
2. Per cell, logged catch per day in the last N days (30 or 14) is compared with the N days before.
3. **Abundant:** change of -15% or better. **Declining:** -15% to -40%. **Critical:** worse than -40%.
4. **Not enough data:** fewer than 3 logs across both periods, or nothing logged in the earlier period.

It measures logged catch, not catch per trip, so fewer people using the app also looks like a decline. It is an
early signal to check on the ground, not a stock assessment.

## Privacy
- Exact coordinates are only returned to admins and to the fisher who logged them.
- The mobile app uses only the publishable key. Secrets live in `.env.local` (never committed) or as Supabase secrets.

## Project layout
```
app/, components/, lib/   admin dashboard, SMS webhook (Next.js)
middleware.ts             session refresh and the /admin role guard
onboarding/               mobile app (Expo)
  app/                    screens: (onboarding) setup flow, (main) tabs, login
  src/components/         shared UI, map, chat, weather scene
  src/i18n/fil.ts         Tagalog text
supabase/migrations/      numbered SQL, run in order
supabase/functions/       sea-guide Edge Function (AI chat)
supabase/verify.sql       checks to run after migrating
```

## 3-minute demo script

1. **Flag a catch.** Open the SMS Simulator and log a Tulingan catch at 13.565, 122.060, inside the Santa Cruz
   north spawning area.
2. **See it flagged.** Catches > filter Flagged. The row reads "Logged inside a restricted area", for review.
   Mark it Reviewed with a note.
3. **Hotspot map.** The Santa Cruz spawning area tops the ranked list.
4. **Report queue.** Open the Gaspar Island report, move it to Investigating, add a note.
