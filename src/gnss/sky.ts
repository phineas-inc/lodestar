// Predicted sky from public orbital elements (CelesTrak GP data via the collector, SGP4 via satellite.js).
// No signal measurements: it answers "which satellites should I see right now?".
import * as sat from "satellite.js";
import type { Sat, System } from "./nmea";

const GROUPS: { key: string; sys: System }[] = [
  { key: "gps", sys: "GPS" },
  { key: "galileo", sys: "Galileo" },
  { key: "glonass", sys: "GLONASS" },
  { key: "beidou", sys: "BeiDou" },
];

interface Entry { sys: System; name: string; norad: number; rec: sat.SatRec; label: string; prn: number }
export interface SkyModel { entries: Entry[]; fetchedAt: number }

function ident(sys: System, name: string, norad: number): { label: string; prn: number } {
  let m: RegExpMatchArray | null;
  if (sys === "GPS" && (m = name.match(/PRN (\d+)/))) return { label: `G${m[1]}`, prn: +m[1] };
  if (sys === "BeiDou" && (m = name.match(/\(C(\d+)\)/))) return { label: `C${m[1]}`, prn: +m[1] };
  if (sys === "Galileo" && (m = name.match(/GSAT0*(\d+)/))) return { label: `E${m[1]}`, prn: norad };
  if (sys === "GLONASS" && (m = name.match(/\((\d+)\)/))) return { label: `R${m[1]}`, prn: norad };
  return { label: String(norad), prn: norad };
}

/** Orbital elements are crawled by the collector (scripts/collect.mjs) and served as static JSON. */
export async function loadSkyModel(): Promise<SkyModel> {
  const r = await fetch(`data/gp.json?t=${Math.floor(Date.now() / 600000)}`);
  if (!r.ok) throw new Error(`orbital data unavailable (HTTP ${r.status})`);
  const j = await r.json();
  const entries: Entry[] = [];
  for (const g of GROUPS) {
    for (const omm of j.groups?.[g.key] ?? []) {
      try {
        const rec = sat.json2satrec(omm);
        entries.push({ sys: g.sys, name: omm.OBJECT_NAME, norad: omm.NORAD_CAT_ID, rec, ...ident(g.sys, omm.OBJECT_NAME, omm.NORAD_CAT_ID) });
      } catch { /* skip bad element set */ }
    }
  }
  return { entries, fetchedAt: j.generatedAt ?? Date.now() };
}

export interface Observer { lat: number; lon: number; altM: number }

/** Satellites above the elevation mask at `when` for the observer. */
export function visibleSats(model: SkyModel, obs: Observer, when: Date, maskDeg = 5, dopMaskDeg = 10): Sat[] {
  const gmst = sat.gstime(when);
  const o = { latitude: sat.degreesToRadians(obs.lat), longitude: sat.degreesToRadians(obs.lon), height: obs.altM / 1000 };
  const out: Sat[] = [];
  for (const e of model.entries) {
    const pv = sat.propagate(e.rec, when);
    if (!pv || typeof pv.position === "boolean" || !pv.position) continue;
    const look = sat.ecfToLookAngles(o, sat.eciToEcf(pv.position, gmst));
    const el = (look.elevation * 180) / Math.PI;
    if (el < maskDeg) continue;
    out.push({ sys: e.sys, prn: e.prn, label: e.label, el, az: (look.azimuth * 180) / Math.PI, snr: null, used: el >= dopMaskDeg });
  }
  return out;
}
