import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { NmeaParser, emptyState, type GnssState } from "./nmea";
import { assess, SYSTEMS, type Integrity } from "./integrity";
import { loadSkyModel, visibleSats, type Observer } from "./sky";
import { computeDops } from "./nmea";
import { Simulator } from "./simulator";

export type SourceKind = "sim" | "serial" | "log" | "sky" | "idle";

export interface GnssContextType {
  state: GnssState;
  integrity: Integrity;
  source: SourceKind;
  status: string;
  spoof: boolean;
  setSpoof: (v: boolean) => void;
  useSimulator: () => void;
  useSky: () => Promise<void>;
  connectSerial: (baud: number) => Promise<void>;
  replayLog: (text: string, name: string) => void;
  disconnect: () => void;
  serialSupported: boolean;
}

const Ctx = createContext<GnssContextType | null>(null);
export const useGnss = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useGnss outside GnssProvider");
  return c;
};

const NO_INTEGRITY: Integrity = { trust: null, findings: [], systems: [], meanSnr: null, stdSnr: null, jumpM: null, clockOffsetS: null };

export function GnssProvider({ children }: { children: React.ReactNode }) {
  const parser = useRef(new NmeaParser());
  const sim = useRef(new Simulator());
  const stop = useRef<() => void>(() => {});
  const prevPos = useRef<{ lat: number; lon: number; t: number } | null>(null);
  const sourceRef = useRef<SourceKind>("idle");

  const [state, setState] = useState<GnssState>(emptyState());
  const [integrity, setIntegrity] = useState<Integrity>(NO_INTEGRITY);
  const [source, setSource] = useState<SourceKind>("idle");
  const [status, setStatus] = useState("No source");
  const [spoof, setSpoofState] = useState(false);

  const publish = useCallback(() => {
    const snap = parser.current.snapshot();
    const f = snap.fix;
    const rxT = f.date && f.utc ? Date.parse(`${f.date}T${f.utc}Z`) : NaN;
    const live = sourceRef.current === "sim" || sourceRef.current === "serial";
    const t = !live && !isNaN(rxT) ? rxT : Date.now();
    const res = assess(snap, prevPos.current, t, live);
    if (f.lat !== null && f.lon !== null && f.quality > 0) prevPos.current = { lat: f.lat, lon: f.lon, t };
    setState(snap);
    setIntegrity(res);
  }, []);

  const begin = (kind: SourceKind, msg: string) => {
    stop.current();
    stop.current = () => {};
    parser.current.reset();
    prevPos.current = null;
    sourceRef.current = kind;
    setSource(kind);
    setStatus(msg);
    setState(emptyState());
    setIntegrity(NO_INTEGRITY);
  };

  const disconnect = useCallback(() => {
    stop.current();
    stop.current = () => {};
    sourceRef.current = "idle";
    setSource("idle");
    setStatus("No source");
  }, []);

  const useSimulator = useCallback(() => {
    begin("sim", "Simulator (1 Hz NMEA)");
    const run = () => {
      if (parser.current.feed(sim.current.tick())) publish();
    };
    run();
    const id = setInterval(run, 1000);
    stop.current = () => clearInterval(id);
  }, [publish]);

  const replayLog = useCallback((text: string, name: string) => {
    begin("log", `Replaying ${name}`);
    const lines = text.split(/\r?\n/).filter((l) => l.includes("$"));
    let i = 0;
    const id = setInterval(() => {
      const chunk = lines.slice(i, i + 40);
      i += 40;
      if (parser.current.feed(chunk.join("\n") + "\n")) publish();
      if (i >= lines.length) {
        clearInterval(id);
        setStatus(`Finished ${name} (${lines.length} lines)`);
      }
    }, 250);
    stop.current = () => clearInterval(id);
  }, [publish]);

  const useSky = useCallback(async () => {
    begin("sky", "Loading CelesTrak orbital data…");
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    stop.current = () => { cancelled = true; if (timer) clearInterval(timer); };
    // Observer: browser location if allowed, otherwise Weilheim, Bavaria.
    const obs: Observer = { lat: 47.8806, lon: 11.0856, altM: 600 };
    let where = "Weilheim (default)";
    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 }));
      obs.lat = pos.coords.latitude; obs.lon = pos.coords.longitude; obs.altM = pos.coords.altitude ?? 0;
      where = "your location";
    } catch { /* keep default */ }
    let model;
    try {
      model = await loadSkyModel();
    } catch (e: any) {
      if (!cancelled) setStatus(`CelesTrak failed: ${e?.message ?? e}`);
      return;
    }
    if (cancelled) return;
    const run = () => {
      const sats = visibleSats(model, obs, new Date());
      const dop = computeDops(sats.filter((s) => s.used).map((s) => ({ el: s.el!, az: s.az!, sys: s.sys })));
      const st = parser.current.state;
      st.sats = sats;
      st.fix = { ...st.fix, lat: obs.lat, lon: obs.lon, alt: obs.altM, quality: 0, nUsed: sats.filter((s) => s.used).length, utc: new Date().toISOString().slice(11, 19), date: null, speedMs: null, course: null };
      st.pdop = dop?.pdop ?? null; st.hdop = dop?.hdop ?? null; st.vdop = dop?.vdop ?? null;
      st.predicted = true;
      st.sentences = model.entries.length;
      const snap = parser.current.snapshot();
      setState(snap);
      setIntegrity({
        ...NO_INTEGRITY,
        systems: SYSTEMS.map((sys) => ({
          sys, tracked: sats.filter((s) => s.sys === sys).length, used: sats.filter((s) => s.sys === sys && s.used).length,
          meanSnr: null, stdSnr: null, anomalous: false,
        })),
      });
    };
    run();
    setStatus(`Predicted sky for ${where} (CelesTrak)`);
    timer = setInterval(run, 2000);
  }, []);

  const serialSupported = typeof navigator !== "undefined" && "serial" in navigator;

  const connectSerial = useCallback(async (baud: number) => {
    const serial = (navigator as any).serial;
    if (!serial) {
      setStatus("Web Serial is not supported in this browser (use Chrome or Edge)");
      return;
    }
    let port: any;
    try {
      port = await serial.requestPort();
      await port.open({ baudRate: baud });
    } catch (e: any) {
      setStatus(`Serial: ${e?.message ?? "cancelled"}`);
      return;
    }
    begin("serial", `Serial @ ${baud} baud`);
    let alive = true;
    const reader = port.readable.getReader();
    stop.current = () => {
      alive = false;
      reader.cancel().catch(() => {}).finally(() => port.close().catch(() => {}));
    };
    const dec = new TextDecoder();
    (async () => {
      try {
        while (alive) {
          const { value, done } = await reader.read();
          if (done) break;
          if (parser.current.feed(dec.decode(value, { stream: true }))) publish();
        }
      } catch (e: any) {
        if (alive) setStatus(`Serial error: ${e?.message}`);
      }
    })();
  }, [publish]);

  const setSpoof = useCallback((v: boolean) => {
    sim.current.spoof = v;
    setSpoofState(v);
  }, []);

  useEffect(() => () => stop.current(), []);

  const value = useMemo(
    () => ({ state, integrity, source, status, spoof, setSpoof, useSimulator, useSky, connectSerial, replayLog, disconnect, serialSupported }),
    [state, integrity, source, status, spoof, setSpoof, useSimulator, useSky, connectSerial, replayLog, disconnect, serialSupported],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
