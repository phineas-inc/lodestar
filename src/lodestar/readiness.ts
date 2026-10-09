import { computeDops } from "../gnss/nmea";
import { visibleSats, type SkyModel } from "../gnss/sky";
import type { Cells, Incidents, KpPoint, WxHour } from "./feeds";

export type Level = "clear" | "caution" | "nogo" | "unknown";
export interface Factor {
  id: "interference" | "geometry" | "space" | "weather" | "reports";
  title: string;
  level: Level;
  headline: string;
  detail: string;
}

export const distKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
};

export const MIN_SAMPLE = 8;
export const win = (c: { windowMin: number }) => (c.windowMin < 5 ? "latest snapshot" : `last ${c.windowMin} min`);
const rank: Record<Level, number> = { clear: 0, unknown: 0, caution: 1, nogo: 2 };
const worst = (...l: Level[]): Level => l.reduce((a, b) => (rank[b] > rank[a] ? b : a), "clear" as Level);

// ---------- interference ----------
export function interferenceFactor(c: Cells | null, lat: number, lon: number): Factor & { pct: number | null } {
  const base = { id: "interference" as const, title: "Interference near you", pct: null as number | null };
  if (!c) return { ...base, level: "unknown", headline: "No data yet", detail: "The collector has not published aircraft data." };
  const inCov = c.coverage.some((b) => lat >= b.latMin && lat <= b.latMax && lon >= b.lonMin && lon <= b.lonMax);
  if (!inCov) return { ...base, level: "unknown", headline: "Outside monitored area", detail: `Interference is only measured over: ${c.coverage.map((b) => b.name).join(", ")}. Not monitored here does not mean safe.` };
  let n = 0, bad = 0, rn = 0, rbad = 0;
  for (const k of c.cells) {
    if (distKm(lat, lon, k.lat + 0.5, k.lon + 0.5) <= 150) { n += k.n; bad += k.bad; rn += k.rn; rbad += k.rbad; }
  }
  let nearSevere: number | null = null;
  for (const k of c.cells) {
    if (k.n >= MIN_SAMPLE && k.pct >= 20) {
      const d = distKm(lat, lon, k.lat + 0.5, k.lon + 0.5);
      if (nearSevere === null || d < nearSevere) nearSevere = d;
    }
  }
  if (n < MIN_SAMPLE) return { ...base, level: "unknown", headline: "Too little air traffic", detail: `Only ${n} aircraft reports within 150 km (${win(c)}), so the result would be unreliable.${nearSevere !== null ? ` Nearest severe area is ${nearSevere.toFixed(0)} km away.` : ""}` };
  const pct = (100 * bad) / n;
  const recentPct = rn >= 3 ? (100 * rbad) / rn : null;
  const trend = recentPct === null ? "" : recentPct > pct + 5 ? " Getting worse." : recentPct < pct - 5 ? " Easing." : "";
  let level: Level = pct >= 20 ? "nogo" : pct >= 5 ? "caution" : "clear";
  if (level === "clear" && nearSevere !== null && nearSevere < 250) level = "caution";
  return {
    ...base, pct, level,
    headline: `${pct.toFixed(0)}% of aircraft degraded`,
    detail: `${bad} of ${n} aircraft reports within 150 km (${win(c)}) show degraded GNSS accuracy.${trend}${nearSevere !== null ? ` Nearest severe area: ${nearSevere.toFixed(0)} km.` : ""}`,
  };
}

// ---------- satellite geometry ----------
export interface GeoPoint { t: number; n: number; pdop: number | null }
export function geometrySeries(model: SkyModel | null, lat: number, lon: number, hours = 6): GeoPoint[] {
  if (!model) return [];
  const out: GeoPoint[] = [];
  const t0 = Date.now();
  for (let m = 0; m <= hours * 60; m += 15) {
    const when = new Date(t0 + m * 60000);
    const sats = visibleSats(model, { lat, lon, altM: 0 }, when, 10, 10).filter((s) => s.used);
    const d = computeDops(sats.map((s) => ({ el: s.el!, az: s.az!, sys: s.sys })));
    out.push({ t: when.getTime(), n: sats.length, pdop: d?.pdop ?? null });
  }
  return out;
}
export function geometryFactor(series: GeoPoint[]): Factor {
  const base = { id: "geometry" as const, title: "Satellite geometry" };
  if (!series.length) return { ...base, level: "unknown", headline: "No orbital data", detail: "Orbital elements have not been published yet." };
  const worstP = Math.max(...series.map((p) => p.pdop ?? 99));
  const minN = Math.min(...series.map((p) => p.n));
  const level: Level = worstP > 6 || minN < 6 ? "nogo" : worstP > 4 || minN < 10 ? "caution" : "clear";
  return {
    ...base, level,
    headline: `PDOP ≤ ${worstP.toFixed(1)}, ≥ ${minN} satellites`,
    detail: `Predicted worst case over the next 6 h with a 10° mask, all four constellations. It assumes open sky: buildings, hills and tree cover make real geometry worse.`,
  };
}

