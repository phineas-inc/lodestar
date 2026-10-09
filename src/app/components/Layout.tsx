import React, { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import { Compass, Map as MapIcon, Newspaper, Antenna } from "lucide-react";
import { useLodestar } from "../../lodestar/LodestarContext";
import { useGnss } from "../../gnss/GnssContext";
import { SourceControls } from "./SourceControls";
import { Button, cn } from "./ui";
import { Zap } from "lucide-react";

const tabs = [
  { to: "/", label: "Briefing", icon: Compass },
  { to: "/map", label: "Threat map", icon: MapIcon },
  { to: "/reports", label: "Reports", icon: Newspaper },
  { to: "/receiver", label: "My receiver", icon: Antenna },
];

function ago(t: number | null | undefined, now: number) {
  if (!t) return "no data";
  const m = Math.round((now - t) / 60000);
  return m < 1 ? "just now" : m < 90 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

function Fresh({ label, t, error, now }: { label: string; t: number | null | undefined; error?: string | null; now: number }) {
  const stale = !t || now - t > 30 * 60000;
  const color = error && !t ? "var(--nogo)" : stale ? "var(--caution)" : "var(--clear)";
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-[var(--muted)] whitespace-nowrap" title={error ?? undefined}>
      <i className={cn("w-1.5 h-1.5 rounded-full inline-block", !stale && "live-dot")} style={{ background: color }} />
      {label} <span className="num text-[var(--text)]">{ago(t, now)}</span>
    </span>
  );
}

export function Layout() {
  const { cells, incidents, kp } = useLodestar();
  const { source, spoof, setSpoof } = useGnss();
  const here = useLocation().pathname;
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(id); }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-[1000] border-b border-[var(--line)] bg-[var(--bg)]/90 backdrop-blur">
        <div className="max-w-[1400px] mx-auto px-4 md:px-6 h-14 flex items-center gap-4 md:gap-8">
          <div className="flex items-center gap-2 shrink-0">
            <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="var(--accent)" strokeWidth="1.6"><circle cx="12" cy="12" r="9" /><path d="M12 3v4M12 17v4M3 12h4M17 12h4" /><path d="M12 7.5l2 4.5-2 4.5-2-4.5z" fill="var(--accent)" stroke="none" /></svg>
            <span className="font-semibold tracking-tight text-[15px]">Lodestar</span>
          </div>
          <nav className="flex gap-1 overflow-x-auto">
            {tabs.map((t) => (
              <NavLink
                key={t.to} to={t.to} end={t.to === "/"}
                className={({ isActive }) => cn("flex items-center gap-2 px-3 h-8 rounded-lg text-[13px] whitespace-nowrap transition-colors", isActive ? "bg-[var(--panel-2)] text-[var(--text)]" : "text-[var(--muted)] hover:text-[var(--text)]")}
              >
                <t.icon className="w-3.5 h-3.5" />{t.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto hidden lg:flex items-center gap-5">
            <Fresh label="Aircraft" t={cells.data?.generatedAt} error={cells.error} now={now} />
            <Fresh label="Reports" t={incidents.data?.generatedAt} error={incidents.error} now={now} />
            <Fresh label="Space wx" t={kp.at} error={kp.error} now={now} />
          </div>
        </div>
        {here === "/receiver" && (
          <div className="border-t border-[var(--line)]">
            <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-2 flex items-center gap-3 flex-wrap">
              <span className="eyebrow">Source</span>
              <SourceControls />
              {source === "sim" && (
                <Button variant={spoof ? "destructive" : "outline"} className="text-[11px] h-8 px-3 border-[var(--line)]" onClick={() => setSpoof(!spoof)}>
                  <Zap className="w-3 h-3 mr-2" />{spoof ? "Spoofer on" : "Inject spoofer"}
                </Button>
              )}
            </div>
          </div>
        )}
      </header>
      <main className="flex-1 max-w-[1400px] w-full mx-auto px-4 md:px-6 py-6">
        <Outlet />
      </main>
      <footer className="border-t border-[var(--line)] text-[11px] text-[var(--faint)] py-4 px-4 md:px-6 text-center">
        Decision aid, not an authority. Built from public data (adsb.lol, CelesTrak, NOAA SWPC, Open-Meteo, GDELT). Always follow your local aviation rules and your aircraft's manual.
      </footer>
    </div>
  );
}
