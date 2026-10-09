// NMEA 0183 parser: GGA, RMC, GSA, GSV -> receiver state.

export type System = "GPS" | "GLONASS" | "Galileo" | "BeiDou" | "QZSS" | "SBAS";

export interface Sat {
  sys: System;
  prn: number;
  el: number | null;
  az: number | null;
  snr: number | null; // dB-Hz, null = not tracked
  used: boolean;
  label?: string; // display name when PRN is not meaningful
}

export interface Fix {
  quality: number; // GGA quality: 0 none, 1 GPS, 2 DGPS, 4 RTK fixed, 5 RTK float...
  lat: number | null;
  lon: number | null;
  alt: number | null;
  nUsed: number | null;
  utc: string | null; // HH:MM:SS
  date: string | null; // YYYY-MM-DD
  speedMs: number | null;
  course: number | null;
}

export interface GnssState {
  fix: Fix;
  pdop: number | null;
  hdop: number | null;
  vdop: number | null;
  sats: Sat[];
  sentences: number;
  badChecksums: number;
  lastRx: number; // Date.now() of last valid sentence
  predicted?: boolean; // sky computed from orbital data, no measurements
}

export const emptyState = (): GnssState => ({
  fix: { quality: 0, lat: null, lon: null, alt: null, nUsed: null, utc: null, date: null, speedMs: null, course: null },
  pdop: null,
  hdop: null,
  vdop: null,
  sats: [],
  sentences: 0,
  badChecksums: 0,
  lastRx: 0,
});

const TALKER_SYS: Record<string, System> = {
  GP: "GPS", GL: "GLONASS", GA: "Galileo", GB: "BeiDou", BD: "BeiDou", GQ: "QZSS", PQ: "QZSS",
};
const GSA_SYSID: Record<string, System> = { "1": "GPS", "2": "GLONASS", "3": "Galileo", "4": "BeiDou", "5": "QZSS" };

function checksumOk(body: string, given: string): boolean {
  let c = 0;
  for (let i = 0; i < body.length; i++) c ^= body.charCodeAt(i);
  return c === parseInt(given, 16);
}

export function nmeaChecksum(body: string): string {
  let c = 0;
  for (let i = 0; i < body.length; i++) c ^= body.charCodeAt(i);
  return c.toString(16).toUpperCase().padStart(2, "0");
}

function coord(v: string, hemi: string, degDigits: number): number | null {
  if (!v || !hemi) return null;
  const deg = parseInt(v.slice(0, degDigits), 10);
  const min = parseFloat(v.slice(degDigits));
  if (isNaN(deg) || isNaN(min)) return null;
  const d = deg + min / 60;
  return hemi === "S" || hemi === "W" ? -d : d;
}

const num = (s: string | undefined): number | null => {
  if (s === undefined || s === "") return null;
  const n = Number(s);
  return isNaN(n) ? null : n;
};

function fmtTime(t: string): string | null {
  return t && t.length >= 6 ? `${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4, 6)}` : null;
}

export class NmeaParser {
  state: GnssState = emptyState();
  private buf = "";
  private gsvPending = new Map<string, Sat[]>(); // by talker
  private gsvSats = new Map<System, Sat[]>();
  private used = new Map<string, Set<number>>(); // system or "*" -> prns

  reset() {
    this.state = emptyState();
    this.buf = "";
    this.gsvPending.clear();
    this.gsvSats.clear();
    this.used.clear();
  }

  /** Feed raw text (may contain partial lines). Returns true if state changed. */
  feed(chunk: string): boolean {
    this.buf += chunk;
    const lines = this.buf.split(/\r?\n/);
    this.buf = lines.pop() ?? "";
    if (this.buf.length > 2000) this.buf = "";
    let changed = false;
    for (const l of lines) if (this.parseLine(l.trim())) changed = true;
    if (changed) this.rebuildSats();
    return changed;
  }

  private parseLine(line: string): boolean {
    const start = line.lastIndexOf("$");
    if (start < 0) return false;
    line = line.slice(start + 1);
    const star = line.indexOf("*");
    let body = line;
    if (star >= 0) {
      body = line.slice(0, star);
      if (!checksumOk(body, line.slice(star + 1, star + 3))) {
        this.state.badChecksums++;
        return false;
      }
    }
    const f = body.split(",");
    const id = f[0];
    if (id.length < 5) return false;
    const talker = id.slice(0, 2);
    const type = id.slice(2);
    let ok = true;
    switch (type) {
      case "GGA": this.gga(f); break;
      case "RMC": this.rmc(f); break;
      case "GSA": this.gsa(f, talker); break;
      case "GSV": this.gsv(f, talker); break;
      default: ok = false;
    }
    if (ok) {
      this.state.sentences++;
      this.state.lastRx = Date.now();
    }
    return ok;
  }

