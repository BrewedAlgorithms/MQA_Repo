import React, { useState, useRef, useEffect } from 'react';
import { stationsApi } from '../../services/api';

// Derives a stable technician ID from a station's MongoDB ObjectId string.
// Produces format: ID_[3-digit number, 100–999]
function deriveTechId(stationId) {
  let hash = 0;
  for (let i = 0; i < stationId.length; i++) {
    hash = ((hash << 5) - hash) + stationId.charCodeAt(i);
    hash |= 0;
  }
  return `ID_${String(Math.abs(hash) % 900 + 100)}`;
}

// ─── Stream Offline tile ─────────────────────────────────────────────────────
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
          <span className="font-label text-[10px] font-bold tracking-widest text-on-surface-variant">
            OFFLINE: {cam.station}
          </span>
        </div>
        <div className="absolute top-4 right-4 text-[10px] font-mono text-on-surface-variant">{cam.id}</div>
      </div>
      <div className="bg-surface-container-high p-4 flex flex-col space-y-3">
        <div className="flex justify-between items-center">
          <span className="font-label text-[10px] font-bold text-gray-400 uppercase tracking-widest">No Source Configured</span>
        </div>
        <div className="flex items-center justify-between text-[10px] uppercase font-mono border-t border-white/5 pt-3">
          <span className="text-gray-500">Technician: <span className="text-white">{cam.tech}</span></span>
          <span className="text-gray-600">No Stream</span>
        </div>
      </div>
    </div>
  );
}

// ─── RTSP configured tile (browsers cannot play RTSP natively) ───────────────
function RtspFeed({ cam }) {
  return (
    <div className="bg-surface-container-low p-[1px]">
      <div className="relative aspect-video overflow-hidden bg-black flex items-center justify-center">
        <div className="flex flex-col items-center justify-center gap-2 px-6 text-center">
          <span className="material-symbols-outlined text-4xl mb-1 text-tertiary/60">settings_input_antenna</span>
          <span className="text-[11px] text-white/50 font-mono uppercase tracking-widest">RTSP Source Configured</span>
          <span className="text-[10px] text-white/25 font-mono break-all">{cam.rtspUrl}</span>
        </div>
        <div className="absolute top-4 left-4 flex items-center space-x-2 bg-black/60 px-2 py-1">
          <span className="w-2 h-2 bg-tertiary/60 animate-pulse" />
          <span className="font-label text-[10px] font-bold tracking-widest text-tertiary/80">RTSP: {cam.station}</span>
        </div>
        <div className="absolute top-4 right-4 text-[10px] font-mono text-on-surface-variant">{cam.id}</div>
        <div className="absolute bottom-3 right-3 z-20">
          <span className="text-[10px] font-mono text-tertiary/60">RTSP // PROXY REQ</span>
        </div>
      </div>
      <div className="bg-surface-container-high p-4 flex flex-col space-y-3">
        <div className="flex justify-between items-center">
          <span className="font-label text-[10px] font-bold text-gray-400 uppercase tracking-widest">Awaiting Transcoder</span>
        </div>
        <div className="flex items-center justify-between text-[10px] uppercase font-mono border-t border-white/5 pt-3">
          <span className="text-gray-500">Technician: <span className="text-white">{cam.tech}</span></span>
          <span className="text-tertiary/70">RTSP</span>
        </div>
      </div>
    </div>
  );
}

