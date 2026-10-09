// Demo receiver: emits real NMEA sentences, so the parser path is the same as for hardware.
import { computeDops, nmeaChecksum } from "./nmea";

interface SimSat { talker: string; sysId: number; prn: number; az0: number; azRate: number; phase: number; rate: number }

const mk = (talker: string, sysId: number, prns: number[]): SimSat[] =>
  prns.map((prn, i) => ({
    talker, sysId, prn,
    az0: (i * 137 + prn * 29) % 360,
    azRate: (i % 2 ? 1 : -1) * (0.02 + (i % 3) * 0.005),
    phase: (i * 2.1 + prn) % (2 * Math.PI),
    rate: 0.004 + (i % 4) * 0.0008,
  }));

const SATS: SimSat[] = [
  ...mk("GP", 1, [2, 5, 9, 13, 15, 20, 25, 29]),
  ...mk("GA", 3, [3, 8, 11, 19, 24, 31]),
  ...mk("GL", 2, [65, 71, 77, 82, 88]),
  ...mk("GB", 4, [6, 12, 19, 25, 33]),
];

const BASE = { lat: 47.8806, lon: 11.0856 }; // Weilheim, Bavaria
const sentence = (body: string) => `$${body}*${nmeaChecksum(body)}\r\n`;

function ddmm(v: number, deg: number): string {
  const a = Math.abs(v), d = Math.floor(a), m = (a - d) * 60;
  return String(d).padStart(deg, "0") + m.toFixed(5).padStart(8, "0");
}

export class Simulator {
  spoof = false;
  private t0 = Date.now();
  private jump = 0; // metres of northing offset applied while spoofed
  private walk = { n: 0, e: 0 };

  /** One second of NMEA output. */
  tick(now = Date.now()): string {
    const t = (now - this.t0) / 1000 * 8; // sped-up sky motion
    const d = new Date(now);
    // Spoofer drags the position away; releasing snaps back.
    this.jump = this.spoof ? 850 : 0;
    this.walk.n += (Math.random() - 0.5) * 0.6;
    this.walk.e += (Math.random() - 0.5) * 0.6;
    const lat = BASE.lat + (this.walk.n + this.jump) / 111320;
    const lon = BASE.lon + this.walk.e / (111320 * Math.cos((BASE.lat * Math.PI) / 180));

    const view = SATS.map((s) => {
      const el = 8 + 74 * (0.5 + 0.5 * Math.sin(s.phase + s.rate * t * 20));
      const az = (((s.az0 + s.azRate * t) % 360) + 360) % 360;
      const spoofed = this.spoof && (s.talker === "GP" || s.talker === "GL");
      const snr = spoofed
        ? 52 + (Math.random() - 0.5) * 1.2
        : 27 + 20 * Math.sin((el * Math.PI) / 180) + (Math.random() - 0.5) * 4;
      return { ...s, el: Math.round(el), az: Math.round(az), snr: Math.round(snr), spoofed };
    }).filter((s) => s.el >= 10);

    // Receiver solution: spoofed -> locks the spoofer's sky (GPS/GLONASS from one sector)
    const used = this.spoof
      ? view.filter((s) => s.spoofed && s.az > 20 && s.az < 160).slice(0, 8)
      : view.filter((s) => s.el > 15).slice(0, 12);
    const dop = computeDops(used.map((u) => ({ el: u.el, az: u.az, sys: String(u.sysId) }))) ?? { pdop: 9.9, hdop: 9.9, vdop: 9.9 };

    const time = [d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()].map((v) => String(v).padStart(2, "0")).join("") + ".00";
    const date = [d.getUTCDate(), d.getUTCMonth() + 1, d.getUTCFullYear() % 100].map((v) => String(v).padStart(2, "0")).join("");
    const ns = lat >= 0 ? "N" : "S", ew = lon >= 0 ? "E" : "W";
    let out = "";
    out += sentence(`GNGGA,${time},${ddmm(lat, 2)},${ns},${ddmm(lon, 3)},${ew},1,${String(used.length).padStart(2, "0")},${dop.hdop.toFixed(1)},${(612 + this.walk.n * 0.1).toFixed(1)},M,46.0,M,,`);
    out += sentence(`GNRMC,${time},A,${ddmm(lat, 2)},${ns},${ddmm(lon, 3)},${ew},0.0,0.0,${date},,,A`);

    for (const sys of [1, 2, 3, 4]) {
      const prns = used.filter((s) => s.sysId === sys).map((s) => s.prn);
      if (!prns.length) continue;
      const slots = Array.from({ length: 12 }, (_, i) => (prns[i] !== undefined ? String(prns[i]) : ""));
      out += sentence(`GNGSA,A,3,${slots.join(",")},${dop.pdop.toFixed(1)},${dop.hdop.toFixed(1)},${dop.vdop.toFixed(1)},${sys}`);
    }
    for (const talker of ["GP", "GA", "GL", "GB"]) {
      const mine = view.filter((s) => s.talker === talker);
      const msgs = Math.max(1, Math.ceil(mine.length / 4));
      for (let m = 0; m < msgs; m++) {
        const grp = mine.slice(m * 4, m * 4 + 4).map((s) => `${s.prn},${s.el},${s.az},${s.snr}`);
        out += sentence(`${talker}GSV,${msgs},${m + 1},${String(mine.length).padStart(2, "0")},${grp.join(",")}`);
      }
    }
    return out;
  }
}
