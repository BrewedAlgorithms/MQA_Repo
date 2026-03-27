import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const API_URL =
  import.meta.env.VITE_API_URL ||
  'http://localhost:8001';

function SourceBadge({ sourceType }) {
  if (!sourceType) {
    return (
      <span className="text-[9px] font-mono font-bold tracking-widest uppercase px-2 py-0.5 rounded border border-white/10 text-white/20 bg-white/[0.03]">
        no source
      </span>
    );
  }
  return (
    <span className="text-[9px] font-mono font-bold tracking-widest uppercase px-2 py-0.5 rounded border border-primary/30 text-primary bg-primary/10">
      {sourceType}
    </span>
  );
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <button
      onClick={handleCopy}
      className="flex-shrink-0 text-[9px] font-mono font-bold uppercase tracking-widest px-2 py-0.5 rounded border border-white/10 text-white/20 hover:text-white/50 hover:border-white/20 transition-all duration-150"
    >
      {copied ? 'copied' : 'copy'}
    </button>
  );
}

export default function DevConsole() {
  const navigate = useNavigate();
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API_URL}/api/stations`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setStations(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const hudPath = (station) => `/${encodeURIComponent(station.name)}`;
  const hudUrl = (station) => `${window.location.origin}${hudPath(station)}`;

  return (
    <div className="bg-[#0e0e0e] min-h-screen text-white font-body antialiased flex flex-col select-none">

      {/* Header bar */}
      <header className="border-b border-white/5 px-8 py-5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
          <span className="font-headline font-bold tracking-[0.3em] uppercase text-sm text-white/60">
            MQA · Dev Console
          </span>
        </div>
        <span className="text-[10px] font-mono text-white/20 tracking-widest uppercase">
          localhost:5173/dev
        </span>
      </header>

      <div className="flex-grow flex flex-col px-8 py-10 max-w-4xl w-full mx-auto gap-8">

        {/* Section title */}
        <div>
          <h1 className="font-headline text-3xl font-bold text-white tracking-tight uppercase">
            Station Directory
          </h1>
          <p className="text-white/30 text-sm mt-2 tracking-wide">
            Each station has a dedicated HUD URL. Open multiple tabs to monitor stations in parallel.
          </p>
        </div>

        {/* Station list */}
        <div className="flex flex-col gap-3">
          {loading && (
            <div className="flex items-center gap-3 text-white/30 text-sm py-8">
              <div className="w-4 h-4 border border-white/20 border-t-primary rounded-full animate-spin" />
              <span className="font-mono tracking-widest uppercase text-xs">Fetching stations...</span>
            </div>
          )}

          {error && (
            <div className="p-5 rounded-xl border border-error/30 bg-error/5 flex items-center gap-4">
              <div className="w-2 h-2 bg-error rounded-full flex-shrink-0" />
              <div>
                <p className="text-error text-sm font-bold uppercase tracking-wider">Backend unreachable</p>
                <p className="text-white/30 text-xs font-mono mt-1">{API_URL}/api/stations — {error}</p>
              </div>
            </div>
          )}

          {!loading && !error && stations.length === 0 && (
            <div className="p-5 rounded-xl border border-white/5 bg-white/[0.02] text-white/30 text-sm font-mono text-center py-12">
              No stations configured. Add one via the Admin dashboard.
            </div>
          )}

          {stations.map((station) => {
            const streamUrl = station.hls_url || station.rtsp_url;
            const url = hudUrl(station);

            return (
              <div
                key={station.id}
                className="p-5 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/10 transition-all duration-200 flex flex-col gap-4"
              >
                {/* Top row: name + badge */}
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-headline font-bold text-lg text-white/90 tracking-wide truncate">
                      {station.name}
                    </span>
                    <SourceBadge sourceType={station.source_type} />
                  </div>
                  <span className="text-white/10 text-[10px] font-mono tracking-widest flex-shrink-0">
                    {station.id.slice(-6)}
                  </span>
                </div>

                {/* Stream URL */}
                <p className="text-[11px] font-mono text-white/20 truncate -mt-2">
                  {streamUrl || 'No stream URL configured'}
                </p>

                {/* HUD URL row */}
                <div className="flex items-center gap-2 bg-black/30 rounded-lg px-3 py-2 border border-white/5">
                  <span className="material-symbols-outlined text-[14px] text-white/20 flex-shrink-0" data-icon="link">link</span>
                  <span className="font-mono text-xs text-white/40 truncate flex-grow">{url}</span>
                  <CopyButton text={url} />
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => navigate(hudPath(station))}
                    className="px-5 py-2 rounded-lg bg-primary text-[#0e0e0e] font-headline font-bold text-xs uppercase tracking-[0.2em] hover:bg-primary/80 transition-all duration-200 shadow-md shadow-primary/10"
                  >
                    Open HUD →
                  </button>
                  <button
                    onClick={() => window.open(hudUrl(station), '_blank')}
                    className="px-5 py-2 rounded-lg border border-white/10 text-white/40 font-headline font-bold text-xs uppercase tracking-[0.2em] hover:border-white/20 hover:text-white/60 transition-all duration-200"
                  >
                    New Tab ↗
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-white/5 px-8 py-4 flex items-center justify-between text-[10px] font-mono text-white/10 uppercase tracking-widest">
        <span>Dev Tools — Internal Use Only</span>
        <span>{API_URL}</span>
      </footer>
    </div>
  );
}
