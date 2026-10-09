import React, { useEffect, useRef, useState } from "react";
import { Search, LocateFixed, MapPin } from "lucide-react";
import { useLodestar } from "../../lodestar/LodestarContext";
import { geocode, type Place } from "../../lodestar/feeds";
import type { Factor, GeoPoint, Level } from "../../lodestar/readiness";
import { cn } from "../components/ui";

export const COLOR: Record<Level, string> = { clear: "var(--clear)", caution: "var(--caution)", nogo: "var(--nogo)", unknown: "var(--unknown)" };
const VERDICT: Record<Level, { word: string; sub: string }> = {
  clear: { word: "Clear", sub: "No active GNSS warnings for this location" },
  caution: { word: "Caution", sub: "GNSS may be degraded: read the reasons below" },
  nogo: { word: "No-go", sub: "GNSS is likely unreliable here right now" },
  unknown: { word: "Unknown", sub: "Not enough data to judge" },
};
const CHIP: Record<Level, string> = { clear: "Clear", caution: "Caution", nogo: "No-go", unknown: "No data" };

const PRESETS: Place[] = [
  { name: "Gdańsk", lat: 54.352, lon: 18.646 },
  { name: "Kyiv", lat: 50.4547, lon: 30.5238 },
  { name: "Istanbul", lat: 41.0082, lon: 28.9784 },
  { name: "Beirut", lat: 33.8938, lon: 35.5018 },
  { name: "Dubai", lat: 25.2048, lon: 55.2708 },
  { name: "Munich", lat: 48.1351, lon: 11.582 },
];

