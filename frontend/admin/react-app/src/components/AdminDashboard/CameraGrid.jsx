import React, { useState, useRef, useEffect } from 'react';

const STREAM_URL =
  import.meta.env.VITE_STREAM_URL ||
  'http://localhost:8888/live/index.m3u8';

// ─── Offline tile (Stations A, B, C) ────────────────────────────────────────
function OfflineFeed({ cam }) {
  return (
    <div className="bg-surface-container-low p-[1px]">
      <div className="relative aspect-video overflow-hidden bg-black flex items-center justify-center">
        <div className="flex flex-col items-center justify-center gap-2">
          <span className="material-symbols-outlined text-4xl mb-1 opacity-30 text-white">videocam_off</span>
          <span className="text-[11px] text-white/40 font-mono uppercase tracking-widest">Stream Offline</span>
        </div>
        <div className="absolute top-4 left-4 flex items-center space-x-2 bg-black/60 px-2 py-1">
          <span className="w-2 h-2 bg-surface-variant" />
          <span className="font-label text-[10px] font-bold tracking-widest text-on-surface-variant">OFFLINE: {cam.station}</span>
        </div>
        <div className={`absolute top-4 right-4 text-[10px] font-mono text-on-surface-variant`}>{cam.id}</div>
      </div>
      <div className="bg-surface-container-high p-4 flex flex-col space-y-3">
        <div className="flex justify-between items-center">
          <span className="font-label text-[10px] font-bold text-gray-400 uppercase tracking-widest">{cam.step}</span>
        </div>
        <div className="flex items-center justify-between text-[10px] uppercase font-mono border-t border-white/5 pt-3">
          <span className="text-gray-500">Technician: <span className="text-white">{cam.tech}</span></span>
          <span className={cam.progressColor}>{cam.progressText}</span>
        </div>
      </div>
    </div>
  );
}

// ─── HLS stream tile (Station D) ────────────────────────────────────────────
function HlsStreamFeed({ cam }) {
  const videoRef = useRef(null);
  const [streamError, setStreamError] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let hls;
    import('hls.js').then(({ default: Hls }) => {
      if (Hls.isSupported()) {
        hls = new Hls({ liveSyncDurationCount: 1, liveMaxLatencyDurationCount: 3, lowLatencyMode: true });
        hls.loadSource(STREAM_URL);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => { video.play().catch(() => {}); setStreamError(false); });
        hls.on(Hls.Events.ERROR, (_e, data) => { if (data.fatal) setStreamError(true); });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = STREAM_URL;
        video.addEventListener('loadedmetadata', () => { video.play().catch(() => {}); setStreamError(false); });
        video.addEventListener('error', () => setStreamError(true));
      } else {
        setStreamError(true);
      }
    }).catch(() => setStreamError(true));

    return () => { if (hls) hls.destroy(); };
  }, []);

  return (
    <div className="bg-surface-container-low p-[1px]">
      <div className="relative aspect-video overflow-hidden bg-black group flex items-center justify-center">
        {streamError ? (
          <div className="flex flex-col items-center justify-center gap-2">
            <div className="w-3 h-3 bg-error rounded-full animate-pulse" />
            <span className="text-[11px] text-white/60 font-mono">Stream offline</span>
          </div>
        ) : (
          <video ref={videoRef} muted autoPlay playsInline className="w-full h-full object-cover" onError={() => setStreamError(true)} />
        )}
        <div className="absolute inset-0 scanline pointer-events-none opacity-20" />
        <div className="absolute top-4 left-4 flex items-center space-x-2 bg-black/60 px-2 py-1">
          <span className={`w-2 h-2 ${cam.color} animate-pulse`} />
          <span className="font-label text-[10px] font-bold tracking-widest text-white">LIVE: {cam.station}</span>
        </div>
        <div className={`absolute top-4 right-4 text-[10px] font-mono ${cam.camTextColor}`}>{cam.id}</div>
        <div className="absolute bottom-3 right-3 z-20">
          <span className="text-[10px] font-mono text-primary/80">LIVE // HLS</span>
        </div>
      </div>
      <div className="bg-surface-container-high p-4 flex flex-col space-y-3">
        <div className="flex justify-between items-center">
          <span className="font-label text-[10px] font-bold text-gray-400 uppercase tracking-widest">{cam.step}</span>
        </div>
        <div className="flex items-center justify-between text-[10px] uppercase font-mono border-t border-white/5 pt-3">
          <span className="text-gray-500">Technician: <span className="text-white">{cam.tech}</span></span>
          <span className={cam.progressColor}>{cam.progressText}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Grid ────────────────────────────────────────────────────────────────────
export default function CameraGrid() {
  const cameras = [
    {
      id: 'CAM_VX_01', station: 'STATION A', color: 'bg-primary', camTextColor: 'text-primary/80',
      step: 'Step 08: Micro-Soldering', tech: 'ID_441', progressText: 'Obstruction Alert', progressColor: 'text-tertiary-dim uppercase font-bold',
    },
    {
      id: 'CAM_VX_02', station: 'STATION B', color: 'bg-secondary', camTextColor: 'text-secondary/80',
      step: 'Step 12: Thermal Shielding', tech: 'ID_104', progressText: 'Awaiting QC', progressColor: 'text-secondary-dim italic',
    },
    {
      id: 'CAM_VX_03', station: 'STATION C', color: 'bg-primary', camTextColor: 'text-primary/80',
      step: 'Step 01: Core Milling', tech: 'AUTO_RM8', progressText: 'Nominal', progressColor: 'text-primary-container',
    },
    {
      id: 'CAM_VX_04', station: 'STATION D', color: 'bg-tertiary', camTextColor: 'text-tertiary/80',
      step: 'Step 05: Grommet Installation', tech: 'ID_921', progressText: 'In Progress', progressColor: 'text-primary-container',
      isStream: true,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4">
      {cameras.map((cam, index) =>
        cam.isStream
          ? <HlsStreamFeed key={index} cam={cam} />
          : <OfflineFeed key={index} cam={cam} />
      )}
    </div>
  );
}
