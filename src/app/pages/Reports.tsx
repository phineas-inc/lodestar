import React from "react";
import { ExternalLink, Sparkles } from "lucide-react";
import { useLodestar } from "../../lodestar/LodestarContext";
import { distKm } from "../../lodestar/readiness";

const KIND: Record<string, string> = { jamming: "Jamming", spoofing: "Spoofing", outage: "Outage", other: "Other" };

export function Reports() {
  const { incidents, loc } = useLodestar();
  const d = incidents.data;
  const items = [...(d?.items ?? [])].filter((x) => d?.ai || /jamm?ing|spoof|interference|gnss|\bgps\b/i.test(x.title)).sort((a, b) => (b.seen ?? "").localeCompare(a.seen ?? ""));
  return (
    <div className="space-y-4 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Incident reports</h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          News about GNSS jamming and spoofing from the last 3 days, crawled automatically.
          {d?.ai ? " An AI model filters out opinion and product news and works out where each event happened." : " AI filtering is off, so this is the raw headline list without locations."}
        </p>
      </div>
      {!d && <div className="panel p-6 text-sm text-[var(--muted)]">{incidents.error ? `Could not load reports: ${incidents.error}` : "Loading…"}</div>}
      <div className="space-y-2">
        {items.map((i, k) => {
          const dist = typeof i.lat === "number" && typeof i.lon === "number" ? distKm(loc.lat, loc.lon, i.lat, i.lon) : null;
          return (
            <a key={k} href={i.url} target="_blank" rel="noopener noreferrer" className="panel p-4 block hover:border-[var(--accent)] transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-[15px] font-medium leading-snug">{i.title}</div>
                  {i.summary && <p className="text-[13px] text-[var(--muted)] mt-1 flex gap-1.5"><Sparkles className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[var(--accent)]" />{i.summary}</p>}
                  <div className="text-[11px] text-[var(--faint)] mt-2 flex flex-wrap gap-x-3 gap-y-1">
                    <span>{i.domain}</span>
                    {i.kind && <span>{KIND[i.kind]}</span>}
                    {i.place && <span>{i.place}</span>}
                    {dist !== null && <span>{dist.toFixed(0)} km from {loc.name}</span>}
                    {i.severity && <span>Severity {i.severity}/3</span>}
                  </div>
                </div>
                <ExternalLink className="w-4 h-4 text-[var(--faint)] shrink-0 mt-1" />
              </div>
            </a>
          );
        })}
        {d && items.length === 0 && <div className="panel p-6 text-sm text-[var(--muted)]">No reports in the last 3 days.</div>}
      </div>
    </div>
  );
}
