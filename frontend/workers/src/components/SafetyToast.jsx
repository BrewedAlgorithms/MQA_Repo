import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useWorkflow } from '../context/WorkflowContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001';
const SHOW_MS = 5000;

export default function SafetyToast() {
  const { stationName, localToast } = useWorkflow();
  const [message, setMessage] = useState(null);
  const [progress, setProgress] = useState(100);

  const lastBackendTsRef = useRef(null);
  const hideTimerRef = useRef(null);
  const progressIntervalRef = useRef(null);
  const startTimeRef = useRef(null);

  // Stable show function — used by both backend polling and local (HC) trigger
  const showToast = useCallback((msg) => {
    clearTimeout(hideTimerRef.current);
    clearInterval(progressIntervalRef.current);

    setMessage(msg);
    setProgress(100);
    startTimeRef.current = Date.now();

    progressIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      setProgress(Math.max(0, 100 - (elapsed / SHOW_MS) * 100));
    }, 50);

    hideTimerRef.current = setTimeout(() => {
      setMessage(null);
      clearInterval(progressIntervalRef.current);
    }, SHOW_MS);
  }, []);

  // ── Local trigger (HC schedule via WorkflowHUD) ──────────────────────────────
  useEffect(() => {
    if (!localToast?.ts) return;
    showToast(localToast.message);
  }, [localToast?.ts]);

  // ── Backend polling (/dev/{name}/safetyerr) ───────────────────────────────────
  useEffect(() => {
    if (!stationName) return;

    const seed = async () => {
      try {
        const res = await fetch(`${API_URL}/dev/${encodeURIComponent(stationName)}/safetyerr`);
        if (res.ok) {
          const data = await res.json();
          if (data.ts) lastBackendTsRef.current = data.ts;
        }
      } catch { /* ignore */ }
    };

    const poll = async () => {
      try {
        const res = await fetch(`${API_URL}/dev/${encodeURIComponent(stationName)}/safetyerr`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.ts && data.ts !== lastBackendTsRef.current) {
          lastBackendTsRef.current = data.ts;
          showToast(data.message);
        }
      } catch { /* ignore */ }
    };

    let pollId;
    seed().then(() => { pollId = setInterval(poll, 500); });

    return () => {
      clearInterval(pollId);
      clearTimeout(hideTimerRef.current);
      clearInterval(progressIntervalRef.current);
    };
  }, [stationName, showToast]);

  if (!message) return null;

  return (
    <>
      {/* Full-screen pulsing red border */}
      <div className="fixed inset-0 z-[199] pointer-events-none border-[6px] border-red-500 animate-pulse" />

      <div className="fixed bottom-8 right-8 z-[200] w-80">
        {/* Outer glow ring */}
        <div className="absolute -inset-1 rounded-2xl bg-red-500/20 blur-md animate-pulse" />

        <div className="relative rounded-2xl overflow-hidden border border-red-500/50 bg-[#1a0606] shadow-[0_0_40px_rgba(239,68,68,0.4)]">
          {/* Progress bar */}
          <div className="h-1 w-full bg-red-950">
            <div className="h-full bg-red-500 transition-none" style={{ width: `${progress}%` }} />
          </div>

          <div className="p-5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center flex-shrink-0">
              <span
                className="material-symbols-outlined text-2xl text-red-400"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                warning
              </span>
            </div>
            <div>
              <p className="text-red-400/70 text-[9px] font-bold uppercase tracking-[0.35em]">Safety Alert</p>
              <p className="text-white font-headline font-black text-lg uppercase tracking-tight leading-tight">{message}</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
