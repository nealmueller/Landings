# Landings

Landing coverage for ForeFlight logbooks across US public airports.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Quality checks

```bash
npm run check
```

This runs lint, tests, and production build locally. The same checks run in CI on GitHub Actions.

## Privacy model

- All parsing and matching runs in your browser.
- No server-side uploads, accounts, analytics, or tracking.
- The logbook never leaves your device.

## Local persistence

- The last imported ForeFlight CSV is stored in IndexedDB when available, with a localStorage fallback.
- Dot size is stored in localStorage.
- Use the “Clear local data” button in the Import ForeFlight CSV panel to remove the saved logbook and settings.

## Data sources

- FAA NASR APT_BASE (US public airports) -> `data/us/facilities_master.csv`
- Raw source inputs live under `data/raw`

### Rebuild the master list

```bash
npm run build:data
```

Dataset build output is written to:

- `data/us/facilities_master.csv`
- `public/data/us/facilities_master.csv`
- `data/us/sources.json`
- `public/data/us/sources.json`

To refresh data for a new FAA cycle:

1. Download the FAA NASR APT CSV ZIP and place it under `data/raw`.
2. Name it `faa_nasr_YYYY-MM-DD_APT_CSV.zip`.
3. Run `npm run build:data`.

## Deployment

This is a Next.js app deployed on Vercel.

- No env vars required
- Client-side only parsing, no file uploads to server

### Option A: Vercel CLI (recommended)

```bash
npm i -g vercel
vercel login
vercel
```

Follow prompts:
- Framework: Next.js
- Build command: `next build`
- Output: default

For production:

```bash
vercel --prod
```

### Option B: GitHub import (even simpler)

1. Push this repo to GitHub.
2. In Vercel: New Project -> Import Git Repository -> Deploy.
3. Every push to `main` auto-deploys.
