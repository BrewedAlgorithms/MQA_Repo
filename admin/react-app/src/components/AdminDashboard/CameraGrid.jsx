import React, { useState, useRef, useEffect } from 'react';

function CameraFeed({ cam }) {
  const [isPlaying, setIsPlaying] = useState(true);
  const videoRef = useRef(null);

  useEffect(() => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.play().catch(() => {});
    } else {
      videoRef.current.pause();
    }
  }, [isPlaying]);

  return (
    <div className="bg-surface-container-low p-[1px]">
      <div className="relative aspect-video overflow-hidden bg-black group flex items-center justify-center">
        {isPlaying ? (
          <>
            {cam.video ? (
              <video
                ref={videoRef}
                className="w-full h-full object-cover opacity-70 grayscale hover:grayscale-0 transition-all duration-700"
                src={cam.video}
                autoPlay
                loop
                muted
                playsInline
              />
            ) : (
              <img
                className="w-full h-full object-cover opacity-60 grayscale hover:grayscale-0 transition-all duration-700"
                src={cam.image}
                alt={cam.station}
              />
            )}
            <div className="absolute inset-0 scanline pointer-events-none opacity-20"></div>
            <div className="absolute top-4 left-4 flex items-center space-x-2 bg-black/60 px-2 py-1">
              <span className={`w-2 h-2 ${cam.color} animate-pulse`}></span>
              <span className="font-label text-[10px] font-bold tracking-widest text-white">LIVE: {cam.station}</span>
            </div>
            <div className={`absolute top-4 right-4 text-[10px] font-mono ${cam.camTextColor}`}>
              {cam.id}
            </div>
          </>
        ) : (
          <>
             <div className="text-on-surface-variant flex flex-col items-center justify-center">
                 <span className="material-symbols-outlined text-4xl mb-2 opacity-50">videocam_off</span>
                 <span className="font-label text-[10px] uppercase tracking-widest font-bold">FEED OFFLINE</span>
             </div>
             <div className="absolute top-4 left-4 flex items-center space-x-2 bg-black/60 px-2 py-1">
              <span className={`w-2 h-2 bg-surface-variant`}></span>
              <span className="font-label text-[10px] font-bold tracking-widest text-on-surface-variant">OFFLINE: {cam.station}</span>
            </div>
            <div className={`absolute top-4 right-4 text-[10px] font-mono text-on-surface-variant`}>
              {cam.id}
            </div>
          </>
        )}
        
        {/* Start / Stop Control Overlay */}
        <div className="absolute bottom-4 right-4 pointer-events-auto">
            <button 
              onClick={() => setIsPlaying(!isPlaying)}
              className={`px-3 py-1.5 flex items-center gap-2 font-label text-[10px] font-bold uppercase tracking-widest transition-colors ${
                  isPlaying 
                    ? 'bg-error-container text-tertiary hover:opacity-80 border-b-2 border-tertiary' 
                    : 'bg-primary-container text-on-primary hover:opacity-80 border-b-2 border-primary'
              }`}
            >
              <span className="material-symbols-outlined text-[14px]">
                  {isPlaying ? 'stop_circle' : 'play_circle'}
              </span>
              {isPlaying ? 'STOP FEED' : 'START FEED'}
            </button>
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

export default function CameraGrid() {
  const cameras = [
    {
      id: 'CAM_VX_01', station: 'STATION A', color: 'bg-primary', camTextColor: 'text-primary/80',
      step: 'Step 05: Grommet Installation', tech: 'ID_921', progressText: 'In Progress', progressColor: 'text-primary-container',
      video: '/1.mp4',
    },
    {
      id: 'CAM_VX_02', station: 'STATION B', color: 'bg-secondary', camTextColor: 'text-secondary/80',
      step: 'Step 12: Thermal Shielding', tech: 'ID_104', progressText: 'Awaiting QC', progressColor: 'text-secondary-dim italic',
      video: '/2.mp4',
    },
    {
      id: 'CAM_VX_03', station: 'STATION C', color: 'bg-primary', camTextColor: 'text-primary/80',
      step: 'Step 01: Core Milling', tech: 'AUTO_RM8', progressText: 'Nominal', progressColor: 'text-primary-container',
      video: '/3.mp4',
    },
    {
      id: 'CAM_VX_04', station: 'STATION D', color: 'bg-tertiary', camTextColor: 'text-tertiary/80',
      step: 'Step 08: Micro-Soldering', tech: 'ID_441', progressText: 'Obstruction Alert', progressColor: 'text-tertiary-dim uppercase font-bold',
      image: "https://lh3.googleusercontent.com/aida-public/AB6AXuBdKIgibB-hIIGDrJDsYlDoRbWVTYWhYApOrbGWkdv6H9n7c0aoZmOkhc_YrhZTaU9vZeBWPdOqFKdAKnvRyuXsZplPU5fRcCWK_lD02-bHJ0fUeo-pEd2HL5_bviy7Yx-gdRSJVXtt1_0M7gz3Vk09coGF_bHidS9er7vFy8kxu3d5DyOSCLJPCVtD72-Fp_7Lzu7e2xEyQZIuuvJkY8FmRzuZjdKczfCw49xrz-gkMgIwSOGkP5AwDm3tKq_cIpDJh2AF2V03Dbg"
    }
  ];

  return (
    <div className="grid grid-cols-2 gap-4">
      {cameras.map((cam, index) => (
         <CameraFeed key={index} cam={cam} />
      ))}
    </div>
  );
}