// ---------- space weather ----------
export function spaceFactor(kp: KpPoint[] | null, xray: { flux: number } | null, lat: number): Factor {
  const base = { id: "space" as const, title: "Space weather" };
  if (!kp) return { ...base, level: "unknown", headline: "No data", detail: "NOAA SWPC could not be reached." };
  const now = Date.now();
  const win = kp.filter((p) => p.t + 3 * 3600e3 > now && p.t < now + 6 * 3600e3);
  const maxKp = win.length ? Math.max(...win.map((p) => p.kp)) : 0;
  const flux = xray?.flux ?? 0;
  const flare = flux >= 1e-4 ? "X" : flux >= 1e-5 ? "M" : null;
  let level: Level = "clear";
  if (maxKp >= 7 || flare === "X") level = "nogo";
  else if (maxKp >= 5 || flare === "M" || (Math.abs(lat) >= 55 && maxKp >= 4)) level = "caution";
  return {
    ...base, level,
    headline: `Kp up to ${maxKp.toFixed(0)}${flare ? `, ${flare}-class flare` : ""}`,
    detail: `Geomagnetic activity disturbs the ionosphere, which degrades or interrupts GNSS, most at high latitudes. Max Kp in the next 6 h, plus the strongest X-ray flare in the last hour.`,
  };
}

// ---------- weather ----------
export function weatherFactor(wx: WxHour[] | null): Factor {
  const base = { id: "weather" as const, title: "Flight weather" };
  if (!wx) return { ...base, level: "unknown", headline: "No data", detail: "Open-Meteo could not be reached." };
  const h = wx.filter((x) => x.t > Date.now() - 3600e3).slice(0, 7);
  const gust = Math.max(...h.map((x) => x.gust));
  const vis = Math.min(...h.map((x) => x.vis));
  const rain = Math.max(...h.map((x) => x.precip));
  let level: Level = "clear";
  if (gust > 14 || vis < 1000 || rain > 2) level = "nogo";
  else if (gust > 10 || vis < 3000 || rain > 0.5) level = "caution";
  return {
    ...base, level,
    headline: `Gusts ${gust.toFixed(0)} m/s · vis ${(vis / 1000).toFixed(0)} km`,
    detail: `Next 6 h: gusts to ${gust.toFixed(1)} m/s, visibility down to ${(vis / 1000).toFixed(1)} km, rain up to ${rain.toFixed(1)} mm/h. Generic small-drone limits: check your aircraft's own.`,
  };
}

// ---------- incident reports ----------
export function reportsFactor(inc: Incidents | null, lat: number, lon: number): Factor & { near: Incidents["items"] } {
  const base = { id: "reports" as const, title: "Incident reports", near: [] as Incidents["items"] };
  if (!inc) return { ...base, level: "unknown", headline: "No data", detail: "News crawl has not been published yet." };
  if (!inc.ai) return { ...base, level: "unknown", headline: `${inc.items.length} headlines, not located`, detail: "Without an AI key the collector cannot tell where an incident happened, so reports are listed but not matched to your location." };
  const near = inc.items.filter((x) => typeof x.lat === "number" && typeof x.lon === "number" && distKm(lat, lon, x.lat!, x.lon!) <= 400);
  const sev = Math.max(0, ...near.map((x) => x.severity ?? 1));
  const level: Level = sev >= 2 ? "caution" : "clear";
  return { ...base, near, level, headline: near.length ? `${near.length} report(s) within 400 km` : "None nearby", detail: "News reports from the last 3 days, filtered and located by AI. Unverified, so they raise caution but never block on their own." };
}

export const overall = (f: Factor[]): Level => worst(...f.map((x) => x.level));

export function guidance(f: Factor[]): string[] {
  const by = Object.fromEntries(f.map((x) => [x.id, x.level])) as Record<Factor["id"], Level>;
  const g: string[] = [];
  if (by.interference !== "clear" && by.interference !== "unknown")
    g.push("Assume GNSS can be wrong or lost. Know how your drone behaves without it (attitude or manual mode) and be ready to take over.");
  if (by.interference === "nogo" || by.reports === "caution")
    g.push("Do not rely on GNSS-based return-to-home. Set a conservative home point and brief a manual or visual recovery.");
  if (by.interference !== "clear") g.push("Watch satellite count, HDOP and position drift on the ground before takeoff. A fix that jumps while you are stationary is a warning.");
  if (by.geometry !== "clear" && by.geometry !== "unknown") g.push("Delay the flight to a time with better geometry (see the timeline), or move to open sky.");
  if (by.space === "caution" || by.space === "nogo") g.push("Expect slower fixes and larger position errors, especially at high latitude. Avoid precision tasks until Kp drops.");
  if (by.weather !== "clear" && by.weather !== "unknown") g.push("Weather is marginal. Wind makes recovery from a GNSS loss harder.");
  if (!g.length) g.push("No active warnings. Still check satellite count and HDOP before takeoff and keep visual line of sight.");
  return g;
}