function LocationBar() {
  const { loc, setLoc } = useLodestar();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Place[]>([]);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (q.trim().length < 2) return setRes([]);
      setBusy(true);
      try { setRes(await geocode(q.trim())); } catch { setRes([]); }
      setBusy(false);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setRes([]); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const pick = (p: Place) => { setLoc({ name: p.name, lat: p.lat, lon: p.lon }); setQ(""); setRes([]); };
  const here = () => navigator.geolocation?.getCurrentPosition((p) => setLoc({ name: "My location", lat: +p.coords.latitude.toFixed(4), lon: +p.coords.longitude.toFixed(4) }));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2 items-center" ref={box}>
        <div className="relative flex-1 max-w-[460px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--faint)]" />
          <input
            value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a city or place"
            className="w-full h-10 pl-9 pr-3 rounded-xl bg-[var(--panel)] border border-[var(--line)] text-sm outline-none focus:border-[var(--accent)] placeholder:text-[var(--faint)]"
          />
          {(res.length > 0 || busy) && (
            <div className="absolute left-0 right-0 top-11 panel p-1 z-50 shadow-2xl">
              {busy && <div className="px-3 py-2 text-xs text-[var(--muted)]">Searching…</div>}
              {res.map((p, i) => (
                <button key={i} onClick={() => pick(p)} className="w-full text-left px-3 py-2 rounded-lg hover:bg-[var(--panel-2)] text-sm">
                  {p.name} <span className="text-[var(--muted)]">{p.country}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button onClick={here} title="Use my location" className="h-10 px-3 rounded-xl border border-[var(--line)] bg-[var(--panel)] text-[var(--muted)] hover:text-[var(--text)] flex items-center gap-2 text-sm">
          <LocateFixed className="w-4 h-4" /><span className="hidden sm:inline">Use my location</span>
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5 items-center">
        <span className="eyebrow mr-1">Try</span>
        {PRESETS.map((p) => (
          <button key={p.name} onClick={() => pick(p)} className={cn("px-2.5 h-7 rounded-full text-xs border", loc.name.startsWith(p.name) ? "border-[var(--accent)] text-[var(--text)]" : "border-[var(--line)] text-[var(--muted)] hover:text-[var(--text)]")}>
            {p.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function FactorCard({ f }: { f: Factor }) {
  return (
    <div className="panel p-4 flex flex-col gap-2" style={{ borderTopColor: COLOR[f.level], borderTopWidth: 2 }}>
      <div className="flex items-center justify-between gap-2">
        <span className="eyebrow">{f.title}</span>
        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ color: COLOR[f.level], background: `color-mix(in srgb, ${COLOR[f.level]} 14%, transparent)` }}>{CHIP[f.level]}</span>
      </div>
      <div className="text-[17px] font-semibold leading-snug num">{f.headline}</div>
      <p className="text-[12.5px] leading-relaxed text-[var(--muted)]">{f.detail}</p>
    </div>
  );
}

/** One 6-hour strip: line or bars, with optional threshold lines. */
function Strip({ title, unit, pts, max, warn, bad, kind = "line", fmt = (v: number) => v.toFixed(1) }: {
  title: string; unit: string; pts: { t: number; v: number | null }[]; max: number; warn: number; bad: number; kind?: "line" | "bar"; fmt?: (v: number) => string;
}) {
  const W = 600, H = 70;
  const t0 = pts[0]?.t ?? 0, t1 = pts[pts.length - 1]?.t ?? 1;
  const x = (t: number) => ((t - t0) / (t1 - t0 || 1)) * W;
  const y = (v: number) => H - 6 - (Math.min(v, max) / max) * (H - 12);
  const vals = pts.map((p) => p.v).filter((v): v is number => v !== null);
  const peak = vals.length ? Math.max(...vals) : null;
  const col = peak === null ? "var(--unknown)" : peak >= bad ? "var(--nogo)" : peak >= warn ? "var(--caution)" : "var(--clear)";
  return (
    <div className="panel p-4">
      <div className="flex items-baseline justify-between mb-2">
        <span className="eyebrow">{title}</span>
        <span className="text-xs text-[var(--muted)] num">peak <b style={{ color: col }}>{peak === null ? "—" : fmt(peak)}</b> {unit}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[70px]" preserveAspectRatio="none">
        {[warn, bad].map((v, i) => v < max && <line key={i} x1="0" x2={W} y1={y(v)} y2={y(v)} stroke={i ? "var(--nogo)" : "var(--caution)"} strokeOpacity=".35" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />)}
        {kind === "line" ? (
          <polyline fill="none" stroke={col} strokeWidth="2" vectorEffect="non-scaling-stroke" points={pts.filter((p) => p.v !== null).map((p) => `${x(p.t)},${y(p.v!)}`).join(" ")} />
        ) : pts.map((p, i) => p.v !== null && <rect key={i} x={x(p.t) - 6} width="12" y={y(p.v)} height={H - 6 - y(p.v)} fill={p.v >= bad ? "var(--nogo)" : p.v >= warn ? "var(--caution)" : "var(--accent)"} opacity=".8" />)}
      </svg>
      <div className="flex justify-between text-[10px] text-[var(--faint)] num mt-1">
        <span>now</span><span>+2 h</span><span>+4 h</span><span>+6 h</span>
      </div>
    </div>
  );
}

export function Briefing() {
  const { loc, verdict, factors, series, tips, kp, wx, cells } = useLodestar();
  const v = VERDICT[verdict];
  const clearN = factors.filter((f) => f.level === "clear").length;
  const noData = factors.filter((f) => f.level === "unknown").length;

  const horizon = Date.now() + 6 * 3600e3;
  const kpPts = (kp.data ?? []).filter((p) => p.t < horizon && p.t > Date.now() - 3 * 3600e3).map((p) => ({ t: p.t, v: p.kp }));
  const gustPts = (wx.data ?? []).slice(0, 7).map((p) => ({ t: p.t, v: p.gust }));

  return (
    <div className="space-y-6">
      <LocationBar />

      <section className="panel p-5 md:p-7 flex flex-col md:flex-row md:items-center gap-5 md:gap-10" style={{ borderLeft: `4px solid ${COLOR[verdict]}` }}>
        <div>
          <div className="eyebrow flex items-center gap-1.5"><MapPin className="w-3 h-3" />{loc.name} · next 6 hours</div>
          <div className="text-5xl md:text-6xl font-semibold tracking-tight mt-2" style={{ color: COLOR[verdict] }}>{v.word}</div>
          <div className="text-[var(--muted)] mt-2 text-[15px]">{v.sub}</div>
        </div>
        <div className="md:ml-auto text-sm text-[var(--muted)] md:text-right space-y-1">
          <div><b className="text-[var(--text)] num">{clearN}</b> of {factors.length} checks clear{noData ? `, ${noData} without data` : ""}</div>
          {cells.data && <div className="text-xs">Based on {cells.data.aircraft.toLocaleString()} aircraft and {cells.data.windowMin < 5 ? "the latest snapshot" : `${cells.data.windowMin} min of history`}</div>}
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        {factors.map((f) => <FactorCard key={f.id} f={f} />)}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Strip title="Satellite geometry (PDOP)" unit="" pts={series.map((p: GeoPoint) => ({ t: p.t, v: p.pdop }))} max={8} warn={4} bad={6} />
        <Strip title="Geomagnetic activity (Kp)" unit="" kind="bar" pts={kpPts} max={9} warn={5} bad={7} fmt={(v) => v.toFixed(0)} />
        <Strip title="Wind gusts" unit="m/s" pts={gustPts} max={20} warn={10} bad={14} />
      </section>

      <section className="panel p-5">
        <div className="eyebrow mb-3">If you fly</div>
        <ul className="space-y-2">
          {tips.map((t, i) => (
            <li key={i} className="flex gap-3 text-[14px] leading-relaxed"><span className="text-[var(--accent)] mt-1.5 w-1.5 h-1.5 rounded-full bg-current shrink-0" />{t}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
