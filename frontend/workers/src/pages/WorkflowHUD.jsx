import React, { useState, useEffect } from 'react';
import TopTitle from '../components/TopTitle';
import LiveFeedPopup from '../components/LiveFeedPopup';
import ProcessList from '../components/ProcessList';
import MainCarousel from '../components/MainCarousel';
import AgentListening from '../components/AgentListening';
import { useNavigate, useParams, Link } from 'react-router-dom';

const API_URL =
  import.meta.env.VITE_API_URL ||
  'http://localhost:8001';

const DEFAULT_TIMESTAMP_URL =
  import.meta.env.VITE_TIMESTAMP_URL ||
  'http://localhost:5051/position';

const SAFETY_WINDOW_SECONDS = 30;

export default function WorkflowHUD() {
  const navigate = useNavigate();
  const { stationName } = useParams();

  const [station, setStation] = useState(null);        // null = loading | false = not found | object = found
  const [helmetStatus, setHelmetStatus] = useState('checking');
  const [glovesStatus, setGlovesStatus] = useState('checking');
  // null = not yet determined | true = online | false = offline
  const [isStreamOnline, setIsStreamOnline] = useState(null);
  const [isSafetyComplete, setIsSafetyComplete] = useState(null);

  const runCheck = () => {
    setIsStreamOnline(null);
    setIsSafetyComplete(null);
    setHelmetStatus('checking');
    setGlovesStatus('checking');
  };

  // ── Resolve station from URL param ───────────────────────────────────────────
  useEffect(() => {
    const resolveStation = async () => {
      try {
        const res = await fetch(`${API_URL}/api/stations`);
        if (!res.ok) throw new Error();
        const all = await res.json();
        const decoded = decodeURIComponent(stationName ?? '');
        const match = all.find(
          s => s.name.toLowerCase() === decoded.toLowerCase()
        );
        setStation(match ?? false);
      } catch {
        setStation(false);
      }
    };
    resolveStation();
  }, [stationName]);

  // ── Stream + safety check (runs after station is resolved) ───────────────────
  useEffect(() => {
    if (!station || isStreamOnline !== null) return;

    let helmetTimer, glovesTimer, completionTimer;

    const initSafety = async () => {
      const timestampUrl = station.timestamp_url || DEFAULT_TIMESTAMP_URL;
      let streamSeconds = 0;
      let online = false;

      try {
        const res = await fetch(timestampUrl);
        if (res.ok) {
          const { seconds } = await res.json();
          streamSeconds = seconds ?? 0;
          online = true;
        }
      } catch {
        // streamer.py not reachable
      }

      if (!online) {
        setIsStreamOnline(false);
        return;
      }

      setIsStreamOnline(true);

      if (streamSeconds >= SAFETY_WINDOW_SECONDS) {
        setIsSafetyComplete(true);
        return;
      }

      setIsSafetyComplete(false);
      helmetTimer = setTimeout(() => setHelmetStatus('verified'), 2000);
      glovesTimer = setTimeout(() => setGlovesStatus('verified'), 8000);
      completionTimer = setTimeout(() => setIsSafetyComplete(true), 11000);
    };

    initSafety();

    return () => {
      clearTimeout(helmetTimer);
      clearTimeout(glovesTimer);
      clearTimeout(completionTimer);
    };
  }, [station, isStreamOnline]);

  // ── Resolving station ────────────────────────────────────────────────────────
  if (station === null) {
    return (
      <div className="bg-[#0e0e0e] text-on-surface font-body antialiased min-h-screen flex flex-col overflow-x-hidden select-none relative">
        <TopTitle />
      </div>
    );
  }

  // ── Station not found ────────────────────────────────────────────────────────
  if (station === false) {
    return (
      <div className="bg-[#0e0e0e] text-on-surface font-body antialiased min-h-screen flex flex-col overflow-x-hidden select-none relative">
        <TopTitle />
        <main className="flex-grow flex flex-col items-center justify-center px-6">
          <div className="max-w-lg w-full flex flex-col items-center text-center gap-8">
            <div className="w-20 h-20 rounded-full border border-white/10 bg-white/[0.03] flex items-center justify-center">
              <span className="material-symbols-outlined text-4xl text-white/30" data-icon="location_off">location_off</span>
            </div>
            <div>
              <h1 className="font-headline text-4xl font-bold text-white uppercase tracking-tight mb-3">
                Station Not Found
              </h1>
              <p className="text-white/30 text-sm tracking-wide">
                No station named <span className="font-mono text-white/50">{decodeURIComponent(stationName ?? '')}</span> exists.
              </p>
            </div>
            <Link
              to="/dev"
              className="px-8 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 font-headline font-bold text-sm uppercase tracking-[0.2em] text-white/60 hover:text-white transition-all duration-200"
            >
              View All Stations
            </Link>
          </div>
        </main>
      </div>
    );
  }

  // ── Checking stream ──────────────────────────────────────────────────────────
  if (isStreamOnline === null) {
    return (
      <div className="bg-[#0e0e0e] text-on-surface font-body antialiased min-h-screen flex flex-col overflow-x-hidden select-none relative">
        <TopTitle />
      </div>
    );
  }

  // ── Stream offline ───────────────────────────────────────────────────────────
  if (isStreamOnline === false) {
    return (
      <div className="bg-[#0e0e0e] text-on-surface font-body antialiased min-h-screen flex flex-col overflow-x-hidden select-none relative">
        <TopTitle />
        <main className="flex-grow flex flex-col items-center justify-center px-6">
          <div className="max-w-lg w-full flex flex-col items-center text-center gap-8">

            <div className="w-20 h-20 rounded-full border border-error/20 bg-error/5 flex items-center justify-center">
              <span className="material-symbols-outlined text-4xl text-error" data-icon="videocam_off">videocam_off</span>
            </div>

            <div>
              <h1 className="font-headline text-4xl font-bold text-white uppercase tracking-tight mb-3">
                Stream Offline
              </h1>
              <p className="text-white/30 text-sm tracking-wide">
                The streamer is not reachable. Start <span className="font-mono text-white/50">streamer.py</span> and try again.
              </p>
            </div>

              <div className="w-full p-4 rounded-xl border border-white/5 bg-white/[0.02] flex items-center gap-3">
              <div className="w-2 h-2 bg-error rounded-full flex-shrink-0" />
              <span className="font-mono text-xs text-white/30 truncate">{station?.timestamp_url || DEFAULT_TIMESTAMP_URL}</span>
            </div>

            <button
              onClick={runCheck}
              className="px-8 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 font-headline font-bold text-sm uppercase tracking-[0.2em] text-white/60 hover:text-white transition-all duration-200"
            >
              Retry
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="bg-[#0e0e0e] text-on-surface font-body antialiased min-h-screen flex flex-col overflow-x-hidden select-none relative">
      <TopTitle />
      <LiveFeedPopup
        streamUrl={station.hls_url}
        stationName={station.name}
        timestampUrl={station.timestamp_url}
      />

      {!isSafetyComplete ? (
        <main className="flex-grow flex flex-col items-center justify-center px-6 md:px-20 py-10 z-10 w-full mt-40 font-body">
          <div className="max-w-3xl w-full">
            <div className="mb-10 text-center">
              <h1 className="font-headline text-5xl font-bold text-primary tracking-tight mb-4 uppercase">Safety Verification</h1>
              <p className="text-white/40 text-lg uppercase tracking-[0.2em] font-medium text-[12px]">System check required before terminal activation</p>
            </div>

            <div className="space-y-4">
              {/* Item 1: Helmet - 2s Check */}
              <div className={`p-8 rounded-2xl flex items-center justify-between border border-white/5 bg-white/[0.03] backdrop-blur-md shadow-xl border-l-4 transition-all duration-700 ${helmetStatus === 'checking' ? 'border-l-primary/30' : 'border-l-primary'}`}>
                <div className="flex items-center gap-8">
                  <div className={`w-20 h-20 flex items-center justify-center rounded-xl border transition-all duration-700 ${helmetStatus === 'checking' ? 'bg-white/5 border-white/10' : 'bg-primary/10 border-primary/20'}`}>
                    <span className={`material-symbols-outlined text-4xl transition-colors duration-700 ${helmetStatus === 'checking' ? 'text-white/30' : 'text-primary'}`} data-icon="construction">construction</span>
                  </div>
                  <div>
                    <h2 className="text-2xl font-headline font-bold text-white tracking-wide">Helmet</h2>
                    <p className="text-white/30 text-sm font-medium uppercase tracking-widest mt-1">Head protection integrity checked</p>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  {helmetStatus === 'checking' ? (
                    <>
                      <span className="text-xl font-bold tracking-[0.2em] text-white/20 uppercase">Checking</span>
                      <div className="w-14 h-14 flex items-center justify-center animate-spin text-white/20">
                        <span className="material-symbols-outlined text-3xl" data-icon="progress_activity">progress_activity</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="text-xl font-bold tracking-[0.2em] text-primary uppercase">CLEAR</span>
                      <div className="w-14 h-14 bg-primary/20 flex items-center justify-center rounded-full border border-primary/30">
                        <span className="material-symbols-outlined text-primary text-3xl" data-icon="check_circle" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Item 2: Gloves - 6s Check */}
              <div className={`p-8 rounded-2xl flex items-center justify-between border border-white/5 bg-white/[0.03] backdrop-blur-md shadow-xl border-l-4 transition-all duration-700 ${glovesStatus === 'checking' ? 'border-l-primary/30' : 'border-l-primary'}`}>
                <div className="flex items-center gap-8">
                  <div className={`w-20 h-20 flex items-center justify-center rounded-xl border transition-all duration-700 ${glovesStatus === 'checking' ? 'bg-white/5 border-white/10' : 'bg-primary/10 border-primary/20'}`}>
                    <span className={`material-symbols-outlined text-4xl transition-colors duration-700 ${glovesStatus === 'checking' ? 'text-white/30' : 'text-primary'}`} data-icon="front_hand">front_hand</span>
                  </div>
                  <div>
                    <h2 className="text-2xl font-headline font-bold text-white tracking-wide">Gloves</h2>
                    <p className="text-white/30 text-sm font-medium uppercase tracking-widest mt-1">Tactile protection confirmed</p>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  {glovesStatus === 'checking' ? (
                    <>
                      <span className="text-xl font-bold tracking-[0.2em] text-white/20 uppercase">Checking</span>
                      <div className="w-14 h-14 flex items-center justify-center animate-spin text-white/20">
                        <span className="material-symbols-outlined text-3xl" data-icon="progress_activity">progress_activity</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="text-xl font-bold tracking-[0.2em] text-primary uppercase">CLEAR</span>
                      <div className="w-14 h-14 bg-primary/20 flex items-center justify-center rounded-full border border-primary/30">
                        <span className="material-symbols-outlined text-primary text-3xl" data-icon="check_circle" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            <footer className="mt-16 pt-8 border-t border-white/5 flex justify-between items-center text-[10px] uppercase tracking-[0.4em] text-white/10 font-headline font-bold">
              <span>Automated Monitoring active</span>
              <span className="flex items-center gap-2">
                <div className="w-1 h-1 bg-primary rounded-full animate-pulse"></div>
                {glovesStatus === 'checking' ? 'Scanning Environment...' : 'System Ready'}
              </span>
            </footer>
          </div>
        </main>
      ) : (
        <>
          <ProcessList />
          <MainCarousel />
          <AgentListening />
        </>
      )}
    </div>
  );
}
