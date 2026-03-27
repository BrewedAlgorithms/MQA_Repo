import React, { useState, useEffect, useRef } from 'react';
import Hls from 'hls.js';
import { useWorkflow } from '../context/WorkflowContext';

const DEFAULT_STREAM_URL =
  import.meta.env.VITE_STREAM_URL || 'http://localhost:8888/live/index.m3u8';

const DEFAULT_TIMESTAMP_URL =
  import.meta.env.VITE_TIMESTAMP_URL || 'http://localhost:5051/position';

// HLS adds latency between what the streamer writes and what the viewer sees.
// This offset delays step transitions to match the viewer's actual playback.
const HLS_LAG_SECONDS = 3;

export default function LiveFeedPopup({ streamUrl, stationName, timestampUrl }) {
  const STREAM_URL = streamUrl || DEFAULT_STREAM_URL;
  const TIMESTAMP_URL = timestampUrl || DEFAULT_TIMESTAMP_URL;
  const { currentStepId, setCurrentStepId, workflowSteps, setIsWorkflowCompleted } = useWorkflow();
  const [liveTime, setLiveTime] = useState('0:00');
  const [streamError, setStreamError] = useState(false);
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  // Track latest elapsed seconds from the video (not wall-clock)
  const elapsedRef = useRef(0);

  // ── HLS player setup ────────────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let hls;

    if (Hls.isSupported()) {
      hls = new Hls({
        lowLatencyMode: true,
        liveSyncDurationCount: 1,
        liveMaxLatencyDurationCount: 2,
        // Cap how much video the browser buffers ahead (keeps playback at the live edge)
        maxBufferLength: 1,
        maxMaxBufferLength: 2,
      });
      hlsRef.current = hls;
      hls.loadSource(STREAM_URL);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
        setStreamError(false);
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) setStreamError(true);
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari native HLS
      video.src = STREAM_URL;
      video.addEventListener('loadedmetadata', () => {
        video.play().catch(() => {});
        setStreamError(false);
      });
      video.addEventListener('error', () => setStreamError(true));
    } else {
      setStreamError(true);
    }

    return () => {
      if (hls) {
        hls.destroy();
        hlsRef.current = null;
      }
    };
  }, [STREAM_URL]);

  // ── Poll /position + drive step progression in one loop (no drift) ──────────
  useEffect(() => {
    const timeToSeconds = (t) => {
      if (!t) return 0;
      const [m, s] = t.split(':').map(Number);
      return m * 60 + s;
    };

    const tick = async () => {
      // 1. Fetch streamer position
      try {
        const res = await fetch(TIMESTAMP_URL);
        if (res.ok) {
          const { seconds, time } = await res.json();
          elapsedRef.current = seconds;
          setLiveTime(time);
        }
      } catch {
        // streamer not running yet — keep last known value
      }

      // 2. Compare lag-adjusted position against step endTimes
      const elapsed = elapsedRef.current - HLS_LAG_SECONDS;
      const targetStep = workflowSteps.find(s => elapsed < timeToSeconds(s.endTime));
      if (targetStep) {
        setIsWorkflowCompleted(false);
        if (targetStep.id !== currentStepId) setCurrentStepId(targetStep.id);
      } else if (workflowSteps.length > 0) {
        setIsWorkflowCompleted(true);
        if (currentStepId !== workflowSteps.length) setCurrentStepId(workflowSteps.length);
      }
    };

    tick(); // immediate first run
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [TIMESTAMP_URL, workflowSteps, currentStepId, setCurrentStepId, setIsWorkflowCompleted]);

  return (
    <div className="fixed top-8 left-8 z-50 w-72 h-48 bg-surface-container-high rounded-xl border border-white/10 overflow-hidden shadow-2xl group">

      {/* HLS stream via hls.js */}
      {streamError ? (
        <div className="w-full h-full flex flex-col items-center justify-center bg-black/80 gap-2">
          <div className="w-3 h-3 bg-error rounded-full animate-pulse" />
          <span className="text-[11px] text-white/60 font-mono">Stream offline</span>
          <span className="text-[9px] text-white/30 font-mono">{STREAM_URL}</span>
        </div>
      ) : (
        <video
          ref={videoRef}
          muted
          autoPlay
          playsInline
          className="w-full h-full object-cover transition-all duration-700"
          onError={() => setStreamError(true)}
        />
      )}

      {/* Badge */}
      <div className="absolute top-3 left-3 z-20 flex items-center gap-2">
        <div className="w-2 h-2 bg-error rounded-full animate-pulse" />
        <span className="text-[10px] font-bold tracking-widest text-white uppercase drop-shadow-md">{stationName ?? 'Cam A'}</span>
      </div>

      {/* Video timestamp from streamer */}
      <div className="absolute top-3 right-3 z-20 bg-black/40 backdrop-blur-md px-2 py-0.5 rounded border border-white/10">
        <span className="text-[10px] font-mono font-bold text-white tracking-widest">{liveTime}</span>
      </div>

      <div className="absolute bottom-3 right-3 z-20">
        <span className="text-[10px] font-mono text-primary/80">LIVE // HLS</span>
      </div>
    </div>
  );
}
