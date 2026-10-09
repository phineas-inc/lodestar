import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { loadCells, loadIncidents, loadKp, loadWeather, loadXray, type Cells, type Incidents, type KpPoint, type WxHour } from "./feeds";
import { loadSkyModel, type SkyModel } from "../gnss/sky";
import { geometryFactor, geometrySeries, interferenceFactor, overall, reportsFactor, spaceFactor, weatherFactor, guidance, type Factor, type GeoPoint, type Level } from "./readiness";

export interface Loc { name: string; lat: number; lon: number }
const DEFAULT_LOC: Loc = { name: "Gdańsk, Poland", lat: 54.352, lon: 18.646 };

interface Feed<T> { data: T | null; error: string | null; at: number | null }
const empty = <T,>(): Feed<T> => ({ data: null, error: null, at: null });

export interface LodestarCtx {
  loc: Loc;
  setLoc: (l: Loc) => void;
  cells: Feed<Cells>;
  incidents: Feed<Incidents>;
  kp: Feed<KpPoint[]>;
  wx: Feed<WxHour[]>;
  factors: Factor[];
  verdict: Level;
  series: GeoPoint[];
  tips: string[];
  nearReports: Incidents["items"];
  interferencePct: number | null;
}
const Ctx = createContext<LodestarCtx | null>(null);
export const useLodestar = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useLodestar outside provider");
  return c;
};

function useFeed<T>(fn: () => Promise<T>, everyMs: number, deps: unknown[] = []): Feed<T> {
  const [f, setF] = useState<Feed<T>>(empty());
  useEffect(() => {
    let dead = false;
    const run = async () => {
      try {
        const d = await fn();
        if (!dead) setF({ data: d, error: null, at: Date.now() });
      } catch (e: any) {
        if (!dead) setF((p) => ({ ...p, error: e?.message ?? String(e) }));
      }
    };
    setF((p) => (deps.length ? empty() : p));
    run();
    const id = setInterval(run, everyMs);
    return () => { dead = true; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return f;
}

export function LodestarProvider({ children }: { children: React.ReactNode }) {
  const [loc, setLocState] = useState<Loc>(() => {
    try { const s = JSON.parse(localStorage.getItem("lodestar:loc") ?? "null"); if (s && typeof s.lat === "number") return s; } catch { /* ignore */ }
    return DEFAULT_LOC;
  });
  const setLoc = useCallback((l: Loc) => {
    setLocState(l);
    try { localStorage.setItem("lodestar:loc", JSON.stringify(l)); } catch { /* ignore */ }
  }, []);

  const cells = useFeed(loadCells, 3 * 60000);
  const incidents = useFeed(loadIncidents, 5 * 60000);
  const kp = useFeed(loadKp, 10 * 60000);
  const xray = useFeed(loadXray, 5 * 60000);
  const model = useFeed<SkyModel>(loadSkyModel, 30 * 60000);
  const wx = useFeed(() => loadWeather(loc.lat, loc.lon), 15 * 60000, [loc.lat, loc.lon]);

  // Satellite geometry for the next 6 h; recomputed when the location or the orbital data change.
  const series = useMemo(() => geometrySeries(model.data, loc.lat, loc.lon), [model.data, loc.lat, loc.lon]);

  const value = useMemo<LodestarCtx>(() => {
    const interf = interferenceFactor(cells.data, loc.lat, loc.lon);
    const reports = reportsFactor(incidents.data, loc.lat, loc.lon);
    const factors: Factor[] = [
      interf,
      geometryFactor(series),
      spaceFactor(kp.data, xray.data, loc.lat),
      weatherFactor(wx.data),
      reports,
    ];
    return {
      loc, setLoc, cells, incidents, kp, wx, factors, series,
      verdict: overall(factors), tips: guidance(factors), nearReports: reports.near, interferencePct: interf.pct,
    };
  }, [loc, setLoc, cells, incidents, kp, wx, xray.data, series]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
