import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useWorkflow } from '../context/WorkflowContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001';

export default function PipelineToggle({ stationId }) {
  const { resetWorkflow } = useWorkflow();
  const [running, setRunning] = useState(null);
  const [busy, setBusy] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!stationId) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch(
          `${API_URL}/api/stations/${stationId}/pipeline/status`
        );
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          setRunning(!!data.running);
        } else {
          setRunning(false);
        }
      } catch {
        if (!cancelled) setRunning(false);
      }
    };

    poll();
    const id = setInterval(poll, 2000);
    return () => { cancelled = true; clearInterval(id); };
  }, [stationId]);

  const toggle = useCallback(async () => {
    if (busy || running === null) return;
    setBusy(true);

    try {
      if (running) {
        await fetch(
          `${API_URL}/api/stations/${stationId}/pipeline/stop`,
          { method: 'POST' }
        );
      } else {
        await fetch(
          `${API_URL}/api/stations/${stationId}/pipeline/restart`,
          { method: 'POST' }
        );
      }
      if (mountedRef.current) {
        resetWorkflow();
        setRunning(!running);
      }
    } catch { /* poll will sync state */ }

    if (mountedRef.current) setBusy(false);
  }, [running, busy, stationId, resetWorkflow]);

  if (running === null) return null;

  const isOn = running;

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={`
        fixed bottom-6 right-6 z-50
        w-14 h-14 rounded-full
        flex items-center justify-center
        shadow-lg shadow-black/40
        border-2 transition-all duration-300
        ${busy ? 'opacity-50 cursor-wait' : 'cursor-pointer active:scale-90'}
        ${isOn
          ? 'bg-emerald-500/20 border-emerald-400/60 hover:bg-emerald-500/30'
          : 'bg-red-500/20 border-red-400/60 hover:bg-red-500/30'
        }
      `}
      title={isOn ? 'Stop AI pipeline' : 'Start AI pipeline'}
    >
      <span
        className={`material-symbols-outlined text-2xl ${
          isOn ? 'text-emerald-400' : 'text-red-400'
        }`}
        style={{ fontVariationSettings: "'FILL' 1" }}
      >
        {isOn ? 'stop_circle' : 'play_circle'}
      </span>
    </button>
  );
}
