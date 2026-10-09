// Live feeds. Collector files are same-origin static JSON; NOAA, Open-Meteo and geocoding allow browser (CORS) access.
const bust = (mins: number) => Math.floor(Date.now() / (mins * 60000));

async function json<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export interface Cell { lat: number; lon: number; n: number; bad: number; pct: number; rn: number; rbad: number }
export interface Cells {
  generatedAt: number; windowMin: number; snapshots: number; aircraft: number; polled: number; failed: number;
  degradedBelow: number; coverage: { name: string; latMin: number; latMax: number; lonMin: number; lonMax: number }[]; cells: Cell[];
}
export interface Incident {
  title: string; url: string; domain: string; country?: string; seen?: string;
  kind?: string; place?: string | null; lat?: number | null; lon?: number | null; severity?: number; summary?: string;
}
export interface Incidents { generatedAt: number; ai: boolean; count: number; items: Incident[] }

export const loadCells = () => json<Cells>(`data/cells.json?t=${bust(3)}`);
export const loadIncidents = () => json<Incidents>(`data/incidents.json?t=${bust(3)}`);

export interface KpPoint { t: number; kp: number; observed: boolean }
export async function loadKp(): Promise<KpPoint[]> {
  const j = await json<{ time_tag: string; kp: number; observed: string }[]>("https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json");
  return j.map((x) => ({ t: Date.parse(x.time_tag + "Z"), kp: x.kp, observed: x.observed === "observed" }));
}

export async function loadXray(): Promise<{ flux: number; t: number } | null> {
  const j = await json<{ time_tag: string; flux: number; energy: string }[]>("https://services.swpc.noaa.gov/json/goes/primary/xrays-6-hour.json");
  const last = j.filter((x) => x.energy === "0.1-0.8nm").slice(-60); // last hour
  if (!last.length) return null;
  const max = last.reduce((a, b) => (b.flux > a.flux ? b : a));
  return { flux: max.flux, t: Date.parse(max.time_tag) };
}

export interface WxHour { t: number; gust: number; vis: number; precip: number }
export async function loadWeather(lat: number, lon: number): Promise<WxHour[]> {
  const j = await json<any>(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=wind_gusts_10m,visibility,precipitation&wind_speed_unit=ms&forecast_hours=8&timezone=UTC`);
  const h = j.hourly;
  return h.time.map((t: string, i: number) => ({ t: Date.parse(t + "Z"), gust: h.wind_gusts_10m[i], vis: h.visibility[i], precip: h.precipitation[i] }));
}

export interface Place { name: string; lat: number; lon: number; country?: string }
export async function geocode(q: string): Promise<Place[]> {
  const j = await json<any>(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6`);
  return (j.results ?? []).map((r: any) => ({ name: [r.name, r.admin1].filter(Boolean).join(", "), lat: r.latitude, lon: r.longitude, country: r.country }));
}
