import React, { useRef, useState } from "react";
import { Cable, FileText, Globe, Play, Square } from "lucide-react";
import { Button } from "./ui";
import { useGnss } from "../../gnss/GnssContext";

export function SourceControls() {
  const { source, useSimulator, useSky, connectSerial, replayLog, disconnect, serialSupported } = useGnss();
  const [baud, setBaud] = useState(9600);
  const file = useRef<HTMLInputElement>(null);
  const cls = "font-mono text-[10px] uppercase tracking-widest h-8 px-2 border-zinc-700 text-zinc-400";

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" className={cls} onClick={useSimulator} disabled={source === "sim"} title="Run the built-in demo receiver">
        <Play className="w-3 h-3 md:mr-1" /><span className="hidden md:inline">Demo</span>
      </Button>
      <Button variant="outline" className={cls} onClick={useSky} disabled={source === "sky"} title="Real satellites above you right now, predicted from CelesTrak orbital data">
        <Globe className="w-3 h-3 md:mr-1" /><span className="hidden md:inline">Sky</span>
      </Button>
      <select
        value={baud}
        onChange={(e) => setBaud(Number(e.target.value))}
        className="h-8 bg-black border border-zinc-700 rounded text-[10px] font-mono text-zinc-400 px-1 hidden lg:block"
        title="Serial baud rate"
      >
        {[4800, 9600, 38400, 115200].map((b) => <option key={b} value={b}>{b}</option>)}
      </select>
      <Button
        variant="outline"
        className={cls}
        onClick={() => connectSerial(baud)}
        disabled={!serialSupported}
        title={serialSupported ? "Connect a USB GNSS receiver" : "Web Serial needs Chrome or Edge"}
      >
        <Cable className="w-3 h-3 md:mr-1" /><span className="hidden md:inline">Serial</span>
      </Button>
      <Button variant="outline" className={cls} onClick={() => file.current?.click()} title="Replay an NMEA log file">
        <FileText className="w-3 h-3 md:mr-1" /><span className="hidden md:inline">Log</span>
      </Button>
      <input
        ref={file}
        type="file"
        accept=".nmea,.txt,.log,.ubx,text/plain"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) replayLog(await f.text(), f.name);
          e.target.value = "";
        }}
      />
      {source !== "idle" && (
        <Button variant="outline" className={cls} onClick={disconnect} title="Stop">
          <Square className="w-3 h-3" />
        </Button>
      )}
    </div>
  );
}
