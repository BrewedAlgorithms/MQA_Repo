import React, { useState, useEffect, useRef } from 'react';
import TopTitle from '../components/TopTitle';
import LiveFeedPopup from '../components/LiveFeedPopup';
import ProcessList from '../components/ProcessList';
import MainCarousel from '../components/MainCarousel';
import AgentListening from '../components/AgentListening';
import SafetyToast from '../components/SafetyToast';
import { useParams, Link } from 'react-router-dom';
import { steps as hcJsonSteps, safetyerrs as hcSafetyErrs } from '../data/hc_vid1.json';
import { useWorkflow } from '../context/WorkflowContext';

// "M:SS" → milliseconds
const timeToMs = (t) => {
  if (!t) return 0;
  const [m, s] = t.split(':').map(Number);
  return (m * 60 + s) * 1000;
};

const API_URL =
  import.meta.env.VITE_API_URL ||
  'http://localhost:8001';

const AI_URL =
  import.meta.env.VITE_AI_URL ||
  'http://localhost:8000';

const AI_STATION = 'FINAL_QC_ASSEMBLY';

// Normalize a backend SOP step to the shape the UI components expect
const normalizeSopStep = (s) => ({
  id: s.order,
  title: s.title,
  instructions: [s.description].filter(Boolean),
  safety: s.safety ?? [],
});

