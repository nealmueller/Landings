# Landings

Landing coverage for ForeFlight logbooks. Beta version only includes California.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Privacy model

- All parsing and matching runs in your browser.
- No server-side uploads, accounts, analytics, or tracking.
- The logbook never leaves your device.

## Data sources

- FAA NASR APT_BASE (CA public airports only) -> `data/ca/facilities_master.csv`
- Raw source inputs live under `data/raw`

### Rebuild the master list

```bash
node scripts/build-datasets.js
```

## Adding more states later

1. Add a new CSV under `data/<state>/Public_Airport.csv` with the same header columns.
2. Copy it to `public/data/<state>/Public_Airport.csv` so the browser can fetch it.
3. Update the UI to load and label the new state.

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
