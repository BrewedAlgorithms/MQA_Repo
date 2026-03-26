import React, { useState } from 'react';

function CameraFeed({ cam }) {
  const [isPlaying, setIsPlaying] = useState(true);

  return (
    <div className="bg-surface-container-low p-[1px]">
      <div className="relative aspect-video overflow-hidden bg-black group flex items-center justify-center">
        {isPlaying ? (
          <>
            <img 
              className="w-full h-full object-cover opacity-60 grayscale hover:grayscale-0 transition-all duration-700" 
              src={cam.image} 
              alt={cam.station} 
            />
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
      image: "https://lh3.googleusercontent.com/aida-public/AB6AXuA6vCaeZkt8egMYuotXeg9qEmQWL1ayYzSSnz13IuNne8OYOVfBESP7x9jKPoT_ChT_fEnhUeEbjOf6YKZdMUy_F6hS_o7UFlkMF_9gFx0yB2UoSI-dSU0onURfp3_vGG4qBn6ZfeQ63BBJ9tETL5fAy1uJizIde5xgCS1LpVs81Mh-AMEHc-D6rDeJvpTxuJZocY7BfukPGX9ng1mhxYgTK5ABT51xWXvnHFromxofiLKFqQ7hUgXiQ4JTEUrVxJoIpUfLHni4ezM"
    },
    {
      id: 'CAM_VX_02', station: 'STATION B', color: 'bg-secondary', camTextColor: 'text-secondary/80',
      step: 'Step 12: Thermal Shielding', tech: 'ID_104', progressText: 'Awaiting QC', progressColor: 'text-secondary-dim italic',
      image: "https://lh3.googleusercontent.com/aida-public/AB6AXuA6YLL6OLwuk9Kj2valiWtB9xqoqNTlxDe3qpHIFnqbZL-_gP0tM1s9hzqGz1elPs8zd5j_BsR_cI2GbDZUwmAkMfQp27LcTJEnTl54P03_1USNCBfx-ALaOLZiW2XFg6mqbzKEs04N1npFofynmxIQG9hvBG1uw9e_b8N_skYUqZVX_7nKMUEI7oVU3oPrhDAiCGKjI8_fWRbxCLy4R7iT06yrpWYKx9ZUei1d0Y0bdEag1RHhoFH4rMi-z-lnfw2NCl2OWZtOtLo"
    },
    {
      id: 'CAM_VX_03', station: 'STATION C', color: 'bg-primary', camTextColor: 'text-primary/80',
      step: 'Step 01: Core Milling', tech: 'AUTO_RM8', progressText: 'Nominal', progressColor: 'text-primary-container',
      image: "https://lh3.googleusercontent.com/aida-public/AB6AXuB43ArpQdomn0_Q5ZgaoTtaah6uPcWgOGzUsAYTkHWhr8JQYCPES_4dEnEOx84LQoRyd7-Dji5C7e06141_luU8kyFRlC9t64VrObPZklE_zMDsixTF_LPNhfmxNrKemQ7n1WiLhBHZc7xnHJbT-jgNR__InJ6HMiXDguGFJkhBFwA5sk_Q_S4pwQbZVPm2saglksu_M7Fh__2Ip6XrZDC6Zv6ZRQkxrQ6TYRAQ2WTJprLjfjzc7LyfpqcBVUDtEgZ8i_vGQrG3RcM"
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