// ─── HLS stream tile ─────────────────────────────────────────────────────────
function HlsStreamFeed({ cam }) {
  const videoRef = useRef(null);
  const [streamError, setStreamError] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !cam.hlsUrl) { setStreamError(true); return; }

    let hls;
    import('hls.js').then(({ default: Hls }) => {
      if (Hls.isSupported()) {
        hls = new Hls({
          lowLatencyMode: true,
          liveSyncDurationCount: 1,
          liveMaxLatencyDurationCount: 2,
          maxBufferLength: 1,
          maxMaxBufferLength: 2,
        });
        hls.loadSource(cam.hlsUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => { video.play().catch(() => {}); setStreamError(false); });
        hls.on(Hls.Events.ERROR, (_e, data) => { if (data.fatal) setStreamError(true); });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = cam.hlsUrl;
        video.addEventListener('loadedmetadata', () => { video.play().catch(() => {}); setStreamError(false); });
        video.addEventListener('error', () => setStreamError(true));
      } else {
        setStreamError(true);
      }
    }).catch(() => setStreamError(true));

    return () => { if (hls) hls.destroy(); };
  }, [cam.hlsUrl]);

  return (
    <div className="bg-surface-container-low p-[1px]">
      <div className="relative aspect-video overflow-hidden bg-black group flex items-center justify-center">
        {streamError ? (
          <div className="flex flex-col items-center justify-center gap-2">
            <div className="w-3 h-3 bg-error rounded-full animate-pulse" />
            <span className="text-[11px] text-white/60 font-mono">Stream Offline</span>
          </div>
        ) : (
          <video ref={videoRef} muted autoPlay playsInline className="w-full h-full object-cover" onError={() => setStreamError(true)} />
        )}
        <div className="absolute inset-0 scanline pointer-events-none opacity-20" />
        <div className="absolute top-4 left-4 flex items-center space-x-2 bg-black/60 px-2 py-1">
          <span className="w-2 h-2 bg-primary animate-pulse" />
          <span className="font-label text-[10px] font-bold tracking-widest text-white">LIVE: {cam.station}</span>
        </div>
        <div className="absolute top-4 right-4 text-[10px] font-mono text-primary/80">{cam.id}</div>
        <div className="absolute bottom-3 right-3 z-20">
          <span className="text-[10px] font-mono text-primary/80">LIVE // HLS</span>
        </div>
      </div>
      <div className="bg-surface-container-high p-4 flex flex-col space-y-3">
        <div className="flex justify-between items-center">
          <span className="font-label text-[10px] font-bold text-gray-400 uppercase tracking-widest">Monitoring</span>
        </div>
        <div className="flex items-center justify-between text-[10px] uppercase font-mono border-t border-white/5 pt-3">
          <span className="text-gray-500">Technician: <span className="text-white">{cam.tech}</span></span>
          <span className="text-primary-container">In Progress</span>
        </div>
      </div>
    </div>
  );
}

// ─── Grid ────────────────────────────────────────────────────────────────────
export default function CameraGrid() {
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    stationsApi.list()
      .then(setStations)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-on-surface-variant py-8">
        <span className="material-symbols-outlined animate-spin">progress_activity</span>
        <span className="font-label text-xs uppercase tracking-widest">Loading stations…</span>
      </div>
    );
  }

  if (stations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-on-surface-variant bg-surface-container-low border border-[#20201f]">
        <span className="material-symbols-outlined text-5xl opacity-20">precision_manufacturing</span>
        <span className="font-label text-xs uppercase tracking-widest opacity-50">No stations configured. Add stations in Station Manager.</span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      {stations.map(station => {
        const camId = `CAM_${station.name.replace(/\s+/g, '_').toUpperCase().slice(0, 12)}`;
        const cam = {
          id: camId,
          station: station.name.toUpperCase(),
          tech: deriveTechId(station.id),
          hlsUrl: station.hls_url,
          rtspUrl: station.rtsp_url,
        };

        if (station.source_type === 'hls') {
          return <HlsStreamFeed key={station.id} cam={cam} />;
        }
        if (station.source_type === 'rtsp') {
          // If an HLS fallback URL is stored, use the HLS player (browsers can't play RTSP natively)
          return station.hls_url
            ? <HlsStreamFeed key={station.id} cam={cam} />
            : <RtspFeed key={station.id} cam={cam} />;
        }
        return <OfflineFeed key={station.id} cam={cam} />;
      })}
    </div>
  );
}
