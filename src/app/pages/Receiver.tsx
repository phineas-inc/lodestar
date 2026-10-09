import React, { useState } from "react";
import { AlertTriangle, Activity, Crosshair, Satellite, Zap, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, cn, Button } from "../components/ui";
import { useGnss } from "../../gnss/GnssContext";
import { useEffect } from "react";
import type { Sat, System } from "../../gnss/nmea";

const SYS_COLOR: Record<System, string> = {
  GPS: "#3b82f6", Galileo: "#10b981", GLONASS: "#f59e0b", BeiDou: "#ef4444", QZSS: "#a78bfa", SBAS: "#71717a",
};
const SYS_LABEL: Record<string, string> = {
  GPS: "GPS (US)", Galileo: "Galileo (EU)", GLONASS: "GLONASS (RU)", BeiDou: "BeiDou (CN)",
};
const FIX_NAME: Record<number, string> = { 0: "No fix", 1: "GNSS fix", 2: "DGPS", 4: "RTK fixed", 5: "RTK float" };

const SourceTag = ({ label }: { label: string }) => (
  <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-zinc-950/80 border border-zinc-800 text-[8px] text-zinc-500 font-mono uppercase tracking-widest z-10">
    {label}
  </div>
);

const fmt = (v: number | null | undefined, d = 1, unit = "") => (v === null || v === undefined ? "—" : `${v.toFixed(d)}${unit}`);

