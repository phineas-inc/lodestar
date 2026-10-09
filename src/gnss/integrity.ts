// Heuristic integrity monitor computed from receiver-observable data only.
import type { GnssState, Sat, System } from "./nmea";

export interface Finding {
  level: "warn" | "crit";
  text: string;
}

export interface SysStat {
  sys: System;
  tracked: number;
  used: number;
  meanSnr: number | null;
  stdSnr: number | null;
  anomalous: boolean;
}

export interface Integrity {
  trust: number | null; // 0-100, null = no data
  findings: Finding[];
  systems: SysStat[];
  meanSnr: number | null;
  stdSnr: number | null;
  jumpM: number | null;
  clockOffsetS: number | null;
}

const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
const std = (a: number[]) => {
  const m = mean(a);
  return Math.sqrt(mean(a.map((v) => (v - m) ** 2)));
};

export function distM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export const SYSTEMS: System[] = ["GPS", "Galileo", "GLONASS", "BeiDou"];

// Real signals vary with elevation and multipath. A set of satellites that all report
// near-identical, very strong C/N0 is the classic signature of a single-source spoofer.
function sysStat(sys: System, sats: Sat[]): SysStat {
  const mine = sats.filter((s) => s.sys === sys);
  const snrs = mine.map((s) => s.snr).filter((v): v is number => v !== null && v > 0);
  const m = snrs.length ? mean(snrs) : null;
  const sd = snrs.length ? std(snrs) : null;
  return {
    sys,
    tracked: snrs.length,
    used: mine.filter((s) => s.used).length,
    meanSnr: m,
    stdSnr: sd,
    anomalous: snrs.length >= 3 && m! >= 47 && sd! < 2.5,
  };
}

export function assess(
  st: GnssState,
  prev: { lat: number; lon: number; t: number } | null,
  now: number,
  checkClock: boolean,
): Integrity {
  const findings: Finding[] = [];
  const systems = SYSTEMS.map((s) => sysStat(s, st.sats));
  const snrs = st.sats.map((s) => s.snr).filter((v): v is number => v !== null && v > 0);
  const hasFix = st.fix.quality > 0 && st.fix.lat !== null;
  if (!st.sats.length && !hasFix) {
    return { trust: null, findings, systems, meanSnr: null, stdSnr: null, jumpM: null, clockOffsetS: null };
  }

  let penalty = 0;
  const bad = systems.filter((s) => s.anomalous);
  if (bad.length) {
    penalty += Math.min(60, 35 + 15 * (bad.length - 1));
    findings.push({
      level: "crit",
      text: `${bad.map((b) => b.sys).join(", ")}: uniformly strong signals (mean ${bad[0].meanSnr!.toFixed(0)} dB-Hz, spread ${bad[0].stdSnr!.toFixed(1)}). Consistent with spoofing.`,
    });
  } else {
    const hot = snrs.filter((v) => v > 55).length;
    if (hot) {
      penalty += 15;
      findings.push({ level: "warn", text: `${hot} signal(s) above 55 dB-Hz, which is unusually strong for open sky.` });
    }
  }

  // Position jump vs. reported speed
  let jumpM: number | null = null;
  if (prev && hasFix) {
    const dt = Math.max(0.5, (now - prev.t) / 1000);
    const d = distM(prev.lat, prev.lon, st.fix.lat!, st.fix.lon!);
    jumpM = d;
    const allowed = (st.fix.speedMs ?? 0) * dt + 30; // 30 m slack for noise
    if (dt < 15 && d > Math.max(allowed, 100)) {
      penalty += 30;
      findings.push({ level: "crit", text: `Position jumped ${d.toFixed(0)} m in ${dt.toFixed(0)} s while reported speed is ${((st.fix.speedMs ?? 0) * 3.6).toFixed(0)} km/h.` });
    }
  }

  // Receiver clock vs. host clock (only meaningful for live sources)
  let clockOffsetS: number | null = null;
  if (checkClock && st.fix.utc && st.fix.date) {
    const rx = Date.parse(`${st.fix.date}T${st.fix.utc}Z`);
    if (!isNaN(rx)) {
      clockOffsetS = (rx - now) / 1000;
      if (Math.abs(clockOffsetS) > 5) {
        penalty += 25;
        findings.push({ level: "crit", text: `Receiver time is ${clockOffsetS.toFixed(1)} s off the host clock. Possible time spoofing or a stale clock.` });
      }
    }
  }

  // Geometry and availability
  const used = st.fix.nUsed ?? st.sats.filter((s) => s.used).length;
  if (!hasFix) {
    penalty += 40;
    findings.push({ level: "crit", text: "No valid position fix." });
  } else if (used < 5) {
    penalty += 10;
    findings.push({ level: "warn", text: `Only ${used} satellites in the solution.` });
  }
  const pdop = st.pdop ?? st.hdop;
  if (pdop !== null && pdop > 4) {
    penalty += pdop > 6 ? 15 : 8;
    findings.push({ level: "warn", text: `Poor geometry (DOP ${pdop.toFixed(1)}).` });
  }
  const active = systems.filter((s) => s.tracked > 0).length;
  if (active === 1 && st.sats.length) {
    penalty += 5;
    findings.push({ level: "warn", text: "Only one constellation is tracked, so cross-checks are limited." });
  }

  return {
    trust: Math.max(0, Math.min(100, Math.round(100 - penalty))),
    findings,
    systems,
    meanSnr: snrs.length ? mean(snrs) : null,
    stdSnr: snrs.length ? std(snrs) : null,
    jumpM,
    clockOffsetS,
  };
}
