import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useLodestar } from "../../lodestar/LodestarContext";
import { MIN_SAMPLE } from "../../lodestar/readiness";

const shade = (pct: number) => (pct >= 20 ? "#f87171" : pct >= 10 ? "#fb923c" : pct >= 5 ? "#fbbf24" : "#34d399");

export function ThreatMap() {
  const { cells, incidents, loc, setLoc } = useLodestar();
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const cellLayer = useRef<L.LayerGroup | null>(null);
  const incLayer = useRef<L.LayerGroup | null>(null);
  const pin = useRef<L.Marker | null>(null);
  const [showInc, setShowInc] = useState(true);

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { preferCanvas: true, worldCopyJump: true }).setView([loc.lat, loc.lon], 5);
    const attribution = "Tiles &copy; Esri, HERE, Garmin, OpenStreetMap contributors";
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", { attribution, maxZoom: 9 }).addTo(m);
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}", { maxZoom: 9 }).addTo(m);
    cellLayer.current = L.layerGroup().addTo(m);
    incLayer.current = L.layerGroup().addTo(m);
    m.on("click", (e: L.LeafletMouseEvent) => setLoc({ name: `${e.latlng.lat.toFixed(2)}, ${e.latlng.lng.toFixed(2)}`, lat: +e.latlng.lat.toFixed(4), lon: +e.latlng.lng.toFixed(4) }));
    map.current = m;
    return () => { m.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!pin.current) pin.current = L.marker([loc.lat, loc.lon], { icon: L.divIcon({ className: "", html: '<div style="width:14px;height:14px;border-radius:50%;background:#6aa9ff;border:3px solid #fff;box-shadow:0 0 0 4px rgba(106,169,255,.35)"></div>', iconSize: [14, 14], iconAnchor: [7, 7] }) }).addTo(m);
    pin.current.setLatLng([loc.lat, loc.lon]).bindTooltip(loc.name);
  }, [loc]);

  useEffect(() => {
    const g = cellLayer.current;
    if (!g || !cells.data) return;
    g.clearLayers();
    for (const c of cells.data.cells) {
      const ok = c.n >= MIN_SAMPLE;
      L.rectangle([[c.lat, c.lon], [c.lat + 1, c.lon + 1]], {
        stroke: false, fillColor: ok ? shade(c.pct) : "#64748b", fillOpacity: ok ? 0.25 + Math.min(0.45, c.pct / 60) : 0.07,
      }).bindTooltip(ok ? `${c.pct.toFixed(0)}% degraded · ${c.bad}/${c.n} aircraft reports` : `Too few aircraft (${c.n}) to judge`).addTo(g);
    }
  }, [cells.data]);

  useEffect(() => {
    const g = incLayer.current;
    if (!g) return;
    g.clearLayers();
    if (!showInc) return;
    for (const i of incidents.data?.items ?? []) {
      if (typeof i.lat !== "number" || typeof i.lon !== "number") continue;
      L.circleMarker([i.lat, i.lon], { radius: 6 + (i.severity ?? 1) * 2, color: "#6aa9ff", weight: 1.5, fillColor: "#6aa9ff", fillOpacity: 0.25 })
        .bindTooltip(`<b>${i.place ?? ""}</b><br/>${i.summary ?? i.title}`).on("click", () => window.open(i.url, "_blank", "noopener")).addTo(g);
    }
  }, [incidents.data, showInc]);

  const d = cells.data;
  const severe = d?.cells.filter((c) => c.n >= MIN_SAMPLE && c.pct >= 20).length ?? 0;
  const elevated = d?.cells.filter((c) => c.n >= MIN_SAMPLE && c.pct >= 5 && c.pct < 20).length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Threat map</h1>
          <p className="text-sm text-[var(--muted)] mt-1">Share of aircraft reporting degraded GNSS accuracy in each 1° cell. Click anywhere to brief that spot.</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-[var(--muted)] cursor-pointer">
          <input type="checkbox" checked={showInc} onChange={(e) => setShowInc(e.target.checked)} /> Show reported incidents
        </label>
      </div>

      <div className="panel overflow-hidden relative">
        <div ref={el} className="h-[560px] w-full" />
        <div className="absolute left-3 bottom-3 z-[500] panel px-3 py-2 text-[11px] space-y-1 bg-[var(--panel)]/95">
          <div className="eyebrow mb-1">Aircraft degraded</div>
          {[["#34d399", "under 5%"], ["#fbbf24", "5 – 10%"], ["#fb923c", "10 – 20%"], ["#f87171", "20% and over"], ["#64748b", "too little traffic"]].map(([c, l]) => (
            <div key={l} className="flex items-center gap-2"><i className="w-3 h-3 rounded-sm inline-block" style={{ background: c, opacity: 0.8 }} />{l}</div>
          ))}
        </div>
        {!d && <div className="absolute inset-0 z-[500] grid place-items-center text-sm text-[var(--muted)] bg-[var(--bg)]/70">{cells.error ? `No aircraft data: ${cells.error}` : "Loading…"}</div>}
      </div>

      {d && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            ["Severe cells", String(severe)], ["Elevated cells", String(elevated)],
            ["Aircraft sampled", d.aircraft.toLocaleString()], ["History window", d.windowMin < 5 ? "latest snapshot" : `${d.windowMin} min`],
          ].map(([k, v]) => <div key={k} className="panel p-4"><div className="eyebrow">{k}</div><div className="text-2xl font-semibold mt-1 num">{v}</div></div>)}
        </div>
      )}
      <p className="text-[11px] text-[var(--faint)] leading-relaxed">
        Degraded means an aircraft's reported position accuracy (NACp) is worse than about 185 m. This shows GNSS is degraded, not whether it is jamming, spoofing or something else.
        It only covers areas with ADS-B receivers and air traffic. Cells need at least {MIN_SAMPLE} reports to be judged.
      </p>
    </div>
  );
}