  private gga(f: string[]) {
    const fx = this.state.fix;
    fx.utc = fmtTime(f[1]) ?? fx.utc;
    fx.quality = parseInt(f[6] || "0", 10) || 0;
    fx.lat = coord(f[2], f[3], 2);
    fx.lon = coord(f[4], f[5], 3);
    fx.nUsed = num(f[7]);
    this.state.hdop = num(f[8]) ?? this.state.hdop;
    fx.alt = num(f[9]);
  }

  private rmc(f: string[]) {
    const fx = this.state.fix;
    fx.utc = fmtTime(f[1]) ?? fx.utc;
    const d = f[9];
    if (d && d.length === 6) fx.date = `20${d.slice(4, 6)}-${d.slice(2, 4)}-${d.slice(0, 2)}`;
    const kn = num(f[7]);
    fx.speedMs = kn === null ? null : kn * 0.514444;
    fx.course = num(f[8]);
    if (f[2] === "A") {
      fx.lat = coord(f[3], f[4], 2) ?? fx.lat;
      fx.lon = coord(f[5], f[6], 3) ?? fx.lon;
    }
  }

  private gsa(f: string[], talker: string) {
    // $xxGSA,mode,fixType,prn1..prn12,pdop,hdop,vdop[,systemId]
    const prns = new Set<number>();
    for (let i = 3; i <= 14; i++) {
      const n = num(f[i]);
      if (n !== null) prns.add(n);
    }
    this.state.pdop = num(f[15]) ?? this.state.pdop;
    this.state.hdop = num(f[16]) ?? this.state.hdop;
    this.state.vdop = num(f[17]) ?? this.state.vdop;
    const sys: string = GSA_SYSID[f[18]] ?? (talker !== "GN" ? TALKER_SYS[talker] : undefined) ?? "*";
    this.used.set(sys, prns);
  }

  private gsv(f: string[], talker: string) {
    const total = parseInt(f[1], 10);
    const idx = parseInt(f[2], 10);
    const sys = TALKER_SYS[talker];
    if (!sys || !total || !idx) return;
    if (idx === 1) this.gsvPending.set(talker, []);
    const list = this.gsvPending.get(talker);
    if (!list) return;
    for (let i = 4; i + 3 < f.length + 1 && i + 2 < f.length; i += 4) {
      const prn = num(f[i]);
      if (prn === null) continue;
      list.push({ sys, prn, el: num(f[i + 1]), az: num(f[i + 2]), snr: num(f[i + 3]), used: false });
    }
    if (idx === total) {
      this.gsvSats.set(sys, list);
      this.gsvPending.delete(talker);
    }
  }

  private rebuildSats() {
    const all: Sat[] = [];
    for (const [sys, list] of this.gsvSats) {
      const u = this.used.get(sys);
      const any = this.used.get("*");
      for (const s of list) all.push({ ...s, used: !!(u?.has(s.prn) || any?.has(s.prn)) });
    }
    this.state.sats = all;
  }

  snapshot(): GnssState {
    return { ...this.state, fix: { ...this.state.fix }, sats: this.state.sats.map((s) => ({ ...s })) };
  }
}

/**
 * Dilution of precision from satellite geometry. With several constellations each one gets its
 * own receiver clock-bias column (inter-system bias), which is what a real multi-GNSS solution does.
 */
export function computeDops(sats: { el: number; az: number; sys?: string }[]): { pdop: number; hdop: number; vdop: number } | null {
  const systems = [...new Set(sats.map((s) => s.sys ?? "_"))];
  const n = 3 + systems.length;
  if (sats.length < n) return null;
  const N = Array.from({ length: n }, () => new Array(n).fill(0));
  for (const s of sats) {
    const el = (s.el * Math.PI) / 180, az = (s.az * Math.PI) / 180;
    const h = new Array(n).fill(0);
    h[0] = -Math.cos(el) * Math.sin(az);
    h[1] = -Math.cos(el) * Math.cos(az);
    h[2] = -Math.sin(el);
    h[3 + systems.indexOf(s.sys ?? "_")] = 1;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) N[i][j] += h[i] * h[j];
  }
  const inv = invert(N);
  if (!inv) return null;
  return {
    pdop: Math.sqrt(inv[0][0] + inv[1][1] + inv[2][2]),
    hdop: Math.sqrt(inv[0][0] + inv[1][1]),
    vdop: Math.sqrt(inv[2][2]),
  };
}

function invert(m: number[][]): number[][] | null {
  const n = m.length;
  const a = m.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    if (Math.abs(a[p][c]) < 1e-9) return null;
    [a[c], a[p]] = [a[p], a[c]];
    const d = a[c][c];
    for (let j = 0; j < 2 * n; j++) a[c][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const k = a[r][c];
      for (let j = 0; j < 2 * n; j++) a[r][j] -= k * a[c][j];
    }
  }
  return a.map((r) => r.slice(n));
}
