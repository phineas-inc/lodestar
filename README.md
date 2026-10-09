# Lodestar: GNSS flight-readiness briefing

Pick a place and see, for the next 6 hours, whether GNSS is likely to be reliable there for a drone flight.
It combines five live checks: interference reported by nearby aircraft, predicted satellite geometry,
space weather, flight weather, and recent incident reports.

There is no server to run. A GitHub Action crawls the public sources every 10 minutes, writes static JSON,
and publishes the site to GitHub Pages.

## Put it online (about 5 minutes)

1. Create a GitHub repository and push this folder to it (the folder with `package.json` is the repo root).
2. Repo **Settings → Pages → Source: GitHub Actions**.
3. Open the **Actions** tab, pick **Lodestar live data + deploy**, click **Run workflow**.
4. Your site appears at `https://<you>.github.io/<repo>/` and refreshes itself every ~10 minutes.
5. Optional, for AI-labelled incident reports: **Settings → Secrets and variables → Actions → New secret**
   named `ANTHROPIC_API_KEY`. Without it, reports are listed as unlocated headlines.

## Run locally

```bash
npm install
node scripts/collect.mjs     # crawl once (about 3 minutes); writes public/data/*.json
npm run dev
```

## Where the data comes from

| Check | Source | How |
|---|---|---|
| Interference | [adsb.lol](https://adsb.lol) aircraft NACp | collector, 1° cells, rolling 4 h |
| Satellite geometry | [CelesTrak](https://celestrak.org) orbital elements | collector + SGP4 in the browser |
| Space weather | [NOAA SWPC](https://www.swpc.noaa.gov) | browser, live |
| Flight weather | [Open-Meteo](https://open-meteo.com) | browser, live |
| Incident reports | [GDELT](https://www.gdeltproject.org) news, optionally labelled by Claude | collector |

Monitored area is set by `COVERAGE` in `scripts/collect.mjs` (default: Europe, Middle East, Caucasus).
Thresholds live in `src/lodestar/readiness.ts`; they are heuristics, not validated limits.

## Limits

- Interference is inferred from aircraft, so it needs air traffic and ADS-B receivers nearby.
- Degraded GNSS is not proof of jamming or spoofing.
- Decision aid only. Follow local aviation rules and your aircraft's manual.