function Skyplot({ sats, anomalous }: { sats: Sat[]; anomalous: Set<System> }) {
  const R = 100;
  const pts = sats.filter((s) => s.el !== null && s.az !== null);
  return (
    <svg viewBox="-125 -125 250 250" className="w-full max-w-[260px] aspect-square">
      {[0, 30, 60].map((el) => (
        <circle key={el} r={R * (90 - el) / 90} fill="none" stroke="#27272a" strokeWidth={el === 0 ? 2 : 1} />
      ))}
      <line x1={-R} x2={R} stroke="#27272a" /><line y1={-R} y2={R} stroke="#27272a" />
      {[["N", 0, -R - 8], ["E", R + 9, 3], ["S", 0, R + 14], ["W", -R - 10, 3]].map(([l, x, y]) => (
        <text key={l as string} x={x as number} y={y as number} textAnchor="middle" fontSize="9" fill="#71717a" fontFamily="monospace">{l}</text>
      ))}
      {pts.map((s) => {
        const r = (R * (90 - s.el!)) / 90, a = (s.az! * Math.PI) / 180;
        const x = r * Math.sin(a), y = -r * Math.cos(a);
        const c = anomalous.has(s.sys) ? "#d946ef" : SYS_COLOR[s.sys];
        return (
          <g key={`${s.sys}${s.prn}`} transform={`translate(${x},${y})`}>
            <circle r="5" fill={s.used ? c : "none"} stroke={c} strokeWidth="1.5" opacity={s.snr ? 1 : 0.4} />
            <text y="-8" textAnchor="middle" fontSize="7" fill="#a1a1aa" fontFamily="monospace">{s.label ?? s.prn}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function Receiver() {
  const { state, integrity, source, status, useSimulator } = useGnss();
  useEffect(() => { if (source === "idle") useSimulator(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [detailsExpanded, setDetailsExpanded] = useState(false);

  const { trust } = integrity;
  const danger = trust !== null && trust < 50;
  const tone = trust === null ? "#52525b" : danger ? "#ef4444" : trust < 80 ? "#f59e0b" : "#10b981";
  const toneText = trust === null ? "text-zinc-500" : danger ? "text-red-500" : trust < 80 ? "text-amber-500" : "text-emerald-500";
  const tag = source === "sim" ? "Source: Simulator" : source === "serial" ? "Source: Live receiver" : source === "log" ? "Source: Log replay" : source === "sky" ? "Source: CelesTrak (predicted)" : "No source";

  const anomalous = new Set(integrity.systems.filter((s) => s.anomalous).map((s) => s.sys));
  const bars = [...state.sats]
    .filter((s) => s.snr !== null)
    .sort((a, b) => (a.sys === b.sys ? a.prn - b.prn : a.sys.localeCompare(b.sys)));
  const f = state.fix;
  const pdop = state.pdop ?? state.hdop;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My receiver</h1>
        <p className="text-sm text-[var(--muted)] mt-1">Check your own GNSS receiver for spoofing in flight. Connect it over USB, replay a log, or try the demo.</p>
      </div>
      {/* Position strip */}
      <Card className="border-[var(--line)] bg-[var(--panel)] relative">
        <SourceTag label={tag} />
        <CardContent className="p-4 grid grid-cols-2 md:grid-cols-6 gap-4 font-mono">
          {[
            ["Fix", state.predicted ? "Predicted" : f.quality > 0 ? FIX_NAME[f.quality] ?? `Q${f.quality}` : "No fix"],
            ["Latitude", fmt(f.lat, 6, "°")],
            ["Longitude", fmt(f.lon, 6, "°")],
            ["Altitude", fmt(f.alt, 1, " m")],
            ["Speed", f.speedMs === null ? "—" : `${(f.speedMs * 3.6).toFixed(1)} km/h`],
            ["UTC", f.utc ? `${f.utc}Z` : "—"],
          ].map(([k, v]) => (
            <div key={k}>
              <div className="text-[9px] uppercase tracking-widest text-zinc-500">{k}</div>
              <div className="text-sm text-zinc-100 mt-1">{v}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Trust score */}
      <Card className="border-[var(--line)] bg-[var(--panel)] shadow-2xl relative overflow-hidden">
        <SourceTag label={tag} />
        <CardContent className="p-6 md:p-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-6">
              <div className="relative w-32 h-32 flex items-center justify-center shrink-0">
                <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90 absolute inset-0">
                  <circle cx="50" cy="50" r="45" fill="transparent" stroke="#18181b" strokeWidth="6" />
                  <circle
                    cx="50" cy="50" r="45" fill="transparent" stroke={tone} strokeWidth="6"
                    strokeDasharray={`${(trust ?? 0) * 2.82} 282.7`}
                    className="transition-all duration-1000 ease-out"
                  />
                </svg>
                <div className="text-center">
                  <span className={cn("text-4xl font-mono font-bold tracking-tighter", toneText)}>{trust === null ? "—" : `${trust}%`}</span>
                  <span className="block text-[9px] uppercase tracking-widest text-zinc-500 mt-1">Trust Score</span>
                </div>
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-widest uppercase font-mono text-zinc-100 mb-2">Signal Authenticity</h2>
                <p className="text-xs text-zinc-400 font-mono max-w-md">
                  {state.predicted
                    ? "Showing the satellites that should be visible now, predicted from public orbital data. Authenticity needs real signal measurements, so connect a receiver or load a log."
                    : trust === null
                    ? `Waiting for data. ${status}.`
                    : "Scored from signal-strength consistency, position continuity, receiver clock, geometry and fix quality."}
                </p>
                <div className="mt-3 space-y-1.5 max-w-xl">
                  {integrity.findings.map((x, i) => (
                    <div
                      key={i}
                      className={cn(
                        "text-[11px] font-mono p-2 rounded border flex gap-2",
                        x.level === "crit" ? "text-red-400 bg-red-950/20 border-red-900/40" : "text-amber-400 bg-amber-950/20 border-amber-900/40",
                      )}
                    >
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      {x.text}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={() => setDetailsExpanded(!detailsExpanded)}
              className="font-mono text-xs uppercase tracking-widest h-10 w-full md:w-auto"
            >
              {detailsExpanded ? <ChevronUp className="w-4 h-4 mr-2" /> : <ChevronDown className="w-4 h-4 mr-2" />}
              {detailsExpanded ? "Hide Raw Telemetry" : "Tap to Expand Metrics"}
            </Button>
          </div>

          {detailsExpanded && (
            <div className="mt-8 pt-6 border-t border-[var(--line)] grid grid-cols-2 md:grid-cols-4 gap-4 animate-in fade-in slide-in-from-top-4">
              {[
                ["Mean C/N0", fmt(integrity.meanSnr, 1, " dB-Hz")],
                ["C/N0 spread (σ)", fmt(integrity.stdSnr, 1, " dB-Hz")],
                ["Last position step", fmt(integrity.jumpM, 1, " m")],
                ["Rx − host clock", integrity.clockOffsetS === null ? "n/a" : fmt(integrity.clockOffsetS, 1, " s")],
                ["Sats in solution", f.nUsed === null ? "—" : String(f.nUsed)],
                ["HDOP / VDOP", `${fmt(state.hdop)} / ${fmt(state.vdop)}`],
                ["Sentences parsed", String(state.sentences)],
                ["Bad checksums", String(state.badChecksums)],
              ].map(([k, v]) => (
                <div key={k} className="p-3 bg-zinc-950/50 rounded border border-zinc-900">
                  <div className="text-[9px] text-zinc-500 font-mono uppercase tracking-widest mb-1 flex items-center justify-between">
                    {k}
                    <Activity className="w-3 h-3" />
                  </div>
                  <div className="text-sm font-mono text-zinc-200">{v}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Constellations */}
        <Card className="lg:col-span-3 border-[var(--line)] bg-[var(--panel)] relative">
          <CardHeader className="pb-4 border-b border-[var(--line)]">
            <CardTitle className="flex items-center gap-2 text-zinc-300 font-mono text-xs uppercase tracking-widest">
              <Satellite className="w-4 h-4 text-blue-500" />
              Constellation Library
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            {integrity.systems.length === 0 && <div className="text-xs font-mono text-zinc-500">No satellite data yet.</div>}
            {integrity.systems.map((c) => {
              const off = c.tracked === 0;
              return (
                <div
                  key={c.sys}
                  className={cn(
                    "p-3 border rounded flex flex-col gap-2",
                    c.anomalous ? "bg-red-950/20 border-red-900/50" : "bg-zinc-900/50 border-zinc-800",
                    off && "opacity-50",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className={cn("font-mono text-xs font-bold uppercase", c.anomalous ? "text-red-500" : "text-zinc-300")}>{SYS_LABEL[c.sys]}</span>
                    <div className={cn("w-2 h-2 rounded-full", off ? "bg-zinc-600" : c.anomalous ? "bg-red-500 animate-pulse" : "bg-emerald-500")} />
                  </div>
                  <div className="text-[10px] font-mono text-zinc-500">
                    {off ? "Not tracked" : c.meanSnr === null ? `${c.tracked} visible · ${c.used} above 10° mask` : `${c.tracked} tracked · ${c.used} used · ${c.meanSnr!.toFixed(0)} dB-Hz avg`}
                  </div>
                  {c.anomalous && (
                    <div className="text-[9px] font-mono text-red-400 uppercase tracking-wider bg-red-950/50 p-1.5 rounded">Anomalous signal pattern</div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* SNR HUD */}
        <Card className="lg:col-span-5 border-[var(--line)] bg-[var(--panel)] relative">
          <CardHeader className="pb-4 border-b border-[var(--line)]">
            <CardTitle className="flex items-center gap-2 text-zinc-300 font-mono text-xs uppercase tracking-widest">
              <Zap className="w-4 h-4 text-purple-500" />
              Interference HUD
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">Carrier-to-noise (C/N0) per satellite</span>
              <span className="text-[10px] text-zinc-500 font-mono">dB-Hz</span>
            </div>
            <div className="relative flex items-end justify-between h-40 gap-1 w-full mt-4 pb-2 border-b border-zinc-800">
              {/* Typical open-sky band */}
              <div className="absolute left-0 right-0 border-y border-dashed border-zinc-700/70 bg-zinc-800/10 pointer-events-none" style={{ bottom: "50%", height: "20%" }} />
              {bars.length === 0 && <div className="m-auto text-xs font-mono text-zinc-600">{state.predicted ? "Predicted sky only: signal strength needs a real receiver" : "No tracked satellites"}</div>}
              {bars.map((s) => {
                const odd = anomalous.has(s.sys);
                return (
                  <div key={`${s.sys}${s.prn}`} className="flex flex-col items-center w-full h-full justify-end" title={`${s.sys} ${s.prn}: ${s.snr} dB-Hz`}>
                    <div
                      className={cn("w-full rounded-sm transition-all duration-300", odd && "shadow-[0_0_10px_rgba(192,38,211,0.8)]")}
                      style={{ height: `${Math.min(100, ((s.snr as number) / 60) * 100)}%`, background: odd ? "#c026d3" : SYS_COLOR[s.sys], opacity: s.used ? 1 : 0.45 }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[10px] font-mono text-zinc-500">
              {(["GPS", "Galileo", "GLONASS", "BeiDou"] as System[]).map((s) => (
                <span key={s} className="flex items-center gap-1"><i className="w-2 h-2 rounded-sm inline-block" style={{ background: SYS_COLOR[s] }} />{s}</span>
              ))}
              <span>Dashed band = typical open-sky 30–40 dB-Hz · faded = not in solution</span>
            </div>
            <div className="mt-4">
              {anomalous.size ? (
                <div className="text-fuchsia-400 font-mono text-xs p-3 bg-fuchsia-950/20 border border-fuchsia-900/30 rounded flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">
                    <strong className="block mb-1">Anomaly detected</strong>
                    {[...anomalous].join(", ")}: signals are strong and nearly identical across satellites. Spoofing likely.
                  </span>
                </div>
              ) : (
                <div className="text-zinc-400 font-mono text-xs p-3 bg-zinc-900/50 border border-zinc-800 rounded">
                  {state.predicted ? "No signal data in predicted mode, so no anomaly check is possible." : "Signal strengths vary naturally with elevation. No anomaly."}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Skyplot */}
        <Card className="lg:col-span-4 border-[var(--line)] bg-[var(--panel)] relative flex flex-col">
          <CardHeader className="pb-4 border-b border-[var(--line)]">
            <CardTitle className="flex items-center gap-2 text-zinc-300 font-mono text-xs uppercase tracking-widest">
              <Crosshair className="w-4 h-4 text-amber-500" />
              DOP Geometry (Skyplot)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 flex-1 flex flex-col items-center justify-center">
            <Skyplot sats={state.sats} anomalous={anomalous} />
            <div className="w-full text-center mt-4">
              <div className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest mb-1">{state.pdop !== null ? "Current PDOP" : "Current HDOP"}</div>
              <div className={cn("text-2xl font-mono font-bold mb-3", pdop !== null && pdop > 4 ? "text-yellow-500" : "text-emerald-500")}>{fmt(pdop)}</div>
              <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                Filled = in solution · hollow = tracked only
              </div>
              {pdop !== null && pdop > 4 && (
                <div className="mt-3 text-yellow-500 font-mono text-[10px] p-2 bg-yellow-950/20 border border-yellow-900/50 rounded uppercase tracking-widest leading-relaxed">
                  Geometry poor. Move away from tall buildings to widen sky view.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
