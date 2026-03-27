import React, { useState, useEffect } from 'react';
import TopTitle from '../components/TopTitle';
import LiveFeedPopup from '../components/LiveFeedPopup';
import ProcessList from '../components/ProcessList';
import MainCarousel from '../components/MainCarousel';
import AgentListening from '../components/AgentListening';
import { useNavigate } from 'react-router-dom';

const TIMESTAMP_URL =
  import.meta.env.VITE_TIMESTAMP_URL ||
  'http://localhost:5051/position';

const SAFETY_WINDOW_SECONDS = 60;

export default function WorkflowHUD() {
  const navigate = useNavigate();
  const [helmetStatus, setHelmetStatus] = useState('checking');
  const [glovesStatus, setGlovesStatus] = useState('checking');
  // null = not yet determined (waiting for stream position check)
  const [isSafetyComplete, setIsSafetyComplete] = useState(null);

  useEffect(() => {
    let helmetTimer, glovesTimer, completionTimer;

    const initSafety = async () => {
      let streamSeconds = 0;
      try {
        const res = await fetch(TIMESTAMP_URL);
        if (res.ok) {
          const { seconds } = await res.json();
          streamSeconds = seconds ?? 0;
        }
      } catch {
        // streamer not running — default to 0, show safety screen
      }

      // Skip safety screen if stream is already past the first minute
      if (streamSeconds >= SAFETY_WINDOW_SECONDS) {
        setIsSafetyComplete(true);
        return;
      }

      // Stream is within the first minute — run the safety check sequence
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
  }, []);

  // Waiting for stream position check — render shell without main content
  if (isSafetyComplete === null) {
    return (
      <div className="bg-[#0e0e0e] text-on-surface font-body antialiased min-h-screen flex flex-col overflow-x-hidden select-none relative">
        <TopTitle />
        <LiveFeedPopup />
      </div>
    );
  }

  return (
    <div className="bg-[#0e0e0e] text-on-surface font-body antialiased min-h-screen flex flex-col overflow-x-hidden select-none relative">
      <TopTitle />
      <LiveFeedPopup />

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