export default function WorkflowHUD() {
  const { stationName } = useParams();
  const { configureWorkflow, triggerSafetyToast, enableAiMode } = useWorkflow();

  const [station, setStation] = useState(null);   // null=resolving | false=not found | object
  const [isStreamOnline, setIsStreamOnline] = useState(null); // null=checking | true | false
  const [sopSteps, setSopSteps] = useState(null);  // null=loading | array=done (non-HC only)

  // 'idle' | 'connecting' | 'ok' | 'error'
  const [aiStatus, setAiStatus] = useState('idle');
  const [aiErrorMsg, setAiErrorMsg] = useState('');
  const aiStepsRef = useRef(null); // retain steps for retry

  const configuredRef = useRef(false);

  const retryStreamCheck = () => {
    configuredRef.current = false;
    setIsStreamOnline(null);
  };

  const postSopToAi = async (steps) => {
    setAiStatus('connecting');
    setAiErrorMsg('');
    try {
      const payload = steps.map((s) => ({
        title: s.title,
        instructions: s.instructions ?? [],
        safety: s.safety ?? [],
      }));
      const res = await fetch(`${AI_URL}/sop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        enableAiMode();
        setAiStatus('ok');
      } else {
        const body = await res.json().catch(() => ({}));
        setAiStatus('error');
        setAiErrorMsg(body.detail || `AI returned ${res.status}`);
      }
    } catch {
      setAiStatus('error');
      setAiErrorMsg(`AI service unreachable at ${AI_URL}`);
    }
  };

  // ── Resolve station from URL param ───────────────────────────────────────────
  useEffect(() => {
    const resolve = async () => {
      try {
        const res = await fetch(`${API_URL}/api/stations`);
        if (!res.ok) throw new Error();
        const all = await res.json();
        const decoded = decodeURIComponent(stationName ?? '');
        const match = all.find(s => s.name.toLowerCase() === decoded.toLowerCase());
        setStation(match ?? false);
      } catch {
        setStation(false);
      }
    };
    resolve();
  }, [stationName]);

  // ── Station resolved: configure workflow ─────────────────────────────────────
  useEffect(() => {
    if (!station || configuredRef.current) return;
    configuredRef.current = true;

    // ── Non-HC (webcam / live feed) ─────────────────────────────────────────
    if (!station.hc) {
      setIsStreamOnline(true); // no stream check needed for non-HC
      const loadSop = async () => {
        try {
          const res = await fetch(`${API_URL}/api/stations/${station.id}/sops`);
          if (!res.ok) throw new Error();
          const sops = await res.json();
          let steps = [];
          if (sops.length > 0) {
            const sop = sops.sort(
              (a, b) => new Date(b.updated_at) - new Date(a.updated_at)
            )[0];
            steps = sop.steps
              .slice()
              .sort((a, b) => a.order - b.order)
              .map(normalizeSopStep);
          }
          setSopSteps(steps);
          configureWorkflow(steps, station.name, false);

          // Send SOP to AI and open SSE when this is the AI-monitored station
          if (station.name === AI_STATION && steps.length > 0) {
            aiStepsRef.current = steps;
            await postSopToAi(steps);
          }
        } catch {
          setSopSteps([]);
          configureWorkflow([], station.name, false);
        }
      };
      loadSop();
      return () => { configuredRef.current = false; };
    }

    // ── HC (video file stream) ────────────────────────────────────────────────
    configureWorkflow(hcJsonSteps, station.name, true);

    // HC stations always show the HUD — no stream dependency
    setIsStreamOnline(true);

    const safetyTimers = [];
    const tsUrl = station.timestamp_url;

    const checkStream = async () => {
      let streamSeconds = 0;
      try {
        const res = await fetch(tsUrl);
        if (!res.ok) return; // stream offline — just skip safety toast scheduling
        const data = await res.json();
        streamSeconds = data.seconds ?? 0;
      } catch {
        return; // stream unreachable — HC HUD still shows, toasts fire from t=0
      }

      // Schedule safetyerr toasts based on stream position
      // Each entry fires at startTime then every 5s until endTime, offset by current position
      const offsetMs = streamSeconds * 1000;
      (hcSafetyErrs ?? []).forEach(err => {
        const startMs = timeToMs(err.startTime);
        const endMs   = timeToMs(err.endTime);
        for (let t = startMs; t < endMs; t += 5000) {
          const delay = t - offsetMs;
          if (delay < 0) continue; // already past this point in the stream
          safetyTimers.push(
            setTimeout(() => triggerSafetyToast(err.message), delay)
          );
        }
      });
    };

    checkStream();

    return () => {
      configuredRef.current = false;
      safetyTimers.forEach(clearTimeout);
    };
  }, [station]);

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
              <span className="material-symbols-outlined text-4xl text-white/30">location_off</span>
            </div>
            <div>
              <h1 className="font-headline text-4xl font-bold text-white uppercase tracking-tight mb-3">Station Not Found</h1>
              <p className="text-white/30 text-sm tracking-wide">
                No station named <span className="font-mono text-white/50">{decodeURIComponent(stationName ?? '')}</span> exists.
              </p>
            </div>
            <Link to="/dev" className="px-8 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 font-headline font-bold text-sm uppercase tracking-[0.2em] text-white/60 hover:text-white transition-all duration-200">
              View All Stations
            </Link>
          </div>
        </main>
      </div>
    );
  }

  // ── Checking stream (HC only, brief) ─────────────────────────────────────────
  if (isStreamOnline === null) {
    return (
      <div className="bg-[#0e0e0e] text-on-surface font-body antialiased min-h-screen flex flex-col overflow-x-hidden select-none relative">
        <TopTitle />
      </div>
    );
  }

  // ── Stream offline (HC only) ─────────────────────────────────────────────────
  if (isStreamOnline === false) {
    return (
      <div className="bg-[#0e0e0e] text-on-surface font-body antialiased min-h-screen flex flex-col overflow-x-hidden select-none relative">
        <TopTitle />
        <main className="flex-grow flex flex-col items-center justify-center px-6">
          <div className="max-w-lg w-full flex flex-col items-center text-center gap-8">
            <div className="w-20 h-20 rounded-full border border-error/20 bg-error/5 flex items-center justify-center">
              <span className="material-symbols-outlined text-4xl text-error">videocam_off</span>
            </div>
            <div>
              <h1 className="font-headline text-4xl font-bold text-white uppercase tracking-tight mb-3">Stream Offline</h1>
              <p className="text-white/30 text-sm tracking-wide">
                The streamer is not reachable. Start <span className="font-mono text-white/50">streamer.py</span> and try again.
              </p>
            </div>
            <div className="w-full p-4 rounded-xl border border-white/5 bg-white/[0.02] flex items-center gap-3">
              <div className="w-2 h-2 bg-error rounded-full flex-shrink-0" />
              <span className="font-mono text-xs text-white/30 truncate">{station.timestamp_url ?? 'timestamp_url not configured'}</span>
            </div>
            <button onClick={retryStreamCheck} className="px-8 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 font-headline font-bold text-sm uppercase tracking-[0.2em] text-white/60 hover:text-white transition-all duration-200">
              Retry
            </button>
          </div>
        </main>
      </div>
    );
  }

  // ── Non-HC: SOP loading ───────────────────────────────────────────────────────
  if (!station.hc && sopSteps === null) {
    return (
      <div className="bg-[#0e0e0e] text-on-surface font-body antialiased min-h-screen flex flex-col overflow-x-hidden select-none relative">
        <TopTitle />
        <LiveFeedPopup streamUrl={station.hls_url} stationName={station.name} timestampUrl={station.timestamp_url} hc={false} />
      </div>
    );
  }

  // ── Non-HC: no SOP configured ────────────────────────────────────────────────
  if (!station.hc && sopSteps !== null && sopSteps.length === 0) {
    return (
      <div className="bg-[#0e0e0e] text-on-surface font-body antialiased min-h-screen flex flex-col overflow-x-hidden select-none relative">
        <TopTitle />
        <LiveFeedPopup streamUrl={station.hls_url} stationName={station.name} timestampUrl={station.timestamp_url} hc={false} />
        <main className="flex-grow flex flex-col items-center justify-center px-6">
          <div className="max-w-lg w-full flex flex-col items-center text-center gap-6">
            <div className="w-20 h-20 rounded-full border border-white/10 bg-white/[0.03] flex items-center justify-center">
              <span className="material-symbols-outlined text-4xl text-white/30">description</span>
            </div>
            <div>
              <h1 className="font-headline text-3xl font-bold text-white uppercase tracking-tight mb-3">No SOP Found</h1>
              <p className="text-white/30 text-sm tracking-wide">
                No SOP has been processed for <span className="font-mono text-white/50">{station.name}</span>.
                <br />Add one via the Admin dashboard.
              </p>
            </div>
            <div className="w-full p-4 rounded-xl border border-white/5 bg-white/[0.02] text-left">
              <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/20 mb-2">Manual Step Control</p>
              <p className="font-mono text-xs text-white/40 break-all">{API_URL}/dev/{encodeURIComponent(station.name)}/step/<span className="text-primary">N</span></p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ── AI station: connecting ───────────────────────────────────────────────────
  if (station.name === AI_STATION && aiStatus === 'connecting') {
    return (
      <div className="bg-[#0e0e0e] text-on-surface font-body antialiased min-h-screen flex flex-col overflow-x-hidden select-none relative">
        <TopTitle />
        <main className="flex-grow flex flex-col items-center justify-center px-6">
          <div className="max-w-lg w-full flex flex-col items-center text-center gap-6">
            <div className="w-20 h-20 rounded-full border border-primary/20 bg-primary/5 flex items-center justify-center">
              <span className="material-symbols-outlined text-4xl text-primary animate-spin" style={{ animationDuration: '1.5s' }}>sync</span>
            </div>
            <div>
              <h1 className="font-headline text-3xl font-bold text-white uppercase tracking-tight mb-3">Connecting to AI</h1>
              <p className="text-white/30 text-sm tracking-wide">Sending SOP to AI pipeline…</p>
            </div>
            <div className="w-full p-4 rounded-xl border border-white/5 bg-white/[0.02] flex items-center gap-3">
              <div className="w-2 h-2 bg-primary rounded-full animate-pulse flex-shrink-0" />
              <span className="font-mono text-xs text-white/30 truncate">{AI_URL}/sop</span>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ── AI station: unreachable ──────────────────────────────────────────────────
  if (station.name === AI_STATION && aiStatus === 'error') {
    return (
      <div className="bg-[#0e0e0e] text-on-surface font-body antialiased min-h-screen flex flex-col overflow-x-hidden select-none relative">
        <TopTitle />
        <main className="flex-grow flex flex-col items-center justify-center px-6">
          <div className="max-w-lg w-full flex flex-col items-center text-center gap-6">
            <div className="w-20 h-20 rounded-full border border-red-500/30 bg-red-500/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-4xl text-red-400" style={{ fontVariationSettings: "'FILL' 1" }}>smart_toy</span>
            </div>
            <div>
              <h1 className="font-headline text-3xl font-bold text-white uppercase tracking-tight mb-3">AI Unavailable</h1>
              <p className="text-white/30 text-sm tracking-wide">
                This station requires the AI pipeline to be running before work can begin.
              </p>
            </div>
            <div className="w-full p-4 rounded-xl border border-red-500/20 bg-red-500/5 flex items-start gap-3 text-left">
              <span className="material-symbols-outlined text-red-400 text-base flex-shrink-0 mt-0.5">error</span>
              <span className="font-mono text-xs text-red-300/80 break-all">{aiErrorMsg}</span>
            </div>
            <button
              onClick={() => postSopToAi(aiStepsRef.current)}
              className="px-8 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 font-headline font-bold text-sm uppercase tracking-[0.2em] text-white/60 hover:text-white transition-all duration-200"
            >
              Retry
            </button>
          </div>
        </main>
      </div>
    );
  }

  // ── Main HUD ─────────────────────────────────────────────────────────────────
  return (
    <div className="bg-[#0e0e0e] text-on-surface font-body antialiased min-h-screen flex flex-col overflow-x-hidden select-none relative">
      <TopTitle />
      <LiveFeedPopup
        streamUrl={station.hls_url}
        stationName={station.name}
        timestampUrl={station.timestamp_url}
        hc={station.hc}
      />

      <ProcessList />
      <MainCarousel />
      <AgentListening />
      <SafetyToast />
    </div>
  );
}
